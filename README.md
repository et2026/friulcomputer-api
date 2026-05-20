# Friulcomputer Backend — Integrazione Wix Bookings

## Cosa fa questo backend

- Chiama le **API Wix Bookings v2** con la tua chiave API per ottenere slot reali
- Espone gli slot alla PWA React in modo sicuro (la chiave API non è mai esposta al browser)
- Gestisce le notifiche push e il tracker dello stato riparazioni

---

## Setup in 5 minuti

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Configura le variabili d'ambiente
```bash
cp .env.example .env
```
Apri `.env` e inserisci:
- `WIX_API_KEY` → la nuova chiave API Wix che hai generato
- `VAPID_PUBLIC` / `VAPID_PRIVATE` → genera con:
  ```bash
  npx web-push generate-vapid-keys
  ```

### 3. Avvia in locale
```bash
npm run dev   # con auto-reload (nodemon)
# oppure
npm start     # produzione
```

Verifica che funzioni:
```
GET http://localhost:3001/api/health
```

---

## Deploy su Railway (consigliato, gratuito)

1. Vai su https://railway.app → New Project → Deploy from GitHub
2. Seleziona questo repository
3. In **Variables** aggiungi tutte le variabili del file `.env`
4. Railway assegna automaticamente un URL tipo `https://friulcomputer-backend.railway.app`
5. Copia quell'URL e incollalo nella PWA React:
   - Apri `src/pages/PrenotaPage.js`
   - Modifica la riga: `const API_BASE = 'https://TUO-BACKEND.railway.app'`

---

## Sostituisci i file nella PWA

Copia i file aggiornati nella cartella della PWA:
```bash
cp PrenotaPage.js  ../friulcomputer-pwa/src/pages/PrenotaPage.js
cp PrenotaPage.css ../friulcomputer-pwa/src/pages/PrenotaPage.css
```

---

## Endpoints API

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/health` | Stato del server |
| GET | `/api/services` | Lista servizi Wix Bookings |
| GET | `/api/availability?serviceId=X&date=YYYY-MM-DD` | Slot reali per data |
| POST | `/api/booking` | URL prenotazione Wix pre-compilato |
| GET | `/api/repairs?phone=X` | Stato riparazioni cliente |
| PUT | `/api/repairs/:id` | Aggiorna stato riparazione |
| POST | `/api/push/subscribe` | Registra notifiche push |
| POST | `/api/push/send` | Invia notifica broadcast |

---

## Sicurezza

- La `WIX_API_KEY` vive **solo** nel file `.env` sul server — mai nel codice, mai su GitHub
- Il file `.env` è in `.gitignore` — non viene mai committato
- La chiave Wix ha solo permessi di lettura su Bookings e Calendar
- Se sospetti una compromissione: revoca la chiave su `manage.wix.com → Impostazioni → API Keys` e genera una nuova

---

Site ID Wix: `f3c033c7-f2d4-4afe-a250-e147c58227e9`
