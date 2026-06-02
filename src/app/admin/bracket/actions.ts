'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { maybeUpdateR32Deadlines } from '@/lib/api/sync'
import type { Phase } from '@/lib/fixture'

export interface UpdateBracketInput {
  matchId: string
  phase: Phase
  position: number
  homeTeam: string | null
  awayTeam: string | null
  scheduledAt: string | null   // ISO string o null
  defined: boolean
}

export interface ActionResult {
  ok?: boolean
  error?: string
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null as null, isAdmin: false }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, isAdmin: profile?.role === 'admin' }
}

export async function updateBracketAction(input: UpdateBracketInput): Promise<ActionResult> {
  const { isAdmin } = await assertAdmin()
  if (!isAdmin) return { error: 'No autorizado' }

  // Validaciones básicas
  if (!input.matchId) return { error: 'matchId requerido' }
  if (input.defined && (!input.homeTeam || !input.awayTeam)) {
    return { error: 'Para marcar como definido se requieren ambos equipos' }
  }

  const admin = createAdminClient()

  // Upsert del slot de bracket
  const { error: bracketErr } = await admin
    .from('bracket')
    .upsert(
      {
        match_id: input.matchId,
        phase: input.phase,
        position: input.position,
        home_team: input.homeTeam,
        away_team: input.awayTeam,
        scheduled_at: input.scheduledAt,
        defined: input.defined,
      },
      { onConflict: 'match_id' },
    )

  if (bracketErr) return { error: `Error guardando bracket: ${bracketErr.message}` }

  // Si se marca como definido, asegurar que exista la fila en results
  // para que el panel de resultados pueda editarlo más adelante.
  if (input.defined && input.homeTeam && input.awayTeam) {
    const { data: existing } = await admin
      .from('results')
      .select('match_id')
      .eq('match_id', input.matchId)
      .maybeSingle()

    if (!existing) {
      await admin.from('results').insert({
        match_id: input.matchId,
        phase: input.phase,
        home_score: null,
        away_score: null,
        home_score_120: null,
        away_score_120: null,
        went_to_pens: false,
        pen_winner: null,
        status: 'scheduled',
        api_home_score: null,
        api_away_score: null,
        api_home_score_120: null,
        api_away_score_120: null,
      })
    }
  }

  // Leer todos los slots de r32 actuales para recalcular deadlines
  const { data: r32Rows } = await admin
    .from('bracket')
    .select('match_id, phase, position, defined, scheduled_at')
    .eq('phase', 'r32')

  if (r32Rows && r32Rows.length > 0) {
    await maybeUpdateR32Deadlines(admin, r32Rows as {
      match_id: string; phase: Phase; position: number; defined: boolean; scheduled_at: string | null
    }[])
  }

  revalidatePath('/admin')
  revalidatePath('/admin/bracket')
  revalidatePath('/prode/eliminatoria')

  return { ok: true }
}
