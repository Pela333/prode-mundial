'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updatePasswordAction } from '../../login/actions'

export default function ConfirmarRecuperacionPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // Supabase aplica el access_token desde el hash de la URL automáticamente
    // y dispara el evento PASSWORD_RECOVERY. Verificamos que haya sesión.
    const supabase = createClient()
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setAuthReady(true)
      }
    })
    // También chequeamos por si ya estamos autenticados
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAuthReady(true)
    })
    return () => sub.data.subscription.unsubscribe()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('Mínimo 8 caracteres'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return }

    startTransition(async () => {
      const res = await updatePasswordAction(password)
      if (res.error) { setError(res.error); return }
      setSuccess(true)
      setTimeout(() => router.push('/prode'), 1500)
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center mx-auto mb-4">
            <Trophy size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Nueva contraseña</h1>
          <p className="text-slate-400 text-sm mt-1">Elegí una contraseña segura</p>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/8 p-6 shadow-2xl">
          {success ? (
            <div className="text-center space-y-3">
              <CheckCircle2 size={40} className="text-green-400 mx-auto" />
              <p className="text-white text-sm">¡Contraseña actualizada! Te redirigimos...</p>
            </div>
          ) : !authReady ? (
            <div className="text-center text-slate-400 text-sm py-6">
              <Loader2 className="animate-spin mx-auto mb-2" size={20} />
              Verificando link...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500/60 transition-all"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" tabIndex={-1}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Confirmar</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500/60 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Cambiar contraseña
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
