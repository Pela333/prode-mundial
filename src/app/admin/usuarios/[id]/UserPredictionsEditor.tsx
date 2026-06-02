'use client'

import { useMemo, useState, useTransition } from 'react'
import { Edit3, X, Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import TeamName from '@/components/TeamName'
import type { Group, Match, BracketSlot, Phase } from '@/lib/fixture'
import { adminUpdatePredictionAction } from './actions'

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
  userId: string
  groups: Group[]
  groupMatches: Match[]
  bracketSlots: BracketSlot[]
  phaseLabels: Record<Phase, string>
  predictions: PredItem[]
  results: ResultItem[]
  bracket: BracketItem[]
}

interface EditState {
  matchId: string
  phase: Phase
  homeTeam: string | null
  awayTeam: string | null
  pred: PredItem | null
}

export default function UserPredictionsEditor(props: Props) {
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

  const [editing, setEditing] = useState<EditState | null>(null)
  const [tab, setTab] = useState<'group' | 'elim'>('group')

  function openEdit(matchId: string, phase: Phase, homeTeam: string | null, awayTeam: string | null) {
    setEditing({
      matchId,
      phase,
      homeTeam,
      awayTeam,
      pred: predByMatch.get(matchId) ?? null,
    })
  }

  return (
    <>
      <div className="flex rounded-xl bg-white/4 p-1 mb-4 max-w-md">
        {(['group', 'elim'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
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
            <section key={g.id}>
              <h3 className="text-slate-400 font-semibold text-sm mb-2">{g.name}</h3>
              <div className="rounded-xl bg-[#111827] border border-white/8 divide-y divide-white/5">
                {props.groupMatches.filter(m => m.group === g.id).map(m => {
                  const pred = predByMatch.get(m.id)
                  const real = resultByMatch.get(m.id)
                  return (
                    <Row
                      key={m.id}
                      matchId={m.id}
                      home={m.home}
                      away={m.away}
                      pred={pred}
                      real={real}
                      isElim={false}
                      onEdit={() => openEdit(m.id, 'group', m.home, m.away)}
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
              <section key={phase}>
                <h3 className="text-slate-400 font-semibold text-sm mb-2">{props.phaseLabels[phase]}</h3>
                <div className="rounded-xl bg-[#111827] border border-white/8 divide-y divide-white/5">
                  {phaseSlots.map(s => {
                    const pred = predByMatch.get(s.id)
                    const real = resultByMatch.get(s.id)
                    const b = bracketByMatch.get(s.id)
                    return (
                      <Row
                        key={s.id}
                        matchId={s.id}
                        home={b?.home_team ?? null}
                        away={b?.away_team ?? null}
                        pred={pred}
                        real={real}
                        isElim={true}
                        onEdit={() => openEdit(s.id, phase, b?.home_team ?? null, b?.away_team ?? null)}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {editing && (
        <EditModal
          userId={props.userId}
          state={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function Row({
  matchId, home, away, pred, real, isElim, onEdit,
}: {
  matchId: string
  home: string | null
  away: string | null
  pred?: PredItem
  real?: ResultItem
  isElim: boolean
  onEdit: () => void
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
    
    if (!isGroup) {
      // isElim
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
    } else {
      // isGroup
      const rp = pred.result_points ?? 0
      if (rp === 3) return '+3 pts: Resultado exacto'
      if (rp === 1) {
        if (pred.home_score !== null && pred.away_score !== null && pred.home_score === pred.away_score) {
          return '+1 pt: Empate correcto'
        }
        return '+1 pt: Ganador correcto'
      }
      return '0 pts: Sin acierto'
    }
  }

  const tooltip = getTooltip()
  const isGroup = !isElim

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 items-center text-sm">
      <div className="flex items-center gap-2 min-w-0">
        {home ? <TeamName name={home} size="sm" /> : <span className="text-slate-600 italic text-xs">A definir</span>}
        <span className="text-slate-600 text-xs">vs</span>
        {away ? <TeamName name={away} size="sm" /> : <span className="text-slate-600 italic text-xs">A definir</span>}
      </div>
      <span className="font-mono text-slate-300 text-xs whitespace-nowrap" title="Pronóstico">
        P: {predScore}
        {isElim && pred?.pen_winner && <span className="text-amber-400 ml-1">/{pred.pen_winner.slice(0, 3)}</span>}
      </span>
      <span className="font-mono text-slate-500 text-xs whitespace-nowrap" title="Real">
        R: {realScore}
        {isElim && real?.went_to_pens && real.pen_winner && <span className="text-amber-400 ml-1">/{real.pen_winner.slice(0, 3)}</span>}
      </span>
      {pts != null ? (
        <span title={tooltip} className={`text-xs font-bold w-10 text-right cursor-help ${pts >= 3 ? 'text-amber-400' : pts > 0 ? 'text-green-400' : 'text-slate-600'}`}>
          {pts > 0 ? `+${pts}` : '0'}
        </span>
      ) : <span className="w-10" />}
      <button
        onClick={onEdit}
        disabled={!home || !away}
        className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Editar pronóstico"
      >
        <Edit3 size={13} />
      </button>
    </div>
  )
}

function formatPair(a?: number | null, b?: number | null): string {
  if (a == null || b == null) return '—'
  return `${a}:${b}`
}

function EditModal({
  userId, state, onClose,
}: { userId: string; state: EditState; onClose: () => void }) {
  const isGroup = state.phase === 'group'
  const initialHome = isGroup ? state.pred?.home_score : state.pred?.home_score_120
  const initialAway = isGroup ? state.pred?.away_score : state.pred?.away_score_120

  const [home, setHome] = useState(initialHome != null ? String(initialHome) : '')
  const [away, setAway] = useState(initialAway != null ? String(initialAway) : '')
  const [penWinner, setPenWinner] = useState<string | null>(state.pred?.pen_winner ?? null)
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
    setError(null); setSuccess(null)

    const h = parseScore(home)
    const a = parseScore(away)

    startTransition(async () => {
      const res = await adminUpdatePredictionAction({
        userId,
        matchId: state.matchId,
        homeScore: isGroup ? h : null,
        awayScore: isGroup ? a : null,
        homeScore120: !isGroup ? h : null,
        awayScore120: !isGroup ? a : null,
        penWinner: !isGroup ? penWinner : null,
        reason: reason.trim() || undefined,
      })
      if (res.error) { setError(res.error); return }
      setSuccess(`Guardado · ${res.recalculated ?? 0} recalc`)
      setTimeout(() => { onClose(); window.location.reload() }, 1000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] rounded-2xl border border-white/8 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-white font-bold text-base">Editar pronóstico</h2>
            <p className="text-slate-400 text-xs mt-0.5">{state.matchId}</p>
          </div>
          <button onClick={onClose} disabled={isPending} className="text-slate-400 hover:text-white p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Marcador {isGroup ? "(90')" : "(120')"}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white truncate flex-1 text-right">{state.homeTeam}</span>
              <input type="text" inputMode="numeric" value={home}
                onChange={e => {
                  let clean = e.target.value.replace(/\D/g, '')
                  if (clean.length > 1 && clean.startsWith('0')) clean = String(parseInt(clean, 10))
                  setHome(clean.slice(0, 2))
                }}
                className="score-input w-14 h-10 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white border-white/10 focus:border-amber-500 outline-none" />
              <span className="text-slate-600">:</span>
              <input type="text" inputMode="numeric" value={away}
                onChange={e => {
                  let clean = e.target.value.replace(/\D/g, '')
                  if (clean.length > 1 && clean.startsWith('0')) clean = String(parseInt(clean, 10))
                  setAway(clean.slice(0, 2))
                }}
                className="score-input w-14 h-10 text-center text-lg font-bold rounded-lg border-2 bg-white/5 text-white border-white/10 focus:border-amber-500 outline-none" />
              <span className="text-sm text-white truncate flex-1">{state.awayTeam}</span>
            </div>
          </div>

          {!isGroup && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Ganador por penales</label>
              <div className="flex gap-2">
                {[state.homeTeam, state.awayTeam].map(t => t && (
                  <button
                    key={t} type="button"
                    onClick={() => setPenWinner(penWinner === t ? null : t)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      penWinner === t
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-white/3 border-white/8 text-slate-400 hover:border-white/15'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1">Sin selección = no se asume preferencia.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo (opcional)</label>
            <input
              type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej: corregido a pedido del jugador..."
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
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 shadow-lg shadow-amber-500/20">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
