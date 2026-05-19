/**
 * Mapeo de nombres de equipos: Football-Data.org ↔ fixture local.
 * Mantener sincronizado con src/lib/fixture.ts > GROUPS.
 */

const API_TO_FIXTURE: Record<string, string> = {
  'Algeria': 'Argelia',
  'Argentina': 'Argentina',
  'Australia': 'Australia',
  'Austria': 'Austria',
  'Belgium': 'Bélgica',
  'Bosnia-Herzegovina': 'Bosnia y Herzegovina',
  'Brazil': 'Brasil',
  'Canada': 'Canadá',
  'Cape Verde Islands': 'Cabo Verde',
  'Colombia': 'Colombia',
  'Congo DR': 'RD Congo',
  'Croatia': 'Croacia',
  'Curaçao': 'Curazao',
  'Czechia': 'Rep. Checa',
  'Ecuador': 'Ecuador',
  'Egypt': 'Egipto',
  'England': 'Inglaterra',
  'France': 'Francia',
  'Germany': 'Alemania',
  'Ghana': 'Ghana',
  'Haiti': 'Haití',
  'Iran': 'Irán',
  'Iraq': 'Irak',
  'Ivory Coast': 'Costa de Marfil',
  'Japan': 'Japón',
  'Jordan': 'Jordania',
  'Mexico': 'México',
  'Morocco': 'Marruecos',
  'Netherlands': 'Países Bajos',
  'New Zealand': 'Nueva Zelanda',
  'Norway': 'Noruega',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguay',
  'Portugal': 'Portugal',
  'Qatar': 'Qatar',
  'Saudi Arabia': 'Arabia Saudita',
  'Scotland': 'Escocia',
  'Senegal': 'Senegal',
  'South Africa': 'Sudáfrica',
  'South Korea': 'Corea del Sur',
  'Spain': 'España',
  'Sweden': 'Suecia',
  'Switzerland': 'Suiza',
  'Tunisia': 'Túnez',
  'Turkey': 'Turquía',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguay',
  'Uzbekistan': 'Uzbekistán',
}

export function apiTeamToFixture(apiName: string | null | undefined): string | null {
  if (!apiName) return null
  return API_TO_FIXTURE[apiName] ?? null
}

/** Mapeo inverso (lazy) para tests/debug */
let _inverse: Record<string, string> | null = null
export function fixtureTeamToApi(fixtureName: string): string | null {
  if (!_inverse) {
    _inverse = {}
    for (const [api, fix] of Object.entries(API_TO_FIXTURE)) _inverse[fix] = api
  }
  return _inverse[fixtureName] ?? null
}
