CREATE OR REPLACE FUNCTION vortex_record_owner_duplicate_candidates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO duplicate_candidates(org_id,entity_type,entity_id,candidate_entity_id,match_key,confidence,status)
  SELECT NEW.org_id,'owner',NEW.id,o.id,'owner_name:'||LOWER(TRIM(NEW.name)),0.90,'review'
  FROM owners o
  WHERE o.org_id=NEW.org_id AND o.id<>NEW.id AND LOWER(TRIM(o.name))=LOWER(TRIM(NEW.name))
  ON CONFLICT(entity_type,entity_id,candidate_entity_id) DO NOTHING;
  INSERT INTO duplicate_candidates(org_id,entity_type,entity_id,candidate_entity_id,match_key,confidence,status)
  SELECT NEW.org_id,'owner',o.id,NEW.id,'owner_name:'||LOWER(TRIM(NEW.name)),0.90,'review'
  FROM owners o
  WHERE o.org_id=NEW.org_id AND o.id<>NEW.id AND LOWER(TRIM(o.name))=LOWER(TRIM(NEW.name))
  ON CONFLICT(entity_type,entity_id,candidate_entity_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION vortex_record_property_duplicate_candidates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.address IS NOT NULL AND NULLIF(TRIM(NEW.address),'') IS NOT NULL THEN
    INSERT INTO duplicate_candidates(org_id,entity_type,entity_id,candidate_entity_id,match_key,confidence,status)
    SELECT NEW.org_id,'property',NEW.id,p.id,'property_address:'||LOWER(TRIM(NEW.address)),0.85,'review'
    FROM properties p
    WHERE p.org_id=NEW.org_id AND p.id<>NEW.id AND LOWER(TRIM(p.address))=LOWER(TRIM(NEW.address))
    ON CONFLICT(entity_type,entity_id,candidate_entity_id) DO NOTHING;
    INSERT INTO duplicate_candidates(org_id,entity_type,entity_id,candidate_entity_id,match_key,confidence,status)
    SELECT NEW.org_id,'property',p.id,NEW.id,'property_address:'||LOWER(TRIM(NEW.address)),0.85,'review'
    FROM properties p
    WHERE p.org_id=NEW.org_id AND p.id<>NEW.id AND LOWER(TRIM(p.address))=LOWER(TRIM(NEW.address))
    ON CONFLICT(entity_type,entity_id,candidate_entity_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_owner_duplicate_candidates ON owners;
CREATE TRIGGER trg_owner_duplicate_candidates AFTER INSERT OR UPDATE OF name ON owners FOR EACH ROW EXECUTE FUNCTION vortex_record_owner_duplicate_candidates();
DROP TRIGGER IF EXISTS trg_property_duplicate_candidates ON properties;
CREATE TRIGGER trg_property_duplicate_candidates AFTER INSERT OR UPDATE OF address ON properties FOR EACH ROW EXECUTE FUNCTION vortex_record_property_duplicate_candidates();
