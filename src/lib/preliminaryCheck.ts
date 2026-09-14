/**
 * Controllo preliminare automatico — basato su regole verificabili, NON su
 * intelligenza artificiale. Non valuta il "contenuto" del business plan (per
 * farlo davvero servirebbe una vera integrazione AI con una chiave API reale,
 * non ancora collegata): controlla solo fatti oggettivi e dichiara sempre
 * chiaramente cosa ha controllato, per non far credere a una valutazione che
 * non è stata realmente fatta.
 */
export interface PreliminaryCheckInput {
  vatNumber: string
  amount: number | null
  hasBusinessPlan: boolean
  businessPlanSizeBytes?: number
}

export interface PreliminaryCheckResult {
  score: number
  notes: string
}

export function computePreliminaryCheck(input: PreliminaryCheckInput): PreliminaryCheckResult {
  const checks: { label: string; passed: boolean; points: number }[] = []

  const vatDigits = input.vatNumber.replace(/\D/g, '')
  const vatFormatValid = vatDigits.length === 11
  checks.push({ label: 'Formato Partita IVA valido (11 cifre)', passed: vatFormatValid, points: 35 })

  const amountSpecified = !!input.amount && input.amount > 0
  checks.push({ label: 'Importo del finanziamento specificato', passed: amountSpecified, points: 25 })

  checks.push({ label: 'Business plan / preventivo allegato', passed: input.hasBusinessPlan, points: 25 })

  const sizeOk = !input.hasBusinessPlan || (input.businessPlanSizeBytes ?? 0) > 1024
  checks.push({ label: 'Documento allegato non vuoto', passed: input.hasBusinessPlan && sizeOk, points: 15 })

  const score = checks.reduce((sum, c) => sum + (c.passed ? c.points : 0), 0)

  const notes =
    'Controllo preliminare automatico (basato su regole, non su AI): ' +
    checks.map((c) => `${c.passed ? '[OK]' : '[NO]'} ${c.label}`).join('; ') +
    '. Non sostituisce l\'analisi del merito creditizio né la lettura del contenuto del documento.'

  return { score, notes }
}
