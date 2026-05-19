import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import ProfileForm from './ProfileForm'

export const metadata = { title: 'Mi perfil · Prode Mundial 2026' }

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, first_name, last_name, phone, role, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1">Mi perfil</h1>
          <p className="text-slate-400 text-sm">
            Email y nombre de usuario no son modificables.
          </p>
        </div>

        <ProfileForm
          email={user.email ?? ''}
          username={profile.username}
          firstName={profile.first_name}
          lastName={profile.last_name}
          phone={profile.phone}
          role={profile.role}
        />
      </main>
    </div>
  )
}
