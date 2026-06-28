# Contrato: API REST + WebSocket del panel

Base: `/api`. Autenticación: cookie de sesión `sid` (httpOnly). Errores: `{ "error": { "code": "STRING_CODE", "message": "humano, en español" } }`. Validación con Zod en cada body/query. Roles: `[A]` = solo admin, `[U]` = cualquier usuario autenticado.

## Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → set-cookie + `{user}`. 401 `INVALID_CREDENTIALS`; 403 `USER_DISABLED` |
| POST | `/auth/logout` [U] | destruye sesión |
| GET | `/auth/me` [U] | `{user: {id,name,email,role,theme}}` |
| PATCH | `/auth/me` [U] | `{name?, theme?, password? {current,new}}` |

## Conversaciones y mensajes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/conversations` [U] | query: `search`, `tag_id`, `stage_id`, `inbox_id`, `cursor`, `limit≤50`. Orden `last_message_at desc`. Items incluyen contacto, preview, `unread_count`, `window: {open, expires_at}`, etiquetas, etapa |
| GET | `/conversations/:id` [U] | detalle + contacto + agente asignado + `auto_reply` + `needs_human` + `window` |
| GET | `/conversations/:id/messages` [U] | paginado por cursor hacia atrás (`before`), `limit≤50` |
| POST | `/conversations/:id/messages` [U] | Texto libre: `{type:'text', body}` → 201 mensaje `pending`. **422 `WINDOW_CLOSED`** si ventana cerrada (FR-038). Plantilla: `{type:'template', template_id, variables: string[]}` → valida estado `approved` y nº de variables (400 `TEMPLATE_VARIABLES_MISSING`). Responder manualmente pausa `auto_reply` (FR-027) |
| POST | `/conversations/:id/read` [U] | `unread_count = 0` |
| PATCH | `/conversations/:id` [U] | `{auto_reply?: 'active'\|'paused', assigned_agent_id?: number\|null, needs_human?: false}` |
| GET | `/conversations/:id/notes` [U] / POST igual ruta | `{body}` → nota con autor; DELETE `/notes/:noteId` (autor o admin) |

## Contactos / CRM
| GET | `/contacts/:id` [U] | lead + etiquetas + etapa + conversaciones |
| PATCH | `/contacts/:id` [U] | `{name?, stage_id?}` |
| PUT | `/contacts/:id/tags` [U] | `{tag_ids: number[]}` reemplaza set |
| GET | `/kanban` [U] | 4 columnas: `{stage, leads: [{contact, last_message_preview, tags, conversation_id}]}` |
| GET/POST | `/tags` [U] | crear `{name, color}`; PATCH/DELETE `/tags/:id` [A] |
| GET | `/stages` [U] / PATCH `/stages/:id` [A] | solo `{name}` (FR-019) |

## Plantillas
| GET | `/templates` [U] | query `inbox_id`, `status`. Lista con estado y motivo de rechazo |
| POST | `/templates` [A] | `{inbox_id, name, language, category, body}` → guarda y **envía a Meta** → `pending`. Valida formato de nombre y variables consecutivas `{{1}}..{{n}}` |
| POST | `/templates/:id/sync` [A] | re-consulta estado en Meta |
| DELETE | `/templates/:id` [A] | borra en Meta y local |
| GET | `/templates/selectable?conversation_id=` [U] | solo `approved` de la bandeja de esa conversación (para el selector del compositor) |

## Bandejas (inboxes)
| GET | `/inboxes` [U] | sin tokens; incluye `status`, `last_error` |
| POST | `/inboxes` [A] | `{name}` → crea `pending` y devuelve `{onboarding_url}` (web del tech provider) |
| PATCH | `/inboxes/:id` [A] | `{name}` |
| POST | `/inboxes/:id/disconnect` [A] / `/inboxes/:id/retry` [A] | transiciones de estado |

## Agentes IA
| GET/POST | `/agents` [U]/[A] | POST = wizard completo: `{name, purpose, tone, instructions, business_info, escalation_rules, model, is_default?}` |
| PATCH/DELETE | `/agents/:id` [A] | DELETE del default sin reemplazo → 409 `DEFAULT_AGENT_REQUIRED` |
| POST | `/agents/:id/default` [A] | marca como default (transacción) |
| POST | `/agents/:id/documents` [A] | multipart; ≤10 MB; pdf/docx/txt/md → `processing` y procesa async |
| GET/DELETE | `/agents/:id/documents` / `/documents/:docId` [A] | estado de procesamiento |
| GET | `/ai/models` [A] | proxy cacheado de modelos OpenRouter (requiere key configurada) |
| PUT | `/settings/openrouter-key` [A] | `{api_key}` → valida contra OpenRouter (401 remoto ⇒ 400 `INVALID_API_KEY`), cifra y guarda. GET devuelve `{configured: true, last4}` |

## Usuarios
| GET/POST | `/users` [A] | POST `{name, email, password, role}` |
| PATCH | `/users/:id` [A] | `{name?, role?, password?, is_active?}`; `is_active:false` borra sesiones (FR-032) |

## Sistema
| GET | `/health` | sin auth: `{ok, db}` para healthcheck |
| GET | `/uploads/*` [U] | sirve adjuntos persistidos |

## WebSocket `/ws`

Autenticado por la misma cookie. Mensajes servidor→cliente (JSON `{event, data}`):

| Evento | Data | Dispara |
|---|---|---|
| `message:new` | mensaje + conversation_id | refetch hilo/lista, badge no leído, sonido |
| `message:status` | `{message_id, status, failure_reason?}` | actualizar ticks |
| `conversation:updated` | conversación resumida | reorden de lista, auto_reply/needs_human |
| `window:reopened` | `{conversation_id, expires_at}` | compositor vuelve a texto libre (FR-042) |
| `lead:stage_changed` | `{contact_id, stage_id, by_user_id}` | mover tarjeta Kanban en vivo (FR-018) |
| `template:status_changed` | `{template_id, status, rejection_reason?}` | refrescar listado/selector |
| `inbox:status_changed` | `{inbox_id, status, last_error?}` | pantalla de bandejas y polling post-onboarding |

Cliente→servidor: solo `ping` (keepalive). Toda mutación va por REST.
