CREATE TABLE IF NOT EXISTS owner_enrichment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  source_id UUID,
  source_name VARCHAR(200) NOT NULL,
  source_key VARCHAR(255),
  match_method VARCHAR(60) NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  observed_name TEXT,
  observed_mailing_address TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_owner_enrichment_org_owner ON owner_enrichment_events(org_id,owner_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_enrichment_property ON owner_enrichment_events(org_id,property_id);
