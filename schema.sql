-- ============================================================================
-- VERIFIED — Schema database (PostgreSQL / Supabase)
-- Esegui questo file nel SQL editor di Supabase (Project → SQL Editor → New query)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type user_role as enum ('super_admin', 'bank_admin', 'bank_user', 'company_contact');
create type request_status as enum ('new', 'awaiting_company', 'in_verification', 'completed', 'anomalies', 'expired');
create type verification_level as enum ('not_configured', 'user_provided', 'analyzed', 'integrity_verified', 'source_acquired', 'cryptographically_verified');
create type connector_type as enum ('banking', 'tax', 'credit', 'corporate', 'document');
create type connector_status as enum ('not_configured', 'connected', 'error', 'testing');
create type anomaly_severity as enum ('information', 'warning', 'high_risk', 'unverified');
create type consent_status as enum ('pending', 'granted', 'revoked');

-- ----------------------------------------------------------------------------
-- CORE IDENTITY
-- ----------------------------------------------------------------------------

-- profiles: 1:1 con auth.users di Supabase, aggiunge ruolo e org di appartenenza
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text,
  bank_id uuid,
  company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_number text,
  status text not null default 'active',
  api_keys_reference text, -- riferimento a secret manager, mai la chiave in chiaro
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add constraint profiles_bank_fk foreign key (bank_id) references banks(id) on delete set null;

create table companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  vat_number text not null,
  tax_code text,
  registered_office text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add constraint profiles_company_fk foreign key (company_id) references companies(id) on delete set null;

create table organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_type text not null check (organization_type in ('bank','company')),
  organization_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- VERIFICATION REQUESTS
-- ----------------------------------------------------------------------------

create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references banks(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  requested_by uuid references profiles(id),
  invite_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  financing_amount numeric,
  status request_status not null default 'new',
  contact_email text,
  contact_phone text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table verification_request_sources (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  connector_type connector_type not null,
  requested boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- OTP SESSIONS (company access to invite link)
-- ----------------------------------------------------------------------------

create table otp_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  contact_email text not null,
  contact_phone text,
  otp_hash text not null,          -- solo hash, mai il codice in chiaro
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed boolean not null default false,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CONSENT & AUTHORIZATION
-- ----------------------------------------------------------------------------

create table consents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  connector_type connector_type,
  purpose text not null,
  status consent_status not null default 'pending',
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  connector_type connector_type not null,
  description text,
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id),
  name text not null,
  connector_type connector_type not null,
  authentication_type text,
  api_endpoint text,
  environment text default 'sandbox',
  credentials_reference text, -- puntatore a secret manager, MAI credenziali reali
  status connector_status not null default 'not_configured',
  last_test_at timestamptz,
  error_rate numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_connectors (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  source_id uuid not null references sources(id),
  authentication_method text,
  consent_id uuid references consents(id),
  authorization_id text,
  acquisition_id text,
  acquired_at timestamptz,
  status connector_status not null default 'not_configured',
  raw_response jsonb,
  hash text,
  verification_level verification_level not null default 'not_configured',
  error_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table authorizations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  source_connector_id uuid references source_connectors(id),
  authorization_type text not null,
  reference_code text not null default encode(gen_random_bytes(12), 'hex'),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table acquisition_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  source_connector_id uuid references source_connectors(id),
  event_type text not null,
  payload jsonb,
  occurred_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- DOCUMENTS & EVIDENCE ENGINE
-- ----------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  source_connector_id uuid references source_connectors(id),
  filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  classification text not null default 'user_provided', -- user_provided | source_acquired
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null default 1,
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table document_hashes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  algorithm text not null default 'SHA-256',
  hash text not null,
  computed_at timestamptz not null default now()
);

create table document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  has_digital_signature boolean not null default false,
  signer text,
  certificate_info jsonb,
  timestamp_info jsonb,
  valid boolean,
  created_at timestamptz not null default now()
);

-- metadati forensi/tecnici del documento (PDF/producer/creator/ecc.), quando estraibili
create table document_metadata (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  pdf_version text,
  producer text,
  creator text,
  creation_date text,
  modification_date text,
  page_count int,
  has_embedded_files boolean default false,
  has_incremental_updates boolean default false,
  forensic_flags jsonb default '[]'::jsonb,
  raw_metadata jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- DATA RECORDS & PROVENANCE
-- ----------------------------------------------------------------------------

create table data_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  category text not null, -- company | financial | banking | tax | credit
  field_name text not null,
  field_value text,
  unit text,
  created_at timestamptz not null default now()
);

create table data_provenance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  request_id uuid not null references verification_requests(id) on delete cascade,
  source_id uuid references sources(id),
  provider_id uuid references providers(id),
  data_record_id uuid references data_records(id),
  field_name text not null,
  field_value text,
  period_start date,
  period_end date,
  acquired_at timestamptz not null default now(),
  authorization_id text,
  acquisition_id text,
  hash text,
  verification_level verification_level not null default 'user_provided',
  confidence numeric default 1.0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CROSS-SOURCE RECONCILIATION & ANOMALIES
-- ----------------------------------------------------------------------------

create table cross_source_checks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  field_name text not null,
  source_a text not null,
  value_a numeric,
  source_b text not null,
  value_b numeric,
  difference_pct numeric,
  threshold_pct numeric not null default 5,
  result text not null, -- consistent | discrepancy | insufficient_data
  created_at timestamptz not null default now()
);

create table anomalies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references verification_requests(id) on delete cascade,
  severity anomaly_severity not null,
  title text not null,
  description text,
  related_check_id uuid references cross_source_checks(id),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SNAPSHOTS & EVIDENCE PACKS
-- ----------------------------------------------------------------------------

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_code text not null unique, -- es. VS-20260913-000183
  request_id uuid not null references verification_requests(id) on delete cascade,
  company_id uuid not null references companies(id),
  version int not null default 1,
  previous_snapshot_id uuid references snapshots(id),
  dataset_hash text not null,
  data_trust_score numeric,
  trust_breakdown jsonb,
  sources_total int not null default 0,
  sources_verified int not null default 0,
  sources_user_provided int not null default 0,
  anomalies_count int not null default 0,
  locked boolean not null default false,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table snapshot_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  category text not null,
  field_name text not null,
  field_value text,
  provenance_id uuid references data_provenance(id),
  created_at timestamptz not null default now()
);

create table evidence_packs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  generated_by uuid references profiles(id),
  storage_path text,
  contents_manifest jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- AUDIT / NOTIFICATIONS / SETTINGS
-- ----------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references verification_requests(id) on delete set null,
  actor_id uuid references profiles(id),
  actor_type text, -- bank | company | admin | system
  event_type text not null,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text,
  recipient_user_id uuid references profiles(id),
  channel text not null default 'email',
  subject text,
  body text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('cross_check_default_threshold_pct', '5'),
  ('otp_ttl_seconds', '300'),
  ('otp_max_attempts', '5');

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table profiles enable row level security;
alter table banks enable row level security;
alter table companies enable row level security;
alter table verification_requests enable row level security;
alter table verification_request_sources enable row level security;
alter table otp_sessions enable row level security;
alter table consents enable row level security;
alter table providers enable row level security;
alter table sources enable row level security;
alter table source_connectors enable row level security;
alter table authorizations enable row level security;
alter table acquisition_events enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table document_hashes enable row level security;
alter table document_signatures enable row level security;
alter table document_metadata enable row level security;
alter table data_records enable row level security;
alter table data_provenance enable row level security;
alter table cross_source_checks enable row level security;
alter table anomalies enable row level security;
alter table snapshots enable row level security;
alter table snapshot_records enable row level security;
alter table evidence_packs enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;
alter table system_settings enable row level security;

-- Helper: legge il ruolo/organizzazione dell'utente corrente dalla tabella profiles
create or replace function auth_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_bank_id() returns uuid as $$
  select bank_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_company_id() returns uuid as $$
  select company_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_super_admin() returns boolean as $$
  select auth_role() = 'super_admin';
$$ language sql stable security definer;

-- profiles: ognuno vede/aggiorna solo il proprio profilo; super admin vede tutti
create policy profiles_self on profiles for select using (id = auth.uid() or is_super_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid() or is_super_admin());
create policy profiles_admin_insert on profiles for insert with check (is_super_admin() or id = auth.uid());

-- banks: super admin tutto; bank_user/bank_admin solo la propria banca (sola lettura sui dati banca)
create policy banks_admin_all on banks for all using (is_super_admin());
create policy banks_own_select on banks for select using (id = auth_bank_id());

-- companies: super admin tutto; bank vede le aziende con richieste verso la propria banca; company vede se stessa
create policy companies_admin_all on companies for all using (is_super_admin());
create policy companies_bank_select on companies for select using (
  exists (select 1 from verification_requests r where r.company_id = companies.id and r.bank_id = auth_bank_id())
);
create policy companies_self_select on companies for select using (id = auth_company_id());

-- verification_requests: banca vede/gestisce le proprie; company vede le proprie; super admin tutto
create policy vr_admin_all on verification_requests for all using (is_super_admin());
create policy vr_bank_all on verification_requests for all using (bank_id = auth_bank_id());
create policy vr_company_select on verification_requests for select using (company_id = auth_company_id());

-- tutte le tabelle "figlie" di una request: stessa regola, tramite join su verification_requests
create policy vrs_scope on verification_request_sources for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = verification_request_sources.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy consents_scope on consents for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = consents.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy sc_scope on source_connectors for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = source_connectors.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy auth_scope on authorizations for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = authorizations.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy ae_scope on acquisition_events for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = acquisition_events.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy documents_scope on documents for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = documents.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy dv_scope on document_versions for all using (
  is_super_admin() or
  exists (select 1 from documents d join verification_requests r on r.id = d.request_id where d.id = document_versions.document_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy dh_scope on document_hashes for all using (
  is_super_admin() or
  exists (select 1 from documents d join verification_requests r on r.id = d.request_id where d.id = document_hashes.document_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy ds_scope on document_signatures for all using (
  is_super_admin() or
  exists (select 1 from documents d join verification_requests r on r.id = d.request_id where d.id = document_signatures.document_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy dm_scope on document_metadata for all using (
  is_super_admin() or
  exists (select 1 from documents d join verification_requests r on r.id = d.request_id where d.id = document_metadata.document_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy dr_scope on data_records for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = data_records.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy dp_scope on data_provenance for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = data_provenance.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy csc_scope on cross_source_checks for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = cross_source_checks.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy an_scope on anomalies for all using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = anomalies.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy snap_scope on snapshots for select using (
  is_super_admin() or
  exists (select 1 from verification_requests r where r.id = snapshots.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);
-- gli snapshot, una volta creati e bloccati (locked), non sono più modificabili da nessuno tranne il sistema/super admin
create policy snap_insert on snapshots for insert with check (
  is_super_admin() or exists (select 1 from verification_requests r where r.id = snapshots.request_id and r.bank_id = auth_bank_id())
);
create policy snap_update on snapshots for update using (is_super_admin() and locked = false);

create policy sr_scope on snapshot_records for select using (
  is_super_admin() or
  exists (select 1 from snapshots s join verification_requests r on r.id = s.request_id where s.id = snapshot_records.snapshot_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);

create policy ep_scope on evidence_packs for select using (
  is_super_admin() or
  exists (select 1 from snapshots s join verification_requests r on r.id = s.request_id where s.id = evidence_packs.snapshot_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);
create policy ep_insert on evidence_packs for insert with check (
  is_super_admin() or exists (select 1 from snapshots s join verification_requests r on r.id = s.request_id where s.id = evidence_packs.snapshot_id and r.bank_id = auth_bank_id())
);

-- providers/sources: lettura per tutti gli autenticati, scrittura solo super admin
create policy providers_read on providers for select using (auth.uid() is not null);
create policy providers_admin_write on providers for all using (is_super_admin());
create policy sources_read on sources for select using (auth.uid() is not null);
create policy sources_admin_write on sources for all using (is_super_admin());

-- otp_sessions: nessun accesso diretto client-side (gestito solo da funzioni server-side / service role)
create policy otp_no_client_access on otp_sessions for all using (false);

-- audit_logs: super admin tutto; banca/azienda vedono solo i log delle proprie request
create policy audit_admin on audit_logs for select using (is_super_admin());
create policy audit_scope on audit_logs for select using (
  exists (select 1 from verification_requests r where r.id = audit_logs.request_id and (r.bank_id = auth_bank_id() or r.company_id = auth_company_id()))
);
create policy audit_insert on audit_logs for insert with check (auth.uid() is not null);

-- notifications: ognuno vede le proprie
create policy notif_self on notifications for select using (recipient_user_id = auth.uid() or is_super_admin());

-- system_settings: lettura per autenticati, scrittura solo super admin
create policy settings_read on system_settings for select using (auth.uid() is not null);
create policy settings_admin_write on system_settings for all using (is_super_admin());

-- ============================================================================
-- FUNZIONI ADMIN
-- ============================================================================

-- Permette al Super Admin di vedere l'elenco utenti (id + email) senza mai
-- esporre la service role key al browser: la funzione gira con i privilegi
-- del definer (postgres) mentre il controllo di accesso resta lato Postgres.
create or replace function admin_list_users()
returns table (id uuid, email text, created_at timestamptz)
security definer
set search_path = public
as $$
  select u.id, u.email, u.created_at
  from auth.users u
  where (select is_super_admin());
$$ language sql stable;

grant execute on function admin_list_users() to authenticated;

-- Permette al Super Admin di assegnare ruolo/organizzazione a un utente
-- già registrato (es. dopo un invito email dalla dashboard Supabase).
create or replace function admin_assign_profile(target_user_id uuid, new_role user_role, new_bank_id uuid, new_company_id uuid, new_full_name text)
returns void
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'not authorized';
  end if;
  insert into profiles (id, role, bank_id, company_id, full_name)
  values (target_user_id, new_role, new_bank_id, new_company_id, new_full_name)
  on conflict (id) do update set role = excluded.role, bank_id = excluded.bank_id, company_id = excluded.company_id, full_name = excluded.full_name, updated_at = now();
end;
$$ language plpgsql;

grant execute on function admin_assign_profile(uuid, user_role, uuid, uuid, text) to authenticated;

-- ============================================================================
-- STORAGE (documenti privati, mai URL pubblici)
-- ============================================================================
insert into storage.buckets (id, name, public) values ('verified-documents', 'verified-documents', false)
  on conflict (id) do nothing;

create policy storage_scope_select on storage.objects for select using (
  bucket_id = 'verified-documents' and auth.uid() is not null
);
create policy storage_scope_insert on storage.objects for insert with check (
  bucket_id = 'verified-documents' and auth.uid() is not null
);
