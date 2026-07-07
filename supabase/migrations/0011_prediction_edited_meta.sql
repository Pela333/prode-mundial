-- ============================================================
-- 11. Agregar soporte para marcar predicciones editadas a mano
-- ============================================================

-- 1) Agregar columnas a predictions
ALTER TABLE public.predictions 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;

-- 2) Marcar los 5 pronósticos editados manualmente el 30 de junio para el partido R16_1 (Canadá)
-- Excluyendo explícitamente a Ana Wehmeyer (Anaganaelprode) y Jacqueline Sanchez (JaquiSanchez)
UPDATE public.predictions
SET is_edited = true, edited_at = '2026-06-30 15:00:00+00'
WHERE match_id = 'R16_1' AND user_id IN (
  SELECT id FROM public.profiles 
  WHERE username IN ('andapallabobo', 'nancy', 'LVietta', 'Luisma', 'Angelica71')
);
