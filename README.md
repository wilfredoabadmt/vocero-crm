# Panel de Mensajería con CRM Multicanal

Panel **single-tenant** y autoalojado para centralizar las conversaciones de WhatsApp de un negocio: bandeja en tiempo real, CRM ligero (etiquetas, notas, embudo Kanban), respuestas automáticas con agentes de IA y gestión de plantillas. Pensado para desplegarse en un VPS propio con **Coolify**. Calidad enterprise, sin funciones de más.

> ⚡ Pensado para que puedas **probarlo de punta a punta sin un número de WhatsApp real** (modo simulación) y, cuando estés listo, conectar un número productivo cambiando una variable de entorno.

## Tabla de contenido

- [Características](#características)
- [Alcance](#alcance-qué-hace-y-qué-no)
- [Stack](#stack)
- [Arranque rápido (desarrollo local)](#arranque-rápido-desarrollo-local)
- [Modo simulación](#modo-simulación-sin-whatsapp-real)
- [Pruebas](#pruebas)
- [Despliegue en Coolify](#despliegue-en-coolify)
- [Conectar un número real](#conectar-un-número-de-whatsapp-real)
- [Gotchas y limitaciones](#gotchas-y-limitaciones)
- [Variables de entorno](#variables-de-entorno)
- [Documentación de diseño](#documentación-de-diseño)

## Características

- **Bandeja en tiempo real**: las conversaciones entrantes aparecen y se actualizan por WebSocket, sin recargar. Respuesta desde el mismo panel con estados de entrega (enviado/entregado/leído/fallido).
- **Conexión de WhatsApp**: onboarding embebido con un tech provider; el backend recibe las credenciales del número y los eventos de mensaje redirigidos (override).
- **Ventana de 24 h de Meta**: el panel calcula y bloquea localmente el texto libre fuera de ventana y ofrece el envío de **plantillas aprobadas**; la ventana se reabre en vivo cuando el cliente responde.
- **Plantillas de WhatsApp**: editor guiado con vista previa fiel al estilo de WhatsApp; envío a aprobación de Meta y seguimiento de estado (pendiente/aprobada/rechazada).
- **CRM**: leads automáticos, etiquetas con color, notas internas, y **Kanban** de 4 etapas (renombrables) con arrastrar y soltar.
- **Agentes de IA**: ilimitados, creados con un wizard en lenguaje natural, con carga de documentos (RAG). Proveedor **OpenRouter** con tu propia API key. Uno actúa por defecto y responde en automático; se pausa cuando interviene un humano.
- **Usuarios y roles**: administrador y asesor, con invalidación de sesiones al desactivar.
- **UX/UI**: diseño sobrio y profesional, en español, con **modo claro y oscuro**.

## Alcance: qué hace y qué no

**Sí cubre:**

- Un solo negocio (**single-tenant**) con varios asesores y varias bandejas/números de WhatsApp.
- Canal **WhatsApp** vía Cloud API v23 (recepción y envío, plantillas, ventana de 24 h).
- IA generativa de respuestas vía **OpenRouter** (cualquier modelo que ofrezcan) con RAG sobre documentos que tú subas.

**Todavía no cubre (fuera de alcance por ahora):**

- **Multicanal real**: Instagram, Facebook Messenger, email o LinkedIn están previstos como fase posterior; hoy solo WhatsApp.
- **Multi-tenant / SaaS para terceros**: es para tu propio negocio, no para revender cuentas aisladas a clientes.
- **El onboarding del número** depende de un *tech provider* externo (ver más abajo). El panel **no** intercambia tokens con Meta por sí mismo; consume las credenciales que ese proveedor le entrega.
- Métricas/reportes avanzados, facturación, o flujos/automatizaciones tipo constructor visual.

## Stack

Monorepo TypeScript (npm workspaces):

- **`server/`** — Fastify 5, Drizzle ORM, PostgreSQL 16, WebSocket. Integra WhatsApp Cloud API v23 y OpenRouter. RAG con full-text search de Postgres.
- **`web/`** — React 18 + Vite, Tailwind CSS (componentes estilo shadcn/Radix), TanStack Query.
- **`e2e/`** — Playwright.

En producción, **un único contenedor** sirve la API, el WebSocket y el frontend compilado; la única dependencia de infraestructura es PostgreSQL.

## Arranque rápido (desarrollo local)

Requisitos: **Node.js 20+** y npm. No necesitas Docker ni un Postgres aparte para desarrollar: el modo local usa **PGlite** (Postgres embebido en disco).

```bash
npm install
cp .env.example .env       # En Windows (PowerShell): copy .env.example .env
npm run db:migrate         # Crea el esquema en PGlite (server/data/dev-db)
npm run dev                # server :3000 + web :5173
```

Abre <http://localhost:5173>. Login inicial: el `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env` (por defecto `admin@panel.local` / `admin1234`). El primer arranque siembra ese usuario admin automáticamente.

## Modo simulación (sin WhatsApp real)

Con `SIMULATION_MODE=true` (valor por defecto en `.env.example`) se habilitan endpoints que inyectan tráfico **idéntico al de Meta**, y los envíos salientes a Meta quedan *mockeados* (un mensaje pasa solo de `enviado`→`entregado`, y las plantillas se "aprueban" a los ~5 s). Es la forma recomendada de probar todo antes de tocar un número productivo.

```bash
# 1) Crear una bandeja simulada ya "conectada"
curl -X POST localhost:3000/api/simulate/provisioning \
  -H "Authorization: Bearer $PROVISIONING_SECRET"

# 2) Inyectar un mensaje entrante (aparece en vivo en el panel)
curl -X POST localhost:3000/api/simulate/incoming-message \
  -H "Authorization: Bearer $PROVISIONING_SECRET" -H "Content-Type: application/json" \
  -d '{"inbox_id":1,"from":"5215512345678","name":"Cliente","type":"text","body":"Hola"}'

# 3) Forzar una conversación FUERA de la ventana de 24 h
#    añade  "timestamp_offset_hours": -25  al cuerpo del paso 2
```

> Los endpoints `/api/simulate/*` requieren el `PROVISIONING_SECRET` (o una sesión de admin) y **solo existen** cuando `SIMULATION_MODE=true`. En producción real, ponlo en `false`.

## Pruebas

```bash
npm test       # Vitest: 40 pruebas (ventana 24h, dedup de webhooks, autoreply, RAG, roles…)
npm run e2e    # Playwright: 22 flujos E2E contra el build real con simulación
```

Los E2E levantan el build de producción con `SIMULATION_MODE` e inyectan payloads simulados, así validan el flujo completo (login, tiempo real, respuesta, ventana 24 h, plantillas, IA) sin depender de Meta.

## Despliegue en Coolify

1. **Nuevo recurso → Docker Compose**, apuntando a este repositorio (el `docker-compose.yml` define `app` + `db`).
2. **Variables de entorno** (genera secretos fuertes, mínimo 32 caracteres):
   - `SESSION_SECRET`, `PROVISIONING_SECRET`, `POSTGRES_PASSWORD`
   - `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN` (para el webhook real de Meta)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `PUBLIC_URL=https://tu-dominio`
   - `SIMULATION_MODE=false` en producción real
3. **Dominio + TLS**: asígnalo al servicio `app` (puerto 3000); Coolify gestiona el certificado.
4. **Volúmenes**: `db-data` y `uploads` ya están declarados en el compose.
5. Deploy. Las migraciones y el seed corren al arrancar; healthcheck en `/api/health`.

> En producción, `SESSION_SECRET` y `PROVISIONING_SECRET` son **obligatorios**: el servidor se niega a arrancar sin ellos (no hay valores por defecto inseguros fuera de desarrollo).

## Conectar un número de WhatsApp real

El panel está diseñado para trabajar con un **tech provider** (proveedor técnico de Meta) que hace el onboarding del número y redirige sus eventos al panel mediante un *override*. El flujo:

1. El admin pulsa **"Conectar WhatsApp"**; el panel crea una bandeja `pending` y redirige a la URL de onboarding del tech provider con `?client=<nombre-de-la-bandeja>`.
2. El usuario completa el registro embebido de su número.
3. El servidor del tech provider intercambia el token temporal por uno permanente y, dentro de una ventana de 1–180 s, hace **dos cosas**:
   - Entrega las credenciales a `POST https://tu-dominio/api/provisioning/whatsapp` con `Authorization: Bearer <PROVISIONING_SECRET>` (cuerpo: `waba_id`, `phone_number_id`, `display_phone_number`, `access_token`, y opcionalmente `client` = nombre de la bandeja).
   - Apunta el `override_callback_uri` de ese número a `https://tu-dominio/api/webhooks/whatsapp` (con el `WEBHOOK_VERIFY_TOKEN` configurado).
4. El admin vuelve al panel y ve la bandeja **Conectada**.

A partir de ahí, los mensajes de ese número llegan al webhook del panel (con verificación de firma `X-Hub-Signature-256` usando `META_APP_SECRET`) y las respuestas salen por la Graph API con el token guardado **cifrado** (AES-256-GCM).

> El intercambio de tokens con Meta y el *override* los hace **el tech provider**, no el panel. El panel solo necesita `PROVISIONING_SECRET` (para recibir credenciales) y `META_APP_SECRET` (para verificar la firma de los webhooks).

## Gotchas y limitaciones

- **Ventana de 24 h de Meta**: fuera de la ventana solo puedes enviar **plantillas aprobadas**. El panel lo aplica localmente y te guía a las plantillas; si intentas texto libre devuelve `422 WINDOW_CLOSED`. La ventana se reabre sola cuando el cliente vuelve a escribir.
- **La IA solo responde dentro de la ventana**: si la conversación está fuera de las 24 h, el agente automático no contesta (no puede mandar texto libre). Si la llamada a OpenRouter falla, la conversación se marca como "necesita humano" en vez de inventar una respuesta.
- **OpenRouter con tu propia API key**: no se incluye ninguna clave. Cárgala en *Ajustes → IA*; se guarda cifrada. Los costos de inferencia corren por tu cuenta de OpenRouter.
- **PGlite es solo para desarrollo/pruebas**. En producción usa PostgreSQL (el `docker-compose.yml` ya lo trae). No copies una base PGlite a producción.
- **Single-tenant**: una instancia = un negocio. Para varios negocios, despliega instancias separadas.
- **Idioma**: la UI está en **español**. No hay i18n todavía.
- **Cambia las credenciales por defecto**: si despliegas con `admin@panel.local` / `admin1234`, cámbialas de inmediato. Define secretos fuertes y nunca subas tu `.env` (ya está en `.gitignore`).
- **El webhook rechaza firmas inválidas**: si `META_APP_SECRET` está vacío en producción, las peticiones al webhook se responden con `401`. Configúralo antes de conectar un número real.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las imprescindibles:

| Variable | Para qué | Notas |
| --- | --- | --- |
| `DATABASE_URL` | Conexión a la base | `pglite://…` en local, `postgres://…` en prod |
| `SESSION_SECRET` | Firma de sesiones y cifrado de secretos | **Obligatorio** en prod, 32+ chars |
| `PROVISIONING_SECRET` | Bearer del endpoint de provisioning | **Obligatorio** en prod |
| `META_APP_SECRET` | Verifica la firma de los webhooks de Meta | Requerido para WhatsApp real |
| `WEBHOOK_VERIFY_TOKEN` | Handshake GET del webhook de Meta | Requerido para WhatsApp real |
| `SIMULATION_MODE` | Activa `/api/simulate/*` y mockea envíos | `true` en local, `false` en prod |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario admin sembrado al arrancar | Cámbialos tras el primer login |
| `PUBLIC_URL` | URL pública de la instancia | p. ej. `https://tu-dominio` |

## Documentación de diseño

La especificación, el plan, los contratos (REST/WS, integración WhatsApp, modo simulación), el modelo de datos y el desglose de tareas están en [`specs/001-messaging-crm-panel/`](specs/001-messaging-crm-panel/). Sirven como referencia de cómo está construido y por qué.

## Licencia

Distribuido bajo licencia **MIT** (ver [`LICENSE`](LICENSE)): puedes usarlo, modificarlo, desplegarlo y redistribuirlo libremente, conservando el aviso de copyright. Se entrega *as is*, sin garantías.
