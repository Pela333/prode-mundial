'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalcPointsForMatch, recalcGroupPositionBonus, recalcAllPoints } from '@/lib/api/recalc'
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

  // Recalcular puntos del match + bonus de posición de grupo (por si la corrección
  // afecta algún partido de grupos y eso cambia las standings finales)
  const recalculated = await recalcPointsForMatch(admin, input.matchId)
  await recalcGroupPositionBonus(admin)

  revalidatePath('/admin/resultados')
  revalidatePath('/ranking')
  return { ok: true, recalculated }
}

export async function generateRandomResultsAction(): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // 1. Obtener todos los partidos en results
  const { data: results, error: resultsError } = await admin
    .from('results')
    .select('*')

  if (resultsError) return { error: 'Error al obtener partidos: ' + resultsError.message }
  if (!results || results.length === 0) {
    return { error: 'No hay partidos en la tabla results. Hacé un sync primero.' }
  }

  // 2. Obtener datos de bracket para saber los nombres de equipos de eliminatorias
  const { data: bracketRows, error: bracketError } = await admin
    .from('bracket')
    .select('match_id, home_team, away_team')

  if (bracketError) return { error: 'Error al obtener bracket: ' + bracketError.message }

  const bracketMap = new Map(
    (bracketRows ?? []).map(b => [b.match_id, { home: b.home_team, away: b.away_team }])
  )

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

  const updatedResults = []

  for (const r of results) {
    const isGroup = r.phase === 'group'
    let home_score: number | null = null
    let away_score: number | null = null
    let home_score_120: number | null = null
    let away_score_120: number | null = null
    let went_to_pens = false
    let pen_winner: string | null = null

    if (isGroup) {
      home_score = getRandomScore()
      away_score = getRandomScore()
    } else {
      home_score_120 = getRandomScore()
      away_score_120 = getRandomScore()

      if (home_score_120 === away_score_120) {
        went_to_pens = true
        const b = bracketMap.get(r.match_id)
        if (b && b.home && b.away) {
          pen_winner = Math.random() < 0.5 ? b.home : b.away
        }
      }
    }

    updatedResults.push({
      match_id: r.match_id,
      phase: r.phase,
      home_score,
      away_score,
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

  // Guardar resultados
  const { error: upsertError } = await admin
    .from('results')
    .upsert(updatedResults, { onConflict: 'match_id' })

  if (upsertError) return { error: 'Error al guardar resultados: ' + upsertError.message }

  // 3. Calcular standings reales para cada grupo
  const standingsUpserts = []
  const groupMatches = MATCHES.filter(m => m.phase === 'group')
  const resultsMap = new Map(updatedResults.map(r => [r.match_id, r]))

  for (const g of GROUPS) {
    const gMatchesResults: GroupMatch[] = []
    let complete = true

    for (const m of groupMatches.filter(x => x.group === g.id)) {
      const res = resultsMap.get(m.id)
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

    if (standingsError) return { error: 'Error al actualizar posiciones de grupo: ' + standingsError.message }
  }

  // Audit log
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'random_results_generated',
    target_type: 'result',
    meta: {
      count: updatedResults.length,
    },
  })

  // 4. Recalcular todos los puntos de las predicciones
  const recalculated = await recalcAllPoints(admin)

  revalidatePath('/admin/resultados')
  revalidatePath('/ranking')

  return { ok: true, recalculated }
}
