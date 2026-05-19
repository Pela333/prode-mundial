'use client'

import { useState, useTransition } from 'react'
import { Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { deleteUserAction } from './actions'

interface DeleteUserButtonProps {
  userId: string
  userName: string
}

export default function DeleteUserButton({ userId, userName }: DeleteUserButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteUserAction(userId)
      if (res.error) { setError(res.error); return }
      setConfirming(false)
      window.location.reload()
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
        aria-label="Eliminar usuario"
        title="Eliminar usuario"
      >
        <Trash2 size={14} />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] rounded-2xl border border-red-500/20 shadow-2xl w-full max-w-md p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-base">Eliminar usuario</h2>
            <p className="text-slate-400 text-sm mt-1">
              Vas a eliminar a <span className="text-white font-semibold">{userName}</span>.
              Esta acción borra su cuenta, sus pronósticos y sus envíos. <strong>No se puede deshacer.</strong>
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 shadow-lg shadow-red-500/20"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  )
}
