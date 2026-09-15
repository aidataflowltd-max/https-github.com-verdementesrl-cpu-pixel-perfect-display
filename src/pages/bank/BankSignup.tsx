import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'

interface BankOption {
  id: string
  name: string
}

export default function BankSignup() {
  const [banks, setBanks] = useState<BankOption[]>([])
  const [bankId, setBankId] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.rpc('list_banks_public').then(({ data }) => {
      setBanks((data ?? []) as BankOption[])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!bankId) {
      setError('Seleziona la tua banca.')
      return
    }

    setLoading(true)

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setLoading(false)
      setError(signUpError.message.includes('already registered') ? 'Esiste gia\' un account con questa email. Prova ad accedere.' : 'Registrazione non riuscita: ' + signUpError.message)
      return
    }

    if (!signUpData.session) {
      setLoading(false)
      setNotice('Account creato. Controlla la tua email per confermarlo, poi accedi dalla pagina di login: la tua idoneita\' verra\' verificata automaticamente al primo accesso se il tuo indirizzo e\' nella lista autorizzati della banca.')
      return
    }

    const { error: rpcError } = await supabase.rpc('self_register_bank_user', { p_bank_id: bankId, p_full_name: fullName || null })
    setLoading(false)

    if (rpcError) {
      setError('Il tuo indirizzo email non risulta autorizzato per questa banca. Contatta il referente (bank_admin) della tua banca su VERIFIED per farti aggiungere alla lista degli operatori autorizzati.')
      return
    }

    await logAudit({ actorType: 'bank', eventType: 'OPERATOR_REGISTERED', metadata: { email, bank_id: bankId } })
    navigate('/bank/dashboard')
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="h-2.5 w-2.5 rounded-full bg-verified" />
          <span className="font-semibold tracking-tight text-lg">VERIFIED</span>
        </div>
        <div className="card p-8">
          <h1 className="text-lg font-semibold mb-1">Registrazione Operatore Banca</h1>
          <p className="text-sm text-black/50 mb-6">
            L'accesso viene attivato automaticamente solo se la tua email e' stata autorizzata dal referente della tua banca su VERIFIED.
          </p>

          {!supabaseConfigured && (
            <div className="mb-4 text-xs bg-warn/10 text-warn border border-warn/30 rounded-lg px-3 py-2">
              Database non collegato: configura Supabase per abilitare la registrazione reale.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Banca</label>
              <select className="input" required value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">Seleziona…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nome e cognome</label>
              <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email aziendale</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@banca.it" />
              <p className="text-xs text-black/40 mt-1">Usa la stessa email (interna o esterna) che e' stata comunicata al tuo bank_admin.</p>
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            {notice && <div className="text-sm text-verified-dim bg-verified/5 border border-verified/20 rounded-lg px-3 py-2">{notice}</div>}
            <button className="btn-primary w-full" disabled={loading || !supabaseConfigured}>
              {loading ? 'Registrazione in corso…' : 'Registrati'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-black/40 mt-6">
          Hai gia' un account? <Link to="/bank/login" className="text-night hover:underline">Accedi</Link>
        </p>
      </div>
    </div>
  )
}
