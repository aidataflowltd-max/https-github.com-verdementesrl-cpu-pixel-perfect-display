import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'

export default function SuperAdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setLoading(false)
      setError('Credenziali non valide.')
      return
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    setLoading(false)
    if (profile?.role !== 'super_admin') {
      await supabase.auth.signOut()
      setError('Questo account non ha i permessi di Super Admin.')
      return
    }
    await logAudit({ actorType: 'admin', eventType: 'USER_LOGIN', metadata: { email } })
    navigate('/super-admin')
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8 text-white">
          <span className="h-2.5 w-2.5 rounded-full bg-verified" />
          <span className="font-semibold tracking-tight text-lg">VERIFIED</span>
          <span className="text-white/30 text-xs ml-1">/ super-admin</span>
        </div>
        <div className="bg-night-700 border border-white/10 rounded-xl p-8">
          {!supabaseConfigured && (
            <div className="mb-4 text-xs bg-warn/10 text-warn border border-warn/30 rounded-lg px-3 py-2">
              Database non collegato.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-white/40">Email</label>
              <input className="input bg-night-600 border-white/10 text-white" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label text-white/40">Password</label>
              <input className="input bg-night-600 border-white/10 text-white" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            <button className="btn-verified w-full" disabled={loading || !supabaseConfigured}>
              {loading ? 'Accesso…' : 'Accedi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
