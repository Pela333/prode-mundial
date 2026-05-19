'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface ActionResult {
  ok?: boolean
  error?: string
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'No autorizado' }

  // No permitir borrarse a sí mismo
  if (userId === user.id) return { error: 'No podés eliminarte a vos mismo' }

  // Snapshot del profile para auditoría
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles').select('username, first_name, last_name')
    .eq('id', userId).maybeSingle()

  // Borrar de auth.users — cascade borra profile, predictions, submissions, user_bonus
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: `No pudimos eliminar el usuario: ${error.message}` }

  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'user_deleted',
    target_type: 'user',
    target_id: userId,
    meta: target ? { username: target.username, name: `${target.first_name} ${target.last_name}` } : null,
  })

  revalidatePath('/admin/usuarios')
  revalidatePath('/admin')
  return { ok: true }
}
