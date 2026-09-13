import { useEffect, useState } from 'react'
import { PortalLayout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { ConnectorStatusBadge, RequestStatusBadge } from '../../components/StatusBadge'
import type { Bank, Company, Source, VerificationRequest, ConnectorType } from '../../lib/types'

const NAV = [
  { to: '/super-admin', label: 'Users' },
  { to: '/super-admin/banks', label: 'Banks' },
  { to: '/super-admin/companies', label: 'Companies' },
  { to: '/super-admin/sources', label: 'Sources' },
  { to: '/super-admin/requests', label: 'Requests' },
  { to: '/super-admin/audit', label: 'Audit Log' },
]

const TABS = ['Users', 'Banks', 'Companies', 'Sources', 'Requests', 'Audit Log'] as const

export default function SuperAdmin() {
  const path = window.location.pathname
  const initial = path.includes('banks') ? 'Banks' : path.includes('companies') ? 'Companies' : path.includes('sources') ? 'Sources' : path.includes('requests') ? 'Requests' : path.includes('audit') ? 'Audit Log' : 'Users'
  const [tab, setTab] = useState<(typeof TABS)[number]>(initial)

  return (
    <PortalLayout nav={NAV} title="Super Admin">
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex gap-1 mb-6 border-b border-black/[0.06]">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t ? 'border-night text-night' : 'border-transparent text-black/40 hover:text-black/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'Users' && <UsersTab />}
        {tab === 'Banks' && <BanksTab />}
        {tab === 'Companies' && <CompaniesTab />}
        {tab === 'Sources' && <SourcesTab />}
        {tab === 'Requests' && <RequestsTab />}
        {tab === 'Audit Log' && <AuditTab />}
      </div>
    </PortalLayout>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<{ id: string; email: string; created_at: string }[]>([])
  const [profiles, setProfiles] = useState<{ id: string; role: string; bank_id: string | null; company_id: string | null }[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [{ data: u }, { data: p }, { data: b }, { data: c }] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('profiles').select('id, role, bank_id, company_id'),
      supabase.from('banks').select('*'),
      supabase.from('companies').select('*'),
    ])
    setUsers(u ?? [])
    setProfiles(p ?? [])
    setBanks(b ?? [])
    setCompanies(c ?? [])
  }

  async function assign(userId: string, role: string, bankId: string, companyId: string, fullName: string) {
    setSaving(userId)
    await supabase.rpc('admin_assign_profile', {
      target_user_id: userId,
      new_role: role,
      new_bank_id: bankId || null,
      new_company_id: companyId || null,
      new_full_name: fullName,
    })
    setSaving(null)
    load()
  }

  return (
    <div>
      <p className="text-sm text-black/50 mb-4">
        Gli account vengono creati invitando l'email dalla Dashboard Supabase (Authentication → Users → Invite user).
        Da qui assegni ruolo e organizzazione di appartenenza.
      </p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Ruolo</th>
              <th className="px-5 py-3">Banca</th>
              <th className="px-5 py-3">Azienda</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const p = profiles.find((pr) => pr.id === u.id)
              return (
                <UserRow
                  key={u.id}
                  email={u.email}
                  userId={u.id}
                  currentRole={p?.role ?? 'bank_user'}
                  currentBank={p?.bank_id ?? ''}
                  currentCompany={p?.company_id ?? ''}
                  banks={banks}
                  companies={companies}
                  saving={saving === u.id}
                  onSave={assign}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserRow({
  email, userId, currentRole, currentBank, currentCompany, banks, companies, saving, onSave,
}: {
  email: string; userId: string; currentRole: string; currentBank: string; currentCompany: string
  banks: Bank[]; companies: Company[]; saving: boolean
  onSave: (id: string, role: string, bank: string, company: string, name: string) => void
}) {
  const [role, setRole] = useState(currentRole)
  const [bank, setBank] = useState(currentBank)
  const [company, setCompany] = useState(currentCompany)

  return (
    <tr className="border-b border-black/[0.04] last:border-0">
      <td className="px-5 py-3 font-medium">{email}</td>
      <td className="px-5 py-3">
        <select className="input py-1.5" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="super_admin">super_admin</option>
          <option value="bank_admin">bank_admin</option>
          <option value="bank_user">bank_user</option>
          <option value="company_contact">company_contact</option>
        </select>
      </td>
      <td className="px-5 py-3">
        <select className="input py-1.5" value={bank} onChange={(e) => setBank(e.target.value)}>
          <option value="">—</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </td>
      <td className="px-5 py-3">
        <select className="input py-1.5" value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">—</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select>
      </td>
      <td className="px-5 py-3 text-right">
        <button className="btn-ghost py-1.5" disabled={saving} onClick={() => onSave(userId, role, bank, company, email)}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </td>
    </tr>
  )
}

function BanksTab() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [name, setName] = useState('')
  const [vat, setVat] = useState('')

  useEffect(() => {
    load()
  }, [])
  async function load() {
    const { data } = await supabase.from('banks').select('*').order('created_at', { ascending: false })
    setBanks(data ?? [])
  }
  async function create(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('banks').insert({ name, vat_number: vat })
    setName('')
    setVat('')
    load()
  }
  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card p-5 flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Nome banca</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="label">P.IVA</label>
          <input className="input" value={vat} onChange={(e) => setVat(e.target.value)} />
        </div>
        <button className="btn-primary">Crea banca</button>
      </form>
      <div className="card divide-y divide-black/[0.04]">
        {banks.map((b) => (
          <div key={b.id} className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="font-medium">{b.name}</span>
            <span className="text-black/40">{b.vat_number}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([])
  useEffect(() => {
    supabase.from('companies').select('*').order('created_at', { ascending: false }).then(({ data }) => setCompanies(data ?? []))
  }, [])
  return (
    <div className="card divide-y divide-black/[0.04]">
      {companies.length === 0 && <div className="px-5 py-8 text-center text-sm text-black/40">Nessuna azienda registrata.</div>}
      {companies.map((c) => (
        <div key={c.id} className="px-5 py-3 flex items-center justify-between text-sm">
          <span className="font-medium">{c.legal_name}</span>
          <span className="text-black/40 font-mono text-xs">{c.vat_number}</span>
        </div>
      ))}
    </div>
  )
}

const CONNECTOR_TYPES: ConnectorType[] = ['banking', 'tax', 'credit', 'corporate', 'document']

function SourcesTab() {
  const [sources, setSources] = useState<Source[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<ConnectorType>('banking')

  useEffect(() => {
    load()
  }, [])
  async function load() {
    const { data } = await supabase.from('sources').select('*').order('connector_type')
    setSources((data ?? []) as Source[])
  }
  async function create(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('sources').insert({ name, connector_type: type, status: 'not_configured' })
    setName('')
    load()
  }
  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card p-5 flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Nome fonte / provider</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="es. CRIF, Cerved, Camera di Commercio…" />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ConnectorType)}>
            {CONNECTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className="btn-primary">Aggiungi connector</button>
      </form>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Stato</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-black/[0.04] last:border-0">
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="px-5 py-3 text-black/60">{s.connector_type}</td>
                <td className="px-5 py-3"><ConnectorStatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-black/40">
        Ogni nuovo connector nasce come NOT CONFIGURED: diventa CONNECTED solo collegando davvero le credenziali/API
        del provider (mai in chiaro nel database — usa un secret manager esterno e salva qui solo il riferimento).
      </p>
    </div>
  )
}

function RequestsTab() {
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  useEffect(() => {
    supabase.from('verification_requests').select('*, companies(*), banks(*)').order('created_at', { ascending: false }).then(({ data }) => setRequests((data ?? []) as VerificationRequest[]))
  }, [])
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
            <th className="px-5 py-3">Azienda</th>
            <th className="px-5 py-3">Banca</th>
            <th className="px-5 py-3">Stato</th>
            <th className="px-5 py-3">Creata</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
              <td className="px-5 py-3 font-medium">{r.companies?.legal_name}</td>
              <td className="px-5 py-3 text-black/60">{r.banks?.name}</td>
              <td className="px-5 py-3"><RequestStatusBadge status={r.status} /></td>
              <td className="px-5 py-3 text-black/50">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AuditTab() {
  const [logs, setLogs] = useState<{ id: string; event_type: string; actor_type: string | null; created_at: string; metadata: unknown }[]>([])
  useEffect(() => {
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200).then(({ data }) => setLogs(data ?? []))
  }, [])
  return (
    <div className="card divide-y divide-black/[0.04] max-h-[70vh] overflow-y-auto">
      {logs.map((l) => (
        <div key={l.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
          <span className="font-mono text-xs">{l.event_type}</span>
          <span className="text-black/40 text-xs">{l.actor_type ?? '—'} · {new Date(l.created_at).toLocaleString('it-IT')}</span>
        </div>
      ))}
    </div>
  )
}
