import React, { useState, useEffect, useCallback } from 'react';
import './PrenotaPage.css';

/*
  Sostituisci con l'URL del tuo backend Railway/Render dopo il deploy.
  In sviluppo locale usa http://localhost:3001
*/
const API_BASE = process.env.REACT_APP_API_URL || 'https://TUO-BACKEND.railway.app';

/* Formatta ISO date → "HH:MM" nel fuso Europe/Rome */
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
  });
}

/* Data minima prenotabile = domani */
function minDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/* Giorni della settimana chiusi (0=Dom, 6=Sab) */
const CLOSED_DAYS = [0, 6];

export default function PrenotaPage() {
  const [services,     setServices]     = useState([]);
  const [slots,        setSlots]        = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error,        setError]        = useState(null);
  const [submitted,    setSubmitted]    = useState(false);
  const [bookingUrl,   setBookingUrl]   = useState(null);

  const [form, setForm] = useState({
    serviceId:  '',
    date:       '',
    selectedSlot: null,
    nome:       '',
    telefono:   '',
    email:      '',
    note:       ''
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* Carica lista servizi Wix all'avvio */
  useEffect(() => {
    fetch(`${API_BASE}/api/services`)
      .then(r => r.json())
      .then(data => {
        setServices(data);
        if (data.length > 0) update('serviceId', data[0].id);
      })
      .catch(() => setError('Impossibile caricare i servizi. Controlla la connessione.'))
      .finally(() => setLoadingServices(false));
  }, []);

  /* Carica slot disponibili quando cambiano servizio o data */
  const loadSlots = useCallback(() => {
    if (!form.serviceId || !form.date) return;

    const dayOfWeek = new Date(form.date).getUTCDay();
    if (CLOSED_DAYS.includes(dayOfWeek)) {
      setSlots([]);
      setError('Il negozio è chiuso nei weekend. Scegli un giorno feriale.');
      return;
    }

    setLoadingSlots(true);
    setError(null);
    setSlots([]);
    update('selectedSlot', null);

    fetch(`${API_BASE}/api/availability?serviceId=${form.serviceId}&date=${form.date}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSlots(data.slots || []);
        if ((data.slots || []).length === 0) {
          setError('Nessuno slot disponibile per questa data. Prova un altro giorno.');
        }
      })
      .catch(err => setError(err.message || 'Errore nel caricamento degli slot.'))
      .finally(() => setLoadingSlots(false));
  }, [form.serviceId, form.date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  /* Invia prenotazione → ottieni URL Wix → redirect */
  const handleSubmit = async () => {
    if (!form.selectedSlot) { setError('Seleziona un orario disponibile.'); return; }
    if (!form.nome)          { setError('Inserisci il tuo nome.'); return; }
    if (!form.telefono)      { setError('Inserisci il tuo numero di telefono.'); return; }

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId:     form.serviceId,
          slotStartTime: form.selectedSlot.startTime,
          customerName:  form.nome,
          phone:         form.telefono,
          email:         form.email,
          note:          form.note,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBookingUrl(data.bookingUrl);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Errore durante la prenotazione.');
    }
  };

  /* ── Schermata di conferma ── */
  if (submitted && bookingUrl) {
    const slot = form.selectedSlot;
    const svc  = services.find(s => s.id === form.serviceId);
    return (
      <div className="page prenota-page">
        <div className="confirm-box">
          <div className="confirm-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="confirm-title">Quasi fatto!</h2>
          <p className="confirm-body">
            Clicca il pulsante per confermare la prenotazione sul sito Friulcomputer.
            Il form sarà già pre-compilato con i tuoi dati.
          </p>
          <div className="confirm-detail">
            <span>{svc?.name || 'Servizio'}</span>
            <span>{form.date} · {slot ? formatTime(slot.startTime) : ''}</span>
            <span>{form.nome} · {form.telefono}</span>
          </div>
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'flex', textDecoration: 'none', marginBottom: 12 }}>
            Conferma su friulcomputer.net →
          </a>
          <button className="btn-ghost" onClick={() => { setSubmitted(false); setBookingUrl(null); }}>
            Nuova prenotazione
          </button>
        </div>
      </div>
    );
  }

  /* ── Form principale ── */
  return (
    <div className="page prenota-page">
      <h2 className="page-title">Prenota riparazione</h2>
      <p className="page-sub">Seleziona il servizio e l'orario. Disponibilità in tempo reale.</p>

      {/* Servizio */}
      <div className="card">
        <p className="form-section-label">Tipo di servizio</p>
        {loadingServices ? (
          <div className="loading-row">
            <span className="spinner" aria-label="Caricamento servizi..." />
            <span>Caricamento servizi...</span>
          </div>
        ) : (
          <div className="service-chips">
            {services.map(s => (
              <button
                key={s.id}
                className={`service-chip ${form.serviceId === s.id ? 'active' : ''}`}
                onClick={() => update('serviceId', s.id)}
              >
                {s.name}
                {s.duration && <span className="chip-duration">{s.duration} min</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Data */}
      <div className="card">
        <p className="form-section-label">Data</p>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Scegli una data (lun–ven)</label>
          <input
            type="date"
            className="form-input"
            value={form.date}
            min={minDate()}
            onChange={e => update('date', e.target.value)}
          />
        </div>
      </div>

      {/* Slot orari */}
      <div className="card">
        <p className="form-section-label">
          Orari disponibili
          {form.date && !loadingSlots && slots.length > 0 && (
            <span className="slots-count"> · {slots.filter(s => s.bookable).length} liberi</span>
          )}
        </p>

        {!form.date && (
          <p className="slots-hint">Seleziona prima una data per vedere gli orari disponibili.</p>
        )}

        {loadingSlots && (
          <div className="loading-row">
            <span className="spinner" aria-label="Caricamento orari..." />
            <span>Caricamento disponibilità da Wix...</span>
          </div>
        )}

        {!loadingSlots && slots.length > 0 && (
          <>
            <div className="slots-grid">
              {slots.map((slot, i) => {
                const isSelected = form.selectedSlot?.startTime === slot.startTime;
                return (
                  <button
                    key={i}
                    className={`slot-btn ${!slot.bookable ? 'slot-busy' : ''} ${isSelected ? 'slot-selected' : ''}`}
                    disabled={!slot.bookable}
                    onClick={() => update('selectedSlot', slot)}
                    title={!slot.bookable ? 'Slot non disponibile' : `${slot.openSpots} posto/i disponibile/i`}
                  >
                    {formatTime(slot.startTime)}
                    {!slot.bookable && <span className="slot-x">✕</span>}
                  </button>
                );
              })}
            </div>
            <div className="slots-legend">
              <span className="legend-item"><span className="dot dot-free" />Disponibile</span>
              <span className="legend-item"><span className="dot dot-selected" />Selezionato</span>
              <span className="legend-item"><span className="dot dot-busy" />Occupato</span>
            </div>
          </>
        )}
      </div>

      {/* Dati cliente */}
      <div className="card">
        <p className="form-section-label">I tuoi dati</p>
        <div className="form-group">
          <label className="form-label">Nome e cognome *</label>
          <input type="text" className="form-input" placeholder="Mario Rossi"
            value={form.nome} onChange={e => update('nome', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Telefono *</label>
          <input type="tel" className="form-input" placeholder="+39 0432 574288"
            value={form.telefono} onChange={e => update('telefono', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" placeholder="mario@email.it"
            value={form.email} onChange={e => update('email', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Note aggiuntive</label>
          <textarea className="form-input form-textarea" rows="2"
            placeholder="Descrivi brevemente il problema..."
            value={form.note} onChange={e => update('note', e.target.value)} />
        </div>
      </div>

      {/* Errore */}
      {error && (
        <div className="error-box" role="alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={!form.selectedSlot || !form.nome || !form.telefono}
        style={{ marginTop: 4, marginBottom: 16, opacity: (!form.selectedSlot || !form.nome || !form.telefono) ? 0.4 : 1 }}
      >
        Procedi alla conferma →
      </button>
    </div>
  );
}
