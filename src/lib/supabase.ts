import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// Se le variabili d'ambiente non sono configurate, il client viene comunque
// creato con valori placeholder per evitare crash: le pagine controllano
// `supabaseConfigured` e mostrano un avviso invece di chiamare l'API.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key'
)
