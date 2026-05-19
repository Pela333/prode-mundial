'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, Loader2, Lock, Trophy } from 'lucide-react'
import TeamName from '@/components/TeamName'
import { saveElimDraft } from './actions'

export interface ElimMatchCardProps {
  matchId: string
  phaseLabel: string                    // "16avos #1"
  homeTeam: string | null
  awayTeam: string | null
  scheduledAt: string | null
  defined: boolean

  initialHome120: number | null
  initialAway120: number | null
  initialPenWinner: string | null
  points: number | null

  locked: boolean
  lockedReason?: string

  onChange?: (matchId: string, home: number | null, away: number | null, pen: string | null) => void
}

export default function ElimMatchCard(props: ElimMatchCardProps) {
  const [home, setHome] = useState<string>(props.initialHome120 != null ? String(props.initialHome120) : '')
  const [away, setAway] = useState<string>(props.initialAway120 != null ? String(props.initialAway120) : '')
  const [penWinner, setPenWinner] = useState<string | null>(props.initialPenWinner)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [savedMark, setSavedMark] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function parseScore(v: string): number | null {
    if (v === '') return null
    const n = parseInt(v, 10)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  const onChangeFn = props.onChange
  useEffect(() => {
    if (!onChangeFn) return
    onChangeFn(props.matchId, parseScore(home), parseScore(away), penWinner)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away, penWinner])

  const persist = useCallback((nextHome: string, nextAway: string, nextPen: string | null) => {
    if (props.locked || !props.defined) return
    const h = parseScore(nextHome)
    const a = parseScore(nextAway)

    // Sólo persistir si tenemos al menos algún campo seteado
    if (h === null && a === null && nextPen === null) {
      startTransition(async () => {
        const res = await saveElimDraft({
          matchId: props.matchId, homeScore120: null, awayScore120: null, penWinner: null,
        })
        if (res.error) setError(res.error)
      })
      return
    }

    startTransition(async () => {
      const res = await saveElimDraft({
        matchId: props.matchId,
        homeScore120: h, awayScore120: a, penWinner: nextPen,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setError(null)
        setSavedMark(true)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSavedMark(false), 1500)
      }
    })
  }, [props.locked, props.defined, props.matchId])

  useEffect(() => {
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }
  }, [])

  function handleScore(setter: (v: string) => void, val: string) {
    const n = val.replace(/\D/g, '').slice(0, 2)
    setter(n)
    setError(null)
    setSavedMark(false)
  }

  function handlePen(team: string) {
    const next = penWinner === team ? null : team
    setPenWinner(next)
    setError(null)
    setSavedMark(false)
    persist(home, away, next)
  }

  const inputDisabled = props.locked || !props.defined
  const dateStr = props.scheduledAt
    ? format(new Date(props.scheduledAt), "d MMM · HH:mm", { locale: es })
    : 'A definir'

  const pointsBadge = () => {
    if (props.points === null || props.points === undefined) return null
    if (props.points >= 3) return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
        +{props.points}
      </span>
    )
    if (props.points >= 1) return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-400/10 text-green-400 border border-green-400/20">
        +{props.points}
      </span>
    )
    return null
  }

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      props.locked || !props.defined
        ? 'bg-slate-900/60 border-white/5'
        : 'bg-[#111827] border-white/8 hover:border-amber-500/20'
    }`}>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
            {props.phaseLabel}
          </span>
          <span className="text-slate-500">{dateStr}</span>
        </div>
        <div className="flex items-center gap-1">
          {pointsBadge()}
          {props.locked && props.lockedReason && (
            <span title={props.lockedReason}><Lock size={11} className="text-slate-600" /></span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Marcador a 120' */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {props.homeTeam
              ? <TeamName name={props.homeTeam} align="left" size="md" />
              : <span className="text-slate-600 italic text-sm">A definir</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number" inputMode="numeric" min={0} max={99}
              value={home}
              onChange={e => handleScore(setHome, e.target.value)}
              onBlur={() => persist(home, away, penWinner)}
              disabled={inputDisabled}
              placeholder="–"
              aria-label={`Goles a 120' de ${props.homeTeam ?? 'local'}`}
              className="score-input w-11 h-11 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white outline-none border-white/10 focus:border-amber-500 focus:bg-amber-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-slate-600 text-sm select-none">:</span>
            <input
              type="number" inputMode="numeric" min={0} max={99}
              value={away}
              onChange={e => handleScore(setAway, e.target.value)}
              onBlur={() => persist(home, away, penWinner)}
              disabled={inputDisabled}
              placeholder="–"
              aria-label={`Goles a 120' de ${props.awayTeam ?? 'visitante'}`}
              className="score-input w-11 h-11 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white outline-none border-white/10 focus:border-amber-500 focus:bg-amber-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex-1 min-w-0 flex justify-end">
            {props.awayTeam
              ? <TeamName name={props.awayTeam} align="right" size="md" />
              : <span className="text-slate-600 italic text-sm">A definir</span>}
          </div>
        </div>

        {/* Selector OBLIGATORIO de ganador por penales */}
        <div className="flex items-center gap-2 pt-1">
          <Trophy size={11} className="text-slate-500 shrink-0" />
          <span className="text-xs text-slate-500 shrink-0">Penales →</span>
          <div className="flex gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => props.homeTeam && handlePen(props.homeTeam)}
              disabled={inputDisabled || !props.homeTeam}
              className={`flex-1 px-2 py-1 rounded-md text-xs font-semibold border transition-all min-w-0 truncate ${
                penWinner === props.homeTeam && props.homeTeam
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-white/3 border-white/8 text-slate-400 hover:border-white/15'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {props.homeTeam ?? '—'}
            </button>
            <button
              type="button"
              onClick={() => props.awayTeam && handlePen(props.awayTeam)}
              disabled={inputDisabled || !props.awayTeam}
              className={`flex-1 px-2 py-1 rounded-md text-xs font-semibold border transition-all min-w-0 truncate ${
                penWinner === props.awayTeam && props.awayTeam
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-white/3 border-white/8 text-slate-400 hover:border-white/15'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {props.awayTeam ?? '—'}
            </button>
          </div>
        </div>

        {(error || isPending || savedMark) && !props.locked && (
          <div className="text-xs pt-1">
            {error && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle size={10} /> {error}
              </span>
            )}
            {!error && isPending && (
              <span className="flex items-center gap-1 text-slate-500">
                <Loader2 size={10} className="animate-spin" /> Guardando…
              </span>
            )}
            {!error && !isPending && savedMark && (
              <span className="text-green-500/80">Guardado</span>
            )}
          </div>
        )}

        {!props.defined && (
          <p className="text-[10px] text-slate-600 italic pt-1">
            Esperando que la API defina los equipos de este partido.
          </p>
        )}
      </div>
    </div>
  )
}
