import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { ShieldCheck, Calendar, Users, ChevronRight, Eye, EyeOff, Wifi, ListTodo } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const metadata = { title: 'Admin · Prode Mundial 2026' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') {
    redirect('/prode')
  }

  // KPIs
  const [{ count: totalPlayers }, { count: totalSubmissions }, { data: config }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'player'),
    supabase.from('submissions').select('user_id', { count: 'exact', head: true }).eq('phase', 'group'),
    supabase.from('app_config').select('group_deadline, reveal_predictions_at, r16_first_deadline, r16_rest_deadline').eq('id', 1).maybeSingle(),
  ])

  const fmt = (d: string | null | undefined) =>
    d ? format(new Date(d), "d 'de' MMM yyyy · HH:mm", { locale: es }) : 'No configurado'

  const now = Date.now()
  const deadlineState = (d: string | null | undefined) => {
    if (!d) return { label: 'Sin configurar', color: 'text-slate-500' }
    const t = new Date(d).getTime()
    if (t < now) return { label: 'Pasada', color: 'text-red-400' }
    return { label: 'Vigente', color: 'text-green-400' }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <ShieldCheck size={28} className="text-amber-400" />
            Panel de administración
          </h1>
          <p className="text-slate-400 text-sm">
            Configuración del prode y gestión de participantes.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Kpi label="Participantes" value={totalPlayers ?? 0} icon={<Users size={16} />} />
          <Kpi label="Envíos Fase 1" value={`${totalSubmissions ?? 0}/${totalPlayers ?? 0}`} icon={<ShieldCheck size={16} />} />
          <Kpi
            label="Deadline Fase 1"
            value={fmt(config?.group_deadline)}
            small
            footer={
              <span className={`text-xs font-semibold ${deadlineState(config?.group_deadline).color}`}>
                {deadlineState(config?.group_deadline).label}
              </span>
            }
          />
          <Kpi
            label="Revelar pronósticos"
            value={fmt(config?.reveal_predictions_at)}
            small
            footer={
              <span className={`text-xs font-semibold ${
                config?.reveal_predictions_at && new Date(config.reveal_predictions_at).getTime() < now
                  ? 'text-green-400' : 'text-slate-500'
              }`}>
                {config?.reveal_predictions_at && new Date(config.reveal_predictions_at).getTime() < now ? (
                  <span className="inline-flex items-center gap-1"><Eye size={11} /> Visible</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><EyeOff size={11} /> Oculto</span>
                )}
              </span>
            }
          />
        </div>

        {/* Acciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AdminCard
            href="/admin/config"
            icon={<Calendar size={20} className="text-amber-400" />}
            title="Configuración de fechas"
            description="Fecha límite Fase 1, revelación de pronósticos ajenos."
          />
          <AdminCard
            href="/admin/usuarios"
            icon={<Users size={20} className="text-amber-400" />}
            title="Participantes"
            description="Lista de jugadores con su estado de envíos. Ver/editar pronósticos ajenos."
          />
          <AdminCard
            href="/admin/resultados"
            icon={<ListTodo size={20} className="text-amber-400" />}
            title="Resultados reales"
            description="Ver resultados de la API y corregir manualmente con auditoría."
          />
          <AdminCard
            href="/admin/api"
            icon={<Wifi size={20} className="text-amber-400" />}
            title="Integración API"
            description="Estado de Football-Data.org, sync manual y log de errores."
          />
        </div>

        <div className="mt-8 rounded-2xl bg-slate-900/40 border border-white/5 p-4">
          <p className="text-slate-500 text-xs">
            Las fechas límite de la fase eliminatoria se configuran automáticamente
            cuando la API detecta los cruces de 16avos.
          </p>
        </div>
      </main>
    </div>
  )
}

function Kpi({
  label, value, icon, footer, small,
}: {
  label: string; value: string | number; icon?: React.ReactNode; footer?: React.ReactNode; small?: boolean
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/8 p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-white font-bold ${small ? 'text-sm' : 'text-2xl'}`}>{value}</div>
      {footer && <div className="mt-1">{footer}</div>}
    </div>
  )
}

function AdminCard({
  href, icon, title, description,
}: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl bg-[#111827] border border-white/8 hover:border-amber-500/30 transition-all p-5 flex items-start gap-3 group"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-bold text-sm mb-0.5 flex items-center justify-between">
          <span>{title}</span>
          <ChevronRight size={16} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
        </h3>
        <p className="text-slate-400 text-xs">{description}</p>
      </div>
    </Link>
  )
}
