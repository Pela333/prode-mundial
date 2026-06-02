'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface UpdateConfigInput {
  groupDeadline: string | null         // ISO string o null
  revealPredictionsAt: string | null   // ISO string o null
  r32FirstDeadline: string | null      // ISO string o null
  r32RestDeadline: string | null       // ISO string o null
}


export interface ActionResult {
  ok?: boolean
  error?: string
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, isAdmin: false }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, user, isAdmin: profile?.role === 'admin' }
}

export async function updateConfigAction(input: UpdateConfigInput): Promise<ActionResult> {
  const { supabase, isAdmin } = await assertAdmin()
  if (!isAdmin) return { error: 'No autorizado' }

  // Validar formato: ambos pueden ser null o ISO parseable
  for (const [key, val] of Object.entries(input)) {
    if (val !== null && Number.isNaN(new Date(val).getTime())) {
      return { error: `Fecha inválida en ${key}` }
    }
  }

  const { error } = await supabase
    .from('app_config')
    .update({
      group_deadline: input.groupDeadline,
      reveal_predictions_at: input.revealPredictionsAt,
      r32_first_deadline: input.r32FirstDeadline,
      r32_rest_deadline: input.r32RestDeadline,
    })
    .eq('id', 1)

  if (error) return { error: 'No pudimos guardar la configuración' }

  revalidatePath('/admin')
  revalidatePath('/admin/config')
  revalidatePath('/prode')
  return { ok: true }
}
