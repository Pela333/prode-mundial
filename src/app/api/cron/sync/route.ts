/**
 * Endpoint para que un scheduler externo (GitHub Actions, cron-job.org, etc.)
 * dispare un sync. Protegido por `CRON_SECRET` vía Authorization: Bearer ...
 *
 * Optimizaciones de CPU:
 *  1. Guard de ventana activa: sale inmediatamente si no hay partidos del
 *     Mundial programados en las próximas horas (sin ninguna consulta a DB ni API).
 *  2. Guard de partido activo/próximo: sale si no hay ningún partido en curso
 *     ni que empiece en las próximas 2 horas.
 *  3. Caché en Supabase: si el último sync tiene < 4 minutos, syncFromApi
 *     devuelve el resultado cacheado sin llamar a Football-Data.org.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncFromApi } from '@/lib/api/sync'
import { isWorldCupActiveWindow, hasUpcomingOrActiveMatch } from '@/lib/fixture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected || expected === 'cambia-esto-por-un-secreto-largo') {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()

  // Guard 1: ventana activa del torneo (pura, sin I/O — ~0ms)
  if (!isWorldCupActiveWindow(now)) {
    return NextResponse.json({
      skipped: true,
      reason: 'outside_active_window',
      checkedAt: now.toISOString(),
    })
  }

  // Guard 2: partido activo o próximo en las siguientes 2 horas (pura, sin I/O — ~0ms)
  if (!hasUpcomingOrActiveMatch(now, 120)) {
    return NextResponse.json({
      skipped: true,
      reason: 'no_active_matches',
      checkedAt: now.toISOString(),
    })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  try {
    const report = await syncFromApi(admin)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
