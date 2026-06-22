-- Migración 0009: tabla singleton para caché del último sync
--
-- Almacena el SyncReport más reciente con su timestamp para evitar
-- llamadas redundantes a la API de Football-Data cuando el dato
-- tiene menos de 4 minutos.
--
-- Diseño singleton: la restricción CHECK (id = 1) garantiza que solo
-- exista una fila. Se inicializa vacía; el primer sync la creará.

CREATE TABLE IF NOT EXISTS public.sync_cache (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cached_at  timestamptz NOT NULL,
  payload    jsonb NOT NULL
);

-- Grants: el service_role escribe; authenticated solo lee (panel admin).
-- anon no necesita acceso.
GRANT SELECT ON public.sync_cache TO authenticated;
-- INSERT/UPDATE/DELETE los hace el service_role (bypass RLS implícito).

-- RLS obligatorio en tablas nuevas post-cutoff.
ALTER TABLE public.sync_cache ENABLE ROW LEVEL SECURITY;

-- Solo los admins pueden leer la caché desde el cliente.
-- El service_role del cron bypass RLS de todos modos.
CREATE POLICY "sync_cache_select_admin" ON public.sync_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
