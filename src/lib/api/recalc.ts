/**
 * Recálculo de puntos.
 *
 * - `recalcPointsForMatch(matchId)`: recalcula puntos de todas las predictions
 *   del partido dado contra el resultado actual en `results`.
 * - `recalcAllPoints()`: recalcula todo. Usar tras una corrección manual
 *   que pueda haber cambiado el resultado real.
 *
 * Las reglas implementadas acá:
 *   - Resultado exacto (90' grupos / 120' elim): +3
 *   - Ganador/empate correcto (no exacto): +1
 *   - Bonus penales (sólo elim, sólo si fue a penales): +1
 *   - Bonus posicionamiento elim: +1 si el ganador real coincide con la posición
 *     de grupo pronosticada por el usuario para ese equipo (Fase 1)
 *   - Bonus posición exacta de grupo: +2 por equipo (al cerrar fase de grupos)
 *
 * Pendientes para Fase 6: bonus podio al cerrar el torneo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { GROUPS, MATCHES, type Phase } from '@/lib/fixture'
import { computeGroupStandings, type GroupMatch } from '@/lib/standings'

interface ResultRow {
  match_id: string
  phase: Phase
  home_score: number | null
  away_score: number | null
  home_score_120: number | null
  away_score_120: number | null
  went_to_pens: boolean
  pen_winner: string | null
  status: string
}

interface PredictionRow {
  id: string
  user_id: string
  match_id: string
  phase: Phase
  home_score: number | null
  away_score: number | null
  home_score_120: number | null
  away_score_120: number | null
  pen_winner: string | null
}

interface GroupStandingRow {
  group_id: string
  position: number
  team: string
  finalized: boolean
}

function pointsForResult(
  phase: Phase,
  predHome: number | null,
  predAway: number | null,
  predHome120: number | null,
  predAway120: number | null,
  realHome: number | null,
  realAway: number | null,
  realHome120: number | null,
  realAway120: number | null,
): number {
  let ph: number | null, pa: number | null, h: number | null, a: number | null
  if (phase === 'group') {
    ph = predHome; pa = predAway; h = realHome; a = realAway
  } else {
    ph = predHome120; pa = predAway120; h = realHome120; a = realAway120
  }
  if (ph == null || pa == null || h == null || a == null) return 0
  if (ph === h && pa === a) return 3
  if ((ph > pa && h > a) || (ph < pa && h < a) || (ph === pa && h === a)) return 1
  return 0
}

/**
 * Recalcula puntos de TODAS las predictions del partido dado.
 * Retorna el número de filas actualizadas.
 */
export async function recalcPointsForMatch(supabase: SupabaseClient, matchId: string): Promise<number> {
  const { data: result } = await supabase
    .from('results')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()

  if (!result || result.status !== 'finished') {
    // Sin resultado finalizado: dejamos los puntos a 0 (ya están)
    return 0
  }

  const r = result as ResultRow

  const { data: predictions } = await supabase
    .from('predictions')
    .select('id, user_id, match_id, phase, home_score, away_score, home_score_120, away_score_120, pen_winner')
    .eq('match_id', matchId)

  if (!predictions || predictions.length === 0) return 0

  // Para bonus posicionamiento elim: necesitamos saber qué posición de grupo
  // pronosticó cada usuario para el equipo ganador real (Fase 1).
  // Sólo aplica si phase !== 'group'.
  let winnerTeam: string | null = null
  let userGroupStandings: Map<string, Map<string, number>> | null = null
  let realPos: number | null = null

  if (r.phase !== 'group') {
    // Quién ganó realmente? Si fue a penales, pen_winner; si no, comparar 120'
    if (r.went_to_pens && r.pen_winner) {
      winnerTeam = r.pen_winner
    } else if (r.home_score_120 != null && r.away_score_120 != null) {
      // Necesitamos saber qué equipo fue local y cuál visitante para este partido elim
      const { data: bracketRow } = await supabase
        .from('bracket').select('home_team, away_team').eq('match_id', matchId).maybeSingle()
      if (bracketRow) {
        if (r.home_score_120 > r.away_score_120) winnerTeam = bracketRow.home_team
        else if (r.home_score_120 < r.away_score_120) winnerTeam = bracketRow.away_team
      }
    }

    if (winnerTeam) {
      // Cargamos las predicciones de fase de grupos de TODOS los usuarios afectados
      const userIds = [...new Set((predictions as PredictionRow[]).map(p => p.user_id))]
      userGroupStandings = await computeUserStandingsBatch(supabase, userIds)

      // Cargar la posición real del ganador en group_standings
      const { data: realStanding } = await supabase
        .from('group_standings')
        .select('position')
        .eq('team', winnerTeam)
        .maybeSingle()
      if (realStanding) {
        realPos = realStanding.position
      }
    }
  }

  const updates: { id: string; result_points: number; bonus_points: number }[] = []

  for (const p of predictions as PredictionRow[]) {
    const result_points = pointsForResult(
      p.phase,
      p.home_score, p.away_score, p.home_score_120, p.away_score_120,
      r.home_score, r.away_score, r.home_score_120, r.away_score_120,
    )

    let bonus_points = 0

    // Bonus penales
    if (p.phase !== 'group' && r.went_to_pens && r.pen_winner && p.pen_winner === r.pen_winner) {
      bonus_points += 1
    }

    // Bonus posicionamiento elim: ganador real estuvo en esa misma posición de grupo en el pronóstico del usuario
    if (p.phase !== 'group' && winnerTeam && realPos != null && userGroupStandings) {
      const userPositions = userGroupStandings.get(p.user_id)
      if (userPositions) {
        const userPos = userPositions.get(winnerTeam)
        if (userPos != null && userPos === realPos) {
          bonus_points += 1
        }
      }
    }

    updates.push({ id: p.id, result_points, bonus_points })
  }

  // Update en batch — Supabase no permite múltiples updates por ID en una sola query;
  // hacemos N updates en paralelo.
  await Promise.all(
    updates.map(u =>
      supabase.from('predictions')
        .update({ result_points: u.result_points, bonus_points: u.bonus_points })
        .eq('id', u.id)
    )
  )

  return updates.length
}

/**
 * Recalcula puntos para TODOS los matches con resultado finalizado, y los bonuses
 * de posiciones de grupo (si la fase está cerrada). Usar tras una corrección manual
 * o un cambio de reglas.
 */
export async function recalcAllPoints(supabase: SupabaseClient): Promise<number> {
  const { data: results } = await supabase
    .from('results')
    .select('match_id')
    .eq('status', 'finished')

  let total = 0
  for (const r of results ?? []) {
    total += await recalcPointsForMatch(supabase, r.match_id)
  }
  await recalcGroupPositionBonus(supabase)
  return total
}

/**
 * Recalcula el bonus de posiciones de grupo (+2 por equipo en posición exacta).
 * Sólo aplica una vez que `group_standings` tiene `finalized=true` para todos los grupos
 * (es decir, terminó la fase de grupos).
 *
 * Para cada usuario con submission de phase='group', compara las posiciones que su
 * pronóstico arroja vs las reales en `group_standings`, suma +2 por cada coincidencia
 * y persiste en `user_bonus`.
 */
export async function recalcGroupPositionBonus(supabase: SupabaseClient): Promise<number> {
  const { data: realStandings } = await supabase
    .from('group_standings')
    .select('group_id, position, team, finalized')

  if (!realStandings || realStandings.length === 0) return 0
  const allFinalized = realStandings.length === 48 && realStandings.every((r: GroupStandingRow) => r.finalized)
  if (!allFinalized) return 0

  // Mapeo grupo → (team → position real)
  const realByGroup = new Map<string, Map<string, number>>()
  for (const r of realStandings as GroupStandingRow[]) {
    if (!realByGroup.has(r.group_id)) realByGroup.set(r.group_id, new Map())
    realByGroup.get(r.group_id)!.set(r.team, r.position)
  }

  // Traer todos los usuarios con submission de grupos
  const { data: subs } = await supabase
    .from('submissions').select('user_id').eq('phase', 'group')
  const userIds = (subs ?? []).map(s => s.user_id)
  if (userIds.length === 0) return 0

  const userPredStandings = await computeUserStandingsBatch(supabase, userIds)

  const upserts: { user_id: string; type: 'group_position'; points: number }[] = []
  for (const userId of userIds) {
    const userPositions = userPredStandings.get(userId)
    if (!userPositions) {
      upserts.push({ user_id: userId, type: 'group_position', points: 0 })
      continue
    }
    // Para cada grupo y cada equipo, comparamos la posición pronosticada con la real
    let pts = 0
    for (const [groupId, realPositions] of realByGroup) {
      for (const [team, realPos] of realPositions) {
        const predPos = userPositions.get(team)
        if (predPos != null && predPos === realPos) pts += 2
      }
      void groupId
    }
    upserts.push({ user_id: userId, type: 'group_position', points: pts })
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from('user_bonus').upsert(upserts, { onConflict: 'user_id,type' })
    if (error) throw new Error(`recalcGroupPositionBonus: ${error.message}`)
  }
  return upserts.length
}

/**
 * Para cada usuario, computa las posiciones de grupo según SUS pronósticos (Fase 1),
 * y devuelve un mapa userId → (team → position).
 *
 * Si el usuario no envió Fase 1 (no hay submission de phase='group'), retorna mapa vacío.
 */
async function computeUserStandingsBatch(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (userIds.length === 0) return result

  // Carga submissions confirmadas
  const { data: subs } = await supabase
    .from('submissions')
    .select('user_id')
    .eq('phase', 'group')
    .in('user_id', userIds)
  const submittedUsers = new Set((subs ?? []).map(s => s.user_id))

  if (submittedUsers.size === 0) return result

  // Carga predictions de fase grupos
  const { data: preds } = await supabase
    .from('predictions')
    .select('user_id, match_id, home_score, away_score')
    .eq('phase', 'group')
    .in('user_id', [...submittedUsers])

  if (!preds) return result

  // Indexa predicciones por (user, matchId)
  const userMatchPred = new Map<string, Map<string, { home: number; away: number }>>()
  for (const p of preds) {
    if (p.home_score == null || p.away_score == null) continue
    if (!userMatchPred.has(p.user_id)) userMatchPred.set(p.user_id, new Map())
    userMatchPred.get(p.user_id)!.set(p.match_id, { home: p.home_score, away: p.away_score })
  }

  const groupMatches = MATCHES.filter(m => m.phase === 'group')

  for (const userId of submittedUsers) {
    const predMap = userMatchPred.get(userId)
    if (!predMap) continue
    const teamToPosition = new Map<string, number>()
    for (const g of GROUPS) {
      const gMatchesPred: GroupMatch[] = []
      let complete = true
      for (const m of groupMatches.filter(x => x.group === g.id)) {
        const p = predMap.get(m.id)
        if (!p) { complete = false; break }
        gMatchesPred.push({ match: m, home: p.home, away: p.away })
      }
      if (!complete) continue
      const standing = computeGroupStandings(g.teams, gMatchesPred)
      if (!standing) continue
      for (const row of standing) teamToPosition.set(row.team, row.position)
    }
    result.set(userId, teamToPosition)
  }

  return result
}

/**
 * Recalcula los puntos de todas las predictions de un usuario contra los resultados finalizados en DB,
 * y actualiza el group position bonus si aplica.
 */
export async function recalcPointsForUser(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: results } = await supabase
    .from('results')
    .select('*')
    .eq('status', 'finished')

  if (!results || results.length === 0) return 0

  const matchIds = results.map(r => r.match_id)
  const { data: predictions } = await supabase
    .from('predictions')
    .select('id, user_id, match_id, phase, home_score, away_score, home_score_120, away_score_120, pen_winner')
    .eq('user_id', userId)
    .in('match_id', matchIds)

  if (!predictions || predictions.length === 0) return 0

  let userGroupStandings: Map<string, Map<string, number>> | null = null
  const hasElim = predictions.some(p => p.phase !== 'group')
  if (hasElim) {
    userGroupStandings = await computeUserStandingsBatch(supabase, [userId])
  }

  const { data: realStandings } = await supabase
    .from('group_standings')
    .select('team, position, finalized, group_id')
  const realPosMap = new Map<string, number>()
  for (const row of realStandings ?? []) {
    realPosMap.set(row.team, row.position)
  }

  let bracketMap = new Map<string, { home_team: string | null; away_team: string | null }>()
  if (hasElim) {
    const { data: brackets } = await supabase
      .from('bracket')
      .select('match_id, home_team, away_team')
      .in('match_id', matchIds)
    bracketMap = new Map((brackets ?? []).map(b => [b.match_id, b]))
  }

  const updates: { id: string; result_points: number; bonus_points: number }[] = []
  const resultMap = new Map(results.map(r => [r.match_id, r]))

  for (const p of predictions as PredictionRow[]) {
    const r = resultMap.get(p.match_id)
    if (!r) continue

    const result_points = pointsForResult(
      p.phase,
      p.home_score, p.away_score, p.home_score_120, p.away_score_120,
      r.home_score, r.away_score, r.home_score_120, r.away_score_120,
    )

    let bonus_points = 0

    if (p.phase !== 'group' && r.went_to_pens && r.pen_winner && p.pen_winner === r.pen_winner) {
      bonus_points += 1
    }

    if (p.phase !== 'group' && userGroupStandings) {
      let winnerTeam: string | null = null
      if (r.went_to_pens && r.pen_winner) {
        winnerTeam = r.pen_winner
      } else if (r.home_score_120 != null && r.away_score_120 != null) {
        const bracketRow = bracketMap.get(p.match_id)
        if (bracketRow) {
          if (r.home_score_120 > r.away_score_120 && bracketRow.home_team) winnerTeam = bracketRow.home_team
          else if (r.home_score_120 < r.away_score_120 && bracketRow.away_team) winnerTeam = bracketRow.away_team
        }
      }

      if (winnerTeam) {
        const realPos = realPosMap.get(winnerTeam)
        const userPositions = userGroupStandings.get(userId)
        if (realPos != null && userPositions) {
          const userPos = userPositions.get(winnerTeam)
          if (userPos != null && userPos === realPos) {
            bonus_points += 1
          }
        }
      }
    }

    updates.push({ id: p.id, result_points, bonus_points })
  }

  await Promise.all(
    updates.map(u =>
      supabase.from('predictions')
        .update({ result_points: u.result_points, bonus_points: u.bonus_points })
        .eq('id', u.id)
    )
  )

  await recalcGroupPositionBonusForUser(supabase, userId, realStandings, userGroupStandings)

  return updates.length
}

async function recalcGroupPositionBonusForUser(
  supabase: SupabaseClient,
  userId: string,
  realStandings: { group_id?: string; team: string; position: number; finalized?: boolean }[] | null,
  userGroupStandings: Map<string, Map<string, number>> | null
): Promise<void> {
  let standings = realStandings
  if (!standings) {
    const { data } = await supabase
      .from('group_standings')
      .select('group_id, position, team, finalized')
    standings = data
  }

  if (!standings || standings.length === 0) return
  const allFinalized = standings.length === 48 && standings.every((r: any) => r.finalized)
  if (!allFinalized) return

  const realByGroup = new Map<string, Map<string, number>>()
  for (const r of standings as any[]) {
    if (!realByGroup.has(r.group_id)) realByGroup.set(r.group_id, new Map())
    realByGroup.get(r.group_id)!.set(r.team, r.position)
  }

  let userPred = userGroupStandings
  if (!userPred) {
    userPred = await computeUserStandingsBatch(supabase, [userId])
  }

  const userPositions = userPred.get(userId)
  if (!userPositions) {
    await supabase.from('user_bonus').upsert({ user_id: userId, type: 'group_position', points: 0 }, { onConflict: 'user_id,type' })
    return
  }

  let pts = 0
  for (const [groupId, realPositions] of realByGroup) {
    for (const [team, realPos] of realPositions) {
      const predPos = userPositions.get(team)
      if (predPos != null && predPos === realPos) pts += 2
    }
  }

  await supabase.from('user_bonus').upsert({ user_id: userId, type: 'group_position', points: pts }, { onConflict: 'user_id,type' })
}
