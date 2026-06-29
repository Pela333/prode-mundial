'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { GROUPS, MATCHES } from '@/lib/fixture'
import { computeGroupStandings, type StandingRow, type GroupMatch } from '@/lib/standings'
import { recalcPointsForUser, computeUserBracketsBatch } from '@/lib/api/recalc'

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
  // Para partidos eliminatorios: los equipos que ESTE usuario pronosticó para este slot
  predHomeTeam: string | null
  predAwayTeam: string | null
}

export interface MatchPredictionsResult {
  locked: boolean
  revealDate: string | null
  predictions?: MatchPrediction[]
  error?: string
}

export async function getMatchPredictionsAction(matchId: string): Promise<MatchPredictionsResult> {
  const isElim = !/^[A-L]\d+$/.test(matchId)
  const isR32First = matchId === 'R32_1'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { locked: true, revealDate: null, error: 'No autenticado' }

  // 1. Obtener app config con todas las fechas de revelación
  const { data: config, error: configErr } = await supabase
    .from('app_config_public')
    .select('reveal_predictions_at, reveal_r32_first_at, reveal_r32_rest_at')
    .single()

  if (configErr) {
    return { locked: true, revealDate: null, error: 'Error al consultar la configuración' }
  }

  // 2. Determinar la fecha de revelación según el tipo de partido:
  //    - Fase de grupos          → reveal_predictions_at
  //    - 1er partido elim (R32_1)→ reveal_r32_first_at  (fallback: reveal_predictions_at)
  //    - Resto de la elim        → reveal_r32_rest_at   (fallback: reveal_predictions_at)
  let revealDateIso: string | null
  if (!isElim) {
    revealDateIso = config?.reveal_predictions_at ?? null
  } else if (isR32First) {
    revealDateIso = config?.reveal_r32_first_at ?? config?.reveal_predictions_at ?? null
  } else {
    revealDateIso = config?.reveal_r32_rest_at ?? config?.reveal_predictions_at ?? null
  }

  // 3. Verificar rol del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'
  const revealDate = revealDateIso ? new Date(revealDateIso) : null
  const isRevealed = revealDate && revealDate.getTime() <= Date.now()

  // 4. Si no está revelado y no es admin, solo devolvemos su propia predicción
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

      // Para partidos eliminatorios, obtener los equipos que el propio usuario pronosticó
      let ownPredHomeTeam: string | null = null
      let ownPredAwayTeam: string | null = null
      if (isElim) {
        try {
          const userBracketsMap = await computeUserBracketsBatch(supabase, [user.id])
          const slotTeams = userBracketsMap.get(user.id)?.get(matchId)
          ownPredHomeTeam = slotTeams?.home ?? null
          ownPredAwayTeam = slotTeams?.away ?? null
        } catch (err) {
          console.error('getMatchPredictionsAction (own): error computing user bracket:', err)
        }
      }

      ownList.push({
        name: ownProfile ? `${ownProfile.first_name} ${ownProfile.last_name}` : 'Vos',
        username: ownProfile?.username ?? '',
        homeScore: ownPred.home_score,
        awayScore: ownPred.away_score,
        homeScore120: ownPred.home_score_120,
        awayScore120: ownPred.away_score_120,
        penWinner: ownPred.pen_winner,
        points: (ownPred.result_points ?? 0) + (ownPred.bonus_points ?? 0),
        predHomeTeam: ownPredHomeTeam,
        predAwayTeam: ownPredAwayTeam,
      })
    }

    return {
      locked: true,
      revealDate: revealDateIso,
      predictions: ownList,
    }
  }

  // 5. Si está revelado o es admin, traemos todas
  const { data: allPreds, error: predsErr } = await supabase
    .from('predictions')
    .select('user_id, home_score, away_score, home_score_120, away_score_120, pen_winner, result_points, bonus_points')
    .eq('match_id', matchId)

  if (predsErr) {
    return { locked: false, revealDate: revealDateIso, error: 'Error al consultar predicciones' }
  }

  const userIds = (allPreds ?? []).map(p => p.user_id)
  let profilesMap = new Map<string, any>()

  if (userIds.length > 0) {
    const { data: allProfs, error: profsErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, username')
      .in('id', userIds)

    if (profsErr) {
      return { locked: false, revealDate: revealDateIso, error: 'Error al consultar perfiles' }
    }

    profilesMap = new Map(allProfs?.map(p => [p.id, p]) ?? [])
  }

  // Para partidos eliminatorios, calcular los equipos que cada usuario pronosticó para este slot
  let userBracketsMap: Map<string, Map<string, { home: string | null; away: string | null }>> | null = null
  if (isElim && userIds.length > 0) {
    try {
      userBracketsMap = await computeUserBracketsBatch(supabase, userIds)
    } catch (err) {
      console.error('getMatchPredictionsAction: error computing user brackets:', err)
    }
  }

  const list: MatchPrediction[] = (allPreds ?? []).map((p: any) => {
    const profile = profilesMap.get(p.user_id)
    const userBracket = userBracketsMap?.get(p.user_id)
    const slotTeams = userBracket?.get(matchId)
    return {
      name: profile ? `${profile.first_name} ${profile.last_name}` : 'Participante',
      username: profile?.username ?? '',
      homeScore: p.home_score,
      awayScore: p.away_score,
      homeScore120: p.home_score_120,
      awayScore120: p.away_score_120,
      penWinner: p.pen_winner,
      points: (p.result_points ?? 0) + (p.bonus_points ?? 0),
      predHomeTeam: slotTeams?.home ?? null,
      predAwayTeam: slotTeams?.away ?? null,
    }
  })

  list.sort((a, b) => {
    const hA = isElim ? a.homeScore120 : a.homeScore
    const aA = isElim ? a.awayScore120 : a.awayScore
    const hB = isElim ? b.homeScore120 : b.homeScore
    const aB = isElim ? b.awayScore120 : b.awayScore

    // 1. Clasificar en categoría: 1 = Gana Local, 2 = Empate, 3 = Gana Visitante, 4 = Vacío
    const getCat = (h: number | null, av: number | null) => {
      if (h === null || av === null) return 4
      if (h > av) return 1
      if (h === av) return 2
      return 3
    }

    const catA = getCat(hA, aA)
    const catB = getCat(hB, aB)

    if (catA !== catB) {
      return catA - catB
    }

    // 2. Si son de la misma categoría, ordenar por marcador exacto
    if (catA === 1) {
      // Local gana: ordenar por local desc, visitante asc
      if (hA !== hB) return hB! - hA!
      if (aA !== aB) return aA! - aB!
    } else if (catA === 2) {
      // Empate: ordenar por goles desc (ej: 2-2 antes de 1-1)
      if (hA !== hB) return hB! - hA!
    } else if (catA === 3) {
      // Visitante gana: ordenar por visitante desc, local asc
      if (aA !== aB) return aB! - aA!
      if (hA !== hB) return hA! - hB!
    }

    // 3. Si tienen el mismo marcador, ordenar por penWinner en eliminatorias
    if (isElim && a.penWinner !== b.penWinner) {
      const penA = a.penWinner ?? ''
      const penB = b.penWinner ?? ''
      return penA.localeCompare(penB, 'es')
    }

    // 4. Si siguen empatados, ordenar por nombre alfabéticamente
    return a.name.localeCompare(b.name, 'es')
  })

  return {
    locked: false,
    revealDate: revealDateIso,
    predictions: list,
  }
}
