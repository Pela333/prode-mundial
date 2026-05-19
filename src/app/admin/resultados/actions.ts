'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalcPointsForMatch, recalcGroupPositionBonus } from '@/lib/api/recalc'
import { revalidatePath } from 'next/cache'

export interface CorrectResultInput {
  matchId: string
  homeScore: number | null         // a 90' (sólo grupos)
  awayScore: number | null
  homeScore120: number | null      // a 120' (sólo elim)
  awayScore120: number | null
  wentToPens: boolean
  penWinner: string | null
  status: 'scheduled' | 'in_progress' | 'finished'
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
  if (!user) return { user: null as null, isAdmin: false, supabase }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, isAdmin: profile?.role === 'admin', supabase }
}

export async function correctResultAction(input: CorrectResultInput): Promise<ActionResult> {
  const { user, isAdmin } = await assertAdmin()
  if (!isAdmin || !user) return { error: 'No autorizado' }

  // Validaciones básicas
  if (input.homeScore != null && (!Number.isInteger(input.homeScore) || input.homeScore < 0)) return { error: 'Goles a 90 inválidos' }
  if (input.awayScore != null && (!Number.isInteger(input.awayScore) || input.awayScore < 0)) return { error: 'Goles a 90 inválidos' }
  if (input.homeScore120 != null && (!Number.isInteger(input.homeScore120) || input.homeScore120 < 0)) return { error: 'Goles a 120 inválidos' }
  if (input.awayScore120 != null && (!Number.isInteger(input.awayScore120) || input.awayScore120 < 0)) return { error: 'Goles a 120 inválidos' }

  const admin = createAdminClient()

  // Snapshot del estado anterior para audit_log
  const { data: previous } = await admin
    .from('results')
    .select('*')
    .eq('match_id', input.matchId)
    .maybeSingle()

  if (!previous) return { error: 'Ese partido no tiene un resultado registrado todavía' }

  // Aplicar override
  const { error } = await admin
    .from('results')
    .update({
      home_score: input.homeScore,
      away_score: input.awayScore,
      home_score_120: input.homeScore120,
      away_score_120: input.awayScore120,
      went_to_pens: input.wentToPens,
      pen_winner: input.penWinner,
      status: input.status,
      manual_override: true,
      corrected_by: user.id,
      corrected_at: new Date().toISOString(),
    })
    .eq('match_id', input.matchId)

  if (error) return { error: 'No pudimos actualizar el resultado' }

  // Audit log
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'result_corrected',
    target_type: 'result',
    target_id: input.matchId,
    meta: {
      reason: input.reason ?? null,
      previous: {
        home_score: previous.home_score,
        away_score: previous.away_score,
        home_score_120: previous.home_score_120,
        away_score_120: previous.away_score_120,
        went_to_pens: previous.went_to_pens,
        pen_winner: previous.pen_winner,
        status: previous.status,
      },
      new: {
        home_score: input.homeScore,
        away_score: input.awayScore,
        home_score_120: input.homeScore120,
        away_score_120: input.awayScore120,
        went_to_pens: input.wentToPens,
        pen_winner: input.penWinner,
        status: input.status,
      },
    },
  })

  // Recalcular puntos del match + bonus de posición de grupo (por si la corrección
  // afecta algún partido de grupos y eso cambia las standings finales)
  const recalculated = await recalcPointsForMatch(admin, input.matchId)
  await recalcGroupPositionBonus(admin)

  revalidatePath('/admin/resultados')
  revalidatePath('/ranking')
  return { ok: true, recalculated }
}
