'use client'

import { useMemo, useState } from 'react'
import TeamName from '@/components/TeamName'
import type { Group, Match, BracketSlot, Phase } from '@/lib/fixture'
import { computeGroupStandings } from '@/lib/standings'
import { Award, CheckCircle2, XCircle, Clock, Trophy } from 'lucide-react'

export interface PredItem {
  match_id: string
  phase: Phase
  home_score: number | null
  away_score: number | null
  home_score_120: number | null
  away_score_120: number | null
  pen_winner: string | null
  result_points: number | null
  bonus_points: number | null
}

export interface ResultItem {
  match_id: string
  phase: Phase
  home_score: number | null
  away_score: number | null
  home_score_120: number | null
  away_score_120: number | null
  went_to_pens: boolean
  pen_winner: string | null
  status: string
}

export interface BracketItem {
  match_id: string
  home_team: string | null
  away_team: string | null
  scheduled_at: string | null
  defined: boolean
}

interface Props {
  groups: Group[]
  groupMatches: Match[]
  bracketSlots: BracketSlot[]
  phaseLabels: Record<Phase, string>
  predictions: PredItem[]
  results: ResultItem[]
  bracket: BracketItem[]
  realGroupStandings?: { group_id: string; position: number; team: string; finalized: boolean }[]
}

export default function PublicPredictionsViewer(props: Props) {
  const predByMatch = useMemo(() => {
    const m = new Map<string, PredItem>()
    for (const p of props.predictions) m.set(p.match_id, p)
    return m
  }, [props.predictions])

  const resultByMatch = useMemo(() => {
    const m = new Map<string, ResultItem>()
    for (const r of props.results) m.set(r.match_id, r)
    return m
  }, [props.results])

  const bracketByMatch = useMemo(() => {
    const m = new Map<string, BracketItem>()
    for (const b of props.bracket) m.set(b.match_id, b)
    return m
  }, [props.bracket])

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

  const getPredictedWinner = (
    pred: PredItem | undefined,
    homeTeam: string | null,
    awayTeam: string | null,
    wantLoser = false
  ): string | null => {
    if (!pred || !homeTeam || !awayTeam) return null
    if (pred.home_score_120 == null || pred.away_score_120 == null) return null

    let winner: string | null = null
    if (pred.home_score_120 > pred.away_score_120) {
      winner = homeTeam
    } else if (pred.home_score_120 < pred.away_score_120) {
      winner = awayTeam
    } else if (pred.pen_winner) {
      winner = pred.pen_winner
    }

    if (!winner) return null
    if (wantLoser) return winner === homeTeam ? awayTeam : homeTeam
    return winner
  }

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

    for (const round of rounds) {
      for (const slotId of round) {
        const config = WINNER_PROPAGATION[slotId as keyof typeof WINNER_PROPAGATION] as { home: string; away: string; losers?: boolean }
        const homeMatch = bracketMap.get(config.home)
        const awayMatch = bracketMap.get(config.away)

        const homePred = predByMatch.get(config.home)
        const awayPred = predByMatch.get(config.away)

        const homeWinner = getPredictedWinner(homePred, homeMatch?.home ?? null, homeMatch?.away ?? null, !!config.losers)
        const awayWinner = getPredictedWinner(awayPred, awayMatch?.home ?? null, awayMatch?.away ?? null, !!config.losers)

        bracketMap.set(slotId, { home: homeWinner, away: awayWinner })
      }
    }

    return bracketMap
  }, [predByMatch, bracketByMatch, WINNER_PROPAGATION])

  const [tab, setTab] = useState<'group' | 'elim' | 'bonuses'>('group')

  const realStandingsByGroup = useMemo(() => {
    const result = new Map<string, { position: number; team: string; finalized: boolean }[]>()
    if (!props.realGroupStandings) return result
    for (const row of props.realGroupStandings) {
      if (!result.has(row.group_id)) result.set(row.group_id, [])
      result.get(row.group_id)!.push({ position: row.position, team: row.team, finalized: row.finalized })
    }
    for (const [gid, rows] of result.entries()) {
      rows.sort((a, b) => a.position - b.position)
    }
    return result
  }, [props.realGroupStandings])

  const userGroupStandings = useMemo(() => {
    const result = new Map<string, { position: number; team: string }[]>()
    const predMap = new Map<string, { home: number | null; away: number | null }>()
    for (const p of props.predictions) {
      if (p.phase === 'group') {
        predMap.set(p.match_id, { home: p.home_score, away: p.away_score })
      }
    }

    for (const g of props.groups) {
      const gMatchesPred: any[] = []
      let complete = true
      const groupMatches = props.groupMatches.filter(m => m.group === g.id)
      for (const m of groupMatches) {
        const p = predMap.get(m.id)
        if (!p || p.home === null || p.away === null) {
          complete = false
          break
        }
        gMatchesPred.push({ match: m, home: p.home, away: p.away })
      }
      if (!complete) continue
      const standing = computeGroupStandings(g.teams, gMatchesPred)
      if (standing) {
        result.set(g.id, standing.map(row => ({ position: row.position, team: row.team })))
      }
    }
    return result
  }, [props.groups, props.groupMatches, props.predictions])

  // Helper for real winner
  const getRealWinner = (
    result: ResultItem | undefined,
    homeTeam: string | null,
    awayTeam: string | null,
    wantLoser = false
  ): string | null => {
    if (!result || result.status !== 'finished' || !homeTeam || !awayTeam) return null

    let winner: string | null = null
    if (result.went_to_pens && result.pen_winner) {
      winner = result.pen_winner
    } else if (result.home_score_120 != null && result.away_score_120 != null) {
      if (result.home_score_120 > result.away_score_120) winner = homeTeam
      else if (result.home_score_120 < result.away_score_120) winner = awayTeam
    }

    if (!winner) return null
    if (wantLoser) return winner === homeTeam ? awayTeam : homeTeam
    return winner
  }

  const finalTeams = derivedBracket.get('FINAL')
  const finalPred = predByMatch.get('FINAL')
  const thirdTeams = derivedBracket.get('THIRD')
  const thirdPred = predByMatch.get('THIRD')

  const predChampion = getPredictedWinner(finalPred, finalTeams?.home ?? null, finalTeams?.away ?? null, false)
  const predRunner = getPredictedWinner(finalPred, finalTeams?.home ?? null, finalTeams?.away ?? null, true)
  const predThird = getPredictedWinner(thirdPred, thirdTeams?.home ?? null, thirdTeams?.away ?? null, false)
  const predFourth = getPredictedWinner(thirdPred, thirdTeams?.home ?? null, thirdTeams?.away ?? null, true)

  const realFinalTeams = bracketByMatch.get('FINAL')
  const realFinalResult = resultByMatch.get('FINAL')
  const realThirdTeams = bracketByMatch.get('THIRD')
  const realThirdResult = resultByMatch.get('THIRD')

  const realChampion = getRealWinner(realFinalResult, realFinalTeams?.home_team ?? null, realFinalTeams?.away_team ?? null, false)
  const realRunner = getRealWinner(realFinalResult, realFinalTeams?.home_team ?? null, realFinalTeams?.away_team ?? null, true)
  const realThird = getRealWinner(realThirdResult, realThirdTeams?.home_team ?? null, realThirdTeams?.away_team ?? null, false)
  const realFourth = getRealWinner(realThirdResult, realThirdTeams?.home_team ?? null, realThirdTeams?.away_team ?? null, true)

  return (
    <>
      <div className="flex rounded-xl bg-white/4 p-1 mb-6 max-w-lg">
        {[
          { id: 'group', label: 'Fase de grupos' },
          { id: 'elim', label: 'Eliminatoria' },
          { id: 'bonuses', label: 'Bonos (Grupos y Podio)' }
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'group' && (
        <div className="space-y-6">
          {props.groups.map(g => (
            <section key={g.id} className="animate-fade-in-up">
              <h3 className="text-slate-400 font-bold text-sm mb-2 px-1">{g.name}</h3>
              <div className="rounded-xl bg-[#111827] border border-white/8 divide-y divide-white/5 overflow-hidden">
                {props.groupMatches.filter(m => m.group === g.id).map(m => {
                  const pred = predByMatch.get(m.id)
                  const real = resultByMatch.get(m.id)
                  return (
                    <Row
                      key={m.id}
                      matchId={m.id}
                      predHome={m.home}
                      predAway={m.away}
                      realHome={m.home}
                      realAway={m.away}
                      pred={pred}
                      real={real}
                      isElim={false}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'elim' && (
        <div className="space-y-6">
          {(['r32', 'r16', 'qf', 'sf', 'third', 'final'] as Phase[]).map(phase => {
            const phaseSlots = props.bracketSlots.filter(s => s.phase === phase)
            return (
              <section key={phase} className="animate-fade-in-up">
                <h3 className="text-slate-400 font-bold text-sm mb-2 px-1">{props.phaseLabels[phase]}</h3>
                <div className="rounded-xl bg-[#111827] border border-white/8 divide-y divide-white/5 overflow-hidden">
                  {phaseSlots.map(s => {
                    const pred = predByMatch.get(s.id)
                    const real = resultByMatch.get(s.id)
                    const b = bracketByMatch.get(s.id)
                    const userTeams = derivedBracket.get(s.id)
                    return (
                      <Row
                        key={s.id}
                        matchId={s.id}
                        predHome={userTeams?.home ?? null}
                        predAway={userTeams?.away ?? null}
                        realHome={b?.home_team ?? null}
                        realAway={b?.away_team ?? null}
                        pred={pred}
                        real={real}
                        isElim={true}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {tab === 'bonuses' && (
        <div className="space-y-8 animate-fade-in-up">
          {/* Section 1: Tournament Podium */}
          <div className="rounded-2xl border border-white/8 bg-[#111827] p-6">
            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
              <Trophy className="text-amber-400" size={20} />
              Podio del Torneo
            </h3>
            <p className="text-slate-400 text-xs mb-6">
              Puntos acumulados al finalizar el torneo en base a los aciertos exactos de cada puesto del podio.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <PodiumCard
                title="Campeón (1°)"
                predTeam={predChampion}
                realTeam={realChampion}
                ptsLabel="+15 pts"
                isFinished={realFinalResult?.status === 'finished'}
                accentColor="from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-300"
              />
              <PodiumCard
                title="Subcampeón (2°)"
                predTeam={predRunner}
                realTeam={realRunner}
                ptsLabel="+8 pts"
                isFinished={realFinalResult?.status === 'finished'}
                accentColor="from-slate-500/10 to-slate-500/5 border-slate-500/20 text-slate-300"
              />
              <PodiumCard
                title="Tercer Puesto (3°)"
                predTeam={predThird}
                realTeam={realThird}
                ptsLabel="+5 pts"
                isFinished={realThirdResult?.status === 'finished'}
                accentColor="from-amber-700/15 to-amber-700/5 border-amber-700/20 text-amber-600"
              />
              <PodiumCard
                title="Cuarto Puesto (4°)"
                predTeam={predFourth}
                realTeam={realFourth}
                ptsLabel="+3 pts"
                isFinished={realThirdResult?.status === 'finished'}
                accentColor="from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400"
              />
            </div>
          </div>

          {/* Section 2: Group Positions */}
          <div className="rounded-2xl border border-white/8 bg-[#111827] p-6">
            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
              <Award className="text-amber-400" size={20} />
              Posiciones Exactas de Grupos
            </h3>
            <p className="text-slate-400 text-xs mb-6">
              Suma <strong className="text-white">+2 puntos</strong> por cada equipo que coincida exactamente en su posición final de grupo (1° a 4°). Máximo 8 pts por grupo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {props.groups.map(g => {
                const pred = userGroupStandings.get(g.id)
                const real = realStandingsByGroup.get(g.id)
                const hasReal = real && real.length > 0
                const finalized = hasReal && real[0].finalized
                
                let ptsSum = 0
                if (finalized && pred) {
                  for (let i = 0; i < 4; i++) {
                    if (pred[i]?.team === real[i]?.team) ptsSum += 2
                  }
                }

                return (
                  <div key={g.id} className="rounded-xl border border-white/5 bg-white/2 p-4 flex flex-col justify-between hover:border-white/10 transition-colors">
                    <div>
                      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                        <span className="font-bold text-white text-sm">Grupo {g.name.split(' ').pop()}</span>
                        {finalized ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                            +{ptsSum} / 8 pts
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700/20 flex items-center gap-1">
                            <Clock size={9} /> Parcial
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {[1, 2, 3, 4].map(pos => {
                          const pTeam = pred?.[pos - 1]?.team
                          const rTeam = real?.[pos - 1]?.team
                          const isCorrect = finalized && pTeam && rTeam && pTeam === rTeam

                          return (
                            <div key={pos} className="grid grid-cols-[1.5rem_1fr] items-center gap-1.5 text-xs">
                              <span className="font-bold text-slate-500 text-right">{pos}°</span>
                              <div className="flex items-center justify-between min-w-0">
                                <div className="truncate flex-1 min-w-0">
                                  {pTeam ? (
                                    <span className={isCorrect ? 'text-green-400 font-medium' : 'text-slate-300'}>
                                      {pTeam}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 italic">Sin pronóstico</span>
                                  )}
                                  {hasReal && !isCorrect && rTeam && (
                                    <span className="text-[10px] text-slate-500 block leading-tight truncate">
                                      Real: {rTeam}
                                    </span>
                                  )}
                                </div>
                                {finalized && pTeam ? (
                                  isCorrect ? (
                                    <CheckCircle2 size={12} className="text-green-500 shrink-0 ml-1.5" />
                                  ) : (
                                    <XCircle size={12} className="text-red-500/80 shrink-0 ml-1.5" />
                                  )
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PodiumCard({
  title,
  predTeam,
  realTeam,
  ptsLabel,
  isFinished,
  accentColor,
}: {
  title: string
  predTeam: string | null
  realTeam: string | null
  ptsLabel: string
  isFinished: boolean
  accentColor: string
}) {
  const isCorrect = isFinished && predTeam && realTeam && predTeam === realTeam
  
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 flex flex-col justify-between ${accentColor}`}>
      <div>
        <span className="text-xs uppercase font-bold tracking-wide text-slate-400">{title}</span>
        <div className="mt-2 min-h-[3rem]">
          <span className="text-sm font-bold text-white block">
            {predTeam ?? '—'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Pronosticado
          </span>
        </div>
      </div>

      <div className="border-t border-white/5 pt-3 mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] text-slate-500 block">Resultado Real</span>
          <span className="text-xs font-semibold text-slate-300 truncate block">
            {isFinished ? (realTeam ?? '—') : 'A definir'}
          </span>
        </div>

        {isFinished ? (
          isCorrect ? (
            <div className="text-right shrink-0">
              <span className="text-xs font-black text-green-400 block">{ptsLabel}</span>
              <span className="text-[9px] uppercase font-bold text-green-500/80">Acertado</span>
            </div>
          ) : (
            <div className="text-right shrink-0">
              <span className="text-xs font-black text-slate-500 block">0 pts</span>
              <span className="text-[9px] uppercase font-bold text-red-500/80">Incorrecto</span>
            </div>
          )
        ) : (
          <div className="text-right shrink-0">
            <span className="text-xs font-black text-slate-500 block">Pendiente</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  matchId, predHome, predAway, realHome, realAway, pred, real, isElim,
}: {
  matchId: string
  predHome: string | null
  predAway: string | null
  realHome: string | null
  realAway: string | null
  pred?: PredItem
  real?: ResultItem
  isElim: boolean
}) {
  const predScore = isElim
    ? formatPair(pred?.home_score_120, pred?.away_score_120)
    : formatPair(pred?.home_score, pred?.away_score)
  const realScore = isElim
    ? formatPair(real?.home_score_120, real?.away_score_120)
    : formatPair(real?.home_score, real?.away_score)

  const pts = pred ? (pred.result_points ?? 0) + (pred.bonus_points ?? 0) : null

  const getTooltip = () => {
    if (!pred || pred.result_points === null) return undefined
    
    if (!isElim) {
      const rp = pred.result_points ?? 0
      if (rp === 3) return '+3 pts: Resultado exacto'
      if (rp === 1) {
        if (pred.home_score !== null && pred.away_score !== null && pred.home_score === pred.away_score) {
          return '+1 pt: Empate correcto'
        }
        return '+1 pt: Ganador correcto'
      }
      return '0 pts: Sin acierto'
    } else {
      const rp = pred.result_points ?? 0
      const bp = pred.bonus_points ?? 0
      const total = rp + bp

      const lines: string[] = [`Total: +${total} pt${total === 1 ? '' : 's'}`]
      if (rp === 3) {
        lines.push(`  • +3 pts: Resultado exacto a 120' (${real?.home_score_120}:${real?.away_score_120})`)
      } else if (rp === 1) {
        if (pred.home_score_120 !== null && pred.away_score_120 !== null && pred.home_score_120 === pred.away_score_120) {
          lines.push("  • +1 pt: Empate correcto a 120'")
        } else {
          lines.push("  • +1 pt: Ganador correcto a 120'")
        }
      } else {
        lines.push("  • 0 pts: Resultado incorrecto a 120'")
      }

      if (real?.went_to_pens) {
        const isWinnerCorrect = real.pen_winner && pred.pen_winner === real.pen_winner
        if (isWinnerCorrect) {
          lines.push('  • +1 pt: Ganador de penales correcto')
        } else {
          lines.push('  • 0 pts: Ganador de penales incorrecto')
        }
      }

      const hasPenBonus = real?.went_to_pens && pred.pen_winner && real.pen_winner && pred.pen_winner === real.pen_winner
      const penBonusPts = hasPenBonus ? 1 : 0
      const classificationBonusPts = bp - penBonusPts
      if (classificationBonusPts > 0) {
        lines.push('  • +1 pt: Equipo clasificado en posición correcta de grupo')
      }

      return lines.join('\n')
    }
  }

  const tooltip = getTooltip()

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3.5 items-center text-sm hover:bg-white/2 transition-colors">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {predHome ? <TeamName name={predHome} size="sm" /> : <span className="text-slate-600 italic text-xs">A definir</span>}
          <span className="text-slate-600 text-xs">vs</span>
          {predAway ? <TeamName name={predAway} size="sm" /> : <span className="text-slate-600 italic text-xs">A definir</span>}
        </div>
        {isElim && realHome && realAway && real && real.status !== 'scheduled' && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
            <span>Cruce real:</span>
            <span>{realHome}</span>
            <span>vs</span>
            <span>{realAway}</span>
          </div>
        )}
      </div>
      <span className="font-mono text-slate-300 text-xs whitespace-nowrap" title="Pronóstico del participante">
        P: <span className="font-bold text-slate-200">{predScore}</span>
        {isElim && pred?.pen_winner && <span className="text-amber-400 ml-1">/{pred.pen_winner.slice(0, 3)}</span>}
      </span>
      <span className="font-mono text-slate-500 text-xs whitespace-nowrap" title="Resultado real">
        R: <span className="font-bold text-slate-400">{realScore}</span>
        {isElim && real?.went_to_pens && real.pen_winner && <span className="text-amber-400 ml-1">/{real.pen_winner.slice(0, 3)}</span>}
      </span>
      <div className="w-12 text-right">
        {pts != null && real && real.status !== 'scheduled' ? (
          <span title={tooltip} className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            pts >= 3
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : pts > 0
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-slate-800 text-slate-500 border border-slate-700/20'
          }`}>
            {pts > 0 ? `+${pts}` : '0 pts'}
          </span>
        ) : (
          <span className="text-xs text-slate-600 italic">—</span>
        )}
      </div>
    </div>
  )
}

function formatPair(a?: number | null, b?: number | null): string {
  if (a == null || b == null) return '—'
  return `${a}:${b}`
}
