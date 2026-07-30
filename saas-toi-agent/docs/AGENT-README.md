# 🤖 Guía de Integración: Agente de IA — SaaS TOI (ISP)

Esta guía explica cómo integrar el sistema de Agente de IA en tu plataforma SaaS TOI ISP.

---

## 📦 Archivos Generados

| Archivo | Propósito |
|---|---|
| `src/lib/ai/index.ts` | Adaptador del proveedor LLM (OpenRouter-compatible) |
| `src/server/ai/actions.ts` | Schema Zod de acciones del agente |
| `src/server/ai/handoff.ts` | Detección de intención de escalado a humano |
| `src/server/ai/prompts.ts` | System prompt + juez del agente ISP |
| `src/server/ai/pipeline.ts` | Pipeline completo (coalesce → lock → execute → persist) |
| `src/server/ai/trigger.ts` | Entry point: `maybeRunAgentTurn()` |
| `src/server/inbox/window.ts` | Ventana de 24h de WhatsApp |
| `src/server/events/bus.ts` | Bus SSE in-process |
| `src/app/api/agent/profile/route.ts` | API: perfil del agente |
| `src/app/api/kb/route.ts` | API: crear/listar entradas KB |
| `src/app/api/kb/[id]/route.ts` | API: editar/eliminar entrada KB |
| `src/app/api/kb/size/route.ts` | API: tamaño de la KB |
| `src/components/agent/agent-client.tsx` | UI completa del agente |
| `src/app/(app)/agent/page.tsx` | Página Next.js /agent |
| `migrations/001_agent_tables.sql` | SQL de tablas necesarias |
| `docs/KB-SEED.ts` | Datos semilla ISP para la KB |

---

## 🔧 Pasos de Integración

### 1. Copia los archivos

```bash
# Desde la carpeta saas-toi-agent/ copia todo a tu proyecto
cp -r src/ /ruta/a/tu-proyecto/src/
cp migrations/001_agent_tables.sql /ruta/a/tu-proyecto/
cp docs/KB-SEED.ts /ruta/a/tu-proyecto/
```

### 2. Ejecuta la migración SQL

```bash
# Conecta a tu BD y ejecuta
psql -U user -d saas_toi -f migrations/001_agent_tables.sql
```

Si tu tabla `conversation` o `message` ya existe, usa los `ALTER TABLE`
del archivo SQL (sección "OPCIÓN B") en lugar de las `CREATE TABLE`.

### 3. Configura las variables de entorno

```bash
cp .env.example .env
# Edita .env con tus valores reales
```

### 4. Instala dependencias necesarias

```bash
# El agente usa solo Zod y nanoid que probablemente ya tienes
# Si no los tienes:
pnpm add zod nanoid
```

### 5. Reemplaza el placeholder de WhatsApp

En `src/server/ai/pipeline.ts`, busca la función `sendTextWhatsApp()` y
reemplaza el placeholder con tu código real de envío:

```typescript
import { sendWhatsAppMessage } from "@/lib/meta/client";
// o donde tengas tu cliente de Meta

async function sendTextWhatsApp(
  orgId: string,
  to: string,
  text: string
): Promise<void> {
  await sendWhatsAppMessage(orgId, to, text);
}
```

### 6. Agrega la ruta al sidebar de tu app

En tu componente de sidebar/navegación, agrega el enlace al agente:

```tsx
// En tu componente de sidebar o navegación
<Link href="/agent">
  <SidebarItem icon="🤖" label="Agente IA" />
</Link>
```

### 7. Wire: conectar el webhook al agente

En tu webhook handler (el endpoint que recibe mensajes de WhatsApp de Meta),
llama a `maybeRunAgentTurn()` después de ingerir el mensaje:

```typescript
import { maybeRunAgentTurn } from "@/server/ai/trigger";

// Dentro de tu webhook handler, después de guardar el mensaje:
maybeRunAgentTurn({
  conversationId: conversation.id,
  organizationId: org.id,
}).catch((err) => {
  console.error("[AGENT] trigger error:", err);
});
```

### 8. Seed de conocimiento (opcional)

Para poblar la KB con datos ISP de ejemplo:

```bash
npx tsx docs/KB-SEED.ts
```

O ejecuta los inserts manualmente en tu BD.

---

## 🧠 Cómo Funciona

```
Mensaje de WhatsApp (webhook)
    ↓
 1. Webhook guarda el mensaje en la BD
    ↓
 2. Llama a maybeRunAgentTurn()
    ↓
 3. Coalesce: espera 6s para agrupar mensajes
    ↓
 4. Bloqueo: solo 1 agente por conversación
    ↓
 5. Verifica ventana de 24h (WhatsApp policy)
    ↓
 6. Verifica si es conversación de prueba (sandbox)
    ↓
 7. Regex de respaldo: detecta "hablar con persona"
    ↓
 8. Carga KB + etapas del pipeline
    ↓
 9. Llama al LLM con system prompt + contexto
    ↓
 10. Extrae JSON con action (reply/update_lead/move_stage/handoff)
    ↓
 11. Ejecuta la acción:
     - reply → envía WhatsApp + guarda mensaje
     - update_lead → actualiza datos del contacto
     - move_stage → mueve lead en el pipeline
     - handoff → desactiva IA para esta conversación
     - none → no hace nada
```

---

## 📊 Tablas de BD Creadas

| Tabla | Descripción |
|---|---|
| `agent_profile` | Perfil del agente (1 por organización) |
| `kb_entry` | Entradas de conocimiento (Q&A + bloques) |
| `conversation` (extendida) | Campos: `is_test`, `ai_enabled`, `handoff_at`, `handoff_reason`, `last_inbound_at` |
| `message` (extendida) | Campo: `ai_generated` |
| `pipeline_stage` | Etapas del pipeline (si no existen) |
| `lead` | Leads del pipeline (si no existen) |

---

## 🔒 Seguridad

- El agente solo procesa conversaciones con `ai_enabled = true`
- Conversaciones de prueba (`is_test`) JAMÁS tocan la API real de WhatsApp
- La KB y el perfil están scoped por `organization_id` (multi-tenancy)
- El handoff puede activarse desde la conversación (el usuario dice "hablar con persona")
- El handoff puede activarse desde la IA (si detecta caso complejo)
- El handoff puede activarse por error del LLM (fallback)
- El handoff puede activarse por ventana expirada

---

## 🎯 Acciones del Agente

| Acción | Descripción |
|---|---|
| `none` | El agente decide no responder (ej. mensaje muy corto) |
| `reply` | Envía una respuesta de texto por WhatsApp |
| `update_lead` | Actualiza nombre, email o teléfono del contacto |
| `move_stage` | Mueve el lead a una etapa del pipeline |
| `handoff` | Desactiva IA y transfiere a humano |

---

## 📝 Personalización

### Modificar el prompt del agente

Edita `src/server/ai/prompts.ts` → `buildAgentSystemPrompt()`.

### Agregar nuevas acciones

Edita `src/server/ai/actions.ts` → schema Zod `AgentAction` y agrega
el handler en `src/server/ai/pipeline.ts` → `runAgentTurn()`.

### Cambiar el modelo LLM

Modifica `OPENROUTER_MODEL` en `.env`.

### Cambiar la URL del proveedor

Modifica `OPENROUTER_BASE_URL` en `.env` (compatible con OpenAI API).

---

## 🐛 Debug

Logs del agente en la consola del servidor:

```bash
# Ver logs del agente
grep "\[AGENT\]" logs/app.log

# O en tiempo real
docker logs -f saas-toi-app | grep AGENT
```

---

## ❓ FAQ

**¿El agente responde a todos los mensajes?**
No. Verifica `ai_enabled` en la conversación, la ventana de 24h, y si
hay handoff activo. También respeta el debounce de 6s.

**¿Qué pasa si el LLM falla?**
El agente degrada gracefully: si la etapa del pipeline no existe, usa
`reply` como fallback. Si el JSON es inválido, intenta extraer del texto
crudo. Si todo falla, loguea el error y no responde (no tumba el turno).

**¿Puedo usar otro proveedor LLM?**
Sí, siempre que sea compatible con la API de OpenAI (OpenRouter,
Together AI, Groq, etc.).

**¿Cuántas entradas puedo poner en la KB?**
La IA tiene un límite de contexto (~24,000 caracteres). El indicador
en la UI te avisa cuando te acercas.
