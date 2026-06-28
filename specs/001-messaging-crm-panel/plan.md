# Implementation Plan: Panel de Mensajería con CRM Multicanal

**Branch**: `001-messaging-crm-panel` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-messaging-crm-panel/spec.md`

## Summary

Panel single-tenant autoalojado (Coolify/VPS) que centraliza conversaciones de WhatsApp en tiempo real con CRM ligero (etiquetas, notas, Kanban de 4 etapas), respuesta dentro y fuera de la ventana de 24 h de Meta (plantillas), agentes de IA vía OpenRouter con base de conocimiento documental, y gestión de usuarios con roles. Enfoque técnico: **monolito full-stack TypeScript** — un único servicio Node.js (Fastify) que expone la API REST, el WebSocket de tiempo real, los webhooks de WhatsApp y sirve el frontend React compilado; PostgreSQL como única dependencia de infraestructura; Docker Compose compatible con Coolify. Incluye **modo de simulación** que inyecta payloads de WhatsApp estructuralmente idénticos a los reales por el mismo pipeline del webhook, y verificación E2E con Playwright.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 22 LTS (un solo lenguaje en todo el stack)

**Primary Dependencies**:
- Backend: Fastify 5 (HTTP + webhooks), `ws` vía `@fastify/websocket` (tiempo real), Drizzle ORM + `postgres` driver, Zod (validación), `argon2` (hash de contraseñas)
- Frontend: React 18 + Vite 6, Tailwind CSS 3.4, componentes estilo shadcn/ui (Radix primitives), TanStack Query 5, wouter (routing ligero)
- IA: OpenRouter REST (API compatible OpenAI) vía `fetch` nativo — sin SDK pesado
- Documentos: `pdf-parse` (PDF), `mammoth` (DOCX), texto plano/Markdown nativo

**Storage**: PostgreSQL 16 (datos + full-text search en español para RAG ligero); adjuntos y documentos en volumen local (`/data/uploads`)

**Testing**: Vitest (unit + integración con DB), Playwright (E2E contra la UI real con payloads simulados); verificación interactiva adicional con Playwright MCP

**Target Platform**: Contenedor Linux (Docker Compose en Coolify); desarrollo local en Windows 11

**Project Type**: Aplicación web (monolito: API + frontend servidos por el mismo proceso)

**Performance Goals**: mensaje entrante visible <3 s; respuesta IA <15 s; 10 usuarios concurrentes; 5,000 conversaciones sin degradación (SC-001..SC-008)

**Constraints**: single-tenant; autocontenido (solo Postgres como servicio adicional); integraciones externas limitadas a Meta Graph API y OpenRouter; la ventana de 24 h se calcula y bloquea localmente antes de tocar el canal; secretos nunca expuestos en la UI

**Scale/Scope**: 1 negocio por instancia, ~10 asesores, miles de conversaciones, bandejas WhatsApp múltiples, agentes IA ilimitados, ~12 pantallas (login, inbox, kanban, plantillas, agentes+wizard, usuarios, etiquetas, bandejas, ajustes generales)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` es la plantilla sin ratificar (sin principios definidos). **No hay gates constitucionales aplicables.** Se adoptan como guía supletoria: simplicidad (YAGNI — "Chatwoot ligero"), testabilidad (E2E obligatorio por FR-045) y un solo servicio desplegable. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-messaging-crm-panel/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas y de integración
├── data-model.md        # Fase 1: modelo de datos
├── quickstart.md        # Fase 1: desarrollo local + despliegue en Coolify
├── contracts/
│   ├── api.md           # Contrato REST + WebSocket del panel
│   ├── whatsapp.md      # Contrato webhook Meta, provisioning del tech provider y envíos
│   └── simulation.md    # Contrato del modo de simulación de payloads
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json             # npm workspaces: server + web; scripts raíz (dev, build, test, e2e)
docker-compose.yml       # app + postgres (compatible Coolify)
Dockerfile               # multi-stage: build web → build server → runtime
.env.example

server/
├── src/
│   ├── index.ts             # bootstrap Fastify (API + WS + estáticos del web build)
│   ├── config.ts            # env vars validadas con Zod
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema (todas las tablas)
│   │   ├── client.ts
│   │   └── seed.ts          # admin inicial + etapas por defecto
│   ├── auth/                # sesiones (cookie httpOnly), roles, guards
│   ├── realtime/            # hub WebSocket: broadcast de eventos del dominio
│   ├── modules/
│   │   ├── inboxes/         # provisioning del tech provider, estado de bandejas
│   │   ├── conversations/   # listado, detalle, lectura, ventana 24h, asignación de agente
│   │   ├── messages/        # entrantes (webhook), salientes (texto/plantilla), estados
│   │   ├── contacts/        # leads, etiquetas, etapas, kanban
│   │   ├── notes/
│   │   ├── templates/       # CRUD plantillas + sync estado con Meta
│   │   ├── agents/          # agentes IA, wizard, documentos, pipeline de respuesta
│   │   ├── users/
│   │   └── settings/        # API key OpenRouter, etapas, generales
│   ├── integrations/
│   │   ├── whatsapp/        # cliente Graph API + parser de webhooks + verificación firma
│   │   └── openrouter/      # chat completions + listado de modelos
│   ├── rag/                 # extracción de texto, chunking, retrieval FTS
│   └── simulation/          # endpoint /api/simulate (solo SIMULATION_MODE) + fixtures
├── drizzle/                 # migraciones generadas
└── tests/                   # Vitest: unit + integración (ventana 24h, webhook parser, pipeline IA)

web/
├── src/
│   ├── main.tsx, App.tsx, router
│   ├── lib/                 # api client, ws client, theme (modo oscuro), i18n es
│   ├── components/ui/       # primitivas estilo shadcn (button, dialog, ...)
│   ├── features/
│   │   ├── auth/            # login
│   │   ├── inbox/           # lista conversaciones + hilo + compositor (ventana 24h, selector plantillas)
│   │   ├── kanban/
│   │   ├── templates/       # listado + editor con vista previa WhatsApp
│   │   ├── agents/          # listado + wizard
│   │   └── settings/        # bandejas, usuarios, etiquetas, etapas, API key, apariencia
│   └── styles/
└── index.html

e2e/                         # Playwright: flujos críticos con payloads simulados
├── playwright.config.ts
└── tests/
```

**Structure Decision**: Monorepo npm workspaces con dos paquetes (`server`, `web`) y carpeta `e2e`. En producción un único contenedor: el server Fastify sirve la API, el WebSocket y los estáticos del build de `web`. Esto cumple FR-036 (autocontenido en Coolify) con la mínima superficie operativa: app + Postgres.

## Complexity Tracking

Sin violaciones constitucionales que justificar. Decisiones de simplicidad deliberadas (sin Redis, sin cola externa, sin proveedor de embeddings) documentadas en research.md.
