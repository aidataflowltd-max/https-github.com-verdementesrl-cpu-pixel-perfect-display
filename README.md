# VERIFIED — Piattaforma fintech B2B di verifica digitale impresa

App reale (non demo): autenticazione vera, database Postgres reale (Supabase),
OTP via email realmente inviato, hashing SHA-256 reale dei documenti, audit
log reale, Row Level Security reale. Le fonti esterne (Open Banking, Agenzia
Entrate, Centrale Rischi, Camera di Commercio) sono predisposte come
**Source Connector** ma restano `NOT CONFIGURED` finché non colleghi le
credenziali/API reali di un provider — il sistema non mostra mai un dato come
"verificato" se non è stato realmente acquisito da una fonte.

## 1. Database (Supabase)

1. Apri il tuo progetto su https://supabase.com/dashboard
2. Vai su **SQL Editor → New query**, incolla il contenuto di `supabase/schema.sql` ed esegui.
   Crea tutte le tabelle, i tipi, le policy RLS e il bucket di storage privato.
3. Vai su **Authentication → Providers** e assicurati che il provider **Email** sia attivo
   (di default lo è). Non serve altro per l'invio OTP: Supabase invia davvero le email.

## 2. Primo utente Super Admin (bootstrap)

Il primo Super Admin va creato manualmente una sola volta (dopo, si gestisce tutto dall'app):

1. **Authentication → Users → Invite user**, inserisci la tua email. Riceverai un'email reale per impostare la password.
2. Copia l'**UUID** dell'utente appena creato (colonna `id` nella lista utenti).
3. Torna su **SQL Editor** ed esegui (sostituendo l'UUID e il nome):

   ```sql
   insert into profiles (id, role, full_name)
   values ('INCOLLA-QUI-UUID', 'super_admin', 'Il tuo nome')
   on conflict (id) do update set role = 'super_admin';
   ```

4. Da qui in poi puoi accedere su `/super-admin/login` con quell'email/password.

## 3. Configurazione app

```bash
cp .env.example .env
```

Apri `.env` e inserisci:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=la-tua-anon-key
```

(Project Settings → API, nella dashboard Supabase — usa **solo** la `anon public key`, mai la `service_role`.)

## 4. Avvio

```bash
npm install
npm run dev
```

Apri l'URL mostrato (in un Codespace, la porta 5173 viene esposta automaticamente).

## 5. Flusso di prova end-to-end

1. Login su `/super-admin/login` → tab **Banks** → crea una banca.
2. Tab **Sources** → aggiungi qualche fonte (es. "CRIF", "Camera di Commercio") — nascono `NOT CONFIGURED`.
3. Invita un secondo utente (**Authentication → Invite user**) da assegnare come `bank_admin` alla banca creata: tab **Users** → seleziona ruolo `bank_admin` e la banca → Salva.
4. Accedi con quell'utente su `/bank/login`.
5. **Nuova Richiesta** → inserisci un'azienda reale/di prova, la tua email come referente, scegli le fonti → genera il link sicuro.
6. Apri il link in una nuova scheda (o incognito) → inserisci email/telefono → riceverai un vero codice OTP via email → verificalo → accetta il consenso.
7. Nella Company Verification Dashboard: prova a caricare un documento (hash SHA-256 reale calcolato nel browser) e ad "avviare verifica" sulle fonti (che risulteranno `NOT CONFIGURED` finché non colleghi un provider reale).
8. Torna nel Bank Portal → apri la richiesta → tab **Snapshot** → genera il Verified Company Snapshot (immutabile, con hash del dataset).

## 6. Collegare una fonte reale in futuro

Ogni Source Connector è pensato per essere sostituito con un'integrazione vera senza
cambiare lo schema: aggiorna `sources.status` a `connected` solo dopo aver
implementato davvero l'OAuth/redirect verso il provider (Open Banking/AISP,
Agenzia Entrate, CRIF/Cerved, Registro Imprese) e salvato le credenziali in un
secret manager (mai nel database in chiaro — il campo `credentials_reference`
è pensato per un puntatore, non per il segreto stesso).

## Struttura

```
supabase/schema.sql       Schema DB completo + RLS + funzioni admin
src/lib/                  Supabase client, tipi, hashing, audit, trust score, cross-source engine
src/pages/bank/           Bank Portal (login, dashboard, nuova richiesta, snapshot)
src/pages/company/        Flusso impresa (invito, OTP, consenso, dashboard verifica)
src/pages/admin/          Super Admin (users, banks, companies, sources, requests, audit log)
```
