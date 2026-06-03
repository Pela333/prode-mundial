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

  realHomeTeam?: string | null
  realAwayTeam?: string | null
  realHome120?: number | null
  realAway120?: number | null
  realWentToPens?: boolean | null
  realPenWinner?: string | null
  realStatus?: string | null
  resultPoints?: number | null
  bonusPoints?: number | null
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
    let clean = val.replace(/\D/g, '')
    if (clean.length > 1 && clean.startsWith('0')) {
      clean = String(parseInt(clean, 10))
    }
    const n = clean.slice(0, 2)
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

  const getTooltip = () => {
    if (props.resultPoints === null && props.bonusPoints === null) return undefined
    const rp = props.resultPoints ?? 0
    const bp = props.bonusPoints ?? 0
    const total = rp + bp

    const lines: string[] = [`Total: +${total} pt${total === 1 ? '' : 's'}`]
    if (rp === 3) {
      lines.push(`  • +3 pts: Resultado exacto a 120' (${props.realHome120}:${props.realAway120})`)
    } else if (rp === 1) {
      const ph = parseScore(home)
      const pa = parseScore(away)
      if (ph !== null && pa !== null && ph === pa) {
        lines.push("  • +1 pt: Empate correcto a 120'")
      } else {
        lines.push("  • +1 pt: Ganador correcto a 120'")
      }
    } else {
      lines.push("  • 0 pts: Resultado incorrecto a 120'")
    }

    if (props.realWentToPens) {
      const isWinnerCorrect = props.realPenWinner && penWinner === props.realPenWinner
      if (isWinnerCorrect) {
        lines.push('  • +1 pt: Ganador de penales correcto')
      } else {
        lines.push('  • 0 pts: Ganador de penales incorrecto')
      }
    }

    const hasPenBonus = props.realWentToPens && penWinner && props.realPenWinner && penWinner === props.realPenWinner
    const penBonusPts = hasPenBonus ? 1 : 0
    const classificationBonusPts = bp - penBonusPts
    if (classificationBonusPts > 0) {
      lines.push('  • +1 pt: Equipo clasificado en posición correcta de grupo')
    }

    return lines.join('\n')
  }

  const pointsBadge = () => {
    if (props.points === null || props.points === undefined) return null
    const tooltip = getTooltip()
    if (props.points >= 3) return (
      <span title={tooltip} className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
        +{props.points}
      </span>
    )
    if (props.points >= 1) return (
      <span title={tooltip} className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-400/10 text-green-400 border border-green-400/20">
        +{props.points}
      </span>
    )
    return (
      <span title={tooltip} className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-700/40 text-slate-500 border border-slate-700/40">
        0 pts
      </span>
    )
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
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="text" inputMode="numeric"
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
                type="text" inputMode="numeric"
                value={away}
                onChange={e => handleScore(setAway, e.target.value)}
                onBlur={() => persist(home, away, penWinner)}
                disabled={inputDisabled}
                placeholder="–"
                aria-label={`Goles a 120' de ${props.awayTeam ?? 'visitante'}`}
                className="score-input w-11 h-11 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white outline-none border-white/10 focus:border-amber-500 focus:bg-amber-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
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

        {props.realHomeTeam && props.realAwayTeam && (
          <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-col gap-1 text-[11px] text-slate-500 bg-white/2 -mx-4 -mb-3 px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-400">Partido Real:</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                props.realStatus === 'finished'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : props.realStatus === 'in_progress'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-slate-700/20'
              }`}>
                {props.realStatus === 'finished' ? 'Finalizado' : props.realStatus === 'in_progress' ? 'En vivo' : 'Programado'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex-1 min-w-0">
                <TeamName name={props.realHomeTeam} size="sm" align="left" />
              </div>
              <div className="flex items-center gap-1.5 px-3 font-mono font-bold shrink-0">
                <span className="text-amber-400">
                  {props.realHome120 !== null ? props.realHome120 : '–'}
                </span>
                <span className="text-slate-600">:</span>
                <span className="text-amber-400">
                  {props.realAway120 !== null ? props.realAway120 : '–'}
                </span>
                {props.realWentToPens && props.realPenWinner && (
                  <span className="text-[10px] text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30 px-1 rounded ml-1" title={`Ganador penales: ${props.realPenWinner}`}>
                    {props.realPenWinner.slice(0, 3)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 flex justify-end">
                <TeamName name={props.realAwayTeam} size="sm" align="right" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
