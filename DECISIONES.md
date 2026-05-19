# Decisiones de negocio · Prode Mundial 2026

Documento vivo con las reglas funcionales y técnicas acordadas para el sistema. Las fuentes originales son [Especificacion_Prode_Mundial_2026.docx](Especificacion_Prode_Mundial_2026.docx) y [Reglamento Prode Mundial 2026.docx](Reglamento%20Prode%20Mundial%202026.docx). Este documento prevalece cuando hay ambigüedad.

Fecha: 2026-05-12

---

## 1. Roles

| Rol | Capacidades |
|---|---|
| **Jugador** | Carga sus propios pronósticos. Ve la tabla de posiciones general en todo momento. Ve los pronósticos de otros sólo después de la fecha/hora habilitada por el admin. Nunca puede ver ni modificar pronósticos ajenos. |
| **Administrador** | No participa como jugador. Acceso total a configuración. Ve los pronósticos de cualquier usuario en cualquier momento. Puede editar pronósticos de otros. Puede corregir resultados reales (queda registrado quién y cuándo). El panel `/admin/*` está prohibido para jugadores. |

El primer admin se promueve manualmente vía script/SQL (`UPDATE profiles SET role='admin' WHERE id=...`).

## 2. Registro y cuenta

**Campos obligatorios al registrarse:** nombre, apellido, email, teléfono, nombre de usuario, contraseña, confirmación de contraseña.

**Validaciones:**
- Email único en todo el sistema (no se permiten dos cuentas con el mismo email).
- Formato válido de email y teléfono.
- Confirmación de contraseña debe coincidir.
- Username único.

**Una vez registrado:**
- Email y nombre de usuario son **inmutables**.
- Nombre, apellido y teléfono son editables desde `/perfil`.

**Sesión:** login con usuario/email + contraseña, logout, recuperación por email, expiración automática de sesión.

## 3. Sistema de puntuación

### 3.1. Fase de grupos (resultado a 90')

| Acierto | Puntos |
|---|---|
| Resultado exacto | **3** |
| Ganador correcto / empate correcto (no exacto) | **1** |
| Posición exacta de un equipo en su grupo | **2** por equipo |

- Las posiciones 1°/2°/3°/4° de cada grupo **NO** las elige el usuario: el sistema las calcula automáticamente a partir de los marcadores que el usuario pronosticó.
- Máximo de comparaciones de posición: 4 equipos × 12 grupos = **48** (hasta 96 pts por bonus de grupo).

### 3.2. Fase eliminatoria (resultado a 120', incluyendo prórroga, antes de penales)

| Acierto | Puntos |
|---|---|
| Resultado exacto a 120' | **3** |
| Ganador / empate correcto a 120' (no exacto) | **1** |
| Ganador por penales correcto | **1** (sólo si el partido real llegó a penales) |
| Bonus posicionamiento | **1** por partido si el equipo que ganó realmente fue ubicado por el usuario en esa misma posición de grupo en Fase 1 |

El selector de ganador por penales es **siempre obligatorio** al cargar un partido eliminatorio, aunque el usuario crea que no llegará a penales. No existe opción vacía.

### 3.3. Bonus de podio (al finalizar el torneo)

| Acierto | Puntos |
|---|---|
| Campeón exacto | **15** |
| Subcampeón exacto | **8** |
| Tercer puesto exacto | **5** |
| Cuarto puesto exacto | **3** |

### 3.4. Recálculo

- Los puntos se recalculan automáticamente cada vez que la API reporta un nuevo resultado real, o cuando el admin corrige manualmente un resultado.
- El recálculo es **en cascada** (todos los puntajes afectados, no sólo el partido modificado).
- Los pronósticos originales del usuario **nunca se pisan**: el puntaje siempre es recalculable desde cero.

## 4. Criterios de desempate (orden de prioridad)

1. Mayor cantidad de **resultados exactos totales** (en todas las fases).
2. Mayor cantidad de **posiciones de grupo acertadas**.
3. Mayor cantidad de **puntos en fase eliminatoria** (16avos a final).
4. Si persiste la igualdad → **división del premio** (empate técnico marcado visualmente en el ranking).

## 5. Fase de grupos — pronósticos

- 72 partidos organizados visualmente en 12 grupos (A–L) de 4 equipos (6 partidos por grupo).
- Por partido: input numérico de goles local y visitante. Sólo enteros ≥ 0.
- Visualización con escudos y nombres.
- **Modelo de envío: submission única.** El usuario puede ir guardando borrador, pero hasta que aprieta "Confirmar envío" no cuenta como enviado.
- Antes de confirmar, se muestran las **posiciones calculadas** (1°-4° por grupo, según los marcadores del usuario) para que las revise.
- "Confirmar envío" valida que los 72 partidos estén completos. Si falta alguno, se indica exactamente cuáles y se bloquea el envío.
- Una vez enviado: **todos los campos quedan en modo lectura** y el usuario no puede modificarlos bajo ninguna circunstancia.
- Se registra fecha y hora exacta del envío.

**Fecha límite de Fase 1:** configurable por el admin (debe ser anterior al primer partido del Mundial). Modelo elegido: **deadline global única** (no se aplica bloqueo por partido individual).

- Si la fecha límite pasó y el usuario **no envió**: mensaje "Tiempo agotado", formulario vacío bloqueado.
- Si la fecha límite pasó y el usuario **sí envió**: muestra sus datos en modo lectura.

## 6. Fase eliminatoria — pronósticos

Estructura: 31 partidos = 16avos (16) + 8vos (8) + cuartos (4) + semifinales (2) + 3er puesto (1) + final (1).

El cuadro eliminatorio se construye automáticamente desde la API con los cruces reales.

### 6.1. Habilitación en dos partes

| Parte | Qué incluye | Habilitación | Cierre |
|---|---|---|---|
| **Parte 1** | Sólo el 1er partido de 16avos (2° Grupo A vs 2° Grupo B) | Cuando la API confirma que ese cruce está definido | 1 hora antes del inicio de ese partido |
| **Parte 2** | Los 30 partidos restantes (desde 2do partido de 16avos hasta la final) | Cuando la API confirma los 15 cruces restantes de 16avos completos | 1 hora antes del 2do partido de 16avos |

### 6.2. Carga por partido

- Inputs de goles local/visitante a 120' (incluyendo prórroga, antes de penales).
- Selector **obligatorio** de ganador por penales (los 2 equipos como únicas opciones, sin opción vacía).
- Validación: si falta cualquier campo o selector, no se permite enviar.
- Una vez enviada cada parte: lectura, no editable.
- Se registra fecha y hora del envío.

### 6.3. Reglas especiales

| Situación | Consecuencia |
|---|---|
| Envió Parte 1 antes del cierre | Normal, puntaje completo disponible. |
| **No envió Parte 1** | Ese partido = 0 pts. En 8vos, el sistema asigna automáticamente al **perdedor real** del partido (sin elección del usuario), para no romper su bracket. |
| **No envió Parte 2** completa antes del cierre | Toda la Fase 2 (excepto el 1er partido de 16avos) queda anulada = 0 pts. |
| Envió todo desde 16avos hasta final antes del cierre | Normal, puntaje completo. |

## 7. Integración con API externa

**Proveedor elegido:** [Football-Data.org](https://www.football-data.org).

- Plan: free tier (10 req/min más que suficiente para sync cada 5 min).
- **Limitación conocida:** Football-Data.org no expone el ganador de la tanda de penales en su tier gratuito. Como solución provisoria: el sync detecta `went_to_pens=true` cuando el partido terminó empatado a 120' y hay un ganador del partido. El admin completa manualmente `pen_winner` desde el panel cuando ocurra (queda en `audit_log`). A futuro evaluamos si conviene enchufar API-Football como segundo proveedor sólo para esos partidos, o si se carga manualmente todo el resultado eliminatorio.

### 7.1. Datos que se obtienen de la API

- 72 partidos de fase de grupos: fecha, hora, estadio, equipos, resultado final.
- Estado de cada partido: no iniciado / en curso / finalizado.
- Clasificados reales de cada grupo al finalizar la fase: posiciones 1°-4°.
- Cruces de cada ronda eliminatoria.
- Resultados eliminatoria: a 90', a 120', si hubo penales y quién ganó (con la limitación arriba mencionada).
- Ganadores finales del torneo (1°, 2°, 3°, 4°).

### 7.2. Comportamiento

- Consulta periódica cada **5 minutos** durante días de partido (Edge Function de Supabase + cron).
- Al detectar partido finalizado: recálculo de puntos en cascada para todos los usuarios afectados.
- Al detectar el primer cruce de 16avos: habilitar Parte 1 de Fase 2 automáticamente.
- Al confirmar los 15 cruces restantes de 16avos: habilitar Parte 2.
- Si la API no responde: mostrar últimos datos disponibles, no interrumpir la app.
- Log de errores de API visible al admin.

### 7.3. Configuración

- API key almacenada de forma segura (Supabase Vault o env var del lado server).
- Indicador de estado de la conexión visible al admin.
- Botón "Sincronizar ahora" para forzar sync manual.

## 8. Panel de administración (`/admin`)

Acceso restringido por rol. Inaccesible para jugadores.

### 8.1. Configuración de fechas y habilitaciones

- Fecha y hora límite Fase 1.
- Fecha y hora límite Parte 1 Fase 2 (idealmente automática por API).
- Fecha y hora límite Parte 2 Fase 2 (idealmente automática por API).
- Fecha y hora a partir de la cual los usuarios pueden ver pronósticos de otros (manual).
- Cualquiera de estas fechas se puede modificar **antes** de que llegue.

### 8.2. Gestión de participantes

- Lista de usuarios: nombre, apellido, email, teléfono, estado de envíos (Fase 1, Parte 1, Parte 2).
- Eliminar usuario.
- Ver y modificar los pronósticos cargados por cualquier usuario en cualquier momento.

### 8.3. Gestión de resultados reales

- Vista de todos los resultados reales obtenidos de la API.
- Corrección manual de un resultado en caso de error.
- Toda corrección manual queda en `audit_log` (quién y cuándo).
- Al corregir, recálculo automático en cascada.

### 8.4. Configuración API

- Ingresar y almacenar API key.
- Indicador de estado de la conexión.
- Botón de sync manual.
- Vista del log de errores de API.

## 9. Tabla de posiciones

- Visible para **todos** los usuarios en todo momento, incluso antes de enviar sus pronósticos.
- Columnas: posición, nombre y apellido del participante, puntaje total, estado de envío.
- Ordenada por puntaje descendente con los 4 criterios de desempate aplicados.
- Indicación visual de empate técnico cuando dos o más participantes quedan iguales luego de los 4 criterios.
- Actualización automática al recalcular puntos.
- Click en un participante → vista con desglose: puntos de grupos / eliminatoria / bonus podio.

## 10. Visualización de pronósticos ajenos

- Bloqueado hasta la fecha/hora habilitada por el admin.
- Mientras está bloqueado: mensaje indicando cuándo se habilitará.
- Una vez habilitado: lista de participantes; click en uno → ver todos sus pronósticos.
- Vista por partido: marcador del participante, marcador real, puntos obtenidos.
- El admin ve esta vista en cualquier momento sin restricción.

## 11. Requisitos generales

### 11.1. Diseño y usabilidad

- Totalmente responsive (mobile, tablet, desktop).
- Navegación clara: Fase 1, Fase 2, Tabla de posiciones, Mi perfil.
- Indicadores visuales de estado por sección: `bloqueada / abierta / enviada / cerrada / tiempo agotado`.

### 11.2. Seguridad

- Contraseñas encriptadas (Supabase Auth ya lo provee, nunca en texto plano).
- Sesiones con expiración automática.
- Rutas `/admin/*` protegidas por rol — middleware bloquea jugadores.
- RLS en Supabase: ningún usuario puede leer ni modificar `predictions` de otros, salvo el admin (excepción: SELECT post-revelación).

### 11.3. Consistencia de datos

- Todos los envíos registran fecha y hora exacta.
- Ningún pronóstico enviado puede ser modificado por el usuario que lo cargó.
- Los pronósticos originales nunca se sobreescriben (puntaje recalculable desde cero).
- Migración inicial: empezar con base de datos limpia (no se preservan predicciones del prototipo).

---

## Apéndice A — Stack técnico

- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind 4.
- **Backend / DB / Auth:** Supabase (Postgres + Auth + Edge Functions + Cron).
- **API datos partidos:** Football-Data.org.
- **Hosting:** a definir (Vercel candidato natural).

## Apéndice B — Modelo de datos (resumen)

| Tabla | Propósito |
|---|---|
| `profiles` | Datos del usuario (incluye `role`, `first_name`, `last_name`, `phone`). |
| `predictions` | Pronósticos por partido (grupos y eliminatorias). |
| `submissions` | Una fila por (usuario, fase) cuando confirma envío — define lo que cuenta. |
| `results` | Resultados reales (incluye 90', 120', penales, correcciones). |
| `group_standings` | Posiciones reales de cada grupo según API. |
| `bracket` | Cruces reales detectados desde la API. |
| `app_config` | Fechas límite, fecha de revelación, API key. |
| `audit_log` | Correcciones manuales del admin. |
| `api_errors` | Errores de sync con la API. |
