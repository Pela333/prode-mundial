/**
 * Validaciones compartidas entre cliente y servidor.
 * Mantener mínimas dependencias para usarse en ambos contextos.
 */

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const PHONE_RE = /^\+?\d[\d\s\-().]{6,19}$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isPhone(value: string): boolean {
  return PHONE_RE.test(value.trim())
}

export function isUsername(value: string): boolean {
  return USERNAME_RE.test(value.trim())
}

export interface SignupInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  username: string
  password: string
  confirmPassword: string
}

export type FieldErrors = Partial<Record<keyof SignupInput, string>>

export function validateSignup(input: SignupInput): FieldErrors {
  const errors: FieldErrors = {}

  if (!input.firstName?.trim()) errors.firstName = 'Ingresá tu nombre'
  else if (input.firstName.trim().length < 2) errors.firstName = 'Nombre demasiado corto'

  if (!input.lastName?.trim()) errors.lastName = 'Ingresá tu apellido'
  else if (input.lastName.trim().length < 2) errors.lastName = 'Apellido demasiado corto'

  if (!input.email?.trim()) errors.email = 'Ingresá tu email'
  else if (!isEmail(input.email)) errors.email = 'Email inválido'

  if (!input.phone?.trim()) errors.phone = 'Ingresá tu teléfono'
  else if (!isPhone(input.phone)) errors.phone = 'Teléfono inválido (incluí código de área)'

  if (!input.username?.trim()) errors.username = 'Elegí un nombre de usuario'
  else if (!isUsername(input.username)) errors.username = 'Sólo letras, números y _ (3-20 caracteres)'

  if (!input.password) errors.password = 'Elegí una contraseña'
  else if (input.password.length < 8) errors.password = 'Mínimo 8 caracteres'

  if (input.password && input.confirmPassword !== input.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden'
  }

  return errors
}

export function validateProfileUpdate(input: { firstName: string; lastName: string; phone: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.firstName?.trim() || input.firstName.trim().length < 2) errors.firstName = 'Nombre inválido'
  if (!input.lastName?.trim() || input.lastName.trim().length < 2) errors.lastName = 'Apellido inválido'
  if (!input.phone?.trim() || !isPhone(input.phone)) errors.phone = 'Teléfono inválido'
  return errors
}
