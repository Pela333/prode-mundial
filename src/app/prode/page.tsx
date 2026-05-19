import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { MATCHES, GROUPS } from '@/lib/fixture'
import GroupStageBoard from './GroupStageBoard'

export const metadata = { title: 'Mi Prode · Mundial 2026' }
export const dynamic = 'force-dynamic'

export default async function ProdePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Predicciones de fase de grupos
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, home_score, away_score, result_points, bonus_points')
    .eq('user_id', user.id)
    .eq('phase', 'group')

  // Submission de fase de grupos (si confirmó envío)
  const { data: submission } = await supabase
    .from('submissions')
    .select('submitted_at')
    .eq('user_id', user.id)
    .eq('phase', 'group')
    .maybeSingle()

  // Configuración global (deadline)
  const { data: config } = await supabase
    .from('app_config_public')
    .select('group_deadline')
    .single()

  const groupDeadline: Date | null = config?.group_deadline ? new Date(config.group_deadline) : null

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile?.username} role={profile?.role} />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <GroupStageBoard
          groups={GROUPS}
          matches={MATCHES.filter(m => m.phase === 'group')}
          initialPredictions={predictions ?? []}
          submittedAt={submission?.submitted_at ?? null}
          groupDeadline={groupDeadline?.toISOString() ?? null}
        />
      </main>
    </div>
  )
}
