'use server'

import { createClient } from '@/lib/supabase/server'
import { isEmail, validateSignup, type FieldErrors, type SignupInput } from '@/lib/validation'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export interface AuthResult {
  ok?: boolean
  error?: string
  fieldErrors?: FieldErrors
}

/**
 * Registro: crea usuario en Supabase Auth + dispara trigger que crea profile.
 * Pasa nombre, apellido, teléfono y username como user_metadata.
 */
export async function signupAction(input: SignupInput): Promise<AuthResult> {
  const fieldErrors = validateSignup(input)
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  const supabase = await createClient()

  // Verificar username disponible
  const { data: available, error: rpcErr } = await supabase
    .rpc('username_available', { p_username: input.username.trim() })
  if (rpcErr) return { error: 'No pudimos verificar el usuario. Intentá de nuevo.' }
  if (available === false) {
    return { fieldErrors: { username: 'Ese nombre de usuario ya está en uso' } }
  }

  const { error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        username: input.username.trim(),
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone.trim(),
      },
    },
  })

  if (error) {
    // Supabase Auth devuelve "User already registered" si el email existe
    if (error.message.toLowerCase().includes('already')) {
      return { fieldErrors: { email: 'Ya existe una cuenta con ese email' } }
    }
    return { error: error.message }
  }

  return { ok: true }
}

/**
 * Login: acepta email o username. Si no es email, resuelve email vía RPC.
 */
export async function loginAction(identifier: string, password: string): Promise<AuthResult> {
  const supabase = await createClient()
  let email = identifier.trim().toLowerCase()

  if (!isEmail(email)) {
    const { data: resolved, error: rpcErr } = await supabase
      .rpc('get_email_by_username', { p_username: email })
    if (rpcErr || !resolved) {
      return { error: 'Usuario o contraseña incorrectos' }
    }
    email = resolved
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Usuario o contraseña incorrectos' }
  return { ok: true }
}

/**
 * Solicitar email de recuperación.
 */
export async function requestPasswordResetAction(email: string): Promise<AuthResult> {
  if (!isEmail(email)) return { error: 'Email inválido' }

  const supabase = await createClient()
  const hdrs = await headers()
  const origin = hdrs.get('origin') ?? hdrs.get('x-forwarded-host') ?? ''
  const redirectTo = origin ? `${origin}/recuperar/confirmar` : undefined

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  })
  // No revelamos si el email existe o no — siempre devolvemos ok
  if (error && !error.message.toLowerCase().includes('not')) {
    return { error: 'No pudimos enviar el email. Intentá de nuevo.' }
  }
  return { ok: true }
}

/**
 * Cambiar contraseña (llamado desde la página de confirmación de reset).
 */
export async function updatePasswordAction(newPassword: string): Promise<AuthResult> {
  if (newPassword.length < 8) return { error: 'Mínimo 8 caracteres' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
