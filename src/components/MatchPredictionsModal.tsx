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
              {homeTeam || 'A definir'} vs {awayTeam || 'A definir'}
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
                      Para mantener la emoción, las predicciones de los demás se revelarán {formattedRevealDate ? `el ${formattedRevealDate}` : 'una vez que comience la fase correspondiente'}.
                    </p>
                  </div>
                </div>
              )}

              {predictions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500">
                  <EyeOff size={28} className="mb-2 text-slate-600" />
                  <p className="text-xs italic">Nadie cargó pronósticos para este partido todavía.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {predictions.map((p, idx) => {
                    const isOwn = p.name === 'Vos'
                    const showPoints = p.points > 0

                    return (
                      <div 
                        key={idx}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isOwn 
                            ? 'bg-amber-500/5 border-amber-500/20 text-white' 
                            : 'bg-white/3 border-white/5 hover:bg-white/5'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className={`text-xs font-bold block truncate ${isOwn ? 'text-amber-400' : 'text-slate-200'}`}>
                            {p.name}
                          </span>
                          {p.username && (
                            <span className="text-[10px] text-slate-500 block">
                              @{p.username}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Marcador */}
                          <span className="font-mono text-sm font-bold text-slate-200 whitespace-nowrap bg-black/20 border border-white/5 rounded px-2 py-0.5">
                            {isElim 
                              ? `${p.homeScore120 !== null ? p.homeScore120 : '–'} : ${p.awayScore120 !== null ? p.awayScore120 : '–'}`
                              : `${p.homeScore !== null ? p.homeScore : '–'} : ${p.awayScore !== null ? p.awayScore : '–'}`
                            }
                            {isElim && p.penWinner && (
                              <span className="text-[10px] text-amber-400 font-bold ml-1.5" title={`Ganador penales: ${p.penWinner}`}>
                                /{p.penWinner.slice(0, 3).toUpperCase()}
                              </span>
                            )}
                          </span>

                          {/* Puntos */}
                          {showPoints && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-0.5 rounded-full select-none">
                              <CheckCircle size={10} />
                              +{p.points}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
