import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { RequestStatusBadge } from '../../components/StatusBadge'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { VerificationRequest, AnomalySeverity } from '../../lib/types'

const NAV = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
]

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tutte' },
  { key: 'new', label: 'Nuove' },
  { key: 'awaiting_company', label: 'In attesa cliente' },
  { key: 'in_verification', label: 'In verifica' },
  { key: 'completed', label: 'Completate' },
  { key: 'anomalies', label: 'Anomalie' },
  { key: 'expired', label: 'Scadute' },
]

type Semaforo = 'green' | 'orange' | 'red' | 'gray'

function semaforoFor(status: string, severities: AnomalySeverity[]): Semaforo {
  if (status === 'expired') return 'red'
  if (severities.includes('high_risk')) return 'red'
  if (status === 'anomalies' || severities.includes('warning') || severities.includes('unverified')) return 'orange'
  if (status === 'completed') return 'green'
  return 'gray'
}

function SemaforoDot({ value }: { value: Semaforo }) {
  const colors: Record<Semaforo, string> = {
    green: '#17c78b',
    orange: '#f2b134',
    red: '#ef5350',
    gray: '#c7c9ce',
  }
  const titles: Record<Semaforo, string> = {
    green: 'Va bene',
    orange: 'Da controllare',
    red: 'Problema rilevato',
    gray: 'In corso',
  }
  return <span title={titles[value]} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[value] }} />
}

export default function BankDashboard() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [branchNames, setBranchNames] = useState<Record<string, string>>({})
  const [requesterNames, setRequesterNames] = useState<Record<string, string>>({})
  const [severityByRequest, setSeverityByRequest] = useState<Record<string, AnomalySeverity[]>>({})
  const [progressByRequest, setProgressByRequest] = useState<Record<string, { done: number; total: number }>>({})
  const [filter, setFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const isHeadOffice = !profile?.branch_id

  useEffect(() => {
    load()
  }, [profile])

  async function load() {
    if (!profile?.bank_id) return
    setLoading(true)

    const { data } = await supabase
      .from('verification_requests')
      .select('*, companies(*)')
      .eq('bank_id', profile.bank_id)
      .order('created_at', { ascending: false })

    const reqs = (data ?? []) as VerificationRequest[]
    setRequests(reqs)

    const branchIds = Array.from(new Set(reqs.map((r) => r.branch_id).filter(Boolean))) as string[]
    const requesterIds = Array.from(new Set(reqs.map((r) => (r as unknown as { requested_by: string | null }).requested_by).filter(Boolean))) as string[]
    const requestIds = reqs.map((r) => r.id)

    const [{ data: branches }, { data: requesters }, { data: anomalies }, { data: reqSources }, { data: connectors }] = await Promise.all([
      branchIds.length ? supabase.from('bank_branches').select('id, name').in('id', branchIds) : Promise.resolve({ data: [] }),
      requesterIds.length ? supabase.from('profiles').select('id, full_name').in('id', requesterIds) : Promise.resolve({ data: [] }),
      requestIds.length ? supabase.from('anomalies').select('request_id, severity').in('request_id', requestIds) : Promise.resolve({ data: [] }),
      requestIds.length ? supabase.from('verification_request_sources').select('request_id').in('request_id', requestIds) : Promise.resolve({ data: [] }),
      requestIds.length ? supabase.from('source_connectors').select('request_id, status').in('request_id', requestIds) : Promise.resolve({ data: [] }),
    ])

    setBranchNames(Object.fromEntries((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name])))
    setRequesterNames(Object.fromEntries((requesters ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? '—'])))

    const sevMap: Record<string, AnomalySeverity[]> = {}
    for (const a of (anomalies ?? []) as { request_id: string; severity: AnomalySeverity }[]) {
      if (!sevMap[a.request_id]) sevMap[a.request_id] = []
      sevMap[a.request_id].push(a.severity)
    }
    setSeverityByRequest(sevMap)

    // Quante verifiche richieste sono gia' state completate dall'azienda (connector
    // con stato "connected") rispetto al totale richiesto per quella pratica.
    const totalMap: Record<string, number> = {}
    for (const rs of (reqSources ?? []) as { request_id: string }[]) {
      totalMap[rs.request_id] = (totalMap[rs.request_id] ?? 0) + 1
    }
    const doneMap: Record<string, number> = {}
    for (const c of (connectors ?? []) as { request_id: string; status: string }[]) {
      if (c.status === 'connected') doneMap[c.request_id] = (doneMap[c.request_id] ?? 0) + 1
    }
    const progMap: Record<string, { done: number; total: number }> = {}
    for (const reqId of requestIds) {
      progMap[reqId] = { done: doneMap[reqId] ?? 0, total: totalMap[reqId] ?? 0 }
    }
    setProgressByRequest(progMap)

    setLoading(false)
  }

  let filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)
  if (branchFilter !== 'all') {
    filtered = filtered.filter((r) => (branchFilter === 'sede' ? !r.branch_id : r.branch_id === branchFilter))
  }

  const branchOptions = Object.entries(branchNames)

  return (
    <PortalLayout nav={NAV} title="Bank Portal">
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Richieste di verifica</h1>
            <p className="text-sm text-black/50">
              {isHeadOffice ? 'Vista sede centrale — tutte le filiali' : 'Monitora lo stato delle verifiche della tua filiale'}
            </p>
          </div>
          <Link to="/bank/new-request" className="btn-verified">+ Nuova richiesta</Link>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === f.key ? 'bg-night text-white border-night' : 'bg-white text-black/60 border-black/10 hover:border-black/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isHeadOffice && branchOptions.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <span className="text-xs text-black/40 uppercase tracking-wide">Filiale:</span>
            <button
              onClick={() => setBranchFilter('all')}
              className={`px-3 py-1 rounded-full text-xs border ${branchFilter === 'all' ? 'bg-night text-white border-night' : 'bg-white text-black/60 border-black/10'}`}
            >
              Tutte
            </button>
            <button
              onClick={() => setBranchFilter('sede')}
              className={`px-3 py-1 rounded-full text-xs border ${branchFilter === 'sede' ? 'bg-night text-white border-night' : 'bg-white text-black/60 border-black/10'}`}
            >
              Sede centrale
            </button>
            {branchOptions.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setBranchFilter(id)}
                className={`px-3 py-1 rounded-full text-xs border ${branchFilter === id ? 'bg-night text-white border-night' : 'bg-white text-black/60 border-black/10'}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium"></th>
                <th className="px-5 py-3 font-medium">Azienda</th>
                <th className="px-5 py-3 font-medium">Importo</th>
                {isHeadOffice && <th className="px-5 py-3 font-medium">Filiale</th>}
                {isHeadOffice && <th className="px-5 py-3 font-medium">Incaricato</th>}
                <th className="px-5 py-3 font-medium">Completamento</th>
                <th className="px-5 py-3 font-medium">Stato</th>
                <th className="px-5 py-3 font-medium">Creata</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-black/40">Caricamento…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-black/40">Nessuna richiesta in questa categoria.</td></tr>
              )}
              {filtered.map((r) => {
                const requestedById = (r as unknown as { requested_by: string | null }).requested_by
                const sem = semaforoFor(r.status, severityByRequest[r.id] ?? [])
                const prog = progressByRequest[r.id]
                return (
                  <tr key={r.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                    <td className="px-5 py-3.5"><SemaforoDot value={sem} /></td>
                    <td className="px-5 py-3.5 font-medium">{r.companies?.legal_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-black/60">
                      {r.financing_amount ? `€${Number(r.financing_amount).toLocaleString('it-IT')}` : '—'}
                    </td>
                    {isHeadOffice && <td className="px-5 py-3.5 text-black/60">{r.branch_id ? branchNames[r.branch_id] ?? '—' : 'Sede centrale'}</td>}
                    {isHeadOffice && <td className="px-5 py-3.5 text-black/60">{requestedById ? requesterNames[requestedById] ?? '—' : '—'}</td>}
                    <td className="px-5 py-3.5 text-black/60">
                      {prog && prog.total > 0 ? (
                        <span className={prog.done === prog.total ? 'text-verified-dim font-medium' : ''}>
                          {prog.done}/{prog.total} completate
                        </span>
                      ) : (
                        <span className="text-black/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5"><RequestStatusBadge status={r.status} /></td>
                    <td className="px-5 py-3.5 text-black/50">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link to={`/bank/request/${r.id}`} className="text-sm font-medium text-night hover:underline">Apri →</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  )
}
