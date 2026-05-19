/**
 * Cálculo de posiciones de un grupo según reglamento FIFA Mundial 2026.
 *
 * Orden de criterios:
 *   1. Puntos (V=3, E=1, D=0)
 *   2. Diferencia de goles (en todos los partidos del grupo)
 *   3. Goles a favor (en todos los partidos del grupo)
 *   4. Enfrentamiento directo entre los equipos empatados: puntos
 *   5. Enfrentamiento directo: DG
 *   6. Enfrentamiento directo: GF
 *   7. Sorteo — fallback determinístico por orden alfabético del nombre del equipo
 *      (no es configurable por el usuario, pero usamos orden estable para no
 *       romper invariantes; el sorteo real lo determina la FIFA)
 */

import type { Match } from './fixture'

export interface GroupMatch {
  match: Match
  home: number
  away: number
}

export interface TeamStats {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

export interface StandingRow {
  position: 1 | 2 | 3 | 4
  team: string
  points: number
  gd: number
  gf: number
}

function emptyStats(team: string): TeamStats {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }
}

function applyMatchToStats(stats: TeamStats, gf: number, ga: number) {
  stats.played += 1
  stats.gf += gf
  stats.ga += ga
  stats.gd = stats.gf - stats.ga
  if (gf > ga) { stats.won += 1; stats.points += 3 }
  else if (gf === ga) { stats.drawn += 1; stats.points += 1 }
  else { stats.lost += 1 }
}

/**
 * Calcula stats overall para cada equipo del grupo a partir de los 6 partidos.
 */
function computeStats(teams: string[], matches: GroupMatch[]): Map<string, TeamStats> {
  const stats = new Map<string, TeamStats>()
  for (const t of teams) stats.set(t, emptyStats(t))

  for (const { match, home, away } of matches) {
    const sh = stats.get(match.home)
    const sa = stats.get(match.away)
    if (!sh || !sa) continue
    applyMatchToStats(sh, home, away)
    applyMatchToStats(sa, away, home)
  }

  return stats
}

/**
 * Mini-tabla aplicada SÓLO a los partidos entre los equipos del subconjunto dado.
 * Usada para los criterios de enfrentamiento directo.
 */
function headToHeadStats(subset: string[], matches: GroupMatch[]): Map<string, TeamStats> {
  const stats = new Map<string, TeamStats>()
  for (const t of subset) stats.set(t, emptyStats(t))

  for (const { match, home, away } of matches) {
    if (!subset.includes(match.home) || !subset.includes(match.away)) continue
    const sh = stats.get(match.home)!
    const sa = stats.get(match.away)!
    applyMatchToStats(sh, home, away)
    applyMatchToStats(sa, away, home)
  }

  return stats
}

/**
 * Compara dos equipos por DG y GF en la mini-tabla del subset empatado.
 * Retorna negativo si a va antes que b, positivo si b va antes, 0 si siguen empatados.
 */
function compareHeadToHead(a: TeamStats, b: TeamStats): number {
  if (a.points !== b.points) return b.points - a.points
  if (a.gd !== b.gd) return b.gd - a.gd
  if (a.gf !== b.gf) return b.gf - a.gf
  return 0
}

/**
 * Resuelve el orden dentro de un grupo (o subgrupo de empatados) aplicando los
 * criterios FIFA de forma recursiva.
 */
function rankBucket(bucket: TeamStats[], allMatches: GroupMatch[]): TeamStats[] {
  if (bucket.length <= 1) return bucket

  // Si todos los equipos del bucket están empatados en puntos/DG/GF de la tabla
  // overall, pasamos al criterio de enfrentamiento directo (mini-tabla del bucket).
  const h2hStats = headToHeadStats(bucket.map(s => s.team), allMatches)

  const sorted = [...bucket].sort((a, b) => {
    const ah = h2hStats.get(a.team)!
    const bh = h2hStats.get(b.team)!
    const cmp = compareHeadToHead(ah, bh)
    if (cmp !== 0) return cmp
    // Fallback determinístico: orden alfabético
    return a.team.localeCompare(b.team, 'es')
  })

  // Si tras el head-to-head sigue habiendo empate en grupos de 2+ equipos,
  // la lógica anterior ya aplicó alfabético — orden estable garantizado.
  return sorted
}

/**
 * Función principal: dado el conjunto de partidos pronosticados de un grupo,
 * retorna las posiciones 1-4 aplicando los criterios FIFA.
 *
 * Requiere los 6 partidos completos. Si falta alguno, retorna null.
 */
export function computeGroupStandings(
  teams: string[],
  matches: GroupMatch[]
): StandingRow[] | null {
  if (teams.length !== 4) return null
  if (matches.length !== 6) return null
  for (const m of matches) {
    if (!Number.isInteger(m.home) || !Number.isInteger(m.away)) return null
    if (m.home < 0 || m.away < 0) return null
  }

  const stats = computeStats(teams, matches)
  const list = [...stats.values()]

  // Orden primario: puntos → DG overall → GF overall
  list.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points
    if (a.gd !== b.gd) return b.gd - a.gd
    if (a.gf !== b.gf) return b.gf - a.gf
    return 0
  })

  // Agrupo equipos empatados (mismo points/gd/gf) y reordeno por head-to-head.
  const buckets: TeamStats[][] = []
  let current: TeamStats[] = []
  for (const s of list) {
    if (current.length === 0) {
      current.push(s)
      continue
    }
    const prev = current[current.length - 1]
    if (prev.points === s.points && prev.gd === s.gd && prev.gf === s.gf) {
      current.push(s)
    } else {
      buckets.push(current)
      current = [s]
    }
  }
  if (current.length) buckets.push(current)

  const final: TeamStats[] = []
  for (const bucket of buckets) {
    final.push(...rankBucket(bucket, matches))
  }

  return final.slice(0, 4).map((s, i) => ({
    position: (i + 1) as 1 | 2 | 3 | 4,
    team: s.team,
    points: s.points,
    gd: s.gd,
    gf: s.gf,
  }))
}
