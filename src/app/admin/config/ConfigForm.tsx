'use client'

import { useState, useTransition } from 'react'
import { Calendar, Eye, Loader2, AlertCircle, CheckCircle2, Save } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { updateConfigAction } from './actions'

interface ConfigFormProps {
  initialGroupDeadline: string | null
  initialRevealAt: string | null
  r16FirstDeadline: string | null
  r16RestDeadline: string | null
}

/**
 * Convierte un ISO string (con TZ) al formato esperado por <input type="datetime-local">,
 * que es "YYYY-MM-DDTHH:mm" interpretado en zona horaria local del navegador.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Convierte el valor de un <input type="datetime-local"> a ISO con TZ (UTC).
 */
function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function fmtRead(iso: string | null) {
  if (!iso) return 'No configurado'
  return format(new Date(iso), "d 'de' MMMM yyyy · HH:mm", { locale: es })
}

export default function ConfigForm(props: ConfigFormProps) {
  const [groupDeadline, setGroupDeadline] = useState(isoToLocalInput(props.initialGroupDeadline))
  const [revealAt, setRevealAt] = useState(isoToLocalInput(props.initialRevealAt))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty =
    groupDeadline !== isoToLocalInput(props.initialGroupDeadline) ||
    revealAt !== isoToLocalInput(props.initialRevealAt)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const res = await updateConfigAction({
        groupDeadline: localInputToIso(groupDeadline),
        revealPredictionsAt: localInputToIso(revealAt),
      })
      if (res.error) { setError(res.error); return }
      setSuccess(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Editables */}
      <section className="rounded-2xl bg-[#111827] border border-white/8 p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <Calendar size={14} className="text-amber-400" /> Fase de Grupos
        </h2>
        <DatetimeField
          label="Fecha límite de envío"
          help="Hasta cuándo los jugadores pueden confirmar sus pronósticos de la fase de grupos. Después de esta fecha, todo queda bloqueado."
          value={groupDeadline}
          onChange={setGroupDeadline}
        />

        <h2 className="text-white font-semibold text-sm flex items-center gap-2 pt-2">
          <Eye size={14} className="text-amber-400" /> Visibilidad de pronósticos ajenos
        </h2>
        <DatetimeField
          label="Revelar a partir de"
          help="A partir de esta fecha, todos los participantes pueden ver los pronósticos de los demás. Antes, sólo el dueño y el admin tienen acceso."
          value={revealAt}
          onChange={setRevealAt}
        />
      </section>

      {/* Lectura: r16 deadlines (los setea la API) */}
      <section className="rounded-2xl bg-slate-900/40 border border-white/5 p-5 space-y-3">
        <h2 className="text-slate-400 font-semibold text-xs uppercase tracking-wide">
          Eliminatoria — autoconfigurado por la API (Fase 3 pendiente)
        </h2>
        <ReadField label="Deadline 1er partido 16avos" value={fmtRead(props.r16FirstDeadline)} />
        <ReadField label="Deadline resto de la eliminatoria" value={fmtRead(props.r16RestDeadline)} />
      </section>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
          <CheckCircle2 size={15} /> Configuración guardada
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !dirty}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Guardar cambios
      </button>
    </form>
  )
}

function DatetimeField({
  label, help, value, onChange,
}: { label: string; help?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <input
        type="datetime-local"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500/60 focus:bg-amber-500/5 transition-all
          [color-scheme:dark]"
      />
      {help && <p className="text-slate-500 text-xs mt-1">{help}</p>}
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono text-slate-300">{value}</span>
    </div>
  )
}
