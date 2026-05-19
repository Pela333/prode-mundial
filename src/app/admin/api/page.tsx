import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import ApiSyncPanel from './ApiSyncPanel'
import { ArrowLeft, Wifi } from 'lucide-react'

export const metadata = { title: 'API · Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminApiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'admin') redirect('/prode')

  const { data: config } = await supabase
    .from('app_config')
    .select('last_sync_at, last_sync_status, api_provider')
    .eq('id', 1)
    .maybeSingle()

  const { data: errors } = await supabase
    .from('api_errors')
    .select('id, endpoint, status_code, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/admin" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-3">
          <ArrowLeft size={12} /> Volver al panel
        </Link>
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Wifi size={28} className="text-amber-400" />
            Integración API
          </h1>
          <p className="text-slate-400 text-sm">
            Conexión con Football-Data.org · sync manual · log de errores.
          </p>
        </div>

        <ApiSyncPanel
          provider={config?.api_provider ?? 'football-data'}
          lastSyncAt={config?.last_sync_at ?? null}
          lastSyncStatus={config?.last_sync_status ?? null}
          recentErrors={errors ?? []}
        />
      </main>
    </div>
  )
}
