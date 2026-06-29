'use client'

import { useEffect, useState } from 'react'
import { X, Lock, Loader2, AlertCircle, EyeOff, CheckCircle } from 'lucide-react'
import { getMatchPredictionsAction, type MatchPrediction } from '@/app/prode/actions'
import { formatInArgentina } from '@/lib/dateUtils'

interface MatchPredictionsModalProps {
  matchId: string
  homeTeam: string | null
  awayTeam: string | null
  isElim?: boolean
  onClose: () => void
}

export default function MatchPredictionsModal({
  matchId,
  homeTeam,
  awayTeam,
  isElim = false,
  onClose,
}: MatchPredictionsModalProps) {
  const [predictions, setPredictions] = useState<MatchPrediction[]>([])
  const [locked, setLocked] = useState(true)
  const [revealDate, setRevealDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await getMatchPredictionsAction(matchId)
        if (!active) return
        if (res.error) {
          setError(res.error)
        } else {
          setPredictions(res.predictions ?? [])
          setLocked(res.locked)
          setRevealDate(res.revealDate)
        }
      } catch (err) {
        if (active) setError('No pudimos cargar los pronósticos')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [matchId])

  // ESC to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const formattedRevealDate = revealDate
    ? formatInArgentina(revealDate, "d 'de' MMMM 'a las' HH:mm")
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[#111827] rounded-2xl border border-white/8 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-white font-bold text-base flex items-center gap-1.5">
              Pronósticos de participantes
            </h2>
            <p className="text-slate-400 text-xs mt-0.5 font-medium">
              {isElim
                ? 'Cada participante pudo pronosticar equipos distintos'
                : `${homeTeam || 'A definir'} vs ${awayTeam || 'A definir'}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-[200px] flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="animate-spin text-amber-500" size={24} />
              <p className="text-xs font-semibold">Cargando pronósticos...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-red-400 gap-2">
              <AlertCircle size={24} />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {locked && (
                <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                  <Lock size={16} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                  <div className="text-left">
                    <h4 className="text-amber-300 font-bold text-xs">Pronósticos ocultos</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      Para mantener la emoción, las predicciones de los demás se revelarán{' '}
                      {formattedRevealDate ? `el ${formattedRevealDate}` : 'una vez que comience la fase correspondiente'}.
                    </p>
                  </div>
                </div>
              )}

              {predictions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500">
                  <EyeOff size={28} className="mb-2 text-slate-600" />
                  <p className="text-xs italic">Nadie cargó pronósticos para este partido todavía.</p>
                </div>
              ) : isElim ? (
                <ElimPredictionsList predictions={predictions} />
              ) : (
                <GroupPredictionsList predictions={predictions} homeTeam={homeTeam} awayTeam={awayTeam} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista para partidos ELIMINATORIOS
// Agrupa por ganador pronosticado (los equipos de cada usuario son propios)
// ─────────────────────────────────────────────────────────────────────────────

function ElimPredictionsList({ predictions }: { predictions: MatchPrediction[] }) {
  function getPredWinner(p: MatchPrediction): string | null {
    if (p.homeScore120 == null || p.awayScore120 == null) return null
    if (!p.predHomeTeam || !p.predAwayTeam) return null
    if (p.homeScore120 > p.awayScore120) return p.predHomeTeam
    if (p.homeScore120 < p.awayScore120) return p.predAwayTeam
    return p.penWinner ?? null // empate en 120': penales deciden
  }

  // Agrupar por ganador pronosticado
  const winnerGroups: Record<string, MatchPrediction[]> = {}
  const noPickGroup: MatchPrediction[] = []

  for (const p of predictions) {
    const winner = getPredWinner(p)
    if (!winner) {
      noPickGroup.push(p)
    } else {
      if (!winnerGroups[winner]) winnerGroups[winner] = []
      winnerGroups[winner].push(p)
    }
  }

  // Ordenar ganadores por cantidad de votos desc
  const sortedWinners = Object.entries(winnerGroups).sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="space-y-5">
      {sortedWinners.map(([winner, preds]) => (
        <div key={winner} className="space-y-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Gana {winner}
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold bg-white/5 px-2 py-0.5 rounded-full">
              {preds.length} {preds.length === 1 ? 'pronóstico' : 'pronósticos'}
            </span>
          </div>
          <div className="space-y-1.5">
            {preds.map((p, idx) => (
              <ElimPredRow key={idx} p={p} />
            ))}
          </div>
        </div>
      ))}

      {noPickGroup.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              Sin pronóstico completo
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold bg-white/5 px-2 py-0.5 rounded-full">
              {noPickGroup.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {noPickGroup.map((p, idx) => (
              <ElimPredRow key={idx} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ElimPredRow({ p }: { p: MatchPrediction }) {
  const showPoints = p.points > 0
  const hasScore = p.homeScore120 != null && p.awayScore120 != null
  const homeLabel = p.predHomeTeam ?? 'A definir'
  const awayLabel = p.predAwayTeam ?? 'A definir'

  return (
    <div className="bg-white/2 rounded-xl border border-white/5 px-3 py-2.5 flex items-start justify-between gap-3">
      {/* Usuario */}
      <div className="min-w-0 shrink-0 w-28">
        <span className="text-xs font-bold text-slate-300 block truncate">{p.name}</span>
        {p.username && (
          <span className="text-[10px] text-slate-500 leading-tight block">@{p.username}</span>
        )}
      </div>

      {/* Partido pronosticado con sus equipos propios */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap justify-end">
        {hasScore ? (
          <>
            <span className="text-[11px] text-slate-400 truncate max-w-[72px] text-right">{homeLabel}</span>
            <span className="font-mono text-xs font-bold text-white bg-black/30 px-1.5 py-0.5 rounded border border-white/8 shrink-0">
              {p.homeScore120} – {p.awayScore120}
            </span>
            <span className="text-[11px] text-slate-400 truncate max-w-[72px]">{awayLabel}</span>
            {p.penWinner && (
              <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                PEN: {p.penWinner}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-slate-600 italic">Sin marcar</span>
        )}
      </div>

      {showPoints && (
        <span className="flex items-center gap-1 text-[9px] font-bold bg-green-500/10 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full select-none shrink-0">
          <CheckCircle size={8} />
          +{p.points}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista para partidos de FASE DE GRUPOS (lógica existente, sin cambios)
// ─────────────────────────────────────────────────────────────────────────────

function GroupPredictionsList({
  predictions,
  homeTeam,
  awayTeam,
}: {
  predictions: MatchPrediction[]
  homeTeam: string | null
  awayTeam: string | null
}) {
  const groupsMap: Record<
    'home' | 'draw' | 'away' | 'empty',
    Record<string, { penWinner: string | null; preds: MatchPrediction[] }>
  > = { home: {}, draw: {}, away: {}, empty: {} }

  predictions.forEach(p => {
    const h = p.homeScore
    const a = p.awayScore

    let outcome: 'home' | 'draw' | 'away' | 'empty' = 'empty'
    if (h !== null && a !== null) {
      if (h > a) outcome = 'home'
      else if (h < a) outcome = 'away'
      else outcome = 'draw'
    }

    const scoreKey = h !== null && a !== null ? `${h} - ${a}` : 'Sin pronóstico'

    if (!groupsMap[outcome][scoreKey]) {
      groupsMap[outcome][scoreKey] = { penWinner: p.penWinner, preds: [] }
    }
    groupsMap[outcome][scoreKey].preds.push(p)
  })

  const outcomeOrder: ('home' | 'draw' | 'away' | 'empty')[] = ['home', 'draw', 'away', 'empty']
  const outcomeGroups = outcomeOrder
    .map(type => {
      const scoresMap = groupsMap[type]
      const scoreKeys = Object.keys(scoresMap)
      if (scoreKeys.length === 0) return null

      let title = 'Sin pronóstico'
      if (type === 'home') title = `Gana ${homeTeam || 'Local'}`
      else if (type === 'away') title = `Gana ${awayTeam || 'Visitante'}`
      else if (type === 'draw') title = 'Empate'

      const scoreGroups = scoreKeys.map(scoreKey => {
        const { penWinner, preds } = scoresMap[scoreKey]
        const firstPred = preds[0]
        const h = firstPred.homeScore
        const a = firstPred.awayScore
        const sortedPreds = [...preds].sort((x, y) => {
          if (x.name === 'Vos') return -1
          if (y.name === 'Vos') return 1
          return x.name.localeCompare(y.name, 'es')
        })
        return { scoreKey, homeScore: h, awayScore: a, penWinner, predictions: sortedPreds }
      })

      scoreGroups.sort((x, y) => {
        const hX = x.homeScore ?? 0
        const aX = x.awayScore ?? 0
        const hY = y.homeScore ?? 0
        const aY = y.awayScore ?? 0
        if (type === 'home') { if (hX !== hY) return hY - hX; return aX - aY }
        if (type === 'draw') return hY - hX
        if (type === 'away') { if (aX !== aY) return aY - aX; return hX - hY }
        return 0
      })

      const totalCount = scoreGroups.reduce((acc, sg) => acc + sg.predictions.length, 0)
      return { type, title, totalCount, scoreGroups }
    })
    .filter(Boolean) as {
      type: 'home' | 'draw' | 'away' | 'empty'
      title: string
      totalCount: number
      scoreGroups: {
        scoreKey: string
        homeScore: number | null
        awayScore: number | null
        penWinner: string | null
        predictions: MatchPrediction[]
      }[]
    }[]

  return (
    <div className="space-y-5">
      {outcomeGroups.map(group => (
        <div key={group.type} className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              {group.type === 'home' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
              {group.type === 'draw' && <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
              {group.type === 'away' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
              {group.type === 'empty' && <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
              <span className={
                group.type === 'home' ? 'text-emerald-400' :
                group.type === 'away' ? 'text-blue-400' :
                group.type === 'draw' ? 'text-slate-300' :
                'text-slate-500'
              }>
                {group.title}
              </span>
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold bg-white/5 px-2 py-0.5 rounded-full">
              {group.totalCount} {group.totalCount === 1 ? 'pronóstico' : 'pronósticos'}
            </span>
          </div>

          <div className="space-y-2">
            {group.scoreGroups.map(scoreGroup => (
              <div key={scoreGroup.scoreKey} className="bg-white/2 rounded-xl border border-white/5 overflow-hidden">
                <div className="bg-white/3 px-3 py-1.5 flex items-center justify-between border-b border-white/5">
                  <span className="font-mono text-xs font-bold text-slate-200 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                    {scoreGroup.scoreKey}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {scoreGroup.predictions.length} {scoreGroup.predictions.length === 1 ? 'usuario' : 'usuarios'}
                  </span>
                </div>
                <div className="divide-y divide-white/5">
                  {scoreGroup.predictions.map((p, pIdx) => {
                    const isOwn = p.name === 'Vos'
                    const showPoints = p.points > 0
                    return (
                      <div
                        key={pIdx}
                        className={`flex items-center justify-between px-3 py-2 transition-colors ${
                          isOwn ? 'bg-amber-500/5 text-white' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className={`text-xs font-bold block truncate ${isOwn ? 'text-amber-400' : 'text-slate-300'}`}>
                            {p.name}
                          </span>
                          {p.username && (
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              @{p.username}
                            </span>
                          )}
                        </div>
                        {showPoints && (
                          <span className="flex items-center gap-1 text-[9px] font-bold bg-green-500/10 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full select-none">
                            <CheckCircle size={8} />
                            +{p.points}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
