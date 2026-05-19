/**
 * Cliente Supabase con service_role.
 *
 * SOLO PARA SERVER-SIDE. Nunca importar este módulo desde Client Components
 * ni exponerlo al bundle del navegador — la service_role bypasea todas las
 * políticas de RLS.
 *
 * Usos legítimos:
 *  - Cron de sync (sin sesión).
 *  - Eliminación de usuarios (auth.admin.deleteUser).
 *  - Tareas de mantenimiento / migraciones puntuales.
 */

import { createClient as createSbClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL no está configurada')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada. Cargala en .env.local.')
  return createSbClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
