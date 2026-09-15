import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { RequestStatusBadge } from '../../components/StatusBadge'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import type { VerificationRequest } from '../../lib/types'

const NAV = [
  { to: '/broker/dashboard', label: 'Pratiche' },
  { to: '/broker/new-check', label: 'Nuova Pre-Verifica' },
]

export default function BrokerDashboard() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [profile])

  async function load() {
    if (!profile?.broker_id) return
    setLoading(true)
    const { data } = await supabase
      .from('verification_requests')
      .select('*, companies(*), banks(*)')
      .eq('broker_id', profile.broker_id)
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as VerificationRequest[])
    setLoading(false)
  }

  return (
    <PortalLayout nav={NAV} title="Broker Portal">
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Pratiche</h1>
            <p className="text-sm text-black/50">Pre-verifica i clienti prima di inoltrarli a una banca</p>
          </div>
          <Link to="/broker/new-check" className="btn-verified">+ Nuova pre-verifica</Link>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-left text-xs text-black/40 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Azienda</th>
                <th className="px-5 py-3 font-medium">Banca destinataria</th>
                <th className="px-5 py-3 font-medium">Stato</th>
                <th className="px-5 py-3 font-medium">Creata</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">Caricamento…</td></tr>}
              {!loading && requests.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-black/40">Nessuna pratica ancora creata.</td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                  <td className="px-5 py-3.5 font-medium">{r.companies?.legal_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-black/60">{r.banks?.name ?? 'Non ancora inoltrata'}</td>
                  <td className="px-5 py-3.5"><RequestStatusBadge status={r.status} /></td>
                  <td className="px-5 py-3.5 text-black/50">{new Date(r.created_at).toLocaleDateString('it-IT')}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link to={`/broker/request/${r.id}`} className="text-sm font-medium text-night hover:underline">Apri →</Link>
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
