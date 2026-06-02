'use client'

import { useState, useTransition } from 'react'
import type { BracketSlot, Phase } from '@/lib/fixture'
import { PHASE_LABELS } from '@/lib/fixture'
import { updateBracketAction } from './actions'
import { CheckCircle2, Circle, Loader2, ChevronDown, Save } from 'lucide-react'

interface BracketData {
  home_team: string | null
  away_team: string | null
  scheduled_at: string | null
  defined: boolean
}

interface SlotsByPhase {
  phase: Phase
  label: string
  slots: BracketSlot[]
}

interface BracketEditorProps {
  slotsByPhase: SlotsByPhase[]
  bracketMap: Record<string, BracketData>
  teams: string[]
}

type SlotState = {
  homeTeam: string
  awayTeam: string
  scheduledAt: string
  defined: boolean
}

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return ''
  // Convertimos a formato yyyy-MM-ddTHH:mm para el input datetime-local
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

export default function BracketEditor({ slotsByPhase, bracketMap, teams }: BracketEditorProps) {
  // Estado local de cada slot indexado por match_id
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>(() => {
    const init: Record<string, SlotState> = {}
    for (const { slots } of slotsByPhase) {
      for (const s of slots) {
        const b = bracketMap[s.id]
        init[s.id] = {
          homeTeam: b?.home_team ?? '',
          awayTeam: b?.away_team ?? '',
          scheduledAt: toLocalDatetimeValue(b?.scheduled_at ?? null),
          defined: b?.defined ?? false,
        }
      }
    }
    return init
  })

  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, { ok?: boolean; error?: string }>>({})
  const [, startTransition] = useTransition()

  function handleChange(matchId: string, field: keyof SlotState, value: string | boolean) {
    setSlotStates(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }))
    // Limpiar resultado anterior al editar
    setResults(prev => ({ ...prev, [matchId]: {} }))
  }

  function handleSave(slot: BracketSlot) {
    const state = slotStates[slot.id]
    setSaving(prev => ({ ...prev, [slot.id]: true }))
    setResults(prev => ({ ...prev, [slot.id]: {} }))

    startTransition(async () => {
      const result = await updateBracketAction({
        matchId: slot.id,
        phase: slot.phase,
        position: slot.position,
        homeTeam: state.homeTeam || null,
        awayTeam: state.awayTeam || null,
        scheduledAt: toIso(state.scheduledAt),
        defined: state.defined,
      })
      setSaving(prev => ({ ...prev, [slot.id]: false }))
      setResults(prev => ({ ...prev, [slot.id]: result }))
    })
  }

  return (
    <div className="space-y-10">
      {slotsByPhase.map(({ phase, label, slots }) => (
        <section key={phase}>
          {/* Fase header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 px-2">
              {label}
            </span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <div className="grid grid-cols-1 gap-3">
            {slots.map(slot => {
              const state = slotStates[slot.id]
              const isSaving = saving[slot.id]
              const res = results[slot.id]
              const isDefined = state?.defined

              return (
                <div
                  key={slot.id}
                  className={`rounded-2xl border transition-all p-4 ${
                    isDefined
                      ? 'bg-green-950/20 border-green-500/20'
                      : 'bg-[#111827] border-white/8'
                  }`}
                >
                  {/* Header del slot */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded">
                        {slot.id}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {PHASE_LABELS[slot.phase]}
                        {phase !== 'third' && phase !== 'final' ? ` #${slot.position}` : ''}
                      </span>
                    </div>
                    {/* Badge definido */}
                    <button
                      type="button"
                      onClick={() => handleChange(slot.id, 'defined', !state?.defined)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                        isDefined
                          ? 'bg-green-500/15 border-green-500/30 text-green-400'
                          : 'bg-slate-800 border-white/8 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {isDefined
                        ? <CheckCircle2 size={12} />
                        : <Circle size={12} />
                      }
                      {isDefined ? 'Definido' : 'Sin definir'}
                    </button>
                  </div>

                  {/* Campos */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Local */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Local</label>
                      <div className="relative">
                        <select
                          id={`bracket-${slot.id}-home`}
                          value={state?.homeTeam ?? ''}
                          onChange={e => handleChange(slot.id, 'homeTeam', e.target.value)}
                          className="w-full appearance-none bg-slate-900 border border-white/8 text-white text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-amber-500/40 transition-colors"
                        >
                          <option value="">— Equipo —</option>
                          {teams.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Visitante */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Visitante</label>
                      <div className="relative">
                        <select
                          id={`bracket-${slot.id}-away`}
                          value={state?.awayTeam ?? ''}
                          onChange={e => handleChange(slot.id, 'awayTeam', e.target.value)}
                          className="w-full appearance-none bg-slate-900 border border-white/8 text-white text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-amber-500/40 transition-colors"
                        >
                          <option value="">— Equipo —</option>
                          {teams.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Fecha */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Fecha y hora (local)</label>
                      <input
                        id={`bracket-${slot.id}-date`}
                        type="datetime-local"
                        value={state?.scheduledAt ?? ''}
                        onChange={e => handleChange(slot.id, 'scheduledAt', e.target.value)}
                        className="w-full bg-slate-900 border border-white/8 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  {/* Footer: guardar + feedback */}
                  <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
                    <div>
                      {res?.ok && (
                        <span className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 size={12} /> Guardado correctamente
                        </span>
                      )}
                      {res?.error && (
                        <span className="text-xs text-red-400">{res.error}</span>
                      )}
                    </div>
                    <button
                      id={`bracket-save-${slot.id}`}
                      type="button"
                      onClick={() => handleSave(slot)}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 transition-all"
                    >
                      {isSaving
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Save size={13} />
                      }
                      Guardar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
