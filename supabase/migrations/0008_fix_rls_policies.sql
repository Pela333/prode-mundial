-- ============================================================
-- 0008 — Corregir políticas RLS para lectura pública del ranking
-- ============================================================

-- 1. Tabla predictions: corregir subconsulta de app_config a app_config_public (accesible por jugadores)
DROP POLICY IF EXISTS "predictions_select" ON public.predictions;
CREATE POLICY "predictions_select" ON public.predictions
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.app_config_public
      WHERE id = 1 AND reveal_predictions_at IS NOT NULL AND reveal_predictions_at <= NOW()
    )
  );

-- 2. Tabla submissions: permitir lectura pública para mostrar el estado de envío en el ranking
DROP POLICY IF EXISTS "submissions_select_own_or_admin" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select_all" ON public.submissions;
CREATE POLICY "submissions_select_all" ON public.submissions
  FOR SELECT TO authenticated USING (true);

-- 3. Tabla user_bonus: asegurar RLS habilitado y permitir lectura pública para sumar bonos en la vista ranking
ALTER TABLE public.user_bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_bonus_select_all" ON public.user_bonus;
CREATE POLICY "user_bonus_select_all" ON public.user_bonus
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.user_bonus TO authenticated;
