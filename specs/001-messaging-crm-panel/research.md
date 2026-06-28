# Research: Panel de Mensajería con CRM Multicanal

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

Todas las incógnitas del Technical Context quedan resueltas aquí. No quedan NEEDS CLARIFICATION.

## R1. Arquitectura general: monolito de un solo servicio

- **Decision**: Un solo proceso Node.js (Fastify) que sirve API REST, WebSocket, webhooks de WhatsApp y el frontend React compilado. PostgreSQL como único servicio adicional.
- **Rationale**: Single-tenant con ~10 usuarios concurrentes no justifica microservicios. Coolify despliega un compose de 2 servicios trivialmente; menos superficie = menos disgustos en producción (objetivo explícito del usuario). El usuario pidió "enterprise pero ligero, como Chatwoot sin tantas funciones".
- **Alternatives considered**: (a) Next.js full-stack — descartado: los webhooks de larga vida, WebSocket propio y workers encajan mal con el modelo serverless-first de Next y complican el contenedor; (b) backend + frontend como servicios separados — descartado: duplica configuración de despliegue y CORS sin beneficio a esta escala; (c) NestJS — descartado: más ceremonia de la necesaria.

## R2. Tiempo real: WebSocket nativo con hub propio

- **Decision**: `@fastify/websocket` (librería `ws`) con un hub simple en memoria: cada cliente autenticado se suscribe y el dominio publica eventos tipados (`message:new`, `conversation:updated`, `lead:stage_changed`, `template:status_changed`, `inbox:status_changed`, `window:reopened`). El cliente web reconecta con backoff y al reconectar refetchea vía TanStack Query (resincronización, cubre el edge case de desconexión).
- **Rationale**: Un solo nodo ⇒ no se necesita Socket.IO ni Redis pub/sub. El patrón "WS para invalidar + REST para leer" es robusto y simple: la fuente de verdad siempre es la API.
- **Alternatives considered**: Socket.IO — descartado: aporta rooms/adapters multi-nodo que no se usarán; SSE — viable pero el WS bidireccional simplifica presencia/typing futuros y es igual de soportado.

## R3. ORM y migraciones: Drizzle

- **Decision**: Drizzle ORM + drizzle-kit para migraciones SQL versionadas, driver `postgres` (postgres.js). Migraciones se aplican automáticamente al arrancar el contenedor.
- **Rationale**: TS-first, sin generación de cliente pesada, SQL transparente (necesario para FTS y `FOR UPDATE` en el pipeline de mensajes). Auto-migrate en arranque cumple SC-010 (deploy <30 min sin pasos manuales).
- **Alternatives considered**: Prisma — descartado: binario/engine más pesado en contenedor y peor soporte de SQL crudo para FTS; Knex/SQL a mano — más errores, sin tipos.

## R4. Autenticación y roles: sesiones de cookie propias

- **Decision**: Sesiones opacas en tabla `sessions` (token aleatorio 256-bit, hash en DB), cookie `httpOnly` + `SameSite=Lax` + `Secure` en producción, contraseñas con `argon2id`. Roles `admin` | `agent` aplicados por guards de Fastify. Desactivar usuario elimina sus sesiones (FR-032). Primer admin se crea por seed con credenciales de env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
- **Rationale**: Single-tenant autoalojado no necesita OAuth/JWT; las sesiones revocables en DB son el camino más simple que cumple "invalidar sesiones al desactivar". Sin dependencia de librerías de auth con churn (Lucia deprecada).
- **Alternatives considered**: JWT — descartado: revocación inmediata requiere lista de bloqueo ⇒ misma tabla, más complejidad; Auth.js — orientado a OAuth multi-proveedor, sobredimensionado.

## R5. Integración WhatsApp Cloud API

- **Decision**: Cliente propio sobre Graph API `v23.0` con `fetch`:
  - **Webhook entrante** (`POST /api/webhooks/whatsapp`): verificación de firma `X-Hub-Signature-256` (HMAC-SHA256 con `META_APP_SECRET`), handshake GET `hub.challenge` con `WEBHOOK_VERIFY_TOKEN`. Se procesan los campos `messages` (mensajes + estados) y `message_template_status_update`. Respuesta 200 inmediata; procesamiento en memoria post-respuesta (sin cola externa) con deduplicación por `wamid` (unique en DB).
  - **Provisioning** (`POST /api/provisioning/whatsapp`): endpoint autenticado por `PROVISIONING_SECRET` (header `Authorization: Bearer`) donde el servidor del tech provider entrega `{ waba_id, phone_number_id, display_phone_number, access_token }` dentro de la ventana de 1–180 s post-onboarding. Upsert por `phone_number_id` (cubre reintentos sin duplicar bandejas). El flujo de conexión en la UI crea antes una bandeja en estado `pending` y redirige a `https://aishiagency.tech/embedded-whatsapp-coex?client=onboarded-client`.
  - **Envíos**: `POST /{phone_number_id}/messages` con el token de la bandeja (texto libre, y `type: "template"` con `components` para plantillas). Errores de Meta se mapean a `messages.status = failed` + `failure_reason` legible.
  - **Plantillas**: `POST /{waba_id}/message_templates` (crear, categoría `MARKETING`/`UTILITY`, idioma, `components` con `BODY` y variables `{{n}}`), `GET` para listar/reconciliar, estado actualizado por webhook `message_template_status_update` y por re-sync manual.
  - **Adjuntos entrantes**: `GET /{media_id}` → URL temporal → descarga con token → se persiste en `/data/uploads` y se sirve desde el panel (las URLs de Meta expiran).
- **Rationale**: Es el contrato real de Meta; calcarlo hace que el modo simulación sea fiel y que la integración real "no lleve disgustos". Sin SDK: el SDK oficial de Meta para Node está abandonado.
- **Alternatives considered**: BSP intermedio (Twilio/360dialog) — descartado: el usuario ES el tech provider; colas (BullMQ+Redis) — descartado: volumen bajo, la deduplicación por `wamid` + retries de Meta dan suficiente resiliencia sin otro servicio.

## R6. Ventana de 24 h: cálculo local, bloqueo proactivo

- **Decision**: `conversations.last_inbound_at` se actualiza con el timestamp **del evento de Meta** (no del servidor). Ventana abierta ⇔ `now() - last_inbound_at < 24 h`. Se aplica en 3 capas: (1) UI — compositor cambia a modo plantilla y muestra cuenta regresiva; (2) API — rechaza texto libre fuera de ventana (422 con código `WINDOW_CLOSED`), también para la IA (FR-043); (3) ante timestamp ausente/ambiguo se trata como cerrada (asunción de la spec). Mensaje entrante nuevo reabre ventana y emite `window:reopened` por WS.
- **Rationale**: Bloqueo local antes de tocar el canal (SC-011); el timestamp del canal evita desfases de reloj.
- **Alternatives considered**: confiar en el rechazo de Meta — descartado: peor UX y consume rate limit; job programado que cierre ventanas — innecesario: el estado se deriva al consultar y la UI hace cuenta regresiva client-side.

## R7. Agentes IA: OpenRouter + RAG ligero sin embeddings

- **Decision**:
  - **OpenRouter**: `POST https://openrouter.ai/api/v1/chat/completions` (compatible OpenAI) con la API key del negocio; `GET /api/v1/models` para poblar el selector de modelos del wizard; validación de la key con `GET /api/v1/key`. Headers `HTTP-Referer`/`X-Title` recomendados por OpenRouter.
  - **Pipeline de respuesta automática**: tras persistir un mensaje entrante → si la conversación tiene auto-respuesta activa y ventana abierta → debounce de agrupación (~6 s, agrupa ráfagas de mensajes del contacto) → construir prompt (system = config del agente del wizard; historial reciente ≤20 mensajes; chunks RAG top-5) → completion → persistir como mensaje saliente `author_type: 'ai_agent'` → enviar por el canal. Errores ⇒ FR-029: nada al cliente, conversación marcada `needs_human`, error visible en panel.
  - **RAG**: extracción de texto (pdf-parse/mammoth/plain), chunking ~1.000 caracteres con solape 200, tabla `document_chunks` con columna `tsvector` (config `spanish`) + índice GIN; retrieval por `websearch_to_tsquery` con fallback `ILIKE` para términos cortos.
- **Rationale**: OpenRouter no ofrece endpoint de embeddings; añadir otro proveedor solo para embeddings rompe "una sola API key". FTS de Postgres es suficiente para FAQs/catálogos/política de negocio (documentos cortos, dominio acotado) y mantiene el sistema autocontenido. El debounce evita responder 3 veces a 3 mensajes seguidos (patrón real de WhatsApp).
- **Alternatives considered**: pgvector + embeddings de otro proveedor — descartado fase 1: segunda credencial y migración de extensión; se puede añadir después sin cambiar el contrato; LangChain — descartado: abstracción innecesaria sobre una llamada fetch.

## R8. Modo simulación y estrategia de pruebas

- **Decision**:
  - `SIMULATION_MODE=true` activa: (1) `POST /api/simulate/webhook` — acepta payloads con la estructura **exacta** del webhook de Meta y los pasa por el mismo parser/pipeline real (sin verificación de firma); (2) el cliente de envío a Graph API se sustituye por un mock que persiste el "envío", genera `wamid` falso y programa estados `sent→delivered` (y aprobación automática de plantillas a los ~5 s) para cerrar el ciclo completo; (3) fixtures tipados: mensaje de texto, imagen, audio, documento, mensaje con timestamp >24 h atrás (prueba de ventana), estados de entrega, aprobación/rechazo de plantilla, payload de número desconocido.
  - **Pruebas**: Vitest para unidades críticas (cálculo de ventana, parser de webhook, deduplicación, retrieval RAG, guards de roles) e integración con Postgres real (testcontainers o DB de docker-compose); Playwright en `e2e/` para los flujos de SC-013 usando `/api/simulate/webhook` como generador de tráfico; verificación interactiva final con Playwright MCP sobre el navegador del usuario.
- **Rationale**: FR-044/FR-045 y la petición explícita del usuario: producto verificado de punta a punta antes de integrar lo real. Reusar el pipeline real (no un atajo que escriba en DB) garantiza que lo testeado sea lo que correrá con Meta.
- **Alternatives considered**: mock server HTTP separado imitando Graph API — más fiel para probar reintentos, pero otro proceso que mantener; el mock en proceso cubre los mismos contratos con menos piezas.

## R9. Frontend: React + Vite + Tailwind + primitivas shadcn/Radix

- **Decision**: React 18 + Vite 6; Tailwind CSS 3.4 con design tokens CSS variables (modo oscuro por clase `dark`, preferencia persistida en DB por usuario y aplicada pre-render para evitar flash); componentes propios estilo shadcn/ui sobre Radix (dialog, dropdown, popover, toast); TanStack Query 5 (caché + invalidación por eventos WS); wouter para routing; `@dnd-kit` para drag & drop del Kanban; editor de plantillas con vista previa fiel a la burbuja de WhatsApp (variables resaltadas, contador de caracteres). UI íntegra en español.
- **Rationale**: Cumple "sobrio, claro, profesional + modo oscuro" con control total del diseño y bundle ligero; dnd-kit es el estándar accesible para kanban; wouter evita el peso de react-router.
- **Alternatives considered**: Mantine/AntD — descartado: estética menos "sobria-enterprise" y theming más rígido; Redux — innecesario: estado de servidor en Query + estado local mínimo.

## R10. Despliegue: Docker multi-stage + Compose para Coolify

- **Decision**: `Dockerfile` multi-stage (1: build web, 2: build server, 3: runtime `node:22-alpine` con `web/dist` + `server/dist` + migraciones). `docker-compose.yml` con servicios `app` (puerto 3000, volumen `/data/uploads`, healthcheck `/api/health`) y `db` (postgres:16-alpine, volumen). Migraciones + seed idempotente en el arranque. `.env.example` documenta todo: `DATABASE_URL`, `SESSION_SECRET`, `PROVISIONING_SECRET`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `SIMULATION_MODE`.
- **Rationale**: Coolify consume docker-compose nativamente y gestiona TLS/dominio; arranque autoconfigurable cumple SC-010.
- **Alternatives considered**: Nixpacks/buildpack de Coolify — menos control del runtime; imagen única con Postgres embebido — descartado: backups y upgrades de DB se vuelven frágiles.
