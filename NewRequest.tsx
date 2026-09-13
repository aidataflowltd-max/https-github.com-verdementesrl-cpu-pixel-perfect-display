import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { logAudit } from '../../lib/audit'
import type { ConnectorType } from '../../lib/types'

const NAV = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
]

const SOURCE_OPTIONS: { type: ConnectorType; label: string; hint: string }[] = [
  { type: 'banking', label: 'Conti bancari (Open Banking / AISP)', hint: 'Acquisizione via provider AISP autorizzato' },
  { type: 'tax', label: 'Dati fiscali (Agenzia Entrate, F24, fatture)', hint: 'Delega/autenticazione diretta con la fonte' },
  { type: 'credit', label: 'Centrale Rischi / Credit Bureau', hint: 'CRIF, Cerved o altro provider configurato' },
  { type: 'corporate', label: 'Camera di Commercio / Bilanci', hint: 'Visure e bilanci da Registro Imprese' },
  { type: 'document', label: 'Documenti caricati dall’utente', hint: 'Classificati sempre come USER PROVIDED' },
]

export default function NewRequest() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [legalName, setLegalName] = useState('')
  const [vat, setVat] = useState('')
  const [amount, setAmount] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [selected, setSelected] = useState<ConnectorType[]>(['banking', 'tax', 'corporate'])
  const [submitting, setSubmitting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggle(type: ConnectorType) {
    setSelected((s) => (s.includes(type) ? s.filter((t) => t !== type) : [...s, type]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.bank_id) return
    setSubmitting(true)
    setError(null)

    // upsert azienda per partita IVA
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('vat_number', vat)
      .maybeSingle()

    let companyId = existingCompany?.id as string | undefined
    if (!companyId) {
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({ legal_name: legalName, vat_number: vat })
        .select('id')
        .single()
      if (companyError) {
        setError(companyError.message)
        setSubmitting(false)
        return
      }
      companyId = newCompany.id
    }

    const { data: request, error: requestError } = await supabase
      .from('verification_requests')
      .insert({
        bank_id: profile.bank_id,
        company_id: companyId,
        requested_by: profile.id,
        financing_amount: amount ? Number(amount) : null,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        status: 'awaiting_company',
      })
      .select('*')
      .single()

    if (requestError || !request) {
      setError(requestError?.message ?? 'Errore nella creazione della richiesta')
      setSubmitting(false)
      return
    }

    await supabase.from('verification_request_sources').insert(
      selected.map((type) => ({ request_id: request.id, connector_type: type }))
    )

    await logAudit({
      requestId: request.id,
      actorType: 'bank',
      eventType: 'REQUEST_CREATED',
      metadata: { legalName, vat, sources: selected },
    })

    const link = `${window.location.origin}/request/${request.invite_token}`
    setInviteLink(link)
    setSubmitting(false)
  }

  if (inviteLink) {
    return (
      <PortalLayout nav={NAV} title="Bank Portal">
        <div className="px-8 py-8 max-w-xl">
          <div className="card p-8 text-center">
            <div className="h-10 w-10 rounded-full bg-verified/10 text-verified flex items-center justify-center mx-auto mb-4">✓</div>
            <h1 className="text-lg font-semibold mb-1">Richiesta creata</h1>
            <p className="text-sm text-black/50 mb-6">Invia questo link sicuro all’impresa per avviare la verifica.</p>
            <div className="bg-paper-dim rounded-lg px-4 py-3 text-sm font-mono break-all text-left mb-4">{inviteLink}</div>
            <div className="flex gap-3 justify-center">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(inviteLink)}>Copia link</button>
              <button className="btn-primary" onClick={() => navigate('/bank/dashboard')}>Vai alla dashboard</button>
            </div>
          </div>
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout nav={NAV} title="Bank Portal">
      <div className="px-8 py-8 max-w-2xl">
        <h1 className="text-xl font-semibold mb-1">Nuova richiesta di verifica</h1>
        <p className="text-sm text-black/50 mb-6">Compila i dati dell’impresa e scegli quali fonti richiedere.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Ragione sociale</label>
              <input className="input" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Partita IVA / Codice Fiscale</label>
                <input className="input" required value={vat} onChange={(e) => setVat(e.target.value)} />
              </div>
              <div>
                <label className="label">Importo finanziamento (€)</label>
                <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Email referente impresa</label>
                <input className="input" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Telefono referente</label>
                <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="label mb-3">Fonti da richiedere</div>
            <div className="space-y-2">
              {SOURCE_OPTIONS.map((opt) => (
                <label key={opt.type} className="flex items-start gap-3 p-3 rounded-lg border border-black/[0.06] hover:bg-black/[0.015] cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={selected.includes(opt.type)} onChange={() => toggle(opt.type)} />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-black/50">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-risk">{error}</div>}
          <button className="btn-verified" disabled={submitting}>
            {submitting ? 'Creazione in corso…' : 'Genera richiesta e link sicuro'}
          </button>
        </form>
      </div>
    </PortalLayout>
  )
}
