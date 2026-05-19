import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import ConfigForm from './ConfigForm'
import { ArrowLeft, Calendar } from 'lucide-react'

export const metadata = { title: 'Configuración · Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'admin') redirect('/prode')

  const { data: config } = await supabase
    .from('app_config')
    .select('group_deadline, reveal_predictions_at, r16_first_deadline, r16_rest_deadline')
    .eq('id', 1)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/admin" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-3">
          <ArrowLeft size={12} /> Volver al panel
        </Link>
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Calendar size={28} className="text-amber-400" />
            Configuración de fechas
          </h1>
          <p className="text-slate-400 text-sm">
            Fechas límite y revelación de pronósticos ajenos.
          </p>
        </div>

        <ConfigForm
          initialGroupDeadline={config?.group_deadline ?? null}
          initialRevealAt={config?.reveal_predictions_at ?? null}
          r16FirstDeadline={config?.r16_first_deadline ?? null}
          r16RestDeadline={config?.r16_rest_deadline ?? null}
        />
      </main>
    </div>
  )
}
