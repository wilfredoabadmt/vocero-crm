# Tasks: Panel de Mensajería con CRM Multicanal

**Input**: Design documents from `/specs/001-messaging-crm-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: La spec exige verificación E2E (FR-044/FR-045, SC-013) ⇒ se incluyen tareas de prueba: unit/integración (Vitest) en puntos críticos y suite Playwright final.

**Organization**: Agrupadas por user story (US1–US9 de spec.md).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Crear monorepo npm workspaces: `package.json` raíz (workspaces server/web/e2e, scripts dev/build/test/e2e/db:migrate), `.editorconfig`, `tsconfig.base.json`
- [ ] T002 Inicializar `server/`: package.json (fastify, @fastify/websocket, @fastify/cookie, @fastify/multipart, @fastify/static, drizzle-orm, postgres, zod, argon2, pdf-parse, mammoth, tsx, vitest), `server/tsconfig.json`
- [ ] T003 [P] Inicializar `web/`: Vite + React 18 + TS, Tailwind 3.4 con design tokens (CSS vars claro/oscuro), `web/package.json` (tanstack-query, wouter, @dnd-kit, radix primitives, lucide-react), proxy dev a :3000
- [ ] T004 [P] `docker-compose.yml` (servicios db postgres:16-alpine con volumen + app placeholder) y `.env.example` con todas las vars documentadas (DATABASE_URL, SESSION_SECRET, PROVISIONING_SECRET, META_APP_SECRET, WEBHOOK_VERIFY_TOKEN, ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL, SIMULATION_MODE)

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T005 `server/src/config.ts`: carga y validación Zod de env vars; helper de cifrado AES-256-GCM para secretos en reposo (tokens de bandeja, API key OpenRouter)
- [ ] T006 `server/src/db/schema.ts`: TODAS las tablas de data-model.md (users, sessions, inboxes, stages, contacts, tags, contact_tags, conversations, messages, notes, ai_agents, agent_documents, document_chunks con tsvector spanish + GIN, templates, settings, webhook_events) + enums + índices/uniques + `server/src/db/client.ts`
- [ ] T007 Generar migración inicial drizzle-kit en `server/drizzle/` + `server/src/db/seed.ts` idempotente (admin de env, 4 etapas default) + runner de migraciones en arranque
- [ ] T008 `server/src/auth/`: login/logout/me, sesiones opacas con cookie httpOnly, argon2id, guards `requireAuth`/`requireAdmin`, invalidación de sesiones al desactivar usuario
- [ ] T009 [P] `server/src/realtime/hub.ts`: registro de sockets autenticados + `broadcast(event, data)` tipado con los 7 eventos de contracts/api.md; ruta `/ws` con auth por cookie
- [ ] T010 [P] `server/src/index.ts`: bootstrap Fastify (cookie, multipart, websocket, static de `web/dist`, manejador global de errores `{error:{code,message}}`, `/api/health`, logging)
- [ ] T011 `server/src/integrations/whatsapp/`: tipos del webhook de Meta, parser (messages/statuses/template updates → eventos de dominio), verificación firma X-Hub-Signature-256, handshake GET; interfaz `GraphApiClient` con implementación real (fetch v23.0: sendText, sendTemplate, createTemplate, listTemplates, deleteTemplate, fetchMedia) y **mock de simulación** (wamid falso, estados programados, auto-aprobación de plantillas)
- [ ] T012 `server/src/simulation/`: guard SIMULATION_MODE, `POST /api/simulate/webhook`, `/api/simulate/provisioning`, `/api/simulate/incoming-message` (con timestamp_offset_hours), `/api/simulate/status`, `/api/simulate/template-status` + fixtures de contracts/simulation.md en `server/src/simulation/fixtures/`
- [ ] T013 Web shell en `web/src/`: ApiClient (fetch + manejo de error codes), WsClient (reconexión + invalidación TanStack Query), ThemeProvider (claro/oscuro sin flash), layout app (sidebar navegación es-MX), página de login, guard de sesión, primitivas UI base en `web/src/components/ui/` (button, input, dialog, dropdown, badge, toast, tooltip, skeleton)
- [ ] T014 Vitest base: `server/tests/setup.ts` (DB de prueba con migraciones), test de humo de auth en `server/tests/auth.test.ts`

**Checkpoint**: Fundaciones listas — historias pueden comenzar.

## Phase 3: User Story 1 — Recibir y responder en tiempo real (P1) 🎯 MVP

- [ ] T015 [US1] `server/src/modules/messages/ingest.ts`: pipeline de entrada (webhook→dominio): upsert contact (FR-014, etapa 1), upsert conversation (UNIQUE inbox+contact), insert message con dedup por wamid, update last_inbound_at/preview/unread, persistencia de media en `/data/uploads`, registro en webhook_events, descarte seguro de phone_number_id desconocido (FR-013), broadcast `message:new`/`conversation:updated`
- [ ] T016 [US1] `server/src/modules/messages/statuses.ts`: aplicar statuses (sent→delivered→read, failed+reason, solo hacia delante) + broadcast `message:status`
- [ ] T017 [US1] `server/src/modules/conversations/routes.ts`: GET /conversations (cursor, search, filtros, window derivada), GET /:id, GET /:id/messages (cursor hacia atrás), POST /:id/read
- [ ] T018 [US1] `server/src/modules/messages/send.ts`: POST /conversations/:id/messages tipo text — verificación de ventana con FOR UPDATE (422 WINDOW_CLOSED), pausa auto_reply si author humano (FR-027), envío vía GraphApiClient, persistencia + broadcast
- [ ] T019 [US1] Ruta `GET /api/uploads/*` autenticada para servir adjuntos
- [ ] T020 [P] [US1] `web/src/features/inbox/ConversationList.tsx`: lista en vivo (orden, preview, badge no leídos, indicador ventana, búsqueda y filtros)
- [ ] T021 [P] [US1] `web/src/features/inbox/Thread.tsx`: hilo de mensajes (burbujas in/out, autor humano/IA, ticks de estado con motivo de fallo, adjuntos imagen/audio/video/documento, agrupación por día, scroll infinito hacia atrás)
- [ ] T022 [US1] `web/src/features/inbox/Composer.tsx`: textarea con envío Enter, estados (enviando/fallo), integración marcar-leído al abrir
- [ ] T023 [US1] Tests Vitest `server/tests/ingest.test.ts`: dedup wamid, contacto/conversación únicos, número desconocido descartado, unread y preview correctos

**Checkpoint US1**: inyectar `simulate/incoming-message` ⇒ aparece en vivo; responder ⇒ mock entrega y ticks avanzan.

## Phase 4: User Story 2 — Conectar número de WhatsApp (P1)

- [ ] T024 [US2] `server/src/modules/inboxes/routes.ts`: GET (sin tokens), POST (crea pending + onboarding_url `https://aishiagency.tech/embedded-whatsapp-coex?client=onboarded-client`), PATCH nombre, POST disconnect/retry
- [ ] T025 [US2] `server/src/modules/inboxes/provisioning.ts`: POST /api/provisioning/whatsapp con Bearer PROVISIONING_SECRET, upsert por phone_number_id (completa la pending más reciente), cifrado de token, estado→connected, broadcast `inbox:status_changed`; sweep de pendientes >10 min → failed
- [ ] T026 [US2] Webhook real `POST/GET /api/webhooks/whatsapp` conectado al parser+ingest (T011/T015) con verificación de firma y 200 inmediato
- [ ] T027 [US2] `web/src/features/settings/Inboxes.tsx`: listado con estado vivo, flujo conectar (modal → abre onboarding en pestaña nueva → espera evento WS de conexión), reintentar/desconectar
- [ ] T028 [P] [US2] Test Vitest `server/tests/provisioning.test.ts`: upsert idempotente, auth del secret, expiración de pending

**Checkpoint US2**: `simulate/provisioning` deja bandeja conectada visible en vivo en Ajustes.

## Phase 5: User Story 3 — Etiquetas y notas (P2)

- [ ] T029 [US3] `server/src/modules/contacts/routes.ts`: GET/PATCH contacto, PUT /contacts/:id/tags; `server/src/modules/contacts/tags.ts`: CRUD /tags (DELETE/PATCH admin)
- [ ] T030 [P] [US3] `server/src/modules/notes/routes.ts`: GET/POST notas por conversación, DELETE (autor o admin)
- [ ] T031 [US3] `web/src/features/inbox/ContactPanel.tsx`: panel lateral del hilo — datos del lead, selector/creador de etiquetas con color, etapa, notas con autor y fecha
- [ ] T032 [US3] Filtro por etiqueta en ConversationList + chips de etiquetas visibles en la lista

**Checkpoint US3**: etiquetar, anotar y filtrar funciona y se ve desde otra sesión.

## Phase 6: User Story 4 — Kanban del embudo (P2)

- [ ] T033 [US4] `server/src/modules/contacts/kanban.ts`: GET /kanban (4 columnas con leads+tags+conversation_id), PATCH stage en /contacts/:id con broadcast `lead:stage_changed`; PATCH /stages/:id solo nombre (admin)
- [ ] T034 [US4] `web/src/features/kanban/KanbanBoard.tsx`: 4 columnas, tarjetas (nombre, preview, etiquetas, tiempo), drag & drop con @dnd-kit + actualización optimista + sync por WS, click → abre conversación
- [ ] T035 [P] [US4] Edición de nombres de etapas en `web/src/features/settings/Stages.tsx`

**Checkpoint US4**: mover tarjeta persiste y se refleja en otra sesión en <3 s.

## Phase 7: User Story 7 — Plantillas de WhatsApp (P2) *(antes que US6: la ventana cerrada las necesita)*

- [ ] T036 [US7] `server/src/modules/templates/routes.ts`: GET (filtros), POST (validar nombre `[a-z0-9_]`, variables `{{1..n}}` consecutivas, ejemplo para Meta) → createTemplate en Graph → pending; POST /:id/sync (reconciliar por name+language); DELETE; GET /templates/selectable
- [ ] T037 [US7] Manejo webhook `message_template_status_update` → estado + rejection_reason + broadcast `template:status_changed` (ya parseado en T011; conectar a dominio)
- [ ] T038 [US7] `web/src/features/templates/TemplatesPage.tsx`: listado con estados (pendiente/aprobada/rechazada con motivo/deshabilitada) actualizado en vivo + acciones sync/borrar
- [ ] T039 [US7] `web/src/features/templates/TemplateEditor.tsx`: editor guiado — nombre (autoslug), categoría, idioma, cuerpo con inserción de variables, **vista previa en vivo estilo burbuja de WhatsApp**, validaciones inline, contador
- [ ] T040 [P] [US7] Test Vitest `server/tests/templates.test.ts`: validación de variables, ciclo draft→pending→approved/rejected vía simulación

**Checkpoint US7**: crear plantilla ⇒ pending ⇒ auto-aprobada por el mock ⇒ disponible en selector.

## Phase 8: User Story 6 — Ventana de 24 h (P2)

- [ ] T041 [US6] `server/src/modules/conversations/window.ts`: cálculo único de ventana (last_inbound_at del canal, cerrada ante ausencia/ambigüedad) usado por GET conversations/detalle y por send.ts; envío de plantilla `{type:'template', template_id, variables[]}` con validación approved + variables completas (TEMPLATE_VARIABLES_MISSING) y render del body a `messages.body`
- [ ] T042 [US6] `web/src/features/inbox/WindowBanner.tsx` + estados del Composer: ventana abierta (cuenta regresiva discreta cuando quedan <2 h), cerrada (banner explicativo + composer en modo plantilla, texto escrito preservado), reapertura en vivo vía `window:reopened` (FR-042)
- [ ] T043 [US6] `web/src/features/inbox/TemplatePicker.tsx`: selector de plantillas aprobadas con búsqueda, captura de variables con vista previa final, estado vacío que guía a crear plantilla
- [ ] T044 [US6] Test Vitest `server/tests/window.test.ts`: límites de 24 h exactos, timestamp del canal vs servidor, carrera de expiración (FOR UPDATE), reapertura por entrante, 422 WINDOW_CLOSED a texto libre (humano e IA)

**Checkpoint US6**: `timestamp_offset_hours:-25` ⇒ banner + solo plantillas; entrante nuevo reabre en vivo.

## Phase 9: User Story 5 — Agentes de IA (P2)

- [ ] T045 [US5] `server/src/integrations/openrouter/client.ts`: chatCompletion, listModels (caché 1 h), validateKey (GET /key); errores tipados (clave inválida, modelo no disponible, rate limit)
- [ ] T046 [US5] `server/src/modules/settings/routes.ts`: PUT/GET openrouter-key (validación remota, cifrado, solo last4), GET /ai/models
- [ ] T047 [US5] `server/src/modules/agents/routes.ts`: CRUD agentes + invariante un solo default (índice parcial + transacción, 409 DEFAULT_AGENT_REQUIRED, reasignación a NULL al borrar)
- [ ] T048 [US5] `server/src/rag/`: extracción (pdf-parse/mammoth/texto), chunking 1000/200, inserción document_chunks, retrieval `websearch_to_tsquery` spanish + fallback ILIKE; endpoints de documentos (upload multipart ≤10 MB pdf/docx/txt/md, estado processing/ready/failed, delete)
- [ ] T049 [US5] `server/src/modules/agents/autoreply.ts`: pipeline post-ingest — condiciones (auto_reply active, ventana abierta FR-043, ai_global_enabled, key configurada), debounce 6 s por conversación, prompt (system del wizard + historial ≤20 + chunks top-5), completion, persistir como ai_agent + enviar; fallos ⇒ needs_human + sin mensaje al cliente (FR-029) + error visible
- [ ] T050 [US5] `web/src/features/agents/AgentsPage.tsx`: listado (modelo, default, documentos), marcar default, eliminar con guardas
- [ ] T051 [US5] `web/src/features/agents/AgentWizard.tsx`: wizard multi-paso (identidad → comportamiento → conocimiento/documentos con drag&drop y estado de procesamiento → modelo con buscador de OpenRouter → revisión), guardado y edición
- [ ] T052 [US5] Controles IA en el hilo: toggle auto-respuesta por conversación, selector de agente asignado, badge `needs_human` con motivo, indicador "respondió IA" en burbujas
- [ ] T053 [US5] `web/src/features/settings/AiSettings.tsx`: API key (configurada/last4), toggle global IA
- [ ] T054 [P] [US5] Tests Vitest `server/tests/autoreply.test.ts` (condiciones, debounce, fallo→needs_human, ventana cerrada no responde) y `server/tests/rag.test.ts` (chunking y retrieval en español)

**Checkpoint US5**: con key real del `.env`, mensaje entrante simulado recibe respuesta del agente default con contexto del documento.

## Phase 10: User Story 8 — Usuarios del panel (P3)

- [ ] T055 [US8] `server/src/modules/users/routes.ts`: CRUD admin (crear con password, editar rol/nombre/password, is_active:false borra sesiones FR-032; no auto-desactivarse)
- [ ] T056 [US8] `web/src/features/settings/Users.tsx`: tabla de usuarios, alta/edición/desactivación, indicación de rol
- [ ] T057 [P] [US8] Test Vitest `server/tests/users.test.ts`: guards de rol (agent no accede a settings), sesión invalidada al desactivar

## Phase 11: User Story 9 — Modo oscuro y pulido visual (P3)

- [ ] T058 [US9] Persistencia de tema en `users.theme` (PATCH /auth/me) + aplicación pre-render; toggle en menú de usuario
- [ ] T059 [US9] Pasada de consistencia visual claro/oscuro en todas las vistas (tokens, contrastes AA, estados vacíos ilustrados, microinteracciones, favicon/título)

## Phase 12: Polish & Verificación final

- [ ] T060 `Dockerfile` multi-stage + servicio `app` definitivo en docker-compose (healthcheck /api/health, volúmenes uploads/db-data) + arranque con migraciones/seed
- [ ] T061 [P] `README.md` raíz: descripción, features, screenshots, enlace a quickstart de despliegue Coolify
- [ ] T062 Suite Playwright `e2e/tests/`: (1) login+tema, (2) bandeja simulada conectada, (3) mensaje entrante en vivo + respuesta, (4) adjuntos, (5) etiquetas+notas+filtro, (6) kanban drag entre etapas, (7) plantilla crear→aprobar→enviar, (8) ventana cerrada: bloqueo + plantilla + reapertura, (9) agente IA wizard + auto-respuesta (mock OpenRouter), (10) usuarios y roles — `e2e/playwright.config.ts` levanta build real con SIMULATION_MODE=true
- [ ] T063 Ejecutar y estabilizar: `npm test` + `npm run e2e` en verde; corregir lo que falle
- [ ] T064 Verificación autónoma con Playwright MCP sobre navegador real: recorrido completo de SC-013 con payloads simulados, capturas de cada flujo, registro de hallazgos y correcciones
- [ ] T065 Revisión final de seguridad básica: secretos nunca en respuestas API, firma de webhook obligatoria fuera de simulación, rate limit en login, headers de seguridad

## Dependencies & Execution Order

- **Fase 1 → Fase 2 → historias**. US1 requiere T011/T012/T015 (ingest+simulación).
- US2 puede ir en paralelo con US1 tras T011 (comparten parser).
- US3, US4 dependen solo de US1 (conversaciones existentes). Paralelizables entre sí.
- **US7 antes que US6** (el picker necesita plantillas aprobadas); US6 antes que US5 (la IA respeta la ventana, FR-043).
- US8, US9 independientes al final. Fase 12 cierra todo.

## Implementation Strategy

**MVP = Fases 1–4 (US1+US2)**: bandeja en tiempo real con conexión simulada — demo de valor inmediato. Luego incrementos por historia en el orden de fases (7 antes que 8). Cada checkpoint se verifica con el modo simulación antes de avanzar. La entrega final exige Fase 12 completa (FR-045): Vitest verde, Playwright verde y recorrido MCP documentado.
