/**
 * Evidence Engine — hashing reale dei documenti tramite Web Crypto API
 * (nessuna libreria esterna, nessuna simulazione: SHA-256 calcolato dal browser).
 */
export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return bufferToHex(digest)
}

export async function sha256String(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return bufferToHex(digest)
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Estrae i metadati tecnici disponibili lato client da un file.
 * Per i PDF tenta di leggere alcuni marcatori testuali di base (versione,
 * Producer/Creator, presenza di firme/AcroForm) senza librerie di parsing
 * complete: è un'analisi reale ma di primo livello, non un motore forense
 * completo (che richiederebbe un parser PDF dedicato lato server).
 */
export async function extractBasicMetadata(file: File) {
  const meta: Record<string, unknown> = {
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
  }

  if (file.type === 'application/pdf') {
    try {
      const head = await file.slice(0, 65536).text()
      const versionMatch = head.match(/%PDF-(\d\.\d)/)
      const producerMatch = head.match(/\/Producer\s*\(([^)]*)\)/)
      const creatorMatch = head.match(/\/Creator\s*\(([^)]*)\)/)
      meta.pdf_version = versionMatch?.[1] ?? null
      meta.producer = producerMatch?.[1] ?? null
      meta.creator = creatorMatch?.[1] ?? null
      meta.has_acroform = head.includes('/AcroForm')
      meta.has_signature_dict = head.includes('/ByteRange')

      const tail = await file.slice(Math.max(0, file.size - 4096)).text()
      const eofCount = (await file.text().catch(() => '')).match(/%%EOF/g)?.length
      meta.eof_markers = eofCount ?? (tail.includes('%%EOF') ? 1 : 0)
      meta.forensic_flags = (eofCount ?? 1) > 1 ? ['multiple_eof_markers_possible_incremental_update'] : []
    } catch {
      meta.parse_error = true
    }
  }

  return meta
}
