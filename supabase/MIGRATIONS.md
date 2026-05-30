# Reglas para escribir migraciones

**Leé esto antes de tocar `supabase/migrations/`.** Si vas a hacer cambios al schema (nueva tabla, nueva vista, nueva función, ALTER), aplicá las reglas de abajo o vas a romper la app.

---

## 1. Grants explícitos en tablas/vistas/funciones nuevas

A partir de **2026-10-30**, Supabase deja de otorgar automáticamente `SELECT/INSERT/UPDATE/DELETE` sobre tablas nuevas de `public.*` a los roles `anon` y `authenticated`. Sin esos grants, la tabla es **invisible para supabase-js** (errores tipo "relation does not exist" o "permission denied"). RLS no reemplaza los grants — necesitás **ambos**.

### Las 10 tablas actuales están bien

No las toques por este motivo: `profiles`, `app_config`, `predictions`, `submissions`, `results`, `group_standings`, `bracket`, `audit_log`, `api_errors`, `user_bonus`. Existen antes del cutoff y conservan sus grants automáticos.

### Template para una tabla nueva

```sql
CREATE TABLE IF NOT EXISTS public.nueva_tabla (
  -- columnas
);

-- 1) Grants (necesario para que el cliente la vea)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO authenticated;
-- Si necesita ser leída sin sesión (caso raro, ej. tabla pública), agregá:
-- GRANT SELECT ON public.nueva_tabla TO anon;

-- 2) RLS (la pared de seguridad real)
ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nueva_tabla_select_..." ON public.nueva_tabla
  FOR SELECT TO authenticated USING (...);
-- + las policies que correspondan
```

**Principio de menor privilegio:** otorgá sólo las operaciones que el rol realmente va a usar. Si una tabla es write-only desde el server (ej. `audit_log` se llena con service_role), no le des INSERT a `authenticated`.

### Template para una vista nueva

```sql
CREATE VIEW public.nueva_vista
WITH (security_invoker = true)   -- siempre, para que respete RLS del que consulta
AS
SELECT ...;

GRANT SELECT ON public.nueva_vista TO authenticated;
```

### Template para una función nueva

```sql
CREATE OR REPLACE FUNCTION public.nueva_func(arg TEXT)
RETURNS ...
LANGUAGE plpgsql
SECURITY INVOKER                  -- preferir INVOKER salvo que necesites privilegios elevados
SET search_path = public, pg_temp -- siempre, evita ataques de shadowing
AS $$
BEGIN
  ...
END;
$$;

-- Por defecto las funciones son ejecutables por PUBLIC. Si es server-only (trigger,
-- helper interno), revocá:
REVOKE EXECUTE ON FUNCTION public.nueva_func(TEXT) FROM PUBLIC, anon, authenticated;

-- Si tiene que llamarse desde el cliente:
GRANT EXECUTE ON FUNCTION public.nueva_func(TEXT) TO authenticated;
```

---

## 2. Otras reglas que ya aprendimos a la mala

### Renombrar enums

`ALTER TYPE ... RENAME VALUE` no existe. Para cambiar valores de un enum tenés que:
1. `DROP VIEW` de cualquier vista que referencie la columna del enum.
2. `ALTER TABLE ... ALTER COLUMN phase TYPE TEXT USING phase::text;` en cada tabla que lo usa.
3. `DROP TYPE old_enum;`
4. `CREATE TYPE new_enum AS ENUM (...);`
5. `ALTER TABLE ... ALTER COLUMN phase TYPE new_enum USING phase::new_enum;` en cada tabla.
6. Recrear la vista.
7. Recrear cualquier FUNCTION/POLICY que dependiera del tipo viejo.

Ver `0003_rename_phases.sql` como referencia.

### Funciones SECURITY DEFINER

- Siempre con `SET search_path = public, pg_temp` (evita warnings del advisor y ataques).
- Revocar `EXECUTE` de `PUBLIC, anon, authenticated` si es interna.
- Si la función es callable desde el cliente y devuelve datos de tablas que el caller no podría leer normalmente (ej. `get_email_by_username`), dejá un comentario explicando por qué es intencional — el advisor genera warnings (no errors) para estas y los ignoramos a propósito.

### Vistas

Siempre `WITH (security_invoker = true)`. Por default en pg17 ya lo es, pero ser explícito evita advisors del nivel ERROR.

### RLS en tablas nuevas

`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` es **obligatorio** en cualquier tabla nueva de `public.*`. Sin RLS, cualquiera puede leerla. El advisor lo flaggea como ERROR.

---

## 3. Después de aplicar la migración

1. **Correr el advisor de seguridad** y revisar findings nuevos.
   - `ERROR` → arreglar con migración follow-up antes de seguir.
   - `WARN` → evaluar; si es de las funciones SECURITY DEFINER que dejamos a propósito, ignorar.
2. **Correr el build** (`npx next build`) para verificar que el código TS sigue consistente con el schema.
3. **Probar el flujo** que toca la tabla nueva, sea desde la app o vía SQL editor.

---

## 4. Numeración y nombres de migraciones

Las migraciones viven en `supabase/migrations/` con formato `NNNN_descripcion_corta.sql`:

- `0001_initial_schema.sql`
- `0002_security_hardening.sql`
- `0003_rename_phases.sql`
- `0004_rename_app_config_deadlines.sql`
- `0005_user_bonus.sql`

Nueva migración → `0006_lo_que_sea.sql`. **Nunca editar migraciones ya aplicadas** — escribir una nueva.
