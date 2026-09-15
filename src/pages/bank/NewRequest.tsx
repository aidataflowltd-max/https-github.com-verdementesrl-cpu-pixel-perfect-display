import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PortalLayout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { logAudit } from '../../lib/audit'
import { sha256File, sha256String } from '../../lib/hash'
import { computePreliminaryCheck } from '../../lib/preliminaryCheck'
import type { ConnectorType, Source } from '../../lib/types'

const NAV = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
]

const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  corporate: 'Camera di Commercio / Bilanci',
  credit: 'Centrale Rischi (CRIF / Banca d\'Italia)',
  tax: 'Agenzia Entrate / Cassetto Fiscale',
  banking: 'Banche collegate (Open Banking)',
  document: 'Documenti',
}

// Livelli di verifica: pacchetti preimpostati di fonti. Ogni livello e'
// cumulativo (include le fonti dei livelli precedenti) ma resta sempre
// modificabile a mano dalla banca dopo la selezione — questo e' solo un
// punto di partenza intelligente, non un vincolo.
type Tier = 1 | 2 | 3

const TIER_INFO: Record<Tier, { label: string; description: string }> = {
  1: {
    label: 'Livello 1 — Base',
    description: 'Controllo rapido: validita\' P.IVA e visura camerale. La banca puo\' comunque integrare e gestire il resto a mano.',
  },
  2: {
    label: 'Livello 2 — Standard',
    description: 'Aggiunge bilanci, DURC/DURF (regolarita\' contributiva e fiscale), conto corrente e Cassetto Fiscale.',
  },
  3: {
    label: 'Livello 3 — Avanzato',
    description: 'Aggiunge il controllo pesante sulla persona fisica (identita\', poteri di firma, protesti e pregiudizievoli) e le centrali rischi (CRIF, Banca d\'Italia, Cerved).',
  },
}

const TIER_SOURCE_NAMES: Record<Tier, string[]> = {
  1: [
    'Verifica P.IVA (VIES)',
    'Registro Imprese — Visure e Bilanci',
  ],
  2: [
    'Bilancio (dichiarato dall\'azienda)',
    'DURC — Documento Unico di Regolarita\' Contributiva',
    'DURF — Regolarita\' Fiscale',
    'Open Banking — Conti Correnti',
    'Agenzia delle Entrate — Cassetto Fiscale',
  ],
  3: [
    'Persona Fisica — Identita\' e Poteri di Firma',
    'Persona Fisica — Protesti e Pregiudizievoli',
    'CRIF — Centrale Rischi Privata',
    'Centrale dei Rischi — Banca d\'Italia',
    'Cerved — Report Andamentale',
  ],
}

function buildMailtoHref(contactEmail: string, legalName: string, inviteLink: string) {
  const subject = 'Richiesta di verifica VERIFIED'
  const bodyLines = [
    'Gentile referente di ' + legalName + ',',
    '',
    'e\' stata avviata una richiesta di verifica per l\'ottenimento del finanziamento richiesto.',
    '',
    'Completi la verifica in sicurezza a questo link:',
    inviteLink,
    '',
    'Il link e\' personale e protetto da codice di accesso monouso.',
  ]
  return 'mailto:' + contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyLines.join('\n'))
}

export default function NewRequest() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [legalName, setLegalName] = useState('')
  const [vat, setVat] = useState('')
  const [existingCompanyInfo, setExistingCompanyInfo] = useState<{ legal_name: string; requestCount: number } | null>(null)
  const [amount, setAmount] = useState('')
  const [financingType, setFinancingType] = useState('finanziamento')
  const [financingPurpose, setFinancingPurpose] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [tier, setTier] = useState<Tier | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string; region: string | null }[]>([])
  const [branchId, setBranchId] = useState('')
  const [businessPlan, setBusinessPlan] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<{ score: number; notes: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viesStatus, setViesStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle')
  const [viesName, setViesName] = useState<string | null>(null)
  const [viesRaw, setViesRaw] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    supabase.from('sources').select('*').order('connector_type').then(({ data }) => setSources((data ?? []) as Source[]))
  }, [])

  useEffect(() => {
    if (profile?.branch_id) {
      setBranchId(profile.branch_id)
      return
    }
    if (profile?.bank_id) {
      supabase.from('bank_branches').select('id, name, region').eq('bank_id', profile.bank_id).then(({ data }) => setBranches(data ?? []))
    }
  }, [profile])

  async function handleVatBlur() {
    setViesStatus('idle')
    setViesName(null)
    setViesRaw(null)
    if (!vat) {
      setExistingCompanyInfo(null)
      return
    }
    const vatDigits = vat.replace(/\D/g, '')

    const { data: company } = await supabase.from('companies').select('id, legal_name').eq('vat_number', vat).maybeSingle()
    if (company) {
      const { count } = await supabase
        .from('verification_requests')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
      setExistingCompanyInfo({ legal_name: company.legal_name, requestCount: count ?? 0 })
      setLegalName(company.legal_name)
      return
    }

    setExistingCompanyInfo(null)

    if (vatDigits.length !== 11) return
    setViesStatus('checking')
    const { data: viesData, error: viesError } = await supabase.rpc('check_vat_vies', { p_country: 'IT', p_vat: vatDigits })
    if (viesError || !viesData || viesData.error) {
      setViesStatus('error')
      return
    }
    setViesRaw(viesData as Record<string, unknown>)
    if (viesData.valid) {
      setViesStatus('valid')
      const name = typeof viesData.name === 'string' ? viesData.name.trim() : ''
      if (name && name !== '---' && name.toLowerCase() !== 'unavailable') {
        setViesName(name)
        if (!legalName) setLegalName(name)
      }
    } else {
      setViesStatus('invalid')
    }
  }

  function toggleSource(id: string) {
    setSelectedSourceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function chooseTier(t: Tier) {
    setTier(t)
    const names = new Set<string>()
    for (let level = 1; level <= t; level++) {
      TIER_SOURCE_NAMES[level as Tier].forEach((n) => names.add(n))
    }
    const matchedIds = sources.filter((s) => names.has(s.name)).map((s) => s.id)
    setSelectedSourceIds(matchedIds)
  }

  const sourcesByType = sources.reduce<Record<string, Source[]>>((acc, s) => {
    acc[s.connector_type] = acc[s.connector_type] ?? []
    acc[s.connector_type].push(s)
    return acc
  }, {})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.bank_id) return
    setSubmitting(true)
    setError(null)

    const { data: existingCompany } = await supabase.from('companies').select('id').eq('vat_number', vat).maybeSingle()
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
        financing_type: financingType,
        financing_purpose: financingPurpose,
        verification_tier: tier,
        branch_id: branchId || null,
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

    const chosenSources = sources.filter((s) => selectedSourceIds.includes(s.id))
    if (chosenSources.length > 0) {
      await supabase.from('verification_request_sources').insert(
        chosenSources.map((s) => ({ request_id: request.id, connector_type: s.connector_type, source_id: s.id }))
      )
    }

    // Se la fonte VIES era tra quelle richieste e abbiamo gia' interrogato il servizio
    // ufficiale UE in fase di compilazione, registriamo l'acquisizione reale con la sua
    // provenienza (nessuna autenticazione personale coinvolta: e' una banca dati pubblica).
    const viesSource = chosenSources.find((s) => s.name === 'Verifica P.IVA (VIES)')
    if (viesSource && viesRaw) {
      const rawJson = JSON.stringify(viesRaw)
      const rawHash = await sha256String(rawJson)
      const { data: connector } = await supabase
        .from('source_connectors')
        .insert({
          request_id: request.id,
          source_id: viesSource.id,
          authentication_method: 'api_pubblica_ue_nessuna_autenticazione_utente',
          acquisition_id: crypto.randomUUID(),
          acquired_at: new Date().toISOString(),
          status: 'connected',
          raw_response: viesRaw,
          hash: rawHash,
          verification_level: viesStatus === 'valid' ? 'source_acquired' : 'analyzed',
          error_state: viesStatus === 'error' ? 'Servizio VIES non ha risposto al momento della verifica' : null,
        })
        .select('id')
        .single()
      if (connector) {
        await supabase.from('acquisition_events').insert({
          request_id: request.id,
          source_connector_id: connector.id,
          event_type: 'DATA_ACQUIRED',
          payload: { source: 'VIES', valid: viesRaw.valid ?? null },
        })
      }
    }

    let hasBusinessPlan = false
    let businessPlanSize = 0
    if (businessPlan) {
      const hash = await sha256File(businessPlan)
      const path = `${request.id}/business-plan-${crypto.randomUUID()}-${businessPlan.name}`
      const { error: uploadError } = await supabase.storage.from('verified-documents').upload(path, businessPlan)
      if (!uploadError) {
        const { data: doc } = await supabase
          .from('documents')
          .insert({
            request_id: request.id,
            filename: businessPlan.name,
            mime_type: businessPlan.type,
            size_bytes: businessPlan.size,
            storage_path: path,
            classification: 'user_provided',
            document_category: 'business_plan',
            uploaded_by: profile.id,
          })
          .select('id')
          .single()
        if (doc) {
          await supabase.from('document_hashes').insert({ document_id: doc.id, algorithm: 'SHA-256', hash })
        }
        hasBusinessPlan = true
        businessPlanSize = businessPlan.size
      }
    }

    const check = computePreliminaryCheck({
      vatNumber: vat,
      amount: amount ? Number(amount) : null,
      hasBusinessPlan,
      businessPlanSizeBytes: businessPlanSize,
    })
    await supabase
      .from('verification_requests')
      .update({ preliminary_check_score: check.score, preliminary_check_notes: check.notes })
      .eq('id', request.id)
    setCheckResult(check)

    await logAudit({
      requestId: request.id,
      actorType: 'bank',
      eventType: 'REQUEST_CREATED',
      metadata: { legalName, vat, sources: chosenSources.map((s) => s.name), hasBusinessPlan },
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

            {checkResult && (
              <div className="bg-paper-dim rounded-lg px-4 py-3 text-left mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wide text-black/40">Controllo preliminare automatico</span>
                  <span className="font-semibold">{checkResult.score}/100</span>
                </div>
                <p className="text-xs text-black/50">{checkResult.notes}</p>
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(inviteLink)}>Copia link</button>
              <a className="btn-verified" href={buildMailtoHref(contactEmail, legalName, inviteLink)}>Invia via email</a>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Partita IVA / Codice Fiscale</label>
                <input className="input" required value={vat} onChange={(e) => setVat(e.target.value)} onBlur={handleVatBlur} />
              </div>
              <div>
                <label className="label">Ragione sociale</label>
                <input className="input" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </div>
            </div>

            {existingCompanyInfo && (
              <div className="text-xs bg-verified/10 text-verified-dim rounded-lg px-3 py-2">
                Azienda già in anagrafica: <strong>{existingCompanyInfo.legal_name}</strong> — {existingCompanyInfo.requestCount} richieste precedenti.
              </div>
            )}

            {!existingCompanyInfo && viesStatus === 'checking' && (
              <div className="text-xs bg-black/5 text-black/50 rounded-lg px-3 py-2">Verifica P.IVA in corso su VIES (Commissione Europea)…</div>
            )}
            {!existingCompanyInfo && viesStatus === 'valid' && (
              <div className="text-xs bg-verified/10 text-verified-dim rounded-lg px-3 py-2">
                P.IVA valida e attiva (fonte: VIES, verifica ufficiale UE in tempo reale).
                {viesName ? <> Ragione sociale rilevata: <strong>{viesName}</strong>.</> : ' Per questa P.IVA VIES non restituisce la ragione sociale: inseriscila a mano qui sotto.'}
              </div>
            )}
            {!existingCompanyInfo && viesStatus === 'invalid' && (
              <div className="text-xs bg-risk/10 text-risk rounded-lg px-3 py-2">
                Attenzione: VIES segnala questa P.IVA come NON valida o non attiva.
              </div>
            )}
            {!existingCompanyInfo && viesStatus === 'error' && (
              <div className="text-xs bg-black/5 text-black/40 rounded-lg px-3 py-2">
                Verifica VIES non disponibile in questo momento. Puoi comunque proseguire inserendo i dati a mano.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Importo finanziamento (€)</label>
                <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Tipo di prodotto</label>
                <select className="input" value={financingType} onChange={(e) => setFinancingType(e.target.value)}>
                  <option value="mutuo">Mutuo</option>
                  <option value="finanziamento">Finanziamento</option>
                  <option value="leasing">Leasing</option>
                  <option value="anticipo_fatture">Anticipo Fatture</option>
                  <option value="altro">Altro</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Motivo / giustificativo (breve)</label>
              <input className="input" value={financingPurpose} onChange={(e) => setFinancingPurpose(e.target.value)} placeholder="es. acquisto macchinario, liquidità, immobile…" />
            </div>

            {branches.length > 0 && (
              <div>
                <label className="label">Filiale</label>
                <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Sede centrale / nessuna filiale</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}{b.region ? ' - ' + b.region : ''}</option>
                  ))}
                </select>
              </div>
            )}

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

            <div>
              <label className="label">Business plan / preventivo (opzionale)</label>
              <input className="input" type="file" onChange={(e) => setBusinessPlan(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-black/40 mt-1">
                Viene sottoposto a un controllo preliminare automatico basato su regole (non un'analisi AI del contenuto).
              </p>
            </div>
          </div>

          <div className="card p-6">
            <div className="label mb-3">Livello di verifica</div>
            <p className="text-xs text-black/40 mb-3">
              Scegli un pacchetto per pre-selezionare le fonti qui sotto: restano comunque modificabili una per una.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([1, 2, 3] as Tier[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => chooseTier(t)}
                  className={
                    'text-left p-3.5 rounded-lg border transition-colors ' +
                    (tier === t ? 'border-verified bg-verified/5' : 'border-black/[0.08] hover:bg-black/[0.015]')
                  }
                >
                  <div className={'text-sm font-medium mb-1 ' + (tier === t ? 'text-verified-dim' : '')}>{TIER_INFO[t].label}</div>
                  <div className="text-xs text-black/50">{TIER_INFO[t].description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="label mb-3">Fonti da richiedere</div>
            <div className="space-y-4">
              {Object.entries(CONNECTOR_LABELS).map(([type, label]) => {
                const list = sourcesByType[type] ?? []
                if (list.length === 0) return null
                return (
                  <div key={type}>
                    <div className="text-xs font-medium text-black/50 mb-1.5">{label}</div>
                    <div className="space-y-1.5">
                      {list.map((s) => (
                        <label key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-black/[0.06] hover:bg-black/[0.015] cursor-pointer">
                          <input type="checkbox" checked={selectedSourceIds.includes(s.id)} onChange={() => toggleSource(s.id)} />
                          <div className="text-sm">{s.name}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {sources.length === 0 && (
                <p className="text-xs text-black/40">Nessuna fonte configurata: chiedi al Super Admin di caricarle.</p>
              )}
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
