-- ============================================================
-- 0006 — Corregir permisos RLS en app_config_public
-- ============================================================

-- 1. Crear función SECURITY DEFINER para leer de app_config bypasseando RLS de forma segura
CREATE OR REPLACE FUNCTION public.get_app_config_public()
RETURNS TABLE (
  id                          INTEGER,
  group_deadline              TIMESTAMPTZ,
  r32_first_deadline          TIMESTAMPTZ,
  r32_rest_deadline           TIMESTAMPTZ,
  reveal_predictions_at       TIMESTAMPTZ,
  last_sync_at                TIMESTAMPTZ,
  last_sync_status            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Esta función es intencionalmente SECURITY DEFINER para bypassear
  -- el RLS de la tabla app_config y exponer solo los datos no sensibles
  -- a cualquier usuario autenticado o anónimo.
  RETURN QUERY
  SELECT
    a.id,
    a.group_deadline,
    a.r32_first_deadline,
    a.r32_rest_deadline,
    a.reveal_predictions_at,
    a.last_sync_at,
    a.last_sync_status
  FROM public.app_config a
  WHERE a.id = 1;
END;
$$;

-- Revocar permisos por defecto de PUBLIC
REVOKE EXECUTE ON FUNCTION public.get_app_config_public() FROM PUBLIC;
-- Otorgar ejecución a authenticated y anon
GRANT EXECUTE ON FUNCTION public.get_app_config_public() TO anon, authenticated;

-- 2. Recrear la vista app_config_public para leer desde la función
DROP VIEW IF EXISTS public.app_config_public;
CREATE VIEW public.app_config_public AS
SELECT * FROM public.get_app_config_public();

-- Otorgar permisos de SELECT sobre la vista a anon y authenticated
GRANT SELECT ON public.app_config_public TO anon, authenticated;
