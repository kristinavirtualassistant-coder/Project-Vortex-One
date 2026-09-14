CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','manager','agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  apn VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS ain VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS county VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS use_type VARCHAR(150);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS use_description VARCHAR(255);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS units INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathrooms NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sqft INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_value NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS improvement_value NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_name VARCHAR(255);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES owners(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  phone VARCHAR(40),
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  lead_score INTEGER NOT NULL DEFAULT 0,
  next_followup_date DATE,
  next_followup_time VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dialer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES dialer_sessions(id) ON DELETE SET NULL,
  provider_call_id VARCHAR(255),
  direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  disposition VARCHAR(60),
  from_number VARCHAR(40),
  to_number VARCHAR(40),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telephony_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES dialer_sessions(id) ON DELETE CASCADE,
  socket_id VARCHAR(255) NOT NULL UNIQUE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  recording_url TEXT,
  text_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  area_code VARCHAR(10) NOT NULL,
  caller_id VARCHAR(20) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  recording_url TEXT NOT NULL,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  transcript TEXT,
  ai_summary TEXT,
  keywords TEXT[],
  sentiment VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  calls_dialed INTEGER NOT NULL DEFAULT 0,
  calls_connected INTEGER NOT NULL DEFAULT 0,
  calls_answered INTEGER NOT NULL DEFAULT 0,
  voicemails_left INTEGER NOT NULL DEFAULT 0,
  appointments_set INTEGER NOT NULL DEFAULT 0,
  interested_leads INTEGER NOT NULL DEFAULT 0,
  total_talk_time_seconds INTEGER NOT NULL DEFAULT 0,
  avg_wrapup_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('sms','email','voicemail')),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '["{owner_name}","{property_address}","{callback_number}","{lead_score}","{agent_name}","{appt_date}","{appt_time}"]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_properties_org_apn ON properties(org_id, apn);
CREATE INDEX IF NOT EXISTS idx_properties_org_address ON properties(org_id, address);
CREATE INDEX IF NOT EXISTS idx_calls_org_created ON calls(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conn_user ON agent_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_call ON call_recordings(call_id);
CREATE INDEX IF NOT EXISTS idx_agent_stats_user_date ON agent_stats(user_id, date);
CREATE INDEX IF NOT EXISTS idx_templates_org_type ON message_templates(org_id, type);
