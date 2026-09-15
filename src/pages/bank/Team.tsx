import { useEffect, useState } from 'react'
import { PortalLayout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const NAV = [
  { to: '/bank/dashboard', label: 'Richieste' },
  { to: '/bank/new-request', label: 'Nuova Richiesta' },
  { to: '/bank/team', label: 'Team' },
]

interface AuthorizedEmail {
  id: string
  bank_id: string
  email: string
  note: string | null
  created_at: string
}

interface Operator {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
  last_sign_in_at: string | null
}

interface ActivityRow {
  id: string
  actor_id: string | null
  event_type: string
  created_at: string
  metadata: Record<string, unknown> | null
}

const EVENT_LABELS: Record<string, string> = {
  USER_LOGIN: 'Accesso',
  REQUEST_CREATED: 'Richiesta creata',
  SNAPSHOT_CREATED: 'Report generato',
  SNAPSHOT_LOCKED: 'Report bloccato',
  BANK_VIEWED_SNAPSHOT: 'Report consultato',
  ANOMALY_JUSTIFIED: 'Anomalia giustificata',
  OPERATOR_REGISTERED: 'Nuovo operatore registrato',
  VAT_QUICK_CHECK: 'Controllo P.IVA rapido',
}

export default function Team() {
  const { profile } = useAuth()
  const [emails, setEmails] = useState<AuthorizedEmail[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = profile?.role === 'bank_admin'

  useEffect(() => {
    load()
  }, [profile])

  async function load() {
    if (!profile?.bank_id) return
    setLoading(true)
    const [{ data: em }, { data: ops }, { data: act }] = await Promise.all([
      supabase.from('bank_authorized_emails').select('*').eq('bank_id', profile.bank_id).order('created_at', { ascending: false }),
      supabase.rpc('bank_list_operators'),
      supabase.from('audit_logs').select('id, actor_id, event_type, created_at, metadata').order('created_at', { ascending: false }).limit(40),
    ])
    setEmails((em ?? []) as AuthorizedEmail[])
    setOperators((ops ?? []) as Operator[])
    setActivity((act ?? []) as ActivityRow[])
    setLoading(false)
  }

  async function addEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.bank_id || !newEmail.trim()) return
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('bank_authorized_emails').insert({
      bank_id: profile.bank_id,
      email: newEmail.trim().toLowerCase(),
      note: newNote.trim() || null,
      added_by: profile.id,
    })
    setSaving(false)
    if (error) {
      setError(error.code === '23505' ? 'Questa email e\' gia\' autorizzata.' : 'Errore: ' + error.message)
      return
    }
    setNewEmail('')
    setNewNote('')
    load()
  }

  async function removeEmail(id: string) {
    await supabase.from('bank_authorized_emails').delete().eq('id', id)
    load()
  }

  function operatorName(actorId: string | null) {
    if (!actorId) return 'Sistema'
    return operators.find((o) => o.id === actorId)?.full_name || operators.find((o) => o.id === actorId)?.email || '—'
  }

  if (!isAdmin) {
    return (
      <PortalLayout nav={NAV} title="Bank Portal">
        <div className="px-8 py-8 max-w-3xl">
          <div className="card p-6 text-sm text-black/60">
            La gestione del team e' riservata al referente (bank_admin) della tua banca.
          </div>
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout nav={NAV} title="Bank Portal">
      <div className="px-8 py-8 max-w-4xl space-y-8">
        <div>
          <h1 className="text-xl font-semibold">Team e accessi</h1>
          <p className="text-sm text-black/50">
            Autorizza le email (interne o esterne) che possono registrarsi come operatori della tua banca su VERIFIED. Chi si registra con un'email non presente in questa lista non ottiene accesso.
          </p>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-4">Email autorizzate</h2>
          <form onSubmit={addEmail} className="flex flex-wrap gap-2 mb-5">
            <input className="input flex-1 min-w-[200px]" type="email" required placeholder="nome@banca.it" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <input className="input flex-1 min-w-[160px]" placeholder="Nota (es. interno, filiale Milano)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            <button className="btn-primary" disabled={saving}>Autorizza</button>
          </form>
          {error && <div className="text-sm text-risk mb-3">{error}</div>}
          {loading ? (
            <div className="text-sm text-black/40">Caricamento…</div>
          ) : emails.length === 0 ? (
            <div className="text-sm text-black/40">Nessuna email autorizzata ancora. Aggiungine una sopra.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {emails.map((em) => (
                  <tr key={em.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="py-2 font-medium">{em.email}</td>
                    <td className="py-2 text-black/50">{em.note ?? '—'}</td>
                    <td className="py-2 text-black/40 text-xs">{new Date(em.created_at).toLocaleDateString('it-IT')}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeEmail(em.id)} className="text-xs text-risk hover:underline">Rimuovi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-4">Operatori registrati</h2>
          {loading ? (
            <div className="text-sm text-black/40">Caricamento…</div>
          ) : operators.length === 0 ? (
            <div className="text-sm text-black/40">Nessun operatore si e' ancora registrato.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-black/40 uppercase tracking-wide">
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Ruolo</th>
                  <th className="pb-2 font-medium">Registrato</th>
                  <th className="pb-2 font-medium">Ultimo accesso</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => (
                  <tr key={op.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="py-2 font-medium">{op.full_name ?? '—'}</td>
                    <td className="py-2 text-black/60">{op.email}</td>
                    <td className="py-2 text-black/50">{op.role === 'bank_admin' ? 'Referente (admin)' : 'Operatore'}</td>
                    <td className="py-2 text-black/40 text-xs">{new Date(op.created_at).toLocaleDateString('it-IT')}</td>
                    <td className="py-2 text-black/40 text-xs">{op.last_sign_in_at ? new Date(op.last_sign_in_at).toLocaleString('it-IT') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold mb-4">Attivita' recente del team</h2>
          {loading ? (
            <div className="text-sm text-black/40">Caricamento…</div>
          ) : activity.length === 0 ? (
            <div className="text-sm text-black/40">Nessuna attivita' registrata.</div>
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm border-b border-black/[0.04] last:border-0 pb-2">
                  <span>
                    <span className="font-medium">{operatorName(a.actor_id)}</span>
                    <span className="text-black/50"> — {EVENT_LABELS[a.event_type] ?? a.event_type}</span>
                  </span>
                  <span className="text-xs text-black/40">{new Date(a.created_at).toLocaleString('it-IT')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PortalLayout>
  )
}
