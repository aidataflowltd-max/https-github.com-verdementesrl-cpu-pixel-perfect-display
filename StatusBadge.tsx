import type { VerificationLevel, ConnectorStatus, AnomalySeverity, RequestStatus } from '../lib/types'

const dot = (color: string) => <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />

export function VerificationBadge({ level }: { level: VerificationLevel }) {
  const map: Record<VerificationLevel, { label: string; color: string; bg: string }> = {
    not_configured: { label: 'NOT CONFIGURED', color: '#9aa1ac', bg: '#f1f2f4' },
    user_provided: { label: 'USER PROVIDED', color: '#f2b134', bg: '#fef6e6' },
    analyzed: { label: 'DOCUMENT ANALYZED', color: '#5b8def', bg: '#eaf0fd' },
    integrity_verified: { label: 'INTEGRITY VERIFIED', color: '#5b8def', bg: '#eaf0fd' },
    source_acquired: { label: 'SOURCE ACQUIRED', color: '#17c78b', bg: '#e7f9f2' },
    cryptographically_verified: { label: 'CRYPTOGRAPHICALLY VERIFIED', color: '#0e9c6c', bg: '#e0f7ee' },
  }
  const m = map[level]
  return (
    <span className="badge" style={{ color: m.color, background: m.bg }}>
      {dot(m.color)}
      {m.label}
    </span>
  )
}

export function ConnectorStatusBadge({ status }: { status: ConnectorStatus }) {
  const map: Record<ConnectorStatus, { label: string; color: string; bg: string }> = {
    not_configured: { label: 'NOT CONFIGURED', color: '#9aa1ac', bg: '#f1f2f4' },
    connected: { label: 'CONNECTED', color: '#17c78b', bg: '#e7f9f2' },
    error: { label: 'ERROR', color: '#ef5350', bg: '#fdeceb' },
    testing: { label: 'TESTING', color: '#f2b134', bg: '#fef6e6' },
  }
  const m = map[status]
  return (
    <span className="badge" style={{ color: m.color, background: m.bg }}>
      {dot(m.color)}
      {m.label}
    </span>
  )
}

export function AnomalyBadge({ severity }: { severity: AnomalySeverity }) {
  const map: Record<AnomalySeverity, { label: string; color: string; bg: string; icon: string }> = {
    information: { label: 'INFORMATION', color: '#5b8def', bg: '#eaf0fd', icon: '🔵' },
    warning: { label: 'WARNING', color: '#f2b134', bg: '#fef6e6', icon: '🟡' },
    high_risk: { label: 'HIGH RISK', color: '#ef5350', bg: '#fdeceb', icon: '🔴' },
    unverified: { label: 'UNVERIFIED', color: '#9aa1ac', bg: '#f1f2f4', icon: '⚪' },
  }
  const m = map[severity]
  return (
    <span className="badge" style={{ color: m.color, background: m.bg }}>
      {dot(m.color)}
      {m.label}
    </span>
  )
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const map: Record<RequestStatus, { label: string; color: string; bg: string }> = {
    new: { label: 'Nuova', color: '#5b8def', bg: '#eaf0fd' },
    awaiting_company: { label: 'In attesa cliente', color: '#f2b134', bg: '#fef6e6' },
    in_verification: { label: 'In verifica', color: '#5b8def', bg: '#eaf0fd' },
    completed: { label: 'Completata', color: '#17c78b', bg: '#e7f9f2' },
    anomalies: { label: 'Anomalie', color: '#ef5350', bg: '#fdeceb' },
    expired: { label: 'Scaduta', color: '#9aa1ac', bg: '#f1f2f4' },
  }
  const m = map[status]
  return (
    <span className="badge" style={{ color: m.color, background: m.bg }}>
      {dot(m.color)}
      {m.label}
    </span>
  )
}
