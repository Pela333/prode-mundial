'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInArgentina } from '@/lib/dateUtils'
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface ApiError {
  id: string
  endpoint: string | null
  status_code: number | null
  error_message: string | null
  created_at: string
}

interface SyncReport {
  ok?: boolean
  startedAt?: string
  finishedAt?: string
  groupMatchesUpdated?: number
  bracketSlotsUpdated?: number
  groupStandingsUpdated?: number
  recalculatedPredictions?: number
  errors?: string[]
  error?: string
}

interface ApiSyncPanelProps {
  provider: string
  lastSyncAt: string | null
  lastSyncStatus: string | null
  recentErrors: ApiError[]
}

export default function ApiSyncPanel({ provider, lastSyncAt, lastSyncStatus, recentErrors }: ApiSyncPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [report, setReport] = useState<SyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSync() {
    setError(null)
    setReport(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/sync', { method: 'POST' })
        const data: SyncReport = await res.json()
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`)
          return
        }
        setReport(data)
        setTimeout(() => window.location.reload(), 1200)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  const okStatus = lastSyncStatus === 'ok'

  return (
    <div className="space-y-6">
      {/* Estado */}
      <section className="rounded-2xl bg-[#111827] border border-white/8 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              okStatus ? 'bg-green-500/10 border border-green-500/20' :
              lastSyncStatus === 'error' ? 'bg-red-500/10 border border-red-500/20' :
              'bg-slate-700/30 border border-slate-700/40'
            }`}>
              {okStatus ? <Wifi size={18} className="text-green-400" /> : <WifiOff size={18} className="text-slate-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">Proveedor: {provider}</p>
              <p className="text-xs text-slate-500">
                {lastSyncAt
                  ? <>Última sync: <span className="text-slate-300">{formatInArgentina(lastSyncAt, "d MMM HH:mm")}</span> · {formatDistanceToNow(new Date(lastSyncAt), { locale: es, addSuffix: true })}</>
                  : 'Nunca se sincronizó'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Sincronizar ahora
          </button>
        </div>
      </section>

      {/* Resultado del último sync manual */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Falló el sync</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {report && (
        <div className={`rounded-xl border p-4 ${
          report.ok ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {report.ok
              ? <CheckCircle2 size={16} className="text-green-400" />
              : <AlertCircle size={16} className="text-amber-400" />}
            <p className="font-semibold text-sm text-white">
              Sync completado {report.ok ? 'sin errores' : 'con errores'}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300">
            <Pill label="Grupos" value={report.groupMatchesUpdated ?? 0} />
            <Pill label="Bracket" value={report.bracketSlotsUpdated ?? 0} />
            <Pill label="Standings" value={report.groupStandingsUpdated ?? 0} />
            <Pill label="Recalc preds" value={report.recalculatedPredictions ?? 0} />
          </div>
          {report.errors && report.errors.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="text-amber-300 cursor-pointer">Ver {report.errors.length} error(es)</summary>
              <ul className="mt-2 space-y-1">
                {report.errors.map((e, i) => (
                  <li key={i} className="text-amber-200/70 font-mono break-all">• {e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Log de errores recientes */}
      <section>
        <h2 className="text-white font-semibold text-sm mb-3">Últimos errores de API</h2>
        {recentErrors.length === 0 ? (
          <div className="rounded-xl bg-slate-900/40 border border-white/5 p-4 text-sm text-slate-500">
            Sin errores registrados.
          </div>
        ) : (
          <div className="rounded-xl bg-[#111827] border border-white/8 divide-y divide-white/5">
            {recentErrors.map(e => (
              <div key={e.id} className="px-4 py-3 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-slate-300 font-mono truncate">{e.endpoint}</span>
                  <span className="text-slate-500 whitespace-nowrap">
                    {formatInArgentina(e.created_at, "d MMM HH:mm:ss")}
                  </span>
                </div>
                <p className="text-red-300/80 break-all">
                  {e.status_code ? `[${e.status_code}] ` : ''}{e.error_message}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="rounded-2xl bg-slate-900/40 border border-white/5 p-4 text-xs text-slate-500 space-y-2">
        <p>
          <strong className="text-slate-300">Sync programado:</strong> Para automatizar el sync cada 5 minutos
          podés usar un scheduler externo (GitHub Actions, cron-job.org, etc.) que haga POST a{' '}
          <code className="text-amber-400">/api/cron/sync</code> con header{' '}
          <code className="text-amber-400">Authorization: Bearer &lt;CRON_SECRET&gt;</code>.
        </p>
        <p>
          <strong className="text-slate-300">API key:</strong> está configurada como variable de entorno{' '}
          <code>FOOTBALL_DATA_API_KEY</code> en el servidor (no se expone al cliente).
        </p>
      </div>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/8 px-2 py-1.5 text-center">
      <div className="text-white font-bold">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
    </div>
  )
}
