import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'

export default function BankLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Credenziali non valide. Verifica email e password.')
      return
    }
    await logAudit({ actorType: 'bank', eventType: 'USER_LOGIN', metadata: { email } })
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
          <h1 className="text-lg font-semibold mb-1">Accesso Banca</h1>
          <p className="text-sm text-black/50 mb-6">Portale riservato agli istituti finanziari partner.</p>

          {!supabaseConfigured && (
            <div className="mb-4 text-xs bg-warn/10 text-warn border border-warn/30 rounded-lg px-3 py-2">
              Database non collegato: configura Supabase per abilitare il login reale.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@banca.it" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            <button className="btn-primary w-full" disabled={loading || !supabaseConfigured}>
              {loading ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-black/40 mt-6">
          Le utenze banca vengono create dal Super Admin di VERIFIED.
        </p>
      </div>
    </div>
  )
}
