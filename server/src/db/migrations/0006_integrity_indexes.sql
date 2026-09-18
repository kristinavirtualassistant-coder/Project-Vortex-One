CREATE INDEX IF NOT EXISTS idx_property_owners_org_property ON property_owners(org_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_owners_org_owner ON property_owners(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead ON campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead ON call_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_provenance_org_source ON provenance(org_id, source_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_org_hash ON imports(org_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_contacts_org_display_name ON contacts(org_id, display_name);
