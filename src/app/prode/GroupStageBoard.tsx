'use client'

import { useMemo, useState, useTransition, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Clock, Lock, AlertCircle, Send, Loader2 } from 'lucide-react'
import MatchCard from '@/components/MatchCard'
import type { Group, Match } from '@/lib/fixture'
import { computeGroupStandings, type GroupMatch, type StandingRow } from '@/lib/standings'
import { confirmGroupSubmission } from './actions'
import StandingsModal from './StandingsModal'

interface PredictionRow {
  match_id: string
  home_score: number | null
  away_score: number | null
  result_points?: number | null
  bonus_points?: number | null
}

interface RealResultRow {
  match_id: string
  home_score: number | null
  away_score: number | null
  status: string
}

interface GroupStageBoardProps {
  groups: Group[]
  matches: Match[]
  initialPredictions: PredictionRow[]
  submittedAt: string | null
  groupDeadline: string | null
  realResults: RealResultRow[]
}

type ScoresState = Record<string, { home: number | null; away: number | null }>

type Phase1Status = 'submitted' | 'closed_not_submitted' | 'open'

export default function GroupStageBoard({
  groups,
  matches,
  initialPredictions,
  submittedAt,
  groupDeadline,
  realResults,
}: GroupStageBoardProps) {
  const deadlineDate = groupDeadline ? new Date(groupDeadline) : null
  const deadlinePassed = !!deadlineDate && deadlineDate.getTime() < Date.now()

  const status: Phase1Status = submittedAt
    ? 'submitted'
    : deadlinePassed
      ? 'closed_not_submitted'
      : 'open'

  const locked = status !== 'open'
  const lockedReason =
    status === 'submitted' ? 'Ya enviaste tus pronósticos' :
    status === 'closed_not_submitted' ? 'La fecha límite ya pasó' :
    undefined

  const resultsByMatch = useMemo(() => {
    const m = new Map<string, RealResultRow>()
    for (const r of realResults) m.set(r.match_id, r)
    return m
  }, [realResults])

  // Estado local de scores: se inicializa con las predictions guardadas
  const [scores, setScores] = useState<ScoresState>(() => {
    const m: ScoresState = {}
    for (const p of initialPredictions) {
      m[p.match_id] = { home: p.home_score, away: p.away_score }
    }
    return m
  })

  const handleCardChange = useCallback((matchId: string, home: number | null, away: number | null) => {
    setScores(s => ({ ...s, [matchId]: { home, away } }))
  }, [])

  // Validación de completitud
  const { filledCount, missing } = useMemo(() => {
    const missing: string[] = []
    let filled = 0
    for (const m of matches) {
      const s = scores[m.id]
      if (s && s.home !== null && s.away !== null) filled += 1
      else missing.push(m.id)
    }
    return { filledCount: filled, missing }
  }, [scores, matches])

  // Posiciones calculadas en vivo
  const liveStandings = useMemo<Record<string, StandingRow[] | null>>(() => {
    const out: Record<string, StandingRow[] | null> = {}
    for (const g of groups) {
      const gMatches: GroupMatch[] = []
      let complete = true
      for (const m of matches.filter(x => x.group === g.id)) {
        const s = scores[m.id]
        if (!s || s.home === null || s.away === null) { complete = false; break }
        gMatches.push({ match: m, home: s.home, away: s.away })
      }
      out[g.id] = complete ? computeGroupStandings(g.teams, gMatches) : null
    }
    return out
  }, [scores, groups, matches])

  // Modal de confirmación
  const [modalOpen, setModalOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openConfirm() {
    setSubmitError(null)
    if (missing.length > 0) return
    setModalOpen(true)
  }

  function doSubmit() {
    startTransition(async () => {
      const res = await confirmGroupSubmission()
      if (res.error) {
        setSubmitError(res.error)
        return
      }
      // El revalidatePath del action hace que la página se renderice de nuevo como "submitted"
      window.location.reload()
    })
  }

  // Ranking / stats
  const totalMatches = matches.length
  const earnedPoints = initialPredictions.reduce(
    (acc, p) => acc + (p.result_points ?? 0) + (p.bonus_points ?? 0),
    0
  )

  // Submitted: mostrar timestamp formateado
  const submittedAtStr = submittedAt
    ? format(new Date(submittedAt), "d 'de' MMMM 'a las' HH:mm", { locale: es })
    : null

  const deadlineStr = deadlineDate
    ? format(deadlineDate, "d 'de' MMMM 'a las' HH:mm", { locale: es })
    : null

  return (
    <>
      {/* Hero header */}
      <div className="mb-8 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Mundial 2026 · 11 Jun – 19 Jul
        </div>
        <h1 className="text-3xl font-bold text-white mb-1">Mi Prode · Fase de Grupos</h1>
        <p className="text-slate-400 text-sm">
          <span className="text-amber-400 font-medium">3 pts</span> resultado exacto ·{' '}
          <span className="text-green-400 font-medium">1 pt</span> ganador correcto ·{' '}
          <span className="text-sky-400 font-medium">2 pts</span> por equipo en posición exacta
        </p>
      </div>

      {/* Status banner */}
      <StatusBanner
        status={status}
        deadlineStr={deadlineStr}
        submittedAtStr={submittedAtStr}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="Cargados" value={`${filledCount}/${totalMatches}`} color="text-white" />
        <Stat label="Puntos" value={earnedPoints} color="text-amber-400" />
        <Stat label="Faltantes" value={missing.length} color={missing.length === 0 ? 'text-green-400' : 'text-red-400'} />
      </div>

      {/* Submit CTA */}
      {status === 'open' && (
        <div className="mb-8 rounded-2xl bg-[#111827] border border-amber-500/20 p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-bold text-sm">¿Listo para enviar?</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Una vez que confirmes, no podrás editar tus pronósticos. Las posiciones de cada grupo se calculan automáticamente.
            </p>
          </div>
          <button
            onClick={openConfirm}
            disabled={missing.length > 0 || isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            <Send size={15} />
            Confirmar envío
          </button>
        </div>
      )}

      {submitError && (
        <div className="mb-6 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {submitError}
        </div>
      )}

      {/* Grupos */}
      {groups.map(group => {
        const gMatches = matches.filter(m => m.group === group.id)
        const groupComplete = gMatches.every(m => {
          const s = scores[m.id]
          return s && s.home !== null && s.away !== null
        })
        const standing = liveStandings[group.id]
        return (
          <section key={group.id} className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-sm font-bold text-white">
                  {group.id}
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg leading-none">{group.name}</h2>
                  <p className="text-slate-500 text-xs mt-0.5">{group.teams.join(' · ')}</p>
                </div>
              </div>
              {groupComplete && standing && (
                <MiniStandings standings={standing} />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gMatches.map(match => {
                const pred = initialPredictions.find(p => p.match_id === match.id)
                const matchStarted = new Date(match.date) < new Date()
                const matchResult = resultsByMatch.get(match.id)
                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    initialHome={pred?.home_score ?? null}
                    initialAway={pred?.away_score ?? null}
                    points={pred ? (pred.result_points ?? 0) + (pred.bonus_points ?? 0) : null}
                    resultPoints={pred?.result_points ?? null}
                    bonusPoints={pred?.bonus_points ?? null}
                    locked={locked}
                    lockedReason={lockedReason}
                    matchStarted={matchStarted}
                    onChange={handleCardChange}
                    realHomeScore={matchResult?.home_score ?? null}
                    realAwayScore={matchResult?.away_score ?? null}
                    realStatus={matchResult?.status ?? null}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Modal de confirmación con posiciones calculadas */}
      {modalOpen && (
        <StandingsModal
          groups={groups}
          standings={liveStandings}
          onCancel={() => setModalOpen(false)}
          onConfirm={doSubmit}
          isPending={isPending}
        />
      )}
    </>
  )
}

function StatusBanner({
  status,
  deadlineStr,
  submittedAtStr,
}: {
  status: Phase1Status
  deadlineStr: string | null
  submittedAtStr: string | null
}) {
  if (status === 'submitted') {
    return (
      <div className="mb-6 rounded-2xl bg-green-500/10 border border-green-500/20 p-4 flex items-start gap-3">
        <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-green-300 font-bold text-sm">Pronósticos enviados</h3>
          <p className="text-green-200/70 text-xs mt-0.5">
            Confirmaste tu envío el {submittedAtStr}. Tus pronósticos quedaron en modo lectura.
          </p>
        </div>
      </div>
    )
  }
  if (status === 'closed_not_submitted') {
    return (
      <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 flex items-start gap-3">
        <Lock size={20} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-red-300 font-bold text-sm">Tiempo agotado</h3>
          <p className="text-red-200/70 text-xs mt-0.5">
            La fecha límite ({deadlineStr}) pasó y no enviaste tus pronósticos. La Fase 1 queda anulada.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
      <Clock size={20} className="text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-amber-300 font-bold text-sm">Abierto</h3>
        <p className="text-amber-200/70 text-xs mt-0.5">
          {deadlineStr
            ? <>Tenés tiempo para enviar hasta el <span className="font-semibold">{deadlineStr}</span>.</>
            : 'El administrador todavía no configuró la fecha límite. Vas guardando como borrador.'}
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/6 px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function MiniStandings({ standings }: { standings: StandingRow[] }) {
  return (
    <div className="flex items-center gap-1 text-xs text-slate-400">
      <span className="text-slate-500 mr-1">Tu pronóstico:</span>
      {standings.map(s => (
        <span key={s.position} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/8">
          <span className="text-amber-400 font-bold">{s.position}°</span>{' '}
          <span className="text-white">{s.team}</span>
        </span>
      ))}
    </div>
  )
}
