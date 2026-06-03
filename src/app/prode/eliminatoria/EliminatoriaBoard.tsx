'use client'

import { useMemo, useState, useTransition, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Clock, Lock, AlertCircle, Send, Loader2, Trophy } from 'lucide-react'
import ElimMatchCard from './ElimMatchCard'
import type { BracketSlot, Phase } from '@/lib/fixture'
import { PHASE_LABELS } from '@/lib/fixture'
import { confirmR32FirstSubmission, confirmR32RestSubmission } from './actions'

interface BracketRow {
  match_id: string
  phase: Phase
  position: number
  home_team: string | null
  away_team: string | null
  scheduled_at: string | null
  defined: boolean
}

interface PredRow {
  match_id: string
  home_score_120: number | null
  away_score_120: number | null
  pen_winner: string | null
  result_points: number | null
  bonus_points: number | null
}

interface RealResultRow {
  match_id: string
  home_score_120: number | null
  away_score_120: number | null
  went_to_pens: boolean | null
  pen_winner: string | null
  status: string
}

interface ElimBoardProps {
  slots: BracketSlot[]
  bracket: BracketRow[]
  initialPredictions: PredRow[]
  submittedR32First: string | null
  submittedR32Rest: string | null
  r32FirstDeadline: string | null
  r32RestDeadline: string | null
  realResults: RealResultRow[]
}

type Status = 'pending_api' | 'open' | 'submitted' | 'closed_not_submitted'

const R32_FIRST = 'R32_1'

export default function EliminatoriaBoard({
  slots,
  bracket,
  initialPredictions,
  submittedR32First,
  submittedR32Rest,
  r32FirstDeadline,
  r32RestDeadline,
  realResults,
}: ElimBoardProps) {
  const bracketByMatch = useMemo(() => {
    const m = new Map<string, BracketRow>()
    for (const b of bracket) m.set(b.match_id, b)
    return m
  }, [bracket])

  const predByMatch = useMemo(() => {
    const m = new Map<string, PredRow>()
    for (const p of initialPredictions) m.set(p.match_id, p)
    return m
  }, [initialPredictions])

  const resultsByMatch = useMemo(() => {
    const m = new Map<string, RealResultRow>()
    for (const r of realResults) m.set(r.match_id, r)
    return m
  }, [realResults])

  const r32_1 = bracketByMatch.get(R32_FIRST)
  const r32_1_defined = r32_1?.defined === true

  const allR32Slots = slots.filter(s => s.phase === 'r32')
  const allR32Defined = allR32Slots.every(s => bracketByMatch.get(s.id)?.defined === true)

  const now = Date.now()
  const r32FirstDl = r32FirstDeadline ? new Date(r32FirstDeadline).getTime() : null
  const r32RestDl = r32RestDeadline ? new Date(r32RestDeadline).getTime() : null

  // Status para Parte 1
  let part1Status: Status
  if (submittedR32First) part1Status = 'submitted'
  else if (!r32_1_defined) part1Status = 'pending_api'
  else if (r32FirstDl && r32FirstDl < now) part1Status = 'closed_not_submitted'
  else part1Status = 'open'

  // Status para Parte 2
  let part2Status: Status
  if (submittedR32Rest) part2Status = 'submitted'
  else if (!allR32Defined) part2Status = 'pending_api'
  else if (r32RestDl && r32RestDl < now) part2Status = 'closed_not_submitted'
  else part2Status = 'open'

  // Estado local de scores y pen winners (para validar completitud)
  type LocalPick = { home: number | null; away: number | null; pen: string | null }
  const initialLocal = useMemo(() => {
    const m: Record<string, LocalPick> = {}
    for (const p of initialPredictions) {
      m[p.match_id] = { home: p.home_score_120, away: p.away_score_120, pen: p.pen_winner }
    }
    return m
  }, [initialPredictions])
  const [localPicks, setLocalPicks] = useState<Record<string, LocalPick>>(initialLocal)

  const WINNER_PROPAGATION = useMemo(() => ({
    'R16_1': { home: 'R32_1',  away: 'R32_2'  },
    'R16_2': { home: 'R32_3',  away: 'R32_6'  },
    'R16_3': { home: 'R32_4',  away: 'R32_5'  },
    'R16_4': { home: 'R32_7',  away: 'R32_8'  },
    'R16_5': { home: 'R32_12', away: 'R32_10' },
    'R16_6': { home: 'R32_14', away: 'R32_9'  },
    'R16_7': { home: 'R32_13', away: 'R32_16' },
    'R16_8': { home: 'R32_11', away: 'R32_15' },

    'QF_1': { home: 'R16_1', away: 'R16_2' },
    'QF_2': { home: 'R16_3', away: 'R16_4' },
    'QF_3': { home: 'R16_5', away: 'R16_6' },
    'QF_4': { home: 'R16_7', away: 'R16_8' },

    'SF_1': { home: 'QF_1', away: 'QF_2' },
    'SF_2': { home: 'QF_3', away: 'QF_4' },

    'FINAL': { home: 'SF_1', away: 'SF_2' },
    'THIRD': { home: 'SF_1', away: 'SF_2', losers: true },
  }), [])

  const derivedBracket = useMemo(() => {
    const bracketMap = new Map<string, { home: string | null; away: string | null }>()

    // Initialize R32 slots
    for (let i = 1; i <= 16; i++) {
      const slotId = `R32_${i}`
      const b = bracketByMatch.get(slotId)
      bracketMap.set(slotId, { home: b?.home_team ?? null, away: b?.away_team ?? null })
    }

    const rounds = [
      ['R16_1', 'R16_2', 'R16_3', 'R16_4', 'R16_5', 'R16_6', 'R16_7', 'R16_8'],
      ['QF_1', 'QF_2', 'QF_3', 'QF_4'],
      ['SF_1', 'SF_2'],
      ['FINAL', 'THIRD']
    ]

    const getPredictedWinner = (
      pred: LocalPick | undefined,
      homeTeam: string | null,
      awayTeam: string | null,
      wantLoser = false
    ): string | null => {
      if (!pred || !homeTeam || !awayTeam) return null
      if (pred.home == null || pred.away == null) return null

      let winner: string | null = null
      if (pred.home > pred.away) {
        winner = homeTeam
      } else if (pred.home < pred.away) {
        winner = awayTeam
      } else if (pred.pen) {
        winner = pred.pen
      }

      if (!winner) return null
      if (wantLoser) return winner === homeTeam ? awayTeam : homeTeam
      return winner
    }

    for (const round of rounds) {
      for (const slotId of round) {
        const config = WINNER_PROPAGATION[slotId as keyof typeof WINNER_PROPAGATION] as { home: string; away: string; losers?: boolean }
        const homeMatch = bracketMap.get(config.home)
        const awayMatch = bracketMap.get(config.away)

        const homePred = localPicks[config.home]
        const awayPred = localPicks[config.away]

        const homeWinner = getPredictedWinner(homePred, homeMatch?.home ?? null, homeMatch?.away ?? null, !!config.losers)
        const awayWinner = getPredictedWinner(awayPred, awayMatch?.home ?? null, awayMatch?.away ?? null, !!config.losers)

        bracketMap.set(slotId, { home: homeWinner, away: awayWinner })
      }
    }

    return bracketMap
  }, [localPicks, bracketByMatch, WINNER_PROPAGATION])

  const handleCardChange = useCallback((matchId: string, home: number | null, away: number | null, pen: string | null) => {
    setLocalPicks(s => ({ ...s, [matchId]: { home, away, pen } }))
  }, [])

  // Faltantes para Parte 1 = sólo R32_1
  const part1Missing = useMemo(() => {
    if (!r32_1_defined) return []
    const p = localPicks[R32_FIRST]
    if (!p || p.home == null || p.away == null || !p.pen) return [R32_FIRST]
    return []
  }, [localPicks, r32_1_defined])

  // Faltantes para Parte 2 = todos los slots menos R32_1
  const part2Missing = useMemo(() => {
    if (!allR32Defined) return []
    const missing: string[] = []
    for (const slot of slots) {
      if (slot.id === R32_FIRST) continue
      const p = localPicks[slot.id]
      if (!p || p.home == null || p.away == null || !p.pen) {
        missing.push(slot.id)
      }
    }
    return missing
  }, [localPicks, slots, allR32Defined])

  // Submission handlers
  const [submitErrPart1, setSubmitErrPart1] = useState<string | null>(null)
  const [submitErrPart2, setSubmitErrPart2] = useState<string | null>(null)
  const [isP1Pending, p1Transition] = useTransition()
  const [isP2Pending, p2Transition] = useTransition()

  function submitPart1() {
    setSubmitErrPart1(null)
    p1Transition(async () => {
      const res = await confirmR32FirstSubmission()
      if (res.error) { setSubmitErrPart1(res.error); return }
      window.location.reload()
    })
  }

  function submitPart2() {
    setSubmitErrPart2(null)
    p2Transition(async () => {
      const res = await confirmR32RestSubmission()
      if (res.error) { setSubmitErrPart2(res.error); return }
      window.location.reload()
    })
  }

  // Stats
  const totalElim = slots.length
  const filledCount = slots.filter(s => {
    const p = localPicks[s.id]
    return p && p.home !== null && p.away !== null && p.pen
  }).length
  const earnedPoints = initialPredictions.reduce(
    (acc, p) => acc + (p.result_points ?? 0) + (p.bonus_points ?? 0), 0,
  )

  // Render por fase
  function phaseLabel(phase: Phase, position?: number): string {
    const base = PHASE_LABELS[phase]
    if (phase === 'third' || phase === 'final') return base
    if (position) return `${base} #${position}`
    return base
  }

  function renderSlot(slot: BracketSlot) {
    const b = bracketByMatch.get(slot.id)
    const p = predByMatch.get(slot.id)
    const r = resultsByMatch.get(slot.id)
    const isPart1 = slot.id === R32_FIRST
    const status = isPart1 ? part1Status : part2Status
    const locked = status !== 'open'
    const lockedReason =
      status === 'submitted' ? 'Ya enviaste' :
      status === 'closed_not_submitted' ? 'Tiempo agotado' :
      status === 'pending_api' ? 'Esperando confirmación del administrador' : undefined

    // Proyección del bracket del usuario
    const userTeams = derivedBracket.get(slot.id)
    const userHome = userTeams?.home ?? null
    const userAway = userTeams?.away ?? null
    const isDefined = slot.phase === 'r32' ? (b?.defined === true) : (userHome !== null && userAway !== null)

    return (
      <ElimMatchCard
        key={slot.id}
        matchId={slot.id}
        phaseLabel={phaseLabel(slot.phase, slot.position)}
        homeTeam={userHome}
        awayTeam={userAway}
        scheduledAt={b?.scheduled_at ?? null}
        defined={isDefined}
        initialHome120={p?.home_score_120 ?? null}
        initialAway120={p?.away_score_120 ?? null}
        initialPenWinner={p?.pen_winner ?? null}
        points={p ? (p.result_points ?? 0) + (p.bonus_points ?? 0) : null}
        resultPoints={p?.result_points ?? null}
        bonusPoints={p?.bonus_points ?? null}
        locked={locked}
        lockedReason={lockedReason}
        onChange={handleCardChange}
        realHomeTeam={b?.home_team ?? null}
        realAwayTeam={b?.away_team ?? null}
        realHome120={r?.home_score_120 ?? null}
        realAway120={r?.away_score_120 ?? null}
        realWentToPens={r?.went_to_pens ?? false}
        realPenWinner={r?.pen_winner ?? null}
        realStatus={r?.status ?? null}
      />
    )
  }

  return (
    <>
      <div className="mb-8 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
          <Trophy size={12} /> Fase Eliminatoria
        </div>
        <h1 className="text-3xl font-bold text-white mb-1">Mi Prode · Eliminatoria</h1>
        <p className="text-slate-400 text-sm">
          Marcador a 120&apos; (incluyendo prórroga, antes de penales) +{' '}
          <span className="text-amber-400 font-medium">selector obligatorio</span> de ganador por penales.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="Cargados" value={`${filledCount}/${totalElim}`} color="text-white" />
        <Stat label="Puntos elim." value={earnedPoints} color="text-amber-400" />
        <Stat
          label="Faltantes"
          value={part1Missing.length + part2Missing.length}
          color={part1Missing.length + part2Missing.length === 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* PARTE 1 */}
      <section className="mb-10">
        <SectionHeader
          number={1}
          title="1er partido de 16avos"
          status={part1Status}
          deadline={r32FirstDeadline}
          submittedAt={submittedR32First}
        />

        {part1Status === 'pending_api' ? (
          <PendingApiCard text="El administrador todavía no confirmó el cruce 2° Grupo A vs 2° Grupo B." />
        ) : (
          <>
            <div className="max-w-md">
              {renderSlot(slots.find(s => s.id === R32_FIRST)!)}
            </div>

            {part1Status === 'open' && (
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap rounded-2xl bg-[#111827] border border-amber-500/20 p-4">
                <div>
                  <p className="text-white font-bold text-sm">Confirmar Parte 1</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Después de confirmar, no podés modificar este pronóstico.
                  </p>
                </div>
                <button
                  onClick={submitPart1}
                  disabled={part1Missing.length > 0 || isP1Pending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
                >
                  {isP1Pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Confirmar
                </button>
              </div>
            )}

            {submitErrPart1 && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                <AlertCircle size={14} /> {submitErrPart1}
              </div>
            )}
          </>
        )}
      </section>

      {/* PARTE 2 */}
      <section className="mb-10">
        <SectionHeader
          number={2}
          title="Resto de la fase eliminatoria"
          status={part2Status}
          deadline={r32RestDeadline}
          submittedAt={submittedR32Rest}
        />

        {part2Status === 'pending_api' ? (
          <PendingApiCard text="El administrador todavía no confirmó los 16 cruces de 16avos. Esta sección se habilita cuando termine la fase de grupos." />
        ) : (
          <>
            {(['r32', 'r16', 'qf', 'sf', 'third', 'final'] as Phase[]).map(phase => {
              const phaseSlots = slots.filter(s => s.phase === phase && s.id !== R32_FIRST)
              if (phaseSlots.length === 0) return null
              return (
                <div key={phase} className="mb-6">
                  <h3 className="text-slate-400 font-semibold text-xs uppercase tracking-wide mb-3">
                    {PHASE_LABELS[phase]}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {phaseSlots.map(s => renderSlot(s))}
                  </div>
                </div>
              )
            })}

            {part2Status === 'open' && (
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap rounded-2xl bg-[#111827] border border-amber-500/20 p-4">
                <div>
                  <p className="text-white font-bold text-sm">Confirmar Parte 2</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Tenés que cargar marcador y ganador por penales en los {totalElim - 1} partidos.
                    Faltan: <span className="text-amber-400 font-bold">{part2Missing.length}</span>
                  </p>
                </div>
                <button
                  onClick={submitPart2}
                  disabled={part2Missing.length > 0 || isP2Pending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
                >
                  {isP2Pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Confirmar todo
                </button>
              </div>
            )}

            {submitErrPart2 && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                <AlertCircle size={14} /> {submitErrPart2}
              </div>
            )}
          </>
        )}
      </section>
    </>
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

function SectionHeader({
  number, title, status, deadline, submittedAt,
}: {
  number: number; title: string; status: Status; deadline: string | null; submittedAt: string | null
}) {
  const dlStr = deadline ? format(new Date(deadline), "d 'de' MMMM HH:mm", { locale: es }) : null
  const subStr = submittedAt ? format(new Date(submittedAt), "d 'de' MMMM HH:mm", { locale: es }) : null

  let banner: React.ReactNode
  switch (status) {
    case 'submitted':
      banner = (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 size={15} className="text-green-400" />
          <span className="text-green-300">Enviado el {subStr}</span>
        </div>
      ); break
    case 'closed_not_submitted':
      banner = (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2 text-sm">
          <Lock size={15} className="text-red-400" />
          <span className="text-red-300">Tiempo agotado ({dlStr}) — anulado</span>
        </div>
      ); break
    case 'pending_api':
      banner = (
        <div className="rounded-xl bg-slate-700/30 border border-white/5 p-3 flex items-center gap-2 text-sm">
          <Clock size={15} className="text-slate-400" />
          <span className="text-slate-400">Esperando confirmación del administrador</span>
        </div>
      ); break
    case 'open':
      banner = (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-2 text-sm">
          <Clock size={15} className="text-amber-400" />
          <span className="text-amber-300">Abierto {dlStr ? `· hasta ${dlStr}` : ''}</span>
        </div>
      ); break
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-sm font-bold text-white">
          {number}
        </div>
        <h2 className="text-white font-bold text-lg">{title}</h2>
      </div>
      {banner}
    </div>
  )
}

function PendingApiCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-slate-900/40 border border-white/5 p-6 text-center">
      <Clock size={28} className="text-slate-500 mx-auto mb-2" />
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  )
}
