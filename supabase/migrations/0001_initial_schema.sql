-- ============================================================
-- PRODE MUNDIAL 2026 — Migración inicial
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase (o vía CLI).
-- Esta migración crea todo el schema desde cero según la
-- especificación. Si existen tablas previas del prototipo,
-- borralas antes (decisión "empezar limpio" — ver DECISIONES.md).
-- ============================================================

-- ============================================================
-- 1. ENUMS y tipos
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('player', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_phase AS ENUM ('group', 'r16_first', 'r16_rest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_phase AS ENUM ('group', 'r16', 'qf', 'sf', 'third', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABLA: profiles
-- ============================================================
-- Datos del usuario. Vinculada 1:1 con auth.users.

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'player',
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cualquier autenticado puede leer perfiles (necesario para ranking, nombre+apellido visibles)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Sólo el propio usuario edita su perfil (excepto role, controlado por trigger)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert sólo por el propio usuario (lo dispara handle_new_user vía SECURITY DEFINER,
-- pero igual seteamos política por consistencia)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Admin puede borrar usuarios (eliminando su auth.users entry, lo cual cascadea)
-- El delete real ocurre via service_role desde server action.

-- Trigger: impedir cambiar username, email, role desde el cliente
CREATE OR REPLACE FUNCTION public.profiles_protect_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'El nombre de usuario no se puede modificar';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Sólo el admin puede modificar el rol';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_protect_immutable ON public.profiles;
CREATE TRIGGER profiles_protect_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_immutable();

-- Trigger: crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. TABLA: app_config (singleton — fila id=1)
-- ============================================================
-- Configuración global del prode (fechas límite, fecha de revelación, API key).

CREATE TABLE IF NOT EXISTS public.app_config (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  group_deadline              TIMESTAMPTZ,            -- Fecha límite Fase 1
  r16_first_deadline          TIMESTAMPTZ,            -- 1h antes del 1er partido 16avos (auto)
  r16_rest_deadline           TIMESTAMPTZ,            -- 1h antes del 2do partido 16avos (auto)
  reveal_predictions_at       TIMESTAMPTZ,            -- Fecha desde la que se ven pronósticos ajenos
  api_provider                TEXT DEFAULT 'football-data',
  api_key_encrypted           TEXT,                   -- API key encriptada
  last_sync_at                TIMESTAMPTZ,
  last_sync_status            TEXT,                   -- 'ok' | 'error'
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Lectura: todo autenticado puede ver fechas y estado de la app (no la api_key)
-- Para evitar exponer la API key, NO devolvemos esa columna en queries del cliente
-- (uso una vista filtrada abajo).
DROP POLICY IF EXISTS "app_config_select_admin" ON public.app_config;
CREATE POLICY "app_config_select_admin" ON public.app_config
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "app_config_update_admin" ON public.app_config;
CREATE POLICY "app_config_update_admin" ON public.app_config
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Vista pública de las fechas (sin api key) — accesible a todos los autenticados
CREATE OR REPLACE VIEW public.app_config_public AS
SELECT
  id,
  group_deadline,
  r16_first_deadline,
  r16_rest_deadline,
  reveal_predictions_at,
  last_sync_at,
  last_sync_status
FROM public.app_config;

GRANT SELECT ON public.app_config_public TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_config_touch ON public.app_config;
CREATE TRIGGER app_config_touch
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. TABLA: predictions
-- ============================================================
-- Pronósticos por partido. Una fila por (user, match).
-- Fase de grupos: home_score / away_score (a 90').
-- Fase eliminatoria: home_score_120 / away_score_120 + pen_winner.

CREATE TABLE IF NOT EXISTS public.predictions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id            TEXT NOT NULL,                 -- 'A1', 'B2', 'R16_1', etc.
  phase               match_phase NOT NULL,

  -- Fase de grupos (a 90')
  home_score          INTEGER CHECK (home_score IS NULL OR home_score >= 0),
  away_score          INTEGER CHECK (away_score IS NULL OR away_score >= 0),

  -- Fase eliminatoria (a 120')
  home_score_120      INTEGER CHECK (home_score_120 IS NULL OR home_score_120 >= 0),
  away_score_120      INTEGER CHECK (away_score_120 IS NULL OR away_score_120 >= 0),
  pen_winner          TEXT,                          -- Nombre del equipo ganador por penales

  -- Puntos calculados (recalculables siempre)
  result_points       INTEGER NOT NULL DEFAULT 0,    -- 3 / 1 / 0 por resultado
  bonus_points        INTEGER NOT NULL DEFAULT 0,    -- Posicionamiento eliminatoria + penales

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, match_id)
);

CREATE INDEX IF NOT EXISTS predictions_user_idx ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS predictions_match_idx ON public.predictions(match_id);
CREATE INDEX IF NOT EXISTS predictions_phase_idx ON public.predictions(phase);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Lectura: el dueño siempre; el admin siempre; resto SÓLO después de reveal_predictions_at
DROP POLICY IF EXISTS "predictions_select" ON public.predictions;
CREATE POLICY "predictions_select" ON public.predictions
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.app_config
      WHERE id = 1 AND reveal_predictions_at IS NOT NULL AND reveal_predictions_at <= NOW()
    )
  );

-- Insert/update: el dueño SIEMPRE QUE NO HAYA SUBMISSION CONFIRMADA para esa fase.
-- La verificación de "ya submitió" se hace server-side en la RPC submit_*,
-- pero acá protegemos con una política basada en submissions.
DROP POLICY IF EXISTS "predictions_write_own" ON public.predictions;
CREATE POLICY "predictions_write_own" ON public.predictions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS predictions_touch ON public.predictions;
CREATE TRIGGER predictions_touch
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 5. TABLA: submissions
-- ============================================================
-- Una fila por (usuario, fase) cuando confirma envío.
-- Sin fila ⇒ no envió ⇒ formulario vacío bloqueado tras deadline.

CREATE TABLE IF NOT EXISTS public.submissions (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase         submission_phase NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, phase)
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_select_own_or_admin" ON public.submissions;
CREATE POLICY "submissions_select_own_or_admin" ON public.submissions
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Insert sólo por el propio usuario (la RPC server-side valida deadline y completitud)
DROP POLICY IF EXISTS "submissions_insert_own" ON public.submissions;
CREATE POLICY "submissions_insert_own" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. TABLA: results
-- ============================================================
-- Resultados reales obtenidos de la API (con override manual).

CREATE TABLE IF NOT EXISTS public.results (
  match_id            TEXT PRIMARY KEY,
  phase               match_phase NOT NULL,
  home_score          INTEGER CHECK (home_score IS NULL OR home_score >= 0),  -- 90'
  away_score          INTEGER CHECK (away_score IS NULL OR away_score >= 0),
  home_score_120      INTEGER CHECK (home_score_120 IS NULL OR home_score_120 >= 0),  -- 120'
  away_score_120      INTEGER CHECK (away_score_120 IS NULL OR away_score_120 >= 0),
  went_to_pens        BOOLEAN NOT NULL DEFAULT FALSE,
  pen_winner          TEXT,
  status              TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'in_progress' | 'finished'

  -- Auditoría de override manual
  manual_override     BOOLEAN NOT NULL DEFAULT FALSE,
  corrected_by        UUID REFERENCES auth.users(id),
  corrected_at        TIMESTAMPTZ,

  -- Snapshot original de la API (por si admin corrige)
  api_home_score      INTEGER,
  api_away_score      INTEGER,
  api_home_score_120  INTEGER,
  api_away_score_120  INTEGER,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "results_select_all" ON public.results;
CREATE POLICY "results_select_all" ON public.results
  FOR SELECT TO authenticated USING (true);

-- Sólo service_role o admin escribe
DROP POLICY IF EXISTS "results_write_admin" ON public.results;
CREATE POLICY "results_write_admin" ON public.results
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS results_touch ON public.results;
CREATE TRIGGER results_touch
  BEFORE UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 7. TABLA: group_standings
-- ============================================================
-- Posiciones reales de cada grupo según API (al cerrar la fase).

CREATE TABLE IF NOT EXISTS public.group_standings (
  group_id      TEXT NOT NULL,           -- 'A'..'L'
  position      INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  team          TEXT NOT NULL,
  finalized     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, position)
);

ALTER TABLE public.group_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_standings_select_all" ON public.group_standings;
CREATE POLICY "group_standings_select_all" ON public.group_standings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "group_standings_write_admin" ON public.group_standings;
CREATE POLICY "group_standings_write_admin" ON public.group_standings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 8. TABLA: bracket
-- ============================================================
-- Cruces reales detectados desde la API para fase eliminatoria.

CREATE TABLE IF NOT EXISTS public.bracket (
  match_id      TEXT PRIMARY KEY,        -- 'R16_1', 'QF_1', etc.
  phase         match_phase NOT NULL,
  position      INTEGER NOT NULL,        -- orden dentro de la ronda
  home_team     TEXT,
  away_team     TEXT,
  scheduled_at  TIMESTAMPTZ,
  defined       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bracket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bracket_select_all" ON public.bracket;
CREATE POLICY "bracket_select_all" ON public.bracket
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bracket_write_admin" ON public.bracket;
CREATE POLICY "bracket_write_admin" ON public.bracket
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 9. TABLA: audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,                -- 'result_corrected' | 'user_deleted' | etc.
  target_type   TEXT,                         -- 'result' | 'prediction' | 'user'
  target_id     TEXT,
  meta          JSONB,                        -- detalle del cambio
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Sólo admin inserta (server actions con SECURITY DEFINER lo escriben)
DROP POLICY IF EXISTS "audit_log_insert_admin" ON public.audit_log;
CREATE POLICY "audit_log_insert_admin" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 10. TABLA: api_errors
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,
  endpoint      TEXT,
  status_code   INTEGER,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_errors_created_idx ON public.api_errors(created_at DESC);

ALTER TABLE public.api_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_errors_select_admin" ON public.api_errors;
CREATE POLICY "api_errors_select_admin" ON public.api_errors
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 11. FUNCIÓN: calculate_group_standings
-- ============================================================
-- Calcula 1°-4° de un grupo aplicando criterios FIFA, a partir
-- de los pronósticos del usuario para los 6 partidos del grupo.
-- Retorna SETOF (position, team) ordenado.
-- Criterios:
--   1. Puntos (V=3, E=1, D=0)
--   2. Diferencia de goles en el grupo
--   3. Goles a favor en el grupo
--   4. Enfrentamiento directo: puntos
--   5. Enfrentamiento directo: DG
--   6. Enfrentamiento directo: GF
--   7. Sorteo (orden estable por nombre como fallback determinístico)
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_group_standings(
  p_user_id UUID,
  p_group_id TEXT,
  p_group_teams TEXT[],     -- 4 equipos del grupo
  p_match_ids TEXT[]        -- 6 IDs de partidos del grupo
) RETURNS TABLE (position INTEGER, team TEXT) AS $$
DECLARE
  v_predictions JSONB;
BEGIN
  -- Armo un JSON con los marcadores pronosticados de los 6 partidos del grupo,
  -- junto con los equipos local y visitante (vienen del fixture, pasados afuera).
  -- Pero como en SQL no tenemos el fixture, mejor hacemos el cálculo afuera (TS).
  -- Esta función queda como STUB para usar desde la RPC submit_group_predictions
  -- cuando le pasemos también los matchups.
  -- IMPLEMENTACIÓN: el cálculo de posiciones lo hace TypeScript desde el client/server,
  -- y este SQL sólo se usa si queremos calcularlo on-demand desde otra ruta.
  RAISE EXCEPTION 'calculate_group_standings: usar la versión TypeScript en src/lib/standings.ts';
END;
$$ LANGUAGE plpgsql;

-- Nota: por simplicidad y para no duplicar el fixture en SQL, el cálculo de
-- posiciones se hace en TypeScript en src/lib/standings.ts. La función queda
-- declarada acá por si en el futuro queremos moverla a SQL (más performante
-- en recálculos masivos).

-- ============================================================
-- 12. FUNCIÓN: calculate_match_points
-- ============================================================
-- Calcula puntos de un pronóstico individual vs un resultado real.
-- Aplica reglas según fase.

CREATE OR REPLACE FUNCTION public.calculate_match_points(
  p_phase           match_phase,
  p_pred_home       INTEGER,
  p_pred_away       INTEGER,
  p_pred_home_120   INTEGER,
  p_pred_away_120   INTEGER,
  p_pred_pen_winner TEXT,
  p_real_home       INTEGER,
  p_real_away       INTEGER,
  p_real_home_120   INTEGER,
  p_real_away_120   INTEGER,
  p_real_went_pens  BOOLEAN,
  p_real_pen_winner TEXT
) RETURNS TABLE (result_pts INTEGER, pen_bonus INTEGER) AS $$
DECLARE
  v_result_pts INTEGER := 0;
  v_pen_bonus  INTEGER := 0;
  v_h INTEGER; v_a INTEGER; v_ph INTEGER; v_pa INTEGER;
BEGIN
  IF p_phase = 'group' THEN
    -- Comparar a 90'
    v_h := p_real_home; v_a := p_real_away;
    v_ph := p_pred_home; v_pa := p_pred_away;
  ELSE
    -- Eliminatoria: comparar a 120'
    v_h := p_real_home_120; v_a := p_real_away_120;
    v_ph := p_pred_home_120; v_pa := p_pred_away_120;
  END IF;

  IF v_h IS NULL OR v_a IS NULL OR v_ph IS NULL OR v_pa IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Resultado exacto
  IF v_ph = v_h AND v_pa = v_a THEN
    v_result_pts := 3;
  -- Ganador / empate correcto
  ELSIF (v_ph > v_pa AND v_h > v_a)
     OR (v_ph < v_pa AND v_h < v_a)
     OR (v_ph = v_pa AND v_h = v_a) THEN
    v_result_pts := 1;
  END IF;

  -- Penales: sólo aplica en eliminatoria y si el partido REAL llegó a penales
  IF p_phase <> 'group' AND p_real_went_pens AND p_real_pen_winner IS NOT NULL
     AND p_pred_pen_winner IS NOT NULL
     AND p_pred_pen_winner = p_real_pen_winner THEN
    v_pen_bonus := 1;
  END IF;

  RETURN QUERY SELECT v_result_pts, v_pen_bonus;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 13. VISTA: ranking
-- ============================================================
-- Tabla de posiciones con 4 criterios de desempate aplicados.
-- Aún no incluye bonus de posición de grupo ni bonus podio
-- (se calculan en cascada desde server actions y se suman acá).
-- TODO Fase 6: incorporar bonus de grupo y podio en la vista.

CREATE OR REPLACE VIEW public.ranking AS
WITH agg AS (
  SELECT
    pr.id AS user_id,
    pr.username,
    pr.first_name,
    pr.last_name,
    pr.role,
    COALESCE(SUM(p.result_points + p.bonus_points), 0) AS total_points,
    COUNT(p.id) FILTER (WHERE p.result_points = 3) AS exactos_total,
    COUNT(p.id) FILTER (WHERE p.phase = 'group' AND p.result_points > 0) AS aciertos_grupo,
    COALESCE(SUM(p.result_points + p.bonus_points) FILTER (WHERE p.phase <> 'group'), 0) AS pts_eliminatoria,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'group') AS sent_group,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r16_first') AS sent_r16_first,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r16_rest') AS sent_r16_rest
  FROM public.profiles pr
  LEFT JOIN public.predictions p ON pr.id = p.user_id
  WHERE pr.role = 'player'
  GROUP BY pr.id, pr.username, pr.first_name, pr.last_name, pr.role
)
SELECT
  user_id, username, first_name, last_name,
  total_points,
  exactos_total,
  aciertos_grupo,
  pts_eliminatoria,
  sent_group, sent_r16_first, sent_r16_rest
FROM agg
ORDER BY
  total_points DESC,
  exactos_total DESC,
  aciertos_grupo DESC,
  pts_eliminatoria DESC;

GRANT SELECT ON public.ranking TO authenticated;

-- ============================================================
-- 14. RPC: get_email_by_username (público, anon)
-- ============================================================
-- Permite hacer login con username: el cliente llama a esta RPC
-- antes de signInWithPassword para resolver el email del usuario.
-- SECURITY DEFINER para no requerir SELECT directo en profiles
-- desde anon.

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE LOWER(p.username) = LOWER(p_username)
  LIMIT 1;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.get_email_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO anon, authenticated;

-- ============================================================
-- 15. RPC: username_available
-- ============================================================
-- Verifica si un username está disponible (case-insensitive).
-- Usada por el form de registro para feedback en vivo.

CREATE OR REPLACE FUNCTION public.username_available(p_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(p_username)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(TEXT) TO anon, authenticated;

-- ============================================================
-- FIN
-- ============================================================
