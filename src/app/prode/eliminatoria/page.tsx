import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import EliminatoriaBoard from './EliminatoriaBoard'
import { BRACKET_SLOTS } from '@/lib/fixture'

export const metadata = { title: 'Eliminatoria · Mi Prode' }
export const dynamic = 'force-dynamic'

export default async function EliminatoriaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Bracket actual (cruces detectados desde la API)
  const { data: bracket } = await supabase
    .from('bracket')
    .select('match_id, phase, position, home_team, away_team, scheduled_at, defined')

  // Predicciones del usuario (sólo eliminatoria)
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, home_score_120, away_score_120, pen_winner, result_points, bonus_points')
    .eq('user_id', user.id)
    .neq('phase', 'group')

  // Resultados reales de eliminatoria
  const { data: results } = await supabase
    .from('results')
    .select('match_id, home_score_120, away_score_120, went_to_pens, pen_winner, status')
    .neq('phase', 'group')

  // Submissions
  const { data: subs } = await supabase
    .from('submissions')
    .select('phase, submitted_at')
    .eq('user_id', user.id)
    .in('phase', ['r32_first', 'r32_rest'])

  // Configuración
  const { data: config } = await supabase
    .from('app_config_public')
    .select('r32_first_deadline, r32_rest_deadline')
    .single()

  const submittedR32First = subs?.find(s => s.phase === 'r32_first')?.submitted_at ?? null
  const submittedR32Rest = subs?.find(s => s.phase === 'r32_rest')?.submitted_at ?? null

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <EliminatoriaBoard
          slots={BRACKET_SLOTS}
          bracket={bracket ?? []}
          initialPredictions={predictions ?? []}
          submittedR32First={submittedR32First}
          submittedR32Rest={submittedR32Rest}
          r32FirstDeadline={config?.r32_first_deadline ?? null}
          r32RestDeadline={config?.r32_rest_deadline ?? null}
          realResults={results ?? []}
        />
      </main>
    </div>
  )
}
