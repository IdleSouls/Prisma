'use strict';
/* -------------------- RENDER: PREVENTIVI E MANDATI (task #121, rifatto su modelli #125) --------------------
   Documento generato da un modello (vedi motore modelli sopra): entità in array e legata al
   cliente via clienteId diretto, esattamente come documenti/comunicazioni/F24/taskTeam —
   filtrabile/eliminabile con .filter(clienteId !== id) dentro eliminaCliente. Questa vista mostra
   SOLO le categorie non-AML (Preventivo/Mandato professionale/Lettera di incarico/personalizzate);
   i documenti con categoria che inizia per "AML" vivono invece nel fascicolo Antiriciclaggio del
   cliente (vedi renderAntiriciclaggio) pur condividendo esattamente lo stesso STATE.preventivi,
   lo stesso motore di generazione e le stesse azioni (apri/modifica/elimina/stampa/esporta). */
const STATI_PREVENTIVO = ['Bozza', 'Inviato', 'Accettato', 'Rifiutato'];
let PREV_FILTRO = { cliente: 'Tutti', categoria: 'Tutti', stato: 'Tutti', soloPotenziali: false };

/* Apre una finestra separata con il documento pronto per la stampa: window.print() richiede un
   vero contesto browser (non implementato in jsdom, quindi mai testabile end-to-end) — avvolto in
   try/catch perché in ambienti dove i popup sono bloccati o print() non è disponibile il documento
   deve comunque restare aperto e leggibile/stampabile a mano dall'utente, non far fallire silenziosamente. */

/* Carta intestata + corpo tipografico per stampa/PDF (task #223). Se il modello ha già in testa
   un blocco con il nome dello studio (tutti i modelli precedenti) quel blocco viene sostituito
   dall'intestazione grafica, per non duplicarlo. */
function intestazioneStudioHtml() {
  const m = STATE.meta;
  const logo = m.logoStudio ? `<img src="${m.logoStudio}" alt="" style="max-width:150px;max-height:64px;">` : '';
  const dati = `<div style="font-size:15px;font-weight:700;letter-spacing:.02em;">${escapeHtml(m.studioNome || '')}</div>
    <div style="font-size:11.5px;color:#4a5163;line-height:1.5;">${[m.iscrizione, m.indirizzoStudio, m.cfStudio ? 'C.F. ' + m.cfStudio : ''].filter(Boolean).map(escapeHtml).join('<br>')}</div>`;
  const pos = m.logoPosizione || 'sinistra';
  const contenuto = logo
    ? (pos === 'centro' ? `<div style="text-align:center;">${logo}<div style="margin-top:6px;">${dati}</div></div>`
      : `<div style="display:flex;gap:16px;align-items:center;${pos === 'destra' ? 'flex-direction:row-reverse;text-align:right;' : ''}">${logo}<div>${dati}</div></div>`)
    : `<div>${dati}</div>`;
  return `<div style="border-bottom:2px solid #1F3A6E;padding-bottom:10px;margin-bottom:22px;">${contenuto}</div>`;
}
function togliBloccoIntestazioneVecchio(testo) {
  const righe = String(testo || '').split('\n');
  const nome = (STATE.meta.studioNome || '').trim().toLowerCase();
  if (!nome) return testo;
  const primo = righe.findIndex(r => r.trim() !== '');
  if (primo !== 0 || righe[0].replace(/^(#{1,2} |\*\*|\^\^ )/, '').replace(/\*\*$/, '').trim().toLowerCase() !== nome) return testo;
  const fine = righe.findIndex(r => r.trim() === '');
  return fine === -1 ? testo : righe.slice(fine + 1).join('\n');
}
/* Impaginazione "lettera": copia il Word dello studio (logo al centro in alto, testo Calibri 10,5 pt giustificato,
   pie' di pagina con i recapiti). Si attiva dal modello (campo stile = 'lettera'). */
function documentoStampaLetteraHtml(p) {
  const m = STATE.meta;
  const corpo = testoDocumentoToHtml(p.corpo || '', 'lettura').replace(/height:\.7em/g, 'height:1.3em'); // riga vuota = una riga intera, come nel Word
  const testa = m.logoStudio ? `<img src="${m.logoStudio}" alt="" style="max-width:150px;max-height:70px;">` : `<div style="font-weight:700;font-size:15px;">${escapeHtml(m.studioNome || '')}</div>`;
  const pie = (m.piePagina || [m.studioNome, [m.indirizzoStudio, m.telefonoStudio, m.emailStudio].filter(Boolean).join(' | ')].filter(Boolean).join('\n')).split('\n').map(escapeHtml).join('<br>');
  return `<!DOCTYPE html><html><head><title>${escapeHtml(p.oggetto || p.categoria)}</title><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 20mm 26mm;}
    body{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.3;color:#000;max-width:760px;margin:30px auto;padding:0 24px 90px;}
    .testa{text-align:center;margin-bottom:60px;} .d-riga{min-height:0;} .campo-vuoto{background:#fff3cd;padding:0 3px;}
    ul{margin:4px 0 4px 22px;padding:0;} hr{border:none;border-top:1px solid #c9cfdd;margin:14px 0;}
    .pie{position:fixed;left:0;right:0;bottom:0;text-align:center;font-size:10.5px;line-height:1.35;color:#7a8394;padding:0 24px 8px;}
    img{max-width:100%;} @media print{body{margin:0;padding:0 0 60px;max-width:none;}}
  </style></head><body><div class="testa">${testa}</div>${corpo}<div class="pie">${pie}</div></body></html>`;
}
function documentoStampaHtml(p) {
  if (p.stile === 'lettera') return documentoStampaLetteraHtml(p);
  const corpo = testoDocumentoToHtml(togliBloccoIntestazioneVecchio(p.corpo || ''), 'lettura');
  return `<!DOCTYPE html><html><head><title>${escapeHtml(p.oggetto || p.categoria)}</title><meta charset="utf-8"><style>
    @page{size:A4;margin:18mm 18mm 20mm;}
    body{font-family:Georgia,'Times New Roman',serif;font-size:13.5px;line-height:1.65;color:#161B26;max-width:760px;margin:30px auto;padding:0 24px;}
    h1{font-size:20px;text-align:center;margin:0 0 12px;letter-spacing:.02em;}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 6px;border-bottom:1px solid #cfd5e3;padding-bottom:3px;page-break-after:avoid;}
    ul{margin:4px 0 4px 22px;padding:0;} hr{border:none;border-top:1px solid #c9cfdd;margin:14px 0;}
    .d-riga{min-height:0;} .campo-vuoto{background:#fff3cd;padding:0 3px;}
    table.d-tabella{width:100%;border-collapse:collapse;margin:10px 0;font-size:12.5px;page-break-inside:avoid;} table.d-tabella th,table.d-tabella td{border:1px solid #b9c1d3;padding:5px 9px;text-align:left;vertical-align:top;} table.d-tabella th{background:#eef2fa;}
    img{max-width:100%;}
    @media print{body{margin:0;padding:0;max-width:none;}}
  </style></head><body>${intestazioneStudioHtml()}${corpo}</body></html>`;
}
function apriStampaPreventivo(id) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) { toast('Documento non trovato.'); return; }
  const win = window.open('', '_blank');
  if (!win) { toast('Impossibile aprire la finestra di stampa (popup bloccato dal browser?).', true); return; }
  win.document.write(documentoStampaHtml(p));
  win.document.close();
  win.focus();
  try { win.print(); } catch (e) { /* il documento resta comunque aperto e stampabile manualmente */ }
}
/* Esporta il documento come file di testo scaricabile, riusando lo stesso meccanismo di
   salvaFileScaricabile() già usato per il backup — gestisce da sola sia il download da browser
   locale sia il salvataggio via capability quando la pagina gira come Artifact. */
async function esportaPreventivoFile(id) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) { toast('Documento non trovato.'); return; }
  const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const nomeFile = `${slug(p.categoria)}-${slug(nomeCliente(p.clienteId))}-${p.dataEmissione || oggiISO()}.txt`;
  try {
    const ok = await salvaFileScaricabile(nomeFile, new Blob([testoDocumentoSenzaMarcatura(p.corpo || '')], { type: 'text/plain;charset=utf-8;' }));
    if (ok) toast('Documento esportato.');
  } catch (err) {
    console.error('Esportazione documento non riuscita', err);
    alert('Impossibile esportare il documento in questo browser.');
  }
}
/* Esportazione in Word senza passare dal server locale/LibreOffice (task #138, "vorrei che si
   potesse aprire facilmente il file con word"): l'RTF è testo puro con un minimo di marcatori di
   formattazione, apribile e modificabile direttamente da Word/LibreOffice/Google Docs senza alcuna
   conversione — a differenza del .txt qui sopra, che perde ogni formattazione. Euristica di
   grassetto: la prima riga (di norma il nome dello studio) e le righe tutte in maiuscolo (i titoli
   di sezione nei modelli di Matteo sono scritti così, es. "CONDIZIONI GENERALI") diventano titoli
   in grassetto — non è un vero motore di stile, ma basta a rendere il documento leggibile subito
   senza dover reintrodurre grassetti a mano in Word. */
function escapeRtf(testo) {
  let out = '';
  for (const ch of (testo || '')) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (code > 126) out += '\\u' + code + '?';
    else out += ch;
  }
  return out;
}
function inlineRtf(riga) {
  const parti = String(riga).split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/);
  return parti.map(x => {
    if (/^\*\*[^*]+\*\*$/.test(x)) return `{\\b ${escapeRtf(x.slice(2, -2))}}`;
    if (/^\*[^*\n]+\*$/.test(x)) return `{\\i ${escapeRtf(x.slice(1, -1))}}`;
    return escapeRtf(x);
  }).join('');
}
function rtfImmagine(id, w, al) {
  const im = (STATE.immaginiDocumenti || {})[id];
  const m = im && /^data:image\/(png|jpeg);base64,(.+)$/.exec(im.d);
  if (!m || !im.w || !im.h) return '';
  const hex = Array.from(atob(m[2]), ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const gw = Math.round(9000 * w / 100), gh = Math.round(gw * im.h / im.w);
  return `{\\pard${al === 'center' ? '\\qc' : (al === 'right' ? '\\qr' : '')} {\\pict\\${m[1] === 'png' ? 'pngblip' : 'jpegblip'}\\picw${im.w}\\pich${im.h}\\picwgoal${gw}\\pichgoal${gh} ${hex}}\\par}`;
}
function generaRtfDaTesto(testo) {
  const righe = togliBloccoIntestazioneVecchio(testo || '').split('\n');
  const intest = [STATE.meta.studioNome, STATE.meta.iscrizione, STATE.meta.indirizzoStudio, STATE.meta.cfStudio ? 'C.F. ' + STATE.meta.cfStudio : ''].filter(Boolean);
  const testa = intest.map((r, i) => i === 0 ? `{\\pard\\b\\fs30 ${escapeRtf(r)}\\par}` : `{\\pard\\fs18 ${escapeRtf(r)}\\par}`).join('\n') + '\n{\\pard\\brdrb\\brdrs\\brdrw15\\par}';
  const corpo = righe.map((riga) => {
    let m;
    if ((m = /^# (.*)$/.exec(riga))) return `{\\pard\\qc\\b\\fs34 ${inlineRtf(m[1])}\\par}`;
    if ((m = /^## (.*)$/.exec(riga))) return `{\\pard\\sb200\\b\\fs24 ${inlineRtf(m[1].toUpperCase())}\\par}`;
    if ((m = /^- (.*)$/.exec(riga))) return `{\\pard\\fi-300\\li500 \\bullet\\tab ${inlineRtf(m[1])}\\par}`;
    if ((m = /^\^\^ (.*)$/.exec(riga))) return `{\\pard\\qc ${inlineRtf(m[1])}\\par}`;
    if ((m = /^>> (.*)$/.exec(riga))) return `{\\pard\\qr ${inlineRtf(m[1])}\\par}`;
    if ((m = /^\|> (.*)$/.exec(riga))) return `{\\pard\\li5000 ${inlineRtf(m[1])}\\par}`;
    if ((m = /^<>> (.*)$/.exec(riga))) return `{\\pard\\qj\\fi700 ${inlineRtf(m[1])}\\par}`;
    if ((m = /^<> (.*)$/.exec(riga))) return `{\\pard\\qj ${inlineRtf(m[1])}\\par}`;
    if ((m = /^([a-z]\)) (.*)$/.exec(riga))) return `{\\pard\\qj\\li500\\fi-500 ${escapeRtf(m[1])}\\tab ${inlineRtf(m[2])}\\par}`;
    if (riga.trim() === '---') return '{\\pard\\brdrb\\brdrs\\brdrw10\\par}';
    if ((m = IMG_RIGA_RE.exec(riga))) return rtfImmagine(m[1], Number(m[2]), m[3]);
    if (/^\s*\|.*\|\s*$/.test(riga)) {
      if (/^[\s|:-]+$/.test(riga) && riga.indexOf('-') >= 0) return '';
      return `{\\pard\\li200 ${riga.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => inlineRtf(c.trim())).join('\\tab ')}\\par}`;
    }
    if (eRigaTitoloMaiuscolo(riga)) return `{\\pard\\sb200\\b\\fs24 ${escapeRtf(riga.trim())}\\par}`;
    return `{\\pard ${inlineRtf(riga) || ' '}\\par}`;
  }).join('\n');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman Times New Roman;}}\\f0\\fs22\n${testa}\n${corpo}\n}`;
}
async function esportaPreventivoRtf(id) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) { toast('Documento non trovato.'); return; }
  const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const nomeFile = `${slug(p.categoria)}-${slug(nomeCliente(p.clienteId))}-${p.dataEmissione || oggiISO()}.rtf`;
  try {
    const ok = await salvaFileScaricabile(nomeFile, new Blob([generaRtfDaTesto(p.corpo || '')], { type: 'application/rtf' }));
    if (ok) toast('Documento esportato in formato Word (.rtf).');
  } catch (err) {
    console.error('Esportazione RTF non riuscita', err);
    alert('Impossibile esportare il documento in questo browser.');
  }
}

/* Rinnovo annuale dei mandati: clienti con contratto continuativo il cui ultimo preventivo/mandato accettato
   (o, in mancanza, la data di ingresso) risale a oltre 12 mesi fa → promemoria per adeguare il compenso. */
function mandatiDaRinnovare() {
  const oggi = oggiISO();
  return STATE.clienti.filter(c => clienteAttivo(c) && c.tipoRapporto === 'Contratto continuativo').map(c => {
    const date = (STATE.preventivi || []).filter(p => p.clienteId === c.id && p.stato === 'Accettato' && !categoriaEAml(p.categoria)).map(p => p.dataAccettazione || p.dataEmissione).filter(Boolean);
    const ultima = date.sort().pop() || c.dataIngresso || null;
    return { c, ultima, giorni: ultima ? giorniTra(ultima, oggi) : null };
  }).filter(x => x.giorni != null && x.giorni > 365).sort((a, b) => b.giorni - a.giorni);
}
function renderPreventivi() {
  const rin = mandatiDaRinnovare();
  const card = rin.length ? `<div class="card" style="margin-bottom:12px;"><div class="section-title">Mandati da rinnovare / compensi da adeguare <span class="cnt">${rin.length}</span></div>
    <div class="helptext" style="margin-bottom:6px;">Clienti con contratto continuativo senza un preventivo o mandato accettato da oltre 12 mesi.</div>
    ${rin.slice(0, 8).map(x => `<div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);"><span style="flex:1;">${escapeHtml(x.c.ragioneSociale)} <span class="helptext">· ultimo accordo ${fmtData(x.ultima)}</span></span><button class="btn small" data-action="nuovo-preventivo" data-cliente="${x.c.id}">Nuovo preventivo</button></div>`).join('')}${rin.length > 8 ? `<div class="helptext">…e altri ${rin.length - 8}</div>` : ''}</div>` : '';
  return card + renderPreventiviBase();
}
function renderPreventiviBase() {
  const tutti = STATE.preventivi.filter(p => !categoriaEAml(p.categoria));
  const accettati = tutti.filter(p => p.stato === 'Accettato');
  const inAttesa = tutti.filter(p => p.stato === 'Bozza' || p.stato === 'Inviato').length;
  const valoreAccettato = accettati.reduce((s,p) => s + (Number(p.importo)||0), 0);
  // Preventivi accettati che, in base alle attività scelte, richiedono un mandato collegato (vedi
  // catalogoAttivitaStudioDefault): il tasso di conversione dà a colpo d'occhio quanti sono già
  // stati seguiti dal mandato firmato e quanti restano ancora da chiudere.
  const daConvertire = tutti.filter(p => p.categoria === 'Preventivo' && p.stato === 'Accettato' && (p.attivitaScelte||[]).some(a => a.richiedeMandato));
  const convertiti = daConvertire.filter(p => p.mandatoGeneratoId).length;
  const tassoConversione = daConvertire.length ? Math.round(convertiti / daConvertire.length * 100) : null;

  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi completati"><div class="n">${tutti.length}</div><div class="l">TOTALE DOCUMENTI</div></div>
    <div class="kpi inscadenza"><div class="n">${inAttesa}</div><div class="l">IN ATTESA DI RISPOSTA</div></div>
    <div class="kpi futuri"><div class="n">${fmtEuro(valoreAccettato)}</div><div class="l">VALORE ACCETTATO</div></div>
    <div class="kpi completati"><div class="n">${tassoConversione != null ? tassoConversione + '%' : '—'}</div><div class="l">MANDATI GENERATI (${convertiti}/${daConvertire.length})</div></div>
  </div>`;

  const categorieDisponibili = Array.from(new Set(tutti.map(p => p.categoria))).sort((a,b)=>a.localeCompare(b));
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="prev-filtro-cliente">
      <option value="Tutti" ${PREV_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${PREV_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Categoria</label><select data-action="prev-filtro-categoria">
      <option value="Tutti" ${PREV_FILTRO.categoria==='Tutti'?'selected':''}>Tutte</option>
      ${categorieDisponibili.map(c=>`<option ${PREV_FILTRO.categoria===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Stato</label><select data-action="prev-filtro-stato">
      <option value="Tutti" ${PREV_FILTRO.stato==='Tutti'?'selected':''}>Tutti</option>
      ${STATI_PREVENTIVO.map(s=>`<option ${PREV_FILTRO.stato===s?'selected':''}>${s}</option>`).join('')}
    </select></div>
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="prev-filtro-potenziali" ${PREV_FILTRO.soloPotenziali ? 'checked' : ''}> Solo potenziali clienti</label></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn" data-action="nuovo-potenziale-apri">+ Preventivo a nuovo cliente</button> <button class="btn primary" data-action="nuovo-preventivo">+ Nuovo documento</button></div>
  </div>`;

  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>Preventivi e mandati sono sempre legati a un'anagrafica cliente.</div></div>`;
  }
  const modelliAttivi = STATE.modelliDocumento.filter(m => m.attivo && !categoriaEAml(m.categoria));
  if (modelliAttivi.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Nessun modello attivo</div>Prima di creare un documento serve almeno un modello (Preventivo, Mandato professionale, Lettera di incarico...).<div style="margin-top:12px;"><button class="btn primary" data-action="vai-modelli">Vai a Modelli documenti →</button></div></div></div>`;
  }
  if (tutti.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun preventivo o mandato</div>Crea un documento da uno dei modelli configurati in "Modelli documenti".</div></div>`;
  }

  let lista = tutti.slice().sort((a,b) => (b.dataEmissione||'').localeCompare(a.dataEmissione||''));
  if (PREV_FILTRO.cliente !== 'Tutti') lista = lista.filter(p => p.clienteId === PREV_FILTRO.cliente);
  if (PREV_FILTRO.categoria !== 'Tutti') lista = lista.filter(p => p.categoria === PREV_FILTRO.categoria);
  if (PREV_FILTRO.stato !== 'Tutti') lista = lista.filter(p => p.stato === PREV_FILTRO.stato);
  if (PREV_FILTRO.soloPotenziali) lista = lista.filter(p => { const c = clienteById(p.clienteId); return c && c.stato === 'potenziale'; });
  if (lista.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty">Nessun documento corrisponde ai filtri.</div></div>`;
  }

  const pag = paginaLista('preventivi', lista);
  const righe = pag.pagina.map(p => `<tr>
      <td>${escapeHtml(nomeCliente(p.clienteId))}</td>
      <td><span class="badge info">${escapeHtml(p.categoria)}</span></td>
      <td>${escapeHtml(p.oggetto||'')}</td>
      <td>${p.importo != null ? fmtEuro(p.importo) : '—'}</td>
      <td style="white-space:nowrap;">${fmtDataBreve(p.dataEmissione)}</td>
      <td><span class="badge ${classeDocumentoStato(p.stato)}">${escapeHtml(p.stato)}</span></td>
      <td style="white-space:nowrap;"><button class="btn small" data-action="apri-preventivo" data-id="${p.id}">Apri</button> <button class="btn small danger" data-action="elimina-preventivo" data-id="${p.id}">Elimina</button></td>
    </tr>`).join('');

  return kpi + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Cliente</th><th>Categoria</th><th>Oggetto</th><th>Importo</th><th>Emesso il</th><th>Stato</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

/* Un solo modale per creare E modificare (id assente/presente), stesso pattern di modalF24.
   In creazione: se clienteIdPreselezionato è dato (aperto dal fascicolo di un cliente specifico,
   es. da Antiriciclaggio) il cliente è fisso e non selezionabile — evita di generare per errore un
   documento per il cliente sbagliato. soloAml filtra quali modelli sono selezionabili: solo quelli
   con categoria "AML*" se true, solo gli altri se false — così lo stesso modale serve sia Preventivi
   e mandati sia la sezione Documenti del fascicolo Antiriciclaggio. */
/* Form semplificato per i nuovi preventivi (richiesta Matteo: il vecchio modale aveva troppe funzioni inutili):
   cliente, oggetto, righe di attivita con compenso, modalita di pagamento, data e validita. Il testo si genera dal modello. */
let PREV_FORM_COMPLETO = false;
const PAGAMENTI_PREVENTIVO = [
  { v: 'unica', l: 'Unica soluzione alla firma del mandato' },
  { v: '5050', l: '50% alla firma del mandato + 50% al completamento delle attività' },
  { v: 'libero', l: 'Altro (scrivo io)' },
];
function rigaPreventivoHtml(r) {
  r = r || {};
  return `<div class="riga-prev" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;" data-richiede-mandato="${r.richiedeMandato ? '1' : '0'}" data-id-catalogo="${escapeHtml(r.id || '')}">
    <textarea class="riga-prev-desc" rows="2" placeholder="Descrizione dell'attività" style="flex:1;min-height:40px;">${escapeHtml(r.nome || '')}</textarea>
    <input type="number" step="0.01" class="riga-prev-importo" data-action="prev-riga-importo" placeholder="€" value="${r.prezzo != null ? r.prezzo : ''}" style="width:110px;">
    <button type="button" class="btn small" data-action="prev-riga-rimuovi" title="Togli la riga">✕</button>
  </div>`;
}
function totaleRighePreventivo() {
  return Array.from(document.querySelectorAll('.riga-prev-importo')).reduce((s, i) => s + (Number(i.value) || 0), 0);
}
function aggiornaTotalePreventivoSemplice() { const t = document.getElementById('pTotale'); if (t) t.textContent = fmtEuro(totaleRighePreventivo()); }
function modalPreventivoSemplice(modello, modelliDisponibili, clienteCorrenteId, clienteBloccato) {
  const clientiAttivi = STATE.clienti.filter(c => c.stato !== 'cessato');
  const catalogo = STATE.catalogoAttivitaStudio || [];
  const selCliente = clienteBloccato
    ? `<div class="field"><label>Cliente</label><div class="helptext" style="padding-top:6px;">${escapeHtml(nomeCliente(clienteCorrenteId))}</div></div>`
    : `<div class="field"><label>Cliente *</label><select id="pCliente">${clientiAttivi.map(c => `<option value="${c.id}" ${clienteCorrenteId === c.id ? 'selected' : ''}>${escapeHtml(c.ragioneSociale)}${c.stato === 'potenziale' ? ' (potenziale)' : ''}</option>`).join('')}</select></div>`;
  const altriModelli = (modelliDisponibili || []).filter(m => m.categoria === 'Preventivo' && /dettaglioAttivita/.test(m.corpo || ''));
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" data-contesto-aml="0" data-cliente-bloccato="${clienteBloccato ? '1' : '0'}" data-cliente-attuale="${clienteCorrenteId || ''}" style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuovo preventivo</h2><div class="modal-sub">Il testo si compone dal modello: compili solo attività e compenso.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formPreventivoSemplice" onsubmit="return false;">
        <div class="grid2">
          ${selCliente}
          <div class="field"><label>Modello</label><select id="pModelloSemplice">${altriModelli.map(m => `<option value="${m.id}" ${m.id === modello.id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')}</select></div>
          <div class="field full" style="grid-column:1/-1;"><label>Oggetto *</label><input id="pOggetto" placeholder="es. Apertura partita IVA e gestione contabile forfettario"></div>
        </div>
        <div class="section-title" style="margin-top:12px;">Attività e compenso</div>
        <div id="righePreventivo">${rigaPreventivoHtml()}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;">
          <button type="button" class="btn small" data-action="prev-riga-aggiungi">+ Aggiungi riga</button>
          ${catalogo.length ? `<select id="pDaCatalogo" data-action="prev-riga-da-catalogo" style="max-width:260px;"><option value="">+ Dal catalogo studio…</option>${catalogo.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}${a.prezzo != null ? ' — ' + escapeHtml(fmtEuro(a.prezzo)) : ''}</option>`).join('')}</select>` : ''}
          <span style="margin-left:auto;font-weight:700;">Totale: <span id="pTotale">${fmtEuro(0)}</span> <span class="helptext" style="display:inline;">+ C.P. 4%</span></span>
        </div>
        <div class="grid2" style="margin-top:12px;">
          <div class="field full" style="grid-column:1/-1;"><label>Pagamento</label><select id="pPagamento" data-action="prev-pagamento-cambia">${PAGAMENTI_PREVENTIVO.map(o => `<option value="${o.v}">${escapeHtml(o.l)}</option>`).join('')}</select></div>
          <div class="field full" id="pPagamentoLiberoWrap" style="grid-column:1/-1;display:none;"><label>Condizioni di pagamento</label><textarea id="pPagamentoLibero" rows="2"></textarea></div>
          <div class="field"><label>Data emissione</label><input type="date" id="pDataEmissione" value="${oggiISO()}"></div>
          <div class="field"><label>Validità (giorni)</label><input type="number" id="pValiditaGiorni" value="15" min="1"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn small" data-action="prev-form-completo" style="margin-right:auto;" title="Il vecchio modulo con tutte le opzioni">Modulo completo</button>
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-preventivo-semplice">Crea preventivo</button>
      </div>
    </div></div>`;
}
function modalPreventivo(id, clienteIdCorrente, soloAml, modelloIdForzato, clienteBloccatoForzato) {
  const editing = id ? STATE.preventivi.find(x => x.id === id) : null;
  if (id && !editing) { toast('Documento non trovato.'); return; }
  if (!editing && STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  if (!id && !soloAml) migraModelloPreventivoStudio(STATE);
  const clientiAttivi = STATE.clienti.filter(c => c.stato !== 'cessato');
  /* clienteBloccatoForzato è un flag esplicito (non dedotto dalla presenza di clienteIdCorrente):
     un documento aperto dal fascicolo di un cliente specifico resta bloccato su quel cliente anche
     dopo aver cambiato modello; un documento aperto "libero" resta libero anche dopo aver scelto un
     cliente dal menu — altrimenti cambiare modello dopo aver scelto il cliente lo resetterebbe al
     primo della lista (bug corretto in questa sessione). */
  const clienteBloccato = !editing && !!clienteBloccatoForzato;
  const clienteCorrenteId = editing ? editing.clienteId : (clienteIdCorrente || (clientiAttivi[0] ? clientiAttivi[0].id : null));

  let modello = null, modelliDisponibili = [], campiPersonalizzati = [];
  if (editing) {
    modello = STATE.modelliDocumento.find(m => m.id === editing.modelloId) || null;
  } else {
    modelliDisponibili = STATE.modelliDocumento.filter(m => m.attivo && categoriaEAml(m.categoria) === !!soloAml);
    if (modelliDisponibili.length === 0) {
      toast(soloAml ? 'Nessun modello antiriciclaggio attivo: creane uno in "Modelli documenti".' : 'Nessun modello attivo: creane uno in "Modelli documenti".');
      return;
    }
    const compatibile = (m) => m.categoria === 'Preventivo' && /dettaglioAttivita/.test(m.corpo || '');
    const modelloId = modelloIdForzato || (modelliDisponibili.find(m => m.predefinito && compatibile(m)) || modelliDisponibili.find(compatibile) || modelliDisponibili.find(m => m.predefinito && m.categoria === 'Preventivo') || modelliDisponibili.find(m => m.categoria === 'Preventivo') || modelliDisponibili.find(m => m.predefinito) || modelliDisponibili[0]).id;
    modello = modelliDisponibili.find(m => m.id === modelloId) || modelliDisponibili[0];
  }
  if (!editing && !soloAml && modello && modello.categoria === 'Preventivo' && /dettaglioAttivita/.test(modello.corpo || '') && !PREV_FORM_COMPLETO) {
    modalPreventivoSemplice(modello, modelliDisponibili, clienteCorrenteId, clienteBloccato);
    return;
  }
  if (modello) campiPersonalizzati = placeholderPersonalizzatiModello(modello.corpo);
  const valoriCustomEsistenti = editing ? (editing.valoriCustom || {}) : {};

  const selettoreCliente = (clienteBloccato || editing)
    ? `<div class="field"><label>Cliente</label><div class="helptext" style="padding-top:6px;">${escapeHtml(nomeCliente(clienteCorrenteId))}</div></div>`
    : `<div class="field"><label>Cliente *</label><select id="pCliente" data-action="docm-cambia-cliente">${clientiAttivi.map(c=>`<option value="${c.id}" ${clienteCorrenteId===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select></div>`;
  const selettoreModello = editing
    ? `<div class="field"><label>Modello</label><div class="helptext" style="padding-top:6px;">${modello ? escapeHtml(modello.categoria + ' — ' + modello.nome) : 'Modello non più disponibile'}</div></div>`
    : `<div class="field"><label>Modello *</label><select id="pModello" data-action="docm-cambia-modello">${modelliDisponibili.map(m=>`<option value="${m.id}" ${modello.id===m.id?'selected':''}>${escapeHtml(m.categoria + ' — ' + m.nome)}</option>`).join('')}</select></div>`;
  const campiHtml = raggruppaCampiPersonalizzatiModello(campiPersonalizzati).map(voce => {
    if (voce.tipo === 'gruppo') {
      // Sotto-modulo per un gruppo di campi con lo stesso prefisso (es. "esecutoreNome",
      // "esecutoreCf", "esecutoreNascita"...): campi brevi e identitari, un input su una riga
      // sola invece di una textarea alta — meno peso visivo su un blocco che è già raggruppato.
      const righeGruppo = voce.campi.map(campo => `
        <div class="field"><label>${escapeHtml(campo.label)}</label>
        <input type="text" data-campo-custom data-chiave="${escapeHtml(campo.chiave)}" value="${escapeHtml(valoriCustomEsistenti[campo.chiave] || '')}"></div>`).join('');
      return `<div class="field full" style="grid-column:1/-1;border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:var(--bg);">
        <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">${escapeHtml(voce.label)}</div>
        <div class="grid2">${righeGruppo}</div>
      </div>`;
    }
    return `<div class="field full" style="grid-column:1/-1;">
      <label>${escapeHtml(voce.label)}</label>
      <textarea data-campo-custom data-chiave="${escapeHtml(voce.chiave)}" ${voce.chiave === 'dettaglioAttivita' ? 'id="campoDettaglioAttivita"' : ''} rows="2" style="min-height:44px;">${escapeHtml(valoriCustomEsistenti[voce.chiave] || '')}</textarea>
    </div>`;
  }).join('');

  // Attività a listino (task #138): solo in creazione e fuori dal contesto AML — selezionandole si
  // calcola da sole l'importo e (se il modello ha un campo "dettaglioAttivita", come i modelli
  // standard di Matteo) si compila da sola anche l'elenco voci nel testo del documento. In
  // modifica restano bloccate: se servono cambiare conviene eliminare e ricreare il documento,
  // esattamente come già vale per il modello (vedi selettoreModello sopra).
  const catalogoAttivita = STATE.catalogoAttivitaStudio || [];
  const attivitaScelteEsistenti = editing ? (editing.attivitaScelte || []) : [];
  const sezioneAttivita = (!soloAml && catalogoAttivita.length > 0) ? `<div class="section-title" style="margin-top:14px;">Attività dal catalogo studio (opzionale)</div>
    <div class="helptext" style="margin-bottom:6px;">Selezionale per calcolare l'importo in automatico${campiPersonalizzati.includes('dettaglioAttivita') ? ' e compilare l\'elenco voci nel documento' : ''}. Resta comunque tutto modificabile a mano dopo.</div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
      ${catalogoAttivita.map(a => {
        const scelta = attivitaScelteEsistenti.some(x => x.id === a.id);
        return `<label style="display:flex;align-items:center;gap:8px;font-weight:400;">
          <input type="checkbox" data-action="prev-toggle-attivita" data-attivita-catalogo data-id="${a.id}" data-nome="${escapeHtml(a.nome)}" data-prezzo="${a.prezzo != null ? a.prezzo : ''}" data-mandato="${a.richiedeMandato ? '1' : '0'}" ${scelta ? 'checked' : ''} ${editing ? 'disabled' : ''}>
          <span style="flex:1;">${escapeHtml(a.nome)}${a.richiedeMandato ? ' <span class="badge info" style="font-size:9px;">richiede mandato</span>' : ''}</span>
          <span style="color:var(--text-mut);white-space:nowrap;">${a.prezzo != null ? fmtEuro(a.prezzo) : '—'}</span>
        </label>`;
      }).join('')}
    </div>${editing ? '<div class="helptext" style="margin-top:4px;">Attività non modificabili dopo la creazione: elimina e ricrea il documento se servono cambiarle.</div>' : ''}` : '';

  const moduliDisp = (STATE.moduliPreventivo || []).filter(m => m.attivo !== false);
  const sezioneModuli = (!soloAml && !editing && moduliDisp.length && campiPersonalizzati.includes('elencoModuli')) ? `<div class="section-title" style="margin-top:14px;">Moduli del preventivo</div>
    <div class="helptext" style="margin-bottom:6px;">Scegli una o più tipologie di incarico: le loro attività, l'oggetto e il compenso suggerito entrano nel testo (restano modificabili).</div>
    <div style="display:flex;flex-direction:column;gap:6px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
      ${moduliDisp.map(m => `<label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" data-action="prev-toggle-modulo" data-modulo-prev data-id="${m.id}"><span style="flex:1;">${escapeHtml(m.nome)}</span><span style="color:var(--text-mut);">${m.compenso != null ? fmtEuro(m.compenso) : ''}</span></label>`).join('')}
    </div>` : '';
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" data-contesto-aml="${soloAml?'1':'0'}" data-cliente-bloccato="${clienteBloccato?'1':'0'}" data-cliente-attuale="${clienteCorrenteId||''}" style="max-width:600px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica documento':'Nuovo documento da modello'}</h2><div class="modal-sub">${editing?'Il testo si aggiorna solo scegliendo "Rigenera dal modello" nel dettaglio del documento.':'I campi qui sotto compilano il modello scelto.'}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formPreventivo" onsubmit="return false;">
        <div class="grid2">
          ${selettoreCliente}
          ${selettoreModello}
          <div class="field full" style="grid-column:1/-1;"><label>Oggetto / titolo del documento *</label><input id="pOggetto" value="${editing?escapeHtml(editing.oggetto||''):''}" placeholder="es. Sanatoria periodi d'imposta 2024-2025"></div>
          <div class="field"><label>Importo (€, opzionale)</label><input type="number" step="0.01" id="pImporto" value="${editing&&editing.importo!=null?editing.importo:''}" placeholder="0.00"></div>
          <div class="field"><label>Data emissione</label><input type="date" id="pDataEmissione" value="${editing?editing.dataEmissione:oggiISO()}"></div>
          <div class="field"><label>Valido fino al (opzionale)</label><input type="date" id="pValidoFino" value="${editing&&editing.validoFino?editing.validoFino:''}"></div>
          <div class="field"><label>Stato</label><select id="pStato">${statiPerCategoriaDocumento(modello?modello.categoria:'').map(s=>`<option ${(editing?editing.stato:'Bozza')===s?'selected':''}>${s}</option>`).join('')}</select></div>
        </div>
        ${sezioneModuli}
        ${sezioneAttivita}
        ${campiHtml ? `<div class="section-title" style="margin-top:14px;">Campi del modello</div><div class="grid2">${campiHtml}</div>` : ''}
        <div class="field full" style="grid-column:1/-1;margin-top:10px;"><label>Note interne (opzionale, non incluse nel documento)</label><textarea id="pNote" style="min-height:50px;">${editing?escapeHtml(editing.note||''):''}</textarea></div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-preventivo" data-id="${editing?editing.id:''}" data-modello="${modello?modello.id:''}">${editing?'Salva modifiche':'Crea documento'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* Anteprima EDITABILE del testo generato dal modello (non un semplice <pre> di sola lettura): il
   testo, una volta emesso, è un'istantanea salvata sul documento — modificabile a mano con "Salva
   testo" per un ritocco puntuale, oppure "Rigenera dal modello" per ripartire da capo dal modello
   corrente (con conferma, perché sovrascrive eventuali modifiche manuali). */
function modalDettaglioPreventivo(id) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) { toast('Documento non trovato.'); return; }
  const modelloEsiste = p.modelloId && STATE.modelliDocumento.some(m => m.id === p.modelloId);

  const attivitaScelte = p.attivitaScelte || [];
  const blocAttivita = attivitaScelte.length ? `<div class="field full" style="margin-top:6px;"><label>Attività dal catalogo</label>
    <div class="helptext">${attivitaScelte.map(a => `${escapeHtml(a.nome)}${a.prezzo != null ? ' (' + fmtEuro(a.prezzo) + ')' : ''}`).join(' · ')}</div>
  </div>` : '';

  // Collegamento preventivo -> mandato (task #138): un mandato serve solo se almeno un'attività
  // scelta lo richiede (gestione continuativa, non una pratica singola) e solo dopo l'accettazione
  // — e solo una volta: se p.mandatoGeneratoId esiste già, il pulsante lascia il posto al link
  // verso il mandato generato, per non crearne un secondo per errore.
  const richiedeMandato = attivitaScelte.some(a => a.richiedeMandato);
  let blocCollegamento = '';
  if (p.categoria === 'Preventivo' && richiedeMandato) {
    if (p.mandatoGeneratoId && STATE.preventivi.some(x => x.id === p.mandatoGeneratoId)) {
      blocCollegamento = `<div class="helptext" style="margin-top:8px;">📄 Mandato già generato da questo preventivo: <span style="cursor:pointer;text-decoration:underline;color:var(--blu-mid);" data-action="apri-preventivo" data-id="${p.mandatoGeneratoId}">apri</span></div>`;
    } else if (p.stato === 'Accettato') {
      blocCollegamento = `<div style="margin-top:8px;"><button class="btn small primary" data-action="preventivo-genera-mandato" data-id="${p.id}">📄 Genera mandato collegato</button></div>`;
    } else {
      blocCollegamento = `<div class="helptext" style="margin-top:8px;">Le attività scelte prevedono un mandato: comparirà qui non appena il preventivo sarà "Accettato".</div>`;
    }
  }
  if (p.preventivoOrigineId) {
    const origine = STATE.preventivi.find(x => x.id === p.preventivoOrigineId);
    if (origine) blocCollegamento += `<div class="helptext" style="margin-top:8px;">↳ Generato dal preventivo accettato: <span style="cursor:pointer;text-decoration:underline;color:var(--blu-mid);" data-action="apri-preventivo" data-id="${origine.id}">${escapeHtml(origine.oggetto)}</span></div>`;
  }

  let blocAccettazione = '';
  if (p.categoria === 'Preventivo') {
    const cl = clienteById(p.clienteId);
    if (p.stato === 'Accettato') {
      const docF = p.documentoFirmatoId ? STATE.documenti.find(d => d.id === p.documentoFirmatoId) : null;
      blocAccettazione = `<div class="helptext" style="margin-top:8px;">✅ Accettato${p.dataAccettazione ? ' il ' + fmtData(p.dataAccettazione) : ''}${docF ? ' · firmato archiviato in Documenti: ' + escapeHtml(docF.nome) : ''}${p.noteAccettazione ? ' · ' + escapeHtml(p.noteAccettazione) : ''}</div>`;
    } else if (p.stato !== 'Rifiutato') {
      blocAccettazione = `<div style="margin-top:8px;"><button class="btn small primary" data-action="preventivo-accetta-apri" data-id="${p.id}">✅ Registra accettazione (firmato ricevuto)</button>${cl && cl.stato === 'potenziale' ? ' <span class="helptext">Cliente potenziale: diventerà attivo con onboarding.</span>' : ''}</div>`;
    }
  }

  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:820px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(p.categoria)} — ${escapeHtml(nomeCliente(p.clienteId))}</h2><div class="modal-sub">${escapeHtml(p.oggetto||'')}${p.nomeModello?' · modello: '+escapeHtml(p.nomeModello):''}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="grid2" style="margin-top:10px;">
        <div class="field"><label>Stato</label><select data-action="prev-cambia-stato" data-id="${p.id}">${statiPerCategoriaDocumento(p.categoria).map(s=>`<option ${p.stato===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Importo</label><div style="padding-top:7px;font-size:13px;">${p.importo!=null?fmtEuro(p.importo):'—'}</div></div>
      </div>
      ${blocAttivita}
      ${blocAccettazione}
      ${blocCollegamento}
      ${p.note ? `<div class="field full" style="margin-top:6px;"><label>Note interne</label><div class="helptext">${escapeHtml(p.note)}</div></div>` : ''}
      <div class="field full" style="margin-top:10px;">
        <label>Testo del documento</label>
        ${editorDocumentoHtml('prevAnteprimaCorpo', p.corpo || '', false)}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        <button class="btn small primary" data-action="preventivo-salva-testo" data-id="${p.id}">💾 Salva testo</button>
        ${modelloEsiste ? `<button class="btn small" data-action="preventivo-rigenera" data-id="${p.id}">↻ Rigenera dal modello</button>` : ''}
        <button class="btn small" data-action="preventivo-stampa" data-id="${p.id}">🖨️ Stampa</button>
        ${(p.importo != null && moduloAttivo('incassi')) ? `<button class="btn small" data-action="preventivo-crea-incasso" data-id="${p.id}">💶 Crea incasso</button>` : ''}
        <button class="btn small" data-action="preventivo-esporta-rtf" data-id="${p.id}">📄 Esporta Word (.rtf)</button>
        <button class="btn small" data-action="preventivo-esporta" data-id="${p.id}">⬇️ Esporta (.txt)</button>
        <button class="btn small" data-action="modifica-preventivo" data-id="${p.id}">✎ Modifica campi</button>
        <button class="btn small danger" data-action="elimina-preventivo" data-id="${p.id}">Elimina</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function modalAccettazionePreventivo(id) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) return;
  const c = clienteById(p.clienteId);
  const potenziale = c && c.stato === 'potenziale';
  const sezioneFile = HTTP_SYNC_ATTIVO
    ? `<div class="field full" style="grid-column:1/-1;"><label>Preventivo firmato ricevuto (PDF/immagine)</label><input type="file" id="accFile"><div class="helptext" style="margin-top:4px;">Viene archiviato in Documenti del cliente (categoria "Contratto").</div></div>`
    : `<div class="field full" style="grid-column:1/-1;"><div class="helptext">Server locale non attivo: l'allegato non può essere archiviato, registra solo l'accettazione.</div></div>`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Registra accettazione</h2><div class="modal-sub">${escapeHtml(nomeCliente(p.clienteId))} — ${escapeHtml(p.oggetto || '')}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formAccettazione" onsubmit="return false;"><div class="grid2">
        <div class="field"><label>Data accettazione</label><input type="date" id="accData" value="${oggiISO()}"></div>
        <div class="field"><label>Nota (opzionale)</label><input id="accNota" placeholder="es. firmato via mail"></div>
        ${sezioneFile}
      </div></form>
      ${potenziale ? `<div class="grid2" style="margin-top:10px;">
        <div class="field"><label>Responsabile del cliente</label><select id="accResp">${(STATE.meta.responsabili || []).map(r => `<option ${r === c.responsabileStudio ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></div>
        <div class="field"><label>Chi apre le posizioni</label><select id="accApertura">${(STATE.meta.responsabili || []).map(r => `<option ${r === c.responsabileStudio ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></div>
        <div class="field full" style="grid-column:1/-1;"><div class="helptext">Posizioni da aprire (dalla scheda cliente): ${stepAperturaPosizione(c).map(x => escapeHtml(x.nome)).join(' · ') || 'nessuna indicata'}</div></div>
      </div>
      <div class="helptext" style="margin-top:8px;">Il cliente "${escapeHtml(c.ragioneSociale)}" è potenziale: con l'accettazione diventa <b>attivo</b>, parte l'onboarding e viene creato un task di avvio.</div>` : ''}
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="preventivo-accetta-conferma" data-id="${p.id}">Conferma accettazione</button>
      </div>
    </div></div>`;
}
function modalNuovoPotenziale(appId) {
  const pronti = fogliPronti();
  const sel = appId ? trovaAppuntamento(appId) : null;
  const f = (sel && sel.foglio) || {};
  const opt = (arr, v) => `<option value="">— scegli —</option>` + arr.map(o => { const val = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l; return `<option value="${escapeHtml(val)}" ${v === val ? 'selected' : ''}>${escapeHtml(l)}</option>`; }).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuovo cliente potenziale</h2><div class="modal-sub">Per fare un preventivo a chi non è ancora cliente. Diventa cliente attivo all'accettazione.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formPotenziale" onsubmit="return false;"><div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Parti dal foglio guida di un appuntamento</label>
          <select id="potAppuntamento" data-action="potenziale-da-appuntamento"><option value="">— nessuno (inserimento manuale) —</option>${pronti.map(a => `<option value="${a.id}" ${a.id === appId ? 'selected' : ''}>${escapeHtml(a.nomeChiamante || a.oggetto || 'Appuntamento')} · ${escapeHtml(fmtData(a.data))}</option>`).join('')}</select>
          ${pronti.length ? '' : '<div class="helptext">Nessun foglio guida consegnato dai consulenti al momento.</div>'}</div>
        <div class="field full" style="grid-column:1/-1;"><label>Ragione sociale / nome *</label><input id="potNome" value="${escapeHtml(sel ? (sel.nomeChiamante || '') : '')}"></div>
        <div class="field"><label>Email</label><input id="potEmail" type="email" value="${escapeHtml(sel ? (sel.email || '') : '')}"></div>
        <div class="field"><label>Telefono</label><input id="potTel" value="${escapeHtml(sel ? (sel.telefono || '') : '')}"></div>
        <div class="field"><label>Partita IVA</label><input id="potPiva"></div>
        <div class="field"><label>Codice fiscale</label><input id="potCf"></div>
        <div class="field"><label>Tipologia di posizione</label><select id="potTipo">${opt(TIPI_CLIENTE, f.tipo)}</select></div>
        <div class="field"><label>Regime fiscale</label><select id="potRegime">${opt(REGIMI_FISCALI, f.regimeFiscale)}</select></div>
        <div class="field"><label>Posizione contributiva</label><select id="potPrev">${opt(POSIZIONI_PREV_FOGLIO, f.posizioneContributiva)}</select></div>
        <div class="field"><label>Codice ATECO</label><input id="potAteco" value="${escapeHtml(f.ateco || '')}"></div>
        <div class="field"><label class="checkline"><input type="checkbox" id="potInail" ${f.inail ? 'checked' : ''}> Posizione INAIL</label></div>
        <div class="field"><label class="checkline"><input type="checkbox" id="potDip" ${f.dipendenti ? 'checked' : ''}> Dipendenti</label></div>
      </div></form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="nuovo-potenziale-salva">Crea e prepara preventivo</button>
      </div>
    </div></div>`;
}

/* -------------------- RENDER: F24 -------------------- */
let F24_FILTRO = { cliente: 'Tutti', tipo: 'Tutti' };

function renderF24() {
  const tutti = (STATE.f24 || []).filter(f => clienteHaPacchetto(clienteById(f.clienteId)));
  const totDebito = tutti.filter(f => f.tipo === 'Debito').reduce((s,f) => s + (Number(f.importo)||0), 0);
  const totCredito = tutti.filter(f => f.tipo === 'Credito').reduce((s,f) => s + (Number(f.importo)||0), 0);
  const nDaPagare = tutti.filter(f => statoF24(f) !== 'Pagato').length;

  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi completati"><div class="n">${tutti.length}</div><div class="l">F24 REGISTRATI</div></div>
    <div class="kpi scaduti"><div class="n">${nDaPagare}</div><div class="l">DA PAGARE</div></div>
    <div class="kpi scaduti"><div class="n">${fmtEuro(totDebito)}</div><div class="l">TOTALE A DEBITO</div></div>
    <div class="kpi inscadenza"><div class="n">${fmtEuro(totCredito)}</div><div class="l">TOTALE A CREDITO</div></div>
  </div>`;

  let lista = tutti.slice().sort((a,b) => (b.data||'').localeCompare(a.data||''));
  if (F24_FILTRO.cliente !== 'Tutti') lista = lista.filter(f => f.clienteId === F24_FILTRO.cliente);
  if (F24_FILTRO.tipo !== 'Tutti') lista = lista.filter(f => f.tipo === F24_FILTRO.tipo);

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="f24-filtro-cliente">
      <option value="Tutti" ${F24_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      ${clientiPacchetto().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${F24_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Tipo</label><select data-action="f24-filtro-tipo">
      <option value="Tutti" ${F24_FILTRO.tipo==='Tutti'?'selected':''}>Tutti</option>
      ${TIPI_F24.map(t=>`<option ${F24_FILTRO.tipo===t?'selected':''}>${t}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuovo-f24">+ Registra F24</button></div>
  </div>`;

  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>I F24 sono sempre legati a un'anagrafica cliente.</div></div>`;
  }
  if (tutti.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun F24 registrato</div>Tieni traccia dei modelli F24 versati o compensati per ogni cliente — solo dati, nessun allegato.</div></div>`;
  }
  if (lista.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty">Nessun F24 corrisponde ai filtri.</div></div>`;
  }

  const pag = paginaLista('f24', lista);
  const badgeStato = (st) => {
    const mappa = { 'Da pagare': 'stato-errore', 'Pagato parzialmente': 'stato-da-fare', 'Pagato': 'stato-inviato-telematicamente' };
    return `<span class="badge ${mappa[st]||''}">${st}</span>`;
  };
  const righe = pag.pagina.map(f => {
    const st = statoF24(f);
    const azionePagamento = st === 'Pagato'
      ? `<button class="btn small" data-action="f24-segna-da-pagare" data-id="${f.id}" title="Segna tutte le righe come non pagate">Segna da pagare</button>`
      : `<button class="btn small" data-action="f24-segna-pagato" data-id="${f.id}" title="Segna tutte le righe come pagate">Segna pagato</button>`;
    return `<tr>
      <td style="white-space:nowrap;">${fmtData(f.data)}</td>
      <td>${escapeHtml(nomeCliente(f.clienteId))}</td>
      <td><span class="badge ${f.tipo==='Debito'?'stato-errore':'stato-inviato-telematicamente'}">${f.tipo}</span></td>
      <td style="white-space:nowrap;">${fmtEuro(f.importo)}</td>
      <td>${badgeStato(st)}</td>
      <td>${f.chiaveAdempimento ? `<span class="badge info" style="margin-right:6px;">${escapeHtml(((catalogoAnnualeTutti().find(c=>c.chiave===f.chiaveAdempimento))||{}).nome || f.chiaveAdempimento)}</span>` : ''}${escapeHtml(f.descrizione||'')}${f.filePercorso ? ` <a href="${linkScaricaFileReale(f.filePercorso)}" target="_blank" title="Apri l'allegato">📎</a>` : ''}</td>
      <td style="white-space:nowrap;">
        ${azionePagamento}
        <button class="btn small" data-action="modifica-f24" data-id="${f.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-f24" data-id="${f.id}">Elimina</button>
      </td>
    </tr>`;
  }).join('');

  return kpi + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Importo</th><th>Stato</th><th>Descrizione</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

// Righe dell'F24 in fase di compilazione nel modal (task Matteo: codici tributo + pagamento misto
// per riga) - stato del modal, non di STATE: si azzera ad ogni apertura, si legge solo al salvataggio.
let F24_RIGHE_MODAL = [];
// Ricerca cliente nel modal F24 (Matteo: "se lo studio ha 1000 clienti bisogna scrollare ogni
// cliente" - il <select> semplice era impraticabile) - stato del solo modal, si azzera ad ogni
// apertura come F24_RIGHE_MODAL sopra. Il cliente scelto resta in id="fCliente" (input hidden,
// invariato per il resto del codice: aggiornaSuggerimentoImportoF24 e case 'salva-f24' continuano
// a leggerlo con h('fCliente').value esattamente come quando era un <select>).
let F24_CLIENTE_QUERY = '';
function risultatiClienteF24Html() {
  const q = F24_CLIENTE_QUERY.trim().toLowerCase();
  if (!q) return '';
  const match = clientiPacchetto().filter(c => clienteAttivo(c) && c.ragioneSociale.toLowerCase().includes(q))
    .sort((a,b) => a.ragioneSociale.localeCompare(b.ragioneSociale)).slice(0, 30);
  if (!match.length) return `<div class="f24-cliente-vuoto">Nessun cliente trovato per "${escapeHtml(F24_CLIENTE_QUERY.trim())}".</div>`;
  return match.map(c => `<div class="f24-cliente-riga" data-action="f24-cliente-scegli" data-id="${c.id}">${escapeHtml(c.ragioneSociale)}</div>`).join('');
}
// Aggiorna SOLO il contenitore dei risultati (come renderRigheF24Modal sotto): un render() completo
// del modal farebbe perdere il focus sul campo di ricerca a ogni lettera digitata.
function renderRisultatiClienteF24() {
  const cont = h('fClienteRisultati');
  if (cont) cont.innerHTML = risultatiClienteF24Html();
}
function nuovaRigaF24Modal() { return { id: uid('f24r'), codiceTributo: '', descrizione: '', importo: null, importoPagato: 0 }; }
function rigaF24ModalHtml(r, idx) {
  // Il pulsante "rimuovi" occupa sempre lo spazio della sua colonna (visibility:hidden quando
  // assente, non un'assenza dal markup): altrimenti con una sola riga i campi si allargano di 26px
  // rispetto a quando ce ne sono due o più, e le colonne non restano allineate con l'intestazione.
  const rimuovi = F24_RIGHE_MODAL.length > 1
    ? `<button type="button" class="icon-x" data-action="f24-riga-rimuovi" data-idx="${idx}" title="Rimuovi riga">✕</button>`
    : `<span style="visibility:hidden;">✕</span>`;
  return `<div class="riga-f24-modal" data-idx="${idx}">
    <input class="col-tributo" placeholder="es. 6099" value="${escapeHtml(r.codiceTributo || '')}" data-action="f24-riga-input" data-idx="${idx}" data-campo="codiceTributo">
    <input class="col-descrizione" placeholder="es. IVA saldo 2025" value="${escapeHtml(r.descrizione || '')}" data-action="f24-riga-input" data-idx="${idx}" data-campo="descrizione">
    <input class="col-importo" type="number" step="0.01" placeholder="0,00" value="${r.importo != null ? r.importo : ''}" data-action="f24-riga-input" data-idx="${idx}" data-campo="importo" title="Importo dovuto">
    <input class="col-pagato" type="number" step="0.01" placeholder="0,00" value="${r.importoPagato ? r.importoPagato : ''}" data-action="f24-riga-input" data-idx="${idx}" data-campo="importoPagato" title="Quanto è già stato pagato su questa riga - editabile per registrare a mano un pagamento parziale/totale comunicato dal cliente (es. per telefono o bonifico), senza passare dal portale">
    <span class="col-rimuovi">${rimuovi}</span>
  </div>`;
}
function renderRigheF24Modal() {
  const cont = h('f24RigheContainer');
  if (!cont) return;
  cont.innerHTML = F24_RIGHE_MODAL.map((r, idx) => rigaF24ModalHtml(r, idx)).join('');
  const tot = F24_RIGHE_MODAL.reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const totEl = h('f24RigheTotale');
  if (totEl) totEl.textContent = 'Totale: ' + fmtEuro(tot);
}
function modalF24(id, clienteIdPreselezionato) {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const editing = id ? (STATE.f24 || []).find(f => f.id === id) : null;
  const clienteSelId = editing ? editing.clienteId : (clienteIdPreselezionato || null);
  const chiaviConRegola = (STATE.regoleImportiStatutari || []).map(r => ({ chiave: r.chiave, nome: r.nome }));
  F24_RIGHE_MODAL = editing ? righeF24(editing).map(r => Object.assign({}, r)) : [nuovaRigaF24Modal()];
  F24_CLIENTE_QUERY = '';
  const clienteSelezionato = clienteSelId ? clienteById(clienteSelId) : null;
  const statoAttuale = editing ? statoF24(editing) : 'Da pagare';
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica F24':'Registra F24'}</h2><div class="modal-sub">Un F24 può avere più righe/codici tributo — il cliente potrà pagarle anche una alla volta o parzialmente.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formF24" onsubmit="return false;">
        <div class="grid2">
          <div class="field" style="position:relative;">
            <label>Cliente *</label>
            <input type="text" id="fClienteRicerca" data-action="f24-cliente-cerca" autocomplete="off" placeholder="Scrivi per cercare un cliente..." value="${clienteSelezionato ? escapeHtml(clienteSelezionato.ragioneSociale) : ''}">
            <input type="hidden" id="fCliente" value="${clienteSelId || ''}">
            <div id="fClienteRisultati" class="f24-cliente-risultati"></div>
          </div>
          <div class="field"><label>Tipo</label><select id="fTipo">${TIPI_F24.map(t=>`<option ${editing&&editing.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
          ${chiaviConRegola.length ? `<div class="field full" style="grid-column:1/-1;"><label>Adempimento (opzionale, per suggerire l'importo della prima riga)</label>
            <select id="fChiaveAdempimento" data-action="f24-chiave-change">
              <option value="">— Nessuno —</option>
              ${chiaviConRegola.map(c=>`<option value="${c.chiave}" ${editing&&editing.chiaveAdempimento===c.chiave?'selected':''}>${escapeHtml(c.nome)}</option>`).join('')}
            </select>
            <div class="helptext" id="f24SuggerimentoImporto" style="margin-top:4px;"></div>
          </div>` : ''}
          <div class="field"><label>Data *</label><input type="date" id="fData" value="${editing?editing.data:oggiISO()}"></div>
          <div class="field"><label>Descrizione generale (opzionale)</label><input id="fDescrizione" value="${editing?escapeHtml(editing.descrizione||''):''}" placeholder="es. Saldo IVA 2025..."></div>
          <div class="field full" style="grid-column:1/-1;">
            <label>Righe / codici tributo *</label>
            <div class="f24-righe-header">
              <span class="col-tributo">Cod. tributo</span>
              <span class="col-descrizione">Descrizione</span>
              <span class="col-importo">Importo</span>
              <span class="col-pagato">Pagato</span>
              <span class="col-rimuovi"></span>
            </div>
            <div id="f24RigheContainer"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <button type="button" class="btn small" data-action="f24-riga-aggiungi">+ Aggiungi riga</button>
              <strong id="f24RigheTotale" style="font-size:13px;"></strong>
            </div>
          </div>
        </div>
        <div class="helptext" style="margin-top:10px;">${editing ? `Stato attuale: <strong>${statoAttuale}</strong> (calcolato da quanto già pagato riga per riga — per segnare un pagamento usa "Segna pagato"/"Segna da pagare" dall'elenco).` : ''} "Da pagare" compare anche nel portale del cliente.</div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-f24" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Registra'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  renderRigheF24Modal();
}
/* Aggiorna il testo di suggerimento e, se la PRIMA riga non ha ancora un importo, la precompila —
   non sovrascrive mai un importo che l'utente ha già digitato, il suggerimento resta sempre
   modificabile e va sempre verificato (vedi nota della regola). */
function aggiornaSuggerimentoImportoF24() {
  const selChiave = h('fChiaveAdempimento');
  const box = h('f24SuggerimentoImporto');
  if (!selChiave || !box) return;
  const chiave = selChiave.value;
  const clienteId = h('fCliente') ? h('fCliente').value : null;
  const cliente = clienteId ? clienteById(clienteId) : null;
  if (!chiave || !cliente) { box.textContent = ''; return; }
  const regola = (STATE.regoleImportiStatutari || []).find(r => r.chiave === chiave);
  const importo = calcolaImportoStatutario(chiave, cliente);
  if (importo == null) {
    box.textContent = regola ? `Nessun importo suggerito: la regola "${regola.nome}" non ha ancora un importo compilato in Impostazioni.` : '';
    return;
  }
  box.textContent = `Importo suggerito: € ${fmtNum2(importo)}${regola && regola.nota ? ' — ' + regola.nota : ''}`;
  if (F24_RIGHE_MODAL.length && (F24_RIGHE_MODAL[0].importo === null || F24_RIGHE_MODAL[0].importo === '')) {
    F24_RIGHE_MODAL[0].importo = importo;
    renderRigheF24Modal();
  }
}

/* -------------------- RENDER: CHAT INTERNA -------------------- */
/* Task #115: riferimenti a clienti/scadenze dentro un messaggio di chat - un collega scrive "vedi
   {{scadenza|ID|F24 marzo — Rossi Srl}}" (inserito dal picker, non digitato a mano) e chi legge vede
   un chip cliccabile che apre direttamente quel cliente/quella scadenza, invece di dover spiegare a
   parole di quale pratica si sta parlando. Il testo salvato in STATE.chatMessaggi resta sempre il
   token grezzo (portabile, sopravvive a rinominazioni della UI); solo il rendering lo trasforma. */
// Task #132 (Matteo: "in chat si deve fare riferimento anche agli adempimenti annuali"): aggiunto
// il tipo 'annuale' accanto a cliente/scadenza. Per l'azione di apertura non esiste un modale di
// dettaglio dedicato per un singolo adempimento annuale (stesso caso già risolto per
// 'dash-apri-annuale' in dashboard): si riusa lo stesso pattern, vedi 'chat-apri-annuale' più sotto.
// Ulteriore richiesta di Matteo: anche task e documenti cliente devono essere referenziabili, con
// un filtro per categoria nel picker (vedi CHAT_RIF_FILTRO_TIPO più sotto) dato che con tutti questi
// tipi insieme la lista di risultati può diventare lunga da scorrere.
const CHAT_RIF_REGEX = /\{\{(cliente|scadenza|annuale|task|documento)\|([^|{}]+)\|([^{}]+)\}\}/g;
const CHAT_RIF_INFO = {
  cliente:   { azione: 'apri-cliente',            icona: '👤', label: 'la scheda cliente',        categoria: 'Clienti' },
  scadenza:  { azione: 'apri-dettaglio-scadenza',  icona: '📅', label: 'la scadenza',              categoria: 'Scadenze' },
  annuale:   { azione: 'chat-apri-annuale',        icona: '📋', label: 'l\'adempimento annuale',   categoria: 'Adempimenti annuali' },
  task:      { azione: 'apri-dettaglio-task-team', icona: '✅', label: 'il task',                  categoria: 'Task' },
  documento: { azione: 'chat-apri-documento',      icona: '📄', label: 'il documento',             categoria: 'Documenti' },
};
// Filtro per categoria nel picker "Aggiungi riferimento" - 'tutti' cerca su tutto, altrimenti solo
// sul tipo scelto. Reimpostato a 'tutti' ogni volta che si riapre il modale (vedi modalRiferimentoChat).
let CHAT_RIF_FILTRO_TIPO = 'tutti';
function formattaTestoChatConRiferimenti(testo) {
  const str = String(testo || '');
  CHAT_RIF_REGEX.lastIndex = 0;
  let ultimo = 0, out = '', match;
  while ((match = CHAT_RIF_REGEX.exec(str))) {
    out += escapeHtml(str.slice(ultimo, match.index));
    const [intero, tipo, id, label] = match;
    const info = CHAT_RIF_INFO[tipo] || CHAT_RIF_INFO.cliente;
    out += `<span class="chat-riferimento" data-action="${info.azione}" data-id="${escapeHtml(id)}" title="Apri ${info.label}">${info.icona} ${escapeHtml(label)}</span>`;
    ultimo = match.index + intero.length;
  }
  out += escapeHtml(str.slice(ultimo));
  return out;
}
// Per anteprime in elenco (riga contatto in chat): mostra solo l'etichetta, senza chip cliccabile -
// lì il testo va troncato a poche parole, un token completo occuperebbe spazio senza poter essere
// interattivo comunque.
function testoChatSenzaToken(testo) {
  CHAT_RIF_REGEX.lastIndex = 0;
  return String(testo || '').replace(CHAT_RIF_REGEX, (m, tipo, id, label) => label);
}
let CHAT_RIF_QUERY = '';
function risultatiRiferimentoChat(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const filtro = CHAT_RIF_FILTRO_TIPO;
  const out = [];
  if (filtro === 'tutti' || filtro === 'cliente') {
    STATE.clienti.forEach(c => {
      if ((c.ragioneSociale || '').toLowerCase().includes(q)) {
        out.push({ tipo: 'cliente', id: c.id, label: c.ragioneSociale, sotto: `${c.regimeFiscale || '—'}${c.stato === 'cessato' ? ' · cessato' : ''}` });
      }
    });
  }
  const { tutteScadenze, annuali } = derivati();
  if (filtro === 'tutti' || filtro === 'scadenza') {
    tutteScadenze.forEach(s => {
      const nomeCli = nomeCliente(s.clienteId);
      if (`${s.nome} ${nomeCli}`.toLowerCase().includes(q)) {
        out.push({ tipo: 'scadenza', id: s.id, label: `${s.nome} — ${nomeCli}`, sotto: `${fmtDataBreve(s.data)} · ${s.stato}` });
      }
    });
  }
  if (filtro === 'tutti' || filtro === 'annuale') {
    annuali.forEach(a => {
      const nomeCli = nomeCliente(a.clienteId);
      if (`${a.tipoNome} ${nomeCli}`.toLowerCase().includes(q)) {
        out.push({ tipo: 'annuale', id: a.id, label: `${a.tipoNome} — ${nomeCli}`, sotto: `${a.percentuale}% completato${a.scadenza ? ' · scad. ' + fmtDataBreve(a.scadenza) : ''}` });
      }
    });
  }
  if (filtro === 'tutti' || filtro === 'task') {
    (STATE.taskTeam || []).forEach(t => {
      const nomeCli = t.clienteId ? nomeCliente(t.clienteId) : '';
      if (`${t.titolo} ${nomeCli}`.toLowerCase().includes(q)) {
        out.push({ tipo: 'task', id: t.id, label: `${t.titolo}${nomeCli ? ' — ' + nomeCli : ''}`, sotto: `${t.assegnatoA || '—'} · ${t.stato}` });
      }
    });
  }
  if (filtro === 'tutti' || filtro === 'documento') {
    (STATE.documenti || []).forEach(d => {
      const nomeCli = nomeCliente(d.clienteId);
      if (`${d.nome} ${nomeCli}`.toLowerCase().includes(q)) {
        out.push({ tipo: 'documento', id: d.id, label: `${d.nome} — ${nomeCli}`, sotto: `${d.categoria || '—'}${d.dataScadenza ? ' · scad. ' + fmtDataBreve(d.dataScadenza) : ''}` });
      }
    });
  }
  return out.slice(0, 30);
}
function modalRiferimentoChat() {
  CHAT_RIF_QUERY = '';
  CHAT_RIF_FILTRO_TIPO = 'tutti';
  const opzioniFiltro = [['tutti', 'Tutti']].concat(Object.keys(CHAT_RIF_INFO).map(k => [k, CHAT_RIF_INFO[k].categoria]));
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;padding-top:16px;">
      <h2 style="margin-top:0;">Aggiungi riferimento</h2>
      <div class="modal-sub">Cerca un cliente, una scadenza, un adempimento annuale, un task o un documento da citare nel messaggio: verrà inserito come collegamento cliccabile.</div>
      <div style="display:flex;gap:8px;margin:10px 0;">
        <input id="chatRifInput" type="text" placeholder="Cerca..." style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;" data-action="chat-rif-input" autocomplete="off">
        <select data-action="chat-rif-filtro-tipo" style="width:auto;padding:0 8px;border:1px solid var(--border);border-radius:8px;">
          ${opzioniFiltro.map(([v,l]) => `<option value="${v}" ${CHAT_RIF_FILTRO_TIPO===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
      <div id="chatRifResults"><div class="empty" style="padding:20px 4px;">Digita almeno 2 caratteri.</div></div>
      <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button></div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  const input = document.getElementById('chatRifInput');
  if (input) input.focus();
}
function aggiornaRisultatiRiferimentoChat() {
  const el = document.getElementById('chatRifResults');
  if (!el) return;
  if (CHAT_RIF_QUERY.trim().length < 2) {
    el.innerHTML = `<div class="empty" style="padding:20px 4px;">Digita almeno 2 caratteri.</div>`;
    return;
  }
  const risultati = risultatiRiferimentoChat(CHAT_RIF_QUERY);
  if (!risultati.length) {
    el.innerHTML = `<div class="empty" style="padding:20px 4px;">Nessun risultato per "${escapeHtml(CHAT_RIF_QUERY)}".</div>`;
    return;
  }
  el.innerHTML = risultati.map(r => `<div class="ricerca-riga-rif" data-action="chat-rif-scegli" data-tipo="${r.tipo}" data-id="${escapeHtml(r.id)}" data-label="${escapeHtml(r.label)}">
    <div style="font-weight:600;font-size:13px;">${(CHAT_RIF_INFO[r.tipo] || CHAT_RIF_INFO.cliente).icona} ${escapeHtml(r.label)}</div>
    <div style="font-size:11.5px;color:var(--text-mut);">${escapeHtml(r.sotto)}</div>
  </div>`).join('');
}
function inserisciRiferimentoChat(tipo, id, label) {
  const ta = document.getElementById('chatTesto');
  const pulito = String(label || '').replace(/[{}|]/g, '');
  const token = `{{${tipo}|${id}|${pulito}}}`;
  chiudiModal();
  if (!ta) return;
  const inizio = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
  const fine = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
  ta.value = ta.value.slice(0, inizio) + token + ' ' + ta.value.slice(fine);
  const pos = inizio + token.length + 1;
  ta.focus();
  if (ta.setSelectionRange) ta.setSelectionRange(pos, pos);
}
// Contatto attualmente aperto (nome responsabile) - stato del solo modulo, non persistito: si
// riapre sempre sull'elenco contatti, mai su una conversazione specifica, quando si torna sulla vista.
let CHAT_CON = null;
let IMP_SEZIONE = 'studio';
let IMP_TAP_VERSIONE = 0, IMP_TAP_TS = 0;
function renderChat() {
  const io = operatoreCorrente();
  if (!io) {
    return `<div class="card"><div class="empty"><div class="big">Scegli prima chi sei</div>La chat interna è tra responsabili — clicca sul tuo nome in alto per identificarti.</div></div>`;
  }
  const altri = STATE.meta.responsabili.filter(r => r !== io);
  if (!altri.length) {
    return `<div class="card"><div class="empty"><div class="big">Nessun collega con cui chattare</div>Aggiungi un altro responsabile in Impostazioni per usare la chat interna.</div></div>`;
  }
  const nonLetti = chatNonLettiPerContatto();
  const ultimoMessaggioCon = (nome) => STATE.chatMessaggi
    .filter(m => (m.da === nome && m.a === io) || (m.da === io && m.a === nome))
    .sort((a,b) => (b.oraCreazione||b.data||'').localeCompare(a.oraCreazione||a.data||''))[0];
  const contatti = altri.slice().sort((a,b) => {
    const ua = ultimoMessaggioCon(a), ub = ultimoMessaggioCon(b);
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    if (ua && ub) return (ub.oraCreazione||ub.data||'').localeCompare(ua.oraCreazione||ua.data||'');
    return a.localeCompare(b);
  });
  const listaContatti = contatti.map(nome => {
    const ultimo = ultimoMessaggioCon(nome);
    const anteprima = ultimo ? (ultimo.da === io ? 'Tu: ' : '') + escapeHtml(testoChatSenzaToken(ultimo.testo)).slice(0, 40) : 'Nessun messaggio ancora';
    const nUnread = nonLetti[nome] || 0;
    return `<div class="chat-contatto ${CHAT_CON===nome?'active':''}" data-action="chat-apri-con" data-nome="${escapeHtml(nome)}">
      <span class="chat-pallino ${operatoreOnline(nome)?'online':'offline'}" title="${operatoreOnline(nome)?'Online':'Offline'}"></span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${escapeHtml(nome)}</div>
        <div class="chat-anteprima" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${anteprima}</div>
      </div>
      ${nUnread ? `<span class="nav-badge">${nUnread}</span>` : ''}
    </div>`;
  }).join('');

  let corpo = `<div class="empty" style="padding:40px 20px;">Scegli un collega a sinistra per iniziare a chattare.</div>`;
  if (CHAT_CON) {
    segnaChatLetta(CHAT_CON);
    const thread = STATE.chatMessaggi
      .filter(m => (m.da === CHAT_CON && m.a === io) || (m.da === io && m.a === CHAT_CON))
      .sort((a,b) => (a.oraCreazione||a.data||'').localeCompare(b.oraCreazione||b.data||''));
    let giornoPrec = null;
    const bolle = thread.map(m => {
      const separatore = m.data !== giornoPrec ? `<div class="chat-separatore-data"><span>${fmtDataSeparatoreChat(m.data)}</span></div>` : '';
      giornoPrec = m.data;
      return separatore + `<div class="chat-bolla ${m.da===io?'mia':'sua'}">
        <div class="chat-bolla-testo">${formattaTestoChatConRiferimenti(m.testo)}</div>
        <div class="quando">${fmtOraSemplice(m.oraCreazione) || fmtData(m.data)}</div>
      </div>`;
    }).join('');
    corpo = `<div class="chat-thread-header">
        <span class="chat-pallino ${operatoreOnline(CHAT_CON)?'online':'offline'}"></span>
        <strong>${escapeHtml(CHAT_CON)}</strong>
      </div>
      <div class="chat-thread-corpo" id="chatThreadCorpo">${thread.length ? bolle : '<div class="empty" style="padding:20px;">Nessun messaggio ancora — scrivi il primo.</div>'}</div>
      <div class="chat-thread-input">
        <textarea id="chatTesto" placeholder="Scrivi un messaggio... (Invio per inviare, Maiusc+Invio per andare a capo)"></textarea>
        <button class="btn" type="button" data-action="apri-riferimento-chat" title="Cita un cliente o una scadenza">🔗</button>
        <button class="btn primary" data-action="chat-invia">Invia</button>
      </div>`;
  }

  return `<div class="chat-layout">
    <div class="chat-contatti">${listaContatti}</div>
    <div class="chat-corpo">${corpo}</div>
  </div>`;
}

/* -------------------- RENDER: SOCI E REFERENTI -------------------- */
let SOCI_FILTRO = { cliente: 'Tutti' };

function renderSoci() {
  const tutti = (STATE.soci || []).slice().sort((a,b) => a.nome.localeCompare(b.nome));

  const kpi = `<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);">
    <div class="kpi completati"><div class="n">${tutti.length}</div><div class="l">SOCI/REFERENTI CENSITI</div></div>
    <div class="kpi inscadenza"><div class="n">${tutti.filter(s => (s.clienteIds||[]).length > 1).length}</div><div class="l">COLLEGATI A PIÙ CLIENTI</div></div>
  </div>`;

  let lista = tutti;
  if (SOCI_FILTRO.cliente !== 'Tutti') lista = lista.filter(s => (s.clienteIds||[]).includes(SOCI_FILTRO.cliente));

  const toolbar = `<div class="toolbar">
    <div class="field"><label>Cliente</label><select data-action="soci-filtro-cliente">
      <option value="Tutti" ${SOCI_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${SOCI_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuovo-socio">+ Nuovo socio/referente</button></div>
  </div>`;

  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Aggiungi prima un cliente</div>Soci e referenti si collegano a una o più anagrafiche cliente già esistenti.</div></div>`;
  }
  if (tutti.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun socio o referente censito</div>Registra le persone collegate ai tuoi clienti — soci, amministratori, referenti — anche se compaiono su più aziende.</div></div>`;
  }
  if (lista.length === 0) {
    return kpi + toolbar + `<div class="card"><div class="empty">Nessun socio/referente corrisponde al filtro.</div></div>`;
  }

  const pag = paginaLista('soci', lista);
  const righe = pag.pagina.map(s => {
    const chips = (s.clienteIds||[]).map(cid => `<span class="badge info">${escapeHtml(nomeCliente(cid))}</span>`).join(' ') || '<span class="helptext">—</span>';
    return `<tr>
      <td>${escapeHtml(s.nome)}</td>
      <td>${escapeHtml(s.ruolo||'')}</td>
      <td>${chips}</td>
      <td>${escapeHtml(s.email||'')}${s.email&&s.telefono?' · ':''}${escapeHtml(s.telefono||'')}</td>
      <td>
        <button class="btn small" data-action="modifica-socio" data-id="${s.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-socio" data-id="${s.id}">Elimina</button>
      </td>
    </tr>`;
  }).join('');

  return kpi + toolbar + `<div class="card" style="padding:0;overflow-x:auto;">
    <table class="compact"><thead><tr><th>Nome</th><th>Ruolo</th><th>Clienti collegati</th><th>Contatti</th><th></th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>` + controlliPaginazione(pag);
}

/* Carica (amministratore / organo di controllo / socio con quota) di un cliente: persona esistente o nuova. */
function modalCarica(clienteId, categoria, id) {
  const c = clienteById(clienteId); if (!c) return;
  const k = id ? (STATE.cariche || []).find(x => x.id === id) : null;
  if (id && !k) return;
  const cat = k ? k.categoria : categoria;
  const persone = (STATE.soci || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:520px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>${k ? 'Modifica' : 'Aggiungi'}: ${escapeHtml(CATEGORIE_CARICA[cat].titolo)}</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)}</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <form id="formCarica" onsubmit="return false;"><div class="grid2">
      <div class="field" style="grid-column:1/-1;"><label>Persona</label><select id="kPersona" data-action="carica-persona-cambia"><option value="__nuova">➕ Nuova persona…</option>${persone.map(p => `<option value="${p.id}" ${k && k.socioId === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}${p.codiceFiscale ? ' · ' + escapeHtml(p.codiceFiscale) : ''}</option>`).join('')}</select></div>
      <div class="field kNuova"><label>Nome e cognome *</label><input id="kNome" placeholder="es. Mario Rossi"></div>
      <div class="field kNuova"><label>Codice fiscale</label><input id="kCf" style="text-transform:uppercase;"></div>
      <div class="field"><label>Ruolo</label><select id="kRuolo">${CATEGORIE_CARICA[cat].ruoli.map(r => `<option ${k && k.ruolo === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      ${cat === 'socio' ? `<div class="field"><label>Quota %</label><input type="number" step="any" min="0" max="100" id="kQuota" value="${k && k.quota != null ? k.quota : ''}"></div>` : '<div></div>'}
      <div class="field"><label>In carica dal</label><input type="date" id="kDecorrenza" value="${escapeHtml((k && k.decorrenza) || '')}"></div>
      <div class="field"><label>Scadenza carica / mandato</label><input type="date" id="kScadenza" value="${escapeHtml((k && k.scadenza) || '')}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Note</label><input id="kNote" value="${escapeHtml((k && k.note) || '')}"></div>
    </div></form>
    <div class="modal-actions">${k ? `<button class="btn" style="color:var(--rosso);margin-right:auto;" data-action="elimina-carica" data-id="${k.id}">Elimina</button>` : ''}<button class="btn" data-action="chiudi-modal">Annulla</button>
      <button class="btn primary" data-action="salva-carica" data-id="${k ? k.id : ''}" data-cliente="${clienteId}" data-categoria="${cat}">Salva</button></div></div></div>`;
  document.getElementById('modalRoot').innerHTML = html;
  aggiornaCampiNuovaPersona();
}
function aggiornaCampiNuovaPersona() {
  const sel = document.getElementById('kPersona'); if (!sel) return;
  document.querySelectorAll('.kNuova').forEach(e => { e.style.display = sel.value === '__nuova' ? '' : 'none'; });
}
function modalSocio(id) {
  if (STATE.clienti.length === 0) { toast('Aggiungi prima almeno un cliente.'); return; }
  const editing = id ? (STATE.soci || []).find(s => s.id === id) : null;
  const attivi = STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  const clienteIdsMulti = editing ? (editing.clienteIds||[]) : [];
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica socio/referente':'Nuovo socio/referente'}</h2><div class="modal-sub">Una persona collegata a uno o più clienti — socio, amministratore, referente aziendale.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formSocio" onsubmit="return false;">
        <div class="grid2">
          <div class="field"><label>Nome e cognome *</label><input id="sNome" required value="${editing?escapeHtml(editing.nome):''}" placeholder="es. Mario Rossi"></div>
          <div class="field"><label>Ruolo</label><input id="sRuolo" value="${editing?escapeHtml(editing.ruolo||''):''}" placeholder="es. Socio amministratore"></div>
          <div class="field"><label>Codice fiscale</label><input id="sCodiceFiscale" value="${editing?escapeHtml(editing.codiceFiscale||''):''}" style="text-transform:uppercase;"></div>
          <div class="field"><label>Email</label><input type="email" id="sEmail" value="${editing?escapeHtml(editing.email||''):''}"></div>
          <div class="field"><label>Telefono</label><input id="sTelefono" value="${editing?escapeHtml(editing.telefono||''):''}"></div>
          <div class="field full" style="grid-column:1/-1;">
            <label>Clienti collegati</label>
            <input type="text" id="sClientiCerca" placeholder="Cerca cliente..." style="margin-bottom:6px;" data-action="socio-clienti-cerca" autocomplete="off">
            <!-- Bug segnalato da Matteo: le righe erano etichette inline che si accavallavano a
                 cascata (oltre alla checkbox deformata, corretta a monte togliendo type=checkbox
                 dalla regola ".field input"). display:flex;flex-direction:column qui forza ogni
                 riga cliente sulla propria linea, una sotto l'altra. -->
            <div id="sClientiLista" style="max-height:170px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;">
              ${attivi.map(c=>`<label class="checkline" data-nome-ricerca="${escapeHtml(c.ragioneSociale.toLowerCase())}"><input type="checkbox" data-multi-cliente="socio" value="${c.id}" ${clienteIdsMulti.includes(c.id)?'checked':''}> ${escapeHtml(c.ragioneSociale)}</label>`).join('')}
              <div id="sClientiVuoto" class="empty" style="display:none;padding:10px 4px;">Nessun cliente trovato.</div>
            </div>
          </div>
          <div class="field full" style="grid-column:1/-1;"><label>Note</label><input id="sNote" value="${editing?escapeHtml(editing.note||''):''}"></div>
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-socio" data-id="${editing?editing.id:''}">${editing?'Salva modifiche':'Salva'}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* -------------------- RENDER: TASK TEAM -------------------- */
const STATI_TASK_TEAM = ['Da fare', 'In corso', 'In attesa', 'Bloccata', 'Fatto'];
/* Colore di ogni stato: lo stesso nelle tessere di riepilogo, nell'intestazione delle colonne e nel bordo delle card. */
const COLORI_STATO_TASK = {
  'Da fare': { c: 'var(--grigio)', bg: 'var(--grigio-bg)' },
  'In corso': { c: 'var(--blu-mid)', bg: 'var(--blu-light)' },
  'In attesa': { c: 'var(--giallo)', bg: 'var(--giallo-bg)' },
  'Bloccata': { c: 'var(--rosso)', bg: 'var(--rosso-bg)' },
  'Fatto': { c: 'var(--verde)', bg: 'var(--verde-bg)' },
};
const STATI_TASK_CON_MOTIVO = ['In attesa', 'Bloccata'];
let MOTIVO_IN_MODIFICA = null; // id del task il cui motivo (attesa/blocco) si sta riscrivendo
/* Motivo di "In attesa" / "Bloccata": si scrive, si CONFERMA (pulsante o Invio) e resta nello storico del task come le note
   (chi, quando, versioni precedenti se viene modificato, quando è stato risolto). */
function confermaMotivoStatoTask(id, testo) {
  const t = STATE.taskTeam.find(x => x.id === id); if (!t || !STATI_TASK_CON_MOTIVO.includes(t.stato)) return false;
  const motivo = String(testo || '').trim(); if (!motivo) return false;
  if (!Array.isArray(t.storicoStati)) t.storicoStati = [];
  const voce = t.motivoVoceId ? t.storicoStati.find(v => v.id === t.motivoVoceId) : null;
  if (voce) {
    if (voce.motivo !== motivo) { voce.modifiche = (voce.modifiche || []).concat([{ testo: voce.motivo, data: new Date().toISOString(), autore: operatoreCorrente() || null }]); voce.motivo = motivo; }
  } else {
    const nuova = { id: uid('stato'), stato: t.stato, motivo, autore: operatoreCorrente() || null, data: new Date().toISOString(), modifiche: [], chiusoIl: null };
    t.storicoStati.push(nuova); t.motivoVoceId = nuova.id;
  }
  t.motivoStato = motivo; t.motivoConfermato = true;
  if (MOTIVO_IN_MODIFICA === id) MOTIVO_IN_MODIFICA = null;
  salvaStato();
  return true;
}
function htmlStoricoStatiTask(t) {
  const v = (t.storicoStati || []).slice().reverse();
  const col = (st) => COLORI_STATO_TASK[st] || COLORI_STATO_TASK['Da fare'];
  const dataTask = (d) => d ? (String(d).length > 10 ? fmtDataOra(d) : fmtData(d)) : '—';
  const righeDate = `<div class="field full" style="grid-column:1/-1;margin-top:10px;"><label>Date del task</label>
    <div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12.5px;">📥 Inserito in Prisma il <b>${dataTask(t.creatoIl)}</b>${t.fattoIl ? `<br>✅ Completato il <b>${dataTask(t.fattoIl)}</b>` : ''}</div></div>`;
  if (!v.length) return righeDate;
  return righeDate + `<div class="field full" style="grid-column:1/-1;margin-top:10px;"><label>Storico attese e blocchi</label>
    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px 10px;">${v.map(x => `<div style="padding:5px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;margin-bottom:2px;"><span style="color:${col(x.stato).c};">${escapeHtml(x.stato)}</span> · ${escapeHtml(x.autore || '—')} · ${fmtDataOra(x.data)}${x.chiusoIl ? ` · <span style="color:var(--verde);">risolta il ${fmtData(x.chiusoIl)}</span>` : ' · <span style="color:' + col(x.stato).c + ';">in corso</span>'}</div>
      <div style="font-size:12.5px;white-space:pre-wrap;">${escapeHtml(x.motivo)}</div>
      ${(x.modifiche || []).length ? `<details style="margin-top:3px;"><summary class="helptext" style="cursor:pointer;">✎ modificato ${x.modifiche.length === 1 ? '1 volta' : x.modifiche.length + ' volte'}</summary>${x.modifiche.slice().reverse().map(m => `<div class="helptext" style="margin:4px 0 0 10px;padding-left:8px;border-left:2px solid var(--border);"><b>${escapeHtml(m.autore || '—')}</b> · ${fmtDataOra(m.data)} — versione precedente:<div style="white-space:pre-wrap;">${escapeHtml(m.testo)}</div></div>`).join('')}</details>` : ''}
    </div>`).join('')}</div></div>`;
}
let TASK_FILTRO = { assegnato: 'Tutti', cliente: 'Tutti', mostraFatti: true, stato: 'Tutti', q: '', campoData: 'scadenza', dataDa: '', dataA: '', ritardo: false };
const CAMPI_DATA_TASK = { scadenza: 'Scadenza', creatoIl: 'Inserimento in Prisma', fattoIl: 'Completamento' };
/* Testo in cui cerca il filtro "Cerca": titolo, descrizione, note operative, motivo attesa/blocco, cliente, procedura, assegnatario, stato, pratica. */
function testoRicercaTask(t) {
  const proc = t.procedureId ? procedureById(t.procedureId) : null;
  return [t.titolo, t.descrizione, t.note, t.motivoStato, t.assegnatoA, t.stato, t.praticaCartella,
    t.clienteId ? nomeCliente(t.clienteId) : '', proc ? proc.nome : '',
    ...(t.noteStorico || []).map(n => n.testo), ...(t.storicoStati || []).map(v => v.motivo)
  ].filter(Boolean).join(' \n ').toLowerCase();
}


/* Vista della pagina Task team: "elenco" (una riga per task, raggruppata) oppure "kanban" (colonne). Si ricorda l'ultima scelta su questo PC. */
let TASK_VISTA = (() => { try { return localStorage.getItem('prisma_task_vista') === 'kanban' ? 'kanban' : 'elenco'; } catch (e) { return 'elenco'; } })();
let TASK_GRUPPO = (() => { try { const g = localStorage.getItem('prisma_task_gruppo'); return ['stato', 'scadenza', 'cliente', 'nessuno'].includes(g) ? g : 'stato'; } catch (e) { return 'stato'; } })();
let TASK_GRUPPI_CHIUSI = { 'stato|Fatto': true };
function impostaVistaTask(v) { TASK_VISTA = v === 'kanban' ? 'kanban' : 'elenco'; try { localStorage.setItem('prisma_task_vista', TASK_VISTA); } catch (e) { /* ignora */ } }
function impostaGruppoTask(g) { TASK_GRUPPO = ['stato', 'scadenza', 'cliente', 'nessuno'].includes(g) ? g : 'stato'; try { localStorage.setItem('prisma_task_gruppo', TASK_GRUPPO); } catch (e) { /* ignora */ } }
/* Gruppi dell'elenco: [{ chiave, titolo, colore?, task: [...] }] già ordinati. */
function gruppiTaskElenco(filtrati) {
  const perScad = (a, b) => (a.scadenza || '9999-99-99').localeCompare(b.scadenza || '9999-99-99') || String(a.titolo).localeCompare(String(b.titolo));
  const ord = filtrati.slice().sort(perScad);
  if (TASK_GRUPPO === 'nessuno') return [{ chiave: 'tutti', titolo: 'Tutti i task', task: ord }];
  if (TASK_GRUPPO === 'stato') return STATI_TASK_TEAM.map(st => ({ chiave: st, titolo: st, colore: COLORI_STATO_TASK[st].c, task: ord.filter(t => t.stato === st) })).filter(g => g.task.length);
  if (TASK_GRUPPO === 'cliente') {
    const m = {};
    ord.forEach(t => { const k = t.clienteId || '__nessuno__'; (m[k] = m[k] || []).push(t); });
    return Object.keys(m).map(k => ({ chiave: k, titolo: k === '__nessuno__' ? 'Senza cliente (task generali)' : nomeCliente(k), task: m[k] })).sort((a, b) => (a.chiave === '__nessuno__') - (b.chiave === '__nessuno__') || a.titolo.localeCompare(b.titolo));
  }
  const oggi = oggiISO();
  const fascia = (t) => { if (t.stato === 'Fatto') return 5; if (!t.scadenza) return 4; const d = giorniTra(oggi, t.scadenza); return d < 0 ? 0 : (d <= 7 ? 1 : (d <= 31 ? 2 : 3)); };
  const nomi = ['In ritardo', 'Entro 7 giorni', 'Entro un mese', 'Più avanti', 'Senza scadenza', 'Completati'];
  const cols = ['var(--rosso)', 'var(--giallo)', 'var(--blu-mid)', 'var(--text-mut)', 'var(--text-mut)', 'var(--verde)'];
  return nomi.map((n, i) => ({ chiave: 'f' + i, titolo: n, colore: cols[i], task: ord.filter(t => fascia(t) === i) })).filter(g => g.task.length);
}
function rigaTaskElenco(t) {
  const ritardo = taskInRitardo(t);
  const col = COLORI_STATO_TASK[t.stato] || COLORI_STATO_TASK['Da fare'];
  const proc = t.procedureId ? procedureById(t.procedureId) : null;
  const nNote = (t.noteStorico || []).length;
  const motivo = STATI_TASK_CON_MOTIVO.includes(t.stato) ? `<tr class="task-riga-motivo"><td colspan="6" style="padding:0 10px 8px 26px;">${boxMotivoTask(t)}</td></tr>` : '';
  return `<tr class="task-riga${t.stato === 'Fatto' ? ' fatto' : ''}" style="--tc:${col.c};">
    <td class="task-r-titolo" data-action="apri-dettaglio-task-team" data-id="${t.id}" title="Apri (senza modificare)"><span class="task-r-barra"></span><span class="task-r-t">${escapeHtml(t.titolo)}</span>
      <span class="task-r-ico">${t.pratica ? '<span title="Pratica">📁</span>' : ''}${proc ? `<span title="Procedura: ${escapeHtml(proc.nome)}">📋</span>` : ''}${nNote ? `<span title="Note operative: ${nNote}">📝${nNote}</span>` : ''}</span></td>
    <td class="task-r-cliente">${t.clienteId ? escapeHtml(nomeCliente(t.clienteId)) : '<span class="helptext">—</span>'}</td>
    <td class="task-r-chi">${escapeHtml(t.assegnatoA || '—')}</td>
    <td class="task-r-scad">${t.scadenza ? `<span class="pill-delta ${ritardo ? 'scaduto' : 'lontano'}">${fmtDataBreve(t.scadenza)}</span>` : '<span class="helptext">—</span>'}</td>
    <td class="task-r-stato"><select data-action="task-cambia-stato" data-id="${t.id}" style="color:${col.c};">${STATI_TASK_TEAM.map(x => `<option ${t.stato === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="task-r-az"><button class="btn small" data-action="modifica-task-team" data-id="${t.id}" title="Modifica">✎</button><button class="btn small danger" data-action="elimina-task-team" data-id="${t.id}" title="Elimina">🗑</button></td>
  </tr>${motivo}`;
}
function elencoTaskHtml(filtrati) {
  const gruppi = gruppiTaskElenco(filtrati);
  if (!gruppi.length) return '<div class="card"><div class="empty">Nessun task corrisponde ai filtri.</div></div>';
  return `<div class="card task-elenco">` + gruppi.map(g => {
    const chiave = TASK_GRUPPO + '|' + g.chiave;
    const chiuso = !!TASK_GRUPPI_CHIUSI[chiave];
    return `<div class="task-gruppo"><div class="task-gruppo-head" data-action="task-gruppo-toggle" data-g="${escapeHtml(chiave)}" style="--tc:${g.colore || 'var(--text-mut)'};"><span class="chev">${chiuso ? '▸' : '▾'}</span><span class="task-pallino"></span><strong>${escapeHtml(g.titolo)}</strong><span class="cnt">${g.task.length}</span></div>
      ${chiuso ? '' : `<table class="task-tabella"><thead><tr><th>Task</th><th>Cliente</th><th>Assegnato</th><th>Scadenza</th><th>Stato</th><th></th></tr></thead><tbody>${g.task.map(rigaTaskElenco).join('')}</tbody></table>`}</div>`;
  }).join('') + `</div>`;
}

function taskInRitardo(t) {
  return t.stato !== 'Fatto' && t.scadenza && giorniTra(oggiISO(), t.scadenza) < 0;
}

/* Riquadro motivo (In attesa / Bloccata) di un task: usato dalla scheda Kanban e dalla riga dell'elenco. */
function boxMotivoTask(t) {
  const col = COLORI_STATO_TASK[t.stato] || COLORI_STATO_TASK['Da fare'];
    const conMotivo = STATI_TASK_CON_MOTIVO.includes(t.stato);
    const giorniStato = conMotivo && t.statoDal ? giorniTra(t.statoDal, oggiISO()) : null;
    const inMod = conMotivo && (!t.motivoConfermato || MOTIVO_IN_MODIFICA === t.id);
    const titoloMotivo = `<b>${t.stato === 'Bloccata' ? '⛔ Bloccata' : '⏳ In attesa'}${giorniStato != null && giorniStato > 0 ? ' da ' + giorniStato + (giorniStato === 1 ? ' giorno' : ' giorni') : ''}</b>`;
    const boxMotivo = !conMotivo ? '' : (inMod
      ? `<div class="task-motivo" style="background:${col.bg};color:${col.c};">${titoloMotivo}
        <div style="display:flex;gap:6px;"><input type="text" id="motivo_${t.id}" data-action="task-motivo" data-id="${t.id}" value="${escapeHtml(t.motivoStato || '')}" placeholder="${t.stato === 'Bloccata' ? 'Perché è bloccata? (es. errore da risolvere)' : 'In attesa di… (es. documenti dal cliente)'}" style="flex:1;min-width:0;">
        <button type="button" class="btn small primary" data-action="task-motivo-conferma" data-id="${t.id}" title="Conferma (o premi Invio)">✓ Conferma</button>${MOTIVO_IN_MODIFICA === t.id ? `<button type="button" class="btn small" data-action="task-motivo-annulla" data-id="${t.id}">Annulla</button>` : ''}</div>
      </div>`
      : `<div class="task-motivo" style="background:${col.bg};color:${col.c};">${titoloMotivo}
        <div style="display:flex;gap:6px;align-items:flex-start;"><div style="flex:1;white-space:pre-wrap;color:var(--text);font-size:12.5px;">${escapeHtml(t.motivoStato || '')}</div>
        <button type="button" class="btn small" data-action="task-motivo-modifica" data-id="${t.id}">✎ Modifica</button></div>
      </div>`);
  return boxMotivo;
}

function renderTaskTeam() {
  const tutti = STATE.taskTeam;
  const aperti = tutti.filter(t => t.stato !== 'Fatto').length;
  const inRitardo = tutti.filter(taskInRitardo).length;

  // Task #119 (Matteo: "prima compariva ... un banner dentro la schermata dei task che faceva
  // vedere quale task era aggiornato"): elenco dei task assegnati a ME non ancora visti, in cima
  // alla vista - aprire un task da qui lo segna visto (vedi modalTaskTeam), "Segna tutti come visti"
  // spegne il banner senza dover aprire ognuno.
  const nonVisti = taskTeamNonVistiPerOperatore();
  // Task #186: le eliminazioni (niente più oggetto da aprire) compaiono nello stesso banner, come
  // righe a parte con un bottone "Ok" invece di "Apri →" - vedi notificaEliminazione in eliminaTaskTeam.
  const taskEliminati = notificheEliminazioniPerOperatore('task');
  const banner = (nonVisti.length || taskEliminati.length) ? `<div class="card" style="border-left:4px solid var(--rosso,#d33);background:var(--rosso-bg,#fdeceb);margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;">🔔 ${nonVisti.length + taskEliminati.length} novità sui tuoi task</div>
      <button class="btn small" data-action="task-segna-tutti-visti">Segna tutti come visti</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${nonVisti.map(t => { const etichettaTipo = etichettaNotificaTaskTeam(t); return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:4px 0;" data-action="apri-dettaglio-task-team" data-id="${t.id}">
        <span style="font-size:13px;">${escapeHtml(t.titolo)}${t.notificaCreatoDa ? ` <span class="helptext" style="display:inline;">— ${etichettaTipo} da ${escapeHtml(t.notificaCreatoDa)}</span>` : ''}</span>
        <span class="badge">Apri →</span>
      </div>`; }).join('')}
      ${taskEliminati.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;">
        <span style="font-size:13px;">🗑️ ${escapeHtml(n.titolo)}${n.dettaglio ? ' · ' + escapeHtml(n.dettaglio) : ''} <span class="helptext" style="display:inline;">— eliminato da ${escapeHtml(n.eliminatoDa || '—')}</span></span>
        <button class="btn small" data-action="elimina-notifica-eliminazione" data-id="${n.id}">Ok</button>
      </div>`).join('')}
    </div>
  </div>` : '';

  const conta = (st) => tutti.filter(t => t.stato === st).length;
  const tessere = STATI_TASK_TEAM.map(st => { const col = COLORI_STATO_TASK[st]; const attiva = TASK_FILTRO.stato === st;
    return `<div class="task-tessera${attiva ? ' attiva' : ''}" style="--tc:${col.c};--tbg:${col.bg};" data-action="task-filtro-stato" data-stato="${st}" title="${attiva ? 'Tocca per mostrare tutti gli stati' : 'Mostra solo ' + st}"><div class="n">${conta(st)}</div><div class="l">${st.toUpperCase()}</div></div>`; }).join('')
    + `<div class="task-tessera ritardo${TASK_FILTRO.ritardo ? ' attiva' : ''}" style="--tc:var(--rosso);--tbg:var(--rosso-bg);" data-action="task-filtro-ritardo" title="${TASK_FILTRO.ritardo ? 'Tocca per mostrare tutti i task' : 'Mostra solo i task scaduti'}"><div class="n">${inRitardo}</div><div class="l">IN RITARDO</div></div>`;
  const barra = tutti.length ? `<div class="task-barra" title="Ripartizione dei task per stato">${STATI_TASK_TEAM.filter(st => conta(st)).map(st => `<span style="flex:${conta(st)};background:${COLORI_STATO_TASK[st].c};"></span>`).join('')}</div>` : '';
  const kpi = `<div class="task-tessere">${tessere}</div>${barra}`;

  const respOptions = ['Tutti'].concat(STATE.meta.responsabili);
  const toolbar = `<div class="toolbar">
    <div class="field"><label>Assegnato a</label><select data-action="task-filtro-assegnato">
      ${respOptions.map(r=>`<option value="${escapeHtml(r)}" ${TASK_FILTRO.assegnato===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Cliente</label><select data-action="task-filtro-cliente">
      <option value="Tutti" ${TASK_FILTRO.cliente==='Tutti'?'selected':''}>Tutti</option>
      <option value="__nessuno__" ${TASK_FILTRO.cliente==='__nessuno__'?'selected':''}>— Nessuno (task generale) —</option>
      ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${TASK_FILTRO.cliente===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Cerca</label><input type="search" data-action="task-filtro-q" value="${escapeHtml(TASK_FILTRO.q)}" placeholder="titolo, note, cliente, procedura…" autocomplete="off" style="min-width:210px;"></div>
    <div class="field"><label>Data</label><select data-action="task-filtro-campo-data">${Object.keys(CAMPI_DATA_TASK).map(k => `<option value="${k}" ${TASK_FILTRO.campoData===k?'selected':''}>${CAMPI_DATA_TASK[k]}</option>`).join('')}</select></div>
    <div class="field"><label>Dal</label>${campoDataTesto('task-filtro-data-da', TASK_FILTRO.dataDa)}</div>
    <div class="field"><label>Al</label>${campoDataTesto('task-filtro-data-a', TASK_FILTRO.dataA)}</div>
    ${(TASK_FILTRO.q || TASK_FILTRO.dataDa || TASK_FILTRO.dataA || TASK_FILTRO.ritardo) ? `<div class="field" style="min-width:max-content;"><label>&nbsp;</label><button class="btn small" data-action="task-filtro-azzera">✕ Azzera ricerca</button></div>` : ''}
    <div class="field" style="min-width:max-content;"><label>&nbsp;</label><label class="checkline" style="white-space:nowrap;"><input type="checkbox" data-action="task-filtro-mostra-fatti" ${TASK_FILTRO.mostraFatti?'checked':''}> Mostra completati</label></div>
    <div class="field"><label>Vista</label><div class="seg-vista"><button type="button" class="${TASK_VISTA === 'elenco' ? 'attivo' : ''}" data-action="task-vista" data-v="elenco">☰ Elenco</button><button type="button" class="${TASK_VISTA === 'kanban' ? 'attivo' : ''}" data-action="task-vista" data-v="kanban">▦ Kanban</button></div></div>
    ${TASK_VISTA === 'elenco' ? `<div class="field"><label>Raggruppa per</label><select data-action="task-gruppo"><option value="stato" ${TASK_GRUPPO === 'stato' ? 'selected' : ''}>Stato</option><option value="scadenza" ${TASK_GRUPPO === 'scadenza' ? 'selected' : ''}>Scadenza</option><option value="cliente" ${TASK_GRUPPO === 'cliente' ? 'selected' : ''}>Cliente</option><option value="nessuno" ${TASK_GRUPPO === 'nessuno' ? 'selected' : ''}>Nessuno</option></select></div>` : ''}
    <div class="field" style="margin-left:auto;"><label>&nbsp;</label><button class="btn primary" data-action="nuovo-task-team">+ Nuovo task</button></div>
  </div>`;

  if (tutti.length === 0) {
    return banner + kpi + toolbar + `<div class="card"><div class="empty"><div class="big">Nessun task creato</div>Crea un task per te o per un collega — puoi collegarlo a un cliente, dargli una scadenza e assegnarlo a chi vuoi.</div></div>`;
  }

  let filtrati = tutti;
  if (TASK_FILTRO.assegnato !== 'Tutti') filtrati = filtrati.filter(t => t.assegnatoA === TASK_FILTRO.assegnato);
  if (TASK_FILTRO.cliente === '__nessuno__') filtrati = filtrati.filter(t => !t.clienteId);
  else if (TASK_FILTRO.cliente !== 'Tutti') filtrati = filtrati.filter(t => t.clienteId === TASK_FILTRO.cliente);
  if (!TASK_FILTRO.mostraFatti) filtrati = filtrati.filter(t => t.stato !== 'Fatto');
  if (TASK_FILTRO.ritardo) filtrati = filtrati.filter(taskInRitardo);
  const qTask = TASK_FILTRO.q.trim().toLowerCase();
  if (qTask) { const parole = qTask.split(/\s+/); filtrati = filtrati.filter(t => { const tx = testoRicercaTask(t); return parole.every(w => tx.includes(w)); }); }
  if (TASK_FILTRO.dataDa || TASK_FILTRO.dataA) {
    filtrati = filtrati.filter(t => { const d = String(t[TASK_FILTRO.campoData] || '').slice(0, 10); if (!d) return false;
      return (!TASK_FILTRO.dataDa || d >= TASK_FILTRO.dataDa) && (!TASK_FILTRO.dataA || d <= TASK_FILTRO.dataA); });
  }

  const cardTask = (t) => {
    const ritardo = taskInRitardo(t);
    // La card mostra la DESCRIZIONE del task (testo generico, uguale per tutti), non l'ultima nota: le note
    // operative (scritte dagli utenti man mano che lavorano) stanno nel modale, qui resta solo un conteggio.
    const nNoteOperative = (t.noteStorico || []).length;
    const anteprimaNota = t.descrizione
      ? `<div class="note" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;">${escapeHtml(t.descrizione)}</div>`
      : '';
    // Task #155: badge cliccabile verso la procedura collegata (se esiste ancora - una procedura
    // può essere stata eliminata dopo il collegamento, in tal caso il badge non compare).
    const proceduraCollegata = t.procedureId ? procedureById(t.procedureId) : null;
    const col = COLORI_STATO_TASK[t.stato] || COLORI_STATO_TASK['Da fare'];
    const boxMotivo = boxMotivoTask(t);
    return `<div class="task-card" style="border-left:4px solid ${col.c};${t.stato === 'Fatto' ? 'opacity:.78;' : ''}">
      <div class="titolo" style="cursor:pointer;" data-action="apri-dettaglio-task-team" data-id="${t.id}" title="Visualizza (senza modificare)">${escapeHtml(t.titolo)}</div>
      <div class="meta">
        <span class="badge info">${escapeHtml(t.assegnatoA || '—')}</span>
        ${t.clienteId ? `<span class="badge viola">${escapeHtml(nomeCliente(t.clienteId))}</span>` : ''}
        ${t.pratica ? `<span class="badge" style="background:var(--giallo-bg);color:var(--giallo);${t.praticaPercorso ? 'cursor:pointer;' : ''}" ${t.praticaPercorso ? `data-action="apri-cartella-documento" data-percorso="${escapeHtml(t.praticaPercorso)}"` : ''} title="Pratica${t.praticaCartella ? ': ' + escapeHtml(t.praticaCartella) : ''}">📁 Pratica</span>` : ''}
        ${proceduraCollegata ? `<span class="badge" style="cursor:pointer;" data-action="apri-procedura" data-id="${proceduraCollegata.id}" title="Apri procedura collegata">📋 ${escapeHtml(proceduraCollegata.nome)}</span>` : ''}
        ${t.scadenza ? `<span class="pill-delta ${ritardo?'scaduto':'lontano'}">${ritardo?'In ritardo — ':'Entro '}${fmtDataBreve(t.scadenza)}</span>` : ''}
        ${nNoteOperative ? `<span class="badge" title="Note operative: ${nNoteOperative}">📝 ${nNoteOperative}</span>` : ''}
      </div>
      <div class="helptext" style="margin:2px 0 4px;">Inserito il ${t.creatoIl ? fmtData(String(t.creatoIl).slice(0,10)) : '—'}${t.fattoIl ? ` · completato il ${fmtData(String(t.fattoIl).slice(0,10))}` : ''}</div>
      ${boxMotivo}
      ${anteprimaNota}
      <div class="azioni">
        <select data-action="task-cambia-stato" data-id="${t.id}">${STATI_TASK_TEAM.map(s=>`<option ${t.stato===s?'selected':''}>${s}</option>`).join('')}</select>
        <button class="btn small" data-action="modifica-task-team" data-id="${t.id}">Modifica</button>
        <button class="btn small danger" data-action="elimina-task-team" data-id="${t.id}">Elimina</button>
      </div>
    </div>`;
  };

  const statiVisibili = STATI_TASK_TEAM.filter(st => (TASK_FILTRO.stato === 'Tutti' || TASK_FILTRO.stato === st) && (TASK_FILTRO.mostraFatti || st !== 'Fatto' || TASK_FILTRO.stato === 'Fatto'));
  const colonne = statiVisibili.map(stato => {
    const delColonna = filtrati.filter(t => t.stato === stato).sort((a,b) => (a.scadenza||'9999-99-99').localeCompare(b.scadenza||'9999-99-99'));
    const pagCol = paginaLista('taskteam-' + stato, delColonna, 30);
    return `<div class="task-col" style="--tc:${COLORI_STATO_TASK[stato].c};--tbg:${COLORI_STATO_TASK[stato].bg};">
      <div class="task-col-head"><span><span class="task-pallino"></span>${stato}</span> <span class="cnt">${delColonna.length}</span></div>
      ${delColonna.length ? pagCol.pagina.map(cardTask).join('') : `<div class="helptext">Nessun task.</div>`}
      ${controlliPaginazione(pagCol)}
    </div>`;
  }).join('');

  if (TASK_VISTA === 'elenco') return banner + kpi + toolbar + elencoTaskHtml(filtrati);
  return banner + kpi + toolbar + `<div class="task-board">${colonne}</div>`;
}

/* Note dei Task Team (task #114): non un singolo campo testo sovrascrivibile, ma un vero e proprio
   storico append-only — ogni nota resta agganciata a chi l'ha scritta e a quando, esattamente come
   il dataCompletamento sui sotto-adempimenti/step di controllo registra "quando" senza permettere di
   "correggere" il passato. Così una pratica lunga (magari passata di mano tra Matteo e Sabrina) porta
   con sé tutta la sua storia, non solo l'ultimo appunto rimasto. */
/* ---- Note dei task: modifica ed eliminazione ----
   Modifica: SOLO chi ha scritto la nota; la versione precedente resta in "modifiche" (chi, quando, testo di
   prima), visibile dalla nota. Eliminazione: chi l'ha scritta o l'utenza maestro; resta traccia in noteEliminate.
   Con un solo responsabile nello studio (nessuna distinzione tra persone) è tutto consentito. */
let NOTA_IN_MODIFICA = null; // { taskId, notaId }
function puoModificareNotaTask(n) {
  if ((STATE.meta.responsabili || []).length < 2) return true;
  const io = operatoreCorrente();
  if (!n.autore) return !io;
  return !!io && io === n.autore;
}
function puoEliminareNotaTask(n) { return puoModificareNotaTask(n) || (!!operatoreCorrente() && operatoreMaster()); }
function modificaNotaTaskTeam(taskId, notaId, nuovoTesto) {
  const t = STATE.taskTeam.find(x => x.id === taskId); if (!t) return false;
  const n = (t.noteStorico || []).find(x => x.id === notaId); if (!n) return false;
  const testo = String(nuovoTesto || '').trim();
  if (!testo || testo === n.testo) return false;
  if (!puoModificareNotaTask(n)) return false;
  n.modifiche = (n.modifiche || []).concat([{ testo: n.testo, data: new Date().toISOString(), autore: operatoreCorrente() || null }]);
  n.testo = testo;
  salvaStato();
  return true;
}
function eliminaNotaTaskTeam(taskId, notaId) {
  const t = STATE.taskTeam.find(x => x.id === taskId); if (!t) return false;
  const n = (t.noteStorico || []).find(x => x.id === notaId); if (!n || !puoEliminareNotaTask(n)) return false;
  t.noteStorico = t.noteStorico.filter(x => x.id !== notaId);
  t.noteEliminate = (t.noteEliminate || []).concat([{ id: n.id, testo: n.testo, autore: n.autore || null, data: n.data, eliminataDa: operatoreCorrente() || null, eliminataIl: new Date().toISOString() }]);
  salvaStato();
  return true;
}
/* HTML di una nota. conAzioni = pulsanti Modifica/Elimina (solo nel modale di modifica del task). */
function htmlNotaTask(n, taskId, conAzioni) {
  const inModifica = conAzioni && NOTA_IN_MODIFICA && NOTA_IN_MODIFICA.taskId === taskId && NOTA_IN_MODIFICA.notaId === n.id;
  const storico = (n.modifiche || []).length
    ? `<details style="margin-top:3px;"><summary class="helptext" style="cursor:pointer;">✎ modificata ${n.modifiche.length === 1 ? '1 volta' : n.modifiche.length + ' volte'} (ultima: ${escapeHtml(n.modifiche[n.modifiche.length - 1].autore || '—')}, ${fmtDataOra(n.modifiche[n.modifiche.length - 1].data)})</summary>
        ${n.modifiche.slice().reverse().map(m => `<div class="helptext" style="margin:4px 0 0 10px;padding-left:8px;border-left:2px solid var(--border);"><b>${escapeHtml(m.autore || '—')}</b> · ${fmtDataOra(m.data)} — versione precedente:<div style="white-space:pre-wrap;">${escapeHtml(m.testo)}</div></div>`).join('')}
      </details>` : '';
  const azioni = (conAzioni && !inModifica)
    ? `<span style="float:right;display:inline-flex;gap:4px;">
        ${puoModificareNotaTask(n) ? `<button type="button" class="btn small ghost" data-action="task-nota-modifica" data-id="${taskId}" data-nota="${n.id}" title="Modifica questa nota">✎ Modifica</button>` : ''}
        ${puoEliminareNotaTask(n) ? `<button type="button" class="btn small ghost" style="color:var(--rosso);" data-action="task-nota-elimina" data-id="${taskId}" data-nota="${n.id}" title="Elimina questa nota">🗑</button>` : ''}
      </span>` : '';
  const corpo = inModifica
    ? `<textarea id="tNotaModifica" style="width:100%;min-height:60px;">${escapeHtml(n.testo)}</textarea>
       <div style="margin-top:6px;display:flex;gap:6px;"><button type="button" class="btn small primary" data-action="task-nota-modifica-salva" data-id="${taskId}" data-nota="${n.id}">Salva nota</button><button type="button" class="btn small" data-action="task-nota-modifica-annulla" data-id="${taskId}">Annulla</button></div>`
    : `<div style="font-size:12.5px;white-space:pre-wrap;line-height:1.4;">${escapeHtml(n.testo)}</div>`;
  return `<div style="padding:5px 0;border-bottom:1px solid var(--border);"><div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin-bottom:2px;">${escapeHtml(n.autore || '—')} · ${fmtData(n.data)}${azioni}</div>${corpo}${storico}</div>`;
}
/* Riapre il modale del task mantenendo quello che si stava compilando (escluse le chiavi indicate). */
function riapriTaskConBozza(taskId, escludi) {
  TASK_BOZZA = { id: taskId || null, campi: {}, ripristina: true };
  ['tTitolo', 'tAssegnato', 'tCliente', 'tScadenza', 'tStato', 'tProcedura', 'tDescrizione', 'tNuovaNota'].forEach(k => { if ((escludi || []).includes(k)) return; const f = document.getElementById(k); if (f) TASK_BOZZA.campi[k] = f.value; });
  if (document.getElementById('tPratica')) TASK_BOZZA.campi.tPratica = document.getElementById('tPratica').checked ? '1' : '0';
  modalTaskTeam(taskId);
}
function aggiungiNotaTaskTeam(taskId, testo) {
  const t = STATE.taskTeam.find(x => x.id === taskId);
  const testoPulito = (testo || '').trim();
  if (!t || !testoPulito) return null;
  if (!Array.isArray(t.noteStorico)) t.noteStorico = [];
  const nota = { id: uid('nota'), testo: testoPulito, autore: operatoreCorrente() || null, data: oggiISO() };
  t.noteStorico.push(nota);
  salvaStato();
  return nota;
}

/* Task #120 (Matteo: "manca anche la videata per visualizzare e basta i task senza modificarli"):
   vista di sola lettura, raggiunta con un click su un task da elenco/banner/calendario - niente
   select o input editabili, solo testo e lo storico note per intero. Chi vuole cambiare qualcosa
   preme "Modifica" qui dentro, che apre il modale editabile (modalTaskTeam) vero e proprio: due
   modali distinti invece di uno solo "a volte editabile" perché altrimenti resterebbe troppo facile
   toccare per sbaglio uno stato/assegnatario mentre si sta solo dando un'occhiata. */

/* ============================================================================================
   PRATICA COMPLETATA -> ADDEBITO AL CLIENTE (sempre sotto conferma, mai automatico)
   Quando un task segnato "È una pratica" passa a Fatto compare una finestra: compenso (dal tariffario o dal compenso predefinito
   pratica in Impostazioni) + spese anticipate. Alla conferma finiscono in "Attività da fatturare": una voce per il compenso e una
   per ogni spesa anticipata. "Decido dopo" lascia la proposta aperta (si riapre dal dettaglio del task); "Non addebitare" la chiude.
   ============================================================================================ */
let ADDEBITO_BOZZA = null;
function compensoPraticaPredefinito() { const v = Number(STATE.meta && STATE.meta.compensoPraticaDefault); return v > 0 ? v : null; }
function addebitoPraticaDaConfermare(t) { return !!(t && t.pratica && t.addebitoPratica && t.addebitoPratica.stato === 'da-confermare'); }
function proponiAddebitoPratica(taskId) {
  const t = STATE.taskTeam.find(x => x.id === taskId);
  if (!addebitoPraticaDaConfermare(t) || !clienteById(t.clienteId)) return false;
  modalAddebitoPratica(taskId); return true;
}
function modalAddebitoPratica(taskId) {
  const t = STATE.taskTeam.find(x => x.id === taskId); if (!t) return;
  const cl = clienteById(t.clienteId);
  if (!cl) { toast('La pratica non ha un cliente: collegala a un cliente per poterla addebitare.', true); return; }
  const def = compensoPraticaPredefinito();
  ADDEBITO_BOZZA = { taskId, attivitaId: def != null ? '__default__' : '', compenso: def != null ? def : '', spese: [{ descrizione: '', importo: '', esente: true }] };
  disegnaModalAddebito();
}
function totaleAddebito() { const b = ADDEBITO_BOZZA; return (Number(b.compenso) || 0) + b.spese.reduce((s, x) => s + (Number(x.importo) || 0), 0); }
function disegnaModalAddebito() {
  const b = ADDEBITO_BOZZA, t = STATE.taskTeam.find(x => x.id === b.taskId), cl = clienteById(t.clienteId), def = compensoPraticaPredefinito();
  const opz = [def != null ? `<option value="__default__" ${b.attivitaId === '__default__' ? 'selected' : ''}>Compenso predefinito pratica — ${fmtEuro(def)}</option>` : '']
    .concat((STATE.catalogoAttivitaStudio || []).map(a => `<option value="${a.id}" ${b.attivitaId === a.id ? 'selected' : ''}>${escapeHtml(a.nome)}${a.prezzo != null ? ' — ' + fmtEuro(a.prezzo) : ''}</option>`)).join('');
  const righe = b.spese.map((x, i) => `<div style="display:grid;grid-template-columns:1fr 110px auto auto;gap:6px;align-items:center;margin-bottom:6px;">
      <input data-action="addeb-spesa-desc" data-i="${i}" value="${escapeHtml(x.descrizione)}" placeholder="es. Diritti di segreteria Camera di Commercio">
      <input type="number" step="0.01" min="0" data-action="addeb-spesa-importo" data-i="${i}" value="${x.importo}" placeholder="0,00">
      <label class="checkline" title="Spesa anticipata in nome e per conto del cliente: esclusa da IVA (art. 15 DPR 633/72)" style="white-space:nowrap;font-size:12px;"><input type="checkbox" data-action="addeb-spesa-esente" data-i="${i}" ${x.esente ? 'checked' : ''}> escl. IVA art. 15</label>
      <button class="btn small danger" data-action="addeb-spesa-elimina" data-i="${i}" title="Rimuovi">✕</button></div>`).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:640px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>Pratica completata: da addebitare?</h2>
      <div class="modal-sub">${escapeHtml(t.titolo)} · ${escapeHtml(cl.ragioneSociale)}. Niente parte da solo: confermi tu cosa finisce in «Da fatturare».</div></div><button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <div class="field"><label>Compenso della pratica</label><select data-action="addeb-attivita"><option value="">— importo libero —</option>${opz}</select></div>
    <div class="field"><label>Importo compenso (€, + IVA e C.P.)</label><input type="number" step="0.01" min="0" id="addebCompenso" data-action="addeb-compenso" value="${b.compenso}" placeholder="0,00"></div>
    <div style="margin-top:12px;font-weight:700;font-size:13px;">Spese anticipate da addebitare</div>
    <div class="helptext" style="margin-bottom:6px;">Bolli, diritti camerali, visure, marche… pagati dallo studio per conto del cliente.</div>
    ${righe}<button class="btn small" data-action="addeb-spesa-aggiungi">+ Aggiungi spesa</button>
    <div style="margin-top:14px;font-size:14px;">Totale da addebitare: <b id="addebTotale">${fmtEuro(totaleAddebito())}</b></div>
    <div class="modal-actions" style="flex-wrap:wrap;"><button class="btn" data-action="addeb-dopo">Decido dopo</button><button class="btn danger" data-action="addeb-no">Non addebitare</button><button class="btn primary" data-action="addeb-conferma">Aggiungi a «Da fatturare»</button></div>
  </div></div>`;
}
function confermaAddebitoPratica() {
  const b = ADDEBITO_BOZZA; if (!b) return null;
  const t = STATE.taskTeam.find(x => x.id === b.taskId); if (!t) return null;
  const compenso = Number(b.compenso) || 0, spese = b.spese.filter(x => (x.descrizione || '').trim() && Number(x.importo) > 0);
  if (!(compenso > 0) && !spese.length) { toast('Indica un compenso o almeno una spesa anticipata.', true); return null; }
  const att = (STATE.catalogoAttivitaStudio || []).find(a => a.id === b.attivitaId);
  const creati = [];
  if (compenso > 0) creati.push(aggiungiAttivitaFatturabile({ clienteId: t.clienteId, descrizione: 'Pratica: ' + t.titolo + (att ? ' (' + att.nome + ')' : ''), importo: compenso, taskId: t.id, tipoVoce: 'compenso', note: 'Compenso pratica, + IVA e C.P.' }));
  spese.forEach(x => creati.push(aggiungiAttivitaFatturabile({ clienteId: t.clienteId, descrizione: 'Spesa anticipata — ' + x.descrizione.trim() + ' (pratica: ' + t.titolo + ')', importo: Number(x.importo), taskId: t.id, tipoVoce: 'spesa', esenteIva: !!x.esente, note: x.esente ? 'Esclusa da IVA, art. 15 DPR 633/72' : '' })));
  t.addebitoPratica = { stato: 'addebitato', data: oggiISO(), attivitaIds: creati.map(a => a.id), totale: Math.round((compenso + spese.reduce((s, x) => s + Number(x.importo), 0)) * 100) / 100 };
  salvaStato();
  return t.addebitoPratica;
}
function htmlAddebitoPraticaTask(t) {
  if (!t || !t.pratica || !t.addebitoPratica) return '';
  const a = t.addebitoPratica;
  if (a.stato === 'da-confermare') return `<div class="card" style="margin:0 0 14px;border:1px solid var(--giallo);"><b>💶 Addebito al cliente da confermare</b><div class="helptext">La pratica è completata: scegli compenso e spese anticipate da mettere in «Da fatturare».</div><button class="btn small primary" data-action="addeb-apri" data-id="${t.id}" style="margin-top:6px;">Imposta l'addebito</button></div>`;
  if (a.stato === 'addebitato') return `<div class="helptext" style="margin:0 0 14px;">💶 Addebitato il ${fmtData(a.data)}: ${fmtEuro(a.totale)} (compenso e spese) in «Da fatturare».</div>`;
  return `<div class="helptext" style="margin:0 0 14px;">💶 Addebito escluso il ${fmtData(a.data)}. <button class="btn small" data-action="addeb-apri" data-id="${t.id}">Riapri</button></div>`;
}

function modalDettaglioTaskTeam(taskId) {
  const t = STATE.taskTeam.find(x => x.id === taskId);
  if (!t) { toast('Task non trovato.'); return; }
  segnaTaskTeamVisto(t.id);
  const noteStorico = t.noteStorico || [];
  const ritardo = taskInRitardo(t);
  const sezioneNote = noteStorico.length
    ? `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px;">${noteStorico.map(n => htmlNotaTask(n, t.id, false)).join('')}</div>`
    : `<div class="helptext">Nessuna nota operativa ancora su questo task.</div>`;
  // Task #155: pannello di riferimento con l'anteprima della procedura collegata (nome, categoria,
  // contenuto, checklist documenti) - non solo un link, proprio "una linea guida su cosa fare" senza
  // dover aprire un secondo modale, con comunque un pulsante per aprirla per intero se serve.
  const proceduraCollegata = t.procedureId ? procedureById(t.procedureId) : null;
  const panelProcedura = proceduraCollegata ? `<div class="card" style="margin:0 0 14px;background:var(--blu-light,#eef4ff);border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">📋 Procedura collegata · ${escapeHtml(proceduraCollegata.categoria)}</div>
          <div style="font-weight:600;margin-top:2px;">${escapeHtml(proceduraCollegata.nome)}</div>
        </div>
        <button class="btn small" data-action="apri-procedura" data-id="${proceduraCollegata.id}">Apri</button>
      </div>
      <div class="helptext" style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(proceduraCollegata.contenuto.replace(/\s+/g,' ').trim().slice(0,220))}${proceduraCollegata.contenuto.length>220?'…':''}</div>
    </div>` : '';
  const panelNoteCompletamento = t.descrizione ? `<div style="margin:0 0 14px;">
      <label style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">Descrizione</label>
      <div class="helptext" style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(t.descrizione)}</div>
    </div>` : '';
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(t.titolo)}</h2><div class="modal-sub">${escapeHtml(t.stato)}${(t.notificaCreatoDa && !t.notificaVista) ? ` · ${etichettaNotificaTaskTeam(t)} da ${escapeHtml(t.notificaCreatoDa)}` : ''}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;">
        <span class="badge info">👤 ${escapeHtml(t.assegnatoA || '—')}</span>
        ${t.clienteId ? `<span class="badge viola">${escapeHtml(nomeCliente(t.clienteId))}</span>` : ''}
        ${t.scadenza ? `<span class="pill-delta ${ritardo?'scaduto':'lontano'}">${ritardo?'In ritardo — ':'Entro '}${fmtDataBreve(t.scadenza)}</span>` : '<span class="helptext">Nessuna scadenza</span>'}
      </div>
      ${htmlAddebitoPraticaTask(t)}
      ${panelProcedura}
      ${panelNoteCompletamento}
      <label style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">Note operative</label>
      <div style="margin-top:6px;">${sezioneNote}</div>
      ${htmlStoricoStatiTask(t)}
      <div class="modal-actions">
        ${t.clienteId ? `<button class="btn small" data-action="apri-cliente" data-id="${t.clienteId}" style="margin-right:auto;">Apri scheda cliente</button>` : ''}
        <button class="btn" data-action="chiudi-modal">Chiudi</button>
        <button class="btn primary" data-action="modifica-task-team" data-id="${t.id}">✏️ Modifica</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}
/* Opzioni del menu "Procedura collegata" di un task, filtrate per testo: cerca la parola OVUNQUE nel nome della procedura (o
   nella categoria), non solo dalla prima lettera come fa il menu nativo. La procedura gia scelta resta sempre presente. */
function opzioniProcedureTask(selezionataId, filtro) {
  const f = String(filtro || '').trim().toLowerCase();
  const attive = (STATE.procedureInterne || []).filter(p => p.attivo);
  const trovate = attive.filter(p => !f || String(p.nome || '').toLowerCase().includes(f) || String(p.categoria || '').toLowerCase().includes(f) || p.id === selezionataId);
  const categorie = Array.from(new Set(trovate.map(p => p.categoria)));
  return '<option value="">— Nessuna —</option>' + categorie.map(cat => `<optgroup label="${escapeHtml(cat)}">${trovate.filter(p => p.categoria === cat).map(p => `<option value="${p.id}" ${selezionataId === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}</optgroup>`).join('');
}
/* PRATICHE: un task puo essere una "pratica" (richiede comunicazioni a istituzioni o enti). Segnarla crea nella cartella
   documenti del cliente la sottocartella "aaaa.gg.mm - nome pratica" (data di creazione del task, nome = titolo): i documenti
   allegati al task finiscono sempre li dentro e compaiono anche tra i Documenti del cliente (categoria "Corrispondenza Enti"). */
const FORMATO_DATA_CARTELLA_PRATICA = 'aaaa.gg.mm'; // per avere l'ordine per data nell'elenco file basta cambiarlo in 'aaaa.mm.gg'
function nomeCartellaPratica(dataISO, titolo) {
  const [a, m, g] = String(dataISO || oggiISO()).split('-');
  const data = FORMATO_DATA_CARTELLA_PRATICA.replace('aaaa', a).replace('gg', g).replace('mm', m);
  // niente barre o caratteri vietati nei nomi di cartella (una barra creerebbe una sottocartella in piu)
  const nome = String(titolo || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${data} - ${nome}`;
}
function documentiDiTask(taskId) { return (STATE.documenti || []).filter(d => d.taskId === taskId); }
function htmlCampoPratica(t, editing) {
  const docs = editing ? documentiDiTask(t.id) : [];
  const nomeCart = t.praticaCartella || nomeCartellaPratica(t.creatoIl || oggiISO(), t.titolo || 'nome pratica');
  return `<div class="field full" style="grid-column:1/-1;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
    <label class="checkline" style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="tPratica" data-action="task-pratica-toggle" ${t.pratica ? 'checked' : ''}> <b>È una pratica</b> <span class="helptext">(richiede comunicazioni a istituzioni o enti)</span></label>
    <div id="tPraticaBox" style="display:${t.pratica ? 'block' : 'none'};margin-top:8px;">
      <div class="helptext">Nella cartella del cliente, dentro «Pratiche», si crea: <b id="tPraticaCartella">${escapeHtml(nomeCart)}</b>${t.praticaCartella ? '' : ' <span>(il nome usa il titolo del task)</span>'}</div>
      ${docs.length ? `<div style="margin-top:8px;font-size:12.5px;"><div class="helptext" style="font-weight:700;">Documenti della pratica</div>${docs.map(d => `<div style="display:flex;gap:8px;align-items:center;padding:2px 0;">📎 ${d.filePercorso ? `<a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank" rel="noopener">${escapeHtml(d.nome)}</a>` : escapeHtml(d.nome)}</div>`).join('')}${t.praticaPercorso ? `<button type="button" class="btn small ghost" style="margin-top:4px;" data-action="apri-cartella-documento" data-percorso="${escapeHtml(t.praticaPercorso)}">📂 Apri cartella</button>` : ''}</div>` : (t.praticaPercorso ? `<button type="button" class="btn small ghost" style="margin-top:6px;" data-action="apri-cartella-documento" data-percorso="${escapeHtml(t.praticaPercorso)}">📂 Apri cartella</button>` : '')}
      <div style="margin-top:8px;"><label style="font-size:12px;font-weight:600;">Allega documenti (opzionale)</label><input type="file" id="tPraticaFile" multiple style="display:block;margin-top:4px;max-width:100%;"></div>
      ${HTTP_SYNC_ATTIVO ? '' : '<div class="helptext" style="color:var(--giallo);margin-top:6px;">Cartella e file si creano solo con il server di Prisma attivo.</div>'}
    </div>
  </div>`;
}
/* Dopo il salvataggio del task: crea la cartella della pratica e carica i file allegati (asincrono, con avvisi). */
function sincronizzaPratica(taskId, files) {
  const t = STATE.taskTeam.find(x => x.id === taskId);
  if (!t || !t.pratica) return;
  const cl = clienteById(t.clienteId);
  if (!cl) return;
  if (!HTTP_SYNC_ATTIVO) { toast('Pratica segnata, ma la cartella non è stata creata: serve il server di Prisma attivo.', true); return; }
  fetch('/api/documenti/cartella', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: cl.id, clienteNome: cl.ragioneSociale, sottocartella: sottocartellaArea('pratiche', null, t.praticaCartella) }) })
    .then(r => r.json())
    .then(async (esito) => {
      if (!esito || !esito.ok) throw new Error((esito && esito.errore) || 'cartella non creata');
      t.praticaCartella = esito.sottocartella.split('/').pop(); t.praticaPercorso = esito.percorso; t.praticaClienteId = cl.id;
      salvaStato();
      let caricati = 0;
      for (const f of (files || [])) {
        try {
          const up = await uploadFileReale(f, cl.id, cl.ragioneSociale, sottocartellaArea('pratiche', null, t.praticaCartella));
          aggiungiDocumento({ clienteId: cl.id, categoria: 'Corrispondenza Enti', nome: f.name, dataCaricamento: oggiISO(), dataScadenza: null, taskId: t.id, praticaCartella: t.praticaCartella, filePercorso: up.percorso, fileNome: up.nomeFile, fileDimensione: up.dimensione });
          caricati++;
        } catch (err) { toast('Il file "' + f.name + '" non è stato caricato: ' + err.message, true); }
      }
      render();
      toast(caricati ? `Pratica: cartella «${t.praticaCartella}» pronta, ${caricati} ${caricati === 1 ? 'documento caricato' : 'documenti caricati'}.` : `Pratica: cartella «${t.praticaCartella}» creata in Pratiche, nei documenti del cliente.`);
    })
    .catch(err => toast('Pratica segnata, ma la cartella non è stata creata: ' + err.message, true));
}
/* Selettore "Procedura collegata" dei task: al posto del menu nativo (stretto, senza ricerca "contiene") c'e una casella di ricerca
   con un elenco a comparsa: nomi per intero (a capo se lunghi), categoria accanto, parola cercata evidenziata, ordinamento per
   pertinenza, selezione con clic oppure con frecce + Invio. Il vero valore resta nel <select id="tProcedura"> nascosto. */
function evidenziaTesto(testo, filtro) {
  const t = String(testo || ''), f = String(filtro || '').trim();
  if (!f) return escapeHtml(t);
  const idx = t.toLowerCase().indexOf(f.toLowerCase());
  if (idx < 0) return escapeHtml(t);
  return escapeHtml(t.slice(0, idx)) + '<mark style="background:#FFE9A8;color:inherit;border-radius:3px;padding:0 1px;">' + escapeHtml(t.slice(idx, idx + f.length)) + '</mark>' + escapeHtml(t.slice(idx + f.length));
}
function procedureTaskFiltrate(filtro) {
  const f = String(filtro || '').trim().toLowerCase();
  const attive = (STATE.procedureInterne || []).filter(p => p.attivo);
  if (!f) return attive.slice().sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)) || String(a.nome).localeCompare(String(b.nome)));
  const punti = (p) => {
    const n = String(p.nome || '').toLowerCase(), c = String(p.categoria || '').toLowerCase();
    if (n.startsWith(f)) return 0;
    if (new RegExp('(^|[^a-z0-9àèéìòù])' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) return 1; // inizio di una parola
    if (n.includes(f)) return 2;
    if (c.includes(f)) return 3;
    return -1;
  };
  return attive.map(p => ({ p, v: punti(p) })).filter(x => x.v >= 0).sort((a, b) => a.v - b.v || String(a.p.nome).localeCompare(String(b.p.nome))).map(x => x.p);
}
function htmlChipProceduraTask(id) {
  const p = id ? procedureById(id) : null;
  if (!p) return '<div class="helptext" style="margin-bottom:6px;">Nessuna procedura collegata.</div>';
  return `<div style="display:flex;align-items:flex-start;gap:8px;background:var(--blu-light);border-radius:8px;padding:7px 10px;margin-bottom:6px;"><span>📋</span><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13.5px;overflow-wrap:anywhere;">${escapeHtml(p.nome)}</div><div class="helptext">${escapeHtml(p.categoria || '')}</div></div><button type="button" class="btn small ghost" data-action="task-proc-rimuovi" title="Scollega la procedura">✕</button></div>`;
}
function htmlListaProcedureTask(filtro) {
  const f = String(filtro || '').trim();
  const lista = procedureTaskFiltrate(f);
  if (!lista.length) return '<div class="helptext" style="padding:12px 14px;">Nessuna procedura contiene «' + escapeHtml(f) + '».</div>';
  let out = f ? `<div class="helptext" style="padding:6px 12px;border-bottom:1px solid var(--border);">${lista.length} ${lista.length === 1 ? 'risultato' : 'risultati'} — ↑ ↓ per scorrere, Invio per scegliere</div>` : '';
  let catPrec = null;
  lista.forEach((p, i) => {
    if (!f && p.categoria !== catPrec) { catPrec = p.categoria; out += `<div style="position:sticky;top:0;background:var(--bg);padding:5px 12px;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--text-mut);border-bottom:1px solid var(--border);">${escapeHtml(p.categoria || '')}</div>`; }
    out += `<div class="proc-riga${i === 0 && f ? ' attiva' : ''}" data-action="task-proc-scegli" data-id="${p.id}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
      <span style="font-size:13.5px;line-height:1.35;overflow-wrap:anywhere;">${evidenziaTesto(p.nome, f)}</span>${f ? `<span class="badge" style="flex:none;font-size:10.5px;background:var(--bg);color:var(--text-mut);border:1px solid var(--border);">${escapeHtml(p.categoria || '')}</span>` : ''}</div>`;
  });
  return out;
}
function mostraListaProcedureTask() {
  const l = h('tProcLista'), c = h('tProceduraCerca'); if (!l || !c) return;
  l.innerHTML = htmlListaProcedureTask(c.value);
  l.style.display = 'block';
}
function nascondiListaProcedureTask() { const l = h('tProcLista'); if (l) l.style.display = 'none'; }
function impostaProceduraTask(id) {
  const sel = h('tProcedura'); if (sel) sel.value = id || '';
  const chip = h('tProcChip'); if (chip) chip.innerHTML = htmlChipProceduraTask(id || null);
  const c = h('tProceduraCerca'); if (c) c.value = '';
  nascondiListaProcedureTask();
}
function tastoProcedureTask(e) {
  const l = h('tProcLista'); if (!l) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); nascondiListaProcedureTask(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
  e.preventDefault();
  if (l.style.display === 'none') mostraListaProcedureTask();
  const righe = Array.from(l.querySelectorAll('.proc-riga'));
  if (!righe.length) return;
  let i = righe.findIndex(r => r.classList.contains('attiva'));
  if (e.key === 'Enter') { impostaProceduraTask(righe[Math.max(i, 0)].dataset.id); return; }
  righe.forEach(r => r.classList.remove('attiva'));
  i = e.key === 'ArrowDown' ? Math.min(righe.length - 1, i + 1) : Math.max(0, i - 1);
  righe[i].classList.add('attiva');
  righe[i].scrollIntoView({ block: 'nearest' });
}
let TASK_BOZZA = null; // campi compilati nel modale task mentre si guarda la procedura collegata (o si modifica una nota)
function modalTaskTeam(taskId, presetClienteId) {
  if (!(TASK_BOZZA && TASK_BOZZA.ripristina)) NOTA_IN_MODIFICA = null;
  const editing = !!taskId;
  const t = editing ? STATE.taskTeam.find(x => x.id === taskId) : {
    id: uid('task'), titolo: '', clienteId: presetClienteId || null, assegnatoA: STATE.meta.responsabili[0] || '',
    scadenza: null, noteStorico: [], stato: 'Da fare', creatoIl: oggiISO(), procedureId: null, descrizione: '', stampaVerbale: false, stampaSezione: 'Libro decisioni dei soci',
  };
  if (editing && !t) { toast('Task non trovato.'); return; }
  if (editing) segnaTaskTeamVisto(t.id); // aprire il task è già "vederlo" - spegne pallino/banner
  const noteStorico = t.noteStorico || [];
  // Sezione note: in creazione è solo una nota iniziale opzionale (il task non esiste ancora, non
  // c'è nulla a cui "appendere"); in modifica diventa lo storico completo + il campo per aggiungerne
  // una nuova, che con "Aggiungi nota" si accoda subito senza chiudere il modale (come modalDettaglioScadenza).
  const sezioneNote = editing
    ? `<div class="field full" style="grid-column:1/-1;">
        <label>Note operative</label>
        ${noteStorico.length
          ? `<div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">${noteStorico.map(n => htmlNotaTask(n, t.id, true)).join('')}</div>`
          : `<div class="helptext" style="margin-bottom:8px;">Nessuna nota operativa ancora su questo task.</div>`}
        <textarea id="tNuovaNota" style="width:100%;min-height:50px;" placeholder="Scrivi una nuova nota operativa..."></textarea>
        <button type="button" class="btn small" style="margin-top:6px;" data-action="task-aggiungi-nota" data-id="${t.id}">Aggiungi nota</button>
      </div>`
    : `<div class="field full" style="grid-column:1/-1;"><label>Nota operativa iniziale (opzionale)</label><textarea id="tNuovaNota" style="width:100%;min-height:60px;"></textarea></div>`;
  // Task #155 (Matteo: "sarebbe carino anche collegare i task alle procedure così da avere un po
  // una linea guida su cosa fare o cosa è stato fatto in quel task" — confermata "opzione 1", la
  // versione semplice): un campo facoltativo che punta a una procedura interna esistente, mostrata
  // come pannello di riferimento (non un semplice link) nella vista di dettaglio/card, più un campo
  // di note di completamento libero - nessun auto-append delle note dentro la procedura stessa.
  const procedureAttive = (STATE.procedureInterne || []).filter(p => p.attivo);
  const categorieProc = Array.from(new Set(procedureAttive.map(p => p.categoria)));
  const selectProcedura = `<div style="flex:1;min-width:0;position:relative;">
    <div id="tProcChip">${htmlChipProceduraTask(t.procedureId)}</div>
    <input type="text" id="tProceduraCerca" data-action="task-cerca-procedura" placeholder="🔍 Cerca una procedura (basta una parola del nome)…" autocomplete="off" onfocus="mostraListaProcedureTask()" onblur="setTimeout(nascondiListaProcedureTask, 150)" onkeydown="tastoProcedureTask(event)" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13.5px;">
    <div id="tProcLista" onmousedown="event.preventDefault()" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:30;max-height:300px;overflow-y:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);"></div>
    <select id="tProcedura" style="display:none;">${opzioniProcedureTask(t.procedureId, '')}</select>
  </div>`;
  const campoProcedura = `<div class="field full" style="grid-column:1/-1;">
    <label>Procedura collegata (opzionale)</label>
    <div style="display:flex;gap:8px;align-items:flex-end;"><div style="flex:1;min-width:0;">
      ${selectProcedura}</div>
      <button type="button" class="btn small" data-action="task-vedi-procedura-selezionata" style="flex:none;height:38px;margin-bottom:0;">👁 Vedi</button>
    </div>
    <div class="helptext" style="margin-top:4px;">Una linea guida su cosa fare in questo task — la procedura resta invariata, qui è solo un riferimento.</div>
  </div>`;
  const campoNoteCompletamento = `<div class="field full" style="grid-column:1/-1;"><label>Descrizione (opzionale)</label><textarea id="tDescrizione" style="width:100%;min-height:60px;" placeholder="Di cosa si tratta, cosa va fatto: compare nell'elenco dei task">${escapeHtml(t.descrizione || '')}</textarea></div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:520px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${editing?'Modifica task':'Nuovo task'}</h2><div class="modal-sub">Assegnalo a te stesso o a un collega, con o senza scadenza.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formTaskTeam" data-id="${t.id}" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Titolo *</label><input id="tTitolo" required value="${escapeHtml(t.titolo)}" placeholder="es. Richiedere visura aggiornata"></div>
          <div class="field"><label>Assegnato a *</label><select id="tAssegnato">${STATE.meta.responsabili.map(r=>`<option ${t.assegnatoA===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}</select></div>
          <div class="field"><label>Cliente (opzionale)</label><select id="tCliente">
            <option value="">— Nessuno (task generale) —</option>
            ${STATE.clienti.slice().sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale)).map(c=>`<option value="${c.id}" ${t.clienteId===c.id?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Scadenza (opzionale)</label><input type="date" id="tScadenza" value="${t.scadenza||''}"></div>
          <div class="field"><label>Stato</label><select id="tStato">${STATI_TASK_TEAM.map(s=>`<option ${t.stato===s?'selected':''}>${s}</option>`).join('')}</select></div>
          ${editing ? htmlStoricoStatiTask(t) : ''}
          <div class="field full" style="grid-column:1/-1;"><label class="checkline" style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="tStampaVerbale" ${t.stampaVerbale ? 'checked' : ''}> A fine pratica va stampato un verbale nei libri sociali</label>
            <div class="helptext" style="margin-top:4px;">Quando il task passa a "Fatto" compare tra i verbali da stampare in Libri sociali (se i libri del cliente sono tenuti dallo studio). Sezione del libro: <select id="tStampaSezione" style="font-size:12px;">${SEZIONI_LIBRO.map(x => `<option ${(t.stampaSezione || 'Libro decisioni dei soci') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
          ${campoProcedura}
          ${htmlCampoPratica(t, editing)}
          ${campoNoteCompletamento}
          ${sezioneNote}
        </div>
      </form>
      <div class="modal-actions">
        ${editing ? `<button class="btn danger" data-action="elimina-task-team" data-id="${t.id}" style="margin-right:auto;">Elimina</button>` : ''}
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-task-team" data-id="${t.id}" data-editing="${editing?'1':'0'}">Salva</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  // ritorno dalla vista della procedura: si rimettono i campi come li aveva lasciati l'utente
  if (TASK_BOZZA && TASK_BOZZA.ripristina && TASK_BOZZA.id === (taskId || null)) {
    Object.keys(TASK_BOZZA.campi).forEach(k => { const f = document.getElementById(k); if (!f) return; if (k === 'tPratica') { f.checked = TASK_BOZZA.campi[k] === '1'; const bx = document.getElementById('tPraticaBox'); if (bx) bx.style.display = f.checked ? 'block' : 'none'; } else f.value = TASK_BOZZA.campi[k]; });
  }
  if (h('tProcedura') && h('tProcChip')) h('tProcChip').innerHTML = htmlChipProceduraTask(h('tProcedura').value || null);
  TASK_BOZZA = null;
}

function aggiungiTaskTeam(t) {
  const task = Object.assign({ id: uid('task'), noteStorico: [], creatoIl: oggiISO() }, t);
  if (!task.creatoIl) task.creatoIl = oggiISO(); // anche se il chiamante (es. ponte MCP/IA) lo passa vuoto
  // Difensivo: un chiamante esterno (es. il ponte MCP) potrebbe non passare uno stato - senza
  // questo default il task risulterebbe comunque "aperto" nei KPI (stato !== 'Fatto') ma
  // invisibile nelle 3 colonne della vista a kanban, che fanno un confronto esatto con
  // STATI_TASK_TEAM: un bug reale, riscontrato in produzione, non solo un'ipotesi difensiva.
  if (!STATI_TASK_TEAM.includes(task.stato)) task.stato = STATI_TASK_TEAM[0];
  // Difensivo: un chiamante esterno (es. il ponte MCP, che non conosce questo modello dati più
  // recente) potrebbe ancora passare un vecchio campo "note" stringa invece di "noteStorico" -
  // lo convertiamo qui in modo che non vada mai perso silenziosamente.
  if (task.note && !(task.noteStorico && task.noteStorico.length)) {
    task.noteStorico = [{ id: uid('nota'), testo: String(task.note).trim(), autore: operatoreCorrente() || null, data: task.creatoIl || oggiISO() }];
  }
  delete task.note;
  // Task #119 (Matteo: "ho creato un task con sabrina per matteo e non c'era nessuna notifica"):
  // ogni task nuovo assegnato a QUALCUN ALTRO rispetto a chi lo crea parte "non visto" - alimenta
  // sia il pallino nella nav (taskTeamNonVistiConteggio) sia il banner in cima alla vista Task team.
  // Se uno crea un task per sé stesso non ha senso "notificarlo": lo sta già facendo lui.
  const creatore = operatoreCorrente() || null;
  task.notificaCreatoDa = creatore;
  task.notificaTipo = 'creato';
  task.notificaVista = !task.assegnatoA || task.assegnatoA === creatore;
  STATE.taskTeam.push(task);
  salvaStato();
  return task;
}
function aggiornaTaskTeam(id, patch) {
  const t = STATE.taskTeam.find(x => x.id === id);
  if (!t) return;
  const attore = operatoreCorrente() || null;
  // Riassegnazione: se cambia l'assegnatario, per il nuovo assegnatario è come se il task fosse
  // appena arrivato - va di nuovo segnalato, anche se il task esisteva già da tempo.
  const cambiaAssegnatario = 'assegnatoA' in patch && patch.assegnatoA !== t.assegnatoA;
  if (cambiaAssegnatario) {
    t.notificaCreatoDa = attore;
    t.notificaTipo = 'riassegnato';
    t.notificaVista = !patch.assegnatoA || patch.assegnatoA === attore;
  } else {
    // Bug segnalato da Matteo (test con l'utenza di Federico: ha modificato un task assegnato a
    // Sabrina e a Sabrina non è arrivata nessuna notifica): prima QUALSIASI modifica a un task
    // esistente che non cambiava l'assegnatario passava sotto silenzio - solo la riassegnazione
    // notificava. Ora un cambiamento sostanziale (titolo/cliente/scadenza/stato) fatto da qualcuno
    // DIVERSO dall'assegnatario riapre la notifica per lui, con dicitura "modificato da" invece di
    // "creato da" (vedi notificaTipo, usato nel banner/riga Task team). Se è l'assegnatario stesso
    // a modificare il proprio task non ha senso notificarlo di sé stesso.
    const campiRilevanti = ['titolo', 'clienteId', 'scadenza', 'stato'];
    const cambiaQualcosaDiRilevante = campiRilevanti.some(k => k in patch && patch[k] !== t[k]);
    if (cambiaQualcosaDiRilevante && t.assegnatoA && attore && t.assegnatoA !== attore) {
      t.notificaCreatoDa = attore;
      t.notificaTipo = 'modificato';
      t.notificaVista = false;
    }
  }
  const statoPrima = t.stato;
  Object.assign(t, patch);
  if ('stato' in patch) { if (t.stato === 'Fatto') { if (!t.fattoIl) t.fattoIl = oggiISO(); } else delete t.fattoIl; }
  if (patch.stato === 'Fatto' && statoPrima !== 'Fatto' && t.pratica && (!t.addebitoPratica || t.addebitoPratica.stato === 'escluso')) t.addebitoPratica = { stato: 'da-confermare', da: oggiISO() };
  if ('stato' in patch && patch.stato !== statoPrima) {
    t.statoDal = oggiISO();
    const voce = t.motivoVoceId && (t.storicoStati || []).find(v => v.id === t.motivoVoceId);
    if (voce && !voce.chiusoIl) voce.chiusoIl = oggiISO();
    delete t.motivoStato; delete t.motivoConfermato; delete t.motivoVoceId;
    if (MOTIVO_IN_MODIFICA === id) MOTIVO_IN_MODIFICA = null;
  }
  // stessa difesa di aggiungiTaskTeam: un patch esterno che tocca "stato" con un valore non tra i
  // 3 riconosciuti lo renderebbe invisibile nel kanban pur restando contato nei KPI.
  if ('stato' in patch && !STATI_TASK_TEAM.includes(t.stato)) t.stato = STATI_TASK_TEAM[0];
  salvaStato();
}
// Etichetta breve per il tipo di notifica di un task (creato/riassegnato/modificato) - usata sia
// nel banner "novità sui tuoi task" sia nel sottotitolo del modale di dettaglio.
function etichettaNotificaTaskTeam(t) {
  return { creato: 'creato', riassegnato: 'riassegnato a te', modificato: 'modificato' }[t.notificaTipo] || 'creato';
}
// Task assegnati all'operatore corrente non ancora visti (nuovi o riassegnati a lui) - usato sia
// per il pallino nella nav sia per il banner in cima alla vista Task team.
function taskTeamNonVistiPerOperatore() {
  const io = operatoreCorrente();
  if (!io) return [];
  return STATE.taskTeam.filter(t => t.assegnatoA === io && t.notificaVista === false);
}
// Task #186: il pallino in sidebar conta anche le eliminazioni non ancora confermate, non solo le
// notifiche di creazione/modifica/riassegnazione - stesso principio per cui #119 esisteva: un
// cambiamento che riguarda l'utente non deve passare inosservato.
function taskTeamNonVistiConteggio() { return taskTeamNonVistiPerOperatore().length + notificheEliminazioniPerOperatore('task').length; }
function segnaTaskTeamVisto(id) {
  const t = STATE.taskTeam.find(x => x.id === id);
  if (t && t.notificaVista === false) {
    t.notificaVista = true;
    salvaStato();
    renderNav(); // il pallino nella sidebar va aggiornato subito, non solo al prossimo render() pieno
  }
}
// Task #186 (Matteo: "notifiche su modifica/eliminazione di task o appuntamenti collegati"):
// registro di notifiche di eliminazione, condiviso tra task team e appuntamenti (tipo li
// distingue). Una voce qui sparisce SOLO quando il diretto interessato la conferma vista - non
// c'è altro "da aprire" come per una modifica, l'oggetto non esiste più. Vedi anche il commento
// su STATE.notificheEliminazioni in statoIniziale().
function notificaEliminazione(tipo, destinatario, titolo, dettaglio) {
  if (!destinatario) return; // nessun assegnatario/consulente collegato: nessuno da avvisare
  const attore = operatoreCorrente() || null;
  if (attore === destinatario) return; // si è cancellato da solo qualcosa di suo: non serve avvisarlo
  if (!STATE.notificheEliminazioni) STATE.notificheEliminazioni = [];
  STATE.notificheEliminazioni.push({ id: uid('notifelim'), tipo, destinatario, titolo, dettaglio: dettaglio || '', eliminatoDa: attore, data: oggiISO() });
}
function notificheEliminazioniPerOperatore(tipo) {
  const io = operatoreCorrente();
  if (!io) return [];
  return (STATE.notificheEliminazioni || []).filter(n => n.tipo === tipo && n.destinatario === io);
}
function segnaNotificaEliminazioneVista(id) {
  const prima = (STATE.notificheEliminazioni || []).length;
  STATE.notificheEliminazioni = (STATE.notificheEliminazioni || []).filter(n => n.id !== id);
  if (STATE.notificheEliminazioni.length !== prima) { salvaStato(); renderNav(); }
}
function eliminaTaskTeam(id) {
  const t = STATE.taskTeam.find(x => x.id === id);
  // Task #186: se il task eliminato era assegnato a qualcun altro, resta traccia nel registro di
  // eliminazioni (vedi sopra) - prima questa funzione cancellava in silenzio, l'assegnatario non
  // scopriva mai che il suo task era sparito se non per caso, guardando la lista.
  if (t && t.assegnatoA) notificaEliminazione('task', t.assegnatoA, t.titolo, t.clienteId ? nomeCliente(t.clienteId) : '');
  STATE.taskTeam = STATE.taskTeam.filter(x => x.id !== id);
  salvaStato();
}

