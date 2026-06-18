'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { GROUPS, MATCHES } from '@/lib/fixture'
import { computeGroupStandings, type StandingRow, type GroupMatch } from '@/lib/standings'
import { recalcPointsForUser } from '@/lib/api/recalc'

export interface SaveDraftInput {
  matchId: string
  homeScore: number | null
  awayScore: number | null
}

export interface ActionResult {
  ok?: boolean
  error?: string
}

export interface ConfirmGroupResult extends ActionResult {
  missing?: string[]
  standings?: Record<string, StandingRow[]>
  submittedAt?: string
}

const GROUP_MATCH_IDS = new Set(MATCHES.filter(m => m.phase === 'group').map(m => m.id))

async function getGroupDeadline(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Date | null> {
  const { data } = await supabase.from('app_config_public').select('group_deadline').single()
  return data?.group_deadline ? new Date(data.group_deadline) : null
}

async function isSubmittedAlready(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('submissions')
    .select('phase')
    .eq('user_id', userId)
    .eq('phase', 'group')
    .maybeSingle()
  return !!data
}

/**
 * Guardar/actualizar el borrador de UN partido de grupos.
 * Llamado en autosave on-blur por cada MatchCard.
 */
export async function saveGroupDraft({ matchId, homeScore, awayScore }: SaveDraftInput): Promise<ActionResult> {
  if (!GROUP_MATCH_IDS.has(matchId)) return { error: 'Partido inválido' }
  if (homeScore !== null && (!Number.isInteger(homeScore) || homeScore < 0)) return { error: 'Resultado inválido' }
  if (awayScore !== null && (!Number.isInteger(awayScore) || awayScore < 0)) return { error: 'Resultado inválido' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // No permitir editar si ya envió
  if (await isSubmittedAlready(supabase, user.id)) {
    return { error: 'Tus pronósticos de grupos ya fueron enviados y no se pueden modificar' }
  }

  // No permitir editar si la deadline pasó
  const deadline = await getGroupDeadline(supabase)
  if (deadline && deadline.getTime() < Date.now()) {
    return { error: 'La fecha límite para enviar pronósticos de grupos ya pasó' }
  }

  // Si ambos valores son null, borrar la fila
  if (homeScore === null && awayScore === null) {
    const { error } = await supabase
      .from('predictions')
      .delete()
      .eq('user_id', user.id)
      .eq('match_id', matchId)
    if (error) return { error: 'No pudimos borrar el pronóstico' }

    // Recalcular y revalidar
    try {
      await recalcPointsForUser(supabase, user.id)
    } catch (err) {
      console.error('Error recalculating points after group draft delete:', err)
    }
    revalidatePath('/prode')
    revalidatePath('/ranking')
    revalidatePath('/ranking/usuarios/[id]', 'page')

    return { ok: true }
  }

  // Upsert
  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        phase: 'group',
        home_score: homeScore,
        away_score: awayScore,
      },
      { onConflict: 'user_id,match_id' }
    )

  if (error) return { error: 'No pudimos guardar el pronóstico' }

  // Recalcular y revalidar
  try {
    await recalcPointsForUser(supabase, user.id)
  } catch (err) {
    console.error('Error recalculating points after group draft save:', err)
  }
  revalidatePath('/prode')
  revalidatePath('/ranking')
  revalidatePath('/ranking/usuarios/[id]', 'page')

  return { ok: true }
}

/**
 * Confirma el envío de la Fase de Grupos:
 *   - Valida que estén los 72 partidos completos
 *   - Valida que la deadline no haya pasado
 *   - Valida que no haya submission previa
 *   - Calcula las posiciones de los 12 grupos
 *   - Crea la fila en submissions
 *
 * Devuelve las posiciones calculadas para el modal de confirmación.
 */
export async function confirmGroupSubmission(): Promise<ConfirmGroupResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Ya envió
  if (await isSubmittedAlready(supabase, user.id)) {
    return { error: 'Ya enviaste tus pronósticos de grupos' }
  }

  // Deadline
  const deadline = await getGroupDeadline(supabase)
  if (deadline && deadline.getTime() < Date.now()) {
    return { error: 'La fecha límite para enviar pronósticos de grupos ya pasó' }
  }

  // Cargar las 72 predictions
  const { data: preds, error: predErr } = await supabase
    .from('predictions')
    .select('match_id, home_score, away_score')
    .eq('user_id', user.id)
    .eq('phase', 'group')
  if (predErr) return { error: 'No pudimos leer tus pronósticos' }

  const predMap = new Map(preds?.map(p => [p.match_id, p]) ?? [])
  const groupMatches = MATCHES.filter(m => m.phase === 'group')

  // Validar completitud
  const missing: string[] = []
  for (const m of groupMatches) {
    const p = predMap.get(m.id)
    if (!p || p.home_score === null || p.away_score === null) {
      missing.push(m.id)
    }
  }
  if (missing.length > 0) {
    return { error: `Faltan ${missing.length} partidos`, missing }
  }

  // Calcular posiciones por grupo
  const standings: Record<string, StandingRow[]> = {}
  for (const group of GROUPS) {
    const gMatches: GroupMatch[] = groupMatches
      .filter(m => m.group === group.id)
      .map(m => {
        const p = predMap.get(m.id)!
        return { match: m, home: p.home_score!, away: p.away_score! }
      })
    const result = computeGroupStandings(group.teams, gMatches)
    if (!result) return { error: `No pudimos calcular las posiciones del grupo ${group.id}` }
    standings[group.id] = result
  }

  // Insertar submission
  const { error: subErr } = await supabase
    .from('submissions')
    .insert({ user_id: user.id, phase: 'group' })
  if (subErr) {
    if (subErr.code === '23505') return { error: 'Ya enviaste tus pronósticos de grupos' }
    return { error: 'No pudimos registrar el envío. Intentá de nuevo.' }
  }

  // Recalcular puntos del usuario (por si ingresó tarde/en testing con partidos ya jugados)
  try {
    await recalcPointsForUser(supabase, user.id)
  } catch (err) {
    console.error('Error recalculating points on group submission:', err)
  }

  revalidatePath('/prode')
  return { ok: true, standings, submittedAt: new Date().toISOString() }
}

export interface MatchPrediction {
  name: string
  username: string
  homeScore: number | null
  awayScore: number | null
  homeScore120: number | null
  awayScore120: number | null
  penWinner: string | null
  points: number
}

export interface MatchPredictionsResult {
  locked: boolean
  revealDate: string | null
  predictions?: MatchPrediction[]
  error?: string
}

export async function getMatchPredictionsAction(matchId: string): Promise<MatchPredictionsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { locked: true, revealDate: null, error: 'No autenticado' }

  // 1. Obtener app config para reveal_predictions_at
  const { data: config, error: configErr } = await supabase
    .from('app_config_public')
    .select('reveal_predictions_at')
    .single()

  if (configErr) {
    return { locked: true, revealDate: null, error: 'Error al consultar la configuración' }
  }

  // 2. Verificar rol del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'
  const revealDate = config?.reveal_predictions_at ? new Date(config.reveal_predictions_at) : null
  const isRevealed = revealDate && revealDate.getTime() <= Date.now()

  // 3. Si no está revelado y no es admin, solo devolvemos su propia predicción
  if (!isAdmin && !isRevealed) {
    const { data: ownPred } = await supabase
      .from('predictions')
      .select('home_score, away_score, home_score_120, away_score_120, pen_winner, result_points, bonus_points')
      .eq('user_id', user.id)
      .eq('match_id', matchId)
      .maybeSingle()

    const ownList: MatchPrediction[] = []
    if (ownPred) {
      const { data: ownProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, username')
        .eq('id', user.id)
        .maybeSingle()

      ownList.push({
        name: ownProfile ? `${ownProfile.first_name} ${ownProfile.last_name}` : 'Vos',
        username: ownProfile?.username ?? '',
        homeScore: ownPred.home_score,
        awayScore: ownPred.away_score,
        homeScore120: ownPred.home_score_120,
        awayScore120: ownPred.away_score_120,
        penWinner: ownPred.pen_winner,
        points: (ownPred.result_points ?? 0) + (ownPred.bonus_points ?? 0),
      })
    }

    return {
      locked: true,
      revealDate: config?.reveal_predictions_at ?? null,
      predictions: ownList,
    }
  }

  // 4. Si está revelado o es admin, traemos todas
  const { data: allPreds, error: predsErr } = await supabase
    .from('predictions')
    .select(`
      home_score,
      away_score,
      home_score_120,
      away_score_120,
      pen_winner,
      result_points,
      bonus_points,
      profiles (
        first_name,
        last_name,
        username
      )
    `)
    .eq('match_id', matchId)

  if (predsErr) {
    return { locked: false, revealDate: config?.reveal_predictions_at ?? null, error: 'Error al consultar predicciones' }
  }

  const list: MatchPrediction[] = (allPreds ?? []).map((p: any) => ({
    name: p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}` : 'Participante',
    username: p.profiles?.username ?? '',
    homeScore: p.home_score,
    awayScore: p.away_score,
    homeScore120: p.home_score_120,
    awayScore120: p.away_score_120,
    penWinner: p.pen_winner,
    points: (p.result_points ?? 0) + (p.bonus_points ?? 0),
  }))

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return a.name.localeCompare(b.name, 'es')
  })

  return {
    locked: false,
    revealDate: config?.reveal_predictions_at ?? null,
    predictions: list,
  }
}
