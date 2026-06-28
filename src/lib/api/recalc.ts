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
import { createAdminClient } from '@/lib/supabase/admin'
import { recalculateRealGroupStandings } from './bracket'

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

function pointsForElimMatch(
  predHomeTeam: string | null,
  predAwayTeam: string | null,
  predHomeScore: number | null,
  predAwayScore: number | null,
  predPenWinner: string | null,
  realHomeTeam: string | null,
  realAwayTeam: string | null,
  realHomeScore: number | null,
  realAwayScore: number | null,
  realWentToPens: boolean,
  realPenWinner: string | null
): number {
  if (
    !predHomeTeam || !predAwayTeam || predHomeScore == null || predAwayScore == null ||
    !realHomeTeam || !realAwayTeam || realHomeScore == null || realAwayScore == null
  ) {
    return 0
  }

  // Determine real winner of the match (considering 120' and penalties)
  let realWinner: string
  if (realWentToPens && realPenWinner) {
    realWinner = realPenWinner
  } else {
    if (realHomeScore > realAwayScore) {
      realWinner = realHomeTeam
    } else {
      realWinner = realAwayTeam
    }
  }

  // Check if both predicted teams match the real teams (home/away or swapped)
  const bothTeamsMatch =
    (predHomeTeam === realHomeTeam && predAwayTeam === realAwayTeam) ||
    (predHomeTeam === realAwayTeam && predAwayTeam === realHomeTeam)

  if (bothTeamsMatch) {
    // Align predictions to real home/away
    let alignedPredHomeScore: number
    let alignedPredAwayScore: number

    if (predHomeTeam === realHomeTeam) {
      alignedPredHomeScore = predHomeScore
      alignedPredAwayScore = predAwayScore
    } else {
      alignedPredHomeScore = predAwayScore
      alignedPredAwayScore = predHomeScore
    }

    // Check exact score at 120'
    if (alignedPredHomeScore === realHomeScore && alignedPredAwayScore === realAwayScore) {
      return 3
    }

    // Check correct outcome at 120' (win/loss/draw)
    const predIsDraw = alignedPredHomeScore === alignedPredAwayScore
    const realIsDraw = realHomeScore === realAwayScore
    const predHomeWon = alignedPredHomeScore > alignedPredAwayScore
    const realHomeWon = realHomeScore > realAwayScore
    const predAwayWon = alignedPredHomeScore < alignedPredAwayScore
    const realAwayWon = realHomeScore < realAwayScore

    if (
      (predIsDraw && realIsDraw) ||
      (predHomeWon && realHomeWon) ||
      (predAwayWon && realAwayWon)
    ) {
      return 1
    }

    return 0
  }

  // Only one team matches
  const homeMatches = predHomeTeam === realHomeTeam || predHomeTeam === realAwayTeam
  const awayMatches = predAwayTeam === realHomeTeam || predAwayTeam === realAwayTeam

  if (homeMatches || awayMatches) {
    const matchingTeam = homeMatches ? predHomeTeam : predAwayTeam

    // Find the role of matchingTeam in real match
    const realMatchingRole = (matchingTeam === realHomeTeam) ? 'home' : 'away'

    // Align scores
    const predMatchingScore = (matchingTeam === predHomeTeam) ? predHomeScore : predAwayScore
    const predOtherScore = (matchingTeam === predHomeTeam) ? predAwayScore : predHomeScore

    const realMatchingScore = (realMatchingRole === 'home') ? realHomeScore : realAwayScore
    const realOtherScore = (realMatchingRole === 'home') ? realAwayScore : realHomeScore

    // Check if matching team won both in real 120' and in user's 120' prediction, or both drew
    const matchingTeamWonReal120 = (realMatchingScore > realOtherScore)
    const matchingTeamWonPred120 = (predMatchingScore > predOtherScore)
    const bothDraw = (realMatchingScore === realOtherScore) && (predMatchingScore === predOtherScore)

    if ((matchingTeamWonReal120 && matchingTeamWonPred120) || bothDraw) {
      // Check exact score
      if (predMatchingScore === realMatchingScore && predOtherScore === realOtherScore) {
        return 3
      }
      return 1
    }
  }

  return 0
}

/**
 * Recalcula puntos de TODAS las predictions del partido dado.
 * Retorna el número de filos actualizadas.
 */
export async function recalcPointsForMatch(supabase: SupabaseClient, matchId: string): Promise<number> {
  const { data: result } = await supabase
    .from('results')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()

  if (!result || result.status !== 'finished') {
    // Sin resultado finalizado: reseteamos los puntos de las predicciones de este partido a 0
    const { error } = await supabase
      .from('predictions')
      .update({ result_points: 0, bonus_points: 0 })
      .eq('match_id', matchId)
    if (error) {
      console.error(`recalcPointsForMatch: Error al limpiar puntos de predicciones para ${matchId}:`, error)
      throw new Error(`Error clearing points: ${error.message}`)
    }
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
  let userBrackets: Map<string, Map<string, { home: string | null; away: string | null }>> | null = null
  let realPos: number | null = null
  let bracketRow: { home_team: string | null; away_team: string | null } | null = null

  if (r.phase !== 'group') {
    const { data: bRow } = await supabase
      .from('bracket').select('home_team, away_team').eq('match_id', matchId).maybeSingle()
    bracketRow = bRow

    if (bracketRow) {
      // Quién ganó realmente? Si fue a penales, pen_winner; si no, comparar 120'
      if (r.went_to_pens && r.pen_winner) {
        winnerTeam = r.pen_winner
      } else if (r.home_score_120 != null && r.away_score_120 != null) {
        if (r.home_score_120 > r.away_score_120) winnerTeam = bracketRow.home_team
        else if (r.home_score_120 < r.away_score_120) winnerTeam = bracketRow.away_team
      }
    }

    // Cargamos las predicciones de fase de grupos de TODOS los usuarios afectados
    const userIds = [...new Set((predictions as PredictionRow[]).map(p => p.user_id))]
    userGroupStandings = await computeUserStandingsBatch(supabase, userIds)
    userBrackets = await computeUserBracketsBatch(supabase, userIds)

    if (winnerTeam) {
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
    let result_points = 0
    let predWinner: string | null = null

    if (p.phase === 'group') {
      result_points = pointsForResult(
        p.phase,
        p.home_score, p.away_score, p.home_score_120, p.away_score_120,
        r.home_score, r.away_score, r.home_score_120, r.away_score_120,
      )
    } else if (bracketRow && userBrackets) {
      const userBracket = userBrackets.get(p.user_id)
      const predHomeTeam = userBracket?.get(matchId)?.home ?? null
      const predAwayTeam = userBracket?.get(matchId)?.away ?? null

      result_points = pointsForElimMatch(
        predHomeTeam, predAwayTeam, p.home_score_120, p.away_score_120, p.pen_winner,
        bracketRow.home_team, bracketRow.away_team, r.home_score_120, r.away_score_120,
        r.went_to_pens, r.pen_winner
      )

      if (predHomeTeam && predAwayTeam && p.home_score_120 != null && p.away_score_120 != null) {
        if (p.home_score_120 > p.away_score_120) {
          predWinner = predHomeTeam
        } else if (p.home_score_120 < p.away_score_120) {
          predWinner = predAwayTeam
        } else {
          predWinner = p.pen_winner
        }
      }
    }

    let bonus_points = 0

    // Bonus penales
    if (p.phase !== 'group' && r.went_to_pens && r.pen_winner && p.pen_winner === r.pen_winner) {
      bonus_points += 1
    }

    // Bonus posicionamiento elim: ganador real estuvo en esa misma posición de grupo en el pronóstico del usuario Y el usuario predijo que ese equipo ganaba
    if (p.phase !== 'group' && winnerTeam && realPos != null && userGroupStandings && predWinner === winnerTeam) {
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

  // Update en batch
  const results = await Promise.all(
    updates.map(async u => {
      const { error } = await supabase.from('predictions')
        .update({ result_points: u.result_points, bonus_points: u.bonus_points })
        .eq('id', u.id)
      return { id: u.id, error }
    })
  )

  const errors = results.filter(r => r.error)
  if (errors.length > 0) {
    console.error(`recalcPointsForMatch: Error al actualizar ${errors.length} predicciones. Primer error:`, errors[0].error)
    throw new Error(`Error recalculating points: ${errors[0].error?.message}`)
  }

  if (matchId === 'FINAL' || matchId === 'THIRD') {
    await recalcPodiumBonus(supabase)
  }

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

  let total = 0
  for (const r of results ?? []) {
    total += await recalcPointsForMatch(supabase, r.match_id)
  }
  await recalcGroupPositionBonus(supabase)
  await recalcPodiumBonus(supabase)
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
  try {
    await recalculateRealGroupStandings(supabase)
  } catch (err) {
    console.error("Error recalculating group standings in recalcGroupPositionBonus:", err)
  }

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
    const admin = createAdminClient()
    const { error } = await admin.from('user_bonus').upsert(upserts, { onConflict: 'user_id,type' })
    if (error) throw new Error(`recalcGroupPositionBonus: ${error.message}`)
  }
  return upserts.length
}

/**
 * Helper to fetch all predictions paginated from DB to avoid the default 1000 limit.
 */
async function fetchPredictionsPaginated(
  supabase: SupabaseClient,
  options: {
    phase?: 'group'
    excludePhase?: 'group'
    userIds?: string[]
    select: string
  }
): Promise<any[]> {
  let allPreds: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const fromRange = page * pageSize
    const toRange = (page + 1) * pageSize - 1
    let query = supabase
      .from('predictions')
      .select(options.select)
      .range(fromRange, toRange)

    if (options.phase) {
      query = query.eq('phase', options.phase)
    }
    if (options.excludePhase) {
      query = query.neq('phase', options.excludePhase)
    }
    if (options.userIds && options.userIds.length > 0) {
      query = query.in('user_id', options.userIds)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`fetchPredictionsPaginated: ${error.message}`)
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allPreds = allPreds.concat(data)
      if (data.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }
  }

  return allPreds
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

  // Carga predictions de fase grupos paginado
  let preds: any[] = []
  try {
    preds = await fetchPredictionsPaginated(supabase, {
      phase: 'group',
      userIds: [...submittedUsers],
      select: 'user_id, match_id, home_score, away_score'
    })
  } catch (err) {
    console.error('Error fetching group predictions paginated:', err)
    return result
  }

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

  if (!results || results.length === 0) {
    // Si no hay resultados finalizados, limpiamos los puntos de todas las predicciones de este usuario
    const { error } = await supabase
      .from('predictions')
      .update({ result_points: 0, bonus_points: 0 })
      .eq('user_id', userId)
    if (error) {
      console.error(`recalcPointsForUser: Error al limpiar puntos para usuario ${userId}:`, error)
      throw new Error(`Error clearing points: ${error.message}`)
    }
    return 0
  }

  const { data: predictions } = await supabase
    .from('predictions')
    .select('id, user_id, match_id, phase, home_score, away_score, home_score_120, away_score_120, pen_winner')
    .eq('user_id', userId)

  if (!predictions || predictions.length === 0) return 0

  let userGroupStandings: Map<string, Map<string, number>> | null = null
  let userBrackets: Map<string, Map<string, { home: string | null; away: string | null }>> | null = null
  const hasElim = predictions.some(p => p.phase !== 'group')
  if (hasElim) {
    userGroupStandings = await computeUserStandingsBatch(supabase, [userId])
    userBrackets = await computeUserBracketsBatch(supabase, [userId])
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
    bracketMap = new Map((brackets ?? []).map(b => [b.match_id, b]))
  }

  const updates: { id: string; result_points: number; bonus_points: number }[] = []
  const resultMap = new Map(results.map(r => [r.match_id, r]))

  for (const p of predictions as PredictionRow[]) {
    const r = resultMap.get(p.match_id)
    if (!r) {
      // Si el partido real no está finalizado o cargado, reseteamos a 0
      updates.push({ id: p.id, result_points: 0, bonus_points: 0 })
      continue
    }

    let result_points = 0

    if (p.phase === 'group') {
      result_points = pointsForResult(
        p.phase,
        p.home_score, p.away_score, p.home_score_120, p.away_score_120,
        r.home_score, r.away_score, r.home_score_120, r.away_score_120,
      )
    } else if (hasElim && userBrackets) {
      const userBracket = userBrackets.get(userId)
      const predHomeTeam = userBracket?.get(p.match_id)?.home ?? null
      const predAwayTeam = userBracket?.get(p.match_id)?.away ?? null
      const bracketRow = bracketMap.get(p.match_id)

      if (bracketRow) {
        result_points = pointsForElimMatch(
          predHomeTeam, predAwayTeam, p.home_score_120, p.away_score_120, p.pen_winner,
          bracketRow.home_team, bracketRow.away_team, r.home_score_120, r.away_score_120,
          r.went_to_pens, r.pen_winner
        )
      }
    }

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

      let predWinner: string | null = null
      if (userBrackets) {
        const userBracket = userBrackets.get(userId)
        const predHomeTeam = userBracket?.get(p.match_id)?.home ?? null
        const predAwayTeam = userBracket?.get(p.match_id)?.away ?? null
        if (predHomeTeam && predAwayTeam && p.home_score_120 != null && p.away_score_120 != null) {
          if (p.home_score_120 > p.away_score_120) {
            predWinner = predHomeTeam
          } else if (p.home_score_120 < p.away_score_120) {
            predWinner = predAwayTeam
          } else {
            predWinner = p.pen_winner
          }
        }
      }

      if (winnerTeam && predWinner === winnerTeam) {
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

  const updateResults = await Promise.all(
    updates.map(async u => {
      const { error } = await supabase.from('predictions')
        .update({ result_points: u.result_points, bonus_points: u.bonus_points })
        .eq('id', u.id)
      return { id: u.id, error }
    })
  )

  const errors = updateResults.filter(r => r.error)
  if (errors.length > 0) {
    console.error(`recalcPointsForUser: Error al actualizar ${errors.length} predicciones. Primer error:`, errors[0].error)
    throw new Error(`Error recalculating points: ${errors[0].error?.message}`)
  }

  await recalcGroupPositionBonusForUser(supabase, userId, realStandings, userGroupStandings)
  await recalcPodiumBonusForUser(supabase, userId)

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
    const admin = createAdminClient()
    await admin.from('user_bonus').upsert({ user_id: userId, type: 'group_position', points: 0 }, { onConflict: 'user_id,type' })
    return
  }

  let pts = 0
  for (const [groupId, realPositions] of realByGroup) {
    for (const [team, realPos] of realPositions) {
      const predPos = userPositions.get(team)
      if (predPos != null && predPos === realPos) pts += 2
    }
  }

  const admin = createAdminClient()
  await admin.from('user_bonus').upsert({ user_id: userId, type: 'group_position', points: pts }, { onConflict: 'user_id,type' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus de Podio (Fase 6)
// ─────────────────────────────────────────────────────────────────────────────

const WINNER_PROPAGATION: Record<string, { home: string; away: string; losers?: boolean }> = {
  'R16_1': { home: 'R32_1',  away: 'R32_4'  },
  'R16_2': { home: 'R32_3',  away: 'R32_6'  },
  'R16_3': { home: 'R32_2',  away: 'R32_5'  },
  'R16_4': { home: 'R32_7',  away: 'R32_8'  },
  'R16_5': { home: 'R32_12', away: 'R32_11' },
  'R16_6': { home: 'R32_10', away: 'R32_9'  },
  'R16_7': { home: 'R32_15', away: 'R32_14' },
  'R16_8': { home: 'R32_13', away: 'R32_16' },

  'QF_1': { home: 'R16_1', away: 'R16_2' },
  'QF_2': { home: 'R16_3', away: 'R16_4' },
  'QF_3': { home: 'R16_5', away: 'R16_6' },
  'QF_4': { home: 'R16_7', away: 'R16_8' },

  'SF_1': { home: 'QF_1', away: 'QF_3' },
  'SF_2': { home: 'QF_2', away: 'QF_4' },

  'FINAL': { home: 'SF_1', away: 'SF_2' },
  'THIRD': { home: 'SF_1', away: 'SF_2', losers: true },
}

function getPredictedWinner(
  pred: { home_score_120: number | null; away_score_120: number | null; pen_winner: string | null } | undefined,
  homeTeam: string | null,
  awayTeam: string | null,
  wantLoser = false
): string | null {
  if (!pred || !homeTeam || !awayTeam) return null
  if (pred.home_score_120 == null || pred.away_score_120 == null) return null

  let winner: string | null = null
  if (pred.home_score_120 > pred.away_score_120) {
    winner = homeTeam
  } else if (pred.home_score_120 < pred.away_score_120) {
    winner = awayTeam
  } else if (pred.pen_winner) {
    winner = pred.pen_winner
  }

  if (!winner) return null
  if (wantLoser) return winner === homeTeam ? awayTeam : homeTeam
  return winner
}

function getRealWinner(
  result: { home_score_120: number | null; away_score_120: number | null; went_to_pens: boolean; pen_winner: string | null; status: string } | undefined,
  homeTeam: string | null,
  awayTeam: string | null,
  wantLoser = false
): string | null {
  if (!result || result.status !== 'finished' || !homeTeam || !awayTeam) return null

  let winner: string | null = null
  if (result.went_to_pens && result.pen_winner) {
    winner = result.pen_winner
  } else if (result.home_score_120 != null && result.away_score_120 != null) {
    if (result.home_score_120 > result.away_score_120) winner = homeTeam
    else if (result.home_score_120 < result.away_score_120) winner = awayTeam
  }

  if (!winner) return null
  if (wantLoser) return winner === homeTeam ? awayTeam : homeTeam
  return winner
}

export async function computeUserBracketsBatch(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Map<string, { home: string | null; away: string | null }>>> {
  const result = new Map<string, Map<string, { home: string | null; away: string | null }>>()
  if (userIds.length === 0) return result

  // Load real bracket for R32
  const { data: bracketRows } = await supabase
    .from('bracket')
    .select('match_id, home_team, away_team')
    .eq('phase', 'r32')

  if (!bracketRows || bracketRows.length === 0) return result
  const r32Map = new Map(bracketRows.map(b => [b.match_id, b]))

  // Load predictions for knockout phase for userIds paginated
  let preds: any[] = []
  try {
    preds = await fetchPredictionsPaginated(supabase, {
      excludePhase: 'group',
      userIds: userIds,
      select: 'user_id, match_id, home_score_120, away_score_120, pen_winner'
    })
  } catch (err) {
    console.error('Error fetching knockout predictions paginated in computeUserBracketsBatch:', err)
    return result
  }

  const userPreds = new Map<string, Map<string, any>>()
  for (const p of preds) {
    if (!userPreds.has(p.user_id)) userPreds.set(p.user_id, new Map())
    userPreds.get(p.user_id)!.set(p.match_id, p)
  }

  const rounds = [
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('R16')),
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('QF')),
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('SF')),
    ['FINAL', 'THIRD']
  ]

  for (const userId of userIds) {
    const predMap = userPreds.get(userId) ?? new Map()

    const userBracket = new Map<string, { home: string | null; away: string | null }>()
    for (const [matchId, b] of r32Map.entries()) {
      userBracket.set(matchId, { home: b.home_team, away: b.away_team })
    }

    for (const roundSlots of rounds) {
      for (const slotId of roundSlots) {
        const seeding = WINNER_PROPAGATION[slotId]
        const homeMatch = userBracket.get(seeding.home)
        const awayMatch = userBracket.get(seeding.away)

        if (homeMatch && awayMatch) {
          const homePred = predMap.get(seeding.home)
          const awayPred = predMap.get(seeding.away)

          const homeWinner = getPredictedWinner(homePred, homeMatch.home, homeMatch.away, !!seeding.losers)
          const awayWinner = getPredictedWinner(awayPred, awayMatch.home, awayMatch.away, !!seeding.losers)

          userBracket.set(slotId, { home: homeWinner, away: awayWinner })
        }
      }
    }

    result.set(userId, userBracket)
  }

  return result
}

async function computeUserPodiumPredictions(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { champion: string | null; runner: string | null; third: string | null; fourth: string | null }>> {
  const result = new Map<string, { champion: string | null; runner: string | null; third: string | null; fourth: string | null }>()
  if (userIds.length === 0) return result

  const userBrackets = await computeUserBracketsBatch(supabase, userIds)

  // Load predictions for knockout phase for userIds paginated
  let preds: any[] = []
  try {
    preds = await fetchPredictionsPaginated(supabase, {
      excludePhase: 'group',
      userIds: userIds,
      select: 'user_id, match_id, home_score_120, away_score_120, pen_winner'
    })
  } catch (err) {
    console.error('Error fetching knockout predictions paginated in computeUserPodiumPredictions:', err)
    return result
  }

  const userPreds = new Map<string, Map<string, any>>()
  for (const p of preds) {
    if (!userPreds.has(p.user_id)) userPreds.set(p.user_id, new Map())
    userPreds.get(p.user_id)!.set(p.match_id, p)
  }

  for (const userId of userIds) {
    const predMap = userPreds.get(userId) ?? new Map()
    const userBracket = userBrackets.get(userId)

    const finalPred = predMap.get('FINAL')
    const thirdPred = predMap.get('THIRD')
    const finalTeams = userBracket?.get('FINAL')
    const thirdTeams = userBracket?.get('THIRD')

    let champion: string | null = null
    let runner: string | null = null
    let third: string | null = null
    let fourth: string | null = null

    if (finalTeams && finalPred) {
      champion = getPredictedWinner(finalPred, finalTeams.home, finalTeams.away, false)
      runner = getPredictedWinner(finalPred, finalTeams.home, finalTeams.away, true)
    }
    if (thirdTeams && thirdPred) {
      third = getPredictedWinner(thirdPred, thirdTeams.home, thirdTeams.away, false)
      fourth = getPredictedWinner(thirdPred, thirdTeams.home, thirdTeams.away, true)
    }

    result.set(userId, { champion, runner, third, fourth })
  }

  return result
}

export async function recalcPodiumBonus(supabase: SupabaseClient): Promise<number> {
  const { data: finalBracket } = await supabase
    .from('bracket')
    .select('match_id, home_team, away_team')
    .in('match_id', ['FINAL', 'THIRD'])

  const { data: finalResults } = await supabase
    .from('results')
    .select('match_id, home_score_120, away_score_120, went_to_pens, pen_winner, status')
    .in('match_id', ['FINAL', 'THIRD'])

  const finalBracketMap = new Map(finalBracket?.map(b => [b.match_id, b]))
  const finalResultsMap = new Map(finalResults?.map(r => [r.match_id, r]))

  const realWinners = new Map<string, string | null>()
  const realLosers = new Map<string, string | null>()

  for (const matchId of ['FINAL', 'THIRD']) {
    const b = finalBracketMap.get(matchId)
    const r = finalResultsMap.get(matchId)
    if (b && r && r.status === 'finished') {
      const winner = getRealWinner(r, b.home_team, b.away_team, false)
      const loser = getRealWinner(r, b.home_team, b.away_team, true)
      realWinners.set(matchId, winner)
      realLosers.set(matchId, loser)
    }
  }

  const realChampion = realWinners.get('FINAL') ?? null
  const realRunner = realLosers.get('FINAL') ?? null
  const realThird = realWinners.get('THIRD') ?? null
  const realFourth = realLosers.get('THIRD') ?? null

  const { data: subs } = await supabase
    .from('submissions')
    .select('user_id')
    .eq('phase', 'r32_rest')

  const userIds = (subs ?? []).map(s => s.user_id)
  if (userIds.length === 0) return 0

  const userPodiums = await computeUserPodiumPredictions(supabase, userIds)

  const upserts: { user_id: string; type: string; points: number }[] = []
  for (const userId of userIds) {
    const userPodium = userPodiums.get(userId)
    if (!userPodium) continue

    const ptsChampion = (realChampion && userPodium.champion === realChampion) ? 15 : 0
    const ptsRunner = (realRunner && userPodium.runner === realRunner) ? 8 : 0
    const ptsThird = (realThird && userPodium.third === realThird) ? 5 : 0
    const ptsFourth = (realFourth && userPodium.fourth === realFourth) ? 3 : 0

    upserts.push({ user_id: userId, type: 'podium_champion', points: ptsChampion })
    upserts.push({ user_id: userId, type: 'podium_runner', points: ptsRunner })
    upserts.push({ user_id: userId, type: 'podium_third', points: ptsThird })
    upserts.push({ user_id: userId, type: 'podium_fourth', points: ptsFourth })
  }

  if (upserts.length > 0) {
    const admin = createAdminClient()
    const { error } = await admin.from('user_bonus').upsert(upserts, { onConflict: 'user_id,type' })
    if (error) throw new Error(`recalcPodiumBonus: ${error.message}`)
  }

  return upserts.length
}

export async function recalcPodiumBonusForUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: sub } = await supabase
    .from('submissions')
    .select('user_id')
    .eq('user_id', userId)
    .eq('phase', 'r32_rest')
    .maybeSingle()

  if (!sub) {
    const admin = createAdminClient()
    await admin.from('user_bonus').delete().eq('user_id', userId).like('type', 'podium_%')
    return
  }

  const { data: finalBracket } = await supabase
    .from('bracket')
    .select('match_id, home_team, away_team')
    .in('match_id', ['FINAL', 'THIRD'])

  const { data: finalResults } = await supabase
    .from('results')
    .select('match_id, home_score_120, away_score_120, went_to_pens, pen_winner, status')
    .in('match_id', ['FINAL', 'THIRD'])

  const finalBracketMap = new Map(finalBracket?.map(b => [b.match_id, b]))
  const finalResultsMap = new Map(finalResults?.map(r => [r.match_id, r]))

  const realWinners = new Map<string, string | null>()
  const realLosers = new Map<string, string | null>()

  for (const matchId of ['FINAL', 'THIRD']) {
    const b = finalBracketMap.get(matchId)
    const r = finalResultsMap.get(matchId)
    if (b && r && r.status === 'finished') {
      const winner = getRealWinner(r, b.home_team, b.away_team, false)
      const loser = getRealWinner(r, b.home_team, b.away_team, true)
      realWinners.set(matchId, winner)
      realLosers.set(matchId, loser)
    }
  }

  const realChampion = realWinners.get('FINAL') ?? null
  const realRunner = realLosers.get('FINAL') ?? null
  const realThird = realWinners.get('THIRD') ?? null
  const realFourth = realLosers.get('THIRD') ?? null

  const userPodiums = await computeUserPodiumPredictions(supabase, [userId])
  const userPodium = userPodiums.get(userId)

  if (!userPodium) return

  const ptsChampion = (realChampion && userPodium.champion === realChampion) ? 15 : 0
  const ptsRunner = (realRunner && userPodium.runner === realRunner) ? 8 : 0
  const ptsThird = (realThird && userPodium.third === realThird) ? 5 : 0
  const ptsFourth = (realFourth && userPodium.fourth === realFourth) ? 3 : 0

  const upserts = [
    { user_id: userId, type: 'podium_champion', points: ptsChampion },
    { user_id: userId, type: 'podium_runner', points: ptsRunner },
    { user_id: userId, type: 'podium_third', points: ptsThird },
    { user_id: userId, type: 'podium_fourth', points: ptsFourth },
  ]

  const admin = createAdminClient()
  const { error } = await admin.from('user_bonus').upsert(upserts, { onConflict: 'user_id,type' })
  if (error) throw new Error(`recalcPodiumBonusForUser: ${error.message}`)
}
