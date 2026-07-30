# Agente de IA — port de Vocero a SaaS TOI (cobranza ISP)

Port completo de la sección **Agente** de Vocero CRM, adaptado al dominio de un
ISP: cobranza, soporte técnico de primer nivel y captura de comprobantes.

Stack destino confirmado: **Next.js (App Router) + Drizzle + PostgreSQL**, el
mismo que Vocero. Por eso el port es casi 1:1 y toda la adaptación está
concentrada en cuatro queries.

**Estado de verificación:** 48 tests unitarios en verde y typecheck limpio
(`strict` + `noUncheckedIndexedAccess`) sobre los archivos puros. Los archivos
que tocan BD son plantillas: dependen de tu schema y se verifican en tu repo.

---

## 1. Qué hace este agente

En cada mensaje entrante de un abonado, el agente:

1. Carga el **estado de cuenta verificado** (saldo, plan, estado del servicio,
   fecha de corte, último pago, promesa vigente, tickets abiertos).
2. Se lo inyecta al modelo junto con el conocimiento del negocio.
3. Recibe **una acción tipada** y la valida contra allowlists del servidor.
4. Ejecuta el efecto secundario y responde por WhatsApp.

Acciones disponibles: `none` · `reply` · `nota_abonado` ·
`registrar_promesa_pago` · `crear_ticket` · `registrar_comprobante` · `handoff`.

### Lo que el agente NO puede hacer (por diseño, no por olvido)

| No puede | Por qué |
|---|---|
| Reconectar o cortar el servicio en MikroTik | Acción de infraestructura, irreversible desde el chat |
| Aprobar un pago | Un comprobante queda `en_revision`; la aprobación es humana |
| Condonar deuda o dar descuentos | Decisión de dinero |
| Procesar bajas o negociar retención | Escala de inmediato |
| Inventar un saldo o una fecha | Las cifras sólo vienen del bloque ESTADO DE CUENTA |

Estas prohibiciones tienen **doble candado**: el prompt las declara y el
esquema de acciones las hace inexpresables. Si el modelo "decide" reconectar,
el JSON no valida y la acción se degrada.

---

## 2. Mapa de archivos

```
src/lib/ai/index.ts                  Adaptador LLM (fetch + Zod + reintentos). Autocontenido.
src/lib/db/tenant.ts                 scoped() — si ya lo tienes, borra este.
src/lib/db/schema.agent.ts           Tablas nuevas (pegar en tu schema.ts).
drizzle/0001_agente_isp.sql          Migración idempotente.

src/server/ai/account-context.ts     Tipos + render del estado de cuenta. PURO.
src/server/ai/account.ts             ⚠️ Las 4 queries a adaptar. ÚNICA frontera con tu dominio.
src/server/ai/actions.ts             Acciones tipadas + validación + degradación. PURO.
src/server/ai/prompts.ts             EL PROMPT del agente. PURO.
src/server/ai/handoff.ts             Regex de escalado de respaldo. PURO.
src/server/ai/executors.ts           Efectos secundarios (promesa, ticket, comprobante, nota).
src/server/ai/pipeline.ts            El turno: coalesce, lock, guardas, ejecución.
src/server/ai/trigger.ts             Punto de enganche desde tu ingesta.

src/app/api/agent/profile/route.ts   GET/PUT del perfil.
src/app/api/kb/route.ts              GET/POST del conocimiento.
src/app/api/kb/[id]/route.ts         PATCH/DELETE.
src/app/api/kb/size/route.ts         Contador de tamaño (= costo por mensaje).
src/app/(app)/agent/page.tsx         Página.
src/components/agent/agent-client.tsx  UI (React + Tailwind, sin librería de componentes).

tests/unit/agent-isp.test.ts         48 tests de las partes puras.
tests/e2e/agente-isp.md              28 escenarios de comportamiento.
```

---

## 3. Instalación (orden importa)

### Paso 1 — Variables de entorno

```bash
OPENROUTER_API_TOKEN=sk-or-...             # sin esto el agente queda deshabilitado, no roto
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_BASE_URL=https://openrouter.ai/api   # opcional
OPENROUTER_TEMPERATURE=0.2                      # opcional; cobranza quiere respuestas estables
AGENT_COALESCE_MS=6000                          # debounce de ráfagas de mensajes
BILLING_CURRENCY=MXN                            # opcional
```

En Coolify van como variables de **runtime**, no de build.

### Paso 2 — Base de datos

1. Pega el contenido de `src/lib/db/schema.agent.ts` en tu `src/lib/db/schema.ts`
   y ajusta las referencias a `organization`, `conversation`, `subscriber`, `message`.
2. Ajusta los nombres de tabla en `drizzle/0001_agente_isp.sql`.
3. Aplícala (`pnpm db:migrate` o al arrancar el contenedor).

Añade estos prefijos a tu generador de IDs:

```ts
agentProfile: "agp",
kbEntry: "kb",
paymentPromise: "prm",
paymentReceipt: "rcp",
ticket: "tkt",
```

### Paso 3 — Copia los archivos

Copia `src/` tal cual respetando rutas. Si ya tienes `src/lib/db/tenant.ts` o un
helper `withAuth`, quédate con los tuyos.

`withAuth` debe cumplir este contrato:

```ts
withAuth(handler: (session: { organizationId: string }, req, ctx) => Promise<Response>)
```

### Paso 4 — Adapta las 4 queries

Abre `src/server/ai/account.ts` y busca `⚠️ ADAPTAR`. Son cuatro bloques:

| # | Query | Devuelve |
|---|---|---|
| 1 | Abonado por teléfono (+ join a plan) | id, nombre, código, estado, plan |
| 2 | Facturas vencidas | suma del saldo y vencimiento más antiguo |
| 3 | Último pago | monto y fecha |
| 4 | Tickets abiertos | hasta 5, para no duplicar |

Ajusta también `normalizeServiceStatus()` en `account-context.ts` con los
estados reales de tu tabla de abonados.

### Paso 5 — Adapta los ejecutores

En `src/server/ai/executors.ts`, `execCrearTicket` escribe en tu tabla de
tickets y `execNotaAbonado` en la columna de notas del abonado.

### Paso 6 — Conecta el disparador

Al final de tu ingesta de mensajes entrantes, después de commitear el mensaje:

```ts
import { maybeRunAgentTurn } from "@/server/ai/trigger";
// …
await maybeRunAgentTurn(conversation.id);
```

En `pipeline.ts` ajusta los tres imports marcados `⚠️ ADAPTAR`: tu emisor de
WhatsApp (`sendText`, `SendError`), tu ventana de 24h (`isWindowOpen`) y tu bus
SSE (`publish` — si no tienes SSE, borra esas dos llamadas).

### Paso 7 — Ruta y menú

Añade `/agent` a tu navegación, protegida por el rol de administrador.

### Paso 8 — Verifica

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

y después corre `tests/e2e/agente-isp.md` completo. El gate técnico no sustituye
al guion de comportamiento.

---

## 4. Decisiones de diseño que conviene no revertir

**El estado de cuenta se inyecta, no se consulta.** Podrías darle al modelo una
acción `consultar_saldo`. No lo hagas: serían dos llamadas por turno y, peor,
una ventana donde el modelo puede inventar la cifra mientras "espera". Al
inyectarlo, las cifras del prompt son la única fuente numérica posible.

**Una acción por turno.** Evita cadenas de razonamiento largas y hace que cada
turno sea auditable: un mensaje entrante, una acción, un efecto.

**Coalesce de 6 segundos con lock por conversación.** Una ráfaga de tres
mensajes produce una respuesta, no tres. Lo que llega durante un turno re-encola
exactamente uno más. Sin colas externas: es un `setTimeout` y un `Map` en
memoria, suficiente para un monolito de una instancia.

**El regex de escalado corre ANTES del LLM.** Ahorra una llamada y garantiza el
escalado aunque el modelo falle. Está calibrado para precisión: "somos 4
personas" y "se me bajó el internet" no disparan (hay tests que lo fijan).

**Todo fallo del proveedor termina en handoff, nunca en silencio.** Tres
reintentos con backoff; si aún así falla, la conversación pasa a una persona con
`handoff_reason='error'`.

**El KB se inyecta completo.** Por eso `/api/kb/size` existe: el tamaño del
conocimiento es costo directo por mensaje. Cuando pase de ~24.000 caracteres,
toca depurar o pasar a búsqueda por relevancia.

---

## 5. Diferencias con el original de Vocero

| Vocero (CRM genérico) | Este port (ISP) |
|---|---|
| `update_lead`, `move_stage` (pipeline de ventas) | `registrar_promesa_pago`, `crear_ticket`, `registrar_comprobante`, `nota_abonado` |
| Sin contexto de dominio en el prompt | Estado de cuenta verificado inyectado en cada turno |
| Handoff: `cliente`/`modelo`/`error`/`ventana` | + `retencion` y `legal` |
| Capacidades fijas | 3 toggles por organización + límite de días de promesa |
| Sólo texto | Detecta imágenes entrantes para capturar comprobantes |
| `lib/ai` acoplado a `lib/env` | Autocontenido (`process.env` con cache) |

Lo que **no** cambió porque ya estaba bien: la estructura del turno, el coalesce,
la extracción robusta de JSON, los reintentos, el scope multi-tenant y el
guardrail de conversaciones de prueba.

---

## 6. Siguiente paso opcional: el Laboratorio

Vocero tiene un módulo de auto-evaluación (`src/server/lab/`) que corre 6
personas guionadas contra el agente real y las califica con un LLM juez,
devolviendo un score 0-100 y hallazgos accionables. Para un ISP las personas
naturales serían: *moroso que promete*, *ya pagó y reclama*, *sin servicio*,
*preguntón de precios*, *quiere darse de baja*, *fuera del conocimiento*.

No está incluido en este port porque es un módulo aparte, pero es lo que
convierte "el bot responde" en "el bot responde bien" de forma medible. Pídemelo
cuando el agente esté funcionando en tu SaaS.
