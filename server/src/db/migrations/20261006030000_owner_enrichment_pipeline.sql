ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS confidence NUMERIC;
ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS source_name VARCHAR(200);
ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE contact_phones ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS confidence NUMERIC;
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS source_name VARCHAR(200);
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE contact_emails ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS owner_enrichment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES owners(id) ON DELETE CASCADE,
  source_name VARCHAR(200) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  contacts_found INTEGER NOT NULL DEFAULT 0,
  phones_found INTEGER NOT NULL DEFAULT 0,
  emails_found INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS owner_enrichment_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_name VARCHAR(200) NOT NULL,
  source_key VARCHAR(255),
  source_url TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_runs_org_owner ON owner_enrichment_runs(org_id,owner_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_sources_org_owner ON owner_enrichment_sources(org_id,owner_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_phones_source ON contact_phones(source_name);
CREATE INDEX IF NOT EXISTS idx_contact_emails_source ON contact_emails(source_name);
