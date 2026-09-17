ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type VARCHAR(80);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lot_size_sqft INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zoning VARCHAR(120);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS occupancy VARCHAR(80);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS mailing_address TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS mailing_address TEXT;

CREATE TABLE IF NOT EXISTS property_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  ownership_type VARCHAR(40),
  ownership_percent NUMERIC,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, owner_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES owners(id) ON DELETE SET NULL,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  display_name VARCHAR(240),
  title VARCHAR(160),
  mailing_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone VARCHAR(40) NOT NULL,
  phone_type VARCHAR(30),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, phone)
);

CREATE TABLE IF NOT EXISTS contact_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  email_type VARCHAR(30),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, email)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  content_hash VARCHAR(128),
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validated','accepted','processing','completed','failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  normalized_data JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','invalid','imported','duplicate','review')),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(import_id, row_number)
);

CREATE TABLE IF NOT EXISTS provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  import_id UUID REFERENCES imports(id) ON DELETE SET NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  field_name VARCHAR(120),
  source_value TEXT,
  method VARCHAR(60) NOT NULL DEFAULT 'import',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  candidate_entity_id UUID NOT NULL,
  match_key VARCHAR(255) NOT NULL,
  confidence NUMERIC,
  status VARCHAR(30) NOT NULL DEFAULT 'review' CHECK (status IN ('review','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, candidate_entity_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_owners_property ON property_owners(property_id);
CREATE INDEX IF NOT EXISTS idx_property_owners_owner ON property_owners(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_owner ON contacts(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_phones_phone ON contact_phones(phone);
CREATE INDEX IF NOT EXISTS idx_contact_emails_email ON contact_emails(email);
CREATE INDEX IF NOT EXISTS idx_imports_org_created ON imports(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_records_import ON import_records(import_id, row_number);
CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance(org_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_org_status ON duplicate_candidates(org_id, status);
CREATE INDEX IF NOT EXISTS idx_saved_searches_org_user ON saved_searches(org_id, user_id);
