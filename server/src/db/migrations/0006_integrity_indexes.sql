-- Integrity and lookup indexes for relationship tables.
-- Organization ownership is enforced by the parent entities and application
-- organization scoping; these relationship tables intentionally do not carry
-- duplicated org_id columns.

CREATE INDEX IF NOT EXISTS idx_property_owners_property_owner
  ON property_owners(property_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead
  ON campaign_leads(lead_id);

CREATE INDEX IF NOT EXISTS idx_campaign_members_user
  ON campaign_members(user_id);

CREATE INDEX IF NOT EXISTS idx_call_recordings_lead
  ON call_recordings(lead_id);

CREATE INDEX IF NOT EXISTS idx_provenance_org_source
  ON provenance(org_id, source_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_imports_org_hash
  ON imports(org_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_contacts_org_display_name
  ON contacts(org_id, display_name);
