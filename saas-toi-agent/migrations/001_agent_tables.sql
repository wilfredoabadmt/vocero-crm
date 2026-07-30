-- ============================================================
-- Migración: Tablas del Agente de IA para SaaS TOI (ISP)
-- ============================================================
-- Ejecuta este SQL en tu base de datos PostgreSQL.
-- Si usas Prisma, Drizzle, o Sequelize, adapta a tu ORM.
--
-- NOTAS:
-- - Todas las tablas llevan organization_id NOT NULL (multi-tenancy)
-- - agent_profile tiene 1:1 con organization (unique index)
-- - kb_entry tiene 1:N con organization
-- - conversation se extiende con campos de handoff/IA
-- - message se extiende con ai_generated
-- - pipeline_stage y lead son opcionales si ya los tienes
-- ============================================================

-- ─── 1. Perfil del Agente (1 por organización) ──────────────

CREATE TABLE IF NOT EXISTS agent_profile (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL DEFAULT 'Asistente',
  tone TEXT,
  instructions TEXT,
  escalation_rules TEXT,
  greeting TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_profile_org_uq
  ON agent_profile(organization_id);

-- ─── 2. Knowledge Base (entradas Q&A + bloques) ─────────────

CREATE TABLE IF NOT EXISTS kb_entry (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('qa', 'block')),
  question TEXT,
  answer TEXT,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_org_idx
  ON kb_entry(organization_id);

-- ─── 3. Extensión de conversation (si ya existe) ────────────
-- Si tu tabla conversation ya existe, ejecuta solo los ALTER:
-- Si NO existe, crea la tabla completa.

-- OPCIÓN A: Tabla nueva completa
CREATE TABLE IF NOT EXISTS conversation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  is_test BOOLEAN NOT NULL DEFAULT false,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  handoff_at TIMESTAMPTZ,
  handoff_reason TEXT CHECK (handoff_reason IN ('cliente', 'modelo', 'error', 'ventana')),
  last_inbound_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversación real única por contacto (las de prueba no compiten)
CREATE UNIQUE INDEX IF NOT EXISTS conversation_org_contact_real_uq
  ON conversation(organization_id, contact_id)
  WHERE is_test = false;

CREATE INDEX IF NOT EXISTS conversation_org_last_idx
  ON conversation(organization_id, last_message_at);

-- OPCIÓN B: Si ya tienes conversation, solo agrega columnas:
-- ALTER TABLE conversation ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE conversation ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;
-- ALTER TABLE conversation ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;
-- ALTER TABLE conversation ADD COLUMN IF NOT EXISTS handoff_reason TEXT;
-- ALTER TABLE conversation ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- ─── 4. Extensión de message ────────────────────────────────

-- Si tu tabla message ya existe, agrega:
ALTER TABLE message ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

-- ─── 5. Pipeline Stages (si no los tienes) ──────────────────

CREATE TABLE IF NOT EXISTS pipeline_stage (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_org_pos_idx
  ON pipeline_stage(organization_id, position);

-- ─── 6. Leads (si no los tienes) ────────────────────────────

CREATE TABLE IF NOT EXISTS lead (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES pipeline_stage(id),
  position INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_contact_uq
  ON lead(contact_id);

CREATE INDEX IF NOT EXISTS lead_org_stage_idx
  ON lead(organization_id, stage_id, position);

-- ─── 7. Seed: etapas por defecto del pipeline ISP ───────────

-- Inserta etapas por defecto para cada organización existente
-- (solo si no existen ya). Ejecuta una vez tras crear las tablas.

-- INSERT INTO pipeline_stage (id, organization_id, name, position, kind)
-- SELECT
--   'stg_' || substr(md5(random()::text), 1, 20),
--   o.id,
--   etapa.name,
--   etapa.position,
--   etapa.kind
-- FROM organization o
-- CROSS JOIN (VALUES
--   ('Nuevo Lead', 1, 'open'),
--   ('Contactado', 2, 'open'),
--   ('Interesado', 3, 'open'),
--   ('Pagado', 4, 'open'),
--   ('Ticket Abierto', 5, 'open'),
--   ('Resuelto', 6, 'open'),
--   ('Ganado', 7, 'won'),
--   ('Perdido', 8, 'lost')
-- ) AS etapa(name, position, kind)
-- WHERE NOT EXISTS (
--   SELECT 1 FROM pipeline_stage ps WHERE ps.organization_id = o.id
-- );
