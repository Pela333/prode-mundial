'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Trophy, Mail, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { requestPasswordResetAction } from '../login/actions'

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await requestPasswordResetAction(email)
      if (res.error) { setError(res.error); return }
      setSent(true)
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-amber-500/20">
            <Trophy size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Recuperar contraseña</h1>
          <p className="text-slate-400 text-sm mt-1">Te enviamos un link a tu email</p>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/8 p-6 shadow-2xl">
          {sent ? (
            <div className="text-center space-y-3">
              <CheckCircle2 size={40} className="text-green-400 mx-auto" />
              <p className="text-white text-sm">
                Si existe una cuenta con ese email, te enviamos un link para restablecer tu contraseña.
              </p>
              <p className="text-slate-400 text-xs">Revisá también la carpeta de spam.</p>
              <Link href="/login" className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium pt-3">
                <ArrowLeft size={14} /> Volver al login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-600 outline-none focus:border-amber-500/60 focus:bg-amber-500/5 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle size={15} className="shrink-0" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Enviar link
              </button>

              <div className="text-center">
                <Link href="/login" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs">
                  <ArrowLeft size={12} /> Volver al login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
