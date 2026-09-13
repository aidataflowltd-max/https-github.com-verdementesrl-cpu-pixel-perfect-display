import { Link } from 'react-router-dom'
import { supabaseConfigured } from '../lib/supabase'

export default function Landing() {
  return (
    <div className="min-h-screen bg-night text-white flex flex-col">
      {!supabaseConfigured && (
        <div className="bg-warn/90 text-night text-center text-sm py-2 px-4">
          Database non ancora collegato — imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nel file .env
        </div>
      )}
      <header className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-verified" />
          <span className="font-semibold tracking-tight text-lg">VERIFIED</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/bank/login" className="text-white/70 hover:text-white transition">Accesso Banca</Link>
          <Link to="/super-admin/login" className="text-white/40 hover:text-white/70 transition">Super Admin</Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-3xl mx-auto">
        <div className="badge bg-white/5 text-verified border border-verified/30 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-verified" /> DATA PROVENANCE INFRASTRUCTURE
        </div>
        <h1 className="text-5xl font-semibold tracking-tight leading-tight">
          Verifica digitale dell'impresa,<br /> non un caricamento di PDF.
        </h1>
        <p className="mt-6 text-white/60 text-lg max-w-xl">
          VERIFIED acquisisce dati economici, fiscali, finanziari e societari direttamente dalle fonti
          autorizzate — banche, Agenzia Entrate, centrali rischi, Camera di Commercio — e produce uno
          snapshot immutabile con provenienza, hash e audit trail completi.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link to="/bank/login" className="btn-verified px-6 py-3 text-base">Accedi come Banca</Link>
          <a href="#come-funziona" className="btn-ghost !bg-transparent !border-white/20 !text-white px-6 py-3 text-base hover:!bg-white/5">
            Come funziona
          </a>
        </div>
      </main>

      <section id="come-funziona" className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
        {[
          ['1', 'Richiesta', 'La banca crea una richiesta di verifica e invia un link sicuro all’impresa.'],
          ['2', 'Autenticazione', 'L’impresa si autentica con OTP e presta consenso alle fonti richieste.'],
          ['3', 'Acquisizione', 'I dati vengono acquisiti da fonti autorizzate, non caricati a mano.'],
          ['4', 'Snapshot', 'Un Verified Company Snapshot immutabile viene generato con hash e audit trail.'],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-verified text-xs font-mono mb-2">STEP {n}</div>
            <div className="font-medium mb-1">{t}</div>
            <div className="text-white/50 text-sm">{d}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
