'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MapPin, Clock, AlertCircle, Loader2, Lock } from 'lucide-react'
import TeamName from './TeamName'
import type { Match } from '@/lib/fixture'
import { saveGroupDraft } from '@/app/prode/actions'

interface MatchCardProps {
  match: Match
  initialHome?: number | null
  initialAway?: number | null
  points?: number | null
  /** locked = no se puede editar (submitted, deadline pasada, o admin lo cerró) */
  locked: boolean
  /** lockedReason = motivo del bloqueo para tooltip */
  lockedReason?: string
  /** Si el partido empezó (cerrado para el público) */
  matchStarted?: boolean
  /** Notifica al padre cuando cambian los scores localmente (para validación de completitud) */
  onChange?: (matchId: string, home: number | null, away: number | null) => void
  realHomeScore?: number | null
  realAwayScore?: number | null
  realStatus?: string | null
}

export default function MatchCard({
  match,
  initialHome,
  initialAway,
  points,
  locked,
  lockedReason,
  matchStarted,
  onChange,
  realHomeScore,
  realAwayScore,
  realStatus,
}: MatchCardProps) {
  const [home, setHome] = useState<string>(initialHome != null ? String(initialHome) : '')
  const [away, setAway] = useState<string>(initialAway != null ? String(initialAway) : '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [savedMark, setSavedMark] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function parseScore(v: string): number | null {
    if (v === '') return null
    const n = parseInt(v, 10)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  useEffect(() => {
    if (!onChange) return
    onChange(match.id, parseScore(home), parseScore(away))
    // intentional: only re-fire when local strings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away])

  function handleInput(setter: (v: string) => void, val: string) {
    let clean = val.replace(/\D/g, '')
    if (clean.length > 1 && clean.startsWith('0')) {
      clean = String(parseInt(clean, 10))
    }
    const n = clean.slice(0, 2)
    setter(n)
    setError(null)
    setSavedMark(false)
  }

  function persist(nextHome: string, nextAway: string) {
    if (locked) return
    const h = parseScore(nextHome)
    const a = parseScore(nextAway)

    // Solo persistir si ambos están seteados; si están a mitad lo dejamos en local
    if (h === null && a === null) {
      // borrar
      startTransition(async () => {
        const res = await saveGroupDraft({ matchId: match.id, homeScore: null, awayScore: null })
        if (res.error) setError(res.error)
      })
      return
    }
    if (h === null || a === null) return

    startTransition(async () => {
      const res = await saveGroupDraft({ matchId: match.id, homeScore: h, awayScore: a })
      if (res.error) {
        setError(res.error)
      } else {
        setSavedMark(true)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSavedMark(false), 1500)
      }
    })
  }

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const matchDate = new Date(match.date)
  const dateStr = format(matchDate, "d 'de' MMMM · HH:mm", { locale: es })

  const pointsBadge = () => {
    if (points === null || points === undefined) return null
    if (points >= 3) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">
        +{points} exacto
      </span>
    )
    if (points >= 1) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-400/10 text-green-400 border border-green-400/20">
        +{points} pt
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-700/40 text-slate-500 border border-slate-700/40">
        0 pts
      </span>
    )
  }

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      locked
        ? 'bg-slate-900/60 border-white/5'
        : 'bg-[#111827] border-white/8 hover:border-amber-500/20'
    }`}>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {dateStr}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {match.city}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pointsBadge()}
          {locked && lockedReason && (
            <span className="text-xs text-slate-600 font-medium flex items-center gap-1" title={lockedReason}>
              <Lock size={10} />
            </span>
          )}
          {matchStarted && (
            <span className="text-xs text-slate-600 font-medium">Cerrado</span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <TeamName name={match.home} align="left" size="md" />
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={home}
              onChange={e => handleInput(setHome, e.target.value)}
              onBlur={() => persist(home, away)}
              disabled={locked}
              placeholder="–"
              aria-label={`Goles de ${match.home}`}
              className="score-input w-12 h-12 text-center text-xl font-bold rounded-xl border-2 bg-white/5 text-white outline-none transition-all
                border-white/10 focus:border-amber-500 focus:bg-amber-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-slate-600 font-bold text-lg select-none">:</span>
            <input
              type="text"
              inputMode="numeric"
              value={away}
              onChange={e => handleInput(setAway, e.target.value)}
              onBlur={() => persist(home, away)}
              disabled={locked}
              placeholder="–"
              aria-label={`Goles de ${match.away}`}
              className="score-input w-12 h-12 text-center text-xl font-bold rounded-xl border-2 bg-white/5 text-white outline-none transition-all
                border-white/10 focus:border-amber-500 focus:bg-amber-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          {realStatus === 'finished' && realHomeScore != null && realAwayScore != null && (
            <span className="text-[11px] text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-md mt-0.5 select-none whitespace-nowrap">
              Real: {realHomeScore} : {realAwayScore}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex justify-end">
          <TeamName name={match.away} align="right" size="md" />
        </div>
      </div>

      {(error || isPending || savedMark) && !locked && (
        <div className="px-4 pb-2 text-xs">
          {error && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle size={11} /> {error}
            </span>
          )}
          {!error && isPending && (
            <span className="flex items-center gap-1 text-slate-500">
              <Loader2 size={11} className="animate-spin" /> Guardando…
            </span>
          )}
          {!error && !isPending && savedMark && (
            <span className="text-green-500/80">Guardado</span>
          )}
        </div>
      )}
    </div>
  )
}
