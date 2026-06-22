/**
 * Endpoint para disparar sync con Football-Data.org desde el panel admin.
 *
 * Acepta:
 *  - POST con sesión admin → corre el sync usando service_role internamente.
 *
 * El sync requiere service_role para escribir en results/bracket/etc. sin RLS.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncFromApi } from '@/lib/api/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  // Validar sesión admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Disparar sync con cliente admin (service_role)
  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }

  try {
    const report = await syncFromApi(admin, { bypassCache: true })
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}
