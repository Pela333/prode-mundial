-- ============================================================
-- 0007 — Actualizar la vista ranking para permitir ranking de grupos separado
-- ============================================================

DROP VIEW IF EXISTS public.ranking;
CREATE OR REPLACE VIEW public.ranking AS
WITH agg AS (
  SELECT
    pr.id AS user_id,
    pr.username,
    pr.first_name,
    pr.last_name,
    pr.role,
    COALESCE(SUM(p.result_points + p.bonus_points), 0) + 
      COALESCE((SELECT SUM(points) FROM public.user_bonus ub WHERE ub.user_id = pr.id), 0) AS total_points,
    COUNT(p.id) FILTER (WHERE p.result_points = 3) AS exactos_total,
    COUNT(p.id) FILTER (WHERE p.phase = 'group' AND p.result_points = 3) AS exactos_grupo,
    COUNT(p.id) FILTER (WHERE p.phase = 'group' AND p.result_points > 0) AS aciertos_grupo,
    COALESCE(SUM(p.result_points + p.bonus_points) FILTER (WHERE p.phase <> 'group'), 0) AS pts_eliminatoria,
    COALESCE((SELECT SUM(points) FROM public.user_bonus ub WHERE ub.user_id = pr.id AND ub.type::text = 'group_position'), 0) AS pts_posicion_grupo,
    COALESCE((SELECT SUM(points) FROM public.user_bonus ub WHERE ub.user_id = pr.id AND ub.type::text LIKE 'podium_%'), 0) AS pts_podio,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'group') AS sent_group,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r32_first') AS sent_r32_first,
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.user_id = pr.id AND s.phase = 'r32_rest') AS sent_r32_rest
  FROM public.profiles pr
  LEFT JOIN public.predictions p ON pr.id = p.user_id
  GROUP BY pr.id, pr.username, pr.first_name, pr.last_name, pr.role
)
SELECT
  user_id, username, first_name, last_name,
  total_points,
  exactos_total,
  exactos_grupo,
  aciertos_grupo,
  pts_eliminatoria,
  pts_posicion_grupo,
  pts_podio,
  sent_group, sent_r32_first, sent_r32_rest
FROM agg;

ALTER VIEW public.ranking SET (security_invoker = true);
GRANT SELECT ON public.ranking TO authenticated;
