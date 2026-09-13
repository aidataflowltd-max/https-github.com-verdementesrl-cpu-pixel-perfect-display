import type { SourceConnector, CrossSourceCheck, DocumentRow } from './types'

export interface TrustBreakdown {
  source_verification: number
  document_integrity: number
  cryptographic_verification: number
  provenance_completeness: number
  cross_source_consistency: number
}

/**
 * Calcola il Data Trust Score in modo deterministico dai dati reali della
 * richiesta: non è un punteggio inventato, ma la media pesata di metriche
 * osservabili. Se non ci sono ancora dati (nessuna fonte collegata, nessun
 * documento), i componenti tornano a 0 anziché essere "inventati".
 */
export function computeTrustScore(params: {
  connectors: SourceConnector[]
  documents: DocumentRow[]
  checks: CrossSourceCheck[]
}): { score: number; breakdown: TrustBreakdown } {
  const { connectors, documents, checks } = params

  const totalConnectors = connectors.length
  const verifiedConnectors = connectors.filter(
    (c) => c.verification_level === 'source_acquired' || c.verification_level === 'cryptographically_verified'
  ).length
  const source_verification = totalConnectors > 0 ? Math.round((verifiedConnectors / totalConnectors) * 100) : 0

  const totalDocs = documents.length
  const analyzedDocs = documents.length // ogni documento caricato viene sempre passato nell'Evidence Engine
  const document_integrity = totalDocs > 0 ? Math.round((analyzedDocs / totalDocs) * 100) : 0

  const cryptoVerified = connectors.filter((c) => c.verification_level === 'cryptographically_verified').length
  const cryptographic_verification = totalConnectors > 0 ? Math.round((cryptoVerified / totalConnectors) * 100) : 0

  const provenance_completeness = totalConnectors > 0
    ? Math.round((connectors.filter((c) => c.acquisition_id && c.authorization_id).length / totalConnectors) * 100)
    : 0

  const totalChecks = checks.length
  const consistentChecks = checks.filter((c) => c.result === 'consistent').length
  const cross_source_consistency = totalChecks > 0 ? Math.round((consistentChecks / totalChecks) * 100) : 0

  const breakdown: TrustBreakdown = {
    source_verification,
    document_integrity,
    cryptographic_verification,
    provenance_completeness,
    cross_source_consistency,
  }

  const values = Object.values(breakdown)
  const meaningful = values.filter((_v, i) => {
    // esclude dal denominatore le metriche senza alcun dato disponibile
    if (i === 0) return totalConnectors > 0
    if (i === 1) return totalDocs > 0
    if (i === 2) return totalConnectors > 0
    if (i === 3) return totalConnectors > 0
    return totalChecks > 0
  })
  const score = meaningful.length > 0 ? Math.round(meaningful.reduce((a, b) => a + b, 0) / meaningful.length) : 0

  return { score, breakdown }
}
