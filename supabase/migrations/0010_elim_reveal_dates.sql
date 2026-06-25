-- ============================================================
-- 0010 — Agregar fechas de revelación de pronósticos para la fase eliminatoria
-- ============================================================
-- Hasta ahora existe una única fecha `reveal_predictions_at` que controla
-- cuándo todos pueden ver los pronósticos ajenos. Esto servía para la fase
-- de grupos, pero en la eliminatoria (que tiene dos etapas: primer partido
-- R32_1 y el resto) se necesitan fechas independientes.
--
-- Nuevas columnas en app_config:
--   reveal_r32_first_at  — a partir de cuándo se revelan los pronósticos del
--                          1er partido de la fase eliminatoria (R32_1)
--   reveal_r32_rest_at   — a partir de cuándo se revelan los del resto
--
-- La lógica en `getMatchPredictionsAction` usará la fecha correspondiente
-- según el partido consultado.
-- ============================================================

ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS reveal_r32_first_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reveal_r32_rest_at  TIMESTAMPTZ;

-- Dropear la vista y función existentes primero porque cambia el tipo de retorno (RETURNS TABLE)
-- Usamos CASCADE porque la política predictions_select depende de la vista.
DROP VIEW IF EXISTS public.app_config_public CASCADE;
DROP FUNCTION IF EXISTS public.get_app_config_public();

-- Recrear la función SECURITY DEFINER que expone los campos no sensibles
CREATE OR REPLACE FUNCTION public.get_app_config_public()
RETURNS TABLE (
  id                          INTEGER,
  group_deadline              TIMESTAMPTZ,
  r32_first_deadline          TIMESTAMPTZ,
  r32_rest_deadline           TIMESTAMPTZ,
  reveal_predictions_at       TIMESTAMPTZ,
  reveal_r32_first_at         TIMESTAMPTZ,
  reveal_r32_rest_at          TIMESTAMPTZ,
  last_sync_at                TIMESTAMPTZ,
  last_sync_status            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER intencional: bypasea el RLS de app_config para exponer
  -- únicamente los campos no sensibles a cualquier usuario autenticado.
  RETURN QUERY
  SELECT
    a.id,
    a.group_deadline,
    a.r32_first_deadline,
    a.r32_rest_deadline,
    a.reveal_predictions_at,
    a.reveal_r32_first_at,
    a.reveal_r32_rest_at,
    a.last_sync_at,
    a.last_sync_status
  FROM public.app_config a
  WHERE a.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_app_config_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_config_public() TO anon, authenticated;

-- Recrear la vista (lee de la función, hereda los nuevos campos automáticamente)
DROP VIEW IF EXISTS public.app_config_public CASCADE;
CREATE VIEW public.app_config_public AS
SELECT * FROM public.get_app_config_public();

GRANT SELECT ON public.app_config_public TO anon, authenticated;

-- Recrear la política predictions_select en la tabla predictions que fue borrada por el CASCADE.
-- Ahora esta política respeta las fechas de revelación de eliminatorias independientes.
DROP POLICY IF EXISTS "predictions_select" ON public.predictions;
CREATE POLICY "predictions_select" ON public.predictions
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.app_config_public
      WHERE id = 1 AND (
        (phase = 'group' AND reveal_predictions_at IS NOT NULL AND reveal_predictions_at <= NOW())
        OR (match_id = 'R32_1' AND COALESCE(reveal_r32_first_at, reveal_predictions_at) IS NOT NULL AND COALESCE(reveal_r32_first_at, reveal_predictions_at) <= NOW())
        OR (phase <> 'group' AND match_id <> 'R32_1' AND COALESCE(reveal_r32_rest_at, reveal_predictions_at) IS NOT NULL AND COALESCE(reveal_r32_rest_at, reveal_predictions_at) <= NOW())
      )
    )
  );
