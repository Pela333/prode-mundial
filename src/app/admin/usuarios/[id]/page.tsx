import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Navbar from '@/components/Navbar'
import { ArrowLeft, User as UserIcon, Phone, Mail, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { GROUPS, MATCHES, BRACKET_SLOTS, PHASE_LABELS, type Phase } from '@/lib/fixture'
import UserPredictionsEditor, { type PredItem, type ResultItem, type BracketItem } from './UserPredictionsEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return { title: `Pronósticos de ${id.slice(0, 8)} · Admin` }
}

export default async function AdminUserPredictionsPage({ params }: PageProps) {
  const { id: userIdParam } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'admin') redirect('/prode')

  // Datos del usuario target
  const { data: target } = await supabase
    .from('profiles').select('id, username, first_name, last_name, phone, role, created_at')
    .eq('id', userIdParam).maybeSingle()
  if (!target) notFound()

  // Email lo traemos con service_role
  let email: string | null = null
  try {
    const admin = createAdminClient()
    const { data: authUser } = await admin.auth.admin.getUserById(target.id)
    email = authUser.user?.email ?? null
  } catch { /* no fatal */ }

  // Predictions del usuario
  const { data: preds } = await supabase
    .from('predictions')
    .select('match_id, phase, home_score, away_score, home_score_120, away_score_120, pen_winner, result_points, bonus_points')
    .eq('user_id', target.id)

  // Resultados (para mostrar comparativa)
  const { data: results } = await supabase
    .from('results')
    .select('match_id, phase, home_score, away_score, home_score_120, away_score_120, went_to_pens, pen_winner, status')

  // Bracket (equipos confirmados de elim)
  const { data: bracketRows } = await supabase
    .from('bracket').select('match_id, home_team, away_team, scheduled_at, defined')

  // Submissions (para mostrar estado)
  const { data: subs } = await supabase
    .from('submissions').select('phase, submitted_at').eq('user_id', target.id)

  const predList: PredItem[] = (preds ?? []).map(p => ({
    match_id: p.match_id,
    phase: p.phase as Phase,
    home_score: p.home_score,
    away_score: p.away_score,
    home_score_120: p.home_score_120,
    away_score_120: p.away_score_120,
    pen_winner: p.pen_winner,
    result_points: p.result_points,
    bonus_points: p.bonus_points,
  }))

  const resultList: ResultItem[] = (results ?? []).map(r => ({
    match_id: r.match_id,
    phase: r.phase as Phase,
    home_score: r.home_score,
    away_score: r.away_score,
    home_score_120: r.home_score_120,
    away_score_120: r.away_score_120,
    went_to_pens: r.went_to_pens,
    pen_winner: r.pen_winner,
    status: r.status,
  }))

  const bracketList: BracketItem[] = (bracketRows ?? []).map(b => ({
    match_id: b.match_id,
    home_team: b.home_team,
    away_team: b.away_team,
    scheduled_at: b.scheduled_at,
    defined: b.defined,
  }))

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin/usuarios" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-3">
          <ArrowLeft size={12} /> Volver a participantes
        </Link>

        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <UserIcon size={28} className="text-amber-400" />
            {target.first_name} {target.last_name}
            {target.role === 'admin' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShieldCheck size={11} /> Admin
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span>@{target.username}</span>
            {email && <span className="flex items-center gap-1"><Mail size={11} /> {email}</span>}
            <span className="flex items-center gap-1"><Phone size={11} /> {target.phone}</span>
            <span>Registrado el {format(new Date(target.created_at), "d MMM yyyy", { locale: es })}</span>
          </div>
        </div>

        {/* Estado de envíos */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {(['group', 'r32_first', 'r32_rest'] as const).map(phase => {
            const sub = subs?.find(s => s.phase === phase)
            const labels = { group: 'Grupos', r32_first: '16avos #1', r32_rest: '16avos resto' }
            return (
              <div key={phase} className="rounded-xl bg-[#111827] border border-white/8 p-3 text-center">
                <div className="text-xs text-slate-500 uppercase font-semibold">{labels[phase]}</div>
                {sub
                  ? <div className="text-green-400 text-xs mt-1">Enviado · {format(new Date(sub.submitted_at), "d MMM HH:mm", { locale: es })}</div>
                  : <div className="text-slate-600 text-xs mt-1">No enviado</div>}
              </div>
            )
          })}
        </div>

        <UserPredictionsEditor
          userId={target.id}
          groups={GROUPS}
          groupMatches={MATCHES.filter(m => m.phase === 'group')}
          bracketSlots={BRACKET_SLOTS}
          phaseLabels={PHASE_LABELS}
          predictions={predList}
          results={resultList}
          bracket={bracketList}
        />
      </main>
    </div>
  )
}
