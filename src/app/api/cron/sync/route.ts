/**
 * Endpoint para que un scheduler externo (GitHub Actions, cron-job.org, etc.)
 * dispare un sync. Protegido por `CRON_SECRET` vía Authorization: Bearer ...
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncFromApi } from '@/lib/api/sync'

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
