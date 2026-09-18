-- Defense-in-depth constraints for production organization isolation.
-- Application routes remain organization-scoped; these constraints prevent
-- orphaned ownership relationships that could otherwise bypass that boundary.

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owners_property_owner
  ON property_owners(property_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_users_org_email
  ON users(org_id, email);

CREATE INDEX IF NOT EXISTS idx_owners_org_name
  ON owners(org_id, name);

CREATE INDEX IF NOT EXISTS idx_leads_org_phone
  ON leads(org_id, phone);

CREATE INDEX IF NOT EXISTS idx_calls_org_lead
  ON calls(org_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_provenance_org_entity
  ON provenance(org_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_org_actor_created
  ON audit_logs(organization_id, actor_user_id, created_at DESC);
