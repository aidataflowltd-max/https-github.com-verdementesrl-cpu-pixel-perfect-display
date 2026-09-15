export type UserRole = 'super_admin' | 'bank_admin' | 'bank_user' | 'company_contact' | 'broker_admin' | 'broker_user'

export type RequestStatus = 'new' | 'awaiting_company' | 'in_verification' | 'completed' | 'anomalies' | 'expired' | 'preliminary'

export type VerificationLevel =
  | 'not_configured'
  | 'user_provided'
  | 'analyzed'
  | 'integrity_verified'
  | 'source_acquired'
  | 'cryptographically_verified'

export type ConnectorType = 'banking' | 'tax' | 'credit' | 'corporate' | 'document'
export type ConnectorStatus = 'not_configured' | 'connected' | 'error' | 'testing'
export type AnomalySeverity = 'information' | 'warning' | 'high_risk' | 'unverified'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  bank_id: string | null
  company_id: string | null
  branch_id: string | null
  broker_id: string | null
}

export interface BankBranch {
  id: string
  bank_id: string
  name: string
  region: string | null
  province: string | null
  created_at: string
}

export interface Broker {
  id: string
  name: string
  vat_number: string | null
  status: string
  created_at: string
}

export interface Bank {
  id: string
  name: string
  vat_number: string | null
  status: string
  created_at: string
}

export interface Company {
  id: string
  legal_name: string
  vat_number: string
  tax_code: string | null
  registered_office: string | null
  created_at: string
}

export interface VerificationRequest {
  id: string
  bank_id: string | null
  broker_id: string | null
  branch_id: string | null
  company_id: string
  invite_token: string
  financing_amount: number | null
  financing_type: string | null
  financing_purpose: string | null
  preliminary_check_score: number | null
  preliminary_check_notes: string | null
  verification_tier: number | null
  status: RequestStatus
  contact_email: string | null
  contact_phone: string | null
  expires_at: string
  created_at: string
  companies?: Company
  banks?: Bank
  bank_branches?: BankBranch
  brokers?: Broker
}

export interface Source {
  id: string
  provider_id: string | null
  name: string
  connector_type: ConnectorType
  authentication_type: string | null
  api_endpoint: string | null
  environment: string
  status: ConnectorStatus
  last_test_at: string | null
  error_rate: number
}

export interface SourceConnector {
  id: string
  request_id: string
  source_id: string
  status: ConnectorStatus
  verification_level: VerificationLevel
  authentication_method: string | null
  acquired_at: string | null
  authorization_id: string | null
  acquisition_id: string | null
  hash: string | null
  error_state: string | null
  sources?: Source
}

export interface DocumentRow {
  id: string
  request_id: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  storage_path: string
  classification: string
  document_category: string | null
  created_at: string
}

export interface DataProvenance {
  id: string
  request_id: string
  field_name: string
  field_value: string | null
  period_start: string | null
  period_end: string | null
  acquired_at: string
  authorization_id: string | null
  acquisition_id: string | null
  hash: string | null
  verification_level: VerificationLevel
  confidence: number
}

export interface CrossSourceCheck {
  id: string
  request_id: string
  field_name: string
  source_a: string
  value_a: number | null
  source_b: string
  value_b: number | null
  difference_pct: number | null
  threshold_pct: number
  result: 'consistent' | 'discrepancy' | 'insufficient_data'
}

export interface Anomaly {
  id: string
  request_id: string
  severity: AnomalySeverity
  title: string
  description: string | null
  resolved: boolean
  justification: string | null
  justified_by: string | null
  justified_at: string | null
  created_at: string
}

export interface Snapshot {
  id: string
  snapshot_code: string
  request_id: string
  company_id: string
  version: number
  dataset_hash: string
  data_trust_score: number | null
  trust_breakdown: Record<string, number> | null
  sources_total: number
  sources_verified: number
  sources_user_provided: number
  anomalies_count: number
  locked: boolean
  locked_at: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  request_id: string | null
  actor_type: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}
