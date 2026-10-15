'use strict';
/* -------------------- RENDER: CATALOGO SCADENZE (dentro Impostazioni) -------------------- */
let CAT_PER_EXPANDED = new Set();
let CAT_ANN_EXPANDED = new Set();
let TERZI_FASI_EXPANDED = new Set();
/* ---- EDITOR DELLE FASI (adempimenti annuali) ----
   Un solo editor per due posti: il catalogo annuale (fasi standard) e le fasi per i clienti con contabilità
   tenuta da terzi. Ogni fase è numerata, si sposta con ▲▼, si rinomina, si toglie; si possono incollare più
   fasi insieme (una per riga). ATTENZIONE: una fase è riconosciuta dal suo nome, quindi rinominarla o
   toglierla fa ripartire da zero lo stato di quella fase nelle pratiche già avviate. */
function leggiFasiTarget(target, chiave) {
  if (target === 'terzi') { const cfg = configContabTerzi(); return (cfg.sotto[chiave] || []).slice(); }
  const t = trovaTipoAnnuale(chiave); return t ? t.sotto.slice() : [];
}
function scriviFasiTarget(target, chiave, fasi) {
  if (target === 'terzi') { const cfg = configContabTerzi(); cfg.sotto[chiave] = fasi; salvaConfigContabTerzi(cfg); return; }
  const t = trovaTipoAnnuale(chiave); if (t) { t.sotto = fasi; salvaStato(); }
}
function htmlEditorFasi(target, chiave, fasi) {
  const attr = `data-target="${target}" data-tipo="${escapeHtml(chiave)}"`;
  return `<div class="fasi-editor">
    ${fasi.map((f, i) => `<div class="fase-riga">
      <span class="fase-n">${i + 1}</span>
      <input type="text" value="${escapeHtml(f)}" data-action="fasi-testo" ${attr} data-idx="${i}">
      <button type="button" class="btn small ghost" data-action="fasi-sposta" ${attr} data-idx="${i}" data-dir="-1" title="Sposta su" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button type="button" class="btn small ghost" data-action="fasi-sposta" ${attr} data-idx="${i}" data-dir="1" title="Sposta giù" ${i === fasi.length - 1 ? 'disabled' : ''}>▼</button>
      <button type="button" class="icon-x" data-action="fasi-rimuovi" ${attr} data-idx="${i}" title="Togli la fase">✕</button>
    </div>`).join('')}
    ${fasi.length ? '' : '<div class="helptext" style="margin:4px 0 8px;">Nessuna fase: aggiungine almeno una.</div>'}
    <div class="fase-aggiungi">
      <textarea id="fasiNuove_${target}_${escapeHtml(chiave)}" rows="2" placeholder="Aggiungi fasi in fondo: una per riga (puoi incollarne diverse insieme)"></textarea>
      <button type="button" class="btn small primary" data-action="fasi-aggiungi" ${attr}>+ Aggiungi</button>
    </div>
    <div class="helptext" style="margin-top:6px;">Le fasi si completano nell'ordine indicato. Rinominare o togliere una fase fa ripartire da zero quella fase nelle pratiche già avviate.</div>
  </div>`;
}

function renderCatalogoPeriodico() {
  const righe = STATE.catalogoPeriodico.map(t => {
    const expanded = CAT_PER_EXPANDED.has(t.id);
    const occHtml = t.occorrenze.map((o, idx) => `
      <div class="occ-row">
        <select data-action="cat-per-mese" data-tipo="${t.id}" data-idx="${idx}">
          ${MESI_COMPLETI.map((m,i)=>`<option value="${i+1}" ${o.m===i+1?'selected':''}>${m}</option>`).join('')}
        </select>
        <input type="number" min="1" max="31" value="${o.g}" data-action="cat-per-giorno" data-tipo="${t.id}" data-idx="${idx}">
        <input type="text" value="${escapeHtml(o.nota)}" data-action="cat-per-nota" data-tipo="${t.id}" data-idx="${idx}" placeholder="nota / descrizione...">
        <button class="icon-x" data-action="cat-per-rimuovi-occ" data-tipo="${t.id}" data-idx="${idx}" title="Rimuovi">✕</button>
      </div>`).join('');
    return `<div class="cat-tipo ${t.attivo===false?'disattivo':''}">
      <div class="cat-head">
        <input type="checkbox" data-action="cat-per-toggle-attivo" data-tipo="${t.id}" ${t.attivo!==false?'checked':''} title="Attivo">
        <input type="text" class="nome" value="${escapeHtml(t.nome)}" data-action="cat-per-nome" data-tipo="${t.id}" style="border:none;background:transparent;flex:1;font-weight:700;font-size:13.5px;padding:2px 4px;">
        <span class="badge regime">${escapeHtml(t.tipo || TIPO_ADEMPIMENTO_DEFAULT)}</span>
        <span class="helptext">${t.occorrenze.length} data/e/anno ${t.personalizzato?'· personalizzata':''}${t.conImporto===false?' · senza importo':''}</span>
        <span data-action="cat-per-expand" data-tipo="${t.id}" style="cursor:pointer;padding:2px 6px;">${expanded?'▾':'▸'}</span>
      </div>
 ${expanded ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div class="grid2" style="margin-bottom:10px;">
          <div class="field"><label>Avanzamento (una fase per riga, l'ultima chiude la scadenza)</label><textarea data-action="cat-per-fasi" data-tipo="${t.id}" style="min-height:70px;">${escapeHtml(((t.fasi && t.fasi.length) ? t.fasi : FASI_DEFAULT_CUSTOM).join('\n'))}</textarea></div>
          <div class="field"><label>Importo</label><label class="checkline" style="display:block;"><input type="checkbox" data-action="cat-per-con-importo" data-tipo="${t.id}" ${t.conImporto!==false?'checked':''}> Chiedi l'importo per questa scadenza</label><div class="helptext">Toglilo per gli adempimenti dove l'importo non serve (es. fatture estere, LIPE).</div></div>
        </div>
        ${occHtml}
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="btn small" data-action="cat-per-aggiungi-occ" data-tipo="${t.id}">+ Aggiungi data</button>
          ${t.personalizzato ? `<button class="btn small danger" data-action="cat-per-elimina-tipo" data-tipo="${t.id}">Elimina tipo</button>` : ''}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="section-title">Catalogo scadenze periodiche <span class="cnt">${STATE.catalogoPeriodico.length} tipi</span></div>
    <div class="helptext" style="margin-bottom:12px;">Qui puoi modificare mese/giorno/nota di ogni scadenza ricorrente (utile se cambia una norma), disattivare un tipo che non usi più, o crearne uno nuovo su misura — comparirà come flag selezionabile nell'anagrafica cliente.</div>
    ${righe}
    <div style="margin-top:12px;display:flex;gap:10px;">
      <button class="btn primary small" data-action="cat-per-nuovo-tipo">+ Nuovo tipo di scadenza</button>
      <button class="btn small" data-action="cat-per-reset">↺ Ripristina catalogo predefinito</button>
    </div>
  </div>`;
}

function renderCatalogoAnnuale() {
  const righe = catalogoAnnualeTutti().map(t => {
    const expanded = CAT_ANN_EXPANDED.has(t.chiave);
    const dataHtml = t.scadenzaDefault
      ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <select data-action="cat-ann-mese" data-tipo="${t.chiave}">
            ${MESI_COMPLETI.map((m,i)=>`<option value="${i+1}" ${t.scadenzaDefault.m===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
          <input type="number" min="1" max="31" value="${t.scadenzaDefault.g}" data-action="cat-ann-giorno" data-tipo="${t.chiave}" style="width:70px;">
          <span class="helptext">scadenza predefinita (si sposta al primo giorno feriale successivo se cade di festivo)</span>
        </div>`
      : SCADENZA_DINAMICA_ANNUALE[t.chiave]
      ? `<div class="helptext" style="margin-bottom:12px;">La scadenza di questo adempimento non è fissa: si calcola dalla data scelta per singolo cliente in anagrafica (es. la data prescelta per il diritto camerale).</div>`
      : `<div class="helptext" style="margin-bottom:12px;">Questo adempimento non ha una scadenza fissa in catalogo (varia ogni anno per proroghe/regime): va impostata a mano sulla singola scadenza generata per ciascun cliente.</div>`;
    return `<div class="cat-tipo ${t.attivo===false?'disattivo':''}">
      <div class="cat-head">
        <input type="checkbox" data-action="cat-ann-toggle-attivo" data-tipo="${t.chiave}" ${t.attivo!==false?'checked':''} title="Attivo">
        <input type="text" class="nome" value="${escapeHtml(t.nome)}" data-action="cat-ann-nome" data-tipo="${t.chiave}" style="border:none;background:transparent;flex:1;font-weight:700;font-size:13.5px;padding:2px 4px;">
        <span class="badge regime">${escapeHtml(t.tipo || TIPO_ADEMPIMENTO_DEFAULT)}</span>
        <span class="helptext">${t.sotto.length} fasi ${t.personalizzato?'· personalizzato':''}</span>
        <span data-action="cat-ann-expand" data-tipo="${t.chiave}" style="cursor:pointer;padding:2px 6px;">${expanded?'▾':'▸'}</span>
      </div>
      ${expanded ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        ${dataHtml}
        <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:6px;">Fasi (${t.sotto.length})</div>
        ${htmlEditorFasi('catalogo', t.chiave, t.sotto)}
        <div style="margin-top:10px;display:flex;gap:8px;">
          ${DEFAULT_CATALOGO_ANNUALE.some(d => d.chiave === t.chiave) ? `<button class="btn small" data-action="fasi-ripristina-standard" data-tipo="${t.chiave}">↺ Fasi predefinite</button>` : ''}
          ${t.personalizzato ? `<button class="btn small danger" data-action="cat-ann-elimina-tipo" data-tipo="${t.chiave}">Elimina tipo</button>` : ''}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="section-title">Catalogo adempimenti annuali <span class="cnt">${catalogoAnnualeTutti().length} tipi</span></div>
    <div class="helptext" style="margin-bottom:12px;">Ogni adempimento annuale è una lista di fasi/sotto-task che spunti man mano. Puoi rinominarle, aggiungerne o toglierne, disattivare un tipo o crearne uno nuovo.</div>
    ${righe}
    <div style="margin-top:12px;display:flex;gap:10px;">
      <button class="btn primary small" data-action="cat-ann-nuovo-tipo">+ Nuovo adempimento annuale</button>
      <button class="btn small" data-action="cat-ann-reset">↺ Ripristina catalogo predefinito</button>
    </div>
  </div>`;
}

/* -------------------- RENDER: IMPOSTAZIONI -------------------- */

/* Backup automatici lato server (8:00/12:00/16:00 + a ogni avvio, storico 30 giorni - vedi
   server.js): esistono SOLO quando il gestionale gira via server locale (HTTP_SYNC_ATTIVO), quindi
   l'elenco va caricato con un fetch asincrono invece che essere già dentro STATE. Cache semplice a
   livello di modulo: null = non ancora caricato, 'errore' = richiesta fallita, altrimenti l'array
   ricevuto dal server. Si aggiorna da sola (nuovo fetch) ogni volta che torna a null. */
let BACKUP_SERVER_ELENCO = null;
let BACKUP_SERVER_CARICAMENTO = false;
function caricaElencoBackupServer() {
  // BACKUP_SERVER_ELENCO !== null è fondamentale: cardBackupAutomatici() chiama questa funzione a
  // OGNI suo render (compreso quello scatenato dal render() qui sotto, una volta arrivata la
  // risposta) - senza questo controllo si innescherebbe un fetch nuovo a ogni giro, all'infinito.
  // Per ricaricare (es. dopo un ripristino) si azzera BACKUP_SERVER_ELENCO altrove, non si richiama
  // mai questa funzione "forzando" un nuovo fetch qui dentro.
  if (!HTTP_SYNC_ATTIVO || BACKUP_SERVER_CARICAMENTO || BACKUP_SERVER_ELENCO !== null) return;
  BACKUP_SERVER_CARICAMENTO = true;
  fetch('/api/backup/elenco')
    .then(r => r.json())
    .then(lista => { BACKUP_SERVER_ELENCO = Array.isArray(lista) ? lista : 'errore'; })
    .catch(() => { BACKUP_SERVER_ELENCO = 'errore'; })
    .finally(() => {
      BACKUP_SERVER_CARICAMENTO = false;
      if (VIEW === 'impostazioni') render();
    });
}
function ripristinaBackupServer(file) {
  if (!HTTP_SYNC_ATTIVO || !file) return;
  if (!confermaAzione('Ripristinare i dati da questo backup? Sostituirà i dati attuali su tutti i dispositivi collegati (viene comunque salvata automaticamente una copia di quelli di adesso prima di sovrascrivere, quindi anche questa operazione è reversibile).')) return;
  fetch('/api/backup/ripristina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) })
    .then(r => r.json())
    .then(esito => {
      if (esito && esito.ok) { toast('✅ Dati ripristinati dal backup.'); BACKUP_SERVER_ELENCO = null; }
      else toast('⚠️ ' + ((esito && esito.errore) || 'Ripristino non riuscito.'), true);
    })
    .catch(() => toast('⚠️ Impossibile contattare il server locale per il ripristino.', true));
}
/* -------------------- Aggiornamenti e log (task #158) --------------------
   Stesso schema di caching di BACKUP_SERVER_ELENCO qui sopra: un fetch alla volta, non a ogni
   render. Il controllo versione è SEMPRE manuale (bottone "Verifica aggiornamenti") - Prisma non
   contatta mai internet da solo/in background, solo quando l'utente lo chiede esplicitamente. */
let AGGIORNAMENTI_CACHE = null; // null = non ancora controllato, 'errore', 'caricamento', oppure l'oggetto risposta
let AGGIORNAMENTI_IN_CORSO = false; // true mentre si sta scaricando/applicando l'aggiornamento vero e proprio
let AGGIORNAMENTO_SCARICATO; // undefined = non ancora chiesto al server; null = niente di scaricato; oppure { versione, versioneLocale }
function caricaStatoAggiornamentoScaricato() {
  if (AGGIORNAMENTO_SCARICATO !== undefined || !HTTP_SYNC_ATTIVO) return;
  AGGIORNAMENTO_SCARICATO = null;
  fetch('/api/aggiornamenti/stato').then(r => r.json()).then(info => {
    AGGIORNAMENTO_SCARICATO = info && info.ok && info.scaricata ? { versione: info.scaricata.versione, versioneLocale: info.versioneLocale } : null;
    if (VIEW === 'impostazioni') render();
  }).catch(() => {});
}
let AGGIORNAMENTI_RISULTATO = null; // esito dell'ultima applicazione: {ok, messaggio} - mostrato una volta, poi si può richiudere
function verificaAggiornamenti() {
  if (!HTTP_SYNC_ATTIVO) return;
  AGGIORNAMENTI_CACHE = 'caricamento';
  render();
  fetch('/api/aggiornamenti/verifica').then(r => r.json()).then(info => {
    AGGIORNAMENTI_CACHE = (info && info.ok) ? info : 'errore';
    if (info && info.ok) AGGIORNAMENTO_SCARICATO = info.scaricata ? { versione: info.scaricata.versione, versioneLocale: info.versioneLocale } : null;
  }).catch(() => { AGGIORNAMENTI_CACHE = 'errore'; })
    .finally(() => { if (VIEW === 'impostazioni') render(); });
}
async function applicaAggiornamentoConferma() {
  if (!confermaAzione('Scaricare la nuova versione? Non viene installata subito: i file restano in attesa e si attivano quando riavvii il server.')) return;
  AGGIORNAMENTI_IN_CORSO = true;
  AGGIORNAMENTI_RISULTATO = null;
  render();
  try {
    const r = await fetch('/api/aggiornamenti/scarica', { method: 'POST' });
    const info = await r.json();
    if (info && info.ok) {
      const vNuova = AGGIORNAMENTI_CACHE && AGGIORNAMENTI_CACHE.versioneRemota, vAtt = AGGIORNAMENTI_CACHE && AGGIORNAMENTI_CACHE.versioneLocale;
      AGGIORNAMENTO_SCARICATO = { versione: vNuova, versioneLocale: vAtt };
      AGGIORNAMENTI_RISULTATO = null;
    } else {
      AGGIORNAMENTI_RISULTATO = { ok: false, messaggio: (info && info.errore) || 'Errore sconosciuto.' };
    }
  } catch (err) {
    AGGIORNAMENTI_RISULTATO = { ok: false, messaggio: 'Download non riuscito: ' + err.message };
  } finally {
    AGGIORNAMENTI_IN_CORSO = false;
    render();
  }
}
function cardAggiornamentiELog() {
  caricaStatoAggiornamentoScaricato();
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="card">
      <div class="section-title">Aggiornamenti, log e assistenza</div>
      <div class="helptext">Disponibile solo con il server locale acceso (server.js) - apri il gestionale dall'indirizzo del server locale invece che come file.</div>
    </div>`;
  }
  let corpoVersione;
  if (AGGIORNAMENTI_CACHE === null) {
    corpoVersione = `<button class="btn small" data-action="verifica-aggiornamenti">Verifica aggiornamenti</button>`;
  } else if (AGGIORNAMENTI_CACHE === 'caricamento') {
    corpoVersione = `<div class="helptext">Controllo in corso…</div>`;
  } else if (AGGIORNAMENTI_CACHE === 'errore') {
    corpoVersione = `<div class="helptext">⚠️ Non sono riuscito a controllare (nessuna connessione internet, o l'aggiornamento non è ancora stato configurato). <button class="btn small" data-action="verifica-aggiornamenti">Riprova</button></div>`;
  } else if (AGGIORNAMENTI_CACHE.aggiornamentoDisponibile) {
    corpoVersione = `<div class="helptext" style="margin-bottom:8px;">Versione installata: ${escapeHtml(AGGIORNAMENTI_CACHE.versioneLocale)} → <b>nuova versione disponibile: ${escapeHtml(AGGIORNAMENTI_CACHE.versioneRemota)}</b></div>${renderNoteAggiornamento(AGGIORNAMENTI_CACHE.note, AGGIORNAMENTI_CACHE.versioneRemota)}
      <button class="btn primary small" data-action="applica-aggiornamento" ${AGGIORNAMENTI_IN_CORSO || (AGGIORNAMENTO_SCARICATO && AGGIORNAMENTO_SCARICATO.versione === AGGIORNAMENTI_CACHE.versioneRemota) ? 'disabled' : ''}>${AGGIORNAMENTI_IN_CORSO ? 'Download…' : (AGGIORNAMENTO_SCARICATO && AGGIORNAMENTO_SCARICATO.versione === AGGIORNAMENTI_CACHE.versioneRemota ? 'Già scaricato' : 'Scarica aggiornamento')}</button>`;
  } else {
    corpoVersione = `<div class="helptext">Versione installata: ${escapeHtml(AGGIORNAMENTI_CACHE.versioneLocale)} — già la più recente. <button class="btn small ghost" data-action="verifica-aggiornamenti">Ricontrolla</button></div>`;
  }
  const sc = AGGIORNAMENTO_SCARICATO;
  const alertScaricato = sc ? `<div style="border:2px solid var(--arancio,#e08a2c);background:#fff4e5;border-radius:10px;padding:10px 14px;margin-bottom:10px;">
      <div style="font-weight:800;color:#a85d00;">⬇ Aggiornamento scaricato, in attesa di riavvio</div>
      <div style="font-size:13px;margin-top:4px;">La versione attuale è la <b>${escapeHtml(sc.versioneLocale || (AGGIORNAMENTI_CACHE && AGGIORNAMENTI_CACHE.versioneLocale) || '—')}</b> e l'aggiornamento per la <b>${escapeHtml(sc.versione || '—')}</b> è già scaricato: basta riavviare il server per attuarlo.</div>
      <button class="btn small primary" style="margin-top:8px;" data-action="riavvia-server">🔄 Riavvia il server ora</button>
    </div>` : '';
  const esito = AGGIORNAMENTI_RISULTATO ? `<div class="helptext" style="margin-top:8px;${AGGIORNAMENTI_RISULTATO.ok ? '' : 'color:var(--rosso);'}">${escapeHtml(AGGIORNAMENTI_RISULTATO.messaggio)}</div>` : '';
  return `<div class="card">
    <div class="section-title">Aggiornamenti, log e assistenza</div>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Aggiornamenti</div>
      ${alertScaricato}
      ${corpoVersione}
      ${esito}
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Log</div>
      <div class="helptext" style="margin-bottom:8px;">Se qualcosa non funziona, scarica questo file e mandalo a chi ti assiste — aiuta a capire cosa è successo, soprattutto perché Prisma non mostra più una finestra nera con i messaggi.</div>
      <a class="btn small" href="/api/log" download="prisma-log.txt">⬇ Scarica il log</a>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Manutenzione</div>
      <div class="helptext" style="margin-bottom:8px;">Riavvia il processo del server locale (es. dopo aver installato un aggiornamento). Chi ha il gestionale aperto vede un avviso con conto alla rovescia prima della disconnessione; il riavvio effettivo (rilanciare "node server.js") resta comunque manuale su questo PC.</div>
      <button class="btn small" data-action="riavvia-server">🔄 Riavvia server</button>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Assistenza remota</div>
      <div class="helptext">Per farti aiutare a distanza, usa <b>Assistenza rapida di Windows</b> (cercala nel menu Start: è già installata, gratuita) oppure TeamViewer/AnyDesk — chi presta assistenza vede e controlla lo schermo solo per la durata della sessione, poi l'accesso si chiude da solo.</div>
    </div>
  </div>`;
}
function cardBackupAutomatici() {
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="card">
      <div class="section-title">Backup automatici (server locale)</div>
      <div class="helptext">Con il server locale acceso (server.js) il gestionale salva da solo una copia dei dati alle 8:00, alle 12:00 e alle 16:00, più una appena il server si avvia — così non perdi lo snapshot se non è acceso in quegli orari esatti — tenendo lo storico degli ultimi 30 giorni in una cartella "backup" accanto a dati-studio.json. Per vederli e usarli, apri il gestionale dall'indirizzo del server locale (es. http://localhost:8420) invece che come file.</div>
    </div>`;
  }
  caricaElencoBackupServer();
  let corpo;
  if (BACKUP_SERVER_ELENCO === null || BACKUP_SERVER_CARICAMENTO) {
    corpo = `<div class="helptext">Caricamento elenco backup…</div>`;
  } else if (BACKUP_SERVER_ELENCO === 'errore') {
    corpo = `<div class="helptext">⚠️ Non è stato possibile leggere l'elenco dei backup dal server locale.</div>`;
  } else if (BACKUP_SERVER_ELENCO.length === 0) {
    corpo = `<div class="helptext">Nessun backup automatico ancora presente (il primo si crea al prossimo orario fisso — 8:00, 12:00, 16:00 — o al prossimo avvio del server).</div>`;
  } else {
    corpo = `<table class="compact backup-elenco-tabella"><thead><tr><th>Data e ora</th><th>Dimensione</th><th></th></tr></thead><tbody>
      ${BACKUP_SERVER_ELENCO.map(b => `<tr>
        <td>${fmtDataOra(b.data)}</td>
        <td>${(b.dimensione/1024).toFixed(1)} KB</td>
        <td><button class="btn small danger" data-action="ripristina-backup-server" data-file="${escapeHtml(b.file)}">Ripristina</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  }
  return `<div class="card">
    <div class="section-title">Backup automatici (server locale)<span class="cnt">ultimi 30 giorni</span></div>
    <div class="helptext" style="margin-bottom:10px;">Snapshot automatici di dati-studio.json creati dal server locale alle 8:00, alle 12:00, alle 16:00 e a ogni avvio del server — indipendenti dal backup manuale qui sopra. Servono per tornare a un punto preciso nel tempo se un dato viene cancellato per sbaglio o un import va storto.</div>
    ${corpo}
  </div>`;
}

/* Task #97 (Matteo, dopo l'incidente del rollback aggiornamento del 25/09/2026: un manifesto GitHub
   di test dimenticato aveva sovrascritto gestionale.htm/server.js con una versione vecchissima, e
   non c'era NESSUNO snapshot del codice da cui recuperare, solo dei dati): stesso schema di
   BACKUP_SERVER_ELENCO/cardBackupAutomatici qui sopra, ma per gli snapshot del CODICE della
   piattaforma (vedi eseguiBackupPiattaforma/elencoBackupPiattaforma in server.js), non dei dati -
   una card separata perché sono due cose diverse (dati dei clienti vs. file dell'app) con rischio e
   frequenza di modifica molto diversi. */
let BACKUP_PIATTAFORMA_ELENCO = null;
let BACKUP_PIATTAFORMA_CARICAMENTO = false;
function caricaElencoBackupPiattaforma() {
  if (!HTTP_SYNC_ATTIVO || BACKUP_PIATTAFORMA_CARICAMENTO || BACKUP_PIATTAFORMA_ELENCO !== null) return;
  BACKUP_PIATTAFORMA_CARICAMENTO = true;
  fetch('/api/backup/elenco-piattaforma')
    .then(r => r.json())
    .then(lista => { BACKUP_PIATTAFORMA_ELENCO = Array.isArray(lista) ? lista : 'errore'; })
    .catch(() => { BACKUP_PIATTAFORMA_ELENCO = 'errore'; })
    .finally(() => {
      BACKUP_PIATTAFORMA_CARICAMENTO = false;
      if (VIEW === 'impostazioni') render();
    });
}
function ripristinaBackupPiattaforma(timestamp) {
  if (!HTTP_SYNC_ATTIVO || !timestamp) return;
  if (!confermaAzione('Ripristinare il CODICE di Prisma (gestionale.htm/server.js/portale-cliente.htm) a questo punto nel tempo? Il codice attuale viene comunque salvato prima di sovrascrivere (anche questa operazione è reversibile), ma dopo il ripristino serve chiudere e riaprire Prisma perché il nuovo codice venga usato davvero - il processo in corso continua a girare con quello attuale finché non lo riavvii.')) return;
  fetch('/api/backup/ripristina-piattaforma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timestamp }) })
    .then(r => r.json())
    .then(esito => {
      if (esito && esito.ok) { toast('✅ Codice ripristinato (' + esito.file.join(', ') + '). Riavvia Prisma per usarlo.'); BACKUP_PIATTAFORMA_ELENCO = null; render(); }
      else toast('⚠️ ' + ((esito && esito.errore) || 'Ripristino non riuscito.'), true);
    })
    .catch(() => toast('⚠️ Impossibile contattare il server locale per il ripristino.', true));
}
let BACKUP_ESTERNO = null; // {cartella, ultimo} dal server
function caricaBackupEsterno() {
  if (!HTTP_SYNC_ATTIVO || BACKUP_ESTERNO !== null) return;
  BACKUP_ESTERNO = { cartella: '', ultimo: null, caricamento: true };
  fetch('/api/backup/esterno').then(r => r.json()).then(d => { BACKUP_ESTERNO = d; })
    .catch(() => { BACKUP_ESTERNO = { cartella: '', ultimo: null }; })
    .finally(() => { if (VIEW === 'impostazioni') render(); });
}
function cardBackupEsterno() {
  if (!HTTP_SYNC_ATTIVO) return '';
  caricaBackupEsterno();
  const b = BACKUP_ESTERNO || { cartella: '', ultimo: null };
  const u = b.ultimo;
  const stato = !b.cartella ? '<span class="helptext">Non impostata: i backup stanno solo sul disco di questo PC.</span>'
    : (u ? (u.ok ? `<span style="color:var(--verde,#1c8c4e);">✓ Ultima copia: ${fmtDataOra(u.data)}</span>` : `<span style="color:var(--rosso);">⚠ Ultima copia non riuscita: ${escapeHtml(u.errore || '')}</span>`)
      : '<span class="helptext">Cartella impostata: la prima copia parte al prossimo backup (8:00/12:00/16:00 o riavvio) oppure con "Copia ora".</span>');
  return `<div class="card">
    <div class="section-title">Copia esterna dei backup</div>
    <div class="helptext" style="margin-bottom:10px;">Se il disco di questo PC si rompe, perdi dati <b>e</b> backup insieme. Indica una cartella su un altro disco, un NAS o una cartella sincronizzata (OneDrive, Google Drive...): a ogni backup Prisma ci copia i dati, i documenti dei clienti e la configurazione.</div>
    <div class="helptext" style="margin-bottom:10px;">⚠ La chiave che decifra le password dello studio (<code>credenziali.key</code>) resta solo nella copia locale <code>backup/config</code>: <b>non</b> viene copiata all'esterno, per non vanificare la cifratura. Conservane una copia a parte (es. chiavetta in cassaforte): senza di essa, dopo un ripristino su un altro PC le password non si leggono più.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input type="text" id="backupEsternoCartella" value="${escapeHtml(b.cartella || '')}" placeholder="es. D:\\Backup\\Prisma  oppure  \\\\NAS\\studio\\prisma" style="flex:1;min-width:260px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;">
      <button class="btn primary" data-action="backup-esterno-salva">Salva e copia</button>
      ${b.cartella ? '<button class="btn" data-action="backup-esterno-ora">Copia ora</button>' : ''}
    </div>
    <div style="margin-top:8px;font-size:13px;">${stato}</div>
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
      <div class="helptext" style="margin-bottom:8px;">Hai cancellato dei documenti dei clienti per sbaglio? Recupera quelli mancanti dallo specchio di backup (i file esistenti non vengono toccati).</div>
      <button class="btn small" data-action="ripristina-documenti-mancanti">Recupera documenti mancanti</button>
    </div>
  </div>`;
}
function cardBackupPiattaforma() {
  if (!HTTP_SYNC_ATTIVO) return ''; // stessa card di sopra già spiega il perché quando manca il server locale, non serve ripeterlo due volte
  caricaElencoBackupPiattaforma();
  let corpo;
  if (BACKUP_PIATTAFORMA_ELENCO === null || BACKUP_PIATTAFORMA_CARICAMENTO) {
    corpo = `<div class="helptext">Caricamento elenco…</div>`;
  } else if (BACKUP_PIATTAFORMA_ELENCO === 'errore') {
    corpo = `<div class="helptext">⚠️ Non è stato possibile leggere l'elenco degli snapshot dal server locale.</div>`;
  } else if (BACKUP_PIATTAFORMA_ELENCO.length === 0) {
    corpo = `<div class="helptext">Nessuno snapshot di codice ancora presente (il primo si crea al prossimo orario fisso — 8:00, 12:00, 16:00 — o al prossimo avvio del server).</div>`;
  } else {
    corpo = `<table class="compact backup-elenco-tabella"><thead><tr><th>Data e ora</th><th>File inclusi</th><th></th></tr></thead><tbody>
      ${BACKUP_PIATTAFORMA_ELENCO.map(v => `<tr>
        <td>${fmtDataOra(v.data)}</td>
        <td>${v.file.map(f => escapeHtml(f.nomeOriginale)).join(', ')}</td>
        <td><button class="btn small danger" data-action="ripristina-backup-piattaforma" data-timestamp="${escapeHtml(v.timestamp)}">Ripristina</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  }
  return `<div class="card">
    <div class="section-title">Backup del codice (server locale)<span class="cnt">ultimi 30 giorni</span></div>
    <div class="helptext" style="margin-bottom:10px;">Snapshot automatici di gestionale.htm, server.js e portale-cliente.htm — non i dati dei clienti (quelli sono nella card sopra), ma il codice stesso della piattaforma. Servono per tornare indietro con un clic se un aggiornamento installa per sbaglio una versione rotta o vecchia, senza dover recuperare i file a mano.</div>
    ${corpo}
  </div>`;
}

/* -------------------- IMPOSTAZIONI: accesso esterno via ngrok (clienti + collaboratori) -------------------- */
let ACCESSO_ESTERNO_CACHE = null;
let ACCESSO_ESTERNO_CARICAMENTO = false;
/* BUG segnalato da Matteo ("scrivo utente e password e non succede nulla, il pulsante non si
   illumina, poi i dati scritti si cancellano"): il pulsante "Attiva porta" era disabilitato in base
   a dati.utente/dati.password letti dalla CACHE del server (ACCESSO_ESTERNO_CACHE) — che restano
   vuoti finché non si salva, quindi il pulsante non poteva MAI accendersi scrivendo (il salvataggio
   che avrebbe aggiornato la cache è esattamente ciò che il pulsante disabilitato impediva: un
   vicolo cieco). In più, l'input leggeva il proprio value="..." dalla stessa cache statica: al primo
   render "in background" (es. il polling presenza ogni 8s, se il focus è momentaneamente altrove)
   il campo tornava al valore vecchio, cancellando quanto digitato. Questo buffer separato
   (inizializzato una sola volta dalla cache, MAI più sovrascritto da un re-render) rompe entrambi i
   problemi: l'input riflette sempre l'ultimo valore digitato, e il pulsante si abilita/disabilita
   dal vivo via oninput (vedi aggiornaBottoneAccessoEsterno), senza aspettare un giro di salvataggio. */
let ACCESSO_ESTERNO_DRAFT = null;
// Task #173 (Matteo: "ngrok per il portale clienti non funziona, controlla che non vada in
// confusione con il fatto che ti avevo chiesto fosse sempre attiva"): la vecchia card leggeva
// SOLO /api/accesso-esterno, che per la porta clienti dice solo "il listener locale è su" (sempre
// vero) - da cui il badge fuorviante "🟢 Sempre attiva" anche quando ngrok non aveva nessun tunnel
// davvero aperto verso internet. Ora si interroga ANCHE /api/ngrok-tunnels (stato vero, da ngrok
// stesso) nello stesso giro, cosi' la card puo' mostrare i due segnali separati: "porta locale" vs
// "tunnel ngrok verso internet". Se l'interrogazione a ngrok fallisce (es. ngrok non installato)
// tunnelReali resta null - la card lo tratta come "non verificabile", non come "sicuramente spento".
//
// Task #199 (Matteo: "ngrok per i clienti non funziona più" / "anche per i collaboratori non
// va"): la causa reale era il piano ngrok gratuito, che assegna UN SOLO dominio pubblico per
// account - due tunnel ngrok simultanei (uno per porta, come prima) finivano sempre in conflitto
// sullo stesso dominio. Clienti e collaboratori condividono ora LA STESSA porta/lo stesso tunnel
// (vedi server.js, PORTA_ESTERNA): un solo "/api/accesso-esterno" senza più portaClienti/portaTeam
// separati, un solo tunnel da interrogare su /api/ngrok-tunnels.
function caricaStatoAccessoEsterno() {
  if (!HTTP_SYNC_ATTIVO || ACCESSO_ESTERNO_CARICAMENTO || ACCESSO_ESTERNO_CACHE !== null) return;
  ACCESSO_ESTERNO_CARICAMENTO = true;
  Promise.all([
    fetch('/api/accesso-esterno').then(r => r.json()),
    fetch('/api/ngrok-tunnels').then(r => r.json()).catch(() => ({ ok: false })),
  ])
    .then(([info, tunnelInfo]) => {
      ACCESSO_ESTERNO_CACHE = (info && info.ok) ? info : 'errore';
      if (ACCESSO_ESTERNO_CACHE !== 'errore' && !ACCESSO_ESTERNO_DRAFT) {
        ACCESSO_ESTERNO_DRAFT = {
          team: { utente: info.team.utente || '', password: info.team.password || '' },
        };
      }
      if (ACCESSO_ESTERNO_CACHE !== 'errore') {
        const porteConTunnel = tunnelInfo && tunnelInfo.ok ? new Set((tunnelInfo.tunnel || []).map(t => t.porta)) : null;
        ACCESSO_ESTERNO_CACHE.tunnelReali = porteConTunnel; // null = non verificabile ora, altrimenti Set delle porte con un tunnel ngrok attivo davvero
      }
    })
    .catch(() => { ACCESSO_ESTERNO_CACHE = 'errore'; })
    .finally(() => {
      ACCESSO_ESTERNO_CARICAMENTO = false;
      if (VIEW === 'impostazioni') render();
    });
}
// Badge per lo stato REALE del tunnel ngrok di una porta (distinto dal badge "porta locale" già
// esistente) - usa tunnelReali calcolato sopra.
function badgeTunnelNgrok(porta) {
  const set = ACCESSO_ESTERNO_CACHE && ACCESSO_ESTERNO_CACHE.tunnelReali;
  if (set === null || set === undefined) return `<span class="badge" title="Non siamo riusciti a interrogare ngrok in questo momento (potrebbe non essere installato o non in esecuzione su questo PC).">⚪ ngrok: non verificabile</span>`;
  return set.has(porta)
    ? `<span class="badge ok">🌐 ngrok: raggiungibile da internet</span>`
    : `<span class="badge">⚪ ngrok: non attivo al momento</span>`;
}
function aggiornaBottoneAccessoEsterno(tipo) {
  const btn = document.querySelector(`[data-action="salva-accesso-esterno"][data-tipo="${tipo}"]`);
  if (!btn || !ACCESSO_ESTERNO_DRAFT) return;
  const d = ACCESSO_ESTERNO_DRAFT[tipo];
  btn.disabled = !(d.utente.trim() && d.password.trim());
}
/* Accesso dalla rete dello studio: ogni dispositivo (altri PC, tablet, app "Prisma rete") deve essere autorizzato con la
   password dello studio, una volta sola (vedi server.js, bloccaSeDispositivoNonAutorizzato). Qui si cambia la password
   e si revocano i dispositivi. Il server accetta queste operazioni SOLO dal PC dello studio. */
let ACCESSO_LAN_CACHE = null; // null = da caricare, 'errore' = non disponibile da qui, altrimenti {dispositivi, passwordInizialeInFile}
let ACCESSO_LAN_CARICAMENTO = false;
let ACCESSO_LAN_ESITO = null;
let ACCESSO_LAN_VISIBILE = false;
function caricaAccessoLan(forza) {
  if (!HTTP_SYNC_ATTIVO || ACCESSO_LAN_CARICAMENTO || (ACCESSO_LAN_CACHE !== null && !forza)) return;
  ACCESSO_LAN_CARICAMENTO = true;
  fetch('/api/accesso-lan').then(r => r.json())
    .then(d => { ACCESSO_LAN_CACHE = (d && d.ok) ? d : 'errore'; })
    .catch(() => { ACCESSO_LAN_CACHE = 'errore'; })
    .finally(() => { ACCESSO_LAN_CARICAMENTO = false; if (VIEW === 'impostazioni') render(); });
}
function cardAccessoRete() {
  if (!HTTP_SYNC_ATTIVO) return '';
  caricaAccessoLan(false);
  const c = ACCESSO_LAN_CACHE;
  let corpo;
  if (c === null) corpo = '<div class="helptext">Caricamento…</div>';
  else if (c === 'errore') corpo = '<div class="helptext">Si gestisce solo dal PC dello studio (quello su cui gira il server).</div>';
  else {
    const righe = c.dispositivi.length
      ? c.dispositivi.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);">
          <div><strong>${escapeHtml(d.nome || 'Dispositivo')}</strong><div class="helptext">${escapeHtml(d.ip || '')} · autorizzato il ${fmtDataOra(d.creato)} · ultimo uso ${fmtDataOra(d.ultimoUso)}</div></div>
          <button class="btn small" data-action="lan-revoca" data-id="${escapeHtml(d.id)}">Revoca</button></div>`).join('')
      : '<div class="helptext" style="padding:8px 0;border-top:1px solid var(--border);">Nessun altro dispositivo autorizzato.</div>';
    const rigaPwd = c.password
      ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;"><span class="helptext">Password attuale:</span><code id="lanPasswordVista" style="font-size:15px;font-weight:700;letter-spacing:.04em;background:var(--blu-light);border-radius:6px;padding:4px 10px;user-select:all;">${ACCESSO_LAN_VISIBILE ? escapeHtml(c.password) : '\u2022'.repeat(Math.min(c.password.length, 14))}</code><button class="btn small" data-action="lan-mostra-password">${ACCESSO_LAN_VISIBILE ? 'Nascondi' : 'Mostra'}</button></div>`
      : '<div class="helptext" style="margin-bottom:12px;">La password attuale non è recuperabile (è stata impostata prima di questa funzione): scegline una nuova qui sotto e la vedrai sempre qui.</div>';
    corpo = `${rigaPwd}${c.passwordInizialeInFile ? '<div class="helptext" style="background:var(--giallo-bg);color:var(--giallo);border-radius:8px;padding:8px 10px;margin-bottom:10px;">La password iniziale generata dal server è nel file <b>password-accesso-rete-locale.txt</b> nella cartella di Prisma. Dopo averla data ai colleghi, scegline una tua qui sotto: il file si elimina da solo.</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
        <input type="text" id="lanNuovaPassword" placeholder="Nuova password (almeno 8 caratteri)" autocomplete="off" style="flex:1;min-width:220px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;" onkeydown="if(event.key==='Enter'){event.preventDefault();var b=document.querySelector('[data-action=lan-cambia-password]');if(b)b.click();}">
        <button class="btn primary small" data-action="lan-cambia-password">Cambia password</button>
      </div>
      <div class="helptext" style="margin-bottom:6px;">Cambiare la password disconnette tutti i dispositivi: dovranno rientrare con la nuova.</div>
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin:10px 0 2px;">Dispositivi autorizzati (${c.dispositivi.length})</div>
      ${righe}
      ${c.dispositivi.length ? '<button class="btn small ghost" style="margin-top:10px;" data-action="lan-revoca-tutti">Disconnetti tutti</button>' : ''}`;
  }
  const esito = ACCESSO_LAN_ESITO ? `<div class="helptext" style="margin-top:8px;${ACCESSO_LAN_ESITO.ok ? '' : 'color:var(--rosso);'}">${escapeHtml(ACCESSO_LAN_ESITO.messaggio)}</div>` : '';
  return `<div class="card">
    <div class="section-title">Accesso dalla rete dello studio</div>
    <div class="helptext" style="margin-bottom:10px;">Gli altri PC e dispositivi collegati alla rete devono essere autorizzati con la password dello studio (la chiedono una sola volta). Questo PC entra sempre senza password. Il portale dei clienti non è coinvolto.</div>
    ${corpo}${esito}
  </div>`;
}
function azioneAccessoLan(percorso, corpo, messaggioOk) {
  fetch('/api/accesso-lan/' + percorso, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(r => r.json())
    .then(d => { ACCESSO_LAN_ESITO = d && d.ok ? { ok: true, messaggio: messaggioOk } : { ok: false, messaggio: (d && d.errore) || 'Operazione non riuscita.' }; })
    .catch(() => { ACCESSO_LAN_ESITO = { ok: false, messaggio: 'Server non raggiungibile.' }; })
    .finally(() => { ACCESSO_LAN_CACHE = null; caricaAccessoLan(true); });
}
function cardAccessoEsterno() {
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="card">
      <div class="section-title">Accesso esterno (ngrok)</div>
      <div class="helptext">Disponibile solo con il server locale acceso: apri il gestionale dall'indirizzo del server locale (es. http://localhost:8420) invece che come file.</div>
    </div>`;
  }
  caricaStatoAccessoEsterno();
  if (ACCESSO_ESTERNO_CACHE === null) {
    return `<div class="card"><div class="section-title">Accesso esterno (ngrok)</div><div class="helptext">Caricamento…</div></div>`;
  }
  if (ACCESSO_ESTERNO_CACHE === 'errore') {
    return `<div class="card"><div class="section-title">Accesso esterno (ngrok)</div><div class="helptext">⚠️ Non è stato possibile leggere lo stato dell'accesso esterno dal server locale.</div></div>`;
  }
  const info = ACCESSO_ESTERNO_CACHE;
  // Layout (rifatto su richiesta di Matteo, "è un casino"): UNA card, tre blocchi numerati con la
  // stessa struttura (titolo + una riga di spiegazione + controlli): 1) tunnel ngrok, 2) accesso
  // collaboratori, 3) area riservata dei clienti. Clienti e collaboratori condividono una sola
  // porta/un solo tunnel (task #199): si distinguono per percorso (/portale/<codice> = cliente).
  const draft = ACCESSO_ESTERNO_DRAFT.team;
  const credenzialiPronte = !!(draft.utente.trim() && draft.password.trim());
  const porta = info.porta;
  const titoloBlocco = (n, t, badges) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
      <div style="font-size:14px;font-weight:700;">${n}. ${t}</div><div style="display:flex;gap:6px;flex-wrap:wrap;">${badges || ''}</div></div>`;
  const blocco = 'padding:18px 0;border-top:1px solid var(--border);';
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div class="section-title">Accesso esterno (ngrok)</div><button class="btn small primary" data-action="wiz-apri">🧭 Procedura guidata</button></div>
    <div class="helptext" style="margin-bottom:14px;">Per aprire Prisma da fuori studio servono due cose: un <b>tunnel ngrok</b> acceso (blocco 1: è solo il collegamento a internet, da solo non dà accesso a nessuno) e poi chi può entrare: i <b>collaboratori</b> con utente e password (blocco 2, gestionale completo) e i <b>clienti</b> con il proprio link personale (blocco 3, solo i loro dati).</div>

    <div style="${blocco}border-top:none;padding-top:4px;">
      ${titoloBlocco(1, 'Collegamento a internet (tunnel ngrok)', `${badgeTunnelNgrok(porta)}`)}
      <div class="helptext" style="margin-bottom:10px;">Serve ngrok installato e configurato una volta con il tuo authtoken (<code>ngrok config add-authtoken &lt;token&gt;</code>). Parte in background, senza finestre. Con il piano gratuito c'è un solo tunnel, ed è sufficiente per tutti.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn small primary" data-action="avvia-ngrok" data-porta="${porta}">🚀 Avvia ngrok</button>
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer;">
        <input type="checkbox" data-action="ngrok-autoavvio-toggle" ${info.ngrokAutoavvio !== false ? 'checked' : ''}>
        Avvia ngrok automaticamente a ogni avvio di Prisma
      </label>
    </div>

    <div style="${blocco}">
      ${titoloBlocco(2, 'Collaboratori dello studio (gestionale completo)', info.team.attivo ? '<span class="badge ok">🟢 Accesso attivo</span>' : '<span class="badge">⚪ Accesso non impostato</span>')}
      <div class="helptext" style="margin-bottom:10px;">I collaboratori aprono l'<b>indirizzo base</b> e inseriscono utente e password: vedono l'intero gestionale come in studio. Usalo solo con persone di fiducia e una password robusta. Senza utente e password nessuno entra.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button class="btn small" data-action="copia-link-ngrok" data-porta="${porta}">🌐 Copia indirizzo (internet, via ngrok)</button>
        <button class="btn small" data-action="copia-link-rete" data-porta="${porta}">🖧 Copia indirizzo (rete dello studio)</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:480px;margin-bottom:10px;">
        <div class="field"><label>Utente</label><input type="text" id="accEst_team_utente" value="${escapeHtml(draft.utente)}" placeholder="es. studio" data-action="accesso-esterno-campo" data-tipo="team" data-campo="utente"></div>
        <div class="field"><label>Password</label><input type="text" id="accEst_team_password" value="${escapeHtml(draft.password)}" placeholder="scegli una password" data-action="accesso-esterno-campo" data-tipo="team" data-campo="password"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn primary" data-action="salva-accesso-esterno" data-tipo="team" ${credenzialiPronte ? '' : 'disabled title="Compila utente e password"'}>${info.team.attivo ? 'Aggiorna credenziali' : 'Attiva accesso collaboratori'}</button>
        ${info.team.attivo ? `<button class="btn danger" data-action="disattiva-accesso-esterno" data-tipo="team">Disattiva</button>` : ''}
      </div>
    </div>

    ${sezioneAreaRiservataCliente(blocco, titoloBlocco)}
  </div>`;
}

/* Blocco 3: scegli un cliente, copia il link della sua area riservata (rete locale o ngrok; se non
   ha ancora un accesso lo si attiva copiando) e gestisci la sua password. Il portale non ha un
   "nome utente": il link personale identifica già il cliente, la password è il secondo controllo. */
let ACC_CLIENTE_SEL = null;
function sezioneAreaRiservataCliente(blocco, titoloBlocco) {
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (!attivi.length) return '';
  if (!ACC_CLIENTE_SEL || !attivi.find(c => c.id === ACC_CLIENTE_SEL)) ACC_CLIENTE_SEL = attivi[0].id;
  const c = clienteById(ACC_CLIENTE_SEL);
  const valore = Object.prototype.hasOwnProperty.call(PORTALE_PASSWORD_DRAFT, c.id) ? PORTALE_PASSWORD_DRAFT[c.id] : (c.portalePassword || '');
  const pwdAttiva = !!c.portalePassword;
  return `<div id="sezioneAreaRiservataCliente" style="${blocco}">
    ${titoloBlocco(3, 'Clienti (area riservata personale)', c.portaleToken ? '<span class="badge ok">🟢 Accesso attivo</span>' : '<span class="badge">⚪ Accesso non attivo</span>')}
    <div class="helptext" style="margin-bottom:10px;">Scegli il cliente, copia il suo link personale e mandaglielo. Se non ha ancora un accesso, copiando il link viene attivato.</div>
    <div class="field" style="max-width:420px;margin-bottom:10px;"><label>Cliente</label>
      <select data-action="acc-cliente-seleziona">${attivi.map(x => `<option value="${x.id}" ${x.id === ACC_CLIENTE_SEL ? 'selected' : ''}>${escapeHtml(x.ragioneSociale)}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <button class="btn small" data-action="copia-link-cliente" data-id="${c.id}" data-modo="rete">🖧 Copia link rete locale</button>
      <button class="btn small" data-action="copia-link-cliente" data-id="${c.id}" data-modo="ngrok">🌐 Copia link ngrok</button>
    </div>
    <div class="field" style="max-width:420px;"><label>Password del cliente ${pwdAttiva ? '(attiva)' : '(facoltativa)'}</label>
      <div style="display:flex;gap:8px;">
        <input type="text" id="portPassword_${c.id}" value="${escapeHtml(valore)}" placeholder="es. una parola facile da dettare al telefono" data-action="portale-password-campo" data-id="${c.id}" style="flex:1;">
        <button class="btn small" data-action="portale-password-salva" data-id="${c.id}">Salva</button>
        ${pwdAttiva ? `<button class="btn small ghost" data-action="portale-password-rimuovi" data-id="${c.id}">Rimuovi</button>` : ''}
      </div>
    </div>
    <div class="helptext" style="margin-top:6px;">${pwdAttiva ? 'Il cliente deve inserire questa password oltre ad aprire il link.' : 'Senza password basta il link per entrare.'}</div>
  </div>`;
}
function copiaLinkClientePortale(id, modo) {
  let c = clienteById(id);
  if (!c) return;
  if (!c.portaleToken) { c = attivaPortaleCliente(id); render(); }
  const token = c.portaleToken;
  const copia = (base, msg) => copiaTestoNegliAppunti(base.replace(/\/+$/, '') + '/portale/' + token, msg);
  const porta = ACCESSO_ESTERNO_CACHE && ACCESSO_ESTERNO_CACHE !== 'errore' ? ACCESSO_ESTERNO_CACHE.porta : 8421;
  if (modo === 'ngrok') {
    fetch('/api/ngrok-tunnels').then(r => r.json()).then(d => {
      const t = d.ok ? (d.tunnel || []).find(x => x.porta === porta) : null;
      if (!t) { toast('ngrok non è attivo in questo momento: premi "🚀 Avvia ngrok" e riprova.', true); return; }
      copia(t.publicUrl, 'Link dell\'area riservata copiato (ngrok): funziona da internet.');
    }).catch(() => toast('Non sono riuscito a interrogare ngrok dal server locale.', true));
  } else {
    fetch('/api/indirizzi-rete').then(r => r.json()).then(d => {
      if (!d.ok || !d.indirizzi || !d.indirizzi.length) { toast('Nessun indirizzo di rete locale rilevato su questo PC.', true); return; }
      copia('http://' + d.indirizzi[0] + ':' + porta, 'Link dell\'area riservata copiato (rete locale): funziona solo dalla rete dello studio.');
    }).catch(() => toast('Non sono riuscito a leggere l\'indirizzo di rete dal server locale.', true));
  }
}

/* -------------------- STRUMENTI: convertitore Word <-> PDF (task #133) -------------------- */
// Stessa cache-a-livello-di-modulo già usata per backup automatici/indirizzi di rete: un fetch
// alla volta, non richiamato a ogni render.
let CONVERSIONE_STATO_CACHE = null;
let CONVERSIONE_STATO_CARICAMENTO = false;
function caricaStatoConversione() {
  if (!HTTP_SYNC_ATTIVO || CONVERSIONE_STATO_CARICAMENTO || CONVERSIONE_STATO_CACHE !== null) return;
  CONVERSIONE_STATO_CARICAMENTO = true;
  fetch('/api/conversione-stato')
    .then(r => r.json())
    .then(info => { CONVERSIONE_STATO_CACHE = (info && info.ok) ? info : 'errore'; })
    .catch(() => { CONVERSIONE_STATO_CACHE = 'errore'; })
    .finally(() => {
      CONVERSIONE_STATO_CARICAMENTO = false;
      if (VIEW === 'strumenti') render();
    });
}
// Coppie di conversione lato client (stesse dell'endpoint /api/converti in server.js): serve solo
// per decidere le opzioni del pulsante e rifiutare un file non supportato PRIMA di caricarlo.
// Un .pdf ha DUE possibili destinazioni (Word modificabile, oppure PDF/A per l'archiviazione a
// norma - task #136): "opzioni" elenca le scelte, la prima è quella preselezionata.
const CONVERSIONI_SUPPORTATE_CLIENT = {
  docx: { opzioni: [{ verso: 'pdf', label: 'PDF' }] },
  doc: { opzioni: [{ verso: 'pdf', label: 'PDF' }] },
  odt: { opzioni: [{ verso: 'pdf', label: 'PDF' }] },
  pdf: { opzioni: [
    { verso: 'docx', label: 'Word (.docx)' },
    { verso: 'pdfa', label: 'PDF/A (archiviazione a norma)' },
  ] },
};
function opzioniConversionePer(estensione) {
  const c = CONVERSIONI_SUPPORTATE_CLIENT[estensione];
  return c ? c.opzioni : null;
}
const MIME_STRUMENTI = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

let STRUMENTI_FILE = null;       // { nome, estensione, base64, dimensione }
let STRUMENTI_FORMATO_SCELTO = null; // 'pdf' | 'docx' | 'pdfa' - quale delle opzioni sopra è selezionata
let STRUMENTI_RISULTATO = null;  // { nomeFile, base64 }
let STRUMENTI_ERRORE = null;
let STRUMENTI_IN_CORSO = false;

function blobDaBase64(base64, mime) {
  const byteChars = atob(base64 || '');
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
function resetStrumentiFile() {
  STRUMENTI_FILE = null;
  STRUMENTI_FORMATO_SCELTO = null;
  STRUMENTI_RISULTATO = null;
  STRUMENTI_ERRORE = null;
  STRUMENTI_IN_CORSO = false;
  render();
}
// Task #161: logo studio caricato dalle Impostazioni, salvato come data URL base64 dentro
// STATE.meta.logoStudio (stesso pattern FileReader.readAsDataURL di selezionaFileConversione
// qui sotto) così viaggia con il normale backup/ripristino JSON senza un endpoint dedicato.
function caricaLogoStudio(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Carica un file immagine (PNG, JPG...).', true); return; }
  const reader = new FileReader();
  reader.onerror = () => toast('Errore di lettura del file.', true);
  reader.onload = () => {
    STATE.meta.logoStudio = String(reader.result);
    salvaStato(); render(); toast('Logo caricato.');
  };
  reader.readAsDataURL(file);
}
function selezionaFileConversione(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  elaboraFileConversione(file);
}
// Estratta da selezionaFileConversione (task #202, richiesta di Matteo: "aggiungiamo anche la
// possibilità di trascinare i file") così la stessa validazione/lettura serve sia al classico
// <input type="file"> sia al trascinamento sulla dropzone - vedi onDropDelegato.
function elaboraFileConversione(file) {
  if (!file) return;
  STRUMENTI_RISULTATO = null;
  STRUMENTI_ERRORE = null;
  const estensione = (file.name.split('.').pop() || '').toLowerCase();
  const opzioni = opzioniConversionePer(estensione);
  if (!opzioni) {
    STRUMENTI_FILE = null;
    STRUMENTI_ERRORE = `Formato ".${estensione}" non supportato: carica un file .docx, .doc, .odt oppure .pdf.`;
    render();
    return;
  }
  // Task #202: il nome della cartella di origine serve solo per proporre lo stesso percorso nel
  // dialog "Salva come" del risultato (vedi salvaRisultatoNellaCartellaOriginaria) - MAI il percorso
  // assoluto completo, che il browser non concede a pagine web per motivi di sicurezza.
  const reader = new FileReader();
  reader.onerror = () => { STRUMENTI_ERRORE = 'Errore di lettura del file.'; render(); };
  reader.onload = () => {
    const base64 = String(reader.result).split(',')[1] || '';
    STRUMENTI_FILE = { nome: file.name, estensione, base64, dimensione: file.size };
    STRUMENTI_FORMATO_SCELTO = opzioni[0].verso;
    render();
  };
  reader.readAsDataURL(file);
}
// Task #202: dropzone condivisa con la lista import (vedi CSS .dropzone-file) - preventDefault su
// dragover è obbligatorio, altrimenti il browser normalmente navigherebbe via mostrando il file
// trascinato invece di far scattare "drop", e l'evento non arriverebbe mai qui.
function onDragOverDelegato(e) {
  const zona = e.target.closest && e.target.closest('[data-dropzone]');
  if (!zona) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  zona.classList.add('dropzone-attiva');
}
function onDragLeaveDelegato(e) {
  const zona = e.target.closest && e.target.closest('[data-dropzone]');
  if (!zona) return;
  zona.classList.remove('dropzone-attiva');
}
function onDropDelegato(e) {
  const zona = e.target.closest && e.target.closest('[data-dropzone]');
  if (!zona) return;
  e.preventDefault();
  zona.classList.remove('dropzone-attiva');
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  if (zona.dataset.dropzone === 'converti-file') elaboraFileConversione(files[0]);
  // Task #204: Unisci PDF accetta più file in un colpo (anche trascinati insieme dalla stessa
  // cartella), Dividi PDF ne lavora sempre uno solo alla volta.
  if (zona.dataset.dropzone === 'unisci-pdf-file') Array.from(files).forEach(elaboraFileUnisciPdf);
  if (zona.dataset.dropzone === 'dividi-pdf-file') elaboraFileDividiPdf(files[0]);
}
function avviaConversione() {
  if (!STRUMENTI_FILE || STRUMENTI_IN_CORSO) return;
  STRUMENTI_IN_CORSO = true;
  STRUMENTI_ERRORE = null;
  STRUMENTI_RISULTATO = null;
  render();
  const opzioni = opzioniConversionePer(STRUMENTI_FILE.estensione);
  const formatoDestinazione = STRUMENTI_FORMATO_SCELTO || (opzioni && opzioni[0].verso);
  fetch('/api/converti', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeFile: STRUMENTI_FILE.nome, contenutoBase64: STRUMENTI_FILE.base64, formatoDestinazione }),
  })
    .then(r => r.json())
    .then(esito => {
      if (esito && esito.ok) STRUMENTI_RISULTATO = { nomeFile: esito.nomeFile, base64: esito.contenutoBase64 };
      else STRUMENTI_ERRORE = (esito && esito.errore) || 'Conversione non riuscita.';
    })
    .catch(() => { STRUMENTI_ERRORE = 'Impossibile contattare il server locale per la conversione.'; })
    .finally(() => { STRUMENTI_IN_CORSO = false; render(); });
}
async function scaricaRisultatoConversione() {
  if (!STRUMENTI_RISULTATO) return;
  const ext = (STRUMENTI_RISULTATO.nomeFile.split('.').pop() || '').toLowerCase();
  const blob = blobDaBase64(STRUMENTI_RISULTATO.base64, MIME_STRUMENTI[ext] || 'application/octet-stream');
  try {
    const ok = await salvaFileScaricabile(STRUMENTI_RISULTATO.nomeFile, blob);
    if (ok) toast('File convertito scaricato.');
  } catch (err) {
    console.error('Download file convertito non riuscito', err);
    alert('Impossibile scaricare il file convertito in questo browser.');
  }
}
// Task #202 (Matteo: "quando il file viene prodotto aggiungerei un pulsante per salvarlo nella
// stessa cartella del file originario"): una pagina web NON può leggere il percorso assoluto di un
// file scelto dall'utente (sicurezza del browser, vale anche qui anche se gira in Electron in locale
// - niente File.path, rimosso da Electron stesso nelle versioni recenti), quindi non esiste un modo
// onesto per scrivere lì senza far vedere all'utente nessun dialog. La via più vicina alla richiesta:
// window.showSaveFilePicker apre il "Salva come" nativo di Windows, che in pratica riparte quasi
// sempre dall'ultima cartella usata in un dialog di apertura/salvataggio della stessa sessione -
// cioè, di norma, proprio la cartella da cui si è scelto/trascinato il file originale. Un clic su
// "Salva" invece di dover ripescare la cartella a mano. Se il browser non supporta questa API
// (Firefox, Safari, versioni vecchie) o l'utente annulla, si ricade sul download normale di sempre.
// Estratta a funzione generica (task #204: serve anche a Unisci/Dividi PDF, non solo al
// convertitore) - vedi il commento sopra per il perché del comportamento ("riparte quasi sempre
// dall'ultima cartella usata"). onRipiegaSuDownload è chiamato se l'API non è supportata o
// qualcosa va storto, per far comunque arrivare il file all'utente col download normale.
async function salvaBase64NellaCartellaOriginaria(nomeFile, base64, onRipiegaSuDownload, messaggioSuccesso) {
  const ext = (nomeFile.split('.').pop() || '').toLowerCase();
  const mime = MIME_STRUMENTI[ext] || 'application/octet-stream';
  const blob = blobDaBase64(base64, mime);
  if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function') {
    toast('Questo browser non permette di scegliere la cartella: uso il download normale.');
    return onRipiegaSuDownload();
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: nomeFile,
      types: [{ description: ext.toUpperCase(), accept: { [mime]: ['.' + ext] } }],
    });
    const scrittore = await handle.createWritable();
    await scrittore.write(blob);
    await scrittore.close();
    toast(messaggioSuccesso || 'File salvato.');
  } catch (err) {
    if (err && err.name === 'AbortError') return; // annullato dall'utente dal dialog, non è un errore
    console.error('Salvataggio diretto non riuscito, ripiego sul download', err);
    onRipiegaSuDownload();
  }
}
function salvaRisultatoNellaCartellaOriginaria() {
  if (!STRUMENTI_RISULTATO) return;
  return salvaBase64NellaCartellaOriginaria(STRUMENTI_RISULTATO.nomeFile, STRUMENTI_RISULTATO.base64, scaricaRisultatoConversione, 'File convertito salvato.');
}
function renderStrumenti() {
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="card"><div class="section-title">Convertitore Word ↔ PDF</div>
      <div class="helptext">Serve il server locale acceso (server.js): apri il gestionale dall'indirizzo del server (es. http://localhost:8420) invece che come file, poi torna in questa pagina.</div>
    </div>`;
  }
  caricaStatoConversione();
  let cardConvertitore;
  if (CONVERSIONE_STATO_CACHE === null || CONVERSIONE_STATO_CARICAMENTO) {
    cardConvertitore = `<div class="card"><div class="section-title">Convertitore Word ↔ PDF</div><div class="helptext">Verifica dello strumento in corso…</div></div>`;
  } else if (CONVERSIONE_STATO_CACHE === 'errore') {
    cardConvertitore = `<div class="card"><div class="section-title">Convertitore Word ↔ PDF</div><div class="helptext">⚠️ Non sono riuscito a verificare se il convertitore è disponibile su questo PC.</div></div>`;
  } else if (!CONVERSIONE_STATO_CACHE.disponibile) {
    cardConvertitore = `<div class="card"><div class="section-title">Convertitore Word ↔ PDF</div>
      <div class="helptext">Per convertire i file serve <b>LibreOffice</b> installato sul PC dove gira il server locale — gratuito, e la conversione resta tutta in locale: nessun documento del cliente esce verso servizi online.</div>
      <div class="helptext" style="margin-top:10px;">1) Scarica e installa LibreOffice da <a href="https://www.libreoffice.org/download/download/" target="_blank" rel="noopener">libreoffice.org</a> (pochi minuti).<br>2) Riavvia il server locale (chiudi e riapri "Avvia Gestionale").<br>3) Torna in questa pagina: lo strumento si attiva da solo, nessuna configurazione.</div>
    </div>`;
  } else {
    const f = STRUMENTI_FILE;
    const opzioni = f ? opzioniConversionePer(f.estensione) : null;
    const etichettaScelta = opzioni ? (opzioni.find(o => o.verso === STRUMENTI_FORMATO_SCELTO) || opzioni[0]).label : '';
    cardConvertitore = `<div class="card" style="max-width:640px;">
      <div class="section-title">Convertitore Word ↔ PDF ↔ PDF/A</div>
      <div class="helptext" style="margin-bottom:12px;">Carica un file .docx/.doc/.odt per convertirlo in PDF, oppure un .pdf per renderlo modificabile in Word o per trasformarlo in PDF/A (formato di archiviazione a norma, adatto alla conservazione digitale). Conversione locale su questo PC — i documenti non escono verso servizi online.</div>
      <div class="dropzone-file" data-dropzone="converti-file">
        <label class="btn" style="margin:0;display:inline-block;">📄 Scegli file...<input type="file" accept=".doc,.docx,.odt,.pdf" style="display:none;" data-action="strumenti-scegli-file"></label>
        <div class="helptext" style="margin-top:8px;">oppure trascina qui il file</div>
      </div>
      ${f ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;">
        <div style="font-weight:600;font-size:13.5px;">${escapeHtml(f.nome)}</div>
        <div class="helptext">${(f.dimensione/1024).toFixed(1)} KB</div>
        ${opzioni.length > 1 ? `<div class="field" style="margin-top:8px;max-width:280px;"><label>Converti in</label><select data-action="strumenti-scegli-formato">${opzioni.map(o => `<option value="${o.verso}" ${STRUMENTI_FORMATO_SCELTO===o.verso?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>` : ''}
      </div>
      <button class="btn primary" style="margin-top:10px;" data-action="strumenti-converti" ${STRUMENTI_IN_CORSO?'disabled':''}>${STRUMENTI_IN_CORSO?'Conversione in corso…':'Converti in ' + escapeHtml(etichettaScelta)}</button>
      <button class="btn ghost" style="margin-top:10px;margin-left:8px;" data-action="strumenti-reset">Annulla</button>` : ''}
      ${STRUMENTI_ERRORE ? `<div class="helptext" style="margin-top:10px;color:var(--rosso);">⚠️ ${escapeHtml(STRUMENTI_ERRORE)}</div>` : ''}
      ${STRUMENTI_RISULTATO ? `<div style="margin-top:14px;padding:12px;background:var(--verde-bg);border-radius:8px;">
        <div style="font-weight:600;font-size:13.5px;color:var(--verde);">✅ Conversione completata: ${escapeHtml(STRUMENTI_RISULTATO.nomeFile)}</div>
        <button class="btn primary small" style="margin-top:8px;" data-action="strumenti-scarica">⬇ Scarica</button>
      </div>` : ''}
    </div>`;
  }
  return cardConvertitore + renderUnisciDividiPdf();
}

/* -------------------- STRUMENTI: unisci/dividi PDF (task #204) --------------------
   Matteo: "manca uno strumento per unire e dividere i file, possiamo implementarlo?". Usa pdf-lib
   lato server (gestionale.htm manda solo i base64, come già fa il convertitore sopra) - libreria
   JS pura, nessun programma esterno da installare come LibreOffice. Due strumenti distinti perché
   "unire" lavora su PIÙ file in ingresso e "dividere" su UNO solo con un intervallo di pagine:
   provare a forzarli nella stessa interfaccia sarebbe stato più confuso, non più semplice. */
let PDF_STATO_CACHE = null;
let PDF_STATO_CARICAMENTO = false;
function caricaStatoPdf() {
  if (!HTTP_SYNC_ATTIVO || PDF_STATO_CARICAMENTO || PDF_STATO_CACHE !== null) return;
  PDF_STATO_CARICAMENTO = true;
  fetch('/api/pdf-stato')
    .then(r => r.json())
    .then(info => { PDF_STATO_CACHE = (info && info.ok) ? info : 'errore'; })
    .catch(() => { PDF_STATO_CACHE = 'errore'; })
    .finally(() => {
      PDF_STATO_CARICAMENTO = false;
      if (VIEW === 'strumenti') render();
    });
}
// --- Unisci PDF ---
let PDFU_FILE = [];       // [{nome, base64, dimensione}, ...] nell'ordine in cui verranno uniti
let PDFU_RISULTATO = null;
let PDFU_ERRORE = null;
let PDFU_IN_CORSO = false;
function resetPdfUnisci() { PDFU_FILE = []; PDFU_RISULTATO = null; PDFU_ERRORE = null; PDFU_IN_CORSO = false; render(); }
function leggiFilePdfComeBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Errore di lettura del file.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}
async function elaboraFileUnisciPdf(file) {
  if (!file) return;
  if ((file.name.split('.').pop() || '').toLowerCase() !== 'pdf') {
    PDFU_ERRORE = `"${file.name}" non è un PDF: per ora questo strumento unisce solo file .pdf.`;
    render();
    return;
  }
  try {
    const base64 = await leggiFilePdfComeBase64(file);
    PDFU_ERRORE = null;
    PDFU_RISULTATO = null;
    PDFU_FILE.push({ nome: file.name, base64, dimensione: file.size });
    render();
  } catch (err) {
    PDFU_ERRORE = 'Errore di lettura del file.';
    render();
  }
}
function selezionaFileUnisciPdf(inputEl) {
  const files = inputEl.files ? Array.from(inputEl.files) : [];
  files.forEach(elaboraFileUnisciPdf);
  inputEl.value = ''; // altrimenti riselezionare lo stesso file una seconda volta non fa scattare "change"
}
function rimuoviFileUnisciPdf(idx) { PDFU_FILE.splice(idx, 1); PDFU_RISULTATO = null; render(); }
function spostaFileUnisciPdf(idx, delta) {
  const nuovoIdx = idx + delta;
  if (nuovoIdx < 0 || nuovoIdx >= PDFU_FILE.length) return;
  const tmp = PDFU_FILE[idx]; PDFU_FILE[idx] = PDFU_FILE[nuovoIdx]; PDFU_FILE[nuovoIdx] = tmp;
  render();
}
function avviaUnionePdf() {
  if (PDFU_FILE.length < 2 || PDFU_IN_CORSO) return;
  PDFU_IN_CORSO = true; PDFU_ERRORE = null; PDFU_RISULTATO = null; render();
  fetch('/api/pdf-unisci', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: PDFU_FILE.map(f => ({ nomeFile: f.nome, contenutoBase64: f.base64 })) }),
  })
    .then(r => r.json())
    .then(esito => {
      if (esito && esito.ok) PDFU_RISULTATO = { nomeFile: esito.nomeFile, base64: esito.contenutoBase64 };
      else PDFU_ERRORE = (esito && esito.errore) || 'Unione non riuscita.';
    })
    .catch(() => { PDFU_ERRORE = 'Impossibile contattare il server locale.'; })
    .finally(() => { PDFU_IN_CORSO = false; render(); });
}
function scaricaRisultatoUnionePdf() {
  if (!PDFU_RISULTATO) return;
  salvaFileScaricabile(PDFU_RISULTATO.nomeFile, blobDaBase64(PDFU_RISULTATO.base64, 'application/pdf'))
    .then(ok => { if (ok) toast('PDF unito scaricato.'); })
    .catch(err => { console.error('Download PDF unito non riuscito', err); alert('Impossibile scaricare il file in questo browser.'); });
}
function salvaUnionePdfNellaCartella() {
  if (!PDFU_RISULTATO) return;
  salvaBase64NellaCartellaOriginaria(PDFU_RISULTATO.nomeFile, PDFU_RISULTATO.base64, scaricaRisultatoUnionePdf, 'PDF unito salvato.');
}

// --- Dividi PDF ---
let PDFD_FILE = null;      // {nome, base64, dimensione}
let PDFD_NUMPAGINE = null; // numero di pagine del PDF caricato, chiesto al server appena scelto
let PDFD_DA = 1;
let PDFD_A = 1;
let PDFD_RISULTATO = null;
let PDFD_ERRORE = null;
let PDFD_IN_CORSO = false;
function resetPdfDividi() { PDFD_FILE = null; PDFD_NUMPAGINE = null; PDFD_DA = 1; PDFD_A = 1; PDFD_RISULTATO = null; PDFD_ERRORE = null; PDFD_IN_CORSO = false; render(); }
async function elaboraFileDividiPdf(file) {
  if (!file) return;
  if ((file.name.split('.').pop() || '').toLowerCase() !== 'pdf') {
    PDFD_ERRORE = `"${file.name}" non è un PDF.`;
    render();
    return;
  }
  PDFD_RISULTATO = null; PDFD_ERRORE = null;
  try {
    const base64 = await leggiFilePdfComeBase64(file);
    PDFD_FILE = { nome: file.name, base64, dimensione: file.size };
    render();
    const esito = await fetch('/api/pdf-info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenutoBase64: base64 }),
    }).then(r => r.json());
    if (esito && esito.ok) {
      PDFD_NUMPAGINE = esito.numeroPagine;
      PDFD_DA = 1;
      PDFD_A = esito.numeroPagine;
    } else {
      PDFD_ERRORE = (esito && esito.errore) || 'Impossibile leggere il numero di pagine del PDF.';
      PDFD_FILE = null;
    }
    render();
  } catch (err) {
    PDFD_ERRORE = 'Errore di lettura del file.';
    PDFD_FILE = null;
    render();
  }
}
function selezionaFileDividiPdf(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  elaboraFileDividiPdf(file);
}
function avviaDivisionePdf() {
  if (!PDFD_FILE || PDFD_IN_CORSO) return;
  const da = Number(PDFD_DA), a = Number(PDFD_A);
  if (!da || !a || da < 1 || a < da) { PDFD_ERRORE = 'Intervallo di pagine non valido: controlla "da" e "a".'; render(); return; }
  PDFD_IN_CORSO = true; PDFD_ERRORE = null; PDFD_RISULTATO = null; render();
  fetch('/api/pdf-dividi', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeFile: PDFD_FILE.nome, contenutoBase64: PDFD_FILE.base64, da, a }),
  })
    .then(r => r.json())
    .then(esito => {
      if (esito && esito.ok) PDFD_RISULTATO = { nomeFile: esito.nomeFile, base64: esito.contenutoBase64 };
      else PDFD_ERRORE = (esito && esito.errore) || 'Divisione non riuscita.';
    })
    .catch(() => { PDFD_ERRORE = 'Impossibile contattare il server locale.'; })
    .finally(() => { PDFD_IN_CORSO = false; render(); });
}
function scaricaRisultatoDivisionePdf() {
  if (!PDFD_RISULTATO) return;
  salvaFileScaricabile(PDFD_RISULTATO.nomeFile, blobDaBase64(PDFD_RISULTATO.base64, 'application/pdf'))
    .then(ok => { if (ok) toast('Estratto PDF scaricato.'); })
    .catch(err => { console.error('Download estratto PDF non riuscito', err); alert('Impossibile scaricare il file in questo browser.'); });
}
function salvaDivisionePdfNellaCartella() {
  if (!PDFD_RISULTATO) return;
  salvaBase64NellaCartellaOriginaria(PDFD_RISULTATO.nomeFile, PDFD_RISULTATO.base64, scaricaRisultatoDivisionePdf, 'Estratto PDF salvato.');
}

function renderUnisciDividiPdf() {
  caricaStatoPdf();
  if (PDF_STATO_CACHE === null || PDF_STATO_CARICAMENTO) {
    return `<div class="card"><div class="section-title">Unisci e dividi PDF</div><div class="helptext">Verifica dello strumento in corso…</div></div>`;
  }
  if (PDF_STATO_CACHE === 'errore') {
    return `<div class="card"><div class="section-title">Unisci e dividi PDF</div><div class="helptext">⚠️ Non sono riuscito a verificare se lo strumento è disponibile su questo PC.</div></div>`;
  }
  if (!PDF_STATO_CACHE.disponibile) {
    return `<div class="card"><div class="section-title">Unisci e dividi PDF</div>
      <div class="helptext">Serve la libreria <b>pdf-lib</b> installata nella cartella del server (gratuita, nessun programma da scaricare: a differenza del convertitore sopra, qui basta un comando).</div>
      <div class="helptext" style="margin-top:10px;">1) Apri un terminale nella cartella di Prisma (dove sta server.js).<br>2) Scrivi <code>npm install pdf-lib</code> e premi Invio.<br>3) Riavvia il server locale (chiudi e riapri "Avvia Gestionale"): lo strumento si attiva da solo.</div>
    </div>`;
  }

  // --- card Unisci ---
  const cardUnisci = `<div class="card" style="max-width:640px;">
    <div class="section-title">Unisci PDF</div>
    <div class="helptext" style="margin-bottom:12px;">Carica due o più file .pdf: verranno uniti in un unico documento, nell'ordine mostrato sotto (usa le freccette per cambiarlo). Tutto in locale su questo PC.</div>
    <div class="dropzone-file" data-dropzone="unisci-pdf-file">
      <label class="btn" style="margin:0;display:inline-block;">📄 Scegli file PDF...<input type="file" accept=".pdf" multiple style="display:none;" data-action="pdfu-scegli-file"></label>
      <div class="helptext" style="margin-top:8px;">oppure trascina qui i file (anche più di uno insieme)</div>
    </div>
    ${PDFU_FILE.length ? `<div style="margin-top:12px;">
      ${PDFU_FILE.map((f, i) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-radius:8px;margin-bottom:6px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i+1}. ${escapeHtml(f.nome)}</div>
          <div class="helptext">${(f.dimensione/1024).toFixed(1)} KB</div>
        </div>
        <button type="button" class="icon-x" title="Sposta su" data-action="pdfu-sposta-su" data-idx="${i}" ${i===0?'disabled style="opacity:.3;"':''}>↑</button>
        <button type="button" class="icon-x" title="Sposta giù" data-action="pdfu-sposta-giu" data-idx="${i}" ${i===PDFU_FILE.length-1?'disabled style="opacity:.3;"':''}>↓</button>
        <button type="button" class="icon-x" title="Rimuovi" data-action="pdfu-rimuovi" data-idx="${i}">✕</button>
      </div>`).join('')}
    </div>
    <button class="btn primary" style="margin-top:6px;" data-action="pdfu-unisci" ${(PDFU_FILE.length < 2 || PDFU_IN_CORSO)?'disabled':''}>${PDFU_IN_CORSO ? 'Unione in corso…' : `Unisci ${PDFU_FILE.length} file in un PDF`}</button>
    <button class="btn ghost" style="margin-top:6px;margin-left:8px;" data-action="pdfu-reset">Annulla</button>
    ${PDFU_FILE.length === 1 ? `<div class="helptext" style="margin-top:6px;">Serve almeno un secondo file da unire.</div>` : ''}` : ''}
    ${PDFU_ERRORE ? `<div class="helptext" style="margin-top:10px;color:var(--rosso);">⚠️ ${escapeHtml(PDFU_ERRORE)}</div>` : ''}
    ${PDFU_RISULTATO ? `<div style="margin-top:14px;padding:12px;background:var(--verde-bg);border-radius:8px;">
      <div style="font-weight:600;font-size:13.5px;color:var(--verde);">✅ PDF unito: ${escapeHtml(PDFU_RISULTATO.nomeFile)}</div>
      <button class="btn primary small" style="margin-top:8px;" data-action="pdfu-scarica">⬇ Scarica</button>
    </div>` : ''}
  </div>`;

  // --- card Dividi ---
  const cardDividi = `<div class="card" style="max-width:640px;">
    <div class="section-title">Dividi PDF</div>
    <div class="helptext" style="margin-bottom:12px;">Carica un file .pdf ed estrai un intervallo di pagine in un nuovo documento (es. "da pagina 2 a 5"). Per estrarre più parti, ripeti l'operazione con intervalli diversi.</div>
    <div class="dropzone-file" data-dropzone="dividi-pdf-file">
      <label class="btn" style="margin:0;display:inline-block;">📄 Scegli file PDF...<input type="file" accept=".pdf" style="display:none;" data-action="pdfd-scegli-file"></label>
      <div class="helptext" style="margin-top:8px;">oppure trascina qui il file</div>
    </div>
    ${PDFD_FILE ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;">
      <div style="font-weight:600;font-size:13.5px;">${escapeHtml(PDFD_FILE.nome)}</div>
      <div class="helptext">${(PDFD_FILE.dimensione/1024).toFixed(1)} KB${PDFD_NUMPAGINE ? ' · ' + PDFD_NUMPAGINE + ' pagine' : ''}</div>
      ${PDFD_NUMPAGINE ? `<div style="display:flex;gap:10px;margin-top:8px;">
        <div class="field" style="max-width:110px;"><label>Da pagina</label><input type="number" min="1" max="${PDFD_NUMPAGINE}" value="${PDFD_DA}" data-action="pdfd-cambia-da"></div>
        <div class="field" style="max-width:110px;"><label>A pagina</label><input type="number" min="1" max="${PDFD_NUMPAGINE}" value="${PDFD_A}" data-action="pdfd-cambia-a"></div>
      </div>` : ''}
    </div>
    <button class="btn primary" style="margin-top:10px;" data-action="pdfd-dividi" ${(!PDFD_NUMPAGINE || PDFD_IN_CORSO)?'disabled':''}>${PDFD_IN_CORSO ? 'Divisione in corso…' : 'Estrai pagine'}</button>
    <button class="btn ghost" style="margin-top:10px;margin-left:8px;" data-action="pdfd-reset">Annulla</button>` : ''}
    ${PDFD_ERRORE ? `<div class="helptext" style="margin-top:10px;color:var(--rosso);">⚠️ ${escapeHtml(PDFD_ERRORE)}</div>` : ''}
    ${PDFD_RISULTATO ? `<div style="margin-top:14px;padding:12px;background:var(--verde-bg);border-radius:8px;">
      <div style="font-weight:600;font-size:13.5px;color:var(--verde);">✅ Estratto creato: ${escapeHtml(PDFD_RISULTATO.nomeFile)}</div>
      <button class="btn primary small" style="margin-top:8px;" data-action="pdfd-scarica">⬇ Scarica</button>
    </div>` : ''}
  </div>`;

  return cardUnisci + cardDividi;
}

/* -------------------- CREDENZIALI: vault password (task #134) --------------------
   Database libero di account/password: Entratel, Telemaco, home banking, software gestionali,
   portali vari - dello studio o di un cliente specifico. La password è cifrata sul disco quando
   gira il server locale (vedi cifraCredenziale/decifraCredenziale in server.js): qui in STATE e a
   video resta sempre in chiaro, mascherata di default e mostrabile/copiabile a richiesta. */
let CRED_FILTRO = { q: '', cliente: 'Tutti' };
// Chiave "credId::campoId" (non solo credId): ogni campo segreto di una credenziale — password,
// PIN, ambiente di sicurezza, quanti siano — si mostra/nasconde in modo indipendente dagli altri.
let CRED_VISIBILI = new Set();
const CATEGORIE_CREDENZIALI_SUGGERITE = ['Entratel', 'Telemaco', 'Home banking', 'INPS', 'INAIL', 'Camera di Commercio', 'PEC', 'Software gestionale', 'Altro'];

function generaPasswordCasuale() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let out = '';
  // Password vere: serve un generatore crittografico (Math.random e' prevedibile). Scarto dei valori >= soglia
  // per evitare il bias del modulo.
  const cr = (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) ? window.crypto : (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : null);
  const soglia = 256 - (256 % alfabeto.length);
  while (out.length < 16) {
    const b = new Uint8Array(32);
    if (cr) cr.getRandomValues(b); else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    for (const v of b) { if (v < soglia && out.length < 16) out += alfabeto[v % alfabeto.length]; }
  }
  return out;
}

function renderCredenziali() {
  const f = CRED_FILTRO;
  let lista = STATE.credenziali.slice().sort((a,b) => (a.titolo||'').localeCompare(b.titolo||''));
  if (f.cliente === '__studio__') lista = lista.filter(c => !c.clienteId);
  else if (f.cliente !== 'Tutti') lista = lista.filter(c => c.clienteId === f.cliente);
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    lista = lista.filter(c => {
      const etichetteCampi = (c.campi || []).map(campo => campo.etichetta).filter(Boolean);
      // Il VALORE dei campi segreti (password, PIN...) resta fuori dalla ricerca di proposito: non
      // deve bastare digitare qualcosa nella barra di ricerca per far comparire una password nei
      // risultati filtrati. Il valore dei campi NON segreti (es. nome utente) invece è cercabile.
      const valoriInChiaro = (c.campi || []).filter(campo => !campo.segreto).map(campo => campo.valore).filter(Boolean);
      return [c.titolo, c.categoria, c.note, c.clienteId ? nomeCliente(c.clienteId) : '', ...etichetteCampi, ...valoriInChiaro]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cerca</label><input type="text" placeholder="Titolo, categoria, utente, cliente..." value="${escapeHtml(f.q)}" data-action="cred-filtro-q"></div>
    <div class="field"><label>Cliente</label><select data-action="cred-filtro-cliente">
      <option value="Tutti" ${f.cliente==='Tutti'?'selected':''}>Tutti</option>
      <option value="__studio__" ${f.cliente==='__studio__'?'selected':''}>— Solo studio (nessun cliente) —</option>
      ${STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>`<option value="${c.id}" ${f.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuova-credenziale">+ Nuova credenziale</button></div>
  </div>`;

  const header = `<div class="section-title">Password <span class="cnt">${lista.length} credenziali</span></div>`;
  const avviso = `<div class="helptext" style="margin-bottom:10px;">${HTTP_SYNC_ATTIVO ? '🔒 Le password sono cifrate quando vengono salvate sul PC che fa da server.' : '⚠️ Server locale non attivo: le password restano solo nel localStorage di questo browser, non cifrate.'}</div>`;

  if (lista.length === 0) {
    return toolbar + avviso + `<div class="card"><div class="empty"><div class="big">Nessuna credenziale salvata</div>${STATE.credenziali.length===0 ? 'Aggiungi account Entratel, Telemaco, home banking o qualsiasi altro accesso utile.' : 'Prova a cambiare i filtri.'}</div></div>`;
  }

  const pag = paginaLista('credenziali', lista);
  // Task richiesto da Matteo: le credenziali possono avere N campi con nome libero (Entratel:
  // utente+password+PIN; Desktop telematico: ambiente di sicurezza+password...), non più solo
  // username/password fissi — ogni campo si mostra/copia/nasconde per conto suo (vedi
  // CRED_VISIBILI, chiave "credId::campoId"). Un campo segnato "segreto" resta sempre mascherato
  // finché non lo si mostra esplicitamente; uno non segreto (es. nome utente, ambiente di
  // sicurezza) è sempre visibile in chiaro, come prima.
  const righe = pag.pagina.map(c => {
    const campiHtml = (c.campi || []).map(campo => {
      const chiave = c.id + '::' + campo.id;
      const vis = CRED_VISIBILI.has(chiave);
      const valoreMostrato = campo.segreto ? (vis ? escapeHtml(campo.valore || '') : '••••••••') : (campo.valore ? escapeHtml(campo.valore) : '<span class="helptext">—</span>');
      return `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
        <span style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">${escapeHtml(campo.etichetta || 'Campo')}</span>
        <span style="font-family:monospace;font-size:13px;min-width:110px;text-align:right;">${valoreMostrato}</span>
        ${campo.segreto ? `<button class="btn small ghost" data-action="cred-mostra-campo" data-id="${c.id}" data-campo="${campo.id}" title="${vis?'Nascondi':'Mostra'}">${vis?'🙈':'👁'}</button>` : ''}
        ${campo.valore ? `<button class="btn small ghost" data-action="cred-copia-campo" data-id="${c.id}" data-campo="${campo.id}" title="Copia ${escapeHtml(campo.etichetta||'valore')}">Copia</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="client-row" style="cursor:default;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div class="name">${escapeHtml(c.titolo || '(senza titolo)')} ${c.categoria ? `<span class="badge">${escapeHtml(c.categoria)}</span>` : ''}</div>
        <div class="meta">${c.clienteId ? escapeHtml(nomeCliente(c.clienteId)) : 'Studio'}${c.url ? ` · <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">apri sito ↗</a>` : ''}</div>
        ${c.note ? `<div class="helptext" style="margin-top:2px;">${escapeHtml(c.note)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex:none;">
        ${campiHtml || '<span class="helptext">Nessun campo</span>'}
        <div style="display:flex;gap:6px;margin-top:2px;">
          <button class="btn small" data-action="modifica-credenziale" data-id="${c.id}">Modifica</button>
          <button class="btn small danger" data-action="elimina-credenziale" data-id="${c.id}">Elimina</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return toolbar + avviso + header + righe + controlliPaginazione(pag);
}

/* Editor dei campi di una credenziale (task richiesto da Matteo: Entratel ha nome utente +
   password + PIN, il Desktop telematico ha ambiente di sicurezza + password — servono N campi
   con un nome scelto liberamente, non solo i due fissi di prima). Stesso pattern di
   F24_RIGHE_MODAL/righeF24: un array di lavoro in una variabile di modulo, sostituito quando si
   apre il modale e riletto solo al salvataggio, con righe che si aggiungono/rimuovono senza
   toccare il resto del form. */
let CRED_CAMPI_MODAL = [];
function nuovoCampoCredenzialeModal(segreto) { return { id: uid('campo'), etichetta: '', valore: '', segreto: !!segreto }; }
function rigaCampoCredenzialeHtml(campo, idx) {
  const rimuovi = CRED_CAMPI_MODAL.length > 1
    ? `<button type="button" class="icon-x" data-action="cred-campo-rimuovi" data-idx="${idx}" title="Rimuovi campo">✕</button>`
    : `<span style="visibility:hidden;">✕</span>`;
  return `<div class="riga-cred-campo" data-idx="${idx}">
    <input class="col-etichetta" placeholder="es. Nome utente, PIN, Ambiente di sicurezza..." value="${escapeHtml(campo.etichetta || '')}" data-action="cred-campo-input" data-idx="${idx}" data-campo="etichetta">
    <input class="col-valore" type="text" placeholder="Valore" value="${escapeHtml(campo.valore || '')}" data-action="cred-campo-input" data-idx="${idx}" data-campo="valore">
    <label class="col-segreto checkline" title="Se spuntato, il valore resta mascherato finché non lo mostri esplicitamente (come una password)">
      <input type="checkbox" ${campo.segreto?'checked':''} data-action="cred-campo-toggle-segreto" data-idx="${idx}"> Segreto
    </label>
    ${campo.segreto ? `<button type="button" class="btn small ghost" data-action="cred-campo-genera" data-idx="${idx}" title="Genera valore casuale sicuro">🎲</button>` : '<span style="width:30px;"></span>'}
    ${rimuovi}
  </div>`;
}
function renderCampiCredenzialeModal() {
  const cont = h('credCampiContainer');
  if (!cont) return;
  cont.innerHTML = CRED_CAMPI_MODAL.map((campo, idx) => rigaCampoCredenzialeHtml(campo, idx)).join('');
}
function modalCredenziale(id) {
  const editing = id ? STATE.credenziali.find(c => c.id === id) : null;
  CRED_CAMPI_MODAL = editing && Array.isArray(editing.campi) && editing.campi.length
    ? editing.campi.map(campo => Object.assign({}, campo))
    : [nuovoCampoCredenzialeModal(false), nuovoCampoCredenzialeModal(true)];
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica credenziale':'Nuova credenziale'}</h2><div class="modal-sub">Un account/accesso: dello studio, oppure legato a un cliente specifico. Aggiungi tutti i campi che servono, con il nome che preferisci (es. Entratel: utente, password, PIN).</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formCredenziale" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Titolo *</label><input id="credTitolo" value="${editing?escapeHtml(editing.titolo||''):''}" placeholder="es. Entratel - Studio, Home banking Rossi Srl..."></div>
          <div class="field"><label>Categoria</label><input id="credCategoria" list="credCategorieList" value="${editing?escapeHtml(editing.categoria||''):''}" placeholder="es. Entratel">
            <datalist id="credCategorieList">${CATEGORIE_CREDENZIALI_SUGGERITE.map(c=>`<option value="${c}">`).join('')}</datalist>
          </div>
          <div class="field"><label>Cliente (opzionale)</label><select id="credCliente">
            <option value="">— Nessuno (credenziale studio) —</option>
            ${STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>`<option value="${c.id}" ${editing&&editing.clienteId===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
          </select></div>
          <div class="field full" style="grid-column:1/-1;">
            <label>Campi (nome utente, password, PIN, ambiente di sicurezza...) *</label>
            <div class="cred-campi-header">
              <span class="col-etichetta">Nome campo</span>
              <span class="col-valore">Valore</span>
              <span class="col-segreto">Segreto</span>
              <span style="width:30px;"></span>
              <span style="width:26px;"></span>
            </div>
            <div id="credCampiContainer"></div>
            <button type="button" class="btn small" style="margin-top:6px;" data-action="cred-campo-aggiungi">+ Aggiungi campo</button>
          </div>
          <div class="field full" style="grid-column:1/-1;"><label>Link al sito (opzionale)</label><input id="credUrl" value="${editing?escapeHtml(editing.url||''):''}" placeholder="https://..."></div>
          <div class="field full" style="grid-column:1/-1;"><label>Note</label><textarea id="credNote" rows="2">${editing?escapeHtml(editing.note||''):''}</textarea></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-credenziale" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Salva'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  renderCampiCredenzialeModal();
}

/* Impostazioni raggruppate per argomento. "master" = solo utenze maestro; "dev" = solo con la modalità
   sviluppatore attiva su questo PC (vedi modalitaSviluppatore). */
const IMP_SEZIONI = [
  { id: 'studio', label: 'Studio' },
  { id: 'catalogo', label: 'Scadenzario e catalogo', master: true },
  { id: 'proroghe', label: 'Proroghe', tab: 'proroghe' }, // spostata qui dal menu (richiesta Matteo): serve di rado
  { id: 'dati', label: 'Dati e backup', master: true },
  { id: 'team', label: 'Squadra e accessi', master: true },
  { id: 'moduli', label: 'Moduli', master: true },
  { id: 'ia', label: 'Intelligenza artificiale', master: true },
  { id: 'assistenza', label: 'Aggiornamenti e assistenza', master: true },
  { id: 'gestione', label: '🔒 Maestro', master: true },
  { id: 'sviluppatore', label: '🛠 Sviluppatore', dev: true },
];
const GUIDE_STUDIO = [
  { id: 'guida-ia-di-studio', titolo: "Guida per l'IA di studio", descrizione: "Allegala alla tua IA (Claude o altra) e scrivile «Aiutami a installare e configurare Prisma»: contiene installazione, moduli, utenti, portale clienti e collegamento MCP." },
];
function renderImpostazioniGuide() {
  return `<div class="card">
    <div class="section-title">Guide</div>
    <div class="helptext" style="margin-bottom:12px;">Documenti di supporto: leggili qui o scaricali per allegarli alla tua IA.</div>
    ${GUIDE_STUDIO.map(g => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border);">
      <div style="flex:1;min-width:220px;"><strong>${escapeHtml(g.titolo)}</strong><div class="helptext">${escapeHtml(g.descrizione)}</div></div>
      <div style="display:flex;gap:8px;">
        <button class="btn small" data-action="guida-leggi" data-id="${g.id}">Leggi</button>
        <a class="btn small primary" href="/guide/${g.id}.md?scarica=1" download>⤓ Scarica</a>
      </div>
    </div>`).join('')}
  </div>`;
}
async function apriGuida(id) {
  const g = GUIDE_STUDIO.find(x => x.id === id);
  if (!g) return;
  let testo = '';
  try { const r = await fetch('/guide/' + id + '.md'); testo = r.ok ? await r.text() : 'Guida non disponibile.'; } catch (e) { testo = 'Guida non disponibile.'; }
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:820px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(g.titolo)}</h2></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:13px;line-height:1.55;max-height:65vh;overflow:auto;margin-top:10px;">${escapeHtml(testo)}</pre>
      <div class="modal-actions"><a class="btn" href="/guide/${g.id}.md?scarica=1" download>⤓ Scarica</a><button class="btn primary" data-action="chiudi-modal">Chiudi</button></div>
    </div>
  </div>`;
}

function impTabBarHtml() {
  return `<div class="imp-tabbar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:10px;">
    ${impSezioniVisibili().map(s => `<button class="btn small${s.id === IMP_SEZIONE ? ' primary' : ''}" data-action="imp-sezione" data-sezione="${s.id}">${escapeHtml(s.label)}</button>`).join('')}
  </div>`;
}

function renderImpostazioniStudio() {
  return `
  <div class="card">
    <div class="section-title">Studio</div>
    <div class="helptext" style="margin-bottom:10px;">Usati anche come segnaposto automatici {{studio.*}} nei modelli documento (Preventivi, Mandati, Antiriciclaggio).</div>
    <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:640px;">
      <div class="field"><label>Nome studio</label><input type="text" id="impStudioNome" value="${escapeHtml(STATE.meta.studioNome)}"></div>
      <div class="field"><label>Iscrizione albo</label><input type="text" id="impStudioIscrizione" value="${escapeHtml(STATE.meta.iscrizione)}" placeholder="es. Iscritto ODCEC Vicenza n. B53"></div>
      <div class="field"><label>Codice fiscale</label><input type="text" id="impStudioCf" value="${escapeHtml(STATE.meta.cfStudio)}"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Indirizzo</label><input type="text" id="impStudioIndirizzo" value="${escapeHtml(STATE.meta.indirizzoStudio)}" placeholder="es. Strada di Casale, 98 – 36100 Vicenza"></div>
      <div class="field"><label>Città (per luogo/data)</label><input type="text" id="impStudioCitta" value="${escapeHtml(STATE.meta.citta)}"></div>
      <div class="field"><label>PEC</label><input type="text" id="impStudioPec" value="${escapeHtml(STATE.meta.pecStudio || '')}"></div>
      <div class="field"><label>Email</label><input type="text" id="impStudioEmail" value="${escapeHtml(STATE.meta.emailStudio || '')}"></div>
      <div class="field"><label>Telefono</label><input type="text" id="impStudioTelefono" value="${escapeHtml(STATE.meta.telefonoStudio || '')}"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Polizza assicurativa RC professionale</label><input type="text" id="impStudioPolizza" value="${escapeHtml(STATE.meta.polizzaRc || '')}" placeholder="es. Compagnia X, polizza n. 123456, massimale € 1.000.000"></div>
    </div>
    <button class="btn primary small" style="margin-top:10px;" data-action="salva-studio-nome">Salva</button>
  </div>
  ${cardLogoStudio()}
  <div class="helptext" style="text-align:center;margin-top:18px;user-select:none;cursor:default;" data-action="imp-versione-tap">Prisma · software per studi professionali</div>`;
}

// Task #161 (richiesta Matteo: "possibilità di inserire il logo dello studio oppure determinare
// dove metterlo nella pagina") — logo salvato come base64 dentro STATE.meta.logoStudio (stesso
// pattern FileReader.readAsDataURL già usato per gli allegati, es. selezionaFileConversione) così
// resta dentro il normale backup/ripristino JSON senza bisogno di gestione file separata.
function cardLogoStudio() {
  const logo = STATE.meta.logoStudio || '';
  const posizione = STATE.meta.logoPosizione || 'sinistra';
  return `<div class="card">
    <div class="section-title">Logo e piè di pagina dei documenti</div>
    <div class="helptext" style="margin-bottom:10px;">Il logo compare in alto in preventivi, mandati e documenti stampati o esportati, e nel riepilogo appuntamento. Consigliata un'immagine PNG/JPG non troppo grande.</div>
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
      <div>
        ${logo ? `<img src="${logo}" alt="Logo studio" style="max-width:160px;max-height:90px;border:1px solid var(--border);border-radius:6px;padding:4px;background:#fff;display:block;margin-bottom:8px;">` : `<div class="helptext" style="margin-bottom:8px;">Nessun logo caricato.</div>`}
        <label class="btn small" style="margin:0;">⬆ ${logo ? 'Sostituisci logo' : 'Carica logo'}<input type="file" accept="image/*" style="display:none;" data-action="carica-logo-studio"></label>
        ${logo ? `<button class="btn small ghost" style="margin-left:6px;" data-action="rimuovi-logo-studio">Rimuovi</button>` : ''}
      </div>
      <div class="field grow" style="min-width:260px;">
        <label>Piè di pagina dei documenti in stile lettera (preventivi)</label>
        <textarea rows="3" data-action="meta-pie-pagina" placeholder="Una riga per riga: nome studio, indirizzo | telefono | email, sito">${escapeHtml(STATE.meta.piePagina || '')}</textarea>
      </div>
      <div class="field" style="min-width:220px;">
        <label>Posizione nel foglio stampabile</label>
        <select data-action="cambia-posizione-logo">
          <option value="sinistra" ${posizione==='sinistra'?'selected':''}>In alto a sinistra</option>
          <option value="centro" ${posizione==='centro'?'selected':''}>In alto al centro</option>
          <option value="destra" ${posizione==='destra'?'selected':''}>In alto a destra</option>
        </select>
      </div>
    </div>
  </div>`;
}

function cardPasswordResponsabili() {
  if (!HTTP_SYNC_ATTIVO) return '';
  caricaResponsabiliConPassword();
  if (RESPONSABILI_CON_PASSWORD_CACHE === null) {
    return `<div class="card"><div class="section-title">Accesso individuale ai referenti</div><div class="helptext">Caricamento…</div></div>`;
  }
  const riga = (nome) => {
    const protetto = responsabileHaPassword(nome);
    const valore = Object.prototype.hasOwnProperty.call(RESPONSABILE_PASSWORD_DRAFT, nome) ? RESPONSABILE_PASSWORD_DRAFT[nome] : '';
    return `<div style="border-top:1px solid var(--border);padding:10px 0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <div style="font-weight:600;font-size:13px;flex:1;">${protetto ? '🔒' : '🔓'} ${escapeHtml(nome)}</div>
        <div class="helptext" style="margin:0;">${protetto ? 'Protetto: password richiesta, sessione esclusiva (due PC non possono usare questo nome insieme).' : 'Nessuna password: chiunque può scegliere questo nome, con solo un avviso se già in uso altrove.'}</div>
      </div>
      <div style="display:flex;gap:8px;max-width:420px;flex-wrap:wrap;">
        <input type="text" id="respPassword_${escapeHtml(nome)}" value="${escapeHtml(valore)}" placeholder="${protetto ? 'Nuova password (lascia vuoto per non cambiarla)' : 'Imposta una password'}" data-action="responsabile-password-campo" data-nome="${escapeHtml(nome)}" style="flex:1;min-width:180px;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:8px;">
        <button class="btn small" data-action="responsabile-password-salva" data-nome="${escapeHtml(nome)}">Salva</button>
        ${protetto ? `<button class="btn small ghost" data-action="responsabile-password-rimuovi" data-nome="${escapeHtml(nome)}">Rimuovi</button>` : ''}
      </div>
    </div>`;
  };
  return `<div class="card">
    <div class="section-title">Accesso individuale ai referenti</div>
    <div class="helptext" style="margin-bottom:4px;">Opzionale, per referente: senza password chiunque può scegliere quel nome nel selettore "Chi sta usando questo PC?" (comportamento di sempre). Con una password impostata qui, quel nome richiede la password per essere scelto e la sessione diventa esclusiva davvero: un secondo PC non può usare lo stesso nome finché il primo è collegato.</div>
    ${STATE.meta.responsabili.map(riga).join('')}
  </div>`;
}

// Task #156: riga per responsabile con ruolo + (se limitato) checklist delle sezioni consentite,
// raggruppate come in NAV così la lista coincide sempre col menu vero, senza un secondo elenco da
// tenere sincronizzato a mano.
function rigaResponsabileConRuolo(r, i) {
  const ruolo = ruoloOperatore(r);
  const consentiti = (STATE.meta.tabConsentiti && STATE.meta.tabConsentiti[r]) || [];
  const pannelloTab = ruolo === 'limitato' ? `<div style="margin:8px 0 2px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2,#f7f8fa);">
      <div class="helptext" style="margin-bottom:6px;">Sezioni visibili a ${escapeHtml(r)} — Dashboard è sempre inclusa. Questo nasconde le voci di menu non spuntate: non è un vero controllo di accesso ai dati (chi condivide PC o porta di rete vede comunque lo stesso database, vedi Accesso esterno).</div>
      ${NAV.map(g => `<div style="margin-bottom:8px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;margin-bottom:3px;">${escapeHtml(g.group)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 14px;">
          ${g.items.map(it => `<label class="checkline" style="white-space:nowrap;font-size:12.5px;">
            <input type="checkbox" data-action="toggle-tab-consentito" data-resp="${escapeHtml(r)}" data-tab="${it.id}" ${it.id==='dashboard'||consentiti.includes(it.id)?'checked':''} ${it.id==='dashboard'?'disabled':''}> ${escapeHtml(it.label)}
          </label>`).join('')}
        </div>
      </div>`).join('')}
    </div>` : '';
  return `<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
      <input type="text" value="${escapeHtml(r)}" data-action="edit-responsabile" data-idx="${i}" style="flex:1;min-width:110px;border:1px solid var(--border);border-radius:6px;padding:6px 9px;">
      <label class="checkline" style="white-space:nowrap;" title="Può ricevere appuntamenti dalla segreteria">
        <input type="checkbox" data-action="toggle-consulente" data-idx="${i}" ${(STATE.meta.consulenti||[]).includes(r)?'checked':''}> Consulente
      </label>
      <select data-action="cambia-ruolo-responsabile" data-resp="${escapeHtml(r)}" title="Ruolo di accesso" style="border:1px solid var(--border);border-radius:6px;padding:5px 7px;">
        <option value="master" ${ruolo==='master'?'selected':''}>Maestro — gestisce moduli, utenze, dati e licenza</option>
        <option value="admin" ${ruolo==='admin'?'selected':''}>Admin — accesso completo</option>
        <option value="limitato" ${ruolo==='limitato'?'selected':''}>Limitato — solo alcune sezioni</option>
      </select>
      <button class="icon-x" data-action="elimina-responsabile" data-idx="${i}" title="Rimuovi responsabile">✕</button>
    </div>
    ${pannelloTab}
  </div>`;
}
function renderImpostazioniModuli() {
  const righe = MODULI.map(m => `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-weight:400;cursor:pointer;">
      <input type="checkbox" style="margin-top:3px;" data-action="toggle-modulo" data-modulo="${m.id}" ${moduloAttivo(m.id)?'checked':''}>
      <span><strong>${escapeHtml(m.label)}</strong><br><span class="helptext">${escapeHtml(m.desc)}</span></span>
    </label>`).join('');
  return `<div class="card">
    <div class="section-title">Moduli attivi nello studio</div>
    <div class="helptext" style="margin-bottom:6px;">Tieni accesi solo i moduli che usate davvero: quelli spenti spariscono dal menu e dalla home per tutti, così Prisma resta semplice. I dati già inseriti non si perdono: riaccendendo un modulo ritrovi tutto com'era. Dashboard, clienti, scadenze, adempimenti annuali, documenti e impostazioni sono sempre attivi.</div>
    ${righe}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="btn small" data-action="moduli-tutti" data-val="1">Attiva tutti</button>
      <button class="btn small" data-action="moduli-tutti" data-val="0">Disattiva tutti</button>
      <span class="helptext">(Dashboard, clienti, scadenze, adempimenti, documenti e impostazioni restano sempre attivi.)</span>
    </div>
    <div style="margin-top:14px;"><button class="btn primary" data-action="conferma-moduli">${STATE.meta.moduliConfermati ? 'Ok, torna a Oggi' : 'Conferma la scelta'}</button></div>
  </div>`;
}

function renderImpostazioniTeam() {
  return `
  <div class="card">
    <div class="section-title">Responsabili dello studio</div>
    <div class="helptext" style="margin-bottom:10px;">Usati nei menu a tendina "responsabile" per assegnare scadenze e adempimenti. La spunta "Consulente" indica chi riceve appuntamenti dalla segreteria (vedi Calendario &gt; Prenota un appuntamento). Il ruolo "Limitato" nasconde in interfaccia le sezioni non spuntate.</div>
    ${STATE.meta.responsabili.map(rigaResponsabileConRuolo).join('')}
    <button class="btn small" style="margin-top:10px;" data-action="aggiungi-responsabile">+ Aggiungi responsabile</button>
  </div>
  ${cardPasswordResponsabili()}
  ${cardAccessoRete()}
  ${cardAccessoEsterno()}`;
}

function renderImpostazioniDati() {
  const nClienti = STATE.clienti.length;
  const dimensione = new Blob([JSON.stringify(STATE)]).size;
  return `
  <div class="card">
    <div class="section-title">Backup e ripristino</div>
    <div class="helptext" style="margin-bottom:12px;">Tutti i dati sono sul server dello studio (dati-studio.json) con copie automatiche alle 8/12/16 e a ogni avvio (ultimi 30 giorni, vedi sotto). Fai comunque ogni tanto un export e conservane una copia su un altro disco/cloud.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn primary" data-action="esporta-backup">⬇ Esporta backup JSON</button>
      <label class="btn" style="margin:0;">⬆ Importa backup JSON<input type="file" accept="application/json" id="importFile" style="display:none;" data-action="importa-backup"></label>
    </div>
    <div class="helptext" style="margin-top:10px;">Stato attuale: ${nClienti} clienti, ${STATE.ritenuteRighe.length} righe ritenute, ~${(dimensione/1024).toFixed(1)} KB.</div>
  </div>

  <div class="card">
    <div class="section-title">Gestione annualità</div>
    <div class="helptext" style="margin-bottom:14px;">Il selettore anno in alto mostra sempre l'anno corrente ± 1. Qui puoi aggiungere un'annualità futura in anticipo (es. per predisporre scadenze) e, per un'annualità passata, scaricarne un backup dedicato e poi eliminarne i dati da Prisma per alleggerire l'app.</div>

    <div style="margin-bottom:18px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Annualità aggiunte manualmente</div>
      ${(STATE.meta.anniExtra || []).length ? (STATE.meta.anniExtra || []).slice().sort((x,y)=>x-y).map(a => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-weight:700;min-width:50px;">${a}</span><button class="icon-x" data-action="rimuovi-anno-gestito" data-anno="${a}" title="Rimuovi ${a} dall'elenco">✕</button></div>`).join('') : '<div class="helptext" style="margin-bottom:10px;">Nessuna aggiunta oltre alla finestra automatica.</div>'}
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>Nuovo anno</label><input type="number" id="impNuovoAnno" placeholder="es. 2028" style="width:120px;"></div>
        <button class="btn small" data-action="aggiungi-anno-gestito">+ Aggiungi</button>
      </div>
    </div>

    <div>
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Backup e pulizia di un'annualità</div>
      <div class="helptext" style="margin-bottom:10px;">Riguarda solo i dati datati a quell'anno: scadenze, F24, comunicazioni, documenti, task con scadenza, preventivi, bilanci, contabilità. Anagrafica clienti, fascicoli antiriciclaggio, catalogo attività, modelli documento e credenziali restano intatti. Esporta sempre il backup prima di eliminare, e verifica i tuoi obblighi di conservazione documentale. Eliminando, l'annualità si disattiva anche dal selettore anno in alto (se l'avevi aggiunta manualmente).</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="margin:0;"><label>Annualità</label><select id="impAnnoTarget">${anniConDatiRilevati().map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
        <button class="btn small" data-action="esporta-dati-anno">⬇ Esporta dati di quest'anno</button>
        <button class="btn small" style="border-color:var(--rosso);color:var(--rosso);" data-action="elimina-dati-anno">🗑 Elimina dati di quest'anno</button>
      </div>
      <div class="helptext" style="margin:10px 0 6px;">Per rivedere un'annualità già eliminata: reimporta il file di backup scaricato con "Esporta dati di quest'anno" - i dati tornano selezionabili, senza toccare nient'altro. Gli eventuali file allegati (documenti/documenti contabili) non sono recuperabili, solo i relativi dati.</div>
      <label class="btn small" style="margin:0;">⬆ Reimporta dati di un'annualità<input type="file" accept="application/json" id="importAnnoFile" style="display:none;" data-action="importa-dati-anno"></label>
    </div>
  </div>

  ${cardBackupAutomatici()}
  ${cardBackupEsterno()}`;
}

/* Cessazione di un cliente (task #233): data, motivo, tipo di rapporto restano sul record per le statistiche
   del titolare. Il cliente cessato smette da solo di generare scadenze (clienteAttivo). */
/* Cessazione (anche a metà anno). dati: { data, motivo, nota, ceduti }.
   ceduti = id degli adempimenti annuali che passano al nuovo commercialista (non più in carico allo studio);
   se omesso, tutti gli adempimenti annuali non ancora completati dell'anno della cessazione sono ceduti.
   Gli altri restano allo studio (con le scadenze periodiche fino alla data di cessazione). */
function cessaCliente(id, dati) {
  const c = clienteById(id); if (!c) throw new Error('Cliente non trovato: ' + id);
  c.stato = 'cessato';
  c.dataCessazione = (dati && dati.data) || oggiISO();
  c.motivoCessazione = (dati && dati.motivo) || '';
  if (dati && dati.nota) c.noteCessazione = dati.nota;
  const annoC = Number(c.dataCessazione.slice(0, 4));
  const annuali = generaAdempimentiAnnuali([c], annoC, STATE.annualiOverrides);
  const ceduti = (dati && Array.isArray(dati.ceduti)) ? dati.ceduti : annuali.filter(a => !a.completato).map(a => a.id);
  ceduti.forEach(aid => { STATE.annualiOverrides[aid] = Object.assign({}, STATE.annualiOverrides[aid] || {}, { ceduto: true, dataCessione: c.dataCessazione }); });
  salvaStato(); return c;
}
/* Adempimenti annuali ceduti al nuovo commercialista, per la scheda cliente. */
function annualiCedutiCliente(clienteId) {
  return Object.keys(STATE.annualiOverrides || {}).filter(k => STATE.annualiOverrides[k].ceduto && k.split('|')[1] === clienteId)
    .map(k => { const [anno, , chiave] = k.split('|'); const def = catalogoAnnualeTutti().find(a => a.chiave === chiave); return { id: k, anno, nome: def ? def.nome : chiave }; });
}
function riattivaCliente(id) {
  const c = clienteById(id); if (!c) throw new Error('Cliente non trovato: ' + id);
  if (c.dataCessazione) { c.storicoCessazioni = (c.storicoCessazioni || []).concat([{ data: c.dataCessazione, motivo: c.motivoCessazione || '' }]); }
  annualiCedutiCliente(id).forEach(x => { const o = STATE.annualiOverrides[x.id]; delete o.ceduto; delete o.dataCessione; });
  c.stato = 'attivo'; c.dataCessazione = ''; c.motivoCessazione = '';
  salvaStato(); return c;
}
function modalCessazioneCliente(id) {
  const c = clienteById(id); if (!c) return;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>Cessa cliente</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)}</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
      <div class="grid2">
        <div class="field"><label>Data cessazione</label><input id="cessData" type="date" value="${oggiISO()}"></div>
        <div class="field full" style="grid-column:1/-1;"><label>Motivo</label><select id="cessMotivo" style="width:100%;">${MOTIVI_CESSAZIONE.map(m => `<option>${escapeHtml(m)}</option>`).join('')}</select></div>
        <div class="field full" style="grid-column:1/-1;"><label>Note</label><input id="cessNota" placeholder="facoltative"></div>
      </div>
      ${(() => {
        const ann = generaAdempimentiAnnuali([c], STATE.annoCorrente, STATE.annualiOverrides).filter(a => !a.completato);
        return ann.length ? `<div style="margin-top:8px;"><div style="font-weight:600;font-size:12.5px;">Adempimenti ${STATE.annoCorrente} ancora aperti</div>
          <div class="helptext" style="margin-bottom:4px;">Spunta quelli che passano al nuovo commercialista; lasciati senza spunta li completa lo studio.</div>
          ${ann.map(a => `<label class="checkline" style="display:block;"><input type="checkbox" class="cess-ceduto" data-id="${a.id}" checked> ${escapeHtml(a.tipoNome)} <span class="helptext">(${a.percentuale}% fatto)</span></label>`).join('')}</div>` : '';
      })()}
      <label class="checkline" style="display:block;margin-top:8px;"><input type="checkbox" id="cessRinuncia" checked> Crea un task per inviare la comunicazione scritta di cessazione/rinuncia (modello "Lettera di rinuncia" in Modelli documenti)</label>
      <div class="helptext" style="margin-top:8px;">Le scadenze periodiche fino alla data di cessazione restano in carico allo studio; dopo non genera più nulla e non compare negli elenchi di lavoro. Dati e documenti restano e puoi riattivarlo.</div>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn danger" data-action="cessa-cliente-conferma" data-id="${c.id}">Cessa cliente</button></div>
    </div></div>`;
}
/* Impostazioni > Catalogo: cosa cambia per i clienti con contabilità tenuta da terzi (task #235). */
function renderCardContabTerzi() {
  const cfg = configContabTerzi();
  const periodici = (STATE.catalogoPeriodico || DEFAULT_CATALOGO_PERIODICO).filter(d => d.attivo !== false);
  const esclusi = new Set(cfg.periodiciEsclusi);
  const annuali = catalogoAnnualeTutti().filter(d => d.attivo !== false);
  const righeAnn = annuali.map(def => {
    const personalizzate = Object.prototype.hasOwnProperty.call(cfg.sotto, def.chiave);
    const aperta = TERZI_FASI_EXPANDED.has(def.chiave);
    return `<div class="cat-tipo">
      <div class="cat-head" style="cursor:pointer;" data-action="fasi-terzi-expand" data-tipo="${escapeHtml(def.chiave)}">
        <span style="flex:1;font-weight:700;font-size:13.5px;">${escapeHtml(def.nome)}</span>
        ${personalizzate ? `<span class="badge info">fasi personalizzate (${cfg.sotto[def.chiave].length})</span>` : `<span class="helptext">fasi standard (${def.sotto.length})</span>`}
        <span style="padding:2px 6px;">${aperta ? '▾' : '▸'}</span>
      </div>
      ${aperta ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        ${personalizzate
          ? `${htmlEditorFasi('terzi', def.chiave, cfg.sotto[def.chiave])}
             <div style="margin-top:10px;"><button class="btn small" data-action="fasi-terzi-standard" data-tipo="${escapeHtml(def.chiave)}">Torna alle fasi standard</button></div>`
          : `<div class="helptext" style="margin-bottom:8px;">I clienti con contabilità da terzi seguono le stesse fasi standard di tutti gli altri:</div>
             <ol style="margin:0 0 10px 18px;padding:0;font-size:13px;">${def.sotto.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ol>
             <button class="btn small primary" data-action="fasi-terzi-personalizza" data-tipo="${escapeHtml(def.chiave)}">Personalizza per i clienti da terzi</button>`}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="section-title">Clienti con contabilità tenuta da terzi</div>
    <div class="helptext" style="margin-bottom:10px;">Per questi clienti (campo «Tenuta contabilità» nella scheda) lo studio non registra la contabilità: alcune scadenze periodiche non vanno gestite e gli adempimenti annuali hanno fasi diverse (si parte dalla richiesta dei dati al terzo, non dalla chiusura contabile). <b>Ho impostato dei valori di partenza ragionevoli: controllali e correggili in base a come lavorate davvero.</b></div>
    <div style="font-weight:600;margin:6px 0;">Scadenze periodiche che lo studio gestisce comunque</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 14px;margin-bottom:12px;">
      ${periodici.map(d => `<label class="checkline"><input type="checkbox" data-action="contab-terzi-periodico" data-id="${d.id}" ${esclusi.has(d.id) ? '' : 'checked'}> ${escapeHtml(d.nome)}</label>`).join('')}
    </div>
    <div style="font-weight:600;margin:10px 0 4px;">Fasi degli adempimenti annuali</div>
    <div class="helptext" style="margin-bottom:8px;">Tutti gli adempimenti annuali del catalogo. Di partenza i clienti con contabilità da terzi usano le fasi standard; per quelli che lavorano in modo diverso (es. non c'è la chiusura contabile) puoi creare un elenco di fasi dedicato.</div>
    ${righeAnn}
    <button class="btn small" data-action="contab-terzi-ripristina">Ripristina valori di partenza</button>
  </div>`;
}
function renderImpostazioniCatalogo() {
  return `
  ${renderCatalogoPeriodico()}
  ${renderCatalogoAnnuale()}
  ${renderCardContabTerzi()}
  ${renderRegoleImportiStatutari()}
  ${renderCatalogoAttivitaStudio()}`;
}

/* Intelligenza artificiale (master): collegamento di Claude/ChatGPT/Gemini, registro e conferma delle azioni, guida. */
function renderImpostazioniIA() {
  return `
  <div class="card">
    <div class="section-title">Collega altre IA (ChatGPT, Gemini e altre)</div>
    <div class="helptext" style="margin-bottom:12px;">Oltre a Claude, Prisma si collega a ChatGPT, Gemini e a qualunque assistente che supporti il protocollo MCP. Le azioni passano dallo stesso registro e dalla stessa conferma di Claude.</div>
    <button class="btn primary" data-action="ia-collegamento">🔗 Mostra i dati di collegamento</button>
  </div>

  <div class="card">
    <div class="section-title">Azioni dell'IA (registro e conferma)</div>
    <div class="helptext" style="margin-bottom:10px;">Tutto ciò che Claude fa in Prisma tramite MCP viene registrato qui. Se attivi la conferma, ogni azione compare in una finestra e parte solo dopo il tuo OK.</div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:12px;"><input type="checkbox" data-action="toggle-mcp-conferma" ${STATE.meta.mcpChiediConferma ? 'checked' : ''}> Chiedi la mia conferma prima di ogni azione dell'IA</label>
    ${(STATE.auditMcp || []).length ? `<div class="helptext" style="margin-bottom:6px;">Ultime azioni in alto: scorri nel riquadro per vedere quelle passate (${(STATE.auditMcp || []).length} registrate).</div>
    <div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;"><table class="compact" style="margin:0;"><thead><tr><th style="position:sticky;top:0;background:var(--card-bg);z-index:1;">Quando</th><th style="position:sticky;top:0;background:var(--card-bg);z-index:1;">Azione</th><th style="position:sticky;top:0;background:var(--card-bg);z-index:1;">Esito</th><th style="position:sticky;top:0;background:var(--card-bg);z-index:1;">Dettagli</th></tr></thead><tbody>
      ${(STATE.auditMcp || []).slice().reverse().map(a => `<tr>
        <td style="white-space:nowrap;">${fmtDataOra(a.data)}</td>
        <td>${escapeHtml(etichettaAzioneMCP(a.azione))}</td>
        <td>${a.esito === 'eseguita' ? '<span class="badge attivo">Eseguita</span>' : (a.esito === 'rifiutata' ? '<span class="badge">Rifiutata</span>' : '<span class="badge stato-errore">Fallita</span>')}</td>
        <td class="helptext" style="max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(a.parametri || '')}">${escapeHtml(a.errore || a.parametri || '')}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="helptext">Nessuna azione registrata finora.</div>'}
  </div>

  ${renderImpostazioniGuide()}`;
}

/* Aggiornamenti e assistenza (master): versione, log, riavvio del server, assistenza remota. */
function renderImpostazioniAssistenza() {
  return cardAggiornamentiELog();
}

/* Sviluppatore: strumenti che servono solo a chi sviluppa Prisma (visibile solo con la modalità sviluppatore). */
function renderImpostazioniSviluppatore() {
  const dimensione = new Blob([JSON.stringify(STATE)]).size;
  return `
  <div class="card">
    <div class="section-title">Modalità sviluppatore</div>
    <div class="helptext" style="margin-bottom:10px;">Attiva solo su questo PC: gli studi clienti non vedono questa sezione. Per nasconderla, disattivala qui o tocca di nuovo 7 volte la riga della versione in Studio.</div>
    <button class="btn small" data-action="dev-disattiva">Disattiva modalità sviluppatore</button>
  </div>

  <div class="card">
    <div class="section-title">Dati di esempio</div>
    <div class="helptext" style="margin-bottom:12px;">Per provare l'app: carica clienti di esempio con un anno fiscale simulato. <b>Sostituisce i dati attuali.</b> Per svuotare tutto c'è «Zona pericolosa» nella sezione Maestro.</div>
    <button class="btn" data-action="carica-demo">Carica dati di esempio</button>
  </div>

  <div class="card">
    <div class="section-title">Vista per MCP locale (file di esportazione)</div>
    <div class="helptext" style="margin-bottom:12px;">Esporta scadenze già classificate, stato contabilità per cliente, ultimo bilancio e task/comunicazioni aperti in un unico file JSON per il server MCP locale (con il server acceso l'aggiornamento è automatico).</div>
    <button class="btn primary" data-action="esporta-mcp">⬇ Esporta per MCP (JSON)</button>
  </div>

  ${cardBackupPiattaforma()}

  <div class="card">
    <div class="section-title">Sezione Contabilità (sospesa)</div>
    <div class="helptext" style="margin-bottom:10px;">Il tab è sospeso di default e non compare nel menu né nella scheda cliente. I dati già inseriti non vengono toccati.</div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="impContabilitaAttiva" data-action="toggle-contabilita-attiva" ${STATE.meta.contabilitaAttiva?'checked':''}> Mostra la sezione Contabilità</label>
  </div>

  <div class="card">
    <div class="section-title">Informazioni tecniche</div>
    <table class="compact"><tbody>
      <tr><td>Sincronizzazione</td><td>${HTTP_SYNC_ATTIVO ? 'server locale (unione modifiche attiva)' : (DB_REF ? 'claude.ai (ultimo vince)' : 'solo questo browser')}</td></tr>
      <tr><td>Revisione dati sul server</td><td><code>${escapeHtml(String(HTTP_REV || '—'))}</code></td></tr>
      <tr><td>Modifiche non ancora condivise</td><td>${haModificheNonCondivise() ? 'sì' : 'no'}</td></tr>
      <tr><td>ID di questa postazione</td><td><code>${escapeHtml(HTTP_CLIENT_ID)}</code></td></tr>
      <tr><td>Operatore</td><td>${escapeHtml(operatoreCorrente() || '—')}</td></tr>
      <tr><td>Dimensione dei dati</td><td>~${(dimensione/1024).toFixed(1)} KB · ${STATE.clienti.length} clienti</td></tr>
    </tbody></table>
  </div>`;
}

function renderImpostazioni() {
  if (!impSezioniVisibili().some(s => s.id === IMP_SEZIONE)) IMP_SEZIONE = 'studio';
  let contenuto;
  switch (IMP_SEZIONE) {
    case 'moduli': contenuto = renderImpostazioniModuli(); break;
    case 'team': contenuto = renderImpostazioniTeam(); break;
    case 'dati': contenuto = renderImpostazioniDati(); break;
    case 'catalogo': contenuto = renderImpostazioniCatalogo(); break;
    case 'proroghe': contenuto = renderProroghe(); break;
    case 'ia': contenuto = renderImpostazioniIA(); break;
    case 'assistenza': contenuto = renderImpostazioniAssistenza(); break;
    case 'sviluppatore': contenuto = renderImpostazioniSviluppatore(); break;
    case 'gestione': contenuto = renderImpostazioniGestione(); break;
    case 'studio':
    default: contenuto = renderImpostazioniStudio(); break;
  }
  return impTabBarHtml() + contenuto;
}

/* -------------------- IMPOSTAZIONI: catalogo attività/tariffario dello studio (task #138) -------------------- */
function renderCatalogoAttivitaStudio() {
  const attivita = STATE.catalogoAttivitaStudio || [];
  const righe = attivita.map(a => `<tr>
      <td>${escapeHtml(a.nome)}</td>
      <td class="helptext">${escapeHtml(a.descrizione||'')}</td>
      <td style="text-align:right;white-space:nowrap;">${a.prezzo != null ? fmtEuro(a.prezzo) : '—'}</td>
      <td>${a.richiedeMandato ? '<span class="badge info">Sì</span>' : '<span class="badge">No</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="btn small" data-action="modifica-attivita-catalogo" data-id="${a.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-attivita-catalogo" data-id="${a.id}">Elimina</button>
      </td>
    </tr>`).join('');
  return `<div class="card">
    <div class="section-title">Attività e tariffario dello studio</div>
    <div class="helptext" style="margin-bottom:12px;">Il "listino" usato in Preventivi e Mandati: selezionando un'attività da qui, il documento calcola da solo l'importo e (se il modello prevede il campo "dettaglioAttivita") anche l'elenco voci. "Richiede mandato" distingue una gestione continuativa (contabilità, paghe: dopo l'accettazione del preventivo va firmato anche un mandato) da una pratica singola una tantum, per cui basta il preventivo.</div>
    ${attivita.length === 0 ? '<div class="helptext">Nessuna attività configurata.</div>' : `<div class="card" style="padding:0;overflow-x:auto;">
      <table class="compact"><thead><tr><th>Attività</th><th>Descrizione</th><th>Prezzo</th><th>Richiede mandato</th><th></th></tr></thead>
      <tbody>${righe}</tbody></table>
    </div>`}
    <button class="btn small" style="margin-top:10px;" data-action="nuova-attivita-catalogo">+ Nuova attività</button>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);max-width:460px;"><label style="font-weight:700;font-size:13px;">Compenso predefinito di una pratica (€)</label><input type="number" step="0.01" min="0" data-action="compenso-pratica-default" value="${compensoPraticaPredefinito() != null ? compensoPraticaPredefinito() : ''}" placeholder="es. 80"><div class="helptext">Proposto quando completi un task segnato «È una pratica»: potrai sempre sostituirlo con una voce del tariffario o con un importo libero, e confermare tu cosa addebitare.</div></div>
  </div>`;
}
function modalAttivitaCatalogo(id) {
  const editing = id ? (STATE.catalogoAttivitaStudio || []).find(a => a.id === id) : null;
  if (id && !editing) { toast('Attività non trovata.'); return; }
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica attività':'Nuova attività'}</h2><div class="modal-sub">Comparirà come voce selezionabile quando crei un Preventivo o un Mandato.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formAttivitaCatalogo" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Nome attività *</label><input id="acNome" value="${editing?escapeHtml(editing.nome):''}" placeholder="es. Tenuta contabilità ordinaria"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Descrizione (opzionale)</label><textarea id="acDescrizione" rows="2" style="min-height:44px;">${editing?escapeHtml(editing.descrizione||''):''}</textarea></div>
          <div class="field"><label>Prezzo (€, opzionale)</label><input type="number" step="0.01" id="acPrezzo" value="${editing&&editing.prezzo!=null?editing.prezzo:''}" placeholder="0.00"></div>
          <div class="field"><label>&nbsp;</label><label style="display:flex;align-items:center;gap:8px;font-weight:400;padding-top:7px;"><input type="checkbox" id="acRichiedeMandato" ${editing&&editing.richiedeMandato?'checked':''}> Richiede un mandato dopo l'accettazione</label></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-attivita-catalogo" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Crea attività'}</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

/* -------------------- IMPOSTAZIONI: regole per la precompilazione degli importi statutari -------------------- */
function renderRegoleImportiStatutari() {
  const regole = STATE.regoleImportiStatutari || [];
  const righe = regole.map(r => {
    const chiaveDef = catalogoAnnualeTutti().find(c => c.chiave === r.chiave);
    return `<tr>
      <td>${escapeHtml(r.nome)}</td>
      <td>${escapeHtml(chiaveDef ? chiaveDef.nome : r.chiave)}</td>
      <td style="text-align:right;">${r.importoBase!=null && r.importoBase>0 ? fmtEuro(r.importoBase) : '—'}</td>
      <td style="text-align:right;">${r.sogliaCapitaleSociale!=null ? fmtEuro(r.sogliaCapitaleSociale) : '—'}</td>
      <td style="text-align:right;">${r.importoSopraSoglia!=null ? fmtEuro(r.importoSopraSoglia) : '—'}</td>
      <td style="text-align:right;">${r.importoPerSedeAggiuntiva ? fmtEuro(r.importoPerSedeAggiuntiva) : '—'}</td>
      <td>
        <button class="btn small" data-action="modifica-regola-importo" data-id="${r.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-regola-importo" data-id="${r.id}">Elimina</button>
      </td>
    </tr>`;
  }).join('');
  return `<div class="card">
    <div class="section-title">Precompilazione importi statutari</div>
    <div class="helptext" style="margin-bottom:12px;">Importi fissati dalla legge che variano in modo prevedibile (capitale sociale, numero di sedi secondarie): quando registri un F24 collegato a uno di questi adempimenti, il gestionale suggerisce l'importo — sempre da verificare, mai applicato senza che tu lo veda. Tienili aggiornati qui quando cambia la normativa.</div>
    ${regole.length === 0 ? '<div class="helptext">Nessuna regola configurata.</div>' : `<div class="card" style="padding:0;overflow-x:auto;">
      <table class="compact"><thead><tr><th>Voce</th><th>Adempimento</th><th>Importo base</th><th>Soglia capitale sociale</th><th>Importo sopra soglia</th><th>€/sede aggiuntiva</th><th></th></tr></thead>
      <tbody>${righe}</tbody></table>
    </div>`}
    <button class="btn small" style="margin-top:10px;" data-action="nuova-regola-importo">+ Nuova regola</button>
  </div>`;
}
function modalRegolaImportoStatutario(id) {
  const editing = id ? (STATE.regoleImportiStatutari || []).find(r => r.id === id) : null;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica regola':'Nuova regola'} importo statutario</h2><div class="modal-sub">Verifica sempre gli importi in vigore prima di salvare: questi valori vengono solo suggeriti in fase di registrazione F24.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formRegolaImporto" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Nome regola *</label><input id="riNome" required value="${editing?escapeHtml(editing.nome):''}" placeholder="es. Tassa vidimazione libri sociali"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Adempimento collegato *</label>
            <select id="riChiave">${catalogoAnnualeTutti().map(c=>`<option value="${c.chiave}" ${editing&&editing.chiave===c.chiave?'selected':''}>${escapeHtml(c.nome)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Importo base (€)</label><input type="number" step="0.01" id="riImportoBase" value="${editing&&editing.importoBase!=null?editing.importoBase:''}" placeholder="0.00"></div>
          <div class="field"><label>€ per sede secondaria aggiuntiva</label><input type="number" step="0.01" id="riImportoSede" value="${editing&&editing.importoPerSedeAggiuntiva?editing.importoPerSedeAggiuntiva:''}" placeholder="0.00"></div>
          <div class="field"><label>Soglia capitale sociale (€, opzionale)</label><input type="number" step="0.01" id="riSoglia" value="${editing&&editing.sogliaCapitaleSociale!=null?editing.sogliaCapitaleSociale:''}" placeholder="es. 516456.90"></div>
          <div class="field"><label>Importo sopra soglia (€)</label><input type="number" step="0.01" id="riImportoSopraSoglia" value="${editing&&editing.importoSopraSoglia!=null?editing.importoSopraSoglia:''}" placeholder="0.00"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Nota (facoltativa)</label><input id="riNota" value="${editing?escapeHtml(editing.nota||''):''}" placeholder="es. fonte normativa, data ultimo aggiornamento..."></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-regola-importo" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Crea regola'}</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

