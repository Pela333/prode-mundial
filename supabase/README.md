# Supabase — Prode Mundial 2026

## Migraciones

Las migraciones están en `migrations/`, versionadas y numeradas.

**Para aplicarlas:**

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Ejecutá cada archivo en orden numérico: `0001_*.sql`, luego `0002_*.sql`, etc.
3. Si venís del prototipo viejo, primero ejecutá `DROP TABLE IF EXISTS public.predictions, public.results, public.profiles CASCADE;` (decisión "empezar limpio" — ver [DECISIONES.md](../DECISIONES.md)).

## Promover el primer admin

Después de registrarte como usuario normal en la app, ejecutá en el SQL Editor:

```sql
UPDATE public.profiles SET role = 'admin' WHERE username = 'TU_USERNAME';
```

## Configurar fechas iniciales

```sql
UPDATE public.app_config SET
  group_deadline       = '2026-06-11 19:00:00-05',   -- ej. 1h antes del primer partido
  reveal_predictions_at = '2026-06-12 00:00:00-05'   -- a partir de cuándo se ven pronósticos ajenos
WHERE id = 1;
```

`r16_first_deadline` y `r16_rest_deadline` se setean automáticamente cuando la integración con la API detecta los cruces (Fase 3, todavía no implementada).
