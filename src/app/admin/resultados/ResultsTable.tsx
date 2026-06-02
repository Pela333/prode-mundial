'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, AlertCircle, Loader2, Edit3, X, Save, ShieldAlert, Clock, Shuffle } from 'lucide-react'
import TeamName from '@/components/TeamName'
import type { Phase } from '@/lib/fixture'
import { correctResultAction, generateRandomResultsAction } from './actions'

export interface ResultRow {
  match_id: string
  phase: Phase
  phaseLabel: string
  home_team: string | null
  away_team: string | null
  scheduled_at: string | null
  home_score: number | null
  away_score: number | null
  home_score_120: number | null
  away_score_120: number | null
  went_to_pens: boolean
  pen_winner: string | null
  status: 'scheduled' | 'in_progress' | 'finished'
  manual_override: boolean
  corrected_at: string | null
}

export interface BracketLite {
  home_team: string | null
  away_team: string | null
  scheduled_at: string | null
  defined: boolean
}

export default function ResultsTable({ rows }: { rows: ResultRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isGenerating, startGenTransition] = useTransition()
  const [genError, setGenError] = useState<string | null>(null)
  const [genSuccess, setGenSuccess] = useState<string | null>(null)

  const editing = rows.find(r => r.match_id === editingId)

  function handleGenerateRandom() {
    const confirm = window.confirm(
      "¿Estás seguro de que querés generar resultados aleatorios reales para todos los partidos sincronizados?\n\nEsto sobrescribirá todos los marcadores reales actuales en la base de datos y recalculará los puntos de los participantes."
    )
    if (!confirm) return

    setGenError(null)
    setGenSuccess(null)

    startGenTransition(async () => {
      const res = await generateRandomResultsAction()
      if (res.error) {
        setGenError(res.error)
      } else {
        setGenSuccess(`¡Éxito! Se actualizaron los partidos y se recalcularon ${res.recalculated ?? 0} predicciones.`)
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    })
  }

  return (
    <>
      {/* Botonera de acciones globales */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between p-5 rounded-2xl bg-slate-900/30 border border-white/5 backdrop-blur-md">
        <div>
          <h3 className="text-white font-bold text-sm">Simulador de fixture</h3>
          <p className="text-xs text-slate-400">Generá marcadores realistas automáticos para testear el comportamiento del prode.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button
            onClick={handleGenerateRandom}
            disabled={isGenerating || rows.length === 0}
            className="relative overflow-hidden group flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-300 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 hover:shadow-amber-500/25 border border-amber-500/20 active:scale-95 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin text-black" />
                <span>Generando y recalculando...</span>
              </>
            ) : (
              <>
                <Shuffle size={15} className="text-black group-hover:rotate-180 transition-transform duration-500" />
                <span>Cargar resultados aleatorios</span>
              </>
            )}
          </button>
        </div>
      </div>

      {genError && (
        <div className="mb-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-fade-in">
          <AlertCircle size={16} className="shrink-0" />
          <span>{genError}</span>
        </div>
      )}

      {genSuccess && (
        <div className="mb-4 flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 animate-fade-in">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{genSuccess}</span>
        </div>
      )}

      <div className="rounded-2xl border border-white/6 overflow-hidden bg-[#111827]">
        <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-white/5">
          <span className="w-20">Fase</span>
          <span>Partido</span>
          <span className="text-center w-32">Marcador</span>
          <span className="text-center w-28">Estado</span>
          <span className="text-right w-16">Acción</span>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-slate-500 text-sm">
            No hay resultados sincronizados todavía. Andá a{' '}
            <a href="/admin/api" className="text-amber-400 underline">/admin/api</a> y disparar un sync.
          </div>
        )}

        {rows.map(r => (
          <div
            key={r.match_id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 border-b border-white/4 last:border-0 items-center hover:bg-white/2"
          >
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400 w-20 text-center truncate">
              {r.phaseLabel}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                {r.home_team
                  ? <TeamName name={r.home_team} size="sm" />
                  : <span className="text-slate-600 italic text-xs">A definir</span>}
                <span className="text-slate-600">vs</span>
                {r.away_team
                  ? <TeamName name={r.away_team} size="sm" />
                  : <span className="text-slate-600 italic text-xs">A definir</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                {r.scheduled_at && (
                  <span>{format(new Date(r.scheduled_at), "d MMM HH:mm", { locale: es })}</span>
                )}
                {r.manual_override && (
                  <span className="inline-flex items-center gap-1 text-amber-400 text-[10px]">
                    <ShieldAlert size={10} /> Editado
                  </span>
                )}
              </div>
            </div>

            <div className="text-center w-32 font-mono text-sm">
              <ScoreLabel row={r} />
              {r.went_to_pens && r.pen_winner && (
                <div className="text-[10px] text-amber-400 mt-0.5">P: {r.pen_winner}</div>
              )}
            </div>

            <div className="text-center w-28">
              <StatusBadge status={r.status} />
            </div>

            <div className="w-16 text-right">
              <button
                onClick={() => setEditingId(r.match_id)}
                disabled={!r.home_team || !r.away_team}
                className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Corregir manualmente"
                title={!r.home_team ? 'Esperando equipos definidos' : 'Corregir manualmente'}
              >
                <Edit3 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal row={editing} onClose={() => setEditingId(null)} />
      )}
    </>
  )
}

function ScoreLabel({ row }: { row: ResultRow }) {
  if (row.phase === 'group') {
    if (row.home_score == null || row.away_score == null) return <span className="text-slate-600">—</span>
    return <span className="text-white font-bold">{row.home_score} : {row.away_score}</span>
  }
  // Eliminatoria: a 120'
  if (row.home_score_120 == null || row.away_score_120 == null) return <span className="text-slate-600">—</span>
  return <span className="text-white font-bold">{row.home_score_120} : {row.away_score_120}</span>
}

function StatusBadge({ status }: { status: ResultRow['status'] }) {
  if (status === 'finished')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
        <CheckCircle2 size={11} /> Final
      </span>
    )
  if (status === 'in_progress')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        En curso
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700/40 text-slate-400 border border-slate-600/40">
      <Clock size={11} /> Programado
    </span>
  )
}

function EditModal({ row, onClose }: { row: ResultRow; onClose: () => void }) {
  const isGroup = row.phase === 'group'
  const [home, setHome] = useState(strOrEmpty(isGroup ? row.home_score : row.home_score_120))
  const [away, setAway] = useState(strOrEmpty(isGroup ? row.away_score : row.away_score_120))
  const [pens, setPens] = useState(row.went_to_pens)
  const [penWinner, setPenWinner] = useState<string | null>(row.pen_winner)
  const [status, setStatus] = useState<ResultRow['status']>(row.status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function parseScore(v: string): number | null {
    if (v === '') return null
    const n = parseInt(v, 10)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const h = parseScore(home)
    const a = parseScore(away)

    startTransition(async () => {
      const res = await correctResultAction({
        matchId: row.match_id,
        homeScore: isGroup ? h : null,
        awayScore: isGroup ? a : null,
        homeScore120: isGroup ? null : h,
        awayScore120: isGroup ? null : a,
        wentToPens: !isGroup && pens,
        penWinner: !isGroup && pens ? penWinner : null,
        status,
        reason: reason.trim() || undefined,
      })
      if (res.error) { setError(res.error); return }
      setSuccess(`Resultado actualizado · ${res.recalculated ?? 0} predicciones recalculadas`)
      setTimeout(() => { onClose(); window.location.reload() }, 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] rounded-2xl border border-white/8 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-white font-bold text-base">Corregir resultado</h2>
            <p className="text-slate-400 text-xs mt-0.5">{row.phaseLabel} · {row.match_id}</p>
          </div>
          <button onClick={onClose} disabled={isPending} className="text-slate-400 hover:text-white p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Marcador {isGroup ? "(90')" : "(120', incluye prórroga)"}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white truncate flex-1 text-right">{row.home_team}</span>
              <input type="text" inputMode="numeric" value={home}
                onChange={e => {
                  let clean = e.target.value.replace(/\D/g, '')
                  if (clean.length > 1 && clean.startsWith('0')) clean = String(parseInt(clean, 10))
                  setHome(clean.slice(0, 2))
                }}
                className="score-input w-14 h-10 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white border-white/10 focus:border-amber-500 focus:bg-amber-500/5 outline-none" />
              <span className="text-slate-600">:</span>
              <input type="text" inputMode="numeric" value={away}
                onChange={e => {
                  let clean = e.target.value.replace(/\D/g, '')
                  if (clean.length > 1 && clean.startsWith('0')) clean = String(parseInt(clean, 10))
                  setAway(clean.slice(0, 2))
                }}
                className="score-input w-14 h-10 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white border-white/10 focus:border-amber-500 focus:bg-amber-500/5 outline-none" />
              <span className="text-sm text-white truncate flex-1">{row.away_team}</span>
            </div>
          </div>

          {!isGroup && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={pens} onChange={e => setPens(e.target.checked)} className="rounded" />
                ¿Fue a penales?
              </label>
              {pens && (
                <div className="flex gap-2">
                  {[row.home_team, row.away_team].map(t => t && (
                    <button
                      key={t} type="button"
                      onClick={() => setPenWinner(t)}
                      className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                        penWinner === t
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-white/3 border-white/8 text-slate-400 hover:border-white/15'
                      }`}
                    >
                      Ganó {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Estado</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ResultRow['status'])}
              style={{ colorScheme: 'dark' }}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500/60"
            >
              <option value="scheduled" className="bg-[#111827] text-white">Programado</option>
              <option value="in_progress" className="bg-[#111827] text-white">En curso</option>
              <option value="finished" className="bg-[#111827] text-white">Finalizado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo (opcional)</label>
            <input
              type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej: error de la API, gol anulado por VAR..."
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500/60"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} /> {success}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 shadow-lg shadow-amber-500/20"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar y recalcular
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function strOrEmpty(v: number | null): string {
  return v == null ? '' : String(v)
}
