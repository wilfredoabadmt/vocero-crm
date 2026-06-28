# Contrato: Modo de Simulación (FR-044)

Activo solo con `SIMULATION_MODE=true` (env). En producción real queda apagado y los endpoints devuelven 404.

## Efectos del modo

1. **Inyección de webhooks**: `POST /api/simulate/webhook` acepta el payload con la estructura exacta del webhook de Meta (ver `whatsapp.md`) y lo procesa por el **mismo pipeline** que `/api/webhooks/whatsapp` (sin verificación de firma). Respuesta: `{ ok: true, processed: <n> }`.
2. **Mock de Graph API saliente**: el cliente de envíos no llama a Meta; persiste el envío, devuelve `wamid.SIM-<uuid>` y programa webhooks sintéticos de estado: `sent` (+0.5 s) → `delivered` (+2 s). Las plantillas creadas pasan a `APPROVED` automáticamente a los ~5 s (o `REJECTED` si el nombre contiene `_reject`, para probar ese flujo). La media entrante simulada usa archivos de fixture locales en lugar de descargar de Meta.
3. **Bandeja simulada**: `POST /api/simulate/provisioning` ejecuta el provisioning interno con datos falsos (`phone_number_id: "SIM-PNID-1"`, token dummy) para tener una bandeja `connected` sin onboarding real.

## Helpers de alto nivel (azúcar para E2E y demo)

`POST /api/simulate/incoming-message`
```json
{
  "inbox_id": 1,
  "from": "5215512345678",
  "name": "Cliente Demo",
  "type": "text",                  // text|image|audio|document
  "body": "Hola, ¿tienen disponibilidad?",
  "timestamp_offset_hours": 0       // negativo simula mensajes viejos; -25 fuerza ventana cerrada
}
```
El servidor construye internamente el payload Meta completo (entry/changes/value) y lo inyecta. `timestamp_offset_hours: -25` es la palanca oficial para probar la ventana de 24 h (US6).

`POST /api/simulate/status` — `{ wamid, status: "delivered"|"read"|"failed", error_code?: 131047 }`

`POST /api/simulate/template-status` — `{ template_id, event: "APPROVED"|"REJECTED"|"DISABLED", reason? }`

## Fixtures versionados (`server/src/simulation/fixtures/`)

| Fixture | Cubre |
|---|---|
| `text-message.json` | mensaje básico, creación de lead (FR-014) |
| `image-message.json`, `audio-message.json`, `document-message.json` | FR-005 |
| `stale-message.json` | timestamp -25 h ⇒ ventana cerrada (US6) |
| `status-delivered.json`, `status-read.json`, `status-failed-131047.json` | ticks y error fuera de ventana |
| `template-approved.json`, `template-rejected.json` | ciclo de plantillas (US7) |
| `unknown-number.json` | descarte seguro (FR-013) |
| `duplicate-wamid.json` | deduplicación (reintentos de Meta) |

## Uso en pruebas

- **Vitest (integración)**: llaman a los helpers directamente contra el server con DB de prueba.
- **Playwright (`e2e/`)**: levantan el stack con `SIMULATION_MODE=true`, crean bandeja simulada y conducen los flujos de SC-013 desde la UI real, inyectando tráfico con estos endpoints.
- **Playwright MCP (verificación manual autónoma)**: mismo mecanismo sobre el navegador del usuario.
