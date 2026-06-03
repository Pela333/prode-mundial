'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BRACKET_SLOTS } from '@/lib/fixture'
import { recalcPointsForUser } from '@/lib/api/recalc'

const R32_FIRST_SLOT = 'R32_1'
const R32_REST_SLOTS = BRACKET_SLOTS.filter(s => s.id !== R32_FIRST_SLOT).map(s => s.id)
const ALL_ELIM_SLOT_IDS = new Set(BRACKET_SLOTS.map(s => s.id))

export interface SaveElimDraftInput {
  matchId: string
  homeScore120: number | null
  awayScore120: number | null
  penWinner: string | null   // nombre del equipo o null si no se eligió
}

export interface ActionResult {
  ok?: boolean
  error?: string
}

interface ConfirmResult extends ActionResult {
  missing?: string[]
  submittedAt?: string
}

async function getDeadlines(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('app_config_public')
    .select('r32_first_deadline, r32_rest_deadline')
    .single()
  return {
    r32First: data?.r32_first_deadline ? new Date(data.r32_first_deadline) : null,
    r32Rest: data?.r32_rest_deadline ? new Date(data.r32_rest_deadline) : null,
  }
}

async function isSubmitted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  phase: 'r32_first' | 'r32_rest',
): Promise<boolean> {
  const { data } = await supabase
    .from('submissions').select('phase').eq('user_id', userId).eq('phase', phase).maybeSingle()
  return !!data
}

async function isBracketDefined(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('bracket').select('defined').eq('match_id', matchId).maybeSingle()
  return data?.defined === true
}

async function areAllR32Defined(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { data } = await supabase
    .from('bracket').select('match_id, defined').eq('phase', 'r32')
  if (!data || data.length < 16) return false
  return data.every(b => b.defined)
}

/**
 * Guardar borrador de un partido eliminatorio.
 * Acepta scores parciales y/o pen_winner. La validación completa se hace en el confirm.
 */
export async function saveElimDraft({ matchId, homeScore120, awayScore120, penWinner }: SaveElimDraftInput): Promise<ActionResult> {
  if (!ALL_ELIM_SLOT_IDS.has(matchId)) return { error: 'Partido inválido' }

  const slot = BRACKET_SLOTS.find(s => s.id === matchId)!
  const phase = slot.phase

  if (homeScore120 !== null && (!Number.isInteger(homeScore120) || homeScore120 < 0)) return { error: 'Resultado inválido' }
  if (awayScore120 !== null && (!Number.isInteger(awayScore120) || awayScore120 < 0)) return { error: 'Resultado inválido' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Validar bracket definido
  if (!await isBracketDefined(supabase, matchId)) {
    return { error: 'Este partido todavía no tiene equipos confirmados' }
  }

  // Validar pen_winner es uno de los dos equipos del bracket (si vino)
  if (penWinner !== null) {
    const { data: bracket } = await supabase
      .from('bracket').select('home_team, away_team').eq('match_id', matchId).maybeSingle()
    if (!bracket || (penWinner !== bracket.home_team && penWinner !== bracket.away_team)) {
      return { error: 'El ganador por penales debe ser uno de los dos equipos del partido' }
    }
  }

  // Validar deadline + no submitted según parte
  const deadlines = await getDeadlines(supabase)
  if (matchId === R32_FIRST_SLOT) {
    if (await isSubmitted(supabase, user.id, 'r32_first')) {
      return { error: 'Ya enviaste el 1er partido de 16avos' }
    }
    if (deadlines.r32First && deadlines.r32First.getTime() < Date.now()) {
      return { error: 'La fecha límite para enviar el 1er partido de 16avos ya pasó' }
    }
  } else {
    if (await isSubmitted(supabase, user.id, 'r32_rest')) {
      return { error: 'Ya enviaste tus pronósticos de la fase eliminatoria' }
    }
    if (deadlines.r32Rest && deadlines.r32Rest.getTime() < Date.now()) {
      return { error: 'La fecha límite para enviar la fase eliminatoria ya pasó' }
    }
  }

  // Si todo es null, borrar
  if (homeScore120 === null && awayScore120 === null && penWinner === null) {
    const { error } = await supabase
      .from('predictions').delete().eq('user_id', user.id).eq('match_id', matchId)
    if (error) return { error: 'No pudimos borrar el pronóstico' }
    return { ok: true }
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        phase,
        home_score_120: homeScore120,
        away_score_120: awayScore120,
        pen_winner: penWinner,
      },
      { onConflict: 'user_id,match_id' }
    )

  if (error) return { error: 'No pudimos guardar el pronóstico' }
  return { ok: true }
}

/**
 * Confirmar Parte 1: el 1er partido de 16avos.
 * Requiere: bracket de R32_1 definido, scores completos, pen_winner elegido,
 * deadline no pasada, no enviado antes.
 */
export async function confirmR32FirstSubmission(): Promise<ConfirmResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (await isSubmitted(supabase, user.id, 'r32_first')) {
    return { error: 'Ya enviaste el 1er partido de 16avos' }
  }

  if (!await isBracketDefined(supabase, R32_FIRST_SLOT)) {
    return { error: 'El 1er partido de 16avos todavía no está definido' }
  }

  const deadlines = await getDeadlines(supabase)
  if (deadlines.r32First && deadlines.r32First.getTime() < Date.now()) {
    return { error: 'La fecha límite ya pasó' }
  }

  // Validar predicción completa
  const { data: pred } = await supabase
    .from('predictions')
    .select('home_score_120, away_score_120, pen_winner')
    .eq('user_id', user.id).eq('match_id', R32_FIRST_SLOT)
    .maybeSingle()

  if (!pred || pred.home_score_120 == null || pred.away_score_120 == null || !pred.pen_winner) {
    return { error: 'Tenés que cargar el resultado y elegir ganador por penales antes de confirmar' }
  }

  const { error } = await supabase
    .from('submissions').insert({ user_id: user.id, phase: 'r32_first' })
  if (error) {
    if (error.code === '23505') return { error: 'Ya enviaste el 1er partido de 16avos' }
    return { error: 'No pudimos registrar el envío' }
  }

  // Recalcular puntos del usuario
  try {
    await recalcPointsForUser(supabase, user.id)
  } catch (err) {
    console.error('Error recalculating points on r32_first submission:', err)
  }

  revalidatePath('/prode/eliminatoria')
  return { ok: true, submittedAt: new Date().toISOString() }
}

/**
 * Confirmar Parte 2: el resto de la eliminatoria (R32_2..FINAL).
 * Requiere todos los cruces de R32 definidos + scores y pen_winner completos
 * para los 30 partidos restantes (15 de R32 + 8 R16 + 4 QF + 2 SF + THIRD + FINAL = 30).
 */
export async function confirmR32RestSubmission(): Promise<ConfirmResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (await isSubmitted(supabase, user.id, 'r32_rest')) {
    return { error: 'Ya enviaste tus pronósticos de la eliminatoria' }
  }

  if (!await areAllR32Defined(supabase)) {
    return { error: 'Todavía no están definidos todos los cruces de 16avos' }
  }

  const deadlines = await getDeadlines(supabase)
  if (deadlines.r32Rest && deadlines.r32Rest.getTime() < Date.now()) {
    return { error: 'La fecha límite ya pasó' }
  }

  // Validar todos los partidos no-R32_1 completos
  const { data: preds } = await supabase
    .from('predictions')
    .select('match_id, home_score_120, away_score_120, pen_winner')
    .eq('user_id', user.id)
    .in('match_id', R32_REST_SLOTS)

  const predMap = new Map(preds?.map(p => [p.match_id, p]) ?? [])
  const missing: string[] = []
  for (const slotId of R32_REST_SLOTS) {
    const p = predMap.get(slotId)
    if (!p || p.home_score_120 == null || p.away_score_120 == null || !p.pen_winner) {
      missing.push(slotId)
    }
  }
  if (missing.length > 0) {
    return { error: `Faltan ${missing.length} partidos`, missing }
  }

  const { error } = await supabase
    .from('submissions').insert({ user_id: user.id, phase: 'r32_rest' })
  if (error) {
    if (error.code === '23505') return { error: 'Ya enviaste tus pronósticos de la eliminatoria' }
    return { error: 'No pudimos registrar el envío' }
  }

  // Recalcular puntos del usuario
  try {
    await recalcPointsForUser(supabase, user.id)
  } catch (err) {
    console.error('Error recalculating points on r32_rest submission:', err)
  }

  revalidatePath('/prode/eliminatoria')
  return { ok: true, submittedAt: new Date().toISOString() }
}
