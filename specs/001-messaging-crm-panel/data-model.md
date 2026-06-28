# Data Model: Panel de Mensajería con CRM Multicanal

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

PostgreSQL 16, schema gestionado con Drizzle. IDs: `bigint identity` salvo indicación. Timestamps `timestamptz` con `created_at` por defecto `now()`.

## Tablas

### users
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| email | text UNIQUE NOT NULL | login, lowercase |
| name | text NOT NULL | |
| password_hash | text NOT NULL | argon2id |
| role | enum `admin`,`agent` NOT NULL | FR-031 |
| is_active | boolean NOT NULL default true | desactivar ⇒ borrar sessions (FR-032) |
| theme | enum `light`,`dark`,`system` default `system` | preferencia persistente (FR-035) |
| created_at | timestamptz | |

### sessions
| id (uuid PK) | user_id FK→users ON DELETE CASCADE | token_hash text UNIQUE | expires_at timestamptz | created_at |

Sesión válida ⇔ `expires_at > now()` y `users.is_active`.

### inboxes (bandejas WhatsApp)
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| name | text NOT NULL | editable |
| status | enum `pending`,`connected`,`failed`,`disconnected` | transiciones: pending→connected (provisioning OK), pending→failed (expira/falla), connected→disconnected (manual), failed/disconnected→pending (reintento). FR-010/US2 |
| waba_id | text | |
| phone_number_id | text UNIQUE | clave de upsert del provisioning (reintentos sin duplicar) |
| display_phone_number | text | |
| access_token_enc | text | cifrado AES-256-GCM con `SESSION_SECRET` derivada; nunca sale por la API (FR-010) |
| last_error | text | motivo de fallo visible |
| connected_at, created_at | timestamptz | |

### stages (etapas del embudo — exactamente 4 filas, seed)
| id PK | name text NOT NULL | position int UNIQUE (1..4) |

Solo se permite renombrar (FR-019); no insertar/borrar. Defaults: Nuevo, En conversación, Calificado, Cerrado.

### contacts (leads)
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| wa_id | text NOT NULL | id de WhatsApp del contacto |
| inbox_id | FK→inboxes | UNIQUE(inbox_id, wa_id) |
| name | text | profile.name del canal; editable |
| phone | text | |
| stage_id | FK→stages NOT NULL default etapa 1 | FR-020 |
| stage_changed_at | timestamptz | |
| created_at | timestamptz | auto-creación al primer mensaje (FR-014) |

### tags
| id PK | name text UNIQUE NOT NULL | color text NOT NULL (`#hex`) |

### contact_tags
| contact_id FK CASCADE | tag_id FK CASCADE | PK(contact_id, tag_id) |

### conversations
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| inbox_id | FK→inboxes NOT NULL | |
| contact_id | FK→contacts NOT NULL | UNIQUE(inbox_id, contact_id) — agrupación única (FR-002) |
| last_inbound_at | timestamptz | timestamp **del evento del canal**; base de la ventana 24h (FR-037) |
| last_message_at | timestamptz | orden del listado (FR-001) |
| last_message_preview | text | denormalizado para la lista |
| unread_count | int default 0 | FR-006; se resetea al abrir |
| auto_reply | enum `active`,`paused` default `active` | pausa al responder humano (FR-027) |
| assigned_agent_id | FK→ai_agents NULL | NULL ⇒ usa agente por defecto (FR-025/026) |
| needs_human | boolean default false | fallo IA o ventana cerrada con auto_reply activo (FR-029/043) |
| created_at | timestamptz | |

**Derivado** (no columna): `window_open = last_inbound_at IS NOT NULL AND now() - last_inbound_at < interval '24 hours'`; `window_expires_at = last_inbound_at + 24h`.

### messages
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| conversation_id | FK→conversations NOT NULL, índice | |
| wamid | text UNIQUE NULL | dedup de webhooks (entrantes y salientes reales) |
| direction | enum `in`,`out` | |
| author_type | enum `contact`,`user`,`ai_agent`,`system` | FR-004 |
| author_user_id | FK→users NULL | si author_type=user |
| author_agent_id | FK→ai_agents NULL | si author_type=ai_agent |
| type | enum `text`,`image`,`audio`,`video`,`document`,`sticker`,`template`,`unsupported` | FR-005 |
| body | text | texto o cuerpo renderizado de plantilla |
| media_path | text | ruta local del adjunto persistido |
| media_mime, media_filename | text | |
| template_id | FK→templates NULL | envíos de plantilla |
| status | enum `pending`,`sent`,`delivered`,`read`,`failed` | salientes; transiciones solo hacia delante (un `delivered` tardío no pisa `read`) |
| failure_reason | text | motivo legible (FR-004, edge cases) |
| channel_timestamp | timestamptz | timestamp de Meta |
| created_at | timestamptz | |

### notes
| id PK | conversation_id FK NOT NULL | user_id FK→users | body text NOT NULL | created_at |

Inmutables para terceros: solo autor o admin puede borrar. Nunca salen por el canal (FR-016).

### ai_agents
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| name | text NOT NULL | |
| purpose | text NOT NULL | wizard: rol/propósito |
| tone | text | personalidad/tono |
| instructions | text | reglas de comportamiento |
| business_info | text | información del negocio |
| escalation_rules | text | cuándo derivar a humano |
| model | text NOT NULL | id de modelo OpenRouter (FR-023) |
| is_default | boolean default false | exactamente uno `true` (índice parcial único). No se borra el default sin reemplazo (FR-025/028) |
| created_at, updated_at | timestamptz | |

Al borrar un agente: `conversations.assigned_agent_id` → NULL (pasan al default, FR-028).

### agent_documents
| id PK | agent_id FK CASCADE | filename, mime, size_bytes | path text | status enum `processing`,`ready`,`failed` | error text | created_at |

Límites: PDF/DOCX/TXT/MD, ≤10 MB (edge case de carga).

### document_chunks
| id PK | document_id FK CASCADE | agent_id FK (denormalizado para retrieval) | chunk_index int | content text | tsv tsvector GENERATED (config `spanish`) — índice GIN |

### templates (plantillas WhatsApp)
| Campo | Tipo | Reglas |
|---|---|---|
| id | bigint PK | |
| inbox_id | FK→inboxes NOT NULL | la plantilla pertenece a una bandeja/WABA |
| meta_template_id | text | id devuelto por Meta |
| name | text NOT NULL | formato Meta: `[a-z0-9_]{1,512}`; UNIQUE(inbox_id, name, language) |
| language | text NOT NULL default `es` | |
| category | enum `MARKETING`,`UTILITY`,`AUTHENTICATION` | |
| body | text NOT NULL | con variables `{{1}}..{{n}}` |
| variables_count | int | derivado del body al guardar |
| status | enum `draft`,`pending`,`approved`,`rejected`,`disabled` | draft→pending (submit a Meta), pending→approved/rejected (webhook/sync), approved→disabled (Meta). Solo `approved` es enviable (FR-041) |
| rejection_reason | text | |
| last_synced_at, created_at | timestamptz | |

### settings (key-value de instancia)
| key text PK | value text | updated_at |

Claves: `openrouter_api_key_enc` (cifrada, nunca expuesta — solo `…last4`), `business_name`, `ai_global_enabled`.

### webhook_events (diagnóstico, FR-013)
| id PK | source enum `meta`,`simulation` | payload jsonb | status enum `processed`,`discarded`,`error` | detail text | created_at |

Retención: purga >30 días en arranque.

## Relaciones clave

```
inboxes 1─N conversations N─1 contacts N─1 stages
contacts N─M tags
conversations 1─N messages, 1─N notes, N─1 ai_agents (assigned, nullable)
ai_agents 1─N agent_documents 1─N document_chunks
inboxes 1─N templates; messages N─1 templates (nullable)
users 1─N sessions, 1─N notes, 1─N messages (author)
```

## Invariantes de negocio

1. Exactamente un `ai_agents.is_default = true` mientras exista al menos un agente (índice único parcial + transacción en create/delete).
2. Mensaje saliente de texto libre requiere `window_open = true` — verificado en servicio con `SELECT … FOR UPDATE` de la conversación (carrera: ventana expira mientras se escribe).
3. `messages.wamid` único ⇒ webhooks duplicados/reintentos de Meta son no-op.
4. Eventos de `phone_number_id` desconocido no crean filas de dominio; solo `webhook_events.discarded`.
5. `unread_count` solo incrementa con `direction = in`; se resetea a 0 cuando un usuario abre la conversación.
6. Borrar inbox ⇒ conserva conversaciones/mensajes (histórico); inbox pasa a `disconnected` y se anula `access_token_enc`. No hay borrado físico de conversaciones en fase 1.
