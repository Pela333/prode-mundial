'use client'

import { X, AlertTriangle, Loader2, Send } from 'lucide-react'
import { useEffect } from 'react'
import TeamName from '@/components/TeamName'
import type { Group } from '@/lib/fixture'
import type { StandingRow } from '@/lib/standings'

interface StandingsModalProps {
  groups: Group[]
  standings: Record<string, StandingRow[] | null>
  onCancel: () => void
  onConfirm: () => void
  isPending: boolean
}

const POSITION_LABEL = ['1°', '2°', '3°', '4°']
const POSITION_COLORS = [
  'text-amber-400',
  'text-slate-300',
  'text-amber-600',
  'text-slate-500',
]

export default function StandingsModal({ groups, standings, onCancel, onConfirm, isPending }: StandingsModalProps) {
  // Cerrar con ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, isPending])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-[#111827] rounded-2xl border border-white/8 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-white font-bold text-lg">Revisá tus posiciones</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Estas son las posiciones que se calcularon a partir de tus marcadores.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-white p-1 rounded disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => {
            const rows = standings[group.id]
            return (
              <div key={group.id} className="rounded-xl bg-white/3 border border-white/6 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                    {group.id}
                  </div>
                  <span className="text-slate-400 text-xs">{group.name}</span>
                </div>
                {!rows ? (
                  <p className="text-red-400 text-xs">No se pudo calcular</p>
                ) : (
                  <ol className="space-y-1.5">
                    {rows.map((r, i) => (
                      <li key={r.position} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-bold text-xs w-5 shrink-0 ${POSITION_COLORS[i]}`}>
                            {POSITION_LABEL[i]}
                          </span>
                          <TeamName name={r.team} size="sm" />
                        </div>
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {r.points} pts · {r.gd > 0 ? '+' : ''}{r.gd}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-amber-500/5">
          <div className="flex items-start gap-2 text-amber-300 text-xs mb-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>
              Una vez que confirmes el envío, <span className="font-semibold">no podrás modificar</span> ningún
              marcador ni posición. Las posiciones se recalculan al cierre del Mundial según los criterios FIFA.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Confirmar y enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
