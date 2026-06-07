export interface ArgentinaDateParts {
  day: string
  monthLong: string
  monthShort: string
  year: string
  hour: string
  minute: string
  second: string
}

export function getArgentinaParts(dateInput: Date | string | number | null | undefined): ArgentinaDateParts | null {
  if (!dateInput) return null
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput

  if (isNaN(date.getTime())) {
    return null
  }

  // Use Intl.DateTimeFormat to extract parts in America/Argentina/Buenos_Aires timezone
  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const partMap: Record<string, string> = {}
  for (const p of parts) {
    partMap[p.type] = p.value
  }

  // Also get the short month format
  const formatterShort = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'short',
  })
  // Remove any trailing dot in the short month representation (e.g. "jun." -> "jun")
  const shortMonth = formatterShort.format(date).replace('.', '')

  return {
    day: partMap.day,
    monthLong: partMap.month,
    monthShort: shortMonth,
    year: partMap.year,
    hour: partMap.hour,
    minute: partMap.minute,
    second: partMap.second,
  }
}

/**
 * Formats a date specifically in the America/Argentina/Buenos_Aires timezone (UTC-3),
 * ensuring identical output on server and client to avoid timezone offsets and hydration mismatches.
 */
export function formatInArgentina(
  dateInput: Date | string | number | null | undefined,
  pattern: string
): string {
  if (!dateInput) return ''
  
  const parts = getArgentinaParts(dateInput)
  if (!parts) return ''

  // Format mapping based on the exact patterns used in the codebase
  switch (pattern) {
    case "d 'de' MMMM · HH:mm":
      return `${parts.day} de ${parts.monthLong} · ${parts.hour}:${parts.minute}`
    case "d 'de' MMMM 'a las' HH:mm":
      return `${parts.day} de ${parts.monthLong} a las ${parts.hour}:${parts.minute}`
    case "d 'de' MMMM HH:mm":
      return `${parts.day} de ${parts.monthLong} ${parts.hour}:${parts.minute}`
    case "d MMM yyyy":
      return `${parts.day} ${parts.monthShort} ${parts.year}`
    case "d MMM HH:mm":
      return `${parts.day} ${parts.monthShort} ${parts.hour}:${parts.minute}`
    case "d MMM HH:mm:ss":
      return `${parts.day} ${parts.monthShort} ${parts.hour}:${parts.minute}:${parts.second}`
    case "d 'de' MMM yyyy · HH:mm":
      return `${parts.day} de ${parts.monthShort} ${parts.year} · ${parts.hour}:${parts.minute}`
    case "d MMM · HH:mm":
      return `${parts.day} ${parts.monthShort} · ${parts.hour}:${parts.minute}`
    case "d 'de' MMMM yyyy · HH:mm":
      return `${parts.day} de ${parts.monthLong} ${parts.year} · ${parts.hour}:${parts.minute}`
    default:
      // Fallback fallback using simple formatting
      return `${parts.day}/${parts.monthShort}/${parts.year} ${parts.hour}:${parts.minute}`
  }
}
