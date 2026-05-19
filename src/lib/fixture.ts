export type Group = {
  id: string
  name: string
  teams: string[]
}

/**
 * Fases del Mundial 2026 (48 equipos).
 *  - 'group'  = fase de grupos
 *  - 'r32'    = 16avos de final (LAST_32 en la API) → 16 partidos
 *  - 'r16'    = 8vos de final  (LAST_16)            →  8 partidos
 *  - 'qf'     = cuartos        (QUARTER_FINALS)     →  4 partidos
 *  - 'sf'     = semifinales    (SEMI_FINALS)        →  2 partidos
 *  - 'third'  = tercer puesto                       →  1 partido
 *  - 'final'  = final                               →  1 partido
 */
export type Phase = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'

export type Match = {
  id: string
  group: string
  phase: Phase
  home: string
  away: string
  date: string
  venue: string
  city: string
}

/**
 * Slot del cuadro eliminatorio. Sin equipos hasta que la API confirma los cruces.
 * IDs fijos: R32_1..R32_16, R16_1..R16_8, QF_1..QF_4, SF_1, SF_2, THIRD, FINAL.
 */
export type BracketSlot = {
  id: string
  phase: Exclude<Phase, 'group'>
  position: number                    // orden dentro de su fase (1-indexed)
}

/** ISO 3166-1 alpha-2 codes for flagcdn.com */
export const TEAM_CODES: Record<string, string> = {
  'México': 'mx', 'Sudáfrica': 'za', 'Corea del Sur': 'kr', 'Rep. Checa': 'cz',
  'Canadá': 'ca', 'Bosnia y Herzegovina': 'ba', 'Qatar': 'qa', 'Suiza': 'ch',
  'Brasil': 'br', 'Marruecos': 'ma', 'Haití': 'ht', 'Escocia': 'gb-sct',
  'Estados Unidos': 'us', 'Paraguay': 'py', 'Australia': 'au', 'Turquía': 'tr',
  'Alemania': 'de', 'Curazao': 'cw', 'Costa de Marfil': 'ci', 'Ecuador': 'ec',
  'Países Bajos': 'nl', 'Japón': 'jp', 'Suecia': 'se', 'Túnez': 'tn',
  'Bélgica': 'be', 'Egipto': 'eg', 'Irán': 'ir', 'Nueva Zelanda': 'nz',
  'España': 'es', 'Cabo Verde': 'cv', 'Arabia Saudita': 'sa', 'Uruguay': 'uy',
  'Francia': 'fr', 'Senegal': 'sn', 'Irak': 'iq', 'Noruega': 'no',
  'Argentina': 'ar', 'Argelia': 'dz', 'Austria': 'at', 'Jordania': 'jo',
  'Portugal': 'pt', 'RD Congo': 'cd', 'Uzbekistán': 'uz', 'Colombia': 'co',
  'Inglaterra': 'gb-eng', 'Croacia': 'hr', 'Ghana': 'gh', 'Panamá': 'pa',
}

export function getFlagUrl(team: string): string {
  const code = TEAM_CODES[team]
  if (!code) return ''
  return `https://flagcdn.com/w40/${code}.png`
}

export const GROUPS: Group[] = [
  { id: 'A', name: 'Grupo A', teams: ['México', 'Sudáfrica', 'Corea del Sur', 'Rep. Checa'] },
  { id: 'B', name: 'Grupo B', teams: ['Canadá', 'Bosnia y Herzegovina', 'Qatar', 'Suiza'] },
  { id: 'C', name: 'Grupo C', teams: ['Brasil', 'Marruecos', 'Haití', 'Escocia'] },
  { id: 'D', name: 'Grupo D', teams: ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'] },
  { id: 'E', name: 'Grupo E', teams: ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'] },
  { id: 'F', name: 'Grupo F', teams: ['Países Bajos', 'Japón', 'Suecia', 'Túnez'] },
  { id: 'G', name: 'Grupo G', teams: ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'] },
  { id: 'H', name: 'Grupo H', teams: ['España', 'Cabo Verde', 'Arabia Saudita', 'Uruguay'] },
  { id: 'I', name: 'Grupo I', teams: ['Francia', 'Senegal', 'Irak', 'Noruega'] },
  { id: 'J', name: 'Grupo J', teams: ['Argentina', 'Argelia', 'Austria', 'Jordania'] },
  { id: 'K', name: 'Grupo K', teams: ['Portugal', 'RD Congo', 'Uzbekistán', 'Colombia'] },
  { id: 'L', name: 'Grupo L', teams: ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'] },
]

export const MATCHES: Match[] = [
  // GRUPO A
  { id: 'A1', group: 'A', phase: 'group', home: 'México', away: 'Sudáfrica', date: '2026-06-11T20:00:00-05:00', venue: 'Estadio Azteca', city: 'Ciudad de México' },
  { id: 'A2', group: 'A', phase: 'group', home: 'Corea del Sur', away: 'Rep. Checa', date: '2026-06-12T03:00:00-05:00', venue: 'Estadio Akron', city: 'Guadalajara' },
  { id: 'A3', group: 'A', phase: 'group', home: 'México', away: 'Rep. Checa', date: '2026-06-16T16:00:00-05:00', venue: 'Estadio Azteca', city: 'Ciudad de México' },
  { id: 'A4', group: 'A', phase: 'group', home: 'Sudáfrica', away: 'Corea del Sur', date: '2026-06-16T19:00:00-05:00', venue: 'Estadio Akron', city: 'Guadalajara' },
  { id: 'A5', group: 'A', phase: 'group', home: 'Sudáfrica', away: 'Rep. Checa', date: '2026-06-20T15:00:00-05:00', venue: 'Estadio Azteca', city: 'Ciudad de México' },
  { id: 'A6', group: 'A', phase: 'group', home: 'Corea del Sur', away: 'México', date: '2026-06-20T15:00:00-05:00', venue: 'Estadio Akron', city: 'Guadalajara' },
  // GRUPO B
  { id: 'B1', group: 'B', phase: 'group', home: 'Canadá', away: 'Bosnia y Herzegovina', date: '2026-06-12T20:00:00-05:00', venue: 'BMO Field', city: 'Toronto' },
  { id: 'B2', group: 'B', phase: 'group', home: 'Qatar', away: 'Suiza', date: '2026-06-13T14:00:00-05:00', venue: 'BC Place', city: 'Vancouver' },
  { id: 'B3', group: 'B', phase: 'group', home: 'Canadá', away: 'Suiza', date: '2026-06-17T17:00:00-05:00', venue: 'BMO Field', city: 'Toronto' },
  { id: 'B4', group: 'B', phase: 'group', home: 'Bosnia y Herzegovina', away: 'Qatar', date: '2026-06-17T20:00:00-05:00', venue: 'BC Place', city: 'Vancouver' },
  { id: 'B5', group: 'B', phase: 'group', home: 'Bosnia y Herzegovina', away: 'Suiza', date: '2026-06-21T15:00:00-05:00', venue: 'BMO Field', city: 'Toronto' },
  { id: 'B6', group: 'B', phase: 'group', home: 'Qatar', away: 'Canadá', date: '2026-06-21T15:00:00-05:00', venue: 'BC Place', city: 'Vancouver' },
  // GRUPO C
  { id: 'C1', group: 'C', phase: 'group', home: 'Brasil', away: 'Marruecos', date: '2026-06-13T17:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'C2', group: 'C', phase: 'group', home: 'Haití', away: 'Escocia', date: '2026-06-13T20:00:00-05:00', venue: 'Rose Bowl', city: 'Los Ángeles' },
  { id: 'C3', group: 'C', phase: 'group', home: 'Brasil', away: 'Haití', date: '2026-06-17T14:00:00-05:00', venue: 'Rose Bowl', city: 'Los Ángeles' },
  { id: 'C4', group: 'C', phase: 'group', home: 'Marruecos', away: 'Escocia', date: '2026-06-18T17:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'C5', group: 'C', phase: 'group', home: 'Marruecos', away: 'Haití', date: '2026-06-22T15:00:00-05:00', venue: 'Rose Bowl', city: 'Los Ángeles' },
  { id: 'C6', group: 'C', phase: 'group', home: 'Escocia', away: 'Brasil', date: '2026-06-22T15:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  // GRUPO D
  { id: 'D1', group: 'D', phase: 'group', home: 'Estados Unidos', away: 'Paraguay', date: '2026-06-12T21:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
  { id: 'D2', group: 'D', phase: 'group', home: 'Australia', away: 'Turquía', date: '2026-06-13T11:00:00-05:00', venue: "Levi's Stadium", city: 'San José' },
  { id: 'D3', group: 'D', phase: 'group', home: 'Estados Unidos', away: 'Turquía', date: '2026-06-18T14:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
  { id: 'D4', group: 'D', phase: 'group', home: 'Paraguay', away: 'Australia', date: '2026-06-18T20:00:00-05:00', venue: "Levi's Stadium", city: 'San José' },
  { id: 'D5', group: 'D', phase: 'group', home: 'Paraguay', away: 'Turquía', date: '2026-06-22T15:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
  { id: 'D6', group: 'D', phase: 'group', home: 'Australia', away: 'Estados Unidos', date: '2026-06-22T15:00:00-05:00', venue: "Levi's Stadium", city: 'San José' },
  // GRUPO E
  { id: 'E1', group: 'E', phase: 'group', home: 'Alemania', away: 'Curazao', date: '2026-06-14T14:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'E2', group: 'E', phase: 'group', home: 'Costa de Marfil', away: 'Ecuador', date: '2026-06-14T20:00:00-05:00', venue: 'Estadio Olímpico', city: 'Ciudad de México' },
  { id: 'E3', group: 'E', phase: 'group', home: 'Alemania', away: 'Ecuador', date: '2026-06-18T17:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'E4', group: 'E', phase: 'group', home: 'Curazao', away: 'Costa de Marfil', date: '2026-06-19T14:00:00-05:00', venue: 'Estadio Olímpico', city: 'Ciudad de México' },
  { id: 'E5', group: 'E', phase: 'group', home: 'Curazao', away: 'Ecuador', date: '2026-06-23T15:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'E6', group: 'E', phase: 'group', home: 'Costa de Marfil', away: 'Alemania', date: '2026-06-23T15:00:00-05:00', venue: 'Estadio Olímpico', city: 'Ciudad de México' },
  // GRUPO F
  { id: 'F1', group: 'F', phase: 'group', home: 'Países Bajos', away: 'Japón', date: '2026-06-14T17:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  { id: 'F2', group: 'F', phase: 'group', home: 'Suecia', away: 'Túnez', date: '2026-06-15T11:00:00-05:00', venue: 'Gillette Stadium', city: 'Boston' },
  { id: 'F3', group: 'F', phase: 'group', home: 'Países Bajos', away: 'Suecia', date: '2026-06-19T17:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  { id: 'F4', group: 'F', phase: 'group', home: 'Japón', away: 'Túnez', date: '2026-06-20T11:00:00-05:00', venue: 'Gillette Stadium', city: 'Boston' },
  { id: 'F5', group: 'F', phase: 'group', home: 'Japón', away: 'Suecia', date: '2026-06-24T15:00:00-05:00', venue: 'Gillette Stadium', city: 'Boston' },
  { id: 'F6', group: 'F', phase: 'group', home: 'Túnez', away: 'Países Bajos', date: '2026-06-24T15:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  // GRUPO G
  { id: 'G1', group: 'G', phase: 'group', home: 'Bélgica', away: 'Egipto', date: '2026-06-15T14:00:00-05:00', venue: 'Arrowhead Stadium', city: 'Kansas City' },
  { id: 'G2', group: 'G', phase: 'group', home: 'Irán', away: 'Nueva Zelanda', date: '2026-06-15T20:00:00-05:00', venue: 'Empower Field', city: 'Denver' },
  { id: 'G3', group: 'G', phase: 'group', home: 'Bélgica', away: 'Nueva Zelanda', date: '2026-06-19T20:00:00-05:00', venue: 'Arrowhead Stadium', city: 'Kansas City' },
  { id: 'G4', group: 'G', phase: 'group', home: 'Egipto', away: 'Irán', date: '2026-06-20T14:00:00-05:00', venue: 'Empower Field', city: 'Denver' },
  { id: 'G5', group: 'G', phase: 'group', home: 'Egipto', away: 'Nueva Zelanda', date: '2026-06-24T15:00:00-05:00', venue: 'Arrowhead Stadium', city: 'Kansas City' },
  { id: 'G6', group: 'G', phase: 'group', home: 'Irán', away: 'Bélgica', date: '2026-06-24T15:00:00-05:00', venue: 'Empower Field', city: 'Denver' },
  // GRUPO H
  { id: 'H1', group: 'H', phase: 'group', home: 'España', away: 'Cabo Verde', date: '2026-06-15T17:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { id: 'H2', group: 'H', phase: 'group', home: 'Arabia Saudita', away: 'Uruguay', date: '2026-06-16T11:00:00-05:00', venue: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  { id: 'H3', group: 'H', phase: 'group', home: 'España', away: 'Uruguay', date: '2026-06-20T17:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { id: 'H4', group: 'H', phase: 'group', home: 'Cabo Verde', away: 'Arabia Saudita', date: '2026-06-21T11:00:00-05:00', venue: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  { id: 'H5', group: 'H', phase: 'group', home: 'Cabo Verde', away: 'Uruguay', date: '2026-06-25T15:00:00-05:00', venue: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  { id: 'H6', group: 'H', phase: 'group', home: 'Arabia Saudita', away: 'España', date: '2026-06-25T15:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  // GRUPO I
  { id: 'I1', group: 'I', phase: 'group', home: 'Francia', away: 'Senegal', date: '2026-06-16T14:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'I2', group: 'I', phase: 'group', home: 'Irak', away: 'Noruega', date: '2026-06-16T20:00:00-05:00', venue: 'Lumen Field', city: 'Seattle' },
  { id: 'I3', group: 'I', phase: 'group', home: 'Francia', away: 'Noruega', date: '2026-06-21T14:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'I4', group: 'I', phase: 'group', home: 'Senegal', away: 'Irak', date: '2026-06-21T20:00:00-05:00', venue: 'Lumen Field', city: 'Seattle' },
  { id: 'I5', group: 'I', phase: 'group', home: 'Senegal', away: 'Noruega', date: '2026-06-25T15:00:00-05:00', venue: 'Lumen Field', city: 'Seattle' },
  { id: 'I6', group: 'I', phase: 'group', home: 'Irak', away: 'Francia', date: '2026-06-25T15:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  // GRUPO J
  { id: 'J1', group: 'J', phase: 'group', home: 'Argentina', away: 'Argelia', date: '2026-06-16T17:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'J2', group: 'J', phase: 'group', home: 'Austria', away: 'Jordania', date: '2026-06-17T11:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'J3', group: 'J', phase: 'group', home: 'Argentina', away: 'Jordania', date: '2026-06-21T17:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { id: 'J4', group: 'J', phase: 'group', home: 'Argelia', away: 'Austria', date: '2026-06-22T11:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'J5', group: 'J', phase: 'group', home: 'Argelia', away: 'Jordania', date: '2026-06-26T15:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { id: 'J6', group: 'J', phase: 'group', home: 'Austria', away: 'Argentina', date: '2026-06-26T15:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  // GRUPO K
  { id: 'K1', group: 'K', phase: 'group', home: 'Portugal', away: 'RD Congo', date: '2026-06-17T14:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  { id: 'K2', group: 'K', phase: 'group', home: 'Uzbekistán', away: 'Colombia', date: '2026-06-17T20:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { id: 'K3', group: 'K', phase: 'group', home: 'Portugal', away: 'Colombia', date: '2026-06-22T14:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  { id: 'K4', group: 'K', phase: 'group', home: 'RD Congo', away: 'Uzbekistán', date: '2026-06-22T20:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { id: 'K5', group: 'K', phase: 'group', home: 'RD Congo', away: 'Colombia', date: '2026-06-26T15:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { id: 'K6', group: 'K', phase: 'group', home: 'Uzbekistán', away: 'Portugal', date: '2026-06-26T15:00:00-05:00', venue: 'Lincoln Financial Field', city: 'Filadelfia' },
  // GRUPO L
  { id: 'L1', group: 'L', phase: 'group', home: 'Inglaterra', away: 'Croacia', date: '2026-06-18T11:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
  { id: 'L2', group: 'L', phase: 'group', home: 'Ghana', away: 'Panamá', date: '2026-06-18T20:00:00-05:00', venue: 'Estadio Universitario', city: 'Monterrey' },
  { id: 'L3', group: 'L', phase: 'group', home: 'Inglaterra', away: 'Panamá', date: '2026-06-23T17:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
  { id: 'L4', group: 'L', phase: 'group', home: 'Croacia', away: 'Ghana', date: '2026-06-23T11:00:00-05:00', venue: 'Estadio Universitario', city: 'Monterrey' },
  { id: 'L5', group: 'L', phase: 'group', home: 'Croacia', away: 'Panamá', date: '2026-06-27T15:00:00-05:00', venue: 'Estadio Universitario', city: 'Monterrey' },
  { id: 'L6', group: 'L', phase: 'group', home: 'Ghana', away: 'Inglaterra', date: '2026-06-27T15:00:00-05:00', venue: 'SoFi Stadium', city: 'Los Ángeles' },
]

export const PHASE_LABELS: Record<Phase, string> = {
  group: 'Fase de Grupos',
  r32: '16avos de Final',
  r16: '8vos de Final',
  qf: 'Cuartos de Final',
  sf: 'Semifinales',
  third: 'Tercer Puesto',
  final: 'Final',
}

/** Slot del cuadro eliminatorio FIFA. ID es estable a lo largo del torneo. */
export const BRACKET_SLOTS: BracketSlot[] = [
  ...Array.from({ length: 16 }, (_, i) => ({ id: `R32_${i + 1}`, phase: 'r32' as const, position: i + 1 })),
  ...Array.from({ length: 8 },  (_, i) => ({ id: `R16_${i + 1}`, phase: 'r16' as const, position: i + 1 })),
  ...Array.from({ length: 4 },  (_, i) => ({ id: `QF_${i + 1}`,  phase: 'qf' as const,  position: i + 1 })),
  ...Array.from({ length: 2 },  (_, i) => ({ id: `SF_${i + 1}`,  phase: 'sf' as const,  position: i + 1 })),
  { id: 'THIRD', phase: 'third', position: 1 },
  { id: 'FINAL', phase: 'final', position: 1 },
]

/** Mapeo de stage de la API Football-Data → phase interna. */
export const API_STAGE_TO_PHASE: Record<string, Phase> = {
  GROUP_STAGE: 'group',
  LAST_32: 'r32',
  LAST_16: 'r16',
  QUARTER_FINALS: 'qf',
  SEMI_FINALS: 'sf',
  THIRD_PLACE: 'third',
  FINAL: 'final',
}

export const SCORING = {
  exactResult: 3,
  correctWinner: 1,
  positionExact: 2,
  penWinner: 1,
  positionBonusElim: 1,
  podium: { champion: 15, runnerUp: 8, third: 5, fourth: 3 },
}
