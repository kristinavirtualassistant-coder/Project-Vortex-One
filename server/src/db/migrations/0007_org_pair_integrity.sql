-- Composite organization foreign keys enforce that related records cannot
-- point across organizations even if a route is accidentally changed later.
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_id_org_key;
ALTER TABLE properties ADD CONSTRAINT properties_id_org_key UNIQUE(id,org_id);
ALTER TABLE owners DROP CONSTRAINT IF EXISTS owners_id_org_key;
ALTER TABLE owners ADD CONSTRAINT owners_id_org_key UNIQUE(id,org_id);
ALTER TABLE property_owners ADD COLUMN IF NOT EXISTS org_id UUID;
UPDATE property_owners po SET org_id=p.org_id FROM properties p WHERE p.id=po.property_id AND po.org_id IS NULL;
ALTER TABLE property_owners ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_owners_org ON property_owners(org_id);
ALTER TABLE property_owners DROP CONSTRAINT IF EXISTS property_owners_property_org_fk;
ALTER TABLE property_owners DROP CONSTRAINT IF EXISTS property_owners_owner_org_fk;
ALTER TABLE property_owners ADD CONSTRAINT property_owners_property_org_fk FOREIGN KEY(property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE;
ALTER TABLE property_owners ADD CONSTRAINT property_owners_owner_org_fk FOREIGN KEY(owner_id,org_id) REFERENCES owners(id,org_id) ON DELETE CASCADE;
