import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import type { VerificationRequest } from '../../lib/types'

type Step = 'loading' | 'not_found' | 'contact' | 'otp' | 'consent' | 'error'

export default function InviteFlow() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('loading')
  const [request, setRequest] = useState<VerificationRequest | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [requestedSources, setRequestedSources] = useState<{ connector_type: string }[]>([])

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    if (!token || !supabaseConfigured) {
      setStep(supabaseConfigured ? 'not_found' : 'error')
      return
    }
    const { data } = await supabase
      .from('verification_requests')
      .select('*, companies(*), banks(*)')
      .eq('invite_token', token)
      .maybeSingle()
    if (!data) {
      setStep('not_found')
      return
    }
    if (new Date(data.expires_at) < new Date()) {
      await supabase.from('verification_requests').update({ status: 'expired' }).eq('id', data.id)
      setStep('not_found')
      return
    }
    setRequest(data as VerificationRequest)
    setEmail(data.contact_email ?? '')
    setPhone(data.contact_phone ?? '')
    const { data: sources } = await supabase
      .from('verification_request_sources')
      .select('connector_type')
      .eq('request_id', data.id)
    setRequestedSources(sources ?? [])
    setStep('contact')
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setSending(false)
    if (error) {
      setError('Impossibile inviare il codice. Riprova tra qualche istante.')
      return
    }
    await logAudit({ requestId: request?.id, actorType: 'company', eventType: 'OTP_SENT', metadata: { email } })
    setStep('otp')
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    setSending(false)
    if (error || !data.session) {
      setError('Codice non valido o scaduto. Controlla e riprova.')
      await logAudit({ requestId: request?.id, actorType: 'company', eventType: 'OTP_FAILED', metadata: { email } })
      return
    }
    await logAudit({ requestId: request?.id, actorType: 'company', eventType: 'OTP_VERIFIED', metadata: { email } })

    // crea/aggiorna il profilo collegandolo all'azienda della richiesta
    await supabase.from('profiles').upsert({
      id: data.session.user.id,
      role: 'company_contact',
      company_id: request?.company_id,
      full_name: request?.companies?.legal_name,
    })

    await supabase.from('verification_requests').update({ status: 'in_verification' }).eq('id', request?.id)
    setStep('consent')
  }

  async function acceptConsent() {
    if (!request) return
    await supabase.from('consents').insert(
      requestedSources.map((s) => ({
        request_id: request.id,
        connector_type: s.connector_type,
        purpose: 'Verifica situazione economica, finanziaria, fiscale e societaria per richiesta di finanziamento',
        status: 'granted',
        granted_at: new Date().toISOString(),
      }))
    )
    await logAudit({ requestId: request.id, actorType: 'company', eventType: 'CONSENT_CREATED', metadata: { sources: requestedSources } })
    navigate(`/company/dashboard/${request.id}`)
  }

  if (step === 'loading') return <Centered>Caricamento…</Centered>
  if (step === 'error') return <Centered>Il database non è ancora collegato. Riprova più tardi.</Centered>
  if (step === 'not_found') return <Centered>Questo link non è valido o è scaduto. Contatta la banca che ha inviato la richiesta.</Centered>

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="h-2.5 w-2.5 rounded-full bg-verified" />
          <span className="font-semibold tracking-tight text-lg">VERIFIED</span>
        </div>

        {step === 'contact' && (
          <form onSubmit={sendOtp} className="card p-8 space-y-4">
            <h1 className="text-lg font-semibold">Verifica la tua identità</h1>
            <p className="text-sm text-black/50">
              {request?.banks?.name} ha richiesto una verifica per <strong>{request?.companies?.legal_name}</strong>.
              Inserisci email e telefono per ricevere un codice di accesso monouso.
            </p>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Telefono</label>
              <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            <button className="btn-verified w-full" disabled={sending}>{sending ? 'Invio in corso…' : 'Invia codice di accesso'}</button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verifyOtp} className="card p-8 space-y-4">
            <h1 className="text-lg font-semibold">Inserisci il codice</h1>
            <p className="text-sm text-black/50">Abbiamo inviato un codice monouso a {email}. Ha una durata limitata e un numero massimo di tentativi.</p>
            <input
              className="input text-center text-2xl tracking-[0.5em] font-mono"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
            />
            {error && <div className="text-sm text-risk">{error}</div>}
            <button className="btn-verified w-full" disabled={sending}>{sending ? 'Verifica…' : 'Verifica codice'}</button>
          </form>
        )}

        {step === 'consent' && (
          <div className="card p-8 space-y-4">
            <h1 className="text-lg font-semibold">Consenso alla verifica</h1>
            <div className="text-sm text-black/60 space-y-1 bg-paper-dim rounded-lg p-4">
              <Row label="Banca richiedente" value={request?.banks?.name ?? '—'} />
              <Row label="Azienda" value={request?.companies?.legal_name ?? '—'} />
              <Row label="Finalità" value="Verifica per richiesta di finanziamento" />
            </div>
            <div>
              <div className="label mb-2">Dati e fonti richiesti</div>
              <div className="space-y-1.5">
                {requestedSources.map((s) => (
                  <div key={s.connector_type} className="text-sm flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-night" /> {labelFor(s.connector_type)}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-black/40">
              Autorizzi VERIFIED ad acquisire i dati sopra indicati esclusivamente tramite fonti e procedure ufficiali,
              per conto della banca richiedente, secondo la normativa vigente.
            </p>
            <button className="btn-verified w-full" onClick={acceptConsent}>Accetto e procedo</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-black/40">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function labelFor(type: string) {
  const map: Record<string, string> = {
    banking: 'Conti bancari (Open Banking)',
    tax: 'Dati fiscali (Agenzia Entrate)',
    credit: 'Centrale dei Rischi',
    corporate: 'Camera di Commercio / Bilanci',
    document: 'Documenti caricati',
  }
  return map[type] ?? type
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-center px-6 text-sm text-black/50">{children}</div>
}
