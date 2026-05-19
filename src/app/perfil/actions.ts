'use server'

import { createClient } from '@/lib/supabase/server'
import { validateProfileUpdate } from '@/lib/validation'
import { revalidatePath } from 'next/cache'

export interface UpdateProfileInput {
  firstName: string
  lastName: string
  phone: string
}

export interface UpdateProfileResult {
  ok?: boolean
  error?: string
  fieldErrors?: Partial<Record<keyof UpdateProfileInput, string>>
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const errors = validateProfileUpdate(input)
  if (Object.keys(errors).length > 0) return { fieldErrors: errors }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone.trim(),
    })
    .eq('id', user.id)

  if (error) return { error: 'No pudimos guardar los cambios. Intentá de nuevo.' }

  revalidatePath('/perfil')
  return { ok: true }
}
