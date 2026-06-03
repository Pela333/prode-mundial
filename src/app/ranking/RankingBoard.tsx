'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Trophy, Star, Send } from 'lucide-react'

export interface RankingRow {
  user_id: string
  username: string
  first_name: string
  last_name: string
  total_points: number
  exactos_total: number
  exactos_grupo: number
  aciertos_grupo: number
  pts_eliminatoria: number
  pts_posicion_grupo: number
  pts_podio: number
  sent_group: boolean
  sent_r32_first: boolean
  sent_r32_rest: boolean
}

interface Props {
  rows: RankingRow[]
  currentUserId: string
}

export default function RankingBoard({ rows, currentUserId }: Props) {
  const [tab, setTab] = useState<'general' | 'group'>('general')

  const sortedRows = useMemo(() => {
    const list = [...rows]
    if (tab === 'general') {
      list.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        if (b.exactos_total !== a.exactos_total) return b.exactos_total - a.exactos_total
        if (b.aciertos_grupo !== a.aciertos_grupo) return b.aciertos_grupo - a.aciertos_grupo
        return b.pts_eliminatoria - a.pts_eliminatoria
      })
    } else {
      list.sort((a, b) => {
        const ptsA = a.total_points - a.pts_eliminatoria - a.pts_podio
        const ptsB = b.total_points - b.pts_eliminatoria - b.pts_podio
        if (ptsB !== ptsA) return ptsB - ptsA
        if (b.exactos_grupo !== a.exactos_grupo) return b.exactos_grupo - a.exactos_grupo
        return b.aciertos_grupo - a.aciertos_grupo
      })
    }
    return list
  }, [rows, tab])

  const myRank = useMemo(() => {
    return sortedRows.findIndex(r => r.user_id === currentUserId) + 1
  }, [sortedRows, currentUserId])

  const tieBuckets = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of sortedRows) {
      const key = tab === 'general'
        ? `${r.total_points}|${r.exactos_total}|${r.aciertos_grupo}|${r.pts_eliminatoria}`
        : `${r.total_points - r.pts_eliminatoria - r.pts_podio}|${r.exactos_grupo}|${r.aciertos_grupo}`
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return m
  }, [sortedRows, tab])

  const podiumColors = ['text-amber-400', 'text-slate-300', 'text-amber-600']
  const podiumBg = [
    'bg-amber-500/10 border-amber-500/20',
    'bg-slate-700/20 border-slate-600/20',
    'bg-amber-700/10 border-amber-700/20',
  ]

  const getPointsValue = (r: RankingRow) => {
    if (tab === 'general') return r.total_points
    return r.total_points - r.pts_eliminatoria - r.pts_podio
  }

  const getExactosValue = (r: RankingRow) => {
    if (tab === 'general') return r.exactos_total
    return r.exactos_grupo
  }

  return (
    <>
      <div className="mb-8 animate-fade-in-up flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Trophy size={28} className="text-amber-400" />
            Ranking general
          </h1>
          <p className="text-slate-400 text-sm">
            Tu posición en esta tabla:{' '}
            <span className="text-amber-400 font-bold">
              #{myRank > 0 ? myRank : '–'}
            </span>
          </p>
        </div>

        {/* Selector de ranking */}
        <div className="flex rounded-xl bg-white/4 p-1 self-start md:self-auto min-w-[280px]">
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'general' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            General Completo
          </button>
          <button
            type="button"
            onClick={() => setTab('group')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'group' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Fase de Grupos
          </button>
        </div>
      </div>

      {sortedRows.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[sortedRows[0], sortedRows[1], sortedRows[2]].map((r, i) => (
            <div key={r.user_id} className={`rounded-2xl border p-4 text-center ${podiumBg[i]} animate-fade-in-up`}>
              <div className={`text-2xl font-black mb-1 ${podiumColors[i]}`}>#{i + 1}</div>
              <div className="w-10 h-10 rounded-full bg-slate-700 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
                {r.first_name?.[0]?.toUpperCase()}
              </div>
              <p className="text-white font-semibold text-sm truncate">
                {r.first_name} {r.last_name}
              </p>
              <p className={`text-xl font-black ${podiumColors[i]}`}>{getPointsValue(r)} pts</p>
              <p className="text-slate-500 text-xs">{getExactosValue(r)} exactos</p>
              <p className="text-slate-500 text-[10px] mt-1 border-t border-white/5 pt-1">
                {tab === 'general' ? (
                  <>Pos. grupo: +{r.pts_posicion_grupo || 0} · Podio: +{r.pts_podio || 0}</>
                ) : (
                  <>Pos. grupo: +{r.pts_posicion_grupo || 0}</>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/6 overflow-hidden bg-[#111827]">
        <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-white/5">
          <span>#</span>
          <span>Jugador</span>
          <span className="text-right">Envío</span>
          <span className="text-right">Exactos</span>
          <span className="text-right">Puntos</span>
        </div>

        {sortedRows.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-sm">
            Todavía no hay participantes en el ranking.
          </div>
        )}

        {sortedRows.map((r, i) => {
          const isMe = r.user_id === currentUserId
          const tieKey = tab === 'general'
            ? `${r.total_points}|${r.exactos_total}|${r.aciertos_grupo}|${r.pts_eliminatoria}`
            : `${r.total_points - r.pts_eliminatoria - r.pts_podio}|${r.exactos_grupo}|${r.aciertos_grupo}`
          const tied = (tieBuckets.get(tieKey) ?? 0) > 1
          return (
            <div
              key={r.user_id}
              className={`grid grid-cols-[2rem_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-white/4 last:border-0 transition-colors
                ${isMe ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-white/2'}`}
            >
              <span className={`text-sm font-bold ${i < 3 ? podiumColors[i] : 'text-slate-500'}`}>
                {i + 1}
                {tied && <span className="text-slate-600 ml-0.5" title="Empate técnico">⇄</span>}
              </span>

              <Link href={`/ranking/usuarios/${r.user_id}`} className="flex items-center gap-2 min-w-0 group/player">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white text-sm font-bold shrink-0 group-hover/player:scale-105 transition-transform">
                  {r.first_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm font-medium truncate group-hover/player:text-amber-400 transition-colors ${isMe ? 'text-amber-400' : 'text-white'}`}>
                    {r.first_name} {r.last_name}
                    {isMe && <span className="text-xs text-amber-500 ml-1">(vos)</span>}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate mt-0.5">
                    {tab === 'general' ? (
                      <>Pos. grupo: +{r.pts_posicion_grupo || 0} pts · Podio: +{r.pts_podio || 0} pts</>
                    ) : (
                      <>Pos. grupo: +{r.pts_posicion_grupo || 0} pts</>
                    )}
                  </span>
                </div>
              </Link>

              <span className="text-right" title="Estado de envíos">
                <Send
                  size={13}
                  className={r.sent_group ? 'text-green-500 inline' : 'text-slate-700 inline'}
                />
              </span>

              <div className="flex items-center gap-1 justify-end">
                <Star size={12} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">{getExactosValue(r)}</span>
              </div>

              <span className="text-sm font-bold text-white text-right">{getPointsValue(r)}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 text-xs text-slate-600 space-y-1">
        <p>Empate técnico (⇄): coinciden en todos los criterios de desempate.</p>
        <p>
          {tab === 'general' ? (
            <>Desempates: 1) más exactos · 2) más posiciones de grupo · 3) más puntos en eliminatoria · 4) división del premio.</>
          ) : (
            <>Desempates: 1) más exactos de grupos · 2) más aciertos de resultados de grupos · 3) división del premio.</>
          )}
        </p>
      </div>
    </>
  )
}
