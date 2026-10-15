'use strict';
/* -------------------- 3) UTILS -------------------- */
function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function oggiISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtData(iso) {
  if (!iso) return '—';
  const [y,m,g] = iso.split('-');
  return `${g}/${m}/${y}`;
}
function fmtDataBreve(iso) {
  if (!iso) return '—';
  const [y,m,g] = iso.split('-');
  return `${g} ${MESI_IT[Number(m)-1]}`;
}
function fmtDataOra(isoDataOra) {
  if (!isoDataOra) return '—';
  const d = new Date(isoDataOra);
  if (isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Solo l'ora (chat interna, task Matteo: "non serve che ogni messaggio abbia data+ora, basterebbe
// fare come whatsapp che mette la data dentro la chat direttamente e sui messaggi mette solo l'ora").
function fmtOraSemplice(isoDataOra) {
  if (!isoDataOra) return '';
  const d = new Date(isoDataOra);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Separatore di data stile WhatsApp dentro il flusso della chat, invece di ripetere data+ora su
// ogni singolo messaggio.
function fmtDataSeparatoreChat(iso) {
  if (!iso) return '';
  const oggi = oggiISO();
  const ieriD = new Date(); ieriD.setDate(ieriD.getDate() - 1);
  const ieri = ieriD.getFullYear() + '-' + String(ieriD.getMonth()+1).padStart(2,'0') + '-' + String(ieriD.getDate()).padStart(2,'0');
  if (iso === oggi) return 'Oggi';
  if (iso === ieri) return 'Ieri';
  const annoCorrente = new Date().getFullYear();
  const [y] = iso.split('-');
  return fmtDataBreve(iso) + (Number(y) !== annoCorrente ? ' ' + y : '');
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function statoBadgeClass(stato) {
  return 'stato-' + slug(stato);
}
function clienteById(id) {
  return STATE.clienti.find(c => c.id === id);
}
/* Campo data "gg/mm/aaaa" a tastiera: con il <input type="date"> nativo Tab, dopo l'anno, finiva sul pulsantino del
   calendario (che nel browser non si puo escludere dall'ordine dei tab) e SOLO dopo sul campo successivo. Qui il testo si
   scrive con la tastiera (le barre si mettono da sole), Tab passa subito al campo dopo e il pulsantino resta per chi vuole
   scegliere col mouse (tabindex=-1: non si raggiunge con Tab). Il valore salvato resta ISO (aaaa-mm-gg). */
function campoDataTesto(azione, iso) {
  const visto = iso ? fmtData(iso) : '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;position:relative;">
    <input type="text" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${escapeHtml(visto)}" data-action="${azione}" style="width:104px;">
    <button type="button" class="btn small ghost" tabindex="-1" data-action="apri-calendario-campo" data-target="${azione}" title="Scegli dal calendario" style="padding:3px 6px;">📅</button>
    <input type="date" tabindex="-1" aria-hidden="true" value="${escapeHtml(iso || '')}" data-action="${azione}-picker" style="position:absolute;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;">
  </span>`;
}
/* "gg/mm/aaaa", "ggmmaaaa" o ISO -> ISO valido, '' se vuoto, null se non valido. */
function parseDataTesto(t) {
  t = String(t || '').trim();
  if (!t) return '';
  let g, m, a, x;
  if ((x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { a = +x[1]; m = +x[2]; g = +x[3]; }
  else if ((x = /^(\d{1,2})[\/.\-\s]?(\d{1,2})[\/.\-\s]?(\d{4})$/.exec(t))) { g = +x[1]; m = +x[2]; a = +x[3]; }
  else return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}
function maschera_data_testo(el) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return; // ISO incollato: lo si interpreta all'uscita dal campo
  const c = el.value.replace(/\D/g, '').slice(0, 8);
  el.value = c.length > 4 ? `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}` : (c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c);
}
/* Chi addebita l'F24 per quel cliente (campo "Addebito F24" dell'anagrafica): mostrato in ogni riga delle scadenze periodiche. */
function badgeAddebitoF24(clienteId) {
  const c = clienteById(clienteId);
  const v = c && c.addebitoF24;
  if (!v) return '<span class="helptext" title="Non indicato in anagrafica">—</span>';
  const etichetta = { NOI: 'Studio', CLIENTE: 'Cliente', 'NOI/CLIENTE': 'Studio o cliente' }[v] || v;
  const stile = v === 'NOI' ? 'background:var(--blu-light);color:var(--blu-scuro);' : (v === 'CLIENTE' ? 'background:var(--giallo-bg);color:var(--giallo);' : 'background:var(--bg);color:var(--text-mut);border:1px solid var(--border);');
  return `<span class="badge" style="${stile}" title="Addebito F24 (da anagrafica)">${escapeHtml(etichetta)}</span>`;
}
function nomeCliente(id) {
  const c = clienteById(id);
  return c ? c.ragioneSociale : '(cliente eliminato)';
}
function deltaLabel(dataISO) {
  const d = giorniTra(oggiISO(), dataISO);
  if (d < 0) return { txt: `Scaduto ${Math.abs(d)}gg fa`, cls: 'scaduto' };
  if (d === 0) return { txt: 'OGGI', cls: 'oggi' };
  if (d <= 7) return { txt: `Tra ${d}gg`, cls: 'vicino' };
  if (d <= 30) return { txt: `Tra ${d}gg`, cls: 'vicino' };
  return { txt: `Tra ${d}gg`, cls: 'lontano' };
}
function toast(msg, isError) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, isError ? 7000 : 4200);
}
/* Conferma a tema Prisma (al posto del window.confirm() nativo, col font di sistema e il furto di focus).
   Il chiamante resta SINCRONO (52 punti d'uso: `if (confermaAzione(..)) {..}`): quando la chiamata avviene
   dentro un click gestito da onClickDelegato, mostriamo l'overlay, rispondiamo "no" e, se l'utente preme
   il pulsante di conferma, RIESEGUIAMO lo stesso click con quel messaggio già approvato. Più conferme in
   fila (es. "Svuota tutti i dati") funzionano allo stesso modo: ognuna approvata resta in
   CONFERME_APPROVATE finché la catena non finisce o viene annullata.
   Fuori da un click (o nei test jsdom) si ricade sul window.confirm() classico. */
let CONFERMA_CTX = null;
let CONFERMA_PENDENTE = null;
const CONFERME_APPROVATE = new Set();
function confermaAzione(msg, opz) {
  const modoTest = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent) && !window.__forzaConfermaPrisma;
  if (modoTest || !CONFERMA_CTX || typeof document === 'undefined') return window.confirm(msg);
  if (CONFERME_APPROVATE.has(msg)) return true;
  if (document.getElementById('confermaPrismaOverlay')) return false;
  const replay = CONFERMA_CTX.replay;
  mostraConfermaPrisma(msg, opz || {}, () => {
    CONFERME_APPROVATE.add(msg);
    replay();
    // se la riesecuzione non ha aperto un'altra conferma la catena è finita
    if (!document.getElementById('confermaPrismaOverlay')) CONFERME_APPROVATE.clear();
  });
  return false;
}
function mostraConfermaPrisma(msg, opz, onOk) {
  const div = document.createElement('div');
  div.id = 'confermaPrismaOverlay';
  div.className = 'conferma-chiusura-overlay';
  const pericolo = opz.pericolo !== false && /elimin|cancell|svuot|azzer|irreversibil|sovrascriv|sostitu|ripristin/i.test(msg + ' ' + (opz.conferma || ''));
  div.innerHTML = `<div class="conferma-chiusura-box" role="alertdialog" aria-modal="true">
    <div style="font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--blu-scuro);margin-bottom:8px;">${opz.titolo ? escapeHtml(opz.titolo) : 'PRISMA'}</div>
    <div class="conferma-chiusura-testo">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>
    <div class="conferma-chiusura-azioni">
      <button type="button" class="btn" data-action="conferma-prisma-annulla">${escapeHtml(opz.annulla || 'Annulla')}</button>
      <button type="button" class="btn ${pericolo ? 'danger' : 'primary'}" data-action="conferma-prisma-ok">${escapeHtml(opz.conferma || 'OK')}</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  CONFERMA_PENDENTE = onOk;
  const b = div.querySelector('[data-action="conferma-prisma-annulla"]');
  if (b) b.focus(); // il focus sul "no": un Invio per sbaglio non cancella nulla
}
function chiudiConfermaPrisma(ok) {
  const el = document.getElementById('confermaPrismaOverlay');
  if (el) el.remove();
  const cb = CONFERMA_PENDENTE; CONFERMA_PENDENTE = null;
  if (ok && cb) cb(); else CONFERME_APPROVATE.clear();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && typeof document !== 'undefined' && document.getElementById('confermaPrismaOverlay')) { e.stopPropagation(); chiudiConfermaPrisma(false); }
}, true);
/* Banner di avviso "il server sta per riavviarsi" (task Matteo: pulsante Riavvia server con avviso
   agli utenti online) - creato direttamente su document.body, non dentro #content, così resta
   visibile qualunque sia la vista aperta e sopravvive ai render() successivi. */
// Task Matteo (revisione del flusso): fino a 60 secondi di preavviso, ma con due pulsanti invece di
// uno solo - "✓ Ho visto, va bene" (se lo premono TUTTI gli operatori online il riavvio parte
// subito, senza aspettare il resto del countdown - lo decide il server, vedi 'subito' nella
// risposta e l'evento SSE riavvioSubito) e "✕ Rifiuta" (un solo rifiuto ANNULLA il riavvio del
// tutto, vedi l'evento SSE riavvioAnnullato - a differenza della vecchia versione, qui blocca
// davvero, non è solo un riscontro). Durante la fase finale (countdown a zero, o riavvio anticipato)
// un overlay a schermo intero blocca ogni interazione con l'app, invece di lasciare che i click
// vadano a vuoto contro un server che nel frattempo si sta riavviando (task Matteo: "non si può
// accedere mentre sta aggiornando").
let RIAVVIO_CONFERME_RICEVUTE = [];
let RIAVVIO_TIMER_CLIENT = null;
function creaOverlayBloccoRiavvio() {
  let overlay = document.getElementById('overlayBloccoRiavvio');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'overlayBloccoRiavvio';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(10,14,24,.55);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:22px 28px;max-width:320px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25);"><div style="font-size:28px;margin-bottom:8px;">🔄</div><div style="font-weight:700;margin-bottom:4px;">Aggiornamento in corso</div><div style="font-size:13px;color:var(--text-mut);">Il gestionale si sta riavviando: non puoi lavorare per qualche secondo, la pagina si ricarica da sola.</div></div>';
  document.body.appendChild(overlay);
  return overlay;
}
function rimuoviOverlayBloccoRiavvio() {
  const overlay = document.getElementById('overlayBloccoRiavvio');
  if (overlay) overlay.remove();
}
function mostraAvvisoRiavvioServer(secondi) {
  RIAVVIO_CONFERME_RICEVUTE = [];
  if (RIAVVIO_TIMER_CLIENT) { clearInterval(RIAVVIO_TIMER_CLIENT); RIAVVIO_TIMER_CLIENT = null; }
  let box = document.getElementById('avvisoRiavvioServer');
  if (!box) {
    box = document.createElement('div');
    box.id = 'avvisoRiavvioServer';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--arancio,#e08a2c);color:#fff;text-align:center;padding:10px 16px;font-weight:600;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;';
    document.body.appendChild(box);
  }
  box.style.background = 'var(--arancio,#e08a2c)';
  let restante = Number(secondi) || 60;
  const disegna = () => {
    box.innerHTML = `<span id="avvisoRiavvioServerTesto">⚠️ Il server sta per riavviarsi tra ${restante} secondi — salva eventuali modifiche in corso.</span>` +
      `<button class="btn small" data-action="conferma-riavvio-server" style="background:#fff;color:var(--arancio,#e08a2c);border:none;">✓ Ho visto, va bene</button>` +
      `<button class="btn small" data-action="rifiuta-riavvio-server" style="background:transparent;color:#fff;border:1px solid #fff;">✕ Rifiuta</button>` +
      `<span id="avvisoRiavvioServerConferme" style="font-size:12px;opacity:.9;"></span>`;
    aggiornaTestoConfermeRiavvio();
  };
  disegna();
  RIAVVIO_TIMER_CLIENT = setInterval(() => {
    restante -= 1;
    if (restante <= 0) {
      avviaFaseFinaleRiavvio();
    } else {
      const t = document.getElementById('avvisoRiavvioServerTesto');
      if (t) t.textContent = `⚠️ Il server sta per riavviarsi tra ${restante} secondi — salva eventuali modifiche in corso.`;
    }
  }, 1000);
}
// Fase finale, sia per countdown naturale a zero sia per riavvio anticipato (tutti hanno confermato,
// vedi evento SSE riavvioSubito): banner rosso + overlay a schermo intero che blocca ogni click,
// poi un reload automatico una volta dato tempo al server di essere di nuovo pronto.
function avviaFaseFinaleRiavvio() {
  if (RIAVVIO_TIMER_CLIENT) { clearInterval(RIAVVIO_TIMER_CLIENT); RIAVVIO_TIMER_CLIENT = null; }
  const box = document.getElementById('avvisoRiavvioServer');
  if (box) {
    box.innerHTML = '🔄 Server in riavvio, sto ricaricando la pagina tra qualche secondo...';
    box.style.background = 'var(--rosso,#c0392b)';
  }
  creaOverlayBloccoRiavvio();
  // Il server si rilancia davvero da solo (non solo si chiude) - proviamo a ricaricare in automatico
  // dopo che ha avuto il tempo di ripartire, invece di lasciare che sia l'utente a doverlo ricordare/
  // fare a mano; se il server non fosse ancora pronto il reload fallisce in modo silenzioso e la
  // pagina resta quella vecchia con banner/overlay ancora visibili (nessun rischio di lavorare "a
  // vuoto" nel frattempo, dato che l'overlay blocca comunque ogni interazione).
  setTimeout(() => { try { window.location.reload(); } catch (err) { /* niente da fare qui */ } }, 6000);
}
// Un riavvio richiesto è stato ANNULLATO (un operatore ha premuto "Rifiuta") - a differenza della
// vecchia versione qui è un vero blocco, non solo un avviso: il banner sparisce e non c'è nessun
// riavvio in corso finché qualcuno non lo richiede di nuovo da Impostazioni.
function gestisciRiavvioAnnullato(daOperatore) {
  if (RIAVVIO_TIMER_CLIENT) { clearInterval(RIAVVIO_TIMER_CLIENT); RIAVVIO_TIMER_CLIENT = null; }
  const box = document.getElementById('avvisoRiavvioServer');
  if (box) box.remove();
  rimuoviOverlayBloccoRiavvio();
  toast(`🛑 Riavvio del server annullato${daOperatore ? (' da ' + daOperatore) : ''}.`);
}
function aggiornaTestoConfermeRiavvio() {
  const el = document.getElementById('avvisoRiavvioServerConferme');
  if (!el) return;
  el.textContent = RIAVVIO_CONFERME_RICEVUTE.length ? `(confermato da: ${RIAVVIO_CONFERME_RICEVUTE.join(', ')})` : '';
}
function aggiornaConfermeRiavvioServer(conferme) {
  RIAVVIO_CONFERME_RICEVUTE = conferme;
  aggiornaTestoConfermeRiavvio();
}
function confermaVistaRiavvioServer() {
  const nome = operatoreCorrente() || 'un operatore';
  const btn = document.querySelector('#avvisoRiavvioServer [data-action="conferma-riavvio-server"]');
  if (btn) { btn.disabled = true; btn.textContent = '✓ Confermato'; }
  fetch('/api/server/riavvio-conferma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatore: nome }) })
    .then(r => r.json()).then(d => {
      if (!d || !d.ok) return;
      aggiornaConfermeRiavvioServer(d.conferme || []);
      // Tutti gli online al momento della richiesta hanno confermato: il server sta per riavviarsi
      // subito, non serve aspettare il resto del countdown locale (l'evento SSE riavvioSubito
      // arriverebbe comunque, ma passare subito qui evita una finestra morta se la connessione SSE
      // avesse un ritardo).
      if (d.subito) avviaFaseFinaleRiavvio();
    })
    .catch(() => {});
}
function rifiutaRiavvioServer() {
  const nome = operatoreCorrente() || 'un operatore';
  const btn = document.querySelector('#avvisoRiavvioServer [data-action="rifiuta-riavvio-server"]');
  if (btn) { btn.disabled = true; }
  fetch('/api/server/riavvio-rifiuta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatore: nome }) })
    .then(r => r.json()).then(d => { if (d && d.ok) gestisciRiavvioAnnullato(nome); })
    .catch(() => { gestisciRiavvioAnnullato(nome); }); // server irraggiungibile: comunque non ha senso restare in un countdown fantasma qui
}
/* Copia negli appunti con ripiego: l'API moderna (navigator.clipboard) richiede un contesto
   sicuro (HTTPS o localhost) e potrebbe non essere disponibile su una rete studio raggiunta via
   http:// semplice da un indirizzo IP — in quel caso si ripiega sul vecchio execCommand('copy') via
   una textarea temporanea, che funziona ovunque anche se deprecato. */
function copiaTestoNegliAppunti(testo, messaggioOk) {
  if (!testo) return;
  const msg = messaggioOk || 'Link copiato negli appunti.';
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = testo;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast(msg);
    } catch (e) {
      toast('Non sono riuscito a copiare automaticamente: seleziona il testo a mano.', true);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(testo).then(() => toast(msg)).catch(fallback);
  } else {
    fallback();
  }
}

/* Bug segnalato da Matteo: "quando copio il link da ngrok per la porta collaboratori mi dà il link
   da usare all'interno della rete" - il vecchio pulsante unico copiava sempre http://localhost:<porta>,
   che funziona SOLO sul PC dello studio (per chiunque altro apra quel link, "localhost" punta al
   PROPRIO PC, non a quello dello studio: un link inutile/fuorviante da mandare a un collega).
   Ora due pulsanti distinti, ognuno con la sua fonte reale:
   - link di rete locale: IP reale del PC dello studio sulla rete (vedi /api/indirizzi-rete),
     valido solo per chi è sulla stessa rete (es. ufficio, stessa WiFi).
   - link ngrok: l'indirizzo pubblico VERO assegnato da ngrok in quel momento (vedi
     /api/ngrok-tunnels sul server, che interroga l'API locale di ngrok), valido da internet ma
     SOLO se ngrok è acceso in quel momento su questo PC con un tunnel verso questa porta. */
function copiaLinkRete(porta) {
  fetch('/api/indirizzi-rete').then(r => r.json()).then(d => {
    if (!d.ok || !d.indirizzi || !d.indirizzi.length) {
      toast('Nessun indirizzo di rete locale rilevato su questo PC (controlla che sia collegato alla rete/WiFi dello studio).', true);
      return;
    }
    const link = `http://${d.indirizzi[0]}:${porta}/`;
    const nota = d.indirizzi.length > 1 ? ` Nota: questo PC ha più indirizzi di rete (${d.indirizzi.join(', ')}) — se non funziona prova gli altri.` : '';
    copiaTestoNegliAppunti(link, `Link di rete locale copiato: funziona solo per chi è sulla stessa rete dello studio.${nota}`);
  }).catch(() => toast('Non sono riuscito a leggere l\'indirizzo di rete dal server locale.', true));
}
function copiaLinkNgrok(porta) {
  fetch('/api/ngrok-tunnels').then(r => r.json()).then(d => {
    if (!d.ok) {
      toast(`Ngrok non risulta in esecuzione su questo PC in questo momento: premi "🚀 Avvia ngrok" (o aprilo tu da terminale con "ngrok http ${porta}") e riprova.`, true);
      return;
    }
    const tunnel = (d.tunnel || []).find(t => t.porta === porta);
    if (!tunnel) {
      toast(`Ngrok è acceso ma non ha un tunnel verso la porta ${porta} in questo momento: lancia "ngrok http ${porta}" da terminale e riprova.`, true);
      return;
    }
    copiaTestoNegliAppunti(tunnel.publicUrl, 'Link ngrok copiato: funziona da internet, finché tieni ngrok aperto su questo PC.');
  }).catch(() => toast('Non sono riuscito a interrogare ngrok dal server locale.', true));
}

/* Richiesta di Matteo: non vuole un pulsante "copia comando" da incollare a mano nel terminale, ma
   un pulsante che avvii ngrok direttamente. Il server lancia "ngrok http <porta>" come processo
   figlio (vedi /api/avvia-ngrok) - qui si avvisa l'utente subito, poi si interroga /api/ngrok-tunnels
   a intervalli brevi per un po': appena il tunnel compare (ngrok impiega un paio di secondi ad
   alzarsi ed esporre la sua API locale) si copia da solo il link pubblico, così in un solo clic si
   ottiene tunnel acceso + link in clipboard, senza toccare alcun terminale. */
function avviaNgrokDaPrisma(porta, titoloPulsante) {
  const btn = document.querySelector(`[data-action="avvia-ngrok"][data-porta="${porta}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Avvio ngrok…'; }
  const ripristinaBottone = () => { if (btn) { btn.disabled = false; btn.textContent = titoloPulsante; } };
  fetch('/api/avvia-ngrok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ porta }),
  }).then(r => r.json()).then(d => {
    if (!d.ok) {
      toast(d.errore || 'Non sono riuscito ad avviare ngrok.', true);
      ripristinaBottone();
      return;
    }
    toast(d.giaAttivo ? 'ngrok risultava già avviato da Prisma per questa porta: verifico il link…' : 'ngrok in avvio… verifico il link pubblico.');
    // Qualche tentativo a distanza di 1.5s: appena ngrok espone il tunnel lo si copia da solo e ci
    // si ferma - se dopo alcuni tentativi non compare ancora, si avvisa senza continuare all'infinito
    // (es. ngrok partito ma senza authtoken configurato: resta acceso ma senza tunnel HTTP).
    let tentativi = 0;
    const MAX_TENTATIVI = 8;
    const prova = () => {
      tentativi++;
      fetch('/api/ngrok-tunnels').then(r => r.json()).then(dt => {
        const tunnel = dt.ok ? (dt.tunnel || []).find(t => t.porta === porta) : null;
        if (tunnel) {
          copiaTestoNegliAppunti(tunnel.publicUrl, 'ngrok avviato: link pubblico copiato, funziona da internet finché resta aperto.');
          ripristinaBottone();
          return;
        }
        if (tentativi >= MAX_TENTATIVI) {
          toast('ngrok sembra avviato ma non ha ancora esposto un tunnel per questa porta: controlla che sia configurato con un authtoken (ngrok config add-authtoken ...) e riprova tra poco con "🌐 Copia link ngrok".', true);
          ripristinaBottone();
          return;
        }
        setTimeout(prova, 1500);
      }).catch(() => { ripristinaBottone(); });
    };
    setTimeout(prova, 1500);
  }).catch(() => { toast('Non sono riuscito a contattare il server locale per avviare ngrok.', true); ripristinaBottone(); });
}

/* -------------------- DERIVED: ricalcola tutto per l'anno corrente -------------------- */
function derivati() {
  const anno = STATE.annoCorrente;
  const periodiche = generaScadenzePeriodiche(STATE.clienti, anno, STATE.scadenzeOverrides).filter(sc => { const cc = clienteById(sc.clienteId); return !(cc && cc.stato === 'cessato' && cc.dataCessazione && sc.data > cc.dataCessazione); });
  const righeRitenuteAnno = STATE.ritenuteRighe.filter(r => new Date(r.dataPagamento+'T00:00:00').getFullYear() === anno
    || new Date(r.dataPagamento+'T00:00:00').getFullYear() === anno - 1); // includiamo dicembre anno prec. che può slittare a gennaio anno corrente
  const { scadenze: ritenuteScad } = generaScadenzeRitenute(STATE.ritenuteRighe, STATE.scadenzeOverrides);
  const ritenuteScadAnno = ritenuteScad.filter(s => s.data.startsWith(String(anno)));
  const tutte = periodiche.concat(ritenuteScadAnno);
  const annuali = generaAdempimentiAnnuali(STATE.clienti, anno, STATE.annualiOverrides);
  return { periodiche, ritenuteScad: ritenuteScadAnno, tutteScadenze: tutte, annuali };
}

/* -------------------- MUTAZIONI (aggiornano STATE + salvano) -------------------- */
function aggiornaScadenza(id, patch, fasiNote) {
  const cur = STATE.scadenzeOverrides[id] || {};
  /* Se la scelta è una fase (es. "Registrate") o uno stato generico, la si traduce in stato+fase.
     "fasiNote" evita di rigenerare tutte le scadenze quando si agisce su molte righe in blocco. */
  if (patch.stato !== undefined && patch.fase === undefined) {
    const fasi = fasiNote || ((STATI_SCADENZA.includes(patch.stato) || patch.stato === 'Da fare') ? [] : ((derivati().tutteScadenze.find(x => x.id === id) || {}).fasi || []));
    patch = Object.assign({}, patch, patchDaScelta(patch.stato, fasi));
  }
  const next = Object.assign({}, cur, patch);
  if (patch.stato && STATI_SCADENZA_DEFINITIVI.includes(patch.stato) && !next.dataCompletamento) {
    next.dataCompletamento = oggiISO();
  }
  if (patch.stato && !STATI_SCADENZA_DEFINITIVI.includes(patch.stato) && patch.stato !== 'Non applicabile') {
    // se si torna indietro da uno stato definitivo, non cancelliamo la data automaticamente per non perdere lo storico
  }
  STATE.scadenzeOverrides[id] = next;
  if (patch.stato === STATO_NON_PUO_PAGARE) creaF24VersamentoInRitardo(id);
  salvaStato();
}
/* Scadenza segnata 'Versamento in ritardo': si crea (una sola volta) l'F24 relativo con stato 'Da pagare', cosi il cliente lo ritrova
   nel portale, e la scadenza resta marcata con un alert (ritardoVersamento) visibile in scheda cliente e nell'elenco F24. */
function creaF24VersamentoInRitardo(id) {
  const ov = STATE.scadenzeOverrides[id]; if (!ov) return null;
  ov.ritardoVersamento = true;
  if (ov.f24Id && STATE.f24.some(f => f.id === ov.f24Id)) return ov.f24Id;
  const sc = derivati().tutteScadenze.find(x => x.id === id); if (!sc) return null;
  const importo = typeof sc.importo === 'number' ? sc.importo : (Number(ov.importo) || 0);
  const f = aggiungiF24({ clienteId: sc.clienteId, tipo: 'F24', data: sc.data, importo, descrizione: sc.nome + ' (versamento in ritardo)', scadenzaRif: id, ritardoVersamento: true, righe: [{ id: uid('f24r'), codiceTributo: '', descrizione: sc.nome, importo, importoPagato: 0 }] });
  ov.f24Id = f.id;
  return f.id;
}
/* Vecchio stato 'Cliente non può pagare' -> 'Versamento in ritardo' (con F24 e alert). */
/* Modello di preventivo dello studio (testo del preventivo Toby: attività, pagamento, condizioni generali, accettazione) con
   impaginazione 'lettera' (logo in testa). Si aggiunge una volta sola se non esiste già un modello Preventivo attivo con
   {{dettaglioAttivita}}, e diventa quello predefinito: e il testo che il form semplificato di Nuovo preventivo compila. */
function migraModelloPreventivoStudio(stato) {
  const mod = stato.modelliDocumento = stato.modelliDocumento || [];
  stato.meta = stato.meta || {};
  if (stato.meta.modelloPreventivoStudio) return; // una volta sola: se poi lo si disattiva non lo si riaggiunge
  if (mod.some(m => m.categoria === 'Preventivo' && m.attivo !== false && /dettaglioAttivita/.test(m.corpo || ''))) return;
  const base = modelliDocumentoDefault().find(m => m.categoria === 'Preventivo' && /dettaglioAttivita/.test(m.corpo));
  if (!base) return;
  mod.forEach(m => { if (m.categoria === 'Preventivo') m.predefinito = false; });
  stato.meta.modelloPreventivoStudio = true;
  mod.push(Object.assign({}, base, { id: uid('mod'), nome: 'Preventivo (modello studio)', attivo: true, predefinito: true, stile: 'lettera', creatoIl: oggiISO() }));
}
/* "bilanci" e "fiscale" sono diventati un unico modulo "servizi" (pacchetto portale avanzato). Si resta attivi se almeno uno dei due lo era.
   I clienti esistenti partono col pacchetto ACCESO (nessuna perdita di funzioni): lo si spegne a chi non lo vuole. Una volta sola. */
function migraPacchettoPortale(stato) {
  const m = stato.meta = stato.meta || {};
  if (Array.isArray(m.moduliDisattivati) && (m.moduliDisattivati.includes('bilanci') || m.moduliDisattivati.includes('fiscale'))) {
    const entrambi = m.moduliDisattivati.includes('bilanci') && m.moduliDisattivati.includes('fiscale');
    m.moduliDisattivati = m.moduliDisattivati.filter(x => x !== 'bilanci' && x !== 'fiscale');
    if (entrambi && !m.moduliDisattivati.includes('servizi')) m.moduliDisattivati.push('servizi');
  }
  if (!m.pacchettoPortaleMigrato) {
    (stato.clienti || []).forEach(c => { if (c.pacchettoPortale === undefined) c.pacchettoPortale = true; });
    m.pacchettoPortaleMigrato = true;
  }
}
function migraStatoVersamentoRitardo(stato) {
  const ov = stato.scadenzeOverrides || {};
  Object.keys(ov).forEach(k => { if (ov[k] && ov[k].stato === STATO_NON_PUO_PAGARE_LEGACY) { ov[k].stato = STATO_NON_PUO_PAGARE; ov[k].ritardoVersamento = true; if (!ov[k].dataCompletamento) ov[k].dataCompletamento = oggiISO(); } });
}
/* Salva l'importo di una scadenza periodica scritto in formato italiano (1.234,56), lo riformatta nel
   campo e segna il tasto ✓ come confermato. Senza render(): non si perde il focus. */
function salvaImportoScadenza(id, input, conToast) {
  const n = parseImportoIT(input.value);
  const btn = input.parentElement && input.parentElement.querySelector('button.importo-ok');
  if (n !== null && isNaN(n)) { toast('Importo non valido: usa cifre e virgola, es. 1.234,56', true); return; }
  aggiornaScadenza(id, { importo: n });
  input.value = n === null ? '' : formatImportoIT(n);
  if (btn) btn.classList.toggle('salvato', n !== null);
  if (conToast) toast(n === null ? 'Importo rimosso' : 'Importo confermato: € ' + formatImportoIT(n));
}
/* Log di annotazioni testuali e datate su una scadenza — diverso dalla "nota" (una riga sola,
   sempre in chiaro nella tabella Scadenze, si sovrascrive): qui ogni voce resta con la sua data,
   non si perde mai la precedente. Serve per casi come "bilancio depositato in ritardo, il cliente
   vuole compensare le imposte col credito IVA che deriverà dal modello TR in corso di invio" — un
   dettaglio operativo che matura nel tempo, non un singolo stato. Vive nello "Step di controllo"
   della scadenza (modalControlloImposta), non in tabella: lì c'è spazio per leggerlo davvero. */
function aggiungiAnnotazioneScadenza(scadenzaId, testo) {
  const t = (testo || '').trim();
  if (!t) return;
  const cur = STATE.scadenzeOverrides[scadenzaId] || {};
  const annotazioni = (cur.annotazioni || []).concat([{ id: uid('nota'), data: oggiISO(), testo: t, autore: operatoreCorrente() || null }]);
  STATE.scadenzeOverrides[scadenzaId] = Object.assign({}, cur, { annotazioni });
  salvaStato();
}
function eliminaAnnotazioneScadenza(scadenzaId, annotazioneId) {
  const cur = STATE.scadenzeOverrides[scadenzaId] || {};
  const annotazioni = (cur.annotazioni || []).filter(a => a.id !== annotazioneId);
  STATE.scadenzeOverrides[scadenzaId] = Object.assign({}, cur, { annotazioni });
  salvaStato();
}
/* Canali usati per registrare un sollecito verso il cliente, così da vedere lo storico prima di
   rimandarne un altro. Task Matteo: tolti i canali Email e WhatsApp (aprivano il client esterno
   dell'utente, fuori dal controllo di Prisma) - il sollecito "attivo" passa solo dal portale
   cliente (vedi inviaSollecitoPortale); gli altri restano come semplice log manuale. */
const CANALI_SOLLECITO = ['Portale cliente', 'Telefono', 'Di persona', 'Altro'];

/* Testo di default per il messaggio di sollecito, precompilato ma sempre modificabile prima
   dell'invio tramite portale cliente. */
function testoSollecitoDefault(cliente, scadenza) {
  return `Gentile ${cliente ? cliente.ragioneSociale : ''}, le ricordiamo che il ${fmtData(scadenza.data)} è in scadenza "${scadenza.nome}". Restiamo a disposizione per qualsiasi chiarimento.`;
}
/* Invia il sollecito come comunicazione visibile nel portale cliente (stessa "cassetta" già usata
   per le comunicazioni ordinarie - il cliente la vede appena apre il suo link /portale/<codice>) e
   registra subito il sollecito nello storico della scadenza. Un solo pulsante ("Registra
   sollecito") fa entrambe le cose in un click - il canale scelto è solo l'etichetta con cui resta
   nello storico, il messaggio finisce comunque sempre nel portale (task Matteo: il vecchio
   pulsante separato "Invia tramite portale cliente" era ridondante). */
function inviaSollecitoPortale(scadenzaId, canale, nota) {
  const { tutteScadenze } = derivati();
  const s = tutteScadenze.find(x => x.id === scadenzaId);
  if (!s) return;
  const cliente = clienteById(s.clienteId);
  if (!cliente) { toast('Cliente non trovato.', true); return; }
  const messaggio = h('solMessaggio') ? h('solMessaggio').value : testoSollecitoDefault(cliente, s);
  aggiungiComunicazione({
    clienteId: cliente.id,
    data: oggiISO(),
    categoria: 'Scadenza fiscale',
    stato: 'Inviata',
    oggetto: `Promemoria: ${s.nome}`,
    corpo: messaggio,
    note: '',
    visibilePortale: true,
    creatoDa: operatoreCorrente() || null,
  });
  registraSollecitoScadenza(scadenzaId, canale || 'Portale cliente', nota || messaggio);
}
function registraSollecitoScadenza(id, canale, nota) {
  const cur = STATE.scadenzeOverrides[id] || {};
  const solleciti = (cur.solleciti || []).slice();
  const sollecito = { id: uid('sollecito'), data: oggiISO(), canale: canale || CANALI_SOLLECITO[0], nota: (nota || '').trim() };
  solleciti.push(sollecito);
  STATE.scadenzeOverrides[id] = Object.assign({}, cur, { solleciti });
  salvaStato();
  return sollecito;
}

/* -------------------- AZIONI BULK SU SCADENZE --------------------
   Applicano la stessa mutazione (già usata riga per riga altrove: aggiornaScadenza,
   registraSollecitoScadenza) a un intero gruppo di scadenze selezionate
   nella vista Scadenze — vedi SCAD_SELEZIONATE e il bulkBar in renderScadenze(). */
/* In blocco: la scelta può essere una fase (valida solo per i tipi che la prevedono) o uno stato
   generico. Le scadenze per cui la scelta non esiste vengono saltate; restituisce quante ne ha
   aggiornate. */
function bulkCambiaStatoScadenze(ids, stato) {
  const perId = new Map(derivati().tutteScadenze.map(x => [x.id, x]));
  let n = 0;
  ids.forEach(id => {
    const sc = perId.get(id);
    if (!sc) return;
    if (!opzioniAvanzamento(sc).includes(stato)) return;
    aggiornaScadenza(id, { stato }, sc.fasi || []);
    n++;
  });
  return n;
}
function bulkCambiaRespScadenze(ids, resp) { ids.forEach(id => aggiornaScadenza(id, { responsabile: resp })); }
function bulkRegistraSollecitoScadenze(ids, canale, nota) { ids.forEach(id => registraSollecitoScadenza(id, canale, nota)); }
function modalSolleciti(scadenzaId) {
  const { tutteScadenze } = derivati();
  const s = tutteScadenze.find(x => x.id === scadenzaId);
  if (!s) { toast('Scadenza non trovata.'); return; }
  const cliente = clienteById(s.clienteId);
  const contatti = (cliente && cliente.contatti) || {};
  const storico = (s.solleciti || []).slice().sort((a,b) => b.data.localeCompare(a.data));
  const righeStorico = storico.length
    ? storico.map(sol => `<div class="checkline" style="align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;"><b>${fmtData(sol.data)}</b> · ${escapeHtml(sol.canale)}${sol.nota ? ' — ' + escapeHtml(sol.nota) : ''}</div>
      </div>`).join('')
    : `<div class="helptext">Nessun sollecito registrato ancora per questa scadenza.</div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Storico solleciti</h2><div class="modal-sub">${escapeHtml(nomeCliente(s.clienteId))} — ${escapeHtml(s.nome)} (${fmtData(s.data)})</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="max-height:220px;overflow-y:auto;margin:10px 0;">${righeStorico}</div>
      <form id="formSollecito" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Messaggio (modificabile)</label><textarea id="solMessaggio" rows="3">${escapeHtml(testoSollecitoDefault(cliente, s))}</textarea></div>
        </div>
        <div class="helptext" style="margin-top:2px;">"Registra sollecito" invia subito il messaggio nella sezione Comunicazioni del portale del cliente e lo aggiunge allo storico qui sotto.</div>
        <div class="grid2" style="margin-top:10px;">
          <div class="field"><label>Canale</label><select id="solCanale">${CANALI_SOLLECITO.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></div>
          <div class="field full" style="grid-column:1/-1;"><label>Nota (facoltativa)</label><input id="solNota" placeholder="es. richiamare mercoledì"></div>
        </div>
      </form>
      <div class="modal-actions">
        ${SCAD_SUBMODAL_DA_DETTAGLIO ? `<button class="btn" data-action="apri-dettaglio-scadenza" data-id="${scadenzaId}" style="margin-right:auto;">← Indietro</button>` : ''}
        <button class="btn" data-action="chiudi-modal">Chiudi</button>
        <button class="btn primary" data-action="salva-sollecito" data-id="${scadenzaId}">Registra sollecito</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

/* Stessa logica di modalSolleciti ma applicata in un colpo solo a tutte le scadenze in
   SCAD_SELEZIONATE — un sollecito identico (stesso canale e nota) registrato su ciascuna. */
function modalSollecitoBulk() {
  const n = SCAD_SELEZIONATE.size;
  if (n === 0) { toast('Nessuna scadenza selezionata.'); return; }
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Registra sollecito a ${n} scadenze</h2><div class="modal-sub">Lo stesso sollecito verrà aggiunto allo storico di ciascuna delle ${n} scadenze selezionate.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formSollecitoBulk" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Canale</label><select id="solBulkCanale">${CANALI_SOLLECITO.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></div>
          <div class="field full" style="grid-column:1/-1;"><label>Nota (facoltativa)</label><input id="solBulkNota" placeholder="es. promemoria scadenza IVA inviato via email"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-sollecito-bulk">Registra su ${n} scadenze</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

function modalControlloImposta(scadenzaId) {
  const { tutteScadenze } = derivati();
  const s = tutteScadenze.find(x => x.id === scadenzaId);
  if (!s) { toast('Scadenza non trovata.'); return; }
  // annotazioni è già in ordine di inserimento (si aggiunge sempre in coda con .concat), quindi
  // basta invertirla per avere la più recente per prima - niente da riordinare per data: più voci
  // nello stesso giorno (probabile: sono note prese "sul momento") altrimenti finirebbero in un
  // ordine arbitrario, dato che la data ha solo granularità di giorno.
  const annotazioni = (s.annotazioni || []).slice().reverse();
  const righeAnnotazioni = annotazioni.length
    ? annotazioni.map(a => `<div class="subtask-row" style="align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:2px;">${escapeHtml(a.autore || '—')} · ${fmtData(a.data)}</div>
          <div style="font-size:12.5px;white-space:pre-wrap;line-height:1.4;">${escapeHtml(a.testo)}</div>
        </div>
        <button class="icon-x" data-action="scad-elimina-annotazione" data-id="${s.id}" data-annotazione-id="${a.id}" title="Elimina annotazione">✕</button>
      </div>`).join('')
    : `<div class="helptext" style="padding:4px 0;">Nessuna annotazione ancora. Usale per dettagli che non stanno in una riga sola — es. un pagamento in ritardo, una compensazione col credito IVA da un modello TR, un accordo particolare col cliente.</div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Annotazioni</h2><div class="modal-sub">${escapeHtml(nomeCliente(s.clienteId))} — ${escapeHtml(s.nome)} (${fmtData(s.data)})</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="margin-bottom:10px;">${righeAnnotazioni}</div>
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <textarea id="scadNuovaAnnotazione" placeholder="Aggiungi un dettaglio datato (es. compensazione con credito IVA da modello TR in corso di invio)..." style="flex:1;min-height:46px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12.5px;resize:vertical;"></textarea>
        <button class="btn small" data-action="scad-aggiungi-annotazione" data-id="${s.id}">Aggiungi</button>
      </div>
      <div class="modal-actions">
        ${SCAD_SUBMODAL_DA_DETTAGLIO ? `<button class="btn" data-action="apri-dettaglio-scadenza" data-id="${scadenzaId}" style="margin-right:auto;">← Indietro</button>` : ''}
        <button class="btn primary" data-action="chiudi-modal">Chiudi</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

/* Dettaglio di UNA scadenza periodica (task #110): lo stesso set di campi disponibile in riga
   nella tabella Scadenze (Stato/Responsabile/Nota/Importo) più i due approfondimenti già esistenti
   (Storico solleciti, Step di controllo), riuniti in un unico posto raggiungibile con un click da
   qualunque punto dell'app mostri questa scadenza (oggi: il calendario) — così si può "lavorarci
   sopra" (cambiare stato, aggiungere una nota) senza dover prima aprire la scheda del cliente e poi
   cercarla in tabella. Stato/Responsabile usano data-action dedicati (scad-detail-cambia-*) che
   oltre a salvare ri-disegnano QUESTO modale (necessario: cambiare stato può impostare in automatico
   "Completata il", che qui è visibile) — Nota/Importo riusano invece gli stessi data-action della
   tabella (scad-cambia-nota/importo) perché quei due, apposta, non fanno mai un render (per non far
   perdere il focus mentre si scrive): non c'è nulla in questo modale che dipenda da loro, quindi va
   bene invariati. */
function modalDettaglioScadenza(scadenzaId) {
  const { tutteScadenze } = derivati();
  const s = tutteScadenze.find(x => x.id === scadenzaId);
  if (!s) { toast('Scadenza non trovata (potrebbe essere stata rigenerata cambiando anno).'); return; }
  const d = deltaLabel(s.data);
  const chiuso = STATI_SCADENZA_CHIUSI.includes(s.stato);
  const nSolleciti = (s.solleciti || []).length;
  const nNote = (s.annotazioni || []).length;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(s.nome)}</h2><div class="modal-sub">${escapeHtml(nomeCliente(s.clienteId))} · entro il ${fmtData(s.data)}${chiuso ? '' : ` · <span class="pill-delta ${d.cls}">${d.txt}</span>`}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="grid2" style="margin-top:10px;">
        <div class="field"><label>Avanzamento</label><select class="${statoBadgeClass(s.stato)}" data-action="scad-detail-cambia-stato" data-id="${s.id}">
          ${opzioniAvanzamento(s).map(st => `<option ${etichettaStatoScadenza(s)===st?'selected':''}>${escapeHtml(st)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Responsabile</label><select data-action="scad-detail-cambia-resp" data-id="${s.id}">
          <option value="">—</option>
          ${STATE.meta.responsabili.map(r => `<option ${s.responsabile===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
        </select></div>
        <div class="field full" style="grid-column:1/-1;"><label>Nota</label><input type="text" value="${escapeHtml(s.nota||'')}" data-action="scad-cambia-nota" data-id="${s.id}" placeholder="nota..."></div>
        ${s.conImporto ? `<div class="field"><label>Importo (€)</label><input type="number" step="0.01" value="${s.importo!=null?s.importo:''}" data-action="scad-cambia-importo" data-id="${s.id}" placeholder="€"></div>` : ''}
        <div class="field"><label>Completata il</label><div style="padding-top:7px;font-size:13px;">${s.dataCompletamento ? fmtData(s.dataCompletamento) : '<span class="helptext">—</span>'}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        <button class="btn small" data-action="scad-detail-apri-solleciti" data-id="${s.id}">🔔 Storico solleciti${nSolleciti?` (${nSolleciti})`:''}</button>
        <button class="btn small" data-action="scad-detail-apri-controllo" data-id="${s.id}">📝 Annotazioni${nNote?` (${nNote})`:''}</button>
        <button class="btn small" data-action="apri-cliente" data-id="${s.clienteId}">Apri scheda cliente</button>
      </div>
      <div class="modal-actions">
        <button class="btn primary" data-action="chiudi-modal">Chiudi</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function aggiornaSottoAdempimento(annualeId, nomeSotto, patch) {
  const cur = STATE.annualiOverrides[annualeId] || {};
  const sotto = Object.assign({}, cur.sotto || {});
  const curSotto = sotto[nomeSotto] || {};
  sotto[nomeSotto] = Object.assign({}, curSotto, patch);
  if (patch.completato && !sotto[nomeSotto].data) sotto[nomeSotto].data = oggiISO();
  /* Chi ha spuntato la fase (richiesta Matteo): può essere diverso dal responsabile assegnato, ed è
     utile ricordarsi chi ha fatto cosa. Si registra al momento della spunta e si azzera se la si toglie. */
  if (patch.completato === true) sotto[nomeSotto].completatoDa = operatoreCorrente() || null;
  if (patch.completato === true && !operatoreCorrente() && (STATE.meta.responsabili || []).length > 1) toast('Passaggio completato, ma non so chi sei: scegli il tuo nome in alto a destra per registrare chi ha fatto cosa.');
  if (patch.completato === false) sotto[nomeSotto].completatoDa = null;
  STATE.annualiOverrides[annualeId] = Object.assign({}, cur, { sotto });
  salvaStato();
  if (patch.completato) notificaPassaggioFase(annualeId, nomeSotto);
}
/* Passaggio di consegne: completata una fase, se la fase successiva ha un responsabile DIVERSO gli
   arriva un task "puoi iniziare" (con la notifica del Task team). Nessun task se resta la stessa persona. */
function notificaPassaggioFase(annualeId, nomeSotto) {
  const a = derivati().annuali.find(x => x.id === annualeId);
  if (!a) return;
  const i = a.sotto.findIndex(x => x.nome === nomeSotto);
  const prossima = a.sotto[i + 1];
  if (!prossima || prossima.completato || !prossima.responsabile || prossima.responsabile === a.sotto[i].responsabile) return;
  if (a.sotto.slice(0, i + 1).some(x => !x.completato)) return;
  aggiungiTaskTeam({
    titolo: `Puoi iniziare: ${prossima.nome} — ${a.tipoNome} ${nomeCliente(a.clienteId)}`, assegnatoA: prossima.responsabile,
    clienteId: a.clienteId, scadenza: a.scadenza || null, stato: STATI_TASK_TEAM[0],
    noteStorico: [{ id: uid('nota'), testo: `${a.sotto[i].responsabile || 'Un collega'} ha completato "${nomeSotto}": la fase successiva è tua.`, autore: operatoreCorrente() || null, data: oggiISO() }],
    creatoIl: oggiISO(),
  });
}
function aggiornaAnnualeMeta(annualeId, patch) {
  const cur = STATE.annualiOverrides[annualeId] || {};
  STATE.annualiOverrides[annualeId] = Object.assign({}, cur, patch);
  salvaStato();
}
function aggiornaOnboarding(clienteId, chiave, valore) {
  if (!STATE.onboarding[clienteId]) STATE.onboarding[clienteId] = nuovoOnboarding();
  STATE.onboarding[clienteId][chiave] = valore;
  salvaStato();
}

/* -------------------- MUTAZIONI: fascicolo Antiriciclaggio/AML (task #119) -------------------- */
function fascicoloAntiriciclaggio(clienteId) {
  if (!STATE.antiriciclaggio[clienteId]) STATE.antiriciclaggio[clienteId] = nuovoFascicoloAntiriciclaggio();
  // Ripiego per fascicoli creati prima dell'aggiunta di un campo (stesso spirito additivo di
  // normalizzaStatoCaricato, ma qui serve anche sul singolo oggetto perché nuovoFascicoloAntiriciclaggio()
  // può essere cambiata in futuro senza che i fascicoli già salvati vengano rigenerati).
  const f = STATE.antiriciclaggio[clienteId];
  if (!f.checklist) f.checklist = {};
  for (const v of AML_CHECKLIST_DEF) if (!(v.chiave in f.checklist)) f.checklist[v.chiave] = false;
  if (!Array.isArray(f.storico)) f.storico = [];
  if (!f.profiloRischio) f.profiloRischio = 'Non valutato';
  return f;
}
function aggiornaChecklistAntiriciclaggio(clienteId, chiave, valore) {
  const f = fascicoloAntiriciclaggio(clienteId);
  f.checklist[chiave] = valore;
  salvaStato();
}
function aggiornaCampoAntiriciclaggio(clienteId, campo, valore) {
  const f = fascicoloAntiriciclaggio(clienteId);
  f[campo] = valore;
  salvaStato();
}
/* Storico verifiche append-only (stesso principio delle note dei Task Team, task #114): ogni
   verifica/aggiornamento resta agganciato a chi l'ha fatto e a quando, invece di sovrascrivere un
   singolo campo "ultima nota" che perderebbe la storia della pratica. */
function aggiungiNotaAntiriciclaggio(clienteId, testo) {
  const f = fascicoloAntiriciclaggio(clienteId);
  const testoPulito = (testo || '').trim();
  if (!testoPulito) return null;
  const nota = { id: uid('nota'), testo: testoPulito, autore: operatoreCorrente() || null, data: oggiISO() };
  f.storico.push(nota);
  salvaStato();
  return nota;
}

/* -------------------- MUTAZIONI: catalogo scadenze periodiche (Impostazioni) -------------------- */
function trovaTipoPeriodico(idTipo) {
  return STATE.catalogoPeriodico.find(t => t.id === idTipo);
}
function aggiornaTipoPeriodico(idTipo, patch) {
  const t = trovaTipoPeriodico(idTipo);
  if (!t) return;
  Object.assign(t, patch);
  salvaStato();
}
function aggiornaOccorrenzaPeriodica(idTipo, idx, patch) {
  const t = trovaTipoPeriodico(idTipo);
  if (!t || !t.occorrenze[idx]) return;
  Object.assign(t.occorrenze[idx], patch);
  salvaStato();
}
function aggiungiOccorrenzaPeriodica(idTipo) {
  const t = trovaTipoPeriodico(idTipo);
  if (!t) return;
  t.occorrenze.push({ m: 1, g: 1, nota: 'Nuova occorrenza' });
  salvaStato();
}
function rimuoviOccorrenzaPeriodica(idTipo, idx) {
  const t = trovaTipoPeriodico(idTipo);
  if (!t) return;
  t.occorrenze.splice(idx, 1);
  salvaStato();
}
function aggiungiTipoPeriodicoCustom() {
  const nome = window.prompt('Nome del nuovo tipo di scadenza (es. "Comunicazione dati liquidazioni periodiche"):');
  if (!nome || !nome.trim()) return;
  const flag = 'custom_' + uid('').replace(/^_/, '');
  STATE.catalogoPeriodico.push({
    id: flag, flag, nome: nome.trim(), attivo: true, personalizzato: true,
    conImporto: true, fasi: FASI_DEFAULT_CUSTOM.slice(),
    occorrenze: [{ m: 1, g: 1, nota: nome.trim() }],
  });
  salvaStato(); render();
  toast('Nuovo tipo creato. Ricordati di attivarlo sui clienti interessati in "Altri adempimenti periodici".');
}
function rimuoviTipoPeriodicoCustom(idTipo) {
  STATE.catalogoPeriodico = STATE.catalogoPeriodico.filter(t => t.id !== idTipo);
  salvaStato();
}
function ripristinaCatalogoPeriodico() {
  STATE.catalogoPeriodico = JSON.parse(JSON.stringify(DEFAULT_CATALOGO_PERIODICO));
  salvaStato();
}

/* -------------------- MUTAZIONI: catalogo adempimenti annuali (Impostazioni) -------------------- */
function trovaTipoAnnuale(chiave) {
  return STATE.catalogoAnnuale.find(t => t.chiave === chiave);
}
function aggiornaTipoAnnuale(chiave, patch) {
  const t = trovaTipoAnnuale(chiave);
  if (!t) return;
  Object.assign(t, patch);
  salvaStato();
}
/* Scadenza predefinita (mese/giorno) di un adempimento annuale col catalogo (task #149: prima
   editabile solo per le scadenze periodiche in Impostazioni, non per gli adempimenti annuali —
   segnalato da Matteo). Non tutti gli adempimenti annuali hanno una scadenzaDefault: quelli con un
   resolver in SCADENZA_DINAMICA_ANNUALE (oggi solo il diritto camerale) calcolano la data dalla
   scelta fatta per singolo cliente in anagrafica, non da qui — per quelli il campo scadenzaDefault
   resta assente e questa funzione non viene mai chiamata (la UI non mostra i controlli mese/giorno). */
function aggiornaScadenzaDefaultAnnuale(chiave, campo, valore) {
  const t = trovaTipoAnnuale(chiave);
  if (!t) return;
  if (!t.scadenzaDefault) t.scadenzaDefault = { m: 1, g: 1 };
  t.scadenzaDefault[campo] = valore;
  salvaStato();
}
function aggiornaSottoAnnualeCatalogo(chiave, idx, valore) {
  const t = trovaTipoAnnuale(chiave);
  if (!t || !t.sotto[idx]) return;
  t.sotto[idx] = valore;
  salvaStato();
}
function aggiungiSottoAnnualeCatalogo(chiave) {
  const t = trovaTipoAnnuale(chiave);
  if (!t) return;
  t.sotto.push('Nuova fase');
  salvaStato();
}
function rimuoviSottoAnnualeCatalogo(chiave, idx) {
  const t = trovaTipoAnnuale(chiave);
  if (!t) return;
  t.sotto.splice(idx, 1);
  salvaStato();
}
function aggiungiTipoAnnualeCustom() {
  const nome = window.prompt('Nome del nuovo adempimento annuale (es. "Modello Redditi ENC"):');
  if (!nome || !nome.trim()) return;
  const chiave = 'CUSTOM_' + uid('').replace(/^_/, '').toUpperCase();
  STATE.catalogoAnnuale.push({ chiave, nome: nome.trim(), attivo: true, personalizzato: true, sotto: ['Raccolta dati', 'Predisposizione', 'Invio/consegna'] });
  salvaStato(); render();
  toast('Nuovo adempimento annuale creato. Selezionalo nei clienti interessati.');
}
function rimuoviTipoAnnualeCustom(chiave) {
  STATE.catalogoAnnuale = STATE.catalogoAnnuale.filter(t => t.chiave !== chiave);
  salvaStato();
}
function ripristinaCatalogoAnnuale() {
  STATE.catalogoAnnuale = JSON.parse(JSON.stringify(DEFAULT_CATALOGO_ANNUALE));
  salvaStato();
}

/* -------------------- MUTAZIONI: comunicazioni e documenti -------------------- */
function aggiungiComunicazione(c) {
  // Task #124 (Matteo: "una nuova comunicazione appariva al secondo posto dopo una comunicazione
  // già visualizzata"): "data" è solo un giorno (YYYY-MM-DD), quindi tra due comunicazioni con la
  // STESSA data l'ordinamento per data da solo non le distingue - senza un secondo criterio, un
  // sort stabile le lascia nell'ordine in cui sono state creates (la più vecchia delle due resta
  // prima), che è l'opposto di quello che ci si aspetta ("l'ultima che ho scritto va in cima").
  // creataIl è un timestamp preciso (non solo il giorno) usato apposta come secondo criterio di
  // ordinamento in renderComunicazioni, mai mostrato all'utente.
  STATE.comunicazioni.push(Object.assign({ id: uid('com'), creataIl: new Date().toISOString() }, c));
  salvaStato();
}
function aggiornaComunicazione(id, patch) {
  const c = STATE.comunicazioni.find(x => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  salvaStato();
}
function eliminaComunicazione(id) {
  const c = STATE.comunicazioni.find(x => x.id === id);
  if (c && c.filePercorso) {
    // Task #105: se lo stesso allegato è condiviso con un F24 (creato insieme a questa
    // comunicazione), non cancelliamo il file fisico — altrimenti il link 📎 nella sezione F24
    // resterebbe rotto. Verrà eliminato solo quando anche l'F24 collegato viene eliminato.
    const condivisoConF24 = (STATE.f24 || []).some(f => f.filePercorso === c.filePercorso);
    if (!condivisoConF24) eliminaFileReale(c.filePercorso);
  }
  STATE.comunicazioni = STATE.comunicazioni.filter(x => x.id !== id);
  salvaStato();
}
function aggiungiDocumento(d) {
  const nuovo = Object.assign({ id: uid('doc') }, d);
  STATE.documenti.push(nuovo);
  salvaStato();
  return nuovo;
}
function eliminaDocumento(id) {
  const d = STATE.documenti.find(x => x.id === id);
  if (d && d.filePercorso) {
    // Task #142: un documento può essere stato creato con "Salva in Documenti" da una risposta di
    // comunicazione (salvaDocumentoDaComunicazione più sotto) - in quel caso punta allo STESSO file
    // fisico della risposta. Stessa logica già usata per F24↔comunicazione (eliminaComunicazione):
    // non cancellare il file se è ancora referenziato da una comunicazione o da una sua risposta,
    // altrimenti il link 📎 nel thread resterebbe rotto.
    const condivisoConCom = STATE.comunicazioni.some(c => c.filePercorso === d.filePercorso || (c.risposte || []).some(r => r.filePercorso === d.filePercorso));
    if (!condivisoConCom) eliminaFileReale(d.filePercorso);
  }
  STATE.documenti = STATE.documenti.filter(x => x.id !== id);
  salvaStato();
}
/* Task #142 - "raccolta documentale": lo studio crea una comunicazione di categoria "Raccolta
   documentale" indicando (categoriaDocumentoRichiesta) dove va catalogato quanto richiesto; quando
   il cliente risponde allegando un file, dal thread lo studio lo salva con un click nella cartella
   Documenti del cliente, nella categoria giusta, SENZA ricaricare il file (stesso filePercorso già
   presente sul server per l'allegato della risposta - vedi eliminaDocumento sopra per la
   protezione simmetrica in cancellazione). Idempotente: una risposta già salvata resta marcata
   (salvatoComeDocumento/documentoIdSalvato) così il pulsante nel thread sparisce e non si duplica. */
function salvaDocumentoDaComunicazione(comId, rispostaId, categoriaScelta) {
  const c = STATE.comunicazioni.find(x => x.id === comId);
  if (!c) return null;
  const r = (c.risposte || []).find(x => x.id === rispostaId);
  if (!r || !r.filePercorso || r.salvatoComeDocumento) return null;
  const doc = aggiungiDocumento({
    clienteId: c.clienteId,
    categoria: categoriaScelta || c.categoriaDocumentoRichiesta || 'Altro',
    nome: r.fileNome || 'Documento da comunicazione',
    dataCaricamento: oggiISO(),
    filePercorso: r.filePercorso,
    fileNome: r.fileNome,
    fileDimensione: r.fileDimensione,
  });
  r.salvatoComeDocumento = true;
  r.documentoIdSalvato = doc.id;
  salvaStato();
  return doc;
}

