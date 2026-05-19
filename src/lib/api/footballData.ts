/**
 * Cliente para Football-Data.org v4.
 *
 * - Autenticación: header `X-Auth-Token`.
 * - Rate limit: el plan free permite 10 req/min. La API devuelve
 *   `X-Requests-Available-Minute` en cada respuesta; si llega a 0,
 *   esperamos a que se reinicie según `X-RequestCounter-Reset` (segundos).
 * - Sin reintentos automáticos: el llamador decide si reintenta.
 */

const BASE_URL = 'https://api.football-data.org/v4'

export interface ApiTeam {
  id: number | null
  name: string | null
  shortName: string | null
  tla: string | null
  crest: string | null
}

export interface ApiScore {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
  fullTime: { home: number | null; away: number | null }
  halfTime: { home: number | null; away: number | null }
  // En algunos partidos con prórroga viene también `extraTime` (mismo shape).
  extraTime?: { home: number | null; away: number | null }
  // Tanda de penales — sólo cuando duration === 'PENALTY_SHOOTOUT'
  penalties?: { home: number | null; away: number | null }
}

export type ApiStage =
  | 'GROUP_STAGE'
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL'

export interface ApiMatch {
  id: number
  utcDate: string
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'SUSPENDED' | 'CANCELLED'
  stage: ApiStage
  group: string | null              // 'GROUP_A'..'GROUP_L' o null
  matchday: number | null
  homeTeam: ApiTeam
  awayTeam: ApiTeam
  score: ApiScore
}

export interface ApiMatchesResponse {
  matches: ApiMatch[]
  resultSet?: { count?: number }
}

export interface ApiStandingsResponse {
  standings: {
    stage: ApiStage
    type: 'TOTAL' | 'HOME' | 'AWAY'
    group: string | null
    table: {
      position: number
      team: ApiTeam
      playedGames: number
      won: number
      draw: number
      lost: number
      points: number
      goalsFor: number
      goalsAgainst: number
      goalDifference: number
    }[]
  }[]
}

export interface RateLimitInfo {
  remainingPerMinute: number | null
  resetInSeconds: number | null
}

export class FootballDataError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
  ) { super(message); this.name = 'FootballDataError' }
}

function getApiKey(): string {
  const k = process.env.FOOTBALL_DATA_API_KEY
  if (!k) throw new Error('FOOTBALL_DATA_API_KEY no está configurada en el entorno')
  return k
}

async function fetchJson<T>(endpoint: string): Promise<{ data: T; rate: RateLimitInfo }> {
  const url = `${BASE_URL}${endpoint}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Auth-Token': getApiKey(),
      'Accept': 'application/json',
    },
    // No cachear en Next: queremos siempre datos frescos al sincronizar
    cache: 'no-store',
  })

  const rate: RateLimitInfo = {
    remainingPerMinute: parseHeader(res.headers.get('X-Requests-Available-Minute')),
    resetInSeconds: parseHeader(res.headers.get('X-RequestCounter-Reset')),
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new FootballDataError(
      `HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      endpoint,
    )
  }

  const data = await res.json() as T
  return { data, rate }
}

function parseHeader(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Trae todos los partidos del Mundial 2026. */
export async function fetchWorldCupMatches() {
  return fetchJson<ApiMatchesResponse>('/competitions/WC/matches?season=2026')
}

/** Trae los standings (posiciones) del Mundial 2026. */
export async function fetchWorldCupStandings() {
  return fetchJson<ApiStandingsResponse>('/competitions/WC/standings?season=2026')
}
