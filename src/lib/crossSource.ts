import { supabase } from './supabase'
import type { DataProvenance } from './types'

/**
 * Cross-Source Reconciliation Engine.
 * Confronta automaticamente i valori dello stesso campo logico provenienti
 * da fonti diverse presenti in data_provenance per una richiesta, usando
 * soglie configurabili (system_settings). Non inventa soglie o esiti:
 * se una sola fonte ha popolato un campo, il confronto è "insufficient_data".
 */
export async function runCrossSourceReconciliation(requestId: string) {
  const { data: provenance, error } = await supabase
    .from('data_provenance')
    .select('*, sources(name)')
    .eq('request_id', requestId)

  if (error) throw error

  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'cross_check_default_threshold_pct')
    .maybeSingle()
  const defaultThreshold = Number(settingRow?.value ?? 5)

  const byField = new Map<string, (DataProvenance & { sources?: { name: string } })[]>()
  for (const row of (provenance ?? []) as (DataProvenance & { sources?: { name: string } })[]) {
    const key = row.field_name
    if (!byField.has(key)) byField.set(key, [])
    byField.get(key)!.push(row)
  }

  const results: {
    field_name: string
    source_a: string
    value_a: number | null
    source_b: string
    value_b: number | null
    difference_pct: number | null
    threshold_pct: number
    result: 'consistent' | 'discrepancy' | 'insufficient_data'
  }[] = []

  for (const [field, rows] of byField) {
    if (rows.length < 2) {
      results.push({
        field_name: field,
        source_a: rows[0]?.sources?.name ?? 'unica fonte',
        value_a: numeric(rows[0]?.field_value),
        source_b: '—',
        value_b: null,
        difference_pct: null,
        threshold_pct: defaultThreshold,
        result: 'insufficient_data',
      })
      continue
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = numeric(rows[i].field_value)
        const b = numeric(rows[j].field_value)
        if (a === null || b === null) continue
        const diff = a === 0 ? 0 : Math.abs((a - b) / a) * 100
        results.push({
          field_name: field,
          source_a: rows[i].sources?.name ?? 'Fonte A',
          value_a: a,
          source_b: rows[j].sources?.name ?? 'Fonte B',
          value_b: b,
          difference_pct: Math.round(diff * 100) / 100,
          threshold_pct: defaultThreshold,
          result: diff <= defaultThreshold ? 'consistent' : 'discrepancy',
        })
      }
    }
  }

  // persist: rimuove i check precedenti per la request e inserisce i nuovi
  await supabase.from('cross_source_checks').delete().eq('request_id', requestId)
  if (results.length > 0) {
    await supabase.from('cross_source_checks').insert(
      results.map((r) => ({ request_id: requestId, ...r }))
    )
  }

  // genera anomalie per le discrepanze rilevate
  const discrepancies = results.filter((r) => r.result === 'discrepancy')
  if (discrepancies.length > 0) {
    await supabase.from('anomalies').insert(
      discrepancies.map((d) => ({
        request_id: requestId,
        severity: d.difference_pct && d.difference_pct > 15 ? 'high_risk' : 'warning',
        title: `${d.field_name}: differenza tra ${d.source_a} e ${d.source_b}`,
        description: `Differenza rilevata del ${d.difference_pct}% (soglia configurata: ${d.threshold_pct}%).`,
      }))
    )
  }

  return results
}

function numeric(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}
