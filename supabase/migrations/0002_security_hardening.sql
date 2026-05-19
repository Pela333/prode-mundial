-- ============================================================
-- 0002 — Hardening de seguridad
-- ============================================================
-- Resuelve advisors detectados tras 0001:
--   1. Vistas con SECURITY DEFINER → cambiar a INVOKER
--   2. Funciones con search_path mutable → fijar search_path
--   3. Funciones SECURITY DEFINER expuestas innecesariamente vía REST
--      → revocar EXECUTE a anon/authenticated en las que no se usan desde cliente
-- ============================================================

-- ------------------------------------------------------------
-- 1. VISTAS: SECURITY INVOKER (respeta RLS del que consulta)
-- ------------------------------------------------------------

ALTER VIEW public.app_config_public SET (security_invoker = true);
ALTER VIEW public.ranking          SET (security_invoker = true);

-- ------------------------------------------------------------
-- 2. FUNCIONES: search_path fijo
-- ------------------------------------------------------------

ALTER FUNCTION public.profiles_protect_immutable()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.touch_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.calculate_match_points(
  match_phase, INTEGER, INTEGER, INTEGER, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) SET search_path = public, pg_temp;

ALTER FUNCTION public.get_email_by_username(TEXT)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.username_available(TEXT)
  SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- 3. Revocar EXECUTE en funciones que NO deben ser callable
--    desde el cliente (sólo se usan como triggers / SQL interno).
-- ------------------------------------------------------------

-- Triggers internos: nadie debería poder ejecutarlas vía REST
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_protect_immutable()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at()             FROM PUBLIC, anon, authenticated;

-- calculate_match_points: la usamos sólo desde server actions / triggers; no necesita
-- ser callable desde el cliente
REVOKE EXECUTE ON FUNCTION public.calculate_match_points(
  match_phase, INTEGER, INTEGER, INTEGER, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;

-- get_email_by_username y username_available: SE USAN desde el cliente (anon para login),
-- así que las dejamos accesibles. Ya están restringidas a SELECT mínimo de información
-- pública (email asociado a un username, booleano de disponibilidad).
-- ============================================================
-- FIN
-- ============================================================
