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
