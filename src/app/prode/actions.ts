'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { GROUPS, MATCHES } from '@/lib/fixture'
import { computeGroupStandings, type StandingRow, type GroupMatch } from '@/lib/standings'

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

  revalidatePath('/prode')
  return { ok: true, standings, submittedAt: new Date().toISOString() }
}
