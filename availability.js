/*
  GET /api/availability?serviceId=XXX&date=YYYY-MM-DD
  Ritorna gli slot reali disponibili da Wix Bookings
  Usa l'endpoint corretto: /bookings/v2/availability/slots
*/
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { serviceId, date } = req.query;
  if (!serviceId || !date) {
    return res.status(400).json({ error: 'serviceId e date sono obbligatori' });
  }

  const dayOfWeek = new Date(date).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(200).json({ date, serviceId, slots: [], closed: true });
  }

  const WIX_API_KEY = process.env.WIX_API_KEY;
  const WIX_SITE_ID = process.env.WIX_SITE_ID;

  // Range per il giorno richiesto in Europe/Rome (UTC+2)
  const fromDate = `${date}T00:00:00.000+02:00`;
  const toDate   = `${date}T23:59:59.000+02:00`;

  try {
    const url = new URL('https://www.wixapis.com/bookings/v2/availability/slots');
    url.searchParams.set('serviceId', serviceId);
    url.searchParams.set('startDate', fromDate);
    url.searchParams.set('endDate',   toDate);
    url.searchParams.set('timezone',  'Europe/Rome');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': WIX_API_KEY,
        'wix-site-id':  WIX_SITE_ID,
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Wix ${response.status}: ${err}`);
    }

    const data = await response.json();

    // Wix restituisce availabilityEntries o slots a seconda della versione
    const entries = data.availabilityEntries || data.slots || [];

    const slots = entries.map(entry => {
      const slot = entry.slot || entry;
      return {
        startTime: slot.startDate || slot.startTime,
        endTime:   slot.endDate   || slot.endTime,
        bookable:  entry.bookable !== false && (entry.openSpots === undefined || entry.openSpots > 0),
        openSpots: entry.openSpots ?? 1,
      };
    });

    slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    res.status(200).json({ date, serviceId, slots });

  } catch (err) {
    console.error('availability error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
