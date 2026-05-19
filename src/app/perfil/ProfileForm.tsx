'use client'

import { useState, useTransition } from 'react'
import { Mail, User, IdCard, Phone, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'
import { updateProfileAction } from './actions'

interface ProfileFormProps {
  email: string
  username: string
  firstName: string
  lastName: string
  phone: string
  role: 'player' | 'admin'
}

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'phone', string>>

export default function ProfileForm(props: ProfileFormProps) {
  const [firstName, setFirstName] = useState(props.firstName)
  const [lastName, setLastName] = useState(props.lastName)
  const [phone, setPhone] = useState(props.phone)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty =
    firstName !== props.firstName ||
    lastName !== props.lastName ||
    phone !== props.phone

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setFieldErrors({})

    startTransition(async () => {
      const res = await updateProfileAction({ firstName, lastName, phone })
      if (res.fieldErrors) { setFieldErrors(res.fieldErrors); return }
      if (res.error) { setError(res.error); return }
      setSuccess(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Datos inmutables */}
      <section className="rounded-2xl bg-[#111827] border border-white/8 p-5 space-y-3">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <Lock size={14} className="text-slate-500" /> Datos no modificables
        </h2>
        <ReadField icon={<Mail size={14} />} label="Email" value={props.email} />
        <ReadField icon={<User size={14} />} label="Usuario" value={props.username} />
        {props.role === 'admin' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
            <ShieldCheck size={14} /> Administrador
          </div>
        )}
      </section>

      {/* Datos editables */}
      <section className="rounded-2xl bg-[#111827] border border-white/8 p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm">Datos personales</h2>
        <div className="grid grid-cols-2 gap-2">
          <EditField
            icon={<IdCard size={14} />}
            label="Nombre"
            value={firstName}
            onChange={setFirstName}
            error={fieldErrors.firstName}
          />
          <EditField
            icon={<IdCard size={14} />}
            label="Apellido"
            value={lastName}
            onChange={setLastName}
            error={fieldErrors.lastName}
          />
        </div>
        <EditField
          icon={<Phone size={14} />}
          label="Teléfono"
          value={phone}
          onChange={setPhone}
          error={fieldErrors.phone}
        />
      </section>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
          <CheckCircle2 size={15} /> Cambios guardados
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !dirty}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Guardar cambios
      </button>
    </form>
  )
}

function ReadField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
      <span className="text-slate-500">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
        <div className="text-sm text-slate-300 truncate">{value}</div>
      </div>
    </div>
  )
}

function EditField({
  icon,
  label,
  value,
  onChange,
  error,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border text-white text-sm outline-none transition-all
            ${error ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-amber-500/60 focus:bg-amber-500/5'}`}
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
