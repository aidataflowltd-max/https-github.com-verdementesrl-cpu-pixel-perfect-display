import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { logAudit } from '../../lib/audit'
import { runCrossSourceReconciliation } from '../../lib/crossSource'
import { extractBasicMetadata, sha256File } from '../../lib/hash'
import { ConnectorStatusBadge } from '../../components/StatusBadge'
import type { ConnectorType, VerificationRequest, SourceConnector } from '../../lib/types'

const SECTION_LABEL: Record<ConnectorType, string> = {
  banking: 'CONTI BANCARI',
  tax: 'DATI FISCALI',
  credit: 'CENTRALE RISCHI',
  corporate: 'CAMERA DI COMMERCIO / BILANCI',
  document: 'DOCUMENTI',
}

export default function CompanyDashboard() {
  const { id } = useParams()
  const { session } = useAuth()
  const [request, setRequest] = useState<VerificationRequest | null>(null)
  const [connectors, setConnectors] = useState<SourceConnector[]>([])
  const [sources, setSources] = useState<{ id: string; name: string; connector_type: ConnectorType; status: string }[]>([])
  const [requestedSources, setRequestedSources] = useState<{ id: string; source_id: string | null; connector_type: ConnectorType }[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (id) load()
  }, [id])

  async function load() {
    const [{ data: req }, { data: conn }, { data: srcs }, { data: reqSrcs }] = await Promise.all([
      supabase.from('verification_requests').select('*, banks(*), companies(*)').eq('id', id).single(),
      supabase.from('source_connectors').select('*, sources(*)').eq('request_id', id),
      supabase.from('sources').select('id, name, connector_type, status'),
      supabase.from('verification_request_sources').select('id, source_id, connector_type').eq('request_id', id),
    ])
    setRequest(req as VerificationRequest)
    setConnectors((conn ?? []) as SourceConnector[])
    setSources(srcs ?? [])
    setRequestedSources(reqSrcs ?? [])
  }

  async function connectSource(sourceId: string, type: ConnectorType) {
    const source = sources.find((s) => s.id === sourceId)
    if (!request) return

    if (source?.status !== 'connected') {
      // Nessuna fonte reale disponibile per questo connector: creiamo il record
      // come NOT CONFIGURED, mai una finta verifica.
      await supabase.from('source_connectors').insert({
        request_id: request.id,
        source_id: sourceId,
        status: 'not_configured',
        verification_level: 'not_configured',
        error_state: 'Connector non ancora attivato dal provider — richiede integrazione reale (API/contratto).',
      })
      await logAudit({ requestId: request.id, actorType: 'company', eventType: 'SOURCE_CONNECTED', metadata: { sourceId, type, result: 'not_configured' } })
    } else {
      // Percorso reale quando in futuro un provider è realmente collegato:
      // qui avverrebbe il redirect OAuth/AISP verso la fonte ufficiale.
      await supabase.from('source_connectors').insert({
        request_id: request.id,
        source_id: sourceId,
        status: 'connected',
        verification_level: 'source_acquired',
        acquired_at: new Date().toISOString(),
        authorization_id: crypto.randomUUID(),
        acquisition_id: crypto.randomUUID(),
      })
      await logAudit({ requestId: request.id, actorType: 'company', eventType: 'DATA_ACQUIRED', metadata: { sourceId, type } })
    }
    load()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !request || !session) return
    setUploading(true)

    const hash = await sha256File(file)
    const metadata = await extractBasicMetadata(file)
    const path = `${request.id}/${crypto.randomUUID()}-${file.name}`

    const { error: uploadError } = await supabase.storage.from('verified-documents').upload(path, file)
    if (uploadError) {
      alert('Errore durante il caricamento: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: doc } = await supabase
      .from('documents')
      .insert({
        request_id: request.id,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: path,
        classification: 'user_provided',
        uploaded_by: session.user.id,
      })
      .select('id')
      .single()

    if (doc) {
      await supabase.from('document_hashes').insert({ document_id: doc.id, algorithm: 'SHA-256', hash })
      await supabase.from('document_metadata').insert({ document_id: doc.id, raw_metadata: metadata })
      await logAudit({ requestId: request.id, actorType: 'company', eventType: 'DOCUMENT_UPLOADED', metadata: { filename: file.name } })
      await logAudit({ requestId: request.id, actorType: 'company', eventType: 'DOCUMENT_HASHED', metadata: { hash } })
    }

    await runCrossSourceReconciliation(request.id)
    setUploading(false)
    load()
    e.target.value = ''
  }

  if (!request) return <div className="min-h-screen flex items-center justify-center text-sm text-black/40">Caricamento…</div>

  // La checklist mostra esattamente le verifiche che la banca ha richiesto per QUESTA
  // pratica (non un elenco generico fisso), cosi' l'azienda vede solo link/azioni
  // pertinenti — come un vero elenco di cose da completare, non una lista statica.
  const checklist = requestedSources.map((rs) => {
    const source = rs.source_id ? sources.find((s) => s.id === rs.source_id) : null
    const connector = connectors.find((c) => c.source_id === rs.source_id || (!rs.source_id && c.sources?.connector_type === rs.connector_type))
    return {
      key: rs.id,
      label: source?.name ?? SECTION_LABEL[rs.connector_type] ?? rs.connector_type,
      connectorType: rs.connector_type,
      sourceId: rs.source_id,
      sourceAvailable: source?.status === 'connected',
      connector,
    }
  })

  const progress = checklist.length > 0
    ? Math.round((checklist.filter((c) => c.connector && c.connector.status === 'connected').length / checklist.length) * 100)
    : 0

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-night text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-verified" />
          <span className="font-semibold">VERIFIED</span>
        </div>
        <div className="text-sm text-white/60">{request.companies?.legal_name}</div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-1">Verifica Azienda</h1>
        <p className="text-sm text-black/50 mb-6">Richiesta da {request.banks?.name}</p>

        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Verification Progress</span>
            <span className="text-sm font-semibold">{progress}%</span>
          </div>
          <div className="h-2 bg-paper-dim rounded-full overflow-hidden">
            <div className="h-full bg-verified transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          {checklist.length === 0 && (
            <div className="card p-5 text-sm text-black/40 text-center">
              La banca non ha richiesto verifiche specifiche su questa pratica. Puoi comunque caricare documenti qui sotto.
            </div>
          )}
          {checklist.map((item) => (
            <div key={item.key} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-sm tracking-wide">{item.label}</div>
                {item.connector ? (
                  <ConnectorStatusBadge status={item.connector.status} />
                ) : (
                  <span className="badge bg-black/5 text-black/40">DA VERIFICARE</span>
                )}
              </div>

              {item.connector ? (
                <div className="text-xs text-black/50">
                  {item.connector.status === 'not_configured'
                    ? 'Questa fonte non dispone ancora di un\'integrazione reale attiva. Nessun dato è stato acquisito.'
                    : `Acquisito il ${item.connector.acquired_at ? new Date(item.connector.acquired_at).toLocaleString('it-IT') : '—'} — ${item.connector.authentication_method ?? 'provenienza registrata'}`}
                </div>
              ) : item.sourceId ? (
                <button className="btn-primary" onClick={() => connectSource(item.sourceId!, item.connectorType)}>
                  Avvia verifica
                </button>
              ) : (
                <div className="text-xs text-black/40">Fonte non ancora identificata per questa categoria.</div>
              )}
            </div>
          ))}

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-sm tracking-wide">DOCUMENTI (facoltativo)</div>
            </div>
            <label className="btn-ghost cursor-pointer inline-flex">
              {uploading ? 'Caricamento…' : 'Carica documento'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
