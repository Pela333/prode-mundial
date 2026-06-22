/**
 * Módulo de sincronización con Football-Data.org.
 *
 * Llama a la API, mapea equipos y stages a la convención interna,
 * y persiste en `results`, `bracket` y `group_standings`.
 *
 * Después de actualizar resultados, dispara el recálculo de puntos
 * para todas las predicciones afectadas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchWorldCupMatches,
  fetchWorldCupStandings,
  type ApiMatch,
  FootballDataError,
} from './footballData'
import { apiTeamToFixture } from './teamMap'
import {
  GROUPS,
  MATCHES,
  BRACKET_SLOTS,
  API_STAGE_TO_PHASE,
  type Phase,
  type Match,
} from '@/lib/fixture'
import { recalcPointsForMatch, recalcGroupPositionBonus } from './recalc'

export interface SyncReport {
  startedAt: string
  finishedAt: string
  ok: boolean
  fromCache: boolean
  groupMatchesUpdated: number
  bracketSlotsUpdated: number
  groupStandingsUpdated: number
  recalculatedPredictions: number
  errors: string[]
}

/** TTL del caché en segundos (4 minutos). */
const CACHE_TTL_SECONDS = 4 * 60

/** Lee el último SyncReport cacheado. Devuelve null si no existe o expiró. */
async function readSyncCache(supabase: SupabaseClient): Promise<SyncReport | null> {
  const { data, error } = await supabase
    .from('sync_cache')
    .select('cached_at, payload')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return null
  const ageSeconds = (Date.now() - new Date(data.cached_at).getTime()) / 1000
  if (ageSeconds > CACHE_TTL_SECONDS) return null
  return data.payload as SyncReport
}

/** Persiste el SyncReport en la tabla singleton sync_cache. */
async function writeSyncCache(supabase: SupabaseClient, report: SyncReport): Promise<void> {
  await supabase
    .from('sync_cache')
    .upsert({ id: 1, cached_at: new Date().toISOString(), payload: report }, { onConflict: 'id' })
}

const STAGE_API_TO_PHASE = API_STAGE_TO_PHASE

function buildGroupMatchKey(group: string, home: string, away: string): string {
  return `${group}|${home}|${away}`
}

/** Indexa los partidos del fixture por (group, home, away) para mapear contra la API. */
function buildGroupMatchIndex(): Map<string, Match> {
  const idx = new Map<string, Match>()
  for (const m of MATCHES) {
    if (m.phase !== 'group') continue
    idx.set(buildGroupMatchKey(m.group, m.home, m.away), m)
  }
  return idx
}

/** Indexa BRACKET_SLOTS por (phase, position). */
function buildBracketIndex(): Map<string, { id: string; phase: Phase; position: number }> {
  const idx = new Map<string, { id: string; phase: Phase; position: number }>()
  for (const slot of BRACKET_SLOTS) {
    idx.set(`${slot.phase}|${slot.position}`, slot)
  }
  return idx
}

/**
 * Convierte un partido de la API en un payload normalizado para upsertear en `results`.
 */
function apiMatchToResult(
  m: ApiMatch,
  matchId: string,
  phase: Phase,
  overriddenMap: Map<string, any>,
  isInverted = false
) {
  const finished = m.status === 'FINISHED'
  const went_to_pens = finished && m.score.duration === 'PENALTY_SHOOTOUT'

  // 90' (regular time) — para fase de grupos: el resultado oficial
  // En la API, score.fullTime es siempre el resultado final (incluyendo prórroga si la hubo).
  // Para 90' real, deberíamos usar score.regularTime, pero la API v4 no lo expone consistentemente.
  // Convención: score.fullTime cuando duration === 'REGULAR' es 90'; cuando es 'EXTRA_TIME' o 'PENALTY_SHOOTOUT'
  // entonces score.fullTime es el resultado a 120' (incluyendo prórroga). El score a 90' no se publica.
  // Si los equipos están invertidos respecto a nuestro fixture local, intercambiamos los goles.
  const home_full = isInverted ? (m.score.fullTime?.away ?? null) : (m.score.fullTime?.home ?? null)
  const away_full = isInverted ? (m.score.fullTime?.home ?? null) : (m.score.fullTime?.away ?? null)

  let isOverridden = overriddenMap.has(matchId)
  const o = overriddenMap.get(matchId)

  // Safety guard: si el override tiene estado 'scheduled' y no tiene goles, lo ignoramos y dejamos que la API lo actualice
  if (isOverridden && o) {
    const isPlaceholder =
      o.status === 'scheduled' &&
      o.home_score === null &&
      o.away_score === null &&
      o.home_score_120 === null &&
      o.away_score_120 === null
    if (isPlaceholder) {
      isOverridden = false
    }
  }

  let home_score: number | null = null
  let away_score: number | null = null
  let home_score_120: number | null = null
  let away_score_120: number | null = null
  let pen_winner: string | null = null
  let went_to_pens_val = went_to_pens
  let status_val = finished ? 'finished'
                  : m.status === 'IN_PLAY' || m.status === 'PAUSED' ? 'in_progress'
                  : 'scheduled'

  if (isOverridden && o) {
    home_score = o.home_score
    away_score = o.away_score
    home_score_120 = o.home_score_120
    away_score_120 = o.away_score_120
    went_to_pens_val = o.went_to_pens
    pen_winner = o.pen_winner
    status_val = o.status
  } else {
    if (phase === 'group') {
      home_score = home_full
      away_score = away_full
    } else {
      home_score_120 = home_full
      away_score_120 = away_full
    }

    // Detección de pen_winner (sólo si duration === PENALTY_SHOOTOUT)
    if (went_to_pens && m.score.penalties) {
      if (m.score.penalties.home != null && m.score.penalties.away != null) {
        if (m.score.penalties.home > m.score.penalties.away) {
          pen_winner = apiTeamToFixture(m.homeTeam.name)
        } else if (m.score.penalties.away > m.score.penalties.home) {
          pen_winner = apiTeamToFixture(m.awayTeam.name)
        }
      } else if (m.score.winner === 'HOME_TEAM') {
        pen_winner = apiTeamToFixture(m.homeTeam.name)
      } else if (m.score.winner === 'AWAY_TEAM') {
        pen_winner = apiTeamToFixture(m.awayTeam.name)
      }
    }
  }

  return {
    match_id: matchId,
    phase,
    home_score,
    away_score,
    home_score_120,
    away_score_120,
    went_to_pens: went_to_pens_val,
    pen_winner,
    status: status_val,
    manual_override: isOverridden,
    api_home_score: phase === 'group' ? home_full : null,
    api_away_score: phase === 'group' ? away_full : null,
    api_home_score_120: phase === 'group' ? null : home_full,
    api_away_score_120: phase === 'group' ? null : away_full,
  }
}

/**
 * Sincronización principal: trae matches y standings, persiste, recalcula puntos.
 *
 * Recibe un SupabaseClient (admin con service_role) para bypassear RLS.
 */
export async function syncFromApi(
  supabase: SupabaseClient,
  /** Si es true, omite el caché y siempre ejecuta el sync completo. */
  { bypassCache = false }: { bypassCache?: boolean } = {},
): Promise<SyncReport> {
  // ── Caché: si el último sync es reciente, devolver sin llamar a la API ──
  if (!bypassCache) {
    const cached = await readSyncCache(supabase)
    if (cached) {
      return { ...cached, fromCache: true }
    }
  }

  const report: SyncReport = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    ok: false,
    fromCache: false,
    groupMatchesUpdated: 0,
    bracketSlotsUpdated: 0,
    groupStandingsUpdated: 0,
    recalculatedPredictions: 0,
    errors: [],
  }

  // Cargar overrides manuales existentes para no pisarlos
  const { data: overridden } = await supabase
    .from('results')
    .select('match_id, home_score, away_score, home_score_120, away_score_120, went_to_pens, pen_winner, status')
    .eq('manual_override', true)
  const overriddenMap = new Map((overridden ?? []).map(r => [r.match_id, r]))

  let matchesPayload: ApiMatch[] = []
  let standingsTables: Awaited<ReturnType<typeof fetchWorldCupStandings>>['data']['standings'] = []

  // 1) Fetch matches
  try {
    const { data } = await fetchWorldCupMatches()
    matchesPayload = data.matches
  } catch (err) {
    const msg = err instanceof FootballDataError
      ? `matches: HTTP ${err.status} ${err.message}`
      : `matches: ${(err as Error).message}`
    report.errors.push(msg)
    await logApiError(supabase, '/competitions/WC/matches', msg, err instanceof FootballDataError ? err.status : null)
  }

  // 2) Fetch standings (no fatal si falla)
  try {
    const { data } = await fetchWorldCupStandings()
    standingsTables = data.standings
  } catch (err) {
    const msg = err instanceof FootballDataError
      ? `standings: HTTP ${err.status} ${err.message}`
      : `standings: ${(err as Error).message}`
    report.errors.push(msg)
    await logApiError(supabase, '/competitions/WC/standings', msg, err instanceof FootballDataError ? err.status : null)
  }

  if (matchesPayload.length === 0) {
    // Sin matches no podemos hacer nada útil
    await markSync(supabase, report.errors.length === 0 ? 'ok' : 'error')
    report.finishedAt = new Date().toISOString()
    return report
  }

  // 3) Procesar partidos
  const groupIdx = buildGroupMatchIndex()
  const bracketIdx = buildBracketIndex()

  // Las stages eliminatorias se ordenan por utcDate ascendente para asignar position 1..N
  const matchesByStage = new Map<string, ApiMatch[]>()
  for (const m of matchesPayload) {
    const stage = m.stage as string
    if (stage === 'GROUP_STAGE') continue
    if (!matchesByStage.has(stage)) matchesByStage.set(stage, [])
    matchesByStage.get(stage)!.push(m)
  }
  for (const list of matchesByStage.values()) {
    list.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
  }

  // Mapeo apiMatchId → fixtureMatchId (necesario para luego asociar predictions)
  const matchIdMap = new Map<number, string>()

  // 3a) Group matches → results
  const groupResults: ReturnType<typeof apiMatchToResult>[] = []
  for (const m of matchesPayload) {
    if (m.stage !== 'GROUP_STAGE') continue
    const homeName = apiTeamToFixture(m.homeTeam.name)
    const awayName = apiTeamToFixture(m.awayTeam.name)
    if (!homeName || !awayName) {
      report.errors.push(`Equipo desconocido en partido API ${m.id}: ${m.homeTeam.name} vs ${m.awayTeam.name}`)
      continue
    }
    const groupLetter = (m.group ?? '').replace('GROUP_', '')
    // El fixture local pudo haber definido los partidos con orden home/away invertido
    // respecto a la API; intentamos ambas orientaciones.
    const fixtureMatch =
      groupIdx.get(buildGroupMatchKey(groupLetter, homeName, awayName)) ??
      groupIdx.get(buildGroupMatchKey(groupLetter, awayName, homeName))
    if (!fixtureMatch) {
      report.errors.push(`No se encontró match en fixture para ${groupLetter} ${homeName} vs ${awayName}`)
      continue
    }
    const isInverted = fixtureMatch.home !== homeName
    matchIdMap.set(m.id, fixtureMatch.id)
    groupResults.push(apiMatchToResult(m, fixtureMatch.id, 'group', overriddenMap, isInverted))
  }

  if (groupResults.length > 0) {
    const { error } = await supabase.from('results').upsert(groupResults, { onConflict: 'match_id' })
    if (error) {
      report.errors.push(`upsert results (group): ${error.message}`)
    } else {
      report.groupMatchesUpdated = groupResults.length
    }
  }

  // 3b) Bracket / eliminatoria → bracket + results
  const bracketUpserts: {
    match_id: string; phase: Phase; position: number
    home_team: string | null; away_team: string | null
    scheduled_at: string | null; defined: boolean
  }[] = []
  const elimResults: ReturnType<typeof apiMatchToResult>[] = []

  for (const [stage, list] of matchesByStage) {
    const phase = STAGE_API_TO_PHASE[stage]
    if (!phase) continue

    list.forEach((m, i) => {
      const position = i + 1
      const slot = bracketIdx.get(`${phase}|${position}`)
      if (!slot) return

      const home = apiTeamToFixture(m.homeTeam.name)
      const away = apiTeamToFixture(m.awayTeam.name)
      const defined = !!(home && away)

      matchIdMap.set(m.id, slot.id)

      bracketUpserts.push({
        match_id: slot.id,
        phase,
        position,
        home_team: home,
        away_team: away,
        scheduled_at: m.utcDate,
        defined,
      })

      // Sólo persistimos result si el partido tiene equipos definidos (sino no tiene sentido)
      if (defined) {
        elimResults.push(apiMatchToResult(m, slot.id, phase, overriddenMap))
      }
    })
  }

  if (bracketUpserts.length > 0) {
    const { error } = await supabase.from('bracket').upsert(bracketUpserts, { onConflict: 'match_id' })
    if (error) report.errors.push(`upsert bracket: ${error.message}`)
    else report.bracketSlotsUpdated = bracketUpserts.length
  }

  if (elimResults.length > 0) {
    const { error } = await supabase.from('results').upsert(elimResults, { onConflict: 'match_id' })
    if (error) report.errors.push(`upsert results (elim): ${error.message}`)
  }

  // 3c) Group standings (snapshot)
  const standingsUpserts: { group_id: string; position: number; team: string; finalized: boolean }[] = []
  for (const t of standingsTables) {
    if (t.stage !== 'GROUP_STAGE' || t.type !== 'TOTAL' || !t.group) continue
    const groupLetter = t.group.replace('GROUP_', '')
    if (!GROUPS.find(g => g.id === groupLetter)) continue
    // ¿La fase de grupos terminó? (todos los partidos del grupo en estado finished)
    const groupApiMatches = matchesPayload.filter(
      m => m.stage === 'GROUP_STAGE' && (m.group ?? '').replace('GROUP_', '') === groupLetter
    )
    const finalized = groupApiMatches.length > 0 && groupApiMatches.every(m => m.status === 'FINISHED')

    for (const row of t.table.slice(0, 4)) {
      const team = apiTeamToFixture(row.team.name)
      if (!team) continue
      standingsUpserts.push({
        group_id: groupLetter,
        position: row.position,
        team,
        finalized,
      })
    }
  }

  if (standingsUpserts.length > 0) {
    const { error } = await supabase.from('group_standings').upsert(standingsUpserts, { onConflict: 'group_id,position' })
    if (error) report.errors.push(`upsert group_standings: ${error.message}`)
    else report.groupStandingsUpdated = standingsUpserts.length
  }

  // 3d) Detectar y setear deadlines automáticas de eliminatoria (Fase 2.1 y 2.2)
  await maybeUpdateR32Deadlines(supabase, bracketUpserts)

  // 4) Recalcular puntos para los partidos que se actualizaron
  const allUpdatedMatchIds = [...groupResults, ...elimResults].map(r => r.match_id)
  for (const matchId of allUpdatedMatchIds) {
    try {
      const n = await recalcPointsForMatch(supabase, matchId)
      report.recalculatedPredictions += n
    } catch (err) {
      report.errors.push(`recalc ${matchId}: ${(err as Error).message}`)
    }
  }

  // 4b) Recalcular bonus de posiciones de grupo (sólo aplica si la fase ya cerró)
  try {
    await recalcGroupPositionBonus(supabase)
  } catch (err) {
    report.errors.push(`recalcGroupPositionBonus: ${(err as Error).message}`)
  }

  await markSync(supabase, report.errors.length === 0 ? 'ok' : 'error')
  report.ok = report.errors.length === 0
  report.finishedAt = new Date().toISOString()

  // ── Actualizar caché con el resultado fresco ──
  await writeSyncCache(supabase, report)

  return report
}

async function logApiError(
  supabase: SupabaseClient,
  endpoint: string,
  message: string,
  status: number | null,
) {
  await supabase.from('api_errors').insert({
    provider: 'football-data',
    endpoint,
    status_code: status,
    error_message: message.slice(0, 500),
  })
}

async function markSync(supabase: SupabaseClient, status: 'ok' | 'error') {
  await supabase
    .from('app_config')
    .update({ last_sync_at: new Date().toISOString(), last_sync_status: status })
    .eq('id', 1)
}

/**
 * Si el bracket está suficientemente definido, computa y guarda las deadlines:
 *  - r32_first_deadline = 1h antes del partido R32_1 (si está definido)
 *  - r32_rest_deadline  = 1h antes del partido R32_2 (si están los 16 cruces definidos)
 *
 * Sólo actualiza si los valores cambiaron.
 */
export async function maybeUpdateR32Deadlines(
  supabase: SupabaseClient,
  bracket: { match_id: string; phase: Phase; position: number; defined: boolean; scheduled_at: string | null }[],
) {
  const r32 = bracket.filter(b => b.phase === 'r32').sort((a, b) => a.position - b.position)
  if (r32.length === 0) return

  const r32_1 = r32.find(b => b.position === 1)
  const allR32Defined = r32.length === 16 && r32.every(b => b.defined)

  const updates: Record<string, string | null> = {}
  if (r32_1?.defined && r32_1.scheduled_at) {
    const t = new Date(r32_1.scheduled_at).getTime() - 60 * 60 * 1000
    updates.r32_first_deadline = new Date(t).toISOString()
  }
  if (allR32Defined) {
    const r32_2 = r32.find(b => b.position === 2)
    if (r32_2?.scheduled_at) {
      const t = new Date(r32_2.scheduled_at).getTime() - 60 * 60 * 1000
      updates.r32_rest_deadline = new Date(t).toISOString()
    }
  }

  if (Object.keys(updates).length === 0) return
  await supabase.from('app_config').update(updates).eq('id', 1)
}
