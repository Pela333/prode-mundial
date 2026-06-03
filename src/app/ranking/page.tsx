import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { Trophy, Star, Send } from 'lucide-react'

export const metadata = { title: 'Ranking · Prode Mundial 2026' }
export const dynamic = 'force-dynamic'

import { RankingRow } from './RankingBoard'
import RankingBoard from './RankingBoard'

export default async function RankingPage() {
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

  const { data: ranking } = await supabase
    .from('ranking')
    .select('*')

  const rows = (ranking ?? []) as RankingRow[]

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile?.username} role={profile?.role} />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <RankingBoard rows={rows} currentUserId={user.id} />
      </main>
    </div>
  )
}
