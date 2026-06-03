'use client'

import { useMemo, useState } from 'react'
import TeamName from '@/components/TeamName'
import type { Group, Match, BracketSlot, Phase } from '@/lib/fixture'

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

  const [tab, setTab] = useState<'group' | 'elim'>('group')

  return (
    <>
      <div className="flex rounded-xl bg-white/4 p-1 mb-6 max-w-md">
        {(['group', 'elim'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'group' ? 'Fase de grupos' : 'Eliminatoria'}
          </button>
        ))}
      </div>

      {tab === 'group' ? (
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
      ) : (
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
    </>
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
        {isElim && realHome && realAway && (
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
        {pts != null ? (
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
