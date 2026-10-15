'use strict';
/* -------------------- RENDER: COMUNICAZIONI -------------------- */
const CATEGORIE_COMUNICAZIONE = ['Scadenza fiscale', 'Novità legislativa', 'Amministrativa', 'Documento disponibile', 'Raccolta documentale', 'Altro'];
const STATI_COMUNICAZIONE = ['Bozza', 'Programmata', 'Inviata'];
const FREQUENZE_RICORRENZA = ['Mensile', 'Trimestrale', 'Annuale'];
// Task #124 (Matteo: "mettiamo un filtro per vedere le comunicazioni: solo le aperte, solo le
// chiuse, tutte, solo quelle dal cliente, solo raccolta documentale ecc ecc."): chiusura filtra su
// archiviataPortale (vedi comArchiviataBadge/case 'com-archivia-portale' più sotto - "chiusa" per lo
// studio equivale a "tolta dalla vista principale del portale cliente"), non sullo "stato" che
// governa invece il ciclo di vita proprio della comunicazione (Bozza/Programmata/Inviata).
let COM_FILTRO = { cliente: 'Tutti', stato: 'Tutti', categoria: 'Tutte', direzione: 'Tutte', chiusura: 'Tutte' };
let COM_GRUPPI_EXPANDED = new Set();

/* categoria "vera" di una comunicazione, con fallback per record salvati prima della rinomina
   del campo tipo -> categoria (non serve una migrazione: il vecchio valore resta comunque
   leggibile invece di sparire). */
function categoriaComunicazione(c) { return c.categoria || c.tipo || 'Altro'; }

/* Widget "Destinatari" condiviso tra il modal di invio singolo e quello dei modelli ricorrenti.
   prefix distingue gli id nei due modal (non sono mai aperti insieme, ma restiamo puliti). */
function destinatariFieldsHtml(prefix, modo, clienteIdSingolo, clienteIdsMulti) {
  modo = modo || 'singolo';
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  return `
    <div class="field full" style="grid-column:1/-1;">
      <label>Destinatari</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px;">
        <label class="dest-chip ${modo==='singolo'?'attiva':''}"><input type="radio" name="${prefix}DestModo" value="singolo" data-action="${prefix}-dest-modo" ${modo==='singolo'?'checked':''}> Un cliente</label>
        <label class="dest-chip ${modo==='tutti'?'attiva':''}"><input type="radio" name="${prefix}DestModo" value="tutti" data-action="${prefix}-dest-modo" ${modo==='tutti'?'checked':''}> Tutti i clienti attivi (${attivi.length})</label>
        <label class="dest-chip ${modo==='multi'?'attiva':''}"><input type="radio" name="${prefix}DestModo" value="multi" data-action="${prefix}-dest-modo" ${modo==='multi'?'checked':''}> Più clienti (seleziona)</label>
      </div>
      <div id="${prefix}DestSingoloWrap" style="${modo==='singolo'?'':'display:none;'}">
        <select id="${prefix}DestSingolo">${attivi.map(c=>`<option value="${c.id}" ${clienteIdSingolo===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select>
      </div>
      <div id="${prefix}DestMultiWrap" style="${modo==='multi'?'':'display:none;'}max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;">
        ${attivi.map(c=>`<label class="checkline"><input type="checkbox" data-multi-cliente="${prefix}" value="${c.id}" ${(clienteIdsMulti||[]).includes(c.id)?'checked':''}> ${escapeHtml(c.ragioneSociale)}</label>`).join('')}
      </div>
    </div>`;
}
function leggiDestinatari(prefix) {
  const radioChecked = document.querySelector(`input[name="${prefix}DestModo"]:checked`);
  const modo = radioChecked ? radioChecked.value : 'singolo';
  if (modo === 'tutti') return { modo, clienteIds: STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>c.id) };
  if (modo === 'multi') return { modo, clienteIds: Array.from(document.querySelectorAll(`[data-multi-cliente="${prefix}"]:checked`)).map(cb=>cb.value) };
  const el = document.getElementById(`${prefix}DestSingolo`);
  return { modo, clienteIds: (el && el.value) ? [el.value] : [] };
}

/* Raggruppa le comunicazioni con lo stesso gruppoId (invii broadcast a più clienti) in un'unica
   riga "N destinatari" — la lista resta leggibile anche quando una circolare va a 24 clienti. */
function raggruppaComunicazioni(lista) {
  const gruppi = new Map();
  const righe = [];
  for (const c of lista) {
    if (c.gruppoId) {
      if (!gruppi.has(c.gruppoId)) { const voce = { tipo:'gruppo', gruppoId: c.gruppoId, righe: [], rappresentante: c }; gruppi.set(c.gruppoId, voce); righe.push(voce); }
      gruppi.get(c.gruppoId).righe.push(c);
    } else {
      righe.push({ tipo:'singola', c });
    }
  }
  return righe.sort((a,b) => {
    const da = (a.tipo==='gruppo'?a.rappresentante:a.c).data || '';
    const db = (b.tipo==='gruppo'?b.rappresentante:b.c).data || '';
    return db.localeCompare(da);
  });
}

// Task #124 (Matteo: "lato studio quando arriva una comunicazione da un cliente non si vede nessuna
// notifica sul tab, mettila"): messaggi del cliente, o thread la cui ultima risposta è del cliente,
// non ancora aperti dallo studio (vistaStudio false) - stessa condizione già usata per il banner
// rosso in cima alla vista Comunicazioni, ora estratta a funzione a sé per poterla riusare anche
// per il pallino nella nav laterale (renderNav).
function comunicazioniDaLeggereConteggio() {
  return STATE.comunicazioni.filter(c => {
    const ultima = (c.risposte || []).length ? c.risposte[c.risposte.length - 1].autore : null;
    return (c.direzione === 'cliente' || ultima === 'cliente') && c.vistaStudio === false;
  }).length;
}
function renderComunicazioni() {
  // Ordine: prima per data (giorno), poi per momento di creazione preciso a parità di giorno (vedi
  // commento su aggiungiComunicazione) - comunicazioni senza creataIl (dati demo/vecchi) restano in
  // fondo al loro giorno, comportamento invariato per loro.
  const lista = STATE.comunicazioni.slice().sort((a,b) => (b.data||'').localeCompare(a.data||'') || (b.creataIl||'').localeCompare(a.creataIl||''));
  let filtrata = lista;
  if (COM_FILTRO.cliente !== 'Tutti') filtrata = filtrata.filter(c => c.clienteId === COM_FILTRO.cliente);
  if (COM_FILTRO.stato !== 'Tutti') filtrata = filtrata.filter(c => c.stato === COM_FILTRO.stato);
  if (COM_FILTRO.categoria !== 'Tutte') filtrata = filtrata.filter(c => categoriaComunicazione(c) === COM_FILTRO.categoria);
  if (COM_FILTRO.direzione === 'Dal cliente') filtrata = filtrata.filter(c => c.direzione === 'cliente');
  else if (COM_FILTRO.direzione === 'Dallo studio') filtrata = filtrata.filter(c => c.direzione !== 'cliente');
  if (COM_FILTRO.chiusura === 'Aperte') filtrata = filtrata.filter(c => !c.archiviataPortale);
  else if (COM_FILTRO.chiusura === 'Chiuse') filtrata = filtrata.filter(c => c.archiviataPortale);

  const avvisoDaLeggere = comunicazioniDaLeggereConteggio() ? `<div class="portal-banner" style="background:var(--rosso-bg);color:var(--rosso);border-color:var(--rosso);"><strong>${comunicazioniDaLeggereConteggio()}</strong> ${comunicazioniDaLeggereConteggio() === 1 ? 'messaggio dal portale cliente da leggere' : 'messaggi dal portale cliente da leggere'} — clicca sull'oggetto o su "Thread" per aprirli.</div>` : '';

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="com-filtro-cliente">
      <option value="Tutti" ${COM_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${COM_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Stato</label><select data-action="com-filtro-stato">
      <option value="Tutti" ${COM_FILTRO.stato==='Tutti'?'selected':''}>Tutti</option>
      ${STATI_COMUNICAZIONE.map(s=>`<option ${COM_FILTRO.stato===s?'selected':''}>${s}</option>`).join('')}
    </select></div>
    <div class="field"><label>Categoria</label><select data-action="com-filtro-categoria">
      <option value="Tutte" ${COM_FILTRO.categoria==='Tutte'?'selected':''}>Tutte</option>
      ${CATEGORIE_COMUNICAZIONE.map(cat=>`<option ${COM_FILTRO.categoria===cat?'selected':''}>${escapeHtml(cat)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Direzione</label><select data-action="com-filtro-direzione">
      ${['Tutte','Dal cliente','Dallo studio'].map(v=>`<option ${COM_FILTRO.direzione===v?'selected':''}>${v}</option>`).join('')}
    </select></div>
    <div class="field"><label>Portale cliente</label><select data-action="com-filtro-chiusura">
      ${['Tutte','Aperte','Chiuse'].map(v=>`<option ${COM_FILTRO.chiusura===v?'selected':''}>${v}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuova-comunicazione">+ Nuova comunicazione</button></div>
  </div>`;

  const ricorrenti = renderComunicazioniRicorrenti();

  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>Le comunicazioni sono sempre legate a un'anagrafica cliente.</div></div>`;
  }
  if (lista.length === 0) {
    return ricorrenti + toolbar + `<div class="card"><div class="empty"><div class="big">Nessuna comunicazione pubblicata</div>Le comunicazioni che crei qui appaiono nel portale del cliente al posto dell'email — a un cliente solo, a più clienti insieme, o ricorrenti.</div></div>`;
  }
  if (filtrata.length === 0) {
    return avvisoDaLeggere + ricorrenti + toolbar + `<div class="card"><div class="empty">Nessuna comunicazione corrisponde ai filtri.</div></div>`;
  }

  const rigaSingola = (c) => {
    const dalCliente = c.direzione === 'cliente';
    const nUltimaRisposta = (c.risposte || []).length ? (c.risposte[c.risposte.length - 1].autore) : null;
    const daLeggere = (dalCliente || nUltimaRisposta === 'cliente') && c.vistaStudio === false;
    // Task #124 (Matteo: "cliccando sulla comunicazione si apra una finestra dedicata... senza
    // dover premere il tasto thread"): data-action anche sulla <tr> intera, non solo sull'oggetto -
    // i controlli interattivi dentro la riga (select stato, bottoni, link allegato) hanno un loro
    // data-action più vicino al click, quindi il closest('[data-action]') di onClickDelegato li
    // intercetta per primo e non arriva mai a quello della riga: nessun conflitto.
    return `<tr class="${daLeggere ? 'non-letta' : ''}" style="cursor:pointer;" data-action="com-apri-thread" data-id="${c.id}">
    <td style="white-space:nowrap;">${daLeggere ? '<span class="puntino-rosso" title="Da leggere"></span> ' : ''}${fmtData(c.data)}</td>
    <td>${escapeHtml(nomeCliente(c.clienteId))}</td>
    <td><span class="badge info">${escapeHtml(categoriaComunicazione(c))}</span>${dalCliente ? ' <span class="badge" style="background:var(--viola-bg);color:var(--viola);">Dal cliente</span>' : ''}${dalCliente && c.richiestaChiusa ? ' <span class="badge" style="background:var(--verde-bg);color:var(--verde);">Richiesta chiusa</span>' : ''}${c.archiviataPortale ? ' <span class="badge" title="Non compare più nella lista principale del portale cliente">📥 Archiviata</span>' : ''}${c.visibilePortale===false?' <span class="badge">solo interno</span>':''}</td>
    <td><span style="cursor:pointer;" data-action="com-apri-thread" data-id="${c.id}" title="Apri il thread">${escapeHtml(c.oggetto)}${c.filePercorso ? ` <a href="${linkScaricaFileReale(c.filePercorso)}" target="_blank" title="Apri l'allegato" onclick="event.stopPropagation()">📎</a>` : ''}${(c.risposte||[]).length ? ` <span class="badge">${c.risposte.length} risp.</span>` : ''}</span></td>
    <td><select data-action="com-cambia-stato" data-id="${c.id}">${STATI_COMUNICAZIONE.map(s=>`<option ${c.stato===s?'selected':''}>${s}</option>`).join('')}</select></td>
    <td><button class="btn small" data-action="com-apri-thread" data-id="${c.id}">Thread</button> <button class="btn small danger" data-action="elimina-comunicazione" data-id="${c.id}">Elimina</button></td>
  </tr>`;
  };

  const rigaGruppo = (g) => {
    const rap = g.rappresentante;
    const expanded = COM_GRUPPI_EXPANDED.has(g.gruppoId);
    const dettaglio = expanded ? `<tr><td colspan="6" style="background:var(--blu-light);"><div class="helptext" style="padding:4px 0;">Destinatari: ${g.righe.map(r=>escapeHtml(nomeCliente(r.clienteId))).join(', ')}</div></td></tr>` : '';
    return `<tr>
      <td style="white-space:nowrap;">${fmtData(rap.data)}</td>
      <td><span class="badge viola">📢 ${g.righe.length} destinatari</span> <span data-action="com-toggle-gruppo" data-id="${g.gruppoId}" style="cursor:pointer;">${expanded?'▾':'▸'}</span></td>
      <td><span class="badge info">${escapeHtml(categoriaComunicazione(rap))}</span></td>
      <td>${escapeHtml(rap.oggetto)}</td>
      <td><select data-action="com-cambia-stato-gruppo" data-id="${g.gruppoId}">${STATI_COMUNICAZIONE.map(s=>`<option ${rap.stato===s?'selected':''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn small danger" data-action="elimina-comunicazione-gruppo" data-id="${g.gruppoId}">Elimina</button></td>
    </tr>${dettaglio}`;
  };

  const gruppi = raggruppaComunicazioni(filtrata);
  const pag = paginaLista('comunicazioni', gruppi);
  const righe = pag.pagina.map(v => v.tipo==='gruppo' ? rigaGruppo(v) : rigaSingola(v.c)).join('');

  return avvisoDaLeggere + ricorrenti + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Data</th><th>Cliente</th><th>Categoria</th><th>Oggetto</th><th>Stato</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

function modalComunicazione(presetClienteId) {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const attivi0 = STATE.clienti.filter(c => clienteAttivo(c));
  const presetValido = presetClienteId && attivi0.find(c => c.id === presetClienteId) ? presetClienteId : null;
  const sezioneFileCom = HTTP_SYNC_ATTIVO
    ? `<div class="field full" style="grid-column:1/-1;"><label>Allegato (opzionale)</label><input type="file" id="cFile">
        <div class="helptext" style="margin-top:4px;">Caricato nella cartella del cliente (server locale attivo). Se la comunicazione va a più clienti insieme, viene caricato una copia per ciascuno.</div>
      </div>`
    : `<div class="field full" style="grid-column:1/-1;"><div class="helptext">Il caricamento di un allegato richiede il server locale (server.js) attivo — qui puoi comunque pubblicare la comunicazione senza allegato.</div></div>`;
  // Task #105: se la comunicazione va a UN solo cliente, permette di segnalare che riguarda un
  // F24 da pagare — l'F24 (con l'eventuale allegato) viene così registrato automaticamente anche
  // nella sezione F24 di quel cliente, oltre a comparire nel portale. Non ha senso su un invio
  // broadcast (l'importo è per definizione specifico di un cliente), quindi il blocco viene
  // mostrato/nascosto in base al modo destinatari (vedi case 'c-dest-modo').
  const sezioneF24Com = `<div class="field full" id="cF24Wrap" style="grid-column:1/-1;">
      <label class="checkline top"><input type="checkbox" id="cIsF24" data-action="c-f24-toggle"> Riguarda un F24 da pagare — registralo anche nella sezione F24 del cliente</label>
      <div id="cF24Campi" class="grid2" style="display:none;margin-top:8px;">
        <div class="field"><label>Tipo F24</label><select id="cF24Tipo">${TIPI_F24.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Importo (€) *</label><input type="number" step="0.01" id="cF24Importo" placeholder="0.00"></div>
      </div>
    </div>`;
  // Task #142: solo per categoria "Raccolta documentale" - indica in QUALE categoria di Documenti
  // andrà catalogato l'allegato che il cliente manderà in risposta (usata poi da "Salva in
  // Documenti" nel thread). Nascosta di default, mostrata da 'c-categoria-change'.
  const sezioneRaccoltaDoc = `<div class="field full" id="cRaccoltaDocWrap" style="grid-column:1/-1;display:none;">
      <label>Categoria del documento richiesto</label>
      <select id="cCategoriaDocRichiesta">${CATEGORIE_DOCUMENTO.map(c=>`<option>${c}</option>`).join('')}</select>
      <div class="helptext" style="margin-top:4px;">Quando il cliente risponde allegando il file, dal thread potrai salvarlo con un click nella cartella Documenti del cliente, già in questa categoria.</div>
    </div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuova comunicazione</h2><div class="modal-sub">Viene pubblicata nel portale del cliente (non è un invio email). Puoi mandarla a un cliente solo o a più insieme.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formComunicazione" onsubmit="return false;">
        <div class="grid2">
          ${destinatariFieldsHtml('c', 'singolo', presetValido, [])}
          <div class="field"><label>Data *</label><input type="date" id="cData" value="${oggiISO()}" required><div class="helptext" style="margin-top:3px;">Data di pubblicazione (di norma oggi) — non la data della scadenza a cui si riferisce, che va scritta nel testo: determina l'ordine in cui la comunicazione compare nell'elenco.</div></div>
          <div class="field"><label>Categoria</label><select id="cCategoria" data-action="c-categoria-change">${CATEGORIE_COMUNICAZIONE.map(t=>`<option>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Stato</label><select id="cStato">${STATI_COMUNICAZIONE.map(s=>`<option ${s==='Inviata'?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>&nbsp;</label><label class="checkline"><input type="checkbox" id="cVisibilePortale" checked> Visibile nel portale cliente</label><label class="checkline" style="margin-top:4px;"><input type="checkbox" id="cRichiedeConferma"> Chiedi conferma di lettura</label></div>
          <div class="field full" style="grid-column:1/-1;"><label>Oggetto *</label><input id="cOggetto" required placeholder="es. Promemoria scadenza IVA settembre"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Testo del messaggio</label><textarea id="cCorpo" style="width:100%;min-height:70px;" placeholder="Il testo che vedrà il cliente nel portale — indica quali documenti servono"></textarea></div>
          ${sezioneRaccoltaDoc}
          <div class="field full" style="grid-column:1/-1;"><label>Note interne (non visibili al cliente)</label><textarea id="cNote" style="width:100%;min-height:45px;"></textarea></div>
          ${sezioneFileCom}
          ${sezioneF24Com}
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-comunicazione">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* Thread di una comunicazione (task #88): mostra il messaggio originale, il contesto (se legato a
   una scadenza), tutte le risposte in ordine cronologico e un campo per risponderne una nuova.
   Aprirlo segna il thread come letto dallo studio (aggiornaStato più sotto lo fa comunque anche
   senza rispondere, altrimenti il badge "Da leggere" resterebbe acceso per sempre su un messaggio
   che Matteo ha letto ma a cui non ha ancora risposto). */
let COM_SALVA_DOC_RISP_ID = null; // id della risposta per cui è aperto il mini-form categoria/Salva
function modalThreadComunicazione(id) {
  const c = STATE.comunicazioni.find(x => x.id === id);
  if (!c) return;
  if (c.vistaStudio === false) { c.vistaStudio = true; salvaStato(); }
  const risposte = (c.risposte || []);
  const righeRisposte = risposte.length
    ? risposte.map(r => {
        // Task Matteo: "quando ti dicevo che vorrei categorizzare i documenti intendevo questo" -
        // il bottone non salva più subito indovinando la categoria, apre un mini-form con il
        // selettore (precompilato con la categoria richiesta dalla comunicazione, se c'è) e un
        // bottone di conferma esplicito - resta dentro lo stesso modale thread, niente sotto-modale.
        const formSalvaDoc = COM_SALVA_DOC_RISP_ID === r.id
          ? `<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:var(--bg);border-radius:8px;padding:8px;">
              <select id="salvaDocCategoria" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12.5px;">
                ${CATEGORIE_DOCUMENTO.map(cat => `<option value="${escapeHtml(cat)}" ${(c.categoriaDocumentoRichiesta || 'Altro') === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
              </select>
              <button class="btn small primary" data-action="conferma-salva-risposta-doc" data-com="${c.id}" data-risp="${r.id}">Salva</button>
              <button class="btn small ghost" data-action="annulla-salva-risposta-doc">Annulla</button>
            </div>`
          : `<button class="btn small ghost" data-action="apri-salva-risposta-doc" data-com="${c.id}" data-risp="${r.id}">📁 Salva in Documenti${c.categoriaDocumentoRichiesta ? ' (' + escapeHtml(c.categoriaDocumentoRichiesta) + ')' : ''}</button>`;
        return `<div class="subtask-row" style="align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:2px;">${r.autore === 'studio' ? (r.operatore ? escapeHtml(r.operatore) : 'Studio') : escapeHtml(nomeCliente(c.clienteId))} · ${fmtData(r.data)}</div>
          <div style="font-size:12.5px;white-space:pre-wrap;line-height:1.4;">${escapeHtml(r.testo)}</div>
          ${r.filePercorso ? `<div style="margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <a href="${linkScaricaFileReale(r.filePercorso)}" target="_blank">📎 ${escapeHtml(r.fileNome||'Allegato')}</a>
            ${r.salvatoComeDocumento
              ? `<span class="badge" style="background:var(--verde-bg);color:var(--verde);">✓ Salvato in Documenti</span>`
              : formSalvaDoc}
          </div>` : ''}
        </div>
      </div>`;
      }).join('')
    : `<div class="helptext" style="padding:4px 0;">Nessuna risposta ancora.</div>`;
  const contestoScad = c.scadenzaRif
    ? `<div class="helptext" style="margin-bottom:10px;">📎 Riferita alla scadenza: <strong>${escapeHtml(c.scadenzaRif.nome)}</strong> (entro il ${fmtData(c.scadenzaRif.data)})</div>`
    : '';
  // Task #140: solo le richieste ARRIVATE dal cliente si possono chiudere/riaprire (una comunicazione
  // scritta dallo studio ha già lo stato Bozza/Programmata/Inviata per gestire il proprio ciclo di
  // vita — qui serve invece segnalare "risolta" una domanda/richiesta del cliente, che altrimenti
  // non ha mai un punto di arrivo visibile).
  const azioneChiusura = c.direzione === 'cliente'
    ? (c.richiestaChiusa
        ? `<button class="btn small" data-action="com-riapri-richiesta" data-id="${c.id}">↺ Riapri richiesta</button>`
        : `<button class="btn small" data-action="com-chiudi-richiesta" data-id="${c.id}">✓ Chiudi richiesta</button>`)
    : '';
  // Task #124 (Matteo: "dobbiamo avere la possibilità di segnare come chiusa una comunicazione così
  // il portale del cliente resta pulito"): a differenza di richiestaChiusa sopra (solo le richieste
  // del cliente, segna "risolta"), questa vale per QUALSIASI comunicazione e agisce su
  // archiviataPortale - il campo che già determina se il cliente la vede nella lista principale del
  // suo portale o nella sezione "Archiviate" ripiegata (vedi datiPortaleCliente/comClienteArchiviate),
  // finora impostabile solo indirettamente e mai da qui.
  const azioneArchiviazione = c.archiviataPortale
    ? `<button class="btn small" data-action="com-riporta-portale" data-id="${c.id}">↺ Riporta nella lista principale del portale</button>`
    : `<button class="btn small" data-action="com-archivia-portale" data-id="${c.id}">📥 Chiudi (archivia dal portale cliente)</button>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:540px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(c.oggetto)}</h2><div class="modal-sub">${escapeHtml(nomeCliente(c.clienteId))} · ${fmtData(c.data)}${c.direzione === 'cliente' ? ' · <span class="badge" style="background:var(--viola-bg);color:var(--viola);">Dal cliente</span>' : ''}${c.richiestaChiusa ? ' · <span class="badge" style="background:var(--verde-bg);color:var(--verde);">Richiesta chiusa</span>' : ''}${c.archiviataPortale ? ' · <span class="badge">Archiviata dal portale</span>' : ''}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">${azioneChiusura}${azioneArchiviazione}</div>
      ${contestoScad}
      ${c.corpo ? `<div style="font-size:13px;white-space:pre-wrap;margin-bottom:14px;padding:10px 12px;background:var(--bg);border-radius:8px;">${escapeHtml(c.corpo)}</div>` : ''}
      ${c.filePercorso ? `<div class="helptext" style="margin-bottom:10px;"><a href="${linkScaricaFileReale(c.filePercorso)}" target="_blank">📎 ${escapeHtml(c.fileNome||'Allegato')}</a></div>` : ''}
      <div class="section-title" style="font-size:13px;margin:6px 0 8px;">Risposte<span class="cnt">${risposte.length}</span></div>
      <div style="margin-bottom:10px;max-height:260px;overflow-y:auto;">${righeRisposte}</div>
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <textarea id="threadRispostaTesto" placeholder="Scrivi una risposta per il cliente — la vedrà nel suo portale..." style="flex:1;min-height:56px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12.5px;resize:vertical;"></textarea>
        <button class="btn small primary" data-action="com-rispondi" data-id="${c.id}">Invia</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  render(); // aggiorna subito il badge "Da leggere" nella tabella dietro al modale
}

/* -------------------- COMUNICAZIONI RICORRENTI -------------------- */
/* Elenco unificato degli adempimenti (periodici e annuali) a cui un modello di comunicazione
   ricorrente può essere agganciato, per popolare il <select> del modal con un unico campo
   invece di due select dipendenti. Il valore ha un prefisso "p:"+flag (periodico) o "a:"+chiave
   (annuale) — vedi clientiPerAdempimentoCollegato. */
function adempimentiCollegabili() {
  const periodici = catalogoPeriodici().map(def => ({ valore: 'p:' + def.flag, nome: def.nome, gruppo: 'Scadenze periodiche' }));
  const annuali = catalogoAnnualeAttivo().map(def => ({ valore: 'a:' + def.chiave, nome: def.nome, gruppo: 'Adempimenti annuali' }));
  return periodici.concat(annuali);
}
/* Clienti attivi (non cessati) per cui l'adempimento agganciato a un modello ricorrente risulta
   applicabile OGGI — ricalcolato ad ogni generazione (non una lista congelata alla creazione),
   così la platea si aggiorna da sola quando un cliente viene onboardato/offboardato da
   quell'adempimento, senza che Matteo debba tenere allineata a mano una lista di destinatari. */
function clientiPerAdempimentoCollegato(adempimentoCollegato) {
  if (!adempimentoCollegato) return [];
  const prefisso = adempimentoCollegato.slice(0, 2), valore = adempimentoCollegato.slice(2);
  const attivi = STATE.clienti.filter(c => clienteAttivo(c));
  if (prefisso === 'p:') return attivi.filter(c => flagsAttivi(c)[valore]).map(c => c.id);
  if (prefisso === 'a:') return attivi.filter(c => annualiEffettivi(c).includes(valore)).map(c => c.id);
  return [];
}
function nomeAdempimentoCollegato(adempimentoCollegato) {
  const trovato = adempimentiCollegabili().find(a => a.valore === adempimentoCollegato);
  return trovato ? trovato.nome : adempimentoCollegato;
}
function renderComunicazioniRicorrenti() {
  const lista = STATE.comunicazioniRicorrenti || [];
  const destTxt = (t) => t.adempimentoCollegato
    ? `Automatico: clienti con "${nomeAdempimentoCollegato(t.adempimentoCollegato)}" attivo (${clientiPerAdempimentoCollegato(t.adempimentoCollegato).length})`
    : t.destinatari.modo === 'tutti' ? 'Tutti i clienti attivi'
    : t.destinatari.modo === 'multi' ? `${(t.destinatari.clienteIds||[]).length} clienti selezionati`
    : nomeCliente((t.destinatari.clienteIds||[])[0]);
  const freqTxt = (t) => t.frequenza === 'Mensile' ? `Ogni mese, il giorno ${t.giorno}`
    : t.frequenza === 'Trimestrale' ? `Ogni trimestre (gen/apr/lug/ott), il giorno ${t.giorno}`
    : `Ogni anno, ${t.giorno}/${t.mese}`;
  const righe = lista.map(t => `<div class="cat-tipo ${t.attiva===false?'disattivo':''}" style="padding:10px 14px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" data-action="comric-toggle-attiva" data-id="${t.id}" ${t.attiva!==false?'checked':''} title="Attiva">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:13px;">${escapeHtml(t.oggetto)}</div>
        <div class="helptext">${escapeHtml(freqTxt(t))} · ${escapeHtml(destTxt(t))} · <span class="badge info">${escapeHtml(t.categoria)}</span></div>
      </div>
      <button class="btn small" data-action="modifica-comunicazione-ricorrente" data-id="${t.id}">Modifica</button>
      <button class="btn small danger" data-action="elimina-comunicazione-ricorrente" data-id="${t.id}">Elimina</button>
    </div>
  </div>`).join('');
  return `<div class="card">
    <div class="section-title">Comunicazioni ricorrenti <span class="cnt">${lista.length}</span></div>
    <div class="helptext" style="margin-bottom:10px;">Modelli che generano automaticamente una nuova comunicazione ad ogni scadenza (mensile, trimestrale o annuale) — utili per promemoria ricorrenti o rassegne su novità normative. Possono avere destinatari manuali oppure essere collegati a un adempimento (flag periodico o annuale): in tal caso i destinatari sono automatici e si aggiornano da soli.</div>
    ${righe || '<div class="helptext">Nessun modello ricorrente configurato.</div>'}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn small primary" data-action="nuova-comunicazione-ricorrente">+ Nuovo modello ricorrente</button>
      <button class="btn small" data-action="nuovo-modello-770-cf-sostituto" title="Precompila un modello annuale collegato al 770, destinatari automatici">📋 Modello pronto: richiedi CF consulente del lavoro (770)</button>
    </div>
  </div>`;
}

// Il parametro preset permette di aprire il modal già precompilato (solo in creazione, mai in
// modifica) per modelli "pronti all'uso" come quello 770 qui sotto, senza dover ridigitare ogni
// volta oggetto/testo/collegamento adempimento — l'utente vede comunque tutto nel form e può
// correggere prima di salvare, il modello non viene creato finché non preme "Salva".
function modalComunicazioneRicorrente(tId, preset) {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const editing = !!tId;
  const t = editing ? (STATE.comunicazioniRicorrenti||[]).find(x=>x.id===tId) : Object.assign({
    id: uid('comric'), oggetto: '', corpo: '', categoria: CATEGORIE_COMUNICAZIONE[0],
    destinatari: { modo: 'tutti', clienteIds: [] }, frequenza: 'Mensile', giorno: 5, mese: 1, attiva: true, ultimaGenerazionePeriodo: null,
    adempimentoCollegato: null,
  }, preset || {});
  if (editing && !t) { toast('Modello non trovato.'); return; }
  const gruppiAdempimento = ['Scadenze periodiche', 'Adempimenti annuali'].map(g => {
    const opz = adempimentiCollegabili().filter(a => a.gruppo === g);
    if (!opz.length) return '';
    return `<optgroup label="${g}">${opz.map(a=>`<option value="${a.valore}" ${t.adempimentoCollegato===a.valore?'selected':''}>${escapeHtml(a.nome)}</option>`).join('')}</optgroup>`;
  }).join('');
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica modello ricorrente':'Nuovo modello ricorrente'}</h2><div class="modal-sub">Genera automaticamente una nuova comunicazione ad ogni scadenza, senza doverci pensare.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formComunicazioneRicorrente" data-id="${t.id}" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;">
            <label>Collega a un adempimento (opzionale)</label>
            <select id="crAdempimento" data-action="cr-adempimento-change">
              <option value="">Nessuno — scegli i destinatari a mano</option>
              ${gruppiAdempimento}
            </select>
            <div class="helptext" style="margin-top:4px;">Se collegato, i destinatari sono automatici: tutti i clienti attivi con quell'adempimento applicabile, ricalcolati ad ogni generazione — niente da tenere allineato a mano quando un cliente entra o esce da quell'adempimento.</div>
          </div>
          <div id="crAdempimentoInfo" class="field full" style="grid-column:1/-1;${t.adempimentoCollegato?'':'display:none;'}">
            <div class="helptext" id="crAdempimentoInfoTxt">${t.adempimentoCollegato ? `Destinatari attuali: ${clientiPerAdempimentoCollegato(t.adempimentoCollegato).length} clienti.` : ''}</div>
          </div>
          <div id="crDestinatariWrap" class="field full" style="grid-column:1/-1;${t.adempimentoCollegato?'display:none;':''}">
            ${destinatariFieldsHtml('cr', t.destinatari.modo, (t.destinatari.modo==='singolo'?(t.destinatari.clienteIds||[])[0]:null), t.destinatari.clienteIds)}
          </div>
          <div class="field"><label>Categoria</label><select id="crCategoria">${CATEGORIE_COMUNICAZIONE.map(c=>`<option ${t.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>&nbsp;</label><label class="checkline"><input type="checkbox" id="crAttiva" ${t.attiva!==false?'checked':''}> Modello attivo</label></div>
          <div class="field"><label>Frequenza</label><select id="crFrequenza">${FREQUENZE_RICORRENZA.map(f=>`<option ${t.frequenza===f?'selected':''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Giorno del mese</label><input type="number" min="1" max="28" id="crGiorno" value="${t.giorno||5}"></div>
          <div class="field"><label>Mese (solo se annuale)</label><select id="crMese">${MESI_COMPLETI.map((m,i)=>`<option value="${i+1}" ${(t.mese||1)===i+1?'selected':''}>${m}</option>`).join('')}</select></div>
          <div class="field full" style="grid-column:1/-1;"><label>Oggetto *</label><input id="crOggetto" required value="${escapeHtml(t.oggetto)}" placeholder="es. Rassegna novità fiscali del mese"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Testo del messaggio</label><textarea id="crCorpo" style="width:100%;min-height:70px;">${escapeHtml(t.corpo||'')}</textarea></div>
        </div>
      </form>
      <div class="modal-actions">
        ${editing ? `<button class="btn danger" data-action="elimina-comunicazione-ricorrente" data-id="${t.id}" style="margin-right:auto;">Elimina</button>` : ''}
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-comunicazione-ricorrente" data-id="${t.id}" data-editing="${editing?'1':'0'}">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* Vero se, nel periodo corrente (mese/trimestre/anno secondo la frequenza), il giorno soglia
   configurato è già passato oggi. Usata solo alla CREAZIONE di un modello ricorrente: evita che
   crearne uno con soglia già superata nel periodo in corso (es. creato il 20, soglia il 5) lo
   faccia scattare subito per tutti i destinatari — deve aspettare la prossima occorrenza,
   esattamente come se fosse stato creato prima della soglia dei periodi successivi. */
function sogliaRicorrenzaGiaPassata(t, oggi) {
  const d = new Date(oggi + 'T00:00:00');
  const mese = d.getMonth() + 1, giorno = d.getDate();
  const giornoSoglia = Math.min(t.giorno || 1, 28);
  if (t.frequenza === 'Mensile') return giorno >= giornoSoglia;
  if (t.frequenza === 'Trimestrale') return [1,4,7,10].includes(mese) && giorno >= giornoSoglia;
  return mese === (t.mese || 1) && giorno >= giornoSoglia;
}
function aggiungiComunicazioneRicorrente(t) {
  if (!STATE.comunicazioniRicorrenti) STATE.comunicazioniRicorrenti = [];
  const oggi = oggiISO();
  const ultimaGenerazionePeriodo = sogliaRicorrenzaGiaPassata(t, oggi) ? periodoRicorrenza(t.frequenza, oggi) : null;
  STATE.comunicazioniRicorrenti.push(Object.assign({ id: uid('comric'), ultimaGenerazionePeriodo }, t));
  salvaStato();
}
function aggiornaComunicazioneRicorrente(id, patch) {
  const t = (STATE.comunicazioniRicorrenti||[]).find(x => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  salvaStato();
}
function eliminaComunicazioneRicorrente(id) {
  STATE.comunicazioniRicorrenti = (STATE.comunicazioniRicorrenti||[]).filter(x => x.id !== id);
  salvaStato();
}

/* Calcola in quale "periodo" cade una data, secondo la frequenza del modello — usato per capire
   se la generazione per il periodo corrente è già stata fatta (evita doppioni). */
function periodoRicorrenza(frequenza, dataISO) {
  const d = new Date(dataISO + 'T00:00:00');
  const anno = d.getFullYear(), mese = d.getMonth() + 1;
  if (frequenza === 'Mensile') return `${anno}-${String(mese).padStart(2,'0')}`;
  if (frequenza === 'Trimestrale') return `${anno}-Q${Math.ceil(mese/3)}`;
  return `${anno}`; // Annuale
}
function ricorrenzaDovutaOggi(t, oggi) {
  if (t.attiva === false) return false;
  const d = new Date(oggi + 'T00:00:00');
  const mese = d.getMonth() + 1, giorno = d.getDate();
  const giornoSoglia = Math.min(t.giorno || 1, 28);
  if (t.frequenza === 'Mensile') {
    if (giorno < giornoSoglia) return false;
  } else if (t.frequenza === 'Trimestrale') {
    if (![1,4,7,10].includes(mese)) return false;
    if (giorno < giornoSoglia) return false;
  } else {
    if (mese !== (t.mese || 1)) return false;
    if (giorno < giornoSoglia) return false;
  }
  return t.ultimaGenerazionePeriodo !== periodoRicorrenza(t.frequenza, oggi);
}
/* Chiamata ad ogni avvio dell'app: genera le comunicazioni dovute per i modelli ricorrenti
   attivi. Idempotente — se richiamata più volte nello stesso periodo non duplica nulla, perché
   confronta il periodo corrente con l'ultimo già generato per quel modello. */
function generaComunicazioniRicorrentiDovute() {
  const oggi = oggiISO();
  let generate = 0;
  (STATE.comunicazioniRicorrenti || []).forEach(t => {
    if (!ricorrenzaDovutaOggi(t, oggi)) return;
    let clienteIds = [];
    if (t.adempimentoCollegato) clienteIds = clientiPerAdempimentoCollegato(t.adempimentoCollegato);
    else if (t.destinatari.modo === 'tutti') clienteIds = STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>c.id);
    else clienteIds = (t.destinatari.clienteIds||[]).filter(cid => { const c = clienteById(cid); return c && clienteAttivo(c); });
    if (t.destinatari.modo === 'singolo' && !t.adempimentoCollegato) clienteIds = clienteIds.slice(0,1);
    if (clienteIds.length > 0) {
      const gruppoId = clienteIds.length > 1 ? uid('comgrp') : null;
      clienteIds.forEach(clienteId => {
        aggiungiComunicazione({ clienteId, data: oggi, categoria: t.categoria, stato: 'Inviata', oggetto: t.oggetto, corpo: t.corpo, note: '', visibilePortale: true, gruppoId, generataDaRicorrenteId: t.id });
      });
      generate++;
    }
    t.ultimaGenerazionePeriodo = periodoRicorrenza(t.frequenza, oggi);
  });
  if (generate) salvaStato();
  return generate;
}

/* -------------------- RENDER: DOCUMENTI -------------------- */
/* Task #112: prima erano solo 6 voci pensate più per l'anagrafica societaria che per il flusso
   documentale reale di uno studio (dichiarazioni, F24, buste paga, corrispondenza con gli enti...).
   Ogni documento in STATE.documenti passa SEMPRE da un <select> su questa lista (mai testo libero),
   quindi un documento già salvato ha sempre e solo una di queste categorie - ampliare l'elenco è
   sicuro (nessun valore esistente sparisce, restano tutte le voci precedenti tranne "Bilancio", che
   resta comunque coperta più sotto perché non è stata rimossa, solo riordinata). "Altro" resta
   l'ultima voce, come ripiego per tutto ciò che non rientra altrove. */
const CATEGORIE_DOCUMENTO = ['Anagrafica', 'Visura camerale', 'Atto costitutivo/Statuto', 'Contratto', 'Bilancio', 'Dichiarazione fiscale', 'F24', 'Registro contabile', 'Busta paga', 'Certificazione', 'Corrispondenza Enti', 'Polizza assicurativa', 'Pratiche', 'Verbale / decisione societaria', 'Altro'];
let DOC_FILTRO = { cliente: 'Tutti', categoria: 'Tutti' };

/* Task #120: auto-classificazione documenti — suggerisce una categoria in base a parole chiave nel
   nome file, "imparando" dai documenti già categorizzati dall'utente. Deliberatamente NESSUNA
   struttura dati a parte: STATE.documenti stesso è la memoria di addestramento — ogni documento
   salvato (sia con la categoria suggerita accettata sia con una scelta manualmente) è un esempio
   nome->categoria, quindi anche le "correzioni" dell'utente (cambiare la categoria di un documento
   già salvato, o ignorare il suggerimento e sceglierne un'altra in salvataggio) migliorano da sole i
   suggerimenti futuri al prossimo giro, senza bisogno di tracciarle a parte. */
function suggerisciCategoriaDocumento(nomeFile) {
  const testo = (nomeFile || '').toLowerCase().trim();
  if (testo.length < 3) return null;
  const parole = Array.from(new Set(testo.split(/[^a-zàèéìòù0-9]+/i).filter(p => p.length >= 4)));
  if (!parole.length) return null;
  const punteggi = {}; // categoria -> numero di documenti storici con almeno una parola in comune
  STATE.documenti.forEach(d => {
    if (!d.categoria || !d.nome) return;
    const nomeLower = d.nome.toLowerCase();
    if (parole.some(p => nomeLower.includes(p))) {
      punteggi[d.categoria] = (punteggi[d.categoria] || 0) + 1;
    }
  });
  let migliore = null, punteggioMax = 0;
  Object.keys(punteggi).forEach(cat => {
    if (punteggi[cat] > punteggioMax) { punteggioMax = punteggi[cat]; migliore = cat; }
  });
  // Serve almeno 2 documenti storici concordanti: con un solo precedente il "pattern" sarebbe solo
  // una coincidenza, non ancora un'abitudine consolidata da suggerire con sicurezza.
  return punteggioMax >= 2 ? migliore : null;
}
/* Aggiorna il suggerimento mentre l'utente digita nel campo Nome del modale "Nuovo documento": NON
   chiama render() (distruggerebbe il focus a metà digitazione, stesso principio di
   aggiornaSuggerimentoImportoF24) e non sovrascrive mai una categoria scelta a mano dall'utente in
   QUESTA apertura del modale (tracciata con data-user-set, azzerata ad ogni nuova apertura perché il
   markup del modale viene ricreato da zero). */
function aggiornaSuggerimentoCategoriaDocumento() {
  const campoNome = h('dNome');
  const selCategoria = h('dCategoria');
  const box = h('dCategoriaSuggerimento');
  if (!campoNome || !selCategoria || !box) return;
  const suggerita = suggerisciCategoriaDocumento(campoNome.value);
  if (!suggerita) { box.textContent = ''; return; }
  box.textContent = `Categoria suggerita: ${suggerita} (in base a documenti simili già categorizzati)`;
  if (selCategoria.dataset.userSet !== '1') selCategoria.value = suggerita;
}

function statoDocumento(d) {
  if (!d.dataScadenza) return { txt: 'Senza scadenza', cls: 'info' };
  const delta = giorniTra(oggiISO(), d.dataScadenza);
  if (delta < 0) return { txt: 'Scaduto', cls: 'stato-errore' };
  if (delta <= 30) return { txt: 'In scadenza', cls: 'stato-da-fare' };
  return { txt: 'Valido', cls: 'stato-inviato-telematicamente' };
}

function renderDocumenti() {
  const tutti = STATE.documenti;
  const scaduti = tutti.filter(d => d.dataScadenza && giorniTra(oggiISO(), d.dataScadenza) < 0).length;
  const inScadenza = tutti.filter(d => d.dataScadenza && giorniTra(oggiISO(), d.dataScadenza) >= 0 && giorniTra(oggiISO(), d.dataScadenza) <= 30).length;

  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
    <div class="kpi completati"><div class="n">${tutti.length}</div><div class="l">TOTALE DOCUMENTI</div></div>
    <div class="kpi inscadenza"><div class="n">${inScadenza}</div><div class="l">IN SCADENZA (30GG)</div></div>
    <div class="kpi scaduti"><div class="n">${scaduti}</div><div class="l">SCADUTI</div></div>
  </div>`;

  let lista = tutti.slice().sort((a,b) => (a.dataScadenza||'9999').localeCompare(b.dataScadenza||'9999'));
  if (DOC_FILTRO.cliente !== 'Tutti') lista = lista.filter(d => d.clienteId === DOC_FILTRO.cliente);
  if (DOC_FILTRO.categoria !== 'Tutti') lista = lista.filter(d => d.categoria === DOC_FILTRO.categoria);

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="doc-filtro-cliente">
      <option value="Tutti" ${DOC_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${DOC_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Categoria</label><select data-action="doc-filtro-categoria">
      <option value="Tutti" ${DOC_FILTRO.categoria==='Tutti'?'selected':''}>Tutti</option>
      ${CATEGORIE_DOCUMENTO.map(c=>`<option ${DOC_FILTRO.categoria===c?'selected':''}>${c}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${HTTP_SYNC_ATTIVO ? `<button class="btn" data-action="crea-struttura-cartelle" ${DOC_FILTRO.cliente === 'Tutti' ? 'disabled title="Scegli prima un cliente nel filtro"' : `title="Crea nella cartella di questo cliente le aree standard: ${escapeHtml(Object.values(AREE_CARTELLA).join(', '))} (con l\'anno corrente)"`}>📁 Crea cartelle standard${DOC_FILTRO.cliente === 'Tutti' ? '' : ' del cliente'}</button>` : ''}
      <button class="btn primary" data-action="nuovo-documento">+ Nuovo documento</button>
    </div></div>
  </div>`;

  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>I documenti sono sempre legati a un'anagrafica cliente.</div></div>`;
  }
  if (tutti.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun documento tracciato</div>Aggiungi visure, certificazioni o altri documenti con scadenza da monitorare.</div></div>`;
  }
  if (lista.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty">Nessun documento corrisponde ai filtri.</div></div>`;
  }

  const pag = paginaLista('documenti', lista);
  const righe = pag.pagina.map(d => {
    const s = statoDocumento(d);
    const azioniFile = d.filePercorso
      ? `<a class="btn small" href="${linkScaricaFileReale(d.filePercorso)}" target="_blank" title="Apre il file in una nuova scheda">Apri file</a>${HTTP_SYNC_ATTIVO ? ` <button class="btn small" data-action="apri-cartella-documento" data-percorso="${escapeHtml(d.filePercorso)}" title="Apre la cartella sul PC con il file selezionato">Apri cartella</button>` : ''}`
      : `<span class="helptext" title="Registrato senza il file vero e proprio: per averlo, elimina e ricarica questo documento con il server locale (server.js) acceso.">Nessun file collegato</span>`;
    return `<tr>
      <td>${escapeHtml(d.nome)}</td>
      <td>${escapeHtml(nomeCliente(d.clienteId))}</td>
      <td><span class="badge info">${escapeHtml(d.categoria)}</span></td>
      <td style="white-space:nowrap;">${fmtData(d.dataCaricamento)}</td>
      <td style="white-space:nowrap;">${d.dataScadenza?fmtData(d.dataScadenza):'—'}</td>
      <td><span class="badge ${s.cls}">${s.txt}</span></td>
      <td style="white-space:nowrap;">${azioniFile}</td>
      <td><button class="btn small danger" data-action="elimina-documento" data-id="${d.id}">Elimina</button></td>
    </tr>`;
  }).join('');

  return kpi + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Nome</th><th>Cliente</th><th>Categoria</th><th>Caricato il</th><th>Scadenza</th><th>Stato</th><th>File</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

function modalDocumento() {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const sezioneFile = HTTP_SYNC_ATTIVO
    ? `<div class="field full" style="grid-column:1/-1;"><label>File (opzionale)</label><input type="file" id="dFile">
        <div class="helptext" style="margin-top:4px;">Salvato in una cartella dedicata al cliente, dentro la cartella del gestionale (server locale attivo).</div>
      </div>`
    : `<div class="field full" style="grid-column:1/-1;"><div class="helptext">Il caricamento del file vero e proprio richiede il server locale (server.js) attivo — qui puoi comunque registrare i dati del documento senza allegarlo.</div></div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuovo documento</h2><div class="modal-sub">Traccia un documento ricevuto o da monitorare per scadenza.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formDocumento" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Cliente *</label><select id="dCliente">${STATE.clienti.filter(c=>clienteAttivo(c)).map(c=>`<option value="${c.id}">${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>
          <div class="field"><label>Categoria</label><select id="dCategoria" data-action="doc-categoria-manual">${CATEGORIE_DOCUMENTO.map(c=>`<option>${c}</option>`).join('')}</select><div class="helptext" id="dCategoriaSuggerimento" style="margin-top:4px;"></div></div>
          <div class="field full" style="grid-column:1/-1;"><label>Nome documento *</label><input id="dNome" required data-action="doc-nome-suggerisci" placeholder="es. Visura camerale 2026"></div>
          <div class="field"><label>Caricato il</label><input type="date" id="dDataCaricamento" value="${oggiISO()}"></div>
          <div class="field"><label>Scadenza (opzionale)</label><input type="date" id="dDataScadenza"></div>
          ${sezioneFile}
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-documento">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* -------------------- RENDER: MODELLI DOCUMENTO (task #122-128) -------------------- */
const CATEGORIE_MODELLO_BASE = ['Preventivo', 'Mandato professionale', 'Lettera di incarico', 'AML - Dichiarazione cliente', 'AML - Nota di accettazione incarico'];


/* ============================================================================================
   EDITOR DOCUMENTI (task #223, Matteo: "la finestra per modificare i modelli non è pratica, sembra
   una console di codice e non è graficamente bello nel risultato").
   Il testo di modelli e documenti RESTA una stringa (retrocompatibile con tutto ciò che già esiste:
   MCP, backup, rigenera dal modello), ma con una marcatura leggera che l'utente non vede mai:
     "# titolo"  "## sezione"  "**grassetto**"  "*corsivo*"  "- elenco"  "^^ centrato"  ">> a destra"  "---"
   Un testo senza marcatura (tutti i modelli precedenti) si legge come prima: in più le righe tutte
   in maiuscolo diventano titoli di sezione. L'editor è un foglio A4 contenteditable con barra
   strumenti; i segnaposto {{così}} compaiono come "chip" colorati con un nome leggibile.
   ============================================================================================ */
function etichettaCampoDocumento(chiave) {
  const a = PLACEHOLDER_AUTO_LEGENDA.find(x => x.chiave === chiave);
  if (a) return a.label.replace(/\s*\(.*\)\s*$/, '');
  const risv = { oggetto: 'Oggetto', importo: 'Importo', dataEmissione: 'Data emissione', validoFino: 'Valido fino al', dettaglioAttivita: 'Elenco attività' };
  return risv[chiave] || etichettaCampoPersonalizzato(chiave);
}
function chipCampoHtml(chiave) {
  const auto = PLACEHOLDER_AUTO_LEGENDA.some(x => x.chiave === chiave) || PLACEHOLDER_RISERVATI.includes(chiave);
  return `<span class="campo-chip${auto ? '' : ' custom'}" contenteditable="false" data-chiave="${escapeHtml(chiave)}">${escapeHtml(etichettaCampoDocumento(chiave))}</span>`;
}
function inlineDocumentoHtml(riga, conChip) {
  let t = escapeHtml(riga);
  t = t.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, k) => conChip ? chipCampoHtml(k) : '<span class="campo-vuoto">' + escapeHtml(etichettaCampoDocumento(k)) + '</span>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
  return t;
}
function eRigaTitoloMaiuscolo(r) {
  const t = r.trim().replace(/^\d+[.)]\s*/, '');
  return t.length >= 4 && t === t.toUpperCase() && /[A-ZÀÈÉÌÒÙ]{3}/.test(t) && !/\{\{/.test(t) && !/[a-z]/.test(t);
}
/* Immagini nei documenti (riga [[img:ID|larghezza%|allineamento]]): i dati stanno in STATE.immaginiDocumenti. */
const IMG_RIGA_RE = /^\[\[img:([\w-]+)\|(\d{1,3})\|(left|center|right)\]\]$/;
function immagineDocumentoHtml(id, w, al, ed) {
  const im = (STATE.immaginiDocumenti || {})[id];
  const src = im ? im.d : '';
  if (!ed) return src ? `<div style="text-align:${al};margin:8px 0;"><img src="${src}" style="width:${w}%;max-width:100%;" alt=""></div>` : '';
  const btn = (op, t, tit) => `<button type="button" onmousedown="event.preventDefault()" data-action="doc-img" data-op="${op}" title="${tit}">${t}</button>`;
  return `<div class="d-img" contenteditable="false" data-img="${id}" data-w="${w}" data-al="${al}" style="text-align:${al};"><span class="img-wrap" style="width:${w}%;">${src ? `<img src="${src}" alt="">` : '<em>(immagine mancante)</em>'}<span class="img-ctl">${btn('meno', '−', 'Più piccola')}${btn('piu', '+', 'Più grande')}${btn('left', '⇤', 'A sinistra')}${btn('center', '↔', 'Al centro')}${btn('right', '⇥', 'A destra')}${btn('del', '✕', 'Rimuovi immagine')}</span></span></div>`;
}
function registraImmagineDocumento(dataUrl, w, h) {
  if (!STATE.immaginiDocumenti) STATE.immaginiDocumenti = {};
  const id = uid('img');
  STATE.immaginiDocumenti[id] = { d: dataUrl, w: w || 0, h: h || 0 };
  salvaStato();
  return id;
}
function potaImmaginiDocumenti() {
  const usate = new Set();
  const scan = (t) => String(t || '').split('\n').forEach(r => { const m = IMG_RIGA_RE.exec(r); if (m) usate.add(m[1]); });
  (STATE.modelliDocumento || []).forEach(m => scan(m.corpo));
  (STATE.preventivi || []).forEach(p => scan(p.corpo));
  const im = STATE.immaginiDocumenti || {};
  Object.keys(im).forEach(k => { if (!usate.has(k)) delete im[k]; });
}
/* Testo marcato -> HTML. modo 'editor': una <div> per riga (round-trip esatto con editorDocumentoToTesto);
   modo 'lettura': HTML tipografico per stampa/anteprima (paragrafi, titoli, elenchi). */
function testoDocumentoToHtml(testo, modo) {
  const righe = String(testo || '').replace(/\r/g, '').split('\n');
  const ed = modo === 'editor';
  let out = '', inUl = false;
  const chiudiUl = () => { if (inUl) { out += '</ul>'; inUl = false; } };
  let tab = null;
  const chiudiTab = () => {
    if (!tab) return;
    const celle = (riga) => riga.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const sepIdx = tab.findIndex(x => /^\s*\|?[\s:|-]+\|?\s*$/.test(x) && x.indexOf('-') >= 0);
    const intest = sepIdx === 1 ? celle(tab[0]) : null;
    const corpoRighe = tab.filter((x, i) => !(i === sepIdx && sepIdx >= 0) && !(intest && i === 0));
    out += '<table class="d-tabella">' + (intest ? '<thead><tr>' + intest.map(c => '<th>' + inlineDocumentoHtml(c, false) + '</th>').join('') + '</tr></thead>' : '') +
      '<tbody>' + corpoRighe.map(x => '<tr>' + celle(x).map(c => '<td>' + inlineDocumentoHtml(c, false) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    tab = null;
  };
  righe.forEach((r) => {
    let m;
    if (!ed && /^\s*\|.*\|\s*$/.test(r)) { chiudiUl(); (tab = tab || []).push(r); return; }
    if (tab) chiudiTab();
    if ((m = IMG_RIGA_RE.exec(r))) { chiudiUl(); out += immagineDocumentoHtml(m[1], Number(m[2]), m[3], ed); return; }
    if (ed && /^\s*\|.*\|\s*$/.test(r)) { chiudiUl(); out += '<div class="d-riga d-tab' + (/^\s*\|?[\s:|-]+\|?\s*$/.test(r) ? ' sep' : '') + '">' + inlineDocumentoHtml(r, true) + '</div>'; return; }
    if ((m = /^- (.*)$/.exec(r))) {
      if (!inUl) { out += '<ul>'; inUl = true; }
      out += '<li>' + inlineDocumentoHtml(m[1], ed) + '</li>';
      return;
    }
    chiudiUl();
    if (r.trim() === '') { out += ed ? '<div class="d-riga"><br></div>' : '<div style="height:.7em"></div>'; return; }
    if (r.trim() === '---') { out += '<hr>'; return; }
    if ((m = /^# (.*)$/.exec(r))) { out += '<h1>' + inlineDocumentoHtml(m[1], ed) + '</h1>'; return; }
    if ((m = /^## (.*)$/.exec(r))) { out += '<h2>' + inlineDocumentoHtml(m[1], ed) + '</h2>'; return; }
    if ((m = /^\^\^ (.*)$/.exec(r))) { out += '<div class="d-riga" style="text-align:center">' + inlineDocumentoHtml(m[1], ed) + '</div>'; return; }
    /* Impaginazione "lettera" (copiata dal Word dello studio): "|> " blocco rientrato a destra (destinatario),
       "<> " paragrafo giustificato, "<>> " giustificato con rientro della prima riga, "a) " voce di elenco con rientro sporgente. */
    if ((m = /^\|> (.*)$/.exec(r))) { out += '<div class="d-riga" style="margin-left:55%">' + inlineDocumentoHtml(m[1], ed) + '</div>'; return; }
    if ((m = /^<>> (.*)$/.exec(r))) { out += '<div class="d-riga" style="text-align:justify;text-indent:1.25cm">' + inlineDocumentoHtml(m[1], ed) + '</div>'; return; }
    if ((m = /^<> (.*)$/.exec(r))) { out += '<div class="d-riga" style="text-align:justify">' + inlineDocumentoHtml(m[1], ed) + '</div>'; return; }
    if ((m = /^([a-z]\)) (.*)$/.exec(r))) {
      const stile = 'text-align:justify;padding-left:2.4em;text-indent:-2.4em';
      out += ed ? '<div class="d-riga" data-lett="1" style="' + stile + '">' + inlineDocumentoHtml(r, true) + '</div>'
        : '<div class="d-riga" style="' + stile + '"><span style="display:inline-block;width:2.4em;text-indent:0">' + m[1] + '</span>' + inlineDocumentoHtml(m[2], false) + '</div>';
      return;
    }
    if ((m = /^>> (.*)$/.exec(r))) { out += '<div class="d-riga" style="text-align:right">' + inlineDocumentoHtml(m[1], ed) + '</div>'; return; }
    if (!ed && eRigaTitoloMaiuscolo(r)) { out += '<h2>' + inlineDocumentoHtml(r.trim(), false) + '</h2>'; return; }
    out += '<div class="d-riga">' + inlineDocumentoHtml(r, ed) + '</div>';
  });
  chiudiUl(); if (tab) chiudiTab();
  return out;
}
/* HTML dell'editor -> testo marcato. */
function editorDocumentoToTesto(root) {
  const righe = [];
  const inline = (n) => {
    if (n.nodeType === 3) return n.nodeValue.replace(/ /g, ' ');
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (n.classList && n.classList.contains('campo-chip')) return '{{' + n.getAttribute('data-chiave') + '}}';
    if (tag === 'BR') return '\n';
    const dentro = Array.from(n.childNodes).map(inline).join('');
    const stile = (n.getAttribute('style') || '').toLowerCase();
    const grassetto = tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(stile);
    const corsivo = tag === 'I' || tag === 'EM' || /font-style:\s*italic/.test(stile);
    let r = dentro;
    if (r.trim() === '') return r;
    if (grassetto) r = '**' + r.trim() + '**';
    if (corsivo) r = '*' + r.trim() + '*';
    return r;
  };
  const allineamento = (n) => {
    if (n.getAttribute && n.getAttribute('data-lett')) return '';
    if (n.style && n.style.marginLeft === '55%') return '|> ';
    const a = ((n.style && n.style.textAlign) || n.getAttribute('align') || '').toLowerCase();
    if (a === 'justify') return (n.style && n.style.textIndent === '1.25cm') ? '<>> ' : '<> ';
    return a === 'center' ? '^^ ' : (a === 'right' ? '>> ' : '');
  };
  const blocco = (n) => {
    if (n.nodeType === 3) { const t = n.nodeValue.replace(/ /g, ' '); t.split('\n').forEach(x => righe.push(x)); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (n.classList && n.classList.contains('d-img')) { righe.push('[[img:' + n.getAttribute('data-img') + '|' + (n.getAttribute('data-w') || '50') + '|' + (n.getAttribute('data-al') || 'center') + ']]'); return; }
    if (tag === 'UL' || tag === 'OL') { Array.from(n.children).forEach(li => righe.push('- ' + inline(li).replace(/\n/g, ' ').trim())); return; }
    if (tag === 'HR') { righe.push('---'); return; }
    if (tag === 'H1' || tag === 'H2') { righe.push((tag === 'H1' ? '# ' : '## ') + inline(n).replace(/\n/g, ' ').trim()); return; }
    if (tag === 'DIV' || tag === 'P') {
      const figliBlocco = Array.from(n.children).some(c => ['DIV', 'P', 'UL', 'OL', 'H1', 'H2', 'HR'].includes(c.tagName));
      if (figliBlocco) { Array.from(n.childNodes).forEach(blocco); return; }
      let t = inline(n);
      if (t === '\n') t = ''; // riga vuota = <div><br></div>
      const pre = allineamento(n);
      t.split('\n').forEach((x, i) => righe.push(i === 0 ? (x.trim() === '' ? '' : pre + x) : x));
      return;
    }
    righe.push(inline(n));
  };
  Array.from(root.childNodes).forEach(blocco);
  while (righe.length && righe[righe.length - 1].trim() === '') righe.pop();
  return righe.join('\n');
}
function testoDocumentoSenzaMarcatura(testo) {
  const eTab = (r) => /^\s*\|.*\|\s*$/.test(r);
  const eSep = (r) => eTab(r) && /^[\s|:-]+$/.test(r) && r.indexOf('-') >= 0;
  return String(testo || '').split('\n')
    .filter(r => !IMG_RIGA_RE.test(r) && !eSep(r))
    .map(r => eTab(r) ? r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()).join('   ') : r)
    .map(r => r.replace(/^(#{1,2} |- |\^\^ |>> |\|> |<>> |<> )/, '').replace(/^---$/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1$2'))
    .join('\n');
}
/* Barra strumenti + foglio + pannello campi. id: id dell'elemento editabile. */
const CAMPI_PERSONALIZZATI_SUGGERITI = ['dettaglioAttivita', 'condizioniPagamento', 'gradoComplessita', 'regimeIva', 'durataIncarico', 'dataInizioIncarico', 'modalitaFatturazione'];
function campiPersonalizzatiNoti(testoCorrente) {
  const auto = new Set(PLACEHOLDER_AUTO_LEGENDA.map(x => x.chiave).concat(PLACEHOLDER_RISERVATI));
  const set = new Set(CAMPI_PERSONALIZZATI_SUGGERITI);
  (STATE.modelliDocumento || []).forEach(m => estraiPlaceholder(m.corpo).forEach(k => set.add(k)));
  estraiPlaceholder(testoCorrente).forEach(k => set.add(k));
  return Array.from(set).filter(k => !auto.has(k)).sort((a, b) => etichettaCampoDocumento(a).localeCompare(etichettaCampoDocumento(b)));
}
function editorDocumentoHtml(id, testo, conCampi) {
  const btn = (cmd, label, titolo) => `<button type="button" onmousedown="event.preventDefault()" data-action="doc-fmt" data-cmd="${cmd}" title="${titolo}">${label}</button>`;
  const gruppi = [
    ['Cliente', PLACEHOLDER_AUTO_LEGENDA.filter(x => x.chiave.startsWith('cliente.'))],
    ['Studio', PLACEHOLDER_AUTO_LEGENDA.filter(x => x.chiave.startsWith('studio.'))],
    ['Data', PLACEHOLDER_AUTO_LEGENDA.filter(x => x.chiave.startsWith('data.'))],
    ['Dati del documento', PLACEHOLDER_RISERVATI.map(k => ({ chiave: k, label: etichettaCampoDocumento(k) }))],
    ['Campi da compilare già usati nei modelli', campiPersonalizzatiNoti(testo).map(k => ({ chiave: k, label: etichettaCampoDocumento(k) }))],
  ].filter(([, lista]) => lista.length);
  const pannelloCampi = conCampi ? `<details class="doc-campi" open>
      <summary>＋ Inserisci un campo (si compila da solo)</summary>
      <div class="doc-campi-corpo">
        ${gruppi.map(([tit, lista]) => `<div class="doc-campi-gruppo"><div class="tit">${tit}</div>${lista.map(x => `<button type="button" class="chip-btn" onmousedown="event.preventDefault()" data-action="doc-campo" data-chiave="${x.chiave}" title="${escapeHtml(x.label)}">${escapeHtml(etichettaCampoDocumento(x.chiave))}</button>`).join('')}</div>`).join('')}
        <div class="doc-campi-gruppo"><div class="tit">Campo da compilare ogni volta</div>
          <input type="text" id="docNuovoCampoNome" placeholder="es. Data inizio incarico" style="flex:1;min-width:180px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:13px;">
          <button type="button" class="btn small" data-action="doc-campo-nuovo">Aggiungi campo</button>
        </div>
      </div>
    </details>` : '';
  return `<div class="doc-toolbar">
      ${btn('bold', '<b>G</b>', 'Grassetto')}${btn('italic', '<i>C</i>', 'Corsivo')}<span class="sep"></span>
      ${btn('h1', 'Titolo', 'Titolo del documento')}${btn('h2', 'Sezione', 'Titolo di sezione')}${btn('p', 'Testo', 'Testo normale')}<span class="sep"></span>
      ${btn('ul', '• Elenco', 'Elenco puntato')}<span class="sep"></span>
      ${btn('left', '⇤', 'Allinea a sinistra')}${btn('center', '↔', 'Centra')}${btn('right', '⇥', 'Allinea a destra')}<span class="sep"></span>
      ${btn('tabella', '▦ Tabella', 'Inserisci una tabella (righe che iniziano con |)')}${btn('linea', '― Linea', 'Linea di separazione')}
      <label title="Inserisci un'immagine (logo, firma, timbro)" style="cursor:pointer;"><span class="btn small" style="pointer-events:none;">🖼 Immagine</span><input type="file" accept="image/*" data-action="doc-img-file" style="display:none;"></label>
    </div>
    <div class="doc-sfondo"><div class="doc-foglio doc-editor" id="${id}" contenteditable="true" spellcheck="true">${testoDocumentoToHtml(testo, 'editor')}</div></div>
    ${pannelloCampi}`;
}
let DOC_RANGE = null;
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection && window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const nodo = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  const ed = nodo && nodo.closest && nodo.closest('.doc-editor');
  if (ed) DOC_RANGE = { ed, range: sel.getRangeAt(0).cloneRange() };
});
function docEditorAttivo() {
  return (DOC_RANGE && document.body.contains(DOC_RANGE.ed)) ? DOC_RANGE.ed : document.querySelector('.doc-editor');
}
function docEseguiComando(cmd) {
  const ed = docEditorAttivo();
  if (!ed) return;
  ed.focus();
  if (DOC_RANGE && DOC_RANGE.ed === ed) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(DOC_RANGE.range); }
  const mappa = { bold: ['bold'], italic: ['italic'], ul: ['insertUnorderedList'], left: ['justifyLeft'], center: ['justifyCenter'], right: ['justifyRight'], h1: ['formatBlock', 'h1'], h2: ['formatBlock', 'h2'], p: ['formatBlock', 'div'] };
  if (cmd === 'tabella' || cmd === 'linea') {
    const html = cmd === 'linea' ? '<hr><div class="d-riga"><br></div>' : '<div class="d-riga d-tab">| Descrizione | Dettaglio | Importo (€) |</div><div class="d-riga d-tab sep">|---|---|---|</div><div class="d-riga d-tab">| Voce 1 | | |</div><div class="d-riga d-tab">| Voce 2 | | |</div><div class="d-riga"><br></div>';
    if (!(document.execCommand && document.execCommand('insertHTML', false, html))) ed.insertAdjacentHTML('beforeend', html);
    return;
  }
  const c = mappa[cmd];
  if (c && document.execCommand) document.execCommand(c[0], false, c[1] || null);
}
function docInserisciImmagineId(idImg) {
  const ed = docEditorAttivo(); if (!ed) return;
  const html = immagineDocumentoHtml(idImg, 50, 'center', true) + '<div class="d-riga"><br></div>';
  ed.focus();
  if (DOC_RANGE && DOC_RANGE.ed === ed) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(DOC_RANGE.range); }
  if (!(document.execCommand && document.execCommand('insertHTML', false, html))) ed.insertAdjacentHTML('beforeend', html);
}
/* Ridimensiona a max 900px e comprime, così il documento resta leggero. */
function caricaImmagineNelDocumento(file) {
  if (!file || !/^image\//.test(file.type)) { toast('Scegli un file immagine.'); return; }
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / img.width);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = file.type === 'image/png';
      docInserisciImmagineId(registraImmagineDocumento(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85), c.width, c.height));
    };
    img.onerror = () => toast('Immagine non leggibile.', true);
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function docImmagineOperazione(blocco, op) {
  if (!blocco) return;
  let w = Number(blocco.getAttribute('data-w')) || 50;
  if (op === 'del') { blocco.remove(); return; }
  if (op === 'piu') w = Math.min(100, w + 15); else if (op === 'meno') w = Math.max(10, w - 15);
  else if (['left', 'center', 'right'].includes(op)) { blocco.setAttribute('data-al', op); blocco.style.textAlign = op; }
  blocco.setAttribute('data-w', String(w));
  const wrap = blocco.querySelector('.img-wrap'); if (wrap) wrap.style.width = w + '%';
}
function docInserisciCampo(chiave) {
  const ed = docEditorAttivo();
  if (!ed) return;
  ed.focus();
  if (DOC_RANGE && DOC_RANGE.ed === ed) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(DOC_RANGE.range); }
  const html = chipCampoHtml(chiave) + '&nbsp;';
  if (document.execCommand && document.execCommand('insertHTML', false, html)) return;
  ed.insertAdjacentHTML('beforeend', html);
}

/* Modelli "strutturati" (ricerca su facsimile ODCEC/CNDCEC: oggetto, grado di complessità e oneri,
   compenso a voci, recesso, polizza RC, privacy, antiriciclaggio, firme). Non duplicano l'intestazione
   dello studio: la mette già la carta intestata in stampa/PDF. Si aggiungono con un pulsante, senza
   toccare i modelli esistenti. */
function modelliBaseStrutturati() {
  const mk = (categoria, nome, corpo, stile) => ({ id: uid('mod'), categoria, nome, corpo, attivo: true, predefinito: false, creatoIl: oggiISO(), stile });
  return [
    /* Copia della struttura del Word dello studio (preventivo costituzione associazione): destinatario rientrato,
       data, oggetto, saluto, introduzione giustificata, elenco a) b) c) con titolo in grassetto, corrispettivo, formula di chiusura. */
    mk('Preventivo', 'Preventivo', `|> {{appellativo}}
|> **{{cliente.ragioneSociale}}**


{{data.luogoOggiEsteso}}


**Oggetto**: proposta di {{oggetto}}


Gentile {{saluto}},
<>> riscontriamo la Vostra cortese richiesta di formulazione di una proposta per {{richiesta}}, riportando di seguito la descrizione delle attività oggetto del preventivo e necessarie per il corretto assolvimento degli adempimenti richiesti dalle norme vigenti:
{{elencoModuli}}

<> Il corrispettivo per le attività oggetto dell'incarico ammonta a {{importo}} euro.

<> Tutti gli importi devono intendersi al netto di Iva e contributo Cassa Previdenza del 4%.

Con i migliori saluti
{{firmatario}}`, 'lettera'),
    mk('Preventivo', 'Preventivo strutturato (a voci)', `>> {{data.luogoOggi}}

**Spett.le**
**{{cliente.ragioneSociale}}**
{{cliente.indirizzo}}
P.IVA {{cliente.piva}} – C.F. {{cliente.codiceFiscale}}

**Oggetto:** preventivo per prestazioni professionali – {{oggetto}}

Egregio Cliente,
in adempimento degli obblighi informativi sul compenso professionale (art. 9, D.P.R. 137/2012) Le sottoponiamo il preventivo relativo all'incarico in oggetto.

## 1. Prestazioni oggetto dell'incarico
{{dettaglioAttivita}}

## 2. Compenso
| Descrizione | Periodicità | Compenso (€) |
|---|---|---|
| {{voce1Descrizione}} | {{voce1Periodicita}} | {{voce1Compenso}} |
| {{voce2Descrizione}} | {{voce2Periodicita}} | {{voce2Compenso}} |
| **Totale** | | **{{importo}}** |

{{regimeIva}}

## 3. Grado di complessità e oneri ipotizzabili
{{gradoComplessita}}

## 4. Condizioni di pagamento
{{condizioniPagamento}}

## 5. Assicurazione professionale
Il professionista è coperto da polizza di responsabilità civile professionale: {{studio.polizza}}

## 6. Validità
La presente proposta è valida fino al {{validoFino}}.

## 7. Accettazione
Per accettazione, il Cliente restituisce copia firmata del presente documento.

| Il Professionista | Per accettazione, il Cliente |
|---|---|
| {{studio.nome}} | {{cliente.ragioneSociale}} |
| | |
| ______________________ | ______________________ |

Luogo e data: ____________________`),
    mk('Lettera di incarico', 'Lettera di incarico strutturata', `>> {{data.luogoOggi}}

**Spett.le**
**{{cliente.ragioneSociale}}**
{{cliente.indirizzo}}
P.IVA {{cliente.piva}} – C.F. {{cliente.codiceFiscale}}

# LETTERA DI INCARICO PROFESSIONALE
^^ {{oggetto}}

## Art. 1 – Oggetto
Il Cliente conferisce a {{studio.nome}} ({{studio.iscrizione}}), di seguito "Professionista", l'incarico di svolgere le seguenti attività:

{{dettaglioAttivita}}

L'incarico è limitato alle attività descritte; eventuali ulteriori prestazioni saranno oggetto di separato accordo.

## Art. 2 – Durata
{{durataIncarico}}

## Art. 3 – Compenso
Il compenso è pari a € {{importo}}. {{regimeIva}}

{{condizioniPagamento}}

## Art. 4 – Obblighi del Cliente
- fornire tempestivamente la documentazione necessaria e comunicare ogni variazione rilevante;
- collaborare con il Professionista e rispondere alle richieste di integrazione;
- fornire le informazioni richieste per l'adeguata verifica ai sensi del D.Lgs. 231/2007.

## Art. 5 – Responsabilità e polizza
Il Professionista opera con la diligenza richiesta dalla natura dell'attività (art. 2236 c.c.). Estremi della polizza RC professionale: {{studio.polizza}}

## Art. 6 – Recesso
Ciascuna parte può recedere con comunicazione scritta (PEC o raccomandata) e preavviso di 15 giorni. Resta dovuto il compenso per l'attività già svolta. Il Professionista può recedere con effetto immediato nei casi previsti dalla normativa antiriciclaggio.

## Art. 7 – Codice deontologico e strumenti di intelligenza artificiale
Il Professionista opera nel rispetto del Codice deontologico dei dottori commercialisti e degli esperti contabili, che il Cliente può consultare e che disciplina i diritti e i doveri reciproci. Lo studio può avvalersi di strumenti di intelligenza artificiale come supporto ad attività di analisi, ricerca e organizzazione; le valutazioni, i pareri e le scelte professionali restano sempre di esclusiva responsabilità del Professionista.

## Art. 8 – Trattamento dei dati personali
I dati sono trattati esclusivamente per l'esecuzione dell'incarico e gli obblighi di legge, ai sensi del Reg. UE 2016/679. Titolare: {{studio.nome}} – {{studio.pec}}.

## Art. 9 – Foro competente
Per ogni controversia è competente il Foro di {{studio.citta}}.

| Il Professionista | Il Cliente |
|---|---|
| {{studio.nome}} | {{cliente.ragioneSociale}} |
| | |
| ______________________ | ______________________ |

Luogo e data: ____________________`),
    mk('Lettera di incarico', 'Lettera di rinuncia / cessazione dell\'incarico', `>> {{data.luogoOggi}}

**Spett.le**
**{{cliente.ragioneSociale}}**
{{cliente.indirizzo}}

**Oggetto:** {{oggetto}}

Con la presente, in forma scritta e con congruo anticipo, Le comunichiamo che l'incarico professionale conferito a {{studio.nome}} cesserà con effetto dal ____________________.

Fino a tale data lo studio proseguirà le attività in corso e porterà a termine gli adempimenti la cui scadenza cade entro la data di cessazione. Per gli adempimenti successivi, o che avete deciso di affidare al nuovo professionista, Le chiediamo di comunicarci il nominativo del collega subentrante, al quale metteremo a disposizione, previa Sua autorizzazione, la documentazione e le informazioni necessarie per il passaggio di consegne.

Restano dovuti i compensi per l'attività già svolta.

Cordiali saluti.

**{{studio.nome}}**
{{studio.pec}}`),
  ];
}
function aggiungiModelliBaseStrutturati() {
  const esistenti = new Set((STATE.modelliDocumento || []).map(m => m.nome));
  const nuovi = modelliBaseStrutturati().filter(m => !esistenti.has(m.nome));
  nuovi.forEach(m => STATE.modelliDocumento.push(m));
  if (nuovi.length) salvaStato();
  return nuovi.length;
}
function renderModelliDocumento() {
  const modelli = STATE.modelliDocumento;
  const intro = `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;flex-wrap:wrap;"><button class="btn" data-action="setup-vai" data-imp="studio" data-nav="impostazioni" title="Carica il logo e imposta il piè di pagina che compaiono nei documenti">🖼 Logo e piè di pagina</button><button class="btn" data-action="modelli-base-strutturati" title="Aggiunge un preventivo a voci e una lettera di incarico completi di tabella compensi, polizza, recesso, privacy">+ Aggiungi modelli base strutturati</button><button class="btn primary" data-action="nuovo-modello">+ Nuovo modello</button></div>`;
  if (modelli.length === 0) {
    return intro + `<div class="card"><div class="empty"><div class="big">Nessun modello ancora</div>Crea un modello per Preventivi, Mandati o documenti Antiriciclaggio: scrivi il testo con segnaposto {{così}}. Quelli automatici (dati cliente/studio/data) si compilano da soli, gli altri diventano campi da compilare a ogni documento.</div></div>`;
  }
  const categorie = Array.from(new Set(modelli.map(m => m.categoria))).sort((a,b) => a.localeCompare(b));
  const gruppi = categorie.map(cat => {
    const modelliCat = modelli.filter(m => m.categoria === cat).sort((a,b) => (b.predefinito?1:0) - (a.predefinito?1:0) || a.nome.localeCompare(b.nome));
    const righe = modelliCat.map(m => {
      return `<div class="card" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${escapeHtml(m.nome)} ${m.predefinito?'<span class="badge stato-inviato-telematicamente">Predefinito</span>':''} ${!m.attivo?'<span class="badge stato-errore">Disattivato</span>':''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn small" data-action="modifica-modello" data-id="${m.id}">Modifica</button>
            <button class="btn small" data-action="duplica-modello" data-id="${m.id}">Duplica</button>
            <button class="btn small danger" data-action="elimina-modello" data-id="${m.id}">Elimina</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div class="section-title" style="margin-top:18px;">${escapeHtml(cat)}${categoriaEAml(cat) ? ' <span class="helptext" style="font-weight:400;">— compare nel fascicolo Antiriciclaggio del cliente</span>' : ''}</div>${righe}`;
  }).join('');
  return intro + gruppi + renderModuliPreventivo();
}
function renderModuliPreventivo() {
  const moduli = STATE.moduliPreventivo || [];
  const righe = moduli.map(m => `<div class="card" style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
    <div><div style="font-weight:600;">${escapeHtml(m.nome)}</div></div>
    <div style="display:flex;gap:6px;"><button class="btn small" data-action="modulo-prev-modifica" data-id="${m.id}">Modifica</button><button class="btn small" data-action="modulo-prev-duplica" data-id="${m.id}">Duplica</button><button class="btn small danger" data-action="modulo-prev-elimina" data-id="${m.id}">Elimina</button></div></div></div>`).join('');
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:26px;"><div class="section-title" style="margin:0;">Moduli dei preventivi</div><button class="btn primary" data-action="modulo-prev-nuovo">+ Nuovo modulo</button></div>
    <div class="helptext" style="margin:4px 0 10px;">Tutti i preventivi usano lo stesso modello. Ogni modulo è una tipologia di incarico (es. costituzione associazione): scegli uno o più moduli quando crei il preventivo e le loro attività entrano nel testo.</div>
    ${righe || '<div class="card"><div class="empty">Nessun modulo ancora.</div></div>'}`;
}
function modalModuloPreventivo(id) {
  const m = id ? (STATE.moduliPreventivo || []).find(x => x.id === id) : null;
  const att = m ? m.attivita.map(a => a.titolo + (a.descrizione ? ': ' + a.descrizione : '')).join('\n') : '';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:680px;">
    <div style="display:flex;justify-content:space-between;"><h2>${m ? 'Modifica modulo' : 'Nuovo modulo'}</h2><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <div class="grid2">
      <div class="field full" style="grid-column:1/-1;"><label>Nome del modulo *</label><input id="mpNome" value="${escapeHtml(m ? m.nome : '')}" placeholder="es. Costituzione associazione"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Oggetto del preventivo (dopo "proposta di")</label><input id="mpOggetto" value="${escapeHtml(m ? m.oggetto : '')}" placeholder="es. costituzione dell'Associazione"></div>
      <div class="field full" style="grid-column:1/-1;"><label>Frase della richiesta (dopo "formulazione di una proposta per")</label><input id="mpRichiesta" value="${escapeHtml(m ? m.richiesta : '')}" placeholder="es. la costituzione dell'associazione"></div>
      <div class="field"><label>Compenso suggerito (€, opzionale)</label><input type="number" step="0.01" id="mpCompenso" value="${m && m.compenso != null ? m.compenso : ''}"></div>
    </div>
    <div class="field full" style="margin-top:8px;"><label>Attività (una per riga: <b>Titolo: descrizione</b>)</label><textarea id="mpAttivita" rows="9" style="width:100%;">${escapeHtml(att)}</textarea></div>
    <div class="helptext">Nel preventivo diventano le voci a) b) c) con il titolo in grassetto.</div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="modulo-prev-salva" data-id="${m ? m.id : ''}">Salva</button></div></div></div>`;
}

/* Un solo modale per creare E modificare, stesso pattern di modalPreventivo/modalF24. La
   categoria è testo libero (con datalist di suggerimenti) invece di un elenco fisso: un modello
   antiriciclaggio nuovo basta farlo iniziare per "AML" per comparire automaticamente nel fascicolo
   cliente invece che tra Preventivi e mandati (vedi categoriaEAml). */
// Task #175: converte il testo del modello in HTML con i segnaposto {{così}} evidenziati - usata
// sia per il backdrop dell'editor (modalModelloDocumento) sia, potenzialmente, altrove in futuro
// per mostrare un'anteprima colorata senza duplicare la regex di risolviTemplateDocumento.
function evidenziaSegnaposto(testo) {
  return escapeHtml(testo || '').replace(/\{\{([^{}\n]*)\}\}/g, '<mark>{{$1}}</mark>');
}
function modalModelloDocumento(id) {
  const editing = id ? STATE.modelliDocumento.find(x => x.id === id) : null;
  if (id && !editing) { toast('Modello non trovato.'); return; }
  const categorieEsistenti = Array.from(new Set(CATEGORIE_MODELLO_BASE.concat(STATE.modelliDocumento.map(m => m.categoria))));
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:860px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica modello':'Nuovo modello documento'}</h2><div class="modal-sub">Scrivi il documento come in Word: i campi (nome cliente, studio, data...) si inseriscono con un clic e si compilano da soli.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formModello" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Categoria *</label><input id="modCategoria" list="modCategorieList" value="${editing?escapeHtml(editing.categoria):''}" placeholder="es. Preventivo, AML - Dichiarazione cliente">
          <datalist id="modCategorieList">${categorieEsistenti.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></div>
          <div class="field"><label>Nome modello *</label><input id="modNome" value="${editing?escapeHtml(editing.nome):''}" placeholder="es. Preventivo standard"></div>
        </div>
        <div class="field full" style="grid-column:1/-1;margin-top:10px;">
          <label>Testo del modello * <span style="font-weight:400;color:var(--text-mut);">— scrivi direttamente sul foglio; i campi colorati si compilano da soli quando crei il documento</span></label>
          ${editorDocumentoHtml('modCorpo', editing ? editing.corpo : '', true)}
        </div>
        <div class="grid2" style="margin-top:14px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="modAttivo" ${(!editing || editing.attivo)?'checked':''}> Attivo (selezionabile quando si crea un documento)</label>
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="modPredefinito" ${editing&&editing.predefinito?'checked':''}> Predefinito per questa categoria</label>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-modello" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Crea modello'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

