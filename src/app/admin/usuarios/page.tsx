import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Navbar from '@/components/Navbar'
import { ArrowLeft, Users, ShieldCheck, CheckCircle2, Circle, Phone, Eye, Mail } from 'lucide-react'
import DeleteUserButton from './DeleteUserButton'
import { formatInArgentina } from '@/lib/dateUtils'

export const metadata = { title: 'Participantes · Admin' }
export const dynamic = 'force-dynamic'

interface UserRow {
  id: string
  username: string
  first_name: string
  last_name: string
  phone: string
  role: 'player' | 'admin'
  created_at: string
  email: string | null
  sent_group: boolean
  sent_r32_first: boolean
  sent_r32_rest: boolean
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'admin') redirect('/prode')

  // Traemos todos los profiles + sus submissions (RLS admite a admin leerlos a todos).
  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, first_name, last_name, phone, role, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('submissions')
      .select('user_id, phase'),
  ])

  const submissionMap = new Map<string, Set<string>>()
  for (const s of submissions ?? []) {
    if (!submissionMap.has(s.user_id)) submissionMap.set(s.user_id, new Set())
    submissionMap.get(s.user_id)!.add(s.phase)
  }

  // Levanto los emails desde auth.users con service_role
  const emailMap = new Map<string, string | null>()
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of data?.users ?? []) emailMap.set(u.id, u.email ?? null)
  } catch { /* SUPABASE_SERVICE_ROLE_KEY no configurada — los emails quedan en null */ }

  const rows: UserRow[] = (profiles ?? []).map(p => {
    const phases = submissionMap.get(p.id) ?? new Set()
    return {
      ...p,
      email: emailMap.get(p.id) ?? null,
      sent_group: phases.has('group'),
      sent_r32_first: phases.has('r32_first'),
      sent_r32_rest: phases.has('r32_rest'),
    }
  })

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-3">
          <ArrowLeft size={12} /> Volver al panel
        </Link>
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Users size={28} className="text-amber-400" />
            Participantes
          </h1>
          <p className="text-slate-400 text-sm">
             {rows.length} {rows.length === 1 ? 'usuario registrado' : 'usuarios registrados'}.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl bg-[#111827] border border-white/8 p-8 text-center text-slate-500">
            Todavía no hay usuarios registrados.
          </div>
        ) : (
          <div className="rounded-2xl border border-white/6 overflow-hidden bg-[#111827]">
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-[1.4fr_1.6fr_1.2fr_auto_auto_auto_auto_auto] gap-3 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-white/5">
                <span>Nombre</span>
                <span>Usuario / Tel.</span>
                <span>Registrado</span>
                <span className="text-center">Grupos</span>
                <span className="text-center">16avos #1</span>
                <span className="text-center">16avos resto</span>
                <span className="text-center">Rol</span>
                <span className="text-right">Acción</span>
              </div>
              {rows.map(r => (
                <div
                  key={r.id}
                  className="grid grid-cols-[1.4fr_1.6fr_1.2fr_auto_auto_auto_auto_auto] gap-3 px-4 py-3 items-center border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {r.first_name} {r.last_name}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-300 truncate flex items-center gap-1">
                      <span className="text-slate-500">@</span>{r.username}
                    </div>
                    {r.email && (
                      <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                        <Mail size={10} /> {r.email}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                      <Phone size={10} /> {r.phone}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatInArgentina(r.created_at, "d MMM yyyy")}
                  </span>
                  <CenterCheck on={r.sent_group} />
                  <CenterCheck on={r.sent_r32_first} />
                  <CenterCheck on={r.sent_r32_rest} />
                  <RoleBadge role={r.role} />
                  <div className="flex items-center gap-1 justify-end">
                    <Link href={`/admin/usuarios/${r.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-white/5" aria-label="Ver pronósticos" title="Ver/editar pronósticos">
                      <Eye size={14} />
                    </Link>
                    {r.role !== 'admin' && (
                      <DeleteUserButton userId={r.id} userName={`${r.first_name} ${r.last_name}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/5">
              {rows.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-semibold">
                        {r.first_name} {r.last_name}
                      </p>
                      <p className="text-xs text-slate-500">@{r.username}</p>
                    </div>
                    <RoleBadge role={r.role} />
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone size={11} /> {r.phone}
                  </div>
                  <div className="flex items-center gap-3 pt-1 text-xs">
                    <PhaseDot label="Grupos" on={r.sent_group} />
                    <PhaseDot label="16avos #1" on={r.sent_r32_first} />
                    <PhaseDot label="16avos resto" on={r.sent_r32_rest} />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Link href={`/admin/usuarios/${r.id}`} className="flex-1 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 justify-center py-1.5 rounded border border-amber-500/20 bg-amber-500/5">
                      <Eye size={12} /> Ver pronósticos
                    </Link>
                    {r.role !== 'admin' && (
                      <DeleteUserButton userId={r.id} userName={`${r.first_name} ${r.last_name}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-slate-900/40 border border-white/5 p-4 text-xs text-slate-500 space-y-1">
          <p className="flex items-center gap-2">
            <Mail size={12} /> Los emails se traen via service_role. Si no aparecen,
            verificá que <code className="text-amber-400">SUPABASE_SERVICE_ROLE_KEY</code> esté en <code>.env.local</code>.
          </p>
        </div>
      </main>
    </div>
  )
}

function CenterCheck({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center" title={on ? 'Enviado' : 'No enviado'}>
      {on ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} className="text-slate-700" />}
    </span>
  )
}

function PhaseDot({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {on ? <CheckCircle2 size={11} className="text-green-500" /> : <Circle size={11} className="text-slate-700" />}
      <span className={on ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
    </span>
  )
}

function RoleBadge({ role }: { role: 'player' | 'admin' }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
        <ShieldCheck size={10} /> Admin
      </span>
    )
  }
  return (
    <span className="text-xs text-slate-500">Jugador</span>
  )
}
