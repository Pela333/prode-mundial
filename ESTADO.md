# Estado del proyecto · Prode Mundial 2026

Documento de seguimiento honesto: qué está hecho, qué falta y dónde la implementación se aparta de la spec original.

**Fecha:** 2026-05-12
**Spec fuentes:** [Especificacion_Prode_Mundial_2026.docx](Especificacion_Prode_Mundial_2026.docx) y [Reglamento Prode Mundial 2026.docx](Reglamento%20Prode%20Mundial%202026.docx).
**Decisiones consolidadas:** [DECISIONES.md](DECISIONES.md).

---

## ✅ Hecho

### Fase 0 — Schema de base de datos
- 9 tablas creadas con RLS estricto: `profiles`, `app_config`, `predictions`, `submissions`, `results`, `group_standings`, `bracket`, `audit_log`, `api_errors`, `user_bonus`.
- 5 migraciones aplicadas y versionadas en [supabase/migrations/](supabase/migrations/).
- Vista pública `app_config_public` (sin API key) y vista `ranking` con desempates (security_invoker).
- Funciones SQL: `handle_new_user`, `profiles_protect_immutable`, `touch_updated_at`, `calculate_match_points`, RPCs `get_email_by_username` y `username_available`.
- Hardening: search_path fijo en todas las funciones, EXECUTE revocado en triggers internos.

### Fase 1 — Usuarios, roles y perfil
- Registro con todos los campos obligatorios: nombre, apellido, email, teléfono, usuario, contraseña + confirmación. Validación cliente y servidor.
- Login con **email O username**. Recuperación de contraseña por email + página de reset.
- `/perfil`: edición de nombre/apellido/teléfono. Email y username inmutables (trigger SQL).
- Sistema de roles `player`/`admin`. Proxy ([src/proxy.ts](src/proxy.ts)) protege `/admin/*` por rol y blinda contra refresh tokens stale.
- Trigger `handle_new_user` que vuelca user_metadata en `profiles` al registrarse.

### Fase 2 — Fase de grupos
- Modelo de **submission única**: borrador editable con auto-save por partido + botón "Confirmar envío" que valida los 72 partidos completos.
- Modal "Revisá tus posiciones" antes de confirmar, con las 12 standings calculadas server-side.
- Cálculo de posiciones aplicando **criterios FIFA** ([src/lib/standings.ts](src/lib/standings.ts)): puntos → DG → GF → enfrentamiento directo (puntos/DG/GF) → fallback alfabético determinístico.
- Banner de estado por sección: `abierta` / `enviada` / `tiempo agotado`.
- Una vez enviado: lectura, no editable. Timestamp visible.

### Fase 3 — Integración API + Sync
- Cliente Football-Data.org con `X-Auth-Token` y captura de rate-limit headers ([src/lib/api/footballData.ts](src/lib/api/footballData.ts)).
- Mapeo bidireccional de los 48 equipos API ↔ fixture ([src/lib/api/teamMap.ts](src/lib/api/teamMap.ts)).
- Sync completo ([src/lib/api/sync.ts](src/lib/api/sync.ts)): matches → `results`, eliminatoria → `bracket`, posiciones → `group_standings`.
- Detección automática de deadlines de eliminatoria desde `bracket.scheduled_at` (1 hora antes del 1er y 2do partido de R32).
- Recálculo en cascada al actualizar resultados ([src/lib/api/recalc.ts](src/lib/api/recalc.ts)).
- Cliente service_role separado ([src/lib/supabase/admin.ts](src/lib/supabase/admin.ts)) para sync sin sesión.
- Endpoints HTTP: `/api/sync` (admin manual con sesión) y `/api/cron/sync` (Bearer `CRON_SECRET` para scheduler externo).
- Pantalla `/admin/api` con estado de conexión, KPIs del último sync, log de errores y botón manual.

### Fase 4 — Eliminatoria
- Fixture extendido con 31 slots (`R32_1..16`, `R16_1..8`, `QF_1..4`, `SF_1`, `SF_2`, `THIRD`, `FINAL`).
- Server actions con habilitación en dos partes:
  - **Parte 1**: solo `R32_1`. Se habilita cuando la API confirma ese cruce. Cierra 1h antes del partido.
  - **Parte 2**: los 30 restantes. Se habilita cuando los 16 cruces de R32 están definidos. Cierra 1h antes del 2do partido de R32.
- Por partido: marcador a 120' + selector **obligatorio** de ganador por penales (sin opción vacía).
- UI `/prode/eliminatoria` con bracket viewer + forms separados por sección.
- Estados visibles: `pending_api` / `open` / `submitted` / `closed_not_submitted`.

### Fase 5 — Admin
- **`/admin`**: dashboard con KPIs (participantes, envíos, deadlines).
- **`/admin/config`**: edición de `group_deadline` y `reveal_predictions_at` con `<input type="datetime-local">`. Las r32 deadlines son auto-config por API.
- **`/admin/usuarios`**: lista con email (vía service_role), estado de las 3 submissions, botones para ver/editar pronósticos y eliminar usuario (modal de confirmación + `audit_log`).
- **`/admin/usuarios/[id]`**: vista completa de pronósticos con comparativa contra resultados reales. Modal de edición individual con `audit_log`.
- **`/admin/resultados`**: tabla de todos los resultados sincronizados, filtrable. Modal de corrección manual con motivo opcional, snapshot del estado anterior, `audit_log` y recálculo automático en cascada.
- **`/admin/api`**: ver Fase 3.

### Ranking
- Vista SQL `ranking` con los 4 criterios de desempate aplicados como ORDER BY.
- Detección de empate técnico (mismos 4 criterios) marcado con `⇄`.
- Total = suma de `predictions.result_points + bonus_points` + bonus en `user_bonus` (`group_position` y futuros `podium_*`).

---

## ⏳ Pendiente

### Críticos para la operación normal
1. **Bonus de podio (al finalizar el torneo)**
   La tabla `user_bonus` está lista con tipos `podium_champion/runner/third/fourth`, pero falta la función que se dispara cuando el sync detecta status `FINISHED` en `THIRD` y `FINAL`. Cuando termine el Mundial habría que:
   - Determinar campeón, subcampeón, 3°, 4° desde `results.bracket`.
   - Para cada usuario, comparar con su pronóstico y otorgar 15/8/5/3.

2. **Sync programado automático**
   Tenemos el endpoint `/api/cron/sync` listo, pero no hay scheduler configurado. Opciones para activarlo:
   - GitHub Actions con `schedule: cron: '*/5 * * * *'` haciendo POST al endpoint con el `CRON_SECRET`.
   - cron-job.org (gratis) o EasyCron.
   - Vercel Cron si se hostea ahí.

3. **Configurar `SUPABASE_SERVICE_ROLE_KEY`**
   El placeholder está en `.env.local`. Sin esta key fallan: sync, eliminar usuarios, levantar emails. Sacar de Dashboard → Settings → API → service_role.

### Funcionalidad de la spec no implementada
4. **Vista pública de pronósticos ajenos** ([Spec módulo 10](Especificacion_Prode_Mundial_2026.docx))
   Lo que pide: "Una vez habilitado: lista de todos los participantes; al hacer clic en uno se ven todos sus pronósticos. Vista detallada por partido: resultado que puso el participante, resultado real y puntos obtenidos".
   Lo que tenemos: solo el admin puede ver pronósticos ajenos en `/admin/usuarios/[id]`. Falta una página `/participantes` o similar para jugadores, que respete `reveal_predictions_at` (ya tenemos la RLS habilitada para esto).

5. **Drill-down de ranking** ([Spec módulo 9](Especificacion_Prode_Mundial_2026.docx))
   La spec dice "Al hacer clic en un participante: ver puntaje desglosado (grupos, eliminatoria, bonus de podio)". El click no hace nada en `/ranking` actualmente. Faltaría una página `/ranking/[user_id]` o un modal con el desglose.

6. **Regla castigo R32_1 no enviado a tiempo** ([Spec módulo 5, tabla](Especificacion_Prode_Mundial_2026.docx))
   La spec dice: "No envió el 1er partido de 16avos antes del cierre → Ese partido = 0 pts. **En 8vos, el sistema asigna automáticamente el perdedor real del partido, sin posibilidad de elección por parte del usuario**".
   Hoy: si no enviás R32_1, ese partido queda 0 pts (correcto). Pero la regla extra de "asignar automáticamente el perdedor real" como participante en R16 no está implementada.
   **Importante:** la spec no termina de aclarar cómo materializar este castigo en nuestro modelo (donde el bracket viene cargado por la API y el usuario solo predice marcadores, no asigna equipos). Recomiendo discutir el alcance con el cliente.

7. **API key configurable desde panel admin** ([Spec módulo 8.4](Especificacion_Prode_Mundial_2026.docx))
   La spec dice "Ingreso y almacenamiento seguro de la API key". Hoy la key vive en `FOOTBALL_DATA_API_KEY` (variable de entorno del servidor). La columna `app_config.api_key_encrypted` está en el schema pero no se usa.
   Trade-off: meter la key en la DB requiere implementar encriptación (pgcrypto) y el server debe leer de DB en cada llamada. La env var es más segura y simple. Se puede decidir.

### Mejoras menores
8. **No permitir modificar deadlines pasadas**
   La spec dice "Posibilidad de modificar cualquiera de estas fechas **antes de que lleguen**". Hoy `/admin/config` permite cambiar cualquier deadline incluso si ya pasó. Validación trivial de agregar.

9. **Avatar de usuario**
   Hay columna `profiles.avatar_url` pero no hay UI para subir/mostrar.

10. **Activar "Leaked Password Protection" en Supabase**
    Es un warning del advisor. Se activa en Authentication → Policies del dashboard.

---

## ⚠️ Implementaciones que se apartan de la spec

### Diferencias deliberadas (decisiones tomadas)

| # | Spec dice | Implementación | Justificación |
|---|---|---|---|
| 1 | "48 partidos organizados visualmente por grupo" ([módulo 4](Especificacion_Prode_Mundial_2026.docx)) y "48 partidos de fase de grupos" ([módulo 7](Especificacion_Prode_Mundial_2026.docx)) | **72 partidos** | La spec se equivocó. Mundial 2026 = 12 grupos × 4 equipos = 6 partidos por grupo × 12 = **72**. Confirmado contra Football-Data.org (devuelve 72). El "48" sí aparece correctamente como "máximo evaluable de comparaciones de posición" (4 equipos × 12 grupos), eso quedó intacto. |
| 2 | "Inicio de sesión con usuario y contraseña" ([módulo 3](Especificacion_Prode_Mundial_2026.docx)) | Login acepta **email o usuario** | La spec dice "usuario", pero permitir email es UX estándar. No contradice — agrega flexibilidad. |
| 3 | "Por cada partido: input numérico de goles del equipo local y goles del equipo visitante" — implícito que se guarda por separado | **Auto-save por partido + submission única final** | La spec menciona "submission" pero no aclara el flujo de borrado. Implementé auto-save de borrador para que el usuario no pierda progreso, y la "confirmación" final es la que cuenta como envío oficial. |
| 4 | "Resultados de cada partido eliminatorio: a 90', a 120', si hubo penales y quién ganó" ([módulo 7](Especificacion_Prode_Mundial_2026.docx)) | El sync **solo guarda 120'** (no 90' separado para elim) | Football-Data.org no expone consistentemente "regularTime" como campo separado en eliminatoria; `score.fullTime` ya es 120' cuando hubo prórroga. Si después necesitás 90' separado de 120', habría que enriquecer con otro proveedor o cargar manual. **No afecta el cálculo de puntos** porque la spec dice que en elim se compara a 120'. |

### Discrepancias que conviene revisar (potenciales bugs)

| # | Spec dice | Implementación actual | Riesgo |
|---|---|---|---|
| A | "**Bonus posicionamiento**: +1 punto si el equipo que ganó el partido real fue clasificado por el usuario **en esa misma posición de grupo** en Fase 1" ([módulo 6](Especificacion_Prode_Mundial_2026.docx)) | Solucionado en commit `226ce6d`. Compara la posición pronosticada por el usuario contra la posición real en `group_standings` y requiere que haya acertado el ganador. | OK |
| B | "Por cada equipo ubicado en posición exacta de su grupo (posición calculada vs. **clasificación real de la API**): +2 puntos" ([módulo 6](Especificacion_Prode_Mundial_2026.docx)) | [recalc.ts:160-204](src/lib/api/recalc.ts#L160-L204) compara contra `group_standings`, que se llena desde el endpoint `/standings` de la API. El advisor verifica que sea correcto: ✓ | OK |
| C | "Posibilidad de modificar cualquiera de estas fechas **antes de que lleguen**" ([módulo 8.1](Especificacion_Prode_Mundial_2026.docx)) | `/admin/config` permite modificar también deadlines pasadas | Bajo. Si el admin se equivoca puede "reabrir" una fase ya cerrada. Validación trivial de agregar. |
| D | "Una vez enviado: todos los campos quedan en modo lectura, **no editables bajo ninguna circunstancia**" ([módulo 4](Especificacion_Prode_Mundial_2026.docx)) | El **admin** sí puede editar pronósticos enviados (en `/admin/usuarios/[id]`) | **Hay tensión** con la spec — pero la spec también dice (módulo 8.2) "El admin puede modificar los resultados cargados por cualquier usuario en cualquier momento". Las dos cláusulas se contradicen entre sí. Tomamos la de admin que es más explícita. |
| E | "Penales: la API trae si hubo penales y quién ganó" ([módulo 7](Especificacion_Prode_Mundial_2026.docx)) | Football-Data.org **plan free no garantiza traer `score.penalties`**. Detectamos `went_to_pens` por `duration === 'PENALTY_SHOOTOUT'`, pero el `pen_winner` puede quedar nulo. Mitigación: el admin lo carga manualmente desde `/admin/resultados`. | Medio. Hasta que arranque el Mundial no sabemos si Football-Data publica el dato. Si no, la corrección manual es viable pero requiere que el admin esté atento. |
| F | "Consulta periódica a la API cada 5 minutos durante días de partido" ([módulo 7](Especificacion_Prode_Mundial_2026.docx)) | Endpoint listo pero **sin scheduler activo** | Hay que configurar GitHub Actions o cron-job.org apuntando a `/api/cron/sync`. Esto es config fuera de código. |

### Diferencias semánticas (no contradicen, agregan)

| # | Spec | Implementación | Comentario |
|---|---|---|---|
| α | Spec habla de "16avos" y "8vos" sin aclarar nomenclatura interna | Usamos `r32` (=LAST_32, 16 partidos) y `r16` (=LAST_16, 8 partidos) en SQL/TS | Internamente más claro porque el formato 48 equipos genera confusión clásica. Las labels visibles dicen "16avos de Final" y "8vos de Final" como pide la spec. |
| β | Spec no menciona expiración de sesión específica | Default de Supabase Auth (1 hora con refresh) | Implícito en "Sesiones con expiración automática" (módulo 3). |
| γ | Spec no especifica formato de teléfono | Regex `^\+?\d[\d\s\-().]{6,19}$` (entre 7 y 20 dígitos con separadores comunes) | Basta-permisivo. |

---

## 🔧 Pasos siguientes recomendados (en orden)

1. **Cargar `SUPABASE_SERVICE_ROLE_KEY`** en `.env.local` y reiniciar dev. Sin esto el sync no anda.
2. ~~**Arreglar el bug del bonus posicionamiento** (discrepancia A)~~ (Solucionado).
3. **Probar el sync manual** desde `/admin/api` con la API real, ver si el bracket se llena bien y las deadlines se autoconfiguran.
4. **Construir la página pública de pronósticos ajenos** (pendiente 4) y el drill-down de ranking (pendiente 5).
5. **Implementar el bonus de podio** al finalizar el torneo (pendiente 1).
6. **Configurar el scheduler externo** para sync cada 5 min (pendiente 2).
7. **Discutir con el cliente** la regla castigo R32_1 (pendiente 6) — la spec es ambigua sobre cómo materializarla.
