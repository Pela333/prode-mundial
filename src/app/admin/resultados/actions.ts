'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalcPointsForMatch, recalcGroupPositionBonus, recalcAllPoints } from '@/lib/api/recalc'
import { deriveBracketFromResults } from '@/lib/api/bracket'
import { revalidatePath } from 'next/cache'
import { GROUPS, MATCHES } from '@/lib/fixture'
import { computeGroupStandings, type GroupMatch } from '@/lib/standings'

export interface CorrectResultInput {
  matchId: string
  homeScore: number | null         // a 90' (sólo grupos)
  awayScore: number | null
  homeScore120: number | null      // a 120' (sólo elim)
  awayScore120: number | null
  wentToPens: boolean
  penWinner: string | null
  status: 'scheduled' | 'in_progress' | 'finished'
  reason?: string
}

export interface ActionResult {
  ok?: boolean
  error?: string
  recalculated?: number
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null as null, isAdmin: false, supabase }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, isAdmin: profile?.role === 'admin', supabase }
}

export async function correctResultAction(input: CorrectResultInput): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  // Validaciones básicas
  if (input.homeScore != null && (!Number.isInteger(input.homeScore) || input.homeScore < 0)) return { error: 'Goles a 90 inválidos' }
  if (input.awayScore != null && (!Number.isInteger(input.awayScore) || input.awayScore < 0)) return { error: 'Goles a 90 inválidos' }
  if (input.homeScore120 != null && (!Number.isInteger(input.homeScore120) || input.homeScore120 < 0)) return { error: 'Goles a 120 inválidos' }
  if (input.awayScore120 != null && (!Number.isInteger(input.awayScore120) || input.awayScore120 < 0)) return { error: 'Goles a 120 inválidos' }

  const admin = createAdminClient()

  // Snapshot del estado anterior para audit_log
  const { data: previous } = await admin
    .from('results')
    .select('*')
    .eq('match_id', input.matchId)
    .maybeSingle()

  if (!previous) return { error: 'Ese partido no tiene un resultado registrado todavía' }

  // Aplicar override
  const { error } = await admin
    .from('results')
    .update({
      home_score: input.homeScore,
      away_score: input.awayScore,
      home_score_120: input.homeScore120,
      away_score_120: input.awayScore120,
      went_to_pens: input.wentToPens,
      pen_winner: input.penWinner,
      status: input.status,
      manual_override: true,
      corrected_by: user.id,
      corrected_at: new Date().toISOString(),
    })
    .eq('match_id', input.matchId)

  if (error) return { error: 'No pudimos actualizar el resultado' }

  // Audit log
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'result_corrected',
    target_type: 'result',
    target_id: input.matchId,
    meta: {
      reason: input.reason ?? null,
      previous: {
        home_score: previous.home_score,
        away_score: previous.away_score,
        home_score_120: previous.home_score_120,
        away_score_120: previous.away_score_120,
        went_to_pens: previous.went_to_pens,
        pen_winner: previous.pen_winner,
        status: previous.status,
      },
      new: {
        home_score: input.homeScore,
        away_score: input.awayScore,
        home_score_120: input.homeScore120,
        away_score_120: input.awayScore120,
        went_to_pens: input.wentToPens,
        pen_winner: input.penWinner,
        status: input.status,
      },
    },
  })

  // Recalcular puntos del match + bonus de posición de grupo
  const recalculated = await recalcPointsForMatch(admin, input.matchId)
  await recalcGroupPositionBonus(admin)

  // Derivar cruces eliminatorios a partir de los resultados actualizados
  await deriveBracketFromResults(admin)

  revalidatePath('/prode')
  revalidatePath('/prode/eliminatoria')
  revalidatePath('/ranking')
  revalidatePath('/ranking/usuarios/[id]', 'page')
  revalidatePath('/admin/resultados')
  revalidatePath('/admin/bracket')
  revalidatePath('/admin/usuarios/[id]', 'page')

  return { ok: true, recalculated }
}

export async function revertToApiAction(matchId: string): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // 1. Obtener estado previo para audit_log
  const { data: previous } = await admin
    .from('results')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()

  if (!previous) return { error: 'Ese partido no existe en la base de datos' }

  // 2. Quitar manual_override y dejar que la API lo maneje
  const { error } = await admin
    .from('results')
    .update({
      manual_override: false,
      corrected_by: null,
      corrected_at: null,
    })
    .eq('match_id', matchId)

  if (error) return { error: 'No se pudo restablecer el partido: ' + error.message }

  // 3. Registrar en audit_log
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'result_corrected',
    target_type: 'result',
    target_id: matchId,
    meta: {
      reason: 'Restablecido para sincronizar desde la API de Football-Data.org',
      previous: {
        home_score: previous.home_score,
        away_score: previous.away_score,
        home_score_120: previous.home_score_120,
        away_score_120: previous.away_score_120,
        went_to_pens: previous.went_to_pens,
        pen_winner: previous.pen_winner,
        status: previous.status,
        manual_override: previous.manual_override,
      },
      new: {
        manual_override: false,
      },
    },
  })

  // 4. Disparar sync con la API para que actualice este partido de inmediato si tiene datos
  try {
    const { syncFromApi } = await import('@/lib/api/sync')
    await syncFromApi(admin)
  } catch (err) {
    console.error('Error al sincronizar después de revertir a la API:', err)
  }

  // 5. Revalidar todas las páginas afectadas
  revalidatePath('/prode')
  revalidatePath('/prode/eliminatoria')
  revalidatePath('/ranking')
  revalidatePath('/ranking/usuarios/[id]', 'page')
  revalidatePath('/admin/resultados')
  revalidatePath('/admin/bracket')
  revalidatePath('/admin/usuarios/[id]', 'page')

  return { ok: true }
}


export async function generateRandomResultsAction(): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // 1. Obtener todos los partidos en results para saber cuáles existen
  const { data: results, error: resultsError } = await admin
    .from('results')
    .select('match_id, phase')

  if (resultsError) return { error: 'Error al obtener partidos: ' + resultsError.message }
  if (!results || results.length === 0) {
    return { error: 'No hay partidos en la tabla results. Hacé un sync primero.' }
  }

  // Función para marcadores de fútbol realistas
  function getRandomScore(): number {
    const r = Math.random()
    if (r < 0.20) return 0
    if (r < 0.55) return 1
    if (r < 0.80) return 2
    if (r < 0.92) return 3
    if (r < 0.98) return 4
    return 5
  }

  // ── 1. Simular Fase de Grupos ─────────────────────────────────────────────
  const groupResultsUpserts = []
  for (const r of results.filter(x => x.phase === 'group')) {
    groupResultsUpserts.push({
      match_id: r.match_id,
      phase: r.phase,
      home_score: getRandomScore(),
      away_score: getRandomScore(),
      home_score_120: null,
      away_score_120: null,
      went_to_pens: false,
      pen_winner: null,
      status: 'finished',
      manual_override: true,
      corrected_by: user.id,
      corrected_at: new Date().toISOString(),
    })
  }

  const { error: groupUpsertError } = await admin
    .from('results')
    .upsert(groupResultsUpserts, { onConflict: 'match_id' })

  if (groupUpsertError) {
    return { error: 'Error al guardar resultados de grupos: ' + groupUpsertError.message }
  }

  // ── 2. Calcular Standings y Posiciones Reales ────────────────────────────
  const standingsUpserts = []
  const groupMatches = MATCHES.filter(m => m.phase === 'group')
  const groupResultsMap = new Map(groupResultsUpserts.map(r => [r.match_id, r]))

  for (const g of GROUPS) {
    const gMatchesResults: GroupMatch[] = []
    let complete = true

    for (const m of groupMatches.filter(x => x.group === g.id)) {
      const res = groupResultsMap.get(m.id)
      if (!res || res.home_score == null || res.away_score == null) {
        complete = false
        break
      }
      gMatchesResults.push({ match: m, home: res.home_score, away: res.away_score })
    }

    if (complete) {
      const standing = computeGroupStandings(g.teams, gMatchesResults)
      if (standing) {
        for (const row of standing) {
          standingsUpserts.push({
            group_id: g.id,
            position: row.position,
            team: row.team,
            finalized: true,
          })
        }
      }
    }
  }

  if (standingsUpserts.length > 0) {
    const { error: standingsError } = await admin
      .from('group_standings')
      .upsert(standingsUpserts, { onConflict: 'group_id,position' })

    if (standingsError) {
      return { error: 'Error al actualizar posiciones de grupo: ' + standingsError.message }
    }
  }

  // Derivar el bracket inicial (R32) basado en las posiciones de grupo terminadas
  await deriveBracketFromResults(admin)

  // ── 3. Simular Eliminatorias Secuencialmente ──────────────────────────────
  const knockoutRounds = [
    { phase: 'r32' },
    { phase: 'r16' },
    { phase: 'qf' },
    { phase: 'sf' },
    { phase: 'final_third' }, // FINAL y THIRD
  ]

  for (const round of knockoutRounds) {
    // 3a. Leer bracket actual para saber los equipos definidos en esta ronda
    const { data: bracketRows, error: bracketError } = await admin
      .from('bracket')
      .select('match_id, phase, home_team, away_team, defined')

    if (bracketError) {
      return { error: `Error al leer bracket para ronda: ${bracketError.message}` }
    }

    const roundMatches = (bracketRows ?? []).filter(b => {
      if (round.phase === 'final_third') {
        return b.phase === 'final' || b.phase === 'third'
      }
      return b.phase === round.phase
    })

    const roundResultsUpserts = []
    for (const b of roundMatches) {
      if (b.defined && b.home_team && b.away_team) {
        const home_score_120 = getRandomScore()
        const away_score_120 = getRandomScore()
        let went_to_pens = false
        let pen_winner: string | null = null

        if (home_score_120 === away_score_120) {
          went_to_pens = true
          pen_winner = Math.random() < 0.5 ? b.home_team : b.away_team
        }

        roundResultsUpserts.push({
          match_id: b.match_id,
          phase: b.phase,
          home_score: null,
          away_score: null,
          home_score_120,
          away_score_120,
          went_to_pens,
          pen_winner,
          status: 'finished',
          manual_override: true,
          corrected_by: user.id,
          corrected_at: new Date().toISOString(),
        })
      }
    }

    if (roundResultsUpserts.length > 0) {
      const { error: upsertError } = await admin
        .from('results')
        .upsert(roundResultsUpserts, { onConflict: 'match_id' })

      if (upsertError) {
        return { error: `Error al guardar resultados para ronda ${round.phase}: ${upsertError.message}` }
      }

      // Derivar/propagar ganadores al siguiente nivel del bracket
      await deriveBracketFromResults(admin)
    }
  }

  // Audit log
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'random_results_generated',
    target_type: 'result',
    meta: {
      count: results.length,
    },
  })

  // ── 4. Recalcular Todos los Puntos de las Predicciones ────────────────────
  const recalculated = await recalcAllPoints(admin)

  revalidatePath('/admin/resultados')
  revalidatePath('/admin/bracket')
  revalidatePath('/prode/eliminatoria')
  revalidatePath('/ranking')

  return { ok: true, recalculated }
}
