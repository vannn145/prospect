CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  website TEXT,
  instagram_url TEXT,
  rating NUMERIC(3,2),
  reviews INTEGER NOT NULL DEFAULT 0,
  status_site VARCHAR(20) NOT NULL DEFAULT 'sem_site' CHECK (status_site IN ('sem_site', 'site_fraco', 'site_ok')),
  contacted BOOLEAN NOT NULL DEFAULT FALSE,
  place_id TEXT NOT NULL UNIQUE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  priority_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_status_site ON companies(status_site);
CREATE INDEX IF NOT EXISTS idx_companies_contacted ON companies(contacted);
CREATE INDEX IF NOT EXISTS idx_companies_city_category ON companies(city, category);
CREATE INDEX IF NOT EXISTS idx_companies_priority ON companies(priority_score DESC);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
  CHECK (contact_email_status IN ('unknown', 'found', 'not_found', 'error', 'skipped'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email_source_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email_checked_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email_error TEXT;

CREATE INDEX IF NOT EXISTS idx_companies_contact_email ON companies(contact_email);
CREATE INDEX IF NOT EXISTS idx_companies_contact_email_status ON companies(contact_email_status);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  stage VARCHAR(20) NOT NULL DEFAULT 'entrada' CHECK (stage IN ('entrada', 'contato', 'proposta', 'negociacao', 'fechado', 'perdido')),
  notes TEXT,
  next_action TEXT,
  proposal_value NUMERIC(12,2),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_stage ON kanban_cards(stage);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_updated_at ON kanban_cards(updated_at DESC);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'kanban_cards'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE kanban_cards DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE kanban_cards ALTER COLUMN stage TYPE VARCHAR(80);

CREATE TABLE IF NOT EXISTS kanban_columns (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(80) NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_columns_position ON kanban_columns(position);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_title ON kanban_columns(title);

INSERT INTO kanban_columns (key, title, position)
VALUES
  ('entrada', 'Entrada', 1),
  ('contato', 'Contato', 2),
  ('proposta', 'Proposta', 3),
  ('negociacao', 'Negociação', 4),
  ('fechado', 'Fechado', 5),
  ('perdido', 'Perdido', 6)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  profile_name TEXT,
  phone_display TEXT,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  contact_tag TEXT,
  contact_tag_updated_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS contact_tag TEXT;
ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS contact_tag_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_last_message_at ON whatsapp_contacts(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_company_id ON whatsapp_contacts(company_id);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  wa_message_id TEXT UNIQUE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  text_body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'received',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_created_at ON whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_owner TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_last_interaction_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_crm_owner ON companies(crm_owner);
CREATE INDEX IF NOT EXISTS idx_companies_crm_score ON companies(crm_score DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'canceled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  stage VARCHAR(20)
    CHECK (stage IN ('entrada', 'contato', 'proposta', 'negociacao', 'fechado', 'perdido')),
  due_date TIMESTAMPTZ,
  source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'automation')),
  assigned_to TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_company ON crm_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status_due ON crm_tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_stage ON crm_tasks(stage);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_updated_at ON crm_tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_activities (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  card_id BIGINT REFERENCES kanban_cards(id) ON DELETE SET NULL,
  activity_type VARCHAR(40) NOT NULL,
  channel VARCHAR(20)
    CHECK (channel IN ('kanban', 'whatsapp', 'email', 'task', 'system')),
  title TEXT NOT NULL,
  details TEXT,
  metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_company_created_at ON crm_activities(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(activity_type);
