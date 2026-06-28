# Contrato: Integración WhatsApp (Meta Cloud API + Tech Provider)

Graph API version: `v23.0`. Todas las llamadas salientes usan el `access_token` de la bandeja.

## 1. Webhook de Meta → panel

`GET /api/webhooks/whatsapp` — handshake de verificación:
- Query `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`
- Si `hub.verify_token === WEBHOOK_VERIFY_TOKEN` → 200 con `hub.challenge` en texto plano; si no → 403.

`POST /api/webhooks/whatsapp` — eventos:
- **Seguridad**: header `X-Hub-Signature-256: sha256=<hmac>` validado contra el body crudo con `META_APP_SECRET`. Firma inválida → 401 (y registro en `webhook_events` con `status=error`).
- **Respuesta**: 200 `{}` inmediato tras encolar en memoria; el procesamiento no bloquea la respuesta (Meta reintenta ante non-2xx — la deduplicación por `wamid` hace los reintentos inocuos).

Estructura del payload (la que el simulador replica exactamente):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "15550001111", "phone_number_id": "<PHONE_NUMBER_ID>" },
        "contacts": [{ "profile": { "name": "Nombre Cliente" }, "wa_id": "5215512345678" }],
        "messages": [{
          "from": "5215512345678",
          "id": "wamid.XXXX",
          "timestamp": "1718000000",
          "type": "text",
          "text": { "body": "Hola" }
        }]
      }
    }]
  }]
}
```

Variantes soportadas de `messages[].type`:
- `text` → `text.body`
- `image|video|document|audio|sticker` → `{type}.id` (media_id), `{type}.mime_type`, `image.caption?`, `document.filename?`
- otros tipos → mensaje `unsupported` con aviso en el hilo

Estados (mismo `field: "messages"`, clave `statuses` en lugar de `messages`):

```json
"statuses": [{ "id": "wamid.XXXX", "status": "delivered", "timestamp": "1718000050",
               "recipient_id": "5215512345678",
               "errors": [{ "code": 131047, "title": "Re-engagement message", "message": "..." }] }]
```
- `status ∈ sent|delivered|read|failed`; en `failed`, `errors[]` se mapea a `failure_reason`.
- Error 131047 (fuera de ventana 24 h) recibe mensaje legible específico.

Plantillas (`field: "message_template_status_update"`):

```json
{ "event": "APPROVED|REJECTED|DISABLED", "message_template_id": 1234,
  "message_template_name": "seguimiento_lead", "message_template_language": "es",
  "reason": "INCORRECT_CATEGORY" }
```

**Enrutamiento**: el `metadata.phone_number_id` determina la bandeja. Desconocido ⇒ `webhook_events.discarded` (FR-013). El `timestamp` (epoch segundos, string) se usa para `last_inbound_at`.

## 2. Provisioning del tech provider → panel

Tras el onboarding en `https://aishiagency.tech/embedded-whatsapp-coex?client=onboarded-client`, el servidor del tech provider (que ya intercambió el token temporal por permanente) llama dentro de 1–180 s:

`POST /api/provisioning/whatsapp`
- Header: `Authorization: Bearer <PROVISIONING_SECRET>` (401 si falta/incorrecto)
- Body:
```json
{
  "waba_id": "1234567890",
  "phone_number_id": "109876543210",
  "display_phone_number": "+52 1 55 1234 5678",
  "access_token": "EAAG...permanente",
  "business_name": "Mi Negocio"            // opcional
}
```
- Comportamiento: upsert por `phone_number_id`. Si existe una bandeja `pending` (la más reciente sin credenciales) se completa esa; si no, se crea. Token se cifra en reposo. Estado → `connected`, evento WS `inbox:status_changed`.
- Respuesta: `200 { "ok": true, "inbox_id": 3 }`. Reintentos del provider ⇒ idempotente.
- El tech provider configura el `override_callback_uri` hacia `https://<PUBLIC_URL>/api/webhooks/whatsapp` (responsabilidad externa al panel).

Expiración: si una bandeja sigue `pending` 10 min después de creada, un sweep la marca `failed` con `last_error = "No se recibieron credenciales del onboarding"` (la UI ofrece reintentar).

## 3. Envíos panel → Meta

`POST https://graph.facebook.com/v23.0/{phone_number_id}/messages`

Texto libre (solo con ventana abierta):
```json
{ "messaging_product": "whatsapp", "recipient_type": "individual",
  "to": "5215512345678", "type": "text", "text": { "preview_url": true, "body": "..." } }
```

Plantilla:
```json
{ "messaging_product": "whatsapp", "to": "5215512345678", "type": "template",
  "template": { "name": "seguimiento_lead", "language": { "code": "es" },
    "components": [{ "type": "body",
      "parameters": [{ "type": "text", "text": "Kevin" }] }] } }
```

Respuesta OK: `{ "messages": [{ "id": "wamid.XXX" }] }` → se guarda como `wamid` del mensaje y `status=sent` provisional (estados reales llegan por webhook). Error → `status=failed` + `failure_reason` mapeado del `error.message`/`code` de Meta.

## 4. Gestión de plantillas panel → Meta

- Crear: `POST /v23.0/{waba_id}/message_templates` con `{ name, language, category, components: [{ type: "BODY", text: "Hola {{1}}…", example: { body_text: [["Kevin"]] } }] }` → respuesta `{ id, status: "PENDING" }`.
- Sync: `GET /v23.0/{waba_id}/message_templates?fields=id,name,status,language,category,components,rejected_reason` — reconciliación por (`name`,`language`).
- Borrar: `DELETE /v23.0/{waba_id}/message_templates?name=<name>`.

## 5. Media entrante

1. `GET /v23.0/{media_id}` → `{ url, mime_type, file_size }`
2. `GET <url>` con header `Authorization: Bearer <token>` → bytes
3. Persistir en `/data/uploads/<inbox_id>/<wamid>.<ext>`; servir vía `/api/uploads/...` autenticado. Fallo de descarga ⇒ mensaje con placeholder "adjunto no disponible" y reintento manual.
