import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { ArrowLeft, User as UserIcon, Lock, Clock, ShieldCheck, Award } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { GROUPS, MATCHES, BRACKET_SLOTS, PHASE_LABELS, type Phase } from '@/lib/fixture'
import PublicPredictionsViewer, { type PredItem, type ResultItem, type BracketItem } from './PublicPredictionsViewer'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return { title: `Pronósticos de ${id.slice(0, 8)} · Prode` }
}

export default async function PublicUserPredictionsPage({ params }: PageProps) {
  const { id: userIdParam } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Obtener perfil del usuario actual (para saber si es admin)
  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile) redirect('/login')

  // Obtener perfil del usuario target
  const { data: target } = await supabase
    .from('profiles').select('id, username, first_name, last_name, role, created_at')
    .eq('id', userIdParam).maybeSingle()
  if (!target) notFound()

  // Obtener configuración global para verificar reveal_predictions_at
  const { data: config } = await supabase
    .from('app_config_public').select('reveal_predictions_at').eq('id', 1).maybeSingle()

  const isOwner = user.id === target.id
  const isAdmin = profile.role === 'admin'
  const revealDate = config?.reveal_predictions_at ? new Date(config.reveal_predictions_at) : null
  const isRevealed = revealDate ? revealDate.getTime() <= Date.now() : false
  const canView = isOwner || isAdmin || isRevealed

  // Formatear fecha de revelación
  const revealDateStr = revealDate
    ? format(revealDate, "d 'de' MMMM 'a las' HH:mm", { locale: es })
    : null

  // Si no se pueden visualizar
  if (!canView) {
    return (
      <div className="min-h-screen bg-[#0a0f1e]">
        <Navbar username={profile.username} role={profile.role} />
        <main className="mx-auto max-w-xl px-4 py-16 flex flex-col items-center justify-center text-center">
          <Link href="/ranking" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-8 self-start">
            <ArrowLeft size={12} /> Volver al ranking
          </Link>

          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 text-amber-400 shadow-lg shadow-amber-500/5">
            <Lock size={28} />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            Pronósticos de {target.first_name} {target.last_name}
          </h1>
          <p className="text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
            Por motivos de competencia, las predicciones de los demás participantes son secretas hasta la fecha de revelación.
          </p>

          <div className="rounded-xl border border-white/5 bg-[#111827]/60 p-4 w-full flex items-center gap-3 justify-center text-xs text-amber-400 font-medium">
            <Clock size={15} className="shrink-0" />
            <span>
              {revealDateStr
                ? <>Se revelarán el <span className="font-bold underline">{revealDateStr}</span></>
                : 'Fecha de revelación no configurada por el administrador.'
              }
            </span>
          </div>
        </main>
      </div>
    )
  }

  // Si se autoriza ver: Cargamos datos de Supabase.
  // predictions (RLS la filtrará si no está autorizado, pero por RLS de arriba ya sabemos que sí puede ver)
  const { data: preds } = await supabase
    .from('predictions')
    .select('match_id, phase, home_score, away_score, home_score_120, away_score_120, pen_winner, result_points, bonus_points')
    .eq('user_id', target.id)

  // Resultados
  const { data: results } = await supabase
    .from('results')
    .select('match_id, phase, home_score, away_score, home_score_120, away_score_120, went_to_pens, pen_winner, status')

  // Bracket
  const { data: bracketRows } = await supabase
    .from('bracket').select('match_id, home_team, away_team, scheduled_at, defined')

  // group_standings reales
  const { data: realGroupStandings } = await supabase
    .from('group_standings')
    .select('group_id, position, team, finalized')

  // Mapeamos a las interfaces de UI
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

  // Obtener puntos del ranking de este usuario
  const { data: rankRow } = await supabase
    .from('ranking')
    .select('total_points, exactos_total')
    .eq('user_id', target.id)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/ranking" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-4">
          <ArrowLeft size={12} /> Volver al ranking
        </Link>

        <div className="mb-6 animate-fade-in-up flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-2.5">
              <UserIcon size={28} className="text-amber-400" />
              {target.first_name} {target.last_name}
              {target.role === 'admin' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldCheck size={11} /> Admin
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500">
              Participante @{target.username} · Registrado el {format(new Date(target.created_at), "d MMM yyyy", { locale: es })}
            </p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-xl border border-white/5 bg-[#111827] px-4 py-2.5 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wide block">Puntos Totales</span>
              <span className="text-lg font-black text-amber-400">{rankRow?.total_points ?? 0} pts</span>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#111827] px-4 py-2.5 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wide block">Marcadores Exactos</span>
              <span className="text-lg font-black text-white">{rankRow?.exactos_total ?? 0}</span>
            </div>
          </div>
        </div>

        <PublicPredictionsViewer
          groups={GROUPS}
          groupMatches={MATCHES.filter(m => m.phase === 'group')}
          bracketSlots={BRACKET_SLOTS}
          phaseLabels={PHASE_LABELS}
          predictions={predList}
          results={resultList}
          bracket={bracketList}
          realGroupStandings={realGroupStandings ?? []}
        />
      </main>
    </div>
  )
}
