import { useEffect, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { RequestStatusBadge, VerificationBadge } from '../../components/StatusBadge'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { Company, VerificationRequest, DataProvenance, DocumentRow, Anomaly } from '../../lib/types'

const BANK_NAV_BASE = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
]
const BANK_NAV_ADMIN = [...BANK_NAV_BASE, { to: '/bank/team', label: 'Team' }]

const BROKER_NAV = [
  { to: '/broker/dashboard', label: 'Pratiche' },
  { to: '/broker/new-check', label: 'Nuova Pre-Verifica' },
]

const FIELD_LABELS: Record<string, string> = {
  fatturato: 'Fatturato',
  ebitda: 'EBITDA',
  utile_netto: 'Utile netto',
  patrimonio_netto: 'Patrimonio netto',
  debiti_bancari: 'Debiti bancari',
  liquidita: 'Liquidità disponibile',
  iva_a_debito: 'IVA a debito',
}

type ProvRow = DataProvenance & { sources?: { name: string } | { name: string }[] }

export default function CompanyProfile() {
  const { companyId } = useParams()
  const location = useLocation()
  const isBroker = location.pathname.startsWith('/broker')
  const { profile } = useAuth()
  const NAV = isBroker ? BROKER_NAV : (profile?.role === 'bank_admin' ? BANK_NAV_ADMIN : BANK_NAV_BASE)
  const PORTAL_TITLE = isBroker ? 'Broker Portal' : 'Bank Portal'

  const [company, setCompany] = useState<Company | null>(null)
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [provenance, setProvenance] = useState<ProvRow[]>([])
  const [documents, setDocuments] = useState<(DocumentRow & { requestId: string })[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (companyId) load()
  }, [companyId])

  async function load() {
    if (!companyId) return
    setLoading(true)

    const { data: comp } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    setCompany(comp as Company | null)

    const { data: reqs } = await supabase
      .from('verification_requests')
      .select('*, companies(*), banks(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    const reqList = (reqs ?? []) as VerificationRequest[]
    setRequests(reqList)

    const requestIds = reqList.map((r) => r.id)
    if (requestIds.length > 0) {
      const [{ data: prov }, { data: docs }, { data: anom }] = await Promise.all([
        supabase.from('data_provenance').select('*, sources(name)').in('request_id', requestIds).order('acquired_at', { ascending: false }),
        supabase.from('documents').select('*').in('request_id', requestIds).order('created_at', { ascending: false }),
        supabase.from('anomalies').select('*').in('request_id', requestIds).order('created_at', { ascending: false }),
      ])
      setProvenance((prov ?? []) as ProvRow[])
      setDocuments(((docs ?? []) as DocumentRow[]).map((d) => ({ ...d, requestId: d.request_id })))
      setAnomalies((anom ?? []) as Anomaly[])
    } else {
      setProvenance([])
      setDocuments([])
      setAnomalies([])
    }
    setLoading(false)
  }

  const totalRequested = requests.reduce((sum, r) => sum + (r.financing_amount ?? 0), 0)
  const activeCount = requests.filter((r) => !['completed', 'expired'].includes(r.status)).length
  const openAnomalies = anomalies.filter((a) => !a.resolved)
  const exposures = provenance.filter((p) => p.field_name === 'debiti_bancari')

  const requestPathPrefix = isBroker ? '/broker/request' : '/bank/request'

  function requestLabel(requestId: string) {
    const r = requests.find((x) => x.id === requestId)
    if (!r) return '—'
    return new Date(r.created_at).toLocaleDateString('it-IT')
  }

  if (loading) {
    return (
      <PortalLayout nav={NAV} title={PORTAL_TITLE}>
        <div className="px-8 py-8 text-black/40 text-sm">Caricamento…</div>
      </PortalLayout>
    )
  }

  if (!company) {
    return (
      <PortalLayout nav={NAV} title={PORTAL_TITLE}>
        <div className="px-8 py-8 text-black/40 text-sm">Azienda non trovata o nessuna pratica visibile per te su questa azienda.</div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout nav={NAV} title={PORTAL_TITLE}>
      <div className="px-8 py-8 max-w-5xl">
        <div className="text-xs text-black/40 uppercase tracking-wide mb-1">Scheda azienda</div>
        <h1 className="text-2xl font-semibold">{company.legal_name}</h1>
        <div className="text-sm text-black/50 mt-1">P.IVA {company.vat_number}</div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          <StatCard label="Pratiche totali" value={String(requests.length)} />
          <StatCard label="Pratiche attive" value={String(activeCount)} />
          <StatCard label="Totale richiesto" value={`€${totalRequested.toLocaleString('it-IT')}`} />
          <StatCard label="Anomalie aperte" value={String(openAnomalies.length)} highlight={openAnomalies.length > 0} />
        </div>

        <p className="text-xs text-black/40 mt-3">
          Questa scheda mostra solo le pratiche a cui {isBroker ? 'tu, come broker,' : 'la tua banca'} hai accesso. Se un'altra banca ha aperto una richiesta separata su questa stessa azienda, non compare qui: nessuna banca vede le pratiche riservate di un'altra.
        </p>

        <div className="card p-6 mt-6">
          <div className="label mb-3">Esposizioni finanziarie dichiarate</div>
          {exposures.length === 0 ? (
            <p className="text-sm text-black/40">Nessun debito bancario dichiarato finora in nessuna pratica.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                    <th className="py-2">Valore</th>
                    <th className="py-2">Fonte</th>
                    <th className="py-2">Pratica del</th>
                    <th className="py-2">Livello verifica</th>
                  </tr>
                </thead>
                <tbody>
                  {exposures.map((p) => {
                    const sourceName = Array.isArray(p.sources) ? p.sources[0]?.name : p.sources?.name
                    return (
                      <tr key={p.id} className="border-b border-black/[0.04] last:border-0">
                        <td className="py-2.5 font-medium">{p.field_value ? `€${Number(p.field_value).toLocaleString('it-IT')}` : '—'}</td>
                        <td className="py-2.5 text-black/50">{sourceName ?? '—'}</td>
                        <td className="py-2.5 text-black/50">
                          <Link className="hover:underline text-night" to={`${requestPathPrefix}/${p.request_id}`}>{requestLabel(p.request_id)}</Link>
                        </td>
                        <td className="py-2.5"><VerificationBadge level={p.verification_level} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-6 mt-6">
          <div className="label mb-3">Storico pratiche</div>
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                  <th className="py-2">Data</th>
                  <th className="py-2">Prodotto</th>
                  <th className="py-2">Importo</th>
                  <th className="py-2">Stato</th>
                  <th className="py-2">Livello</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="py-2.5 text-black/50">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
                    <td className="py-2.5 capitalize">{r.financing_type?.replaceAll('_', ' ') ?? '—'}</td>
                    <td className="py-2.5 text-black/60">{r.financing_amount ? `€${Number(r.financing_amount).toLocaleString('it-IT')}` : '—'}</td>
                    <td className="py-2.5"><RequestStatusBadge status={r.status} /></td>
                    <td className="py-2.5 text-black/50">{r.verification_tier != null ? `Livello ${r.verification_tier}` : '—'}</td>
                    <td className="py-2.5 text-right">
                      <Link className="text-sm font-medium text-night hover:underline" to={`${requestPathPrefix}/${r.id}`}>Apri →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6 mt-6">
          <div className="label mb-3">Tutti i dati raccolti (tutte le pratiche)</div>
          {provenance.length === 0 ? (
            <p className="text-sm text-black/40">Nessun dato dichiarato o acquisito ancora.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                    <th className="py-2">Voce</th>
                    <th className="py-2">Valore</th>
                    <th className="py-2">Fonte</th>
                    <th className="py-2">Pratica del</th>
                    <th className="py-2">Livello verifica</th>
                  </tr>
                </thead>
                <tbody>
                  {provenance.map((p) => {
                    const sourceName = Array.isArray(p.sources) ? p.sources[0]?.name : p.sources?.name
                    return (
                      <tr key={p.id} className="border-b border-black/[0.04] last:border-0">
                        <td className="py-2.5 font-medium">{FIELD_LABELS[p.field_name] ?? p.field_name}</td>
                        <td className="py-2.5 text-black/70">{p.field_value ? `€${Number(p.field_value).toLocaleString('it-IT')}` : p.field_value ?? '—'}</td>
                        <td className="py-2.5 text-black/50">{sourceName ?? '—'}</td>
                        <td className="py-2.5 text-black/50">
                          <Link className="hover:underline text-night" to={`${requestPathPrefix}/${p.request_id}`}>{requestLabel(p.request_id)}</Link>
                        </td>
                        <td className="py-2.5"><VerificationBadge level={p.verification_level} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-6 mt-6">
          <div className="label mb-3">Documenti (tutte le pratiche)</div>
          {documents.length === 0 ? (
            <p className="text-sm text-black/40">Nessun documento caricato in nessuna pratica.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase">
                    <th className="py-2">File</th>
                    <th className="py-2">Classificazione</th>
                    <th className="py-2">Pratica del</th>
                    <th className="py-2">Caricato</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-2.5 font-medium">{d.filename}</td>
                      <td className="py-2.5"><VerificationBadge level={d.classification as 'user_provided'} /></td>
                      <td className="py-2.5 text-black/50">
                        <Link className="hover:underline text-night" to={`${requestPathPrefix}/${d.requestId}`}>{requestLabel(d.requestId)}</Link>
                      </td>
                      <td className="py-2.5 text-black/50">{new Date(d.created_at).toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-semibold ${highlight ? 'text-risk' : ''}`}>{value}</div>
      <div className="text-xs text-black/40 mt-1">{label}</div>
    </div>
  )
}
