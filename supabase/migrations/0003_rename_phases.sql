-- ============================================================
-- 0003 — Renombrar fases para Mundial 2026 (48 equipos)
-- ============================================================
-- Con 48 equipos clasificando 32 a eliminatoria:
--   "16avos" = LAST_32 (16 partidos) — internamente r32
--   "8vos"   = LAST_16  (8 partidos) — internamente r16
--   cuartos  = QUARTER_FINALS (4)
--   semis    = SEMI_FINALS (2)
--   tercer   = THIRD_PLACE (1)
--   final    = FINAL (1)
--
-- Hasta ahora `match_phase` tenía:
--   ('group','r16','qf','sf','third','final')   ← faltaba uno y r16 era ambiguo
-- Pasa a:
--   ('group','r32','r16','qf','sf','third','final')
--
-- `submission_phase` cambia 'r16_first'/'r16_rest' → 'r32_first'/'r32_rest'
-- para alinear con la spec ("1er partido de 16avos").
--
-- Las tablas `predictions`, `results`, `bracket` y `submissions`
-- están vacías, por lo que recrear los enums es seguro.
-- ============================================================

-- 1. Reemplazar match_phase
ALTER TABLE public.predictions   ALTER COLUMN phase TYPE TEXT USING phase::text;
ALTER TABLE public.results       ALTER COLUMN phase TYPE TEXT USING phase::text;
ALTER TABLE public.bracket       ALTER COLUMN phase TYPE TEXT USING phase::text;
DROP FUNCTION IF EXISTS public.calculate_match_points(
  match_phase, INTEGER, INTEGER, INTEGER, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
);
DROP TYPE IF EXISTS match_phase;

CREATE TYPE match_phase AS ENUM ('group', 'r32', 'r16', 'qf', 'sf', 'third', 'final');

ALTER TABLE public.predictions ALTER COLUMN phase TYPE match_phase USING phase::match_phase;
ALTER TABLE public.results     ALTER COLUMN phase TYPE match_phase USING phase::match_phase;
ALTER TABLE public.bracket     ALTER COLUMN phase TYPE match_phase USING phase::match_phase;

-- Recrear la función con el nuevo enum
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
    v_h := p_real_home; v_a := p_real_away;
    v_ph := p_pred_home; v_pa := p_pred_away;
  ELSE
    v_h := p_real_home_120; v_a := p_real_away_120;
    v_ph := p_pred_home_120; v_pa := p_pred_away_120;
  END IF;

  IF v_h IS NULL OR v_a IS NULL OR v_ph IS NULL OR v_pa IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF v_ph = v_h AND v_pa = v_a THEN
    v_result_pts := 3;
  ELSIF (v_ph > v_pa AND v_h > v_a)
     OR (v_ph < v_pa AND v_h < v_a)
     OR (v_ph = v_pa AND v_h = v_a) THEN
    v_result_pts := 1;
  END IF;

  IF p_phase <> 'group' AND p_real_went_pens AND p_real_pen_winner IS NOT NULL
     AND p_pred_pen_winner IS NOT NULL
     AND p_pred_pen_winner = p_real_pen_winner THEN
    v_pen_bonus := 1;
  END IF;

  RETURN QUERY SELECT v_result_pts, v_pen_bonus;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.calculate_match_points(
  match_phase, INTEGER, INTEGER, INTEGER, INTEGER, TEXT,
  INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;

-- 2. Reemplazar submission_phase
ALTER TABLE public.submissions ALTER COLUMN phase TYPE TEXT USING phase::text;
DROP TYPE IF EXISTS submission_phase;

CREATE TYPE submission_phase AS ENUM ('group', 'r32_first', 'r32_rest');

ALTER TABLE public.submissions ALTER COLUMN phase TYPE submission_phase USING phase::submission_phase;

-- 3. Recrear la vista ranking que referenciaba los nombres viejos
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
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r32_first') AS sent_r32_first,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r32_rest') AS sent_r32_rest
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
  sent_group, sent_r32_first, sent_r32_rest
FROM agg
ORDER BY
  total_points DESC,
  exactos_total DESC,
  aciertos_grupo DESC,
  pts_eliminatoria DESC;

ALTER VIEW public.ranking SET (security_invoker = true);
GRANT SELECT ON public.ranking TO authenticated;
