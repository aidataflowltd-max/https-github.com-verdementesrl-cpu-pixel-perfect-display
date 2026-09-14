import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { RequestStatusBadge, VerificationBadge, ConnectorStatusBadge, AnomalyBadge } from '../../components/StatusBadge'
import { supabase } from '../../lib/supabase'
import { computeTrustScore } from '../../lib/trustScore'
import { logAudit } from '../../lib/audit'
import type {
  VerificationRequest,
  SourceConnector,
  DocumentRow,
  DataProvenance,
  CrossSourceCheck,
  Anomaly,
  Snapshot,
} from '../../lib/types'

const BANK_NAV = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
]

const BROKER_NAV = [
  { to: '/broker/dashboard', label: 'Pratiche' },
  { to: '/broker/new-check', label: 'Nuova Pre-Verifica' },
]

const TABS = ['Snapshot', 'Fonti', 'Documenti', 'Cross-check', 'Anomalie', 'Audit'] as const

export default function RequestDetail() {
  const { id } = useParams()
  const location = useLocation()
  const isBroker = location.pathname.startsWith('/broker')
  const NAV = isBroker ? BROKER_NAV : BANK_NAV
  const PORTAL_TITLE = isBroker ? 'Broker Portal' : 'Bank Portal'
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [request, setRequest] = useState<VerificationRequest | null>(null)
  const [connectors, setConnectors] = useState<SourceConnector[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [provenance, setProvenance] = useState<DataProvenance[]>([])
  const [checks, setChecks] = useState<CrossSourceCheck[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Snapshot')
  const [provenanceOpen, setProvenanceOpen] = useState<DataProvenance | null>(null)

  useEffect(() => {
    if (id) load()
  }, [id])

  async function load() {
    if (!id) return
    const [{ data: req }, { data: conn }, { data: docs }, { data: prov }, { data: chks }, { data: anom }, { data: snap }] = await Promise.all([
      supabase.from('verification_requests').select('*, companies(*), banks(*)').eq('id', id).single(),
      supabase.from('source_connectors').select('*, sources(*)').eq('request_id', id),
      supabase.from('documents').select('*').eq('request_id', id),
      supabase.from('data_provenance').select('*').eq('request_id', id),
      supabase.from('cross_source_checks').select('*').eq('request_id', id),
      supabase.from('anomalies').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      supabase.from('snapshots').select('*').eq('request_id', id).order('version', { ascending: false }).limit(1).maybeSingle(),
    ])
    setRequest(req as VerificationRequest)
    setConnectors((conn ?? []) as SourceConnector[])
    setDocuments((docs ?? []) as DocumentRow[])
    setProvenance((prov ?? []) as DataProvenance[])
    setChecks((chks ?? []) as CrossSourceCheck[])
    setAnomalies((anom ?? []) as Anomaly[])
    setSnapshot(snap as Snapshot | null)
    if (snap) await logAudit({ requestId: id, actorType: isBroker ? 'admin' : 'bank', eventType: 'BANK_VIEWED_SNAPSHOT' })

    if (isBroker) {
      const { data: bankList } = await supabase.from('banks').select('id, name').order('name')
      setBanks(bankList ?? [])
    }
  }

  async function forwardToBank() {
    if (!request || !selectedBankId) return
    setForwarding(true)
    const { error } = await supabase.rpc('broker_forward_to_bank', { p_request_id: request.id, p_bank_id: selectedBankId })
    setForwarding(false)
    if (!error) {
      await logAudit({ requestId: request.id, actorType: 'admin', eventType: 'REQUEST_CREATED', metadata: { forwardedToBankId: selectedBankId } })
      load()
    }
  }

  async function generateSnapshot() {
    if (!request) return
    const { score, breakdown } = computeTrustScore({ connectors, documents, checks })
    const verified = connectors.filter((c) => ['source_acquired', 'cryptographically_verified'].includes(c.verification_level)).length
    const userProvided = documents.length

    const datasetPayload = JSON.stringify({ connectors, provenance, checks, generatedAt: new Date().toISOString() })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datasetPayload))
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')

    const code = `VS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 900000) + 100000)}`

    const { data: newSnapshot, error } = await supabase
      .from('snapshots')
      .insert({
        snapshot_code: code,
        request_id: request.id,
        company_id: request.company_id,
        version: (snapshot?.version ?? 0) + 1,
        previous_snapshot_id: snapshot?.id ?? null,
        dataset_hash: hash,
        data_trust_score: score,
        trust_breakdown: breakdown,
        sources_total: connectors.length,
        sources_verified: verified,
        sources_user_provided: userProvided,
        anomalies_count: anomalies.length,
        locked: true,
        locked_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (!error && newSnapshot) {
      if (request.status !== 'preliminary') {
        await supabase.from('verification_requests').update({ status: anomalies.length > 0 ? 'anomalies' : 'completed' }).eq('id', request.id)
      }
      await logAudit({ requestId: request.id, actorType: 'bank', eventType: 'SNAPSHOT_CREATED', metadata: { code } })
      await logAudit({ requestId: request.id, actorType: 'bank', eventType: 'SNAPSHOT_LOCKED', metadata: { code } })
      setSnapshot(newSnapshot as Snapshot)
      load()
    }
  }

  if (!request) {
    return (
      <PortalLayout nav={NAV} title={PORTAL_TITLE}>
        <div className="px-8 py-8 text-black/40 text-sm">Caricamento…</div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout nav={NAV} title={PORTAL_TITLE}>
      <div className="px-8 py-8 max-w-5xl">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-xs text-black/40 uppercase tracking-wide mb-1">Richiesta di verifica</div>
            <h1 className="text-2xl font-semibold">{request.companies?.legal_name}</h1>
            <div className="text-sm text-black/50 mt-1">P.IVA {request.companies?.vat_number}</div>
          </div>
          <RequestStatusBadge status={request.status} />
        </div>

        {request.financing_amount != null && (
          <div className="text-sm text-black/50 mb-1">
            {request.financing_type && <span className="capitalize">{request.financing_type.replaceAll('_', ' ')}</span>}
            {request.financing_amount != null && <span> · €{Number(request.financing_amount).toLocaleString('it-IT')}</span>}
            {request.financing_purpose && <span> · {request.financing_purpose}</span>}
          </div>
        )}

        {request.preliminary_check_score != null && (
          <div className="card p-5 mt-4 border-black/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <div className="label mb-0">Controllo preliminare automatico</div>
              <span className="badge bg-verified/10 text-verified-dim">{request.preliminary_check_score}/100</span>
            </div>
            <p className="text-xs text-black/50 leading-relaxed">{request.preliminary_check_notes}</p>
          </div>
        )}

        <div className="flex gap-1 mt-6 mb-6 border-b border-black/[0.06]">
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

        {tab === 'Snapshot' && (
          <div>
            {!snapshot ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-black/50 mb-4">Nessuno snapshot ancora generato per questa richiesta.</p>
                <button className="btn-verified" onClick={generateSnapshot}>Genera Verified Company Snapshot</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs text-black/40 uppercase tracking-wide">Verified Company Snapshot</div>
                      <div className="font-mono text-sm text-black/60">{snapshot.snapshot_code} · v{snapshot.version}</div>
                    </div>
                    <span className="badge bg-verified/10 text-verified-dim">{snapshot.locked ? '🔒 READ ONLY' : 'IN CORSO'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <Stat label="Data Trust" value={`${snapshot.data_trust_score ?? 0}/100`} />
                    <Stat label="Fonti totali" value={String(snapshot.sources_total)} />
                    <Stat label="Fonti verificate" value={String(snapshot.sources_verified)} />
                    <Stat label="Anomalie" value={String(snapshot.anomalies_count)} />
                  </div>
                </div>

                {snapshot.trust_breakdown && (
                  <div className="card p-6">
                    <div className="label mb-3">Data Trust — componenti</div>
                    <div className="space-y-2">
                      {Object.entries(snapshot.trust_breakdown).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-3">
                          <div className="w-52 text-sm text-black/60 capitalize">{k.replaceAll('_', ' ')}</div>
                          <div className="flex-1 h-2 bg-paper-dim rounded-full overflow-hidden">
                            <div className="h-full bg-verified" style={{ width: `${v}%` }} />
                          </div>
                          <div className="w-10 text-sm text-right">{v}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="label mb-0">Hash dataset (SHA-256)</div>
                  </div>
                  <div className="font-mono text-xs break-all text-black/50">{snapshot.dataset_hash}</div>
                </div>

                {isBroker && request.status === 'preliminary' && (
                  <div className="card p-6 border-verified/30">
                    <div className="label mb-3">Inoltra a banca</div>
                    <p className="text-sm text-black/50 mb-4">
                      In base al Data Trust Score sopra, scegli se e a quale banca inoltrare questa pratica.
                      Una volta inoltrata, la banca la vedrà nella propria dashboard.
                    </p>
                    <div className="flex gap-3">
                      <select className="input" value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)}>
                        <option value="">Seleziona banca…</option>
                        {banks.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <button className="btn-verified whitespace-nowrap" disabled={!selectedBankId || forwarding} onClick={forwardToBank}>
                        {forwarding ? 'Inoltro…' : 'Inoltra pratica'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'Fonti' && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                  <th className="px-5 py-3">Fonte</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Stato connector</th>
                  <th className="px-5 py-3">Livello verifica</th>
                  <th className="px-5 py-3">Acquisito</th>
                </tr>
              </thead>
              <tbody>
                {connectors.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">Nessuna fonte collegata.</td></tr>
                )}
                {connectors.map((c) => (
                  <tr key={c.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="px-5 py-3.5 font-medium">{c.sources?.name}</td>
                    <td className="px-5 py-3.5 text-black/60">{c.sources?.connector_type}</td>
                    <td className="px-5 py-3.5"><ConnectorStatusBadge status={c.status} /></td>
                    <td className="px-5 py-3.5"><VerificationBadge level={c.verification_level} /></td>
                    <td className="px-5 py-3.5 text-black/50">{c.acquired_at ? new Date(c.acquired_at).toLocaleString('it-IT') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Documenti' && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Classificazione</th>
                  <th className="px-5 py-3">Dimensione</th>
                  <th className="px-5 py-3">Caricato</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-black/40">Nessun documento caricato.</td></tr>
                )}
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="px-5 py-3.5 font-medium">{d.filename}</td>
                    <td className="px-5 py-3.5"><VerificationBadge level={d.classification as 'user_provided'} /></td>
                    <td className="px-5 py-3.5 text-black/50">{d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : '—'}</td>
                    <td className="px-5 py-3.5 text-black/50">{new Date(d.created_at).toLocaleString('it-IT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Cross-check' && (
          <div className="space-y-3">
            {checks.length === 0 && <div className="card p-8 text-center text-sm text-black/40">Nessun confronto ancora eseguito.</div>}
            {checks.map((c) => (
              <div key={c.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{c.source_a} ↔ {c.source_b}</div>
                  <div className="text-xs text-black/50">{c.field_name}</div>
                </div>
                <div className="text-right">
                  <span className={`badge ${c.result === 'consistent' ? 'bg-verified/10 text-verified-dim' : c.result === 'discrepancy' ? 'bg-risk/10 text-risk' : 'bg-black/5 text-black/40'}`}>
                    {c.result === 'consistent' ? '🟢 Coerente' : c.result === 'discrepancy' ? `🟡 Differenza ${c.difference_pct}%` : '⚪ Dati insufficienti'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Anomalie' && (
          <div className="space-y-3">
            {anomalies.length === 0 && <div className="card p-8 text-center text-sm text-black/40">Nessuna anomalia rilevata.</div>}
            {anomalies.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium text-sm">{a.title}</div>
                  <AnomalyBadge severity={a.severity} />
                </div>
                {a.description && <div className="text-xs text-black/50">{a.description}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === 'Audit' && <AuditTab requestId={request.id} />}
      </div>

      {provenanceOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-end z-50" onClick={() => setProvenanceOpen(null)}>
          <div className="bg-white h-full w-96 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">Provenienza dato</h2>
            <div className="text-sm text-black/60">{provenanceOpen.field_name}</div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-black/40 mt-1">{label}</div>
    </div>
  )
}

function AuditTab({ requestId }: { requestId: string }) {
  const [logs, setLogs] = useState<{ id: string; event_type: string; created_at: string; actor_type: string | null }[]>([])
  useEffect(() => {
    supabase
      .from('audit_logs')
      .select('id, event_type, created_at, actor_type')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setLogs(data ?? []))
  }, [requestId])
  return (
    <div className="card divide-y divide-black/[0.04]">
      {logs.length === 0 && <div className="px-5 py-8 text-center text-sm text-black/40">Nessun evento registrato.</div>}
      {logs.map((l) => (
        <div key={l.id} className="px-5 py-3 flex items-center justify-between text-sm">
          <span className="font-mono text-xs">{l.event_type}</span>
          <span className="text-black/40 text-xs">{l.actor_type} · {new Date(l.created_at).toLocaleString('it-IT')}</span>
        </div>
      ))}
    </div>
  )
}
