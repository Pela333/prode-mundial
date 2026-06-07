/**
 * Cálculo de posiciones de un grupo según reglamento FIFA Mundial 2026.
 *
 * Orden de criterios (Reglamento Oficial FIFA Mundial 2026):
 *   Para equipos empatados en puntos generales del grupo:
 *   1. Puntos en enfrentamientos directos entre los equipos empatados
 *   2. Diferencia de goles en enfrentamientos directos
 *   3. Goles a favor en enfrentamientos directos
 *   4. Diferencia de goles en todos los partidos del grupo
 *   5. Goles a favor en todos los partidos del grupo
 *   6. Fair Play / Conducta (omitido localmente para predicciones)
 *   7. Clasificación Mundial FIFA (se aplica como último desempate determinístico)
 *      (en caso de persistir empate, se usa el orden alfabético)
 */

import type { Match } from './fixture'
import { FIFA_RANKINGS } from './fixture'

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
  played?: number
  won?: number
  drawn?: number
  lost?: number
  ga?: number
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
/**
 * Resuelve el orden dentro de un grupo (o subgrupo de empatados) aplicando los
 * criterios FIFA de forma recursiva.
 *
 * Pasos:
 *   1. 'h2h': compara por puntos, DG y GF en enfrentamientos directos entre el subgrupo.
 *      Si se logra separar a algún equipo, se vuelve a aplicar H2H recursivamente a los subgrupos.
 *      Si ningún equipo se separa, se avanza al paso 'overall'.
 *   2. 'overall': compara por diferencia de goles (DG) y goles a favor (GF) en todos los partidos.
 *      Si se logra separar a algún equipo, se vuelve a aplicar H2H recursivamente a los subgrupos.
 *      Si ningún equipo se separa, se avanza al paso 'fifa_ranking'.
 *   3. 'fifa_ranking': ordena según la clasificación oficial de la FIFA (como fallback final).
 */
function rankBucketRecursive(
  bucket: TeamStats[],
  allMatches: GroupMatch[],
  step: 'h2h' | 'overall' | 'fifa_ranking'
): TeamStats[] {
  if (bucket.length <= 1) return bucket

  if (step === 'fifa_ranking') {
    return [...bucket].sort((a, b) => {
      const rA = FIFA_RANKINGS[a.team] ?? 999
      const rB = FIFA_RANKINGS[b.team] ?? 999
      if (rA !== rB) return rA - rB
      return a.team.localeCompare(b.team, 'es')
    })
  }

  if (step === 'h2h') {
    const h2h = headToHeadStats(bucket.map(s => s.team), allMatches)
    const sorted = [...bucket].sort((a, b) => {
      const statsA = h2h.get(a.team)!
      const statsB = h2h.get(b.team)!
      if (statsA.points !== statsB.points) return statsB.points - statsA.points
      if (statsA.gd !== statsB.gd) return statsB.gd - statsA.gd
      if (statsA.gf !== statsB.gf) return statsB.gf - statsA.gf
      return 0
    })

    // Agrupar en sub-buckets de equipos que siguen empatados en puntos, GD y GF en H2H
    const subBuckets: TeamStats[][] = []
    let current: TeamStats[] = []
    for (const s of sorted) {
      if (current.length === 0) {
        current.push(s)
        continue
      }
      const prev = current[current.length - 1]
      const prevH2H = h2h.get(prev.team)!
      const sH2H = h2h.get(s.team)!
      const isTied = prevH2H.points === sH2H.points &&
                     prevH2H.gd === sH2H.gd &&
                     prevH2H.gf === sH2H.gf
      if (isTied) {
        current.push(s)
      } else {
        subBuckets.push(current)
        current = [s]
      }
    }
    if (current.length > 0) subBuckets.push(current)

    const result: TeamStats[] = []
    for (const sub of subBuckets) {
      if (sub.length === 1) {
        result.push(sub[0])
      } else if (sub.length < bucket.length) {
        // El subgrupo se redujo, aplicamos H2H recursivo sobre los que siguen empatados
        result.push(...rankBucketRecursive(sub, allMatches, 'h2h'))
      } else {
        // No se pudo separar a ningún equipo en H2H, avanzamos a estadísticas generales
        result.push(...rankBucketRecursive(sub, allMatches, 'overall'))
      }
    }
    return result
  }

  // step === 'overall'
  const sorted = [...bucket].sort((a, b) => {
    if (a.gd !== b.gd) return b.gd - a.gd
    if (a.gf !== b.gf) return b.gf - a.gf
    return 0
  })

  // Agrupar en sub-buckets de equipos que siguen empatados en DG y GF generales
  const subBuckets: TeamStats[][] = []
  let current: TeamStats[] = []
  for (const s of sorted) {
    if (current.length === 0) {
      current.push(s)
      continue
    }
    const prev = current[current.length - 1]
    const isTied = prev.gd === s.gd && prev.gf === s.gf
    if (isTied) {
      current.push(s)
    } else {
      subBuckets.push(current)
      current = [s]
    }
  }
  if (current.length > 0) subBuckets.push(current)

  const result: TeamStats[] = []
  for (const sub of subBuckets) {
    if (sub.length === 1) {
      result.push(sub[0])
    } else if (sub.length < bucket.length) {
      // El subgrupo se redujo, re-aplicamos H2H desde el principio para este subgrupo reducido
      result.push(...rankBucketRecursive(sub, allMatches, 'h2h'))
    } else {
      // Sigue el empate total, aplicamos fallback de Ranking FIFA
      result.push(...rankBucketRecursive(sub, allMatches, 'fifa_ranking'))
    }
  }
  return result
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

  // Orden primario: puntos únicamente
  list.sort((a, b) => b.points - a.points)

  // Agrupo equipos empatados únicamente por puntos.
  const buckets: TeamStats[][] = []
  let current: TeamStats[] = []
  for (const s of list) {
    if (current.length === 0) {
      current.push(s)
      continue
    }
    const prev = current[current.length - 1]
    if (prev.points === s.points) {
      current.push(s)
    } else {
      buckets.push(current)
      current = [s]
    }
  }
  if (current.length) buckets.push(current)

  const final: TeamStats[] = []
  for (const bucket of buckets) {
    final.push(...rankBucketRecursive(bucket, matches, 'h2h'))
  }

  return final.slice(0, 4).map((s, i) => ({
    position: (i + 1) as 1 | 2 | 3 | 4,
    team: s.team,
    points: s.points,
    gd: s.gd,
    gf: s.gf,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    ga: s.ga,
  }))
}

export function computeDetailedLiveStandings(
  teams: string[],
  matches: GroupMatch[]
): StandingRow[] | null {
  if (teams.length !== 4) return null
  
  // A diferencia de computeGroupStandings, esta función permite partidos parciales
  const validMatches = matches.filter(
    m => Number.isInteger(m.home) && Number.isInteger(m.away) && m.home >= 0 && m.away >= 0
  )

  const stats = computeStats(teams, validMatches)
  const list = [...stats.values()]

  // Orden primario: puntos únicamente
  list.sort((a, b) => b.points - a.points)

  // Agrupamos equipos empatados únicamente por puntos (usando solo los partidos válidos)
  const buckets: TeamStats[][] = []
  let current: TeamStats[] = []
  for (const s of list) {
    if (current.length === 0) {
      current.push(s)
      continue
    }
    const prev = current[current.length - 1]
    if (prev.points === s.points) {
      current.push(s)
    } else {
      buckets.push(current)
      current = [s]
    }
  }
  if (current.length) buckets.push(current)

  const final: TeamStats[] = []
  for (const bucket of buckets) {
    final.push(...rankBucketRecursive(bucket, validMatches, 'h2h'))
  }

  return final.slice(0, 4).map((s, i) => ({
    position: (i + 1) as 1 | 2 | 3 | 4,
    team: s.team,
    points: s.points,
    gd: s.gd,
    gf: s.gf,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    ga: s.ga,
  }))
}
