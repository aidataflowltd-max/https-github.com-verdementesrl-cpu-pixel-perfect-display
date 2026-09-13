import { supabase } from './supabase'

export type AuditEventType =
  | 'USER_LOGIN'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'OTP_FAILED'
  | 'CONSENT_CREATED'
  | 'CONSENT_REVOKED'
  | 'SOURCE_CONNECTED'
  | 'DATA_ACQUIRED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_HASHED'
  | 'SNAPSHOT_CREATED'
  | 'SNAPSHOT_LOCKED'
  | 'BANK_VIEWED_SNAPSHOT'
  | 'REQUEST_CREATED'
  | 'ADMIN_ACTION'

export async function logAudit(params: {
  requestId?: string | null
  actorType: 'bank' | 'company' | 'admin' | 'system'
  eventType: AuditEventType
  metadata?: Record<string, unknown>
}) {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('audit_logs').insert({
    request_id: params.requestId ?? null,
    actor_id: userData?.user?.id ?? null,
    actor_type: params.actorType,
    event_type: params.eventType,
    metadata: params.metadata ?? {},
  })
  if (error) {
    // L'audit log non deve mai bloccare il flusso applicativo, ma l'errore
    // viene comunque tracciato in console per debug.
    console.error('audit log error', error)
  }
}
