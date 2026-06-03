'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalcPointsForMatch } from '@/lib/api/recalc'
import { revalidatePath } from 'next/cache'

export interface AdminEditPredictionInput {
  userId: string
  matchId: string
  homeScore: number | null         // grupos a 90'
  awayScore: number | null
  homeScore120: number | null      // elim a 120'
  awayScore120: number | null
  penWinner: string | null
  reason?: string
}

export interface ActionResult {
  ok?: boolean
  error?: string
  recalculated?: number
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null as null, isAdmin: false }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, isAdmin: profile?.role === 'admin' }
}

/**
 * Permite al admin editar (o crear/borrar) un pronóstico de cualquier usuario.
 * Registra audit_log y recalcula puntos para esa predicción.
 */
export async function adminUpdatePredictionAction(input: AdminEditPredictionInput): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  const admin = createAdminClient()

  // Resolver phase desde el match_id (group A1..L6 o eliminatoria R32_*..FINAL)
  const phase = inferPhase(input.matchId)
  if (!phase) return { error: 'match_id desconocido' }

  // Snapshot previo para audit_log
  const { data: previous } = await admin
    .from('predictions')
    .select('home_score, away_score, home_score_120, away_score_120, pen_winner')
    .eq('user_id', input.userId).eq('match_id', input.matchId)
    .maybeSingle()

  const allNull =
    input.homeScore == null && input.awayScore == null &&
    input.homeScore120 == null && input.awayScore120 == null &&
    !input.penWinner

  if (allNull) {
    if (previous) {
      await admin.from('predictions')
        .delete().eq('user_id', input.userId).eq('match_id', input.matchId)
    }
  } else {
    const { error } = await admin
      .from('predictions')
      .upsert({
        user_id: input.userId,
        match_id: input.matchId,
        phase,
        home_score: phase === 'group' ? input.homeScore : null,
        away_score: phase === 'group' ? input.awayScore : null,
        home_score_120: phase !== 'group' ? input.homeScore120 : null,
        away_score_120: phase !== 'group' ? input.awayScore120 : null,
        pen_winner: phase !== 'group' ? input.penWinner : null,
      }, { onConflict: 'user_id,match_id' })
    if (error) return { error: 'No pudimos guardar la predicción' }
  }

  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'prediction_edited',
    target_type: 'prediction',
    target_id: `${input.userId}:${input.matchId}`,
    meta: {
      reason: input.reason ?? null,
      previous: previous ?? null,
      new: allNull ? null : {
        home_score: input.homeScore,
        away_score: input.awayScore,
        home_score_120: input.homeScore120,
        away_score_120: input.awayScore120,
        pen_winner: input.penWinner,
      },
    },
  })

  // Recalcular puntos del partido (afecta sólo a esa predicción si hay result)
  let recalculated = 0
  try { recalculated = await recalcPointsForMatch(admin, input.matchId) } catch { /* no fatal */ }

  revalidatePath('/prode')
  revalidatePath('/prode/eliminatoria')
  revalidatePath('/ranking')
  revalidatePath('/ranking/usuarios/[id]', 'page')
  revalidatePath('/admin/usuarios/[id]', 'page')

  return { ok: true, recalculated }
}

function inferPhase(matchId: string): 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final' | null {
  if (/^[A-L][1-6]$/.test(matchId)) return 'group'
  if (/^R32_\d+$/.test(matchId)) return 'r32'
  if (/^R16_\d+$/.test(matchId)) return 'r16'
  if (/^QF_\d+$/.test(matchId)) return 'qf'
  if (/^SF_\d+$/.test(matchId)) return 'sf'
  if (matchId === 'THIRD') return 'third'
  if (matchId === 'FINAL') return 'final'
  return null
}
