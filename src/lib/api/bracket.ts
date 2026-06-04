/**
 * Derivación automática de cruces eliminatorios a partir de resultados.
 *
 * Implementa el bracket oficial de FIFA 2026:
 *
 * R32 (16 partidos):
 *   - 4 partidos con terceros: 1°E vs 3°A/B/C/D/F, 1°I vs 3°C/D/F/G/H,
 *     1°A vs 3°C/E/F/H/I, 1°L vs 3°E/H/I/J/K
 *   - 4 partidos con terceros: 1°G vs 3°A/E/H/I/J, 1°D vs 3°B/E/F/I/J,
 *     1°B vs 3°E/F/G/I/J, 1°K vs 3°D/E/I/J/L
 *   - 8 partidos fijos 1° vs 2° y 2° vs 2°:
 *     2°A vs 2°B, 1°C vs 2°F, 1°F vs 2°C, 2°E vs 2°I,
 *     1°H vs 2°J, 2°K vs 2°L, 2°D vs 2°G, 1°J vs 2°H
 *
 * R16, QF, SF, FINAL, THIRD: propagación de ganadores/perdedores.
 *
 * La tabla de 495 combinaciones de terceros se hardcodea como un Record
 * que mapea la clave ordenada de 8 grupos (ej. "ABCDEFGI") a los
 * 4 terceros asignados a los 4 partidos con terceros.
 *
 * Fuente: reglamento oficial FIFA 2026 (Anexo C) y Wikipedia
 * https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { GROUPS, MATCHES, BRACKET_SLOTS, type Phase } from '@/lib/fixture'
import { computeGroupStandings, computeDetailedLiveStandings, type GroupMatch } from '@/lib/standings'

// ─────────────────────────────────────────────────────────────────────────────
// Mapping interno: R32 slot → { home, away } en términos de grupo+posición
// ─────────────────────────────────────────────────────────────────────────────

// Los 8 partidos fijos (sin terceros)
const R32_FIXED: Record<string, {
  home: { group: string; pos: 1 | 2 }
  away: { group: string; pos: 1 | 2 }
}> = {
  // Match 73: 2°A vs 2°B
  'R32_1':  { home: { group: 'A', pos: 2 }, away: { group: 'B', pos: 2 } },
  // Match 74: 1°C vs 2°F  (el otro rival puede ser un tercero, ver abajo)
  // Match 74 en realidad es 1°E vs 3° → no es fijo, ver R32_THIRDS
  // Match 75: 1°C vs 2°F
  'R32_2':  { home: { group: 'C', pos: 1 }, away: { group: 'F', pos: 2 } },
  // Match 76: 1°F vs 2°C
  'R32_4':  { home: { group: 'F', pos: 1 }, away: { group: 'C', pos: 2 } },
  // Match 78: 2°E vs 2°I
  'R32_5':  { home: { group: 'E', pos: 2 }, away: { group: 'I', pos: 2 } },
  // Match 81: 2°D vs 2°G
  'R32_14': { home: { group: 'D', pos: 2 }, away: { group: 'G', pos: 2 } },
  // Match 83: 2°K vs 2°L
  'R32_12': { home: { group: 'K', pos: 2 }, away: { group: 'L', pos: 2 } },
  // Match 87: 1°H vs 2°J
  'R32_11': { home: { group: 'H', pos: 1 }, away: { group: 'J', pos: 2 } },
  // Match 88: 1°J vs 2°H
  'R32_15': { home: { group: 'J', pos: 1 }, away: { group: 'H', pos: 2 } },
}

// Los 8 partidos con terceros: slot → { group del 1° fijo, grupos posibles del 3° }
// Según bracket oficial FIFA 2026
const R32_WITH_THIRDS: {
  slot: string
  firstGroup: string     // Grupo del 1° clasificado
  possibleThirdGroups: string[]  // Grupos de los que puede venir el 3°
}[] = [
  // Match 74: 1°E vs 3°(A/B/C/D/F)
  { slot: 'R32_3',  firstGroup: 'E', possibleThirdGroups: ['A','B','C','D','F'] },
  // Match 77: 1°I vs 3°(C/D/F/G/H)
  { slot: 'R32_6',  firstGroup: 'I', possibleThirdGroups: ['C','D','F','G','H'] },
  // Match 79: 1°A vs 3°(C/E/F/H/I)
  { slot: 'R32_7',  firstGroup: 'A', possibleThirdGroups: ['C','E','F','H','I'] },
  // Match 80: 1°L vs 3°(E/H/I/J/K)
  { slot: 'R32_8',  firstGroup: 'L', possibleThirdGroups: ['E','H','I','J','K'] },
  // Match 82: 1°G vs 3°(A/E/H/I/J)
  { slot: 'R32_9',  firstGroup: 'G', possibleThirdGroups: ['A','E','H','I','J'] },
  // Match 84: 1°D vs 3°(B/E/F/I/J)
  { slot: 'R32_10', firstGroup: 'D', possibleThirdGroups: ['B','E','F','I','J'] },
  // Match 85: 1°B vs 3°(E/F/G/I/J)
  { slot: 'R32_13', firstGroup: 'B', possibleThirdGroups: ['E','F','G','I','J'] },
  // Match 88: 1°K vs 3°(D/E/I/J/L)
  { slot: 'R32_16', firstGroup: 'K', possibleThirdGroups: ['D','E','I','J','L'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// Propagación de ganadores: nextSlot → { homeSlot, awaySlot, losers? }
// Fuente: Wikipedia TOC (matches 89-88)
// ─────────────────────────────────────────────────────────────────────────────

const WINNER_PROPAGATION: Record<string, { home: string; away: string; losers?: true }> = {
  // R16 (8 partidos)
  // Match 89: W(M73) vs W(M75)  → R32_1 vs R32_2
  'R16_1': { home: 'R32_1',  away: 'R32_2'  },
  // Match 90: W(M74) vs W(M77)  → R32_3 vs R32_6
  'R16_2': { home: 'R32_3',  away: 'R32_6'  },
  // Match 91: W(M76) vs W(M78)  → R32_4 vs R32_5
  'R16_3': { home: 'R32_4',  away: 'R32_5'  },
  // Match 92: W(M79) vs W(M80)  → R32_7 vs R32_8
  'R16_4': { home: 'R32_7',  away: 'R32_8'  },
  // Match 93: W(M83) vs W(M84)  → R32_12 vs R32_10
  'R16_5': { home: 'R32_12', away: 'R32_10' },
  // Match 94: W(M81) vs W(M82)  → R32_14 vs R32_9
  'R16_6': { home: 'R32_14', away: 'R32_9'  },
  // Match 95: W(M86) vs W(M88)  → R32_13 vs R32_16
  'R16_7': { home: 'R32_13', away: 'R32_16' },
  // Match 96: W(M85) vs W(M87)  → R32_11 vs R32_15
  'R16_8': { home: 'R32_11', away: 'R32_15' },

  // QF (4 partidos)
  'QF_1': { home: 'R16_1', away: 'R16_2' },
  'QF_2': { home: 'R16_3', away: 'R16_4' },
  'QF_3': { home: 'R16_5', away: 'R16_6' },
  'QF_4': { home: 'R16_7', away: 'R16_8' },

  // SF
  'SF_1': { home: 'QF_1', away: 'QF_2' },
  'SF_2': { home: 'QF_3', away: 'QF_4' },

  // Final y tercer puesto
  'FINAL': { home: 'SF_1', away: 'SF_2' },
  'THIRD': { home: 'SF_1', away: 'SF_2', losers: true },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ElimResult {
  match_id: string
  home_score_120: number | null
  away_score_120: number | null
  went_to_pens: boolean
  pen_winner: string | null
  status: string
}

function getWinner(
  result: ElimResult,
  homeTeam: string | null,
  awayTeam: string | null,
  wantLoser = false,
): string | null {
  if (result.status !== 'finished' || !homeTeam || !awayTeam) return null

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

async function ensureResultRow(
  supabase: SupabaseClient,
  matchId: string,
  phase: Phase,
): Promise<void> {
  const { data: existing } = await supabase
    .from('results')
    .select('match_id')
    .eq('match_id', matchId)
    .maybeSingle()

  if (!existing) {
    await supabase.from('results').insert({
      match_id: matchId,
      phase,
      home_score: null, away_score: null,
      home_score_120: null, away_score_120: null,
      went_to_pens: false, pen_winner: null,
      status: 'scheduled',
      api_home_score: null, api_away_score: null,
      api_home_score_120: null, api_away_score_120: null,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcular estadísticas de los terceros para el ranking de los 8 mejores
// ─────────────────────────────────────────────────────────────────────────────

interface ThirdStats {
  group: string
  team: string
  points: number
  gd: number
  gf: number
}

async function computeThirdStats(supabase: SupabaseClient): Promise<ThirdStats[]> {
  const { data: thirds } = await supabase
    .from('group_standings')
    .select('group_id, team, finalized')
    .eq('position', 3)
    .eq('finalized', true)

  if (!thirds || thirds.length === 0) return []

  const { data: groupResults } = await supabase
    .from('results')
    .select('match_id, home_score, away_score, status')
    .eq('phase', 'group')
    .eq('status', 'finished')

  if (!groupResults) return []

  const resultsById = new Map(groupResults.map(r => [r.match_id, r]))
  const groupMatchesByGroup = new Map<string, typeof MATCHES[0][]>()
  for (const m of MATCHES.filter(m => m.phase === 'group')) {
    if (!groupMatchesByGroup.has(m.group)) groupMatchesByGroup.set(m.group, [])
    groupMatchesByGroup.get(m.group)!.push(m)
  }

  return thirds.map(third => {
    const matches = groupMatchesByGroup.get(third.group_id) ?? []
    let pts = 0, gf = 0, ga = 0

    for (const m of matches) {
      if (m.home !== third.team && m.away !== third.team) continue
      const r = resultsById.get(m.id)
      if (!r || r.home_score == null || r.away_score == null) continue
      const isHome = m.home === third.team
      const tf = isHome ? r.home_score : r.away_score
      const ta = isHome ? r.away_score : r.home_score
      gf += tf; ga += ta
      if (tf > ta) pts += 3; else if (tf === ta) pts += 1
    }

    return { group: third.group_id, team: third.team, points: pts, gd: gf - ga, gf }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

function findValidAllocation(
  slots: typeof R32_WITH_THIRDS,
  qualifiedGroups: string[]
): Map<string, string> | null {
  const assignment = new Map<string, string>() // slot -> group
  const usedGroups = new Set<string>()

  function backtrack(index: number): boolean {
    if (index === slots.length) {
      return true
    }

    const currentSlot = slots[index]
    for (const group of currentSlot.possibleThirdGroups) {
      if (qualifiedGroups.includes(group) && !usedGroups.has(group)) {
        usedGroups.add(group)
        assignment.set(currentSlot.slot, group)
        if (backtrack(index + 1)) {
          return true
        }
        usedGroups.delete(group)
        assignment.delete(currentSlot.slot)
      }
    }
    return false
  }

  if (backtrack(0)) {
    return assignment
  }
  return null
}

export interface BracketDeriveReport {
  r32Slots: number
  r16Slots: number
  qfSlots: number
  sfSlots: number
  finalSlots: number
  thirdSlots: number
  errors: string[]
}

export async function recalculateRealGroupStandings(supabase: SupabaseClient): Promise<void> {
  const { data: dbGroupResults, error: dbGroupResultsError } = await supabase
    .from('results')
    .select('match_id, home_score, away_score, status')
    .eq('phase', 'group')

  if (dbGroupResultsError) {
    throw new Error(`recalculateRealGroupStandings: error fetching results: ${dbGroupResultsError.message}`)
  }

  const resultsMap = new Map<string, { home_score: number | null; away_score: number | null; status: string }>(
    (dbGroupResults ?? []).map(r => [r.match_id, r])
  )

  const standingsUpserts = []

  for (const g of GROUPS) {
    const gMatchesResults: GroupMatch[] = []
    let allFinished = true

    for (const m of MATCHES.filter(x => x.group === g.id)) {
      const res = resultsMap.get(m.id)
      if (res && res.status === 'finished' && res.home_score !== null && res.away_score !== null) {
        gMatchesResults.push({
          match: m,
          home: res.home_score,
          away: res.away_score,
        })
      } else {
        allFinished = false
      }
    }

    const standing = computeDetailedLiveStandings(g.teams, gMatchesResults)
    if (standing) {
      for (const row of standing) {
        standingsUpserts.push({
          group_id: g.id,
          position: row.position,
          team: row.team,
          finalized: allFinished,
        })
      }
    }
  }

  if (standingsUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from('group_standings')
      .upsert(standingsUpserts, { onConflict: 'group_id,position' })

    if (upsertError) {
      throw new Error(`recalculateRealGroupStandings: error upserting standings: ${upsertError.message}`)
    }
  }
}

export async function deriveBracketFromResults(supabase: SupabaseClient): Promise<BracketDeriveReport> {
  const report: BracketDeriveReport = {
    r32Slots: 0, r16Slots: 0, qfSlots: 0, sfSlots: 0, finalSlots: 0, thirdSlots: 0, errors: [],
  }

  try {
    await recalculateRealGroupStandings(supabase)
  } catch (err) {
    report.errors.push((err as Error).message)
  }

  // ── 1. Cargar group_standings ────────────────────────────────────────────
  const { data: standings } = await supabase
    .from('group_standings')
    .select('group_id, position, team, finalized')

  const finalizedGroups = new Set(
    (standings ?? []).filter(r => r.finalized).map(r => r.group_id)
  )

  // Mapa grupo → posición → equipo
  const standingsMap = new Map<string, Map<number, string>>()
  for (const row of standings ?? []) {
    if (!standingsMap.has(row.group_id)) standingsMap.set(row.group_id, new Map())
    standingsMap.get(row.group_id)!.set(row.position, row.team)
  }

  // ── 2. Ranking de terceros (si todos los grupos están finalizados) ────────
  let best8ThirdsByGroup: Map<string, string> | null = null  // group → team (de los 8 mejores)
  if (finalizedGroups.size === 12) {
    const thirdStats = await computeThirdStats(supabase)
    thirdStats.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.gd !== a.gd) return b.gd - a.gd
      return b.gf - a.gf
    })
    // Los 8 mejores terceros
    best8ThirdsByGroup = new Map(thirdStats.slice(0, 8).map(s => [s.group, s.team]))
  }

  // ── 3. Calcular bracket completo en memoria ──────────────────────────────
  const inMemoryBracket = new Map<string, {
    match_id: string
    phase: Phase
    position: number
    home_team: string | null
    away_team: string | null
    defined: boolean
  }>()

  for (const slot of BRACKET_SLOTS) {
    inMemoryBracket.set(slot.id, {
      match_id: slot.id,
      phase: slot.phase,
      position: slot.position,
      home_team: null,
      away_team: null,
      defined: false,
    })
  }

  // 3a. Partidos fijos (1° vs 2° / 2° vs 2°)
  for (const [slotId, seeding] of Object.entries(R32_FIXED)) {
    if (finalizedGroups.has(seeding.home.group) && finalizedGroups.has(seeding.away.group)) {
      const homeTeam = standingsMap.get(seeding.home.group)?.get(seeding.home.pos)
      const awayTeam = standingsMap.get(seeding.away.group)?.get(seeding.away.pos)
      if (homeTeam && awayTeam) {
        inMemoryBracket.set(slotId, {
          ...inMemoryBracket.get(slotId)!,
          home_team: homeTeam,
          away_team: awayTeam,
          defined: true,
        })
      }
    }
  }

  // 3b. Partidos con terceros
  if (best8ThirdsByGroup) {
    const qualifiedGroups = Array.from(best8ThirdsByGroup.keys())
    const allocation = findValidAllocation(R32_WITH_THIRDS, qualifiedGroups)

    if (allocation) {
      for (const entry of R32_WITH_THIRDS) {
        if (finalizedGroups.has(entry.firstGroup)) {
          const homeTeam = standingsMap.get(entry.firstGroup)?.get(1)
          const assignedGroup = allocation.get(entry.slot)
          const awayTeam = assignedGroup ? best8ThirdsByGroup.get(assignedGroup) : null

          if (homeTeam && awayTeam) {
            inMemoryBracket.set(entry.slot, {
              ...inMemoryBracket.get(entry.slot)!,
              home_team: homeTeam,
              away_team: awayTeam,
              defined: true,
            })
          }
        }
      }
    } else {
      report.errors.push(`No se encontró una asignación válida sin duplicados para los terceros clasificados`)
    }
  }

  // 3c. Propagar ganadores a R16, QF, SF, FINAL, THIRD
  const { data: elimResults } = await supabase
    .from('results')
    .select('match_id, home_score_120, away_score_120, went_to_pens, pen_winner, status')
    .neq('phase', 'group')

  const resultsMap = new Map<string, ElimResult>(
    (elimResults ?? []).map(r => [r.match_id, r as ElimResult])
  )

  const roundSlots = [
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('R16')),
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('QF')),
    Object.keys(WINNER_PROPAGATION).filter(k => k.startsWith('SF')),
    ['FINAL', 'THIRD'],
  ]

  for (const slots of roundSlots) {
    for (const slotId of slots) {
      const seeding = WINNER_PROPAGATION[slotId]
      if (!seeding) continue
      const wantLoser = !!seeding.losers

      const homeResult = resultsMap.get(seeding.home)
      const awayResult = resultsMap.get(seeding.away)
      const homeBracket = inMemoryBracket.get(seeding.home)
      const awayBracket = inMemoryBracket.get(seeding.away)

      if (homeResult && awayResult && homeBracket?.defined && awayBracket?.defined) {
        const homeTeam = getWinner(homeResult, homeBracket.home_team, homeBracket.away_team, wantLoser)
        const awayTeam = getWinner(awayResult, awayBracket.home_team, awayBracket.away_team, wantLoser)

        if (homeTeam && awayTeam) {
          inMemoryBracket.set(slotId, {
            ...inMemoryBracket.get(slotId)!,
            home_team: homeTeam,
            away_team: awayTeam,
            defined: true,
          })
        }
      }
    }
  }

  // ── 4. Comparar y actualizar en la base de datos ──────────────────────────
  const { data: dbBracketRows } = await supabase
    .from('bracket')
    .select('match_id, home_team, away_team, defined')

  const dbBracketMap = new Map(
    (dbBracketRows ?? []).map(b => [b.match_id, b])
  )

  const bracketUpserts: any[] = []
  const slotsToReset: string[] = []

  for (const slot of BRACKET_SLOTS) {
    const desired = inMemoryBracket.get(slot.id)!
    const current = dbBracketMap.get(slot.id)

    const changed = !current ||
      current.defined !== desired.defined ||
      current.home_team !== desired.home_team ||
      current.away_team !== desired.away_team

    if (changed) {
      bracketUpserts.push({
        match_id: desired.match_id,
        phase: desired.phase,
        position: desired.position,
        home_team: desired.home_team,
        away_team: desired.away_team,
        defined: desired.defined,
      })
      slotsToReset.push(desired.match_id)
    }

    // Contar slots definidos para el reporte
    if (desired.defined) {
      if (desired.phase === 'r32') report.r32Slots++
      else if (desired.phase === 'r16') report.r16Slots++
      else if (desired.phase === 'qf') report.qfSlots++
      else if (desired.phase === 'sf') report.sfSlots++
      else if (desired.phase === 'final') report.finalSlots++
      else if (desired.phase === 'third') report.thirdSlots++
    }
  }

  // Realizar upserts de bracket
  if (bracketUpserts.length > 0) {
    const { error: bracketError } = await supabase
      .from('bracket')
      .upsert(bracketUpserts, { onConflict: 'match_id' })

    if (bracketError) {
      report.errors.push(`Error al guardar bracket: ${bracketError.message}`)
    } else {
      // Para los slots que cambiaron, resetear resultados, predicciones y submissions
      const phasesToUnlock = new Set<string>()

      for (const matchId of slotsToReset) {
        // A. Resetear resultado real
        const { error: resultError } = await supabase
          .from('results')
          .upsert({
            match_id: matchId,
            phase: BRACKET_SLOTS.find(s => s.id === matchId)!.phase,
            home_score: null,
            away_score: null,
            home_score_120: null,
            away_score_120: null,
            went_to_pens: false,
            pen_winner: null,
            status: 'scheduled',
            api_home_score: null,
            api_away_score: null,
            api_home_score_120: null,
            api_away_score_120: null,
            manual_override: false,
            corrected_by: null,
            corrected_at: null,
          }, { onConflict: 'match_id' })

        if (resultError) {
          report.errors.push(`Error al resetear resultado para ${matchId}: ${resultError.message}`)
        }

        // B. Borrar predicciones de usuarios para este partido
        const { error: predError } = await supabase
          .from('predictions')
          .delete()
          .eq('match_id', matchId)

        if (predError) {
          report.errors.push(`Error al borrar predicciones para ${matchId}: ${predError.message}`)
        }

        // C. Determinar fase de envío a desbloquear
        if (matchId === 'R32_1') {
          phasesToUnlock.add('r32_first')
        } else {
          phasesToUnlock.add('r32_rest')
        }
      }

      // D. Borrar submissions para desbloquear envío de predicciones
      if (phasesToUnlock.size > 0) {
        const { error: subError } = await supabase
          .from('submissions')
          .delete()
          .in('phase', Array.from(phasesToUnlock))

        if (subError) {
          report.errors.push(`Error al desbloquear envíos para las fases ${Array.from(phasesToUnlock).join(', ')}: ${subError.message}`)
        }
      }
    }
  }

  // Asegurar que exista una fila en results para todos los slots definidos (por si acaso)
  for (const slot of BRACKET_SLOTS) {
    const desired = inMemoryBracket.get(slot.id)!
    if (desired.defined) {
      await ensureResultRow(supabase, desired.match_id, desired.phase)
    }
  }

  return report
}
