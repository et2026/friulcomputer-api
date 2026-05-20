/*
  ============================================================
  Friulcomputer PWA — Backend Node.js
  Integrazione reale con Wix Bookings API v2
  ============================================================
  Endpoints:
    GET  /api/services              → lista servizi di prenotazione
    GET  /api/availability          → slot disponibili per data e servizio
    POST /api/booking               → redirect URL per completare su Wix
    GET  /api/repairs?phone=XXX     → stato riparazioni cliente
    PUT  /api/repairs/:id           → aggiorna stato (uso interno)
    POST /api/push/subscribe        → salva subscription push
    POST /api/push/send             → invia notifica push

  Setup:
    cp .env.example .env
    (inserisci la tua WIX_API_KEY nel .env)
    npm install
    node server.js
  ============================================================
*/

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const webpush   = require('web-push');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

/* ── Costanti Wix ── */
const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_SITE_ID = process.env.WIX_SITE_ID || 'f3c033c7-f2d4-4afe-a250-e147c58227e9';
const WIX_BASE    = 'https://www.wixapis.com/bookings/v2';

if (!WIX_API_KEY || WIX_API_KEY.startsWith('IST.eyJ...')) {
  console.warn('\n⚠️  WIX_API_KEY non configurata nel file .env — le chiamate Wix falliranno.\n');
}

/* ── VAPID push notifications ── */
if (process.env.VAPID_PUBLIC && !process.env.VAPID_PUBLIC.startsWith('GENERA')) {
  webpush.setVapidDetails(
    'mailto:info@friulcomputer.net',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
}

/* ── Helper: chiamata autenticata alle API Wix ── */
async function wixFetch(path, options = {}) {
  const url = `${WIX_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': WIX_API_KEY,
      'wix-site-id':  WIX_SITE_ID,
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wix API ${res.status}: ${err}`);
  }
  return res.json();
}

/* ─────────────────────────────────────────────
   ROUTE 1 — Lista servizi disponibili
   GET /api/services
   Ritorna tutti i servizi di prenotazione Wix
   con id, nome, durata e descrizione.
───────────────────────────────────────────── */
app.get('/api/services', async (req, res) => {
  try {
    const data = await wixFetch('/services/query', {
      method: 'POST',
      body: JSON.stringify({
        query: { filter: { 'hidden': false }, paging: { limit: 50 } }
      })
    });

    const services = (data.services || []).map(s => ({
      id:          s.id,
      name:        s.name,
      description: s.description || '',
      duration:    s.schedule?.availabilityConstraints?.sessionDurations?.[0] || 30,
      category:    s.category?.name || 'Riparazione',
    }));

    res.json(services);
  } catch (err) {
    console.error('Errore /api/services:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   ROUTE 2 — Slot disponibili per data/servizio
   GET /api/availability?serviceId=XXX&date=YYYY-MM-DD
   Ritorna gli slot reali da Wix Bookings,
   distinguendo disponibili da occupati.
───────────────────────────────────────────── */
app.get('/api/availability', async (req, res) => {
  const { serviceId, date } = req.query;

  if (!serviceId || !date) {
    return res.status(400).json({ error: 'Parametri mancanti: serviceId e date sono obbligatori' });
  }

  /* Costruisce range orario per il giorno richiesto (fuso Europe/Rome) */
  const fromDate = new Date(`${date}T00:00:00+02:00`).toISOString();
  const toDate   = new Date(`${date}T23:59:59+02:00`).toISOString();

  try {
    const data = await wixFetch('/availability/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          filter: {
            serviceId:  [serviceId],
            startDate:  fromDate,
            endDate:    toDate,
          }
        }
      })
    });

    const slots = (data.availabilityEntries || []).map(entry => ({
      startTime:  entry.slot?.startDate,
      endTime:    entry.slot?.endDate,
      bookable:   entry.bookable === true,
      openSpots:  entry.openSpots ?? (entry.bookable ? 1 : 0),
      slotId:     entry.slot?.sessionId || null,
    }));

    /* Ordina per orario crescente */
    slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    res.json({ date, serviceId, slots });
  } catch (err) {
    console.error('Errore /api/availability:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   ROUTE 3 — URL di prenotazione Wix
   POST /api/booking
   Body: { serviceId, slotStartTime, customerName, phone, email }
   Ritorna l'URL della pagina Wix per completare
   la prenotazione (il checkout avviene su Wix).
───────────────────────────────────────────── */
app.post('/api/booking', async (req, res) => {
  const { serviceId, slotStartTime, customerName, phone, email, note } = req.body;

  if (!serviceId || !slotStartTime) {
    return res.status(400).json({ error: 'serviceId e slotStartTime sono obbligatori' });
  }

  /* Costruisce URL prenotazione Wix con parametri pre-compilati */
  const params = new URLSearchParams({
    serviceId,
    startTime: slotStartTime,
    ...(customerName && { name: customerName }),
    ...(email        && { email }),
    ...(phone        && { phone }),
  });

  /* URL di book-online Wix — Wix pre-compila il form con i parametri */
  const bookingUrl = `https://www.friulcomputer.net/book-online?${params.toString()}`;

  res.json({ bookingUrl });
});

/* ─────────────────────────────────────────────
   ROUTE 4 — Stato riparazioni
   GET /api/repairs?phone=XXX
   In produzione: collegare al gestionale interno.
   Ora usa un DB in-memory con dati di esempio.
───────────────────────────────────────────── */
let repairsDB = [
  {
    id: 'FC-2026-0412',
    phone: '+390432574288',
    device: 'iPhone 15 Pro',
    problem: 'Sostituzione schermo',
    status: 'in_lavorazione',
    currentStep: 2,
    tech: 'Marco R.',
    note: 'Schermo originale Apple in arrivo.',
    date: '2026-05-16',
  },
];

app.get('/api/repairs', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone obbligatorio' });
  const found = repairsDB.filter(r => r.phone === phone);
  res.json(found);
});

app.put('/api/repairs/:id', (req, res) => {
  const repair = repairsDB.find(r => r.id === req.params.id);
  if (!repair) return res.status(404).json({ error: 'Pratica non trovata' });

  const { status, currentStep, note } = req.body;
  if (status !== undefined)      repair.status = status;
  if (currentStep !== undefined) repair.currentStep = currentStep;
  if (note !== undefined)        repair.note = note;

  /* Notifica push al cliente se c'è una subscription registrata */
  const sub = pushSubscriptions.find(s => s.repairId === req.params.id);
  if (sub && process.env.VAPID_PUBLIC && !process.env.VAPID_PUBLIC.startsWith('GENERA')) {
    const payload = JSON.stringify({
      title: `Aggiornamento: ${repair.device}`,
      body:  repair.note || `Stato aggiornato: ${status}`,
      url:   '/stato'
    });
    webpush.sendNotification(sub.subscription, payload).catch(console.error);
  }

  res.json(repair);
});

/* ─────────────────────────────────────────────
   ROUTE 5 — Notifiche push
───────────────────────────────────────────── */
let pushSubscriptions = [];

app.post('/api/push/subscribe', (req, res) => {
  const { subscription, repairId } = req.body;
  pushSubscriptions.push({ subscription, repairId });
  res.status(201).json({ ok: true });
});

app.post('/api/push/send', async (req, res) => {
  const { title, body, url } = req.body;
  const payload = JSON.stringify({ title, body, url: url || '/' });
  const sends = pushSubscriptions.map(s =>
    webpush.sendNotification(s.subscription, payload).catch(() => null)
  );
  await Promise.all(sends);
  res.json({ sent: pushSubscriptions.length });
});

/* ─────────────────────────────────────────────
   Health check
───────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    siteId: WIX_SITE_ID,
    wixKeyConfigured: WIX_API_KEY && !WIX_API_KEY.startsWith('IST.eyJ...'),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Friulcomputer backend avviato su porta ${PORT}`);
  console.log(`   Site ID Wix: ${WIX_SITE_ID}`);
  console.log(`   Wix API Key: ${WIX_API_KEY ? '✓ configurata' : '✗ MANCANTE — configura .env'}\n`);
});
