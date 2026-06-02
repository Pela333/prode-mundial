'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trophy, Mail, Lock, User, Phone, IdCard, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { signupAction, loginAction } from './actions'
import type { FieldErrors } from '@/lib/validation'
import LogoBadge from '@/components/LogoBadge'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')

  // Login fields
  const [identifier, setIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setError(null)
    setSuccess(null)
    setFieldErrors({})
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset()

    startTransition(async () => {
      if (mode === 'login') {
        const res = await loginAction(identifier, loginPassword)
        if (res.error) { setError(res.error); return }
        router.push('/prode')
        router.refresh()
      } else {
        const res = await signupAction({
          firstName, lastName, email, phone, username, password, confirmPassword,
        })
        if (res.fieldErrors) { setFieldErrors(res.fieldErrors); return }
        if (res.error) { setError(res.error); return }
        setSuccess('¡Cuenta creada! Revisá tu email para confirmar y después iniciá sesión.')
        setMode('login')
        setIdentifier(email)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4 py-10">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-red-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/messi.png" alt="Prode" className="w-16 h-16 object-contain rounded-2xl mx-auto mb-4 shadow-xl shadow-amber-500/10" />
          <h1 className="text-2xl font-bold text-white">Prode Mundial 2026</h1>
          <p className="text-slate-400 text-sm mt-1">Competí con tus amigos</p>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/8 p-6 shadow-2xl">
          <div className="flex rounded-xl bg-white/4 p-1 mb-6">
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); reset() }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'login' ? (
              <>
                <Field
                  label="Email o usuario"
                  icon={<User size={15} className="text-slate-500" />}
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="tu@email.com o tu_usuario"
                  type="text"
                  required
                />
                <PasswordField
                  label="Contraseña"
                  value={loginPassword}
                  onChange={setLoginPassword}
                  show={showPw}
                  onToggleShow={() => setShowPw(s => !s)}
                />
                <div className="text-right">
                  <Link href="/recuperar" className="text-xs text-amber-400 hover:text-amber-300">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Nombre"
                    icon={<IdCard size={15} className="text-slate-500" />}
                    value={firstName}
                    onChange={setFirstName}
                    placeholder="Diego"
                    type="text"
                    required
                    error={fieldErrors.firstName}
                  />
                  <Field
                    label="Apellido"
                    icon={<IdCard size={15} className="text-slate-500" />}
                    value={lastName}
                    onChange={setLastName}
                    placeholder="Maradona"
                    type="text"
                    required
                    error={fieldErrors.lastName}
                  />
                </div>
                <Field
                  label="Email"
                  icon={<Mail size={15} className="text-slate-500" />}
                  value={email}
                  onChange={setEmail}
                  placeholder="tu@email.com"
                  type="email"
                  required
                  error={fieldErrors.email}
                />
                <Field
                  label="Teléfono"
                  icon={<Phone size={15} className="text-slate-500" />}
                  value={phone}
                  onChange={setPhone}
                  placeholder="+54 11 5555-5555"
                  type="tel"
                  required
                  error={fieldErrors.phone}
                />
                <Field
                  label="Usuario"
                  icon={<User size={15} className="text-slate-500" />}
                  value={username}
                  onChange={setUsername}
                  placeholder="Maradona10"
                  type="text"
                  required
                  error={fieldErrors.username}
                />
                <PasswordField
                  label="Contraseña"
                  value={password}
                  onChange={setPassword}
                  show={showPw}
                  onToggleShow={() => setShowPw(s => !s)}
                  error={fieldErrors.password}
                />
                <PasswordField
                  label="Confirmar contraseña"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showPw}
                  onToggleShow={() => setShowPw(s => !s)}
                  error={fieldErrors.confirmPassword}
                />
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={15} className="shrink-0" />
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
            >
              {isPending && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? 'Entrar al prode' : 'Crear cuenta'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/5 text-center space-y-2 select-none">
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Organizado por</p>
            <div className="flex items-center justify-center gap-3">
              <LogoBadge src="/logo-empresa.png" alt="Empresa" fallbackText="EMPRESA" bgGradient="from-amber-500 to-amber-600" heightClass="h-9" />
              <span className="text-slate-655 text-xs font-bold">×</span>
              <LogoBadge src="/logo-socia.png" alt="Socia" fallbackText="SOCIA" bgGradient="from-sky-500 to-indigo-600" heightClass="h-6" />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Mundial 2026 · 11 Jun – 19 Jul
        </p>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  error?: string
}

function Field({ label, icon, value, onChange, placeholder, type = 'text', required, error }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border text-white text-sm placeholder:text-slate-600 outline-none transition-all
            ${error ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-amber-500/60 focus:bg-amber-500/5'}`}
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  error?: string
}

function PasswordField({ label, value, onChange, show, onToggleShow, error }: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          className={`w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border text-white text-sm placeholder:text-slate-600 outline-none transition-all
            ${error ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-amber-500/60 focus:bg-amber-500/5'}`}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          tabIndex={-1}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
