import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { RequestStatusBadge } from '../../components/StatusBadge'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { VerificationRequest } from '../../lib/types'

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

export default function BankDashboard() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

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
    setRequests((data ?? []) as VerificationRequest[])
    setLoading(false)
  }

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  return (
    <PortalLayout nav={NAV} title="Bank Portal">
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Richieste di verifica</h1>
            <p className="text-sm text-black/50">Monitora lo stato delle verifiche in corso</p>
          </div>
          <Link to="/bank/new-request" className="btn-verified">+ Nuova richiesta</Link>
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
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

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Azienda</th>
                <th className="px-5 py-3 font-medium">Importo</th>
                <th className="px-5 py-3 font-medium">Stato</th>
                <th className="px-5 py-3 font-medium">Creata</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">Caricamento…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">Nessuna richiesta in questa categoria.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                  <td className="px-5 py-3.5 font-medium">{r.companies?.legal_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-black/60">
                    {r.financing_amount ? `€${Number(r.financing_amount).toLocaleString('it-IT')}` : '—'}
                  </td>
                  <td className="px-5 py-3.5"><RequestStatusBadge status={r.status} /></td>
                  <td className="px-5 py-3.5 text-black/50">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link to={`/bank/request/${r.id}`} className="text-sm font-medium text-night hover:underline">Apri →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  )
}
