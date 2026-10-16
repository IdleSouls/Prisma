'use strict';
/* -------------------- ESPORTAZIONE VISTA PER MCP LOCALE --------------------
   A differenza del backup (STATE grezzo, pensato per essere reimportato qui), questa esportazione
   contiene i dati GIÀ CALCOLATI dal motore del gestionale — scadenze generate e classificate, stato
   contabilità desunto dai documenti, ultimo bilancio con KPI — così che un server MCP locale possa
   limitarsi a leggerli e servirli a Claude, senza dover reimplementare altrove (in un altro linguaggio,
   fuori da questo file) la logica di generazione/classificazione. Quella resta unica, sempre la stessa,
   sempre quella testata qui dentro. */
function esportaVistaMCP() {
  const oggi = oggiISO();
  const { tutteScadenze, annuali } = derivati();
  const classi = classificaScadenze(tutteScadenze, oggi);
  const categoriaPerId = new Map();
  classi.scaduti.forEach(s => categoriaPerId.set(s.id, 'scaduto'));
  classi.inScadenza.forEach(s => categoriaPerId.set(s.id, 'in_scadenza'));
  classi.futuri.forEach(s => categoriaPerId.set(s.id, 'futuro'));
  classi.completati.forEach(s => categoriaPerId.set(s.id, 'completato'));

  const scadenzeOut = tutteScadenze.map(s => ({
    id: s.id, data: s.data, clienteId: s.clienteId, cliente: nomeCliente(s.clienteId),
    famiglia: s.famiglia, tipo: s.tipo, nome: s.nome, responsabile: s.responsabile,
    stato: s.stato, categoria: categoriaPerId.get(s.id) || null, nota: s.nota, dataCompletamento: s.dataCompletamento,
    importo: s.conImporto && s.importo != null ? s.importo : null, numeroSolleciti: (s.solleciti || []).length,
    avanzamento: etichettaStatoScadenza(s), avanzamentiPossibili: opzioniAvanzamento(s), conImporto: !!s.conImporto,
    annotazioni: (s.annotazioni || []).map(a => ({ data: a.data, testo: a.testo, autore: a.autore || null })),
  }));

  const clientiOut = STATE.clienti.map(c => {
    const contab = statoAggiornamentoDocumenti(c.id);
    const anniBil = anniBilancioCliente(c.id);
    const ultimoAnno = anniBil.length ? anniBil[anniBil.length - 1] : null;
    const ultimoBilancio = ultimoAnno ? Object.assign({ periodo: ultimoAnno, periodoEtichetta: etichettaEstesaBilancio(ultimoAnno), infraAnnuale: periodoBilancioInfraAnnuale(ultimoAnno) }, calcolaDerivatiBilancio(STATE.bilanci[c.id][ultimoAnno])) : null;
    return {
      id: c.id, ragioneSociale: c.ragioneSociale, tipo: labelTipoCliente(c.tipo), atecoCodici: c.atecoCodici || [],
      stato: c.stato, regimeFiscale: c.regimeFiscale || '', responsabileStudio: c.responsabileStudio || '',
      periodicitaIva: c.periodicitaIva || '', previdenza: c.previdenza || '', tenutaContabilita: c.contabilita || '', addebitoF24: c.addebitoF24 || '',
      codiceFiscale: c.codiceFiscale || '', partitaIva: c.partitaIva || '',
      pmiInnovativa: c.pmiInnovativa || '', startupInnovativa: c.startupInnovativa || '', organoControllo: c.organoControllo || '', haDipendenti: c.haDipendenti || '',
      ...(c.tipo === 'associazione' ? { associazione: datiAssociazione(c) } : {}),
      datiMancanti: livelliMancantiCliente(c),
      contabilita: contab, avvisiCoerenzaContabile: verificaCoerenzaContabile(c.id), ultimoBilancio,
    };
  });

  const taskApertiOut = STATE.taskTeam.filter(t => t.stato !== 'Fatto').map(t => ({
    id: t.id, titolo: t.titolo, clienteId: t.clienteId, cliente: t.clienteId ? nomeCliente(t.clienteId) : null,
    assegnatoA: t.assegnatoA, stato: t.stato, motivoStato: t.motivoStato || '', storicoStati: (t.storicoStati || []).map(v => ({ stato: v.stato, motivo: v.motivo, autore: v.autore, data: v.data, risoltaIl: v.chiusoIl })), scadenza: t.scadenza || null, descrizione: t.descrizione || '', stampaVerbale: !!t.stampaVerbale,
    note: (t.noteStorico || []).map(n => ({ id: n.id, autore: n.autore || null, data: n.data, testo: n.testo, modificata: (n.modifiche || []).length > 0 })),
  }));

  const comRecentiOut = STATE.comunicazioni.slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,30).map(c => ({
    id: c.id, oggetto: c.oggetto, clienteId: c.clienteId, cliente: c.clienteId ? nomeCliente(c.clienteId) : null,
    data: c.data, stato: c.stato,
  }));

  // Preventivi/mandati (task #143): niente "corpo"/"valoriCustom" nell'export - sono il testo
  // integrale del documento, inutile per elencare/filtrare e potenzialmente lungo; chi vuole il
  // testo completo apre il documento nel gestionale. "numeroAttivita" basta a capire a colpo
  // d'occhio se il documento ha attività a listino collegate, senza portarsi dietro lo snapshot.
  const preventiviOut = STATE.preventivi.map(p => ({
    id: p.id, clienteId: p.clienteId, cliente: nomeCliente(p.clienteId), categoria: p.categoria,
    nomeModello: p.nomeModello, oggetto: p.oggetto, importo: p.importo != null ? p.importo : null,
    dataEmissione: p.dataEmissione, validoFino: p.validoFino || null, stato: p.stato,
    creatoIl: p.creatoIl, numeroAttivita: (p.attivitaScelte || []).length,
    mandatoGeneratoId: p.mandatoGeneratoId || null, preventivoOrigineId: p.preventivoOrigineId || null,
  }));

  // Metadati di modelli documento e catalogo attività (task #143): solo ciò che serve per creare un
  // preventivo/mandato via MCP (id, nome, prezzo...) - non il testo dei modelli (corpo), che resta
  // gestito solo dal gestionale.
  const modelliDocumentoOut = STATE.modelliDocumento.filter(m => m.attivo).map(m => ({
    id: m.id, nome: m.nome, categoria: m.categoria, predefinito: !!m.predefinito,
  }));
  const catalogoAttivitaOut = STATE.catalogoAttivitaStudio.map(a => ({
    id: a.id, nome: a.nome, prezzo: a.prezzo != null ? a.prezzo : null,
    richiedeMandato: !!a.richiedeMandato, descrizione: a.descrizione || '',
  }));

  return {
    generatoIl: new Date().toISOString(),
    studioNome: STATE.meta.studioNome,
    annoCorrente: STATE.annoCorrente,
    clienti: clientiOut,
    scadenze: scadenzeOut,
    scadenzeRiepilogo: { scaduti: classi.scaduti.length, inScadenza: classi.inScadenza.length, futuri: classi.futuri.length, completati: classi.completati.length },
    adempimentiAnnuali: annuali.map(a => ({ id: a.id, clienteId: a.clienteId, cliente: nomeCliente(a.clienteId), tipo: a.tipoNome, scadenza: a.scadenza, percentuale: a.percentuale, completato: a.completato, nota: a.nota || '', quadratura770: a.tipoChiave === '770' ? (() => { const q = quadratura770(a.clienteId, a.anno - 1); return q ? { annoRitenute: q.anno, semaforo: q.stato, eccedenza: q.eccedenza, dovute: q.dovuto, daPagare: q.daPagare, versatoF24: q.versatoF24, messaggio: q.messaggio } : null; })() : undefined, fasi: a.sotto.map(x => ({ nome: x.nome, completato: x.completato, data: x.data, responsabile: x.responsabile, completatoDa: x.completatoDa || null })) })),
    taskApertiCount: taskApertiOut.length,
    taskAperti: taskApertiOut,
    comunicazioniRecenti: comRecentiOut,
    preventivi: preventiviOut,
    modelliDocumento: modelliDocumentoOut,
    catalogoAttivitaStudio: catalogoAttivitaOut,
    comunicazioniRicorrenti: (STATE.comunicazioniRicorrenti || []).map(t => ({
      id: t.id, oggetto: t.oggetto, corpo: t.corpo, categoria: t.categoria, frequenza: t.frequenza, giorno: t.giorno, mese: t.mese,
      attiva: !!t.attiva, destinatari: t.destinatari || { modo: 'tutti', clienteIds: [] },
    })),
    antiriciclaggio: clientiOut.map(c => {
      const f = STATE.antiriciclaggio[c.id];
      if (!f) return { clienteId: c.id, cliente: nomeCliente(c.id), fascicolo: false };
      return { clienteId: c.id, cliente: nomeCliente(c.id), fascicolo: true, profiloRischio: f.profiloRischio || 'Non valutato',
        dataAdeguataVerifica: f.dataAdeguataVerifica || null, scadenzaRevisione: f.scadenzaRevisione || null,
        completamentoPercentuale: percentualeAntiriciclaggio(f), checklist: f.checklist || {}, noteStorico: (f.storico || []).length };
    }),
    bilanci: Object.keys(STATE.bilanci || {}).map(cid => ({
      clienteId: cid, cliente: nomeCliente(cid),
      periodi: anniBilancioCliente(cid).map(per => ({ periodo: per, voci: STATE.bilanci[cid][per], indici: calcolaDerivatiBilancio(STATE.bilanci[cid][per]) })),
    })),
    moduli: MODULI.map(m => ({ id: m.id, nome: m.label, attivo: moduloAttivo(m.id) })),
    team: { responsabili: STATE.meta.responsabili || [], consulenti: STATE.meta.consulenti || [], ruoli: STATE.meta.ruoli || {} },
    cruscotto: datiCruscotto(),
    libriSociali: (STATE.libriSociali || []).map(l => ({ id: l.id, clienteId: l.clienteId, cliente: nomeCliente(l.clienteId), tipo: l.tipo, statoFisico: statoFisicoLibro(l), detenutoDa: l.detenutoDa, detentoreNote: l.detentoreNote, ultimaStampa: l.ultimaStampa, ultimaPagina: l.ultimaPagina, vidimazione: l.vidimazione, note: l.note })),
    attivitaFatturabili: (STATE.attivitaFatturabili || []).map(a => ({ id: a.id, clienteId: a.clienteId, cliente: nomeCliente(a.clienteId), data: a.data, descrizione: a.descrizione, importo: a.importo, stato: a.stato, fatturaNumero: a.fatturaNumero, fatturaData: a.fatturaData })),
    incassi: (STATE.incassi || []).map(i => ({ id: i.id, clienteId: i.clienteId, cliente: nomeCliente(i.clienteId), descrizione: i.descrizione, numero: i.numero, importo: i.importo, incassato: i.importoIncassato || 0, residuo: residuoIncasso(i), dataEmissione: i.dataEmissione, dataScadenza: i.dataScadenza, stato: statoIncasso(i), solleciti: (i.solleciti || []).length })),
    appuntamenti: (STATE.appuntamenti || []).map(a => ({
      id: a.id, clienteId: a.clienteId || null, cliente: a.clienteId ? nomeCliente(a.clienteId) : null, data: a.data, ora: a.ora || '',
      durataMinuti: a.durataMinuti, oggetto: a.oggetto, note: a.note || '', stato: a.stato, consulente: a.consulente || null,
      motivo: a.motivo || null, procedureId: a.procedureId || null, prenotatoDaSegreteria: !!a.prenotatoDaSegreteria,
    })),
    procedureInterne: (STATE.procedureInterne || []).map(p => ({
      id: p.id, categoria: p.categoria, nome: p.nome, contenuto: p.contenuto, checklistDocumenti: p.checklistDocumenti || [],
      attivo: !!p.attivo, motiviAppuntamento: p.motiviAppuntamento || [],
    })),
    // Solo metadati dei documenti (mai il contenuto dei file).
    documenti: (STATE.documenti || []).map(d => ({
      id: d.id, clienteId: d.clienteId, cliente: nomeCliente(d.clienteId), categoria: d.categoria, nome: d.nome,
      dataCaricamento: d.dataCaricamento || null, dataScadenza: d.dataScadenza || null,
    })),
    ritenute: (STATE.ritenuteRighe || []).map(r => ({
      id: r.id, clienteId: r.clienteId, cliente: nomeCliente(r.clienteId), dataFattura: r.dataFattura, dataPagamento: r.dataPagamento || null,
      numeroFattura: r.numeroFattura, percipiente: r.percipiente, importo: r.importo, stato: r.statoRit,
    })),
  };
}

/* Scarica un file di testo (JSON) sul dispositivo dell'utente. Quando la pagina gira come
   Artifact pubblicato su claude.ai il classico "blob + <a download> + click()" è bloccato dalla
   sandbox del viewer (vale anche se la capability "downloads" non è dichiarata: il download
   avviato dalla pagina stessa è comunque inerte lì) — in quel contesto va usata la capability
   dedicata. Quando invece il file è aperto localmente (window.claude non esiste) resta il metodo
   di sempre, che funziona senza bisogno di nulla in più. */
async function salvaFileScaricabile(filename, contenutoTesto) {
  if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        try {
          await downloads.save({ filename, data: contenutoTesto });
          return true;
        } catch (err) {
          if (err && err.code === 'declined') return false; // l'utente ha annullato dal proprio dialogo di salvataggio: non è un errore
          throw err;
        }
      }
    } catch (err) {
      console.error('Download via capability non riuscito, provo il metodo per file locale', err);
    }
  }
  // Se il chiamante ha già preparato un Blob (es. un file Excel binario), va usato così com'è:
  // ricrearlo forzando type:'application/json' ne corromperebbe il tipo dichiarato.
  const blob = (contenutoTesto instanceof Blob) ? contenutoTesto : new Blob([contenutoTesto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/* Dati di collegamento per le IA via URL (ChatGPT, Gemini...). Il server MCP HTTP gira su questo PC
   (porta 8423); ChatGPT lo raggiunge solo da un indirizzo https pubblico, quindi serve un tunnel
   (ngrok o Cloudflare) verso quella porta: qui si incolla l'indirizzo del tunnel e Prisma compone
   l'URL completo. Il token è la chiave: chi lo ha può leggere i dati dello studio. */
function apriModalIaCollegamento() {
  fetch('/api/ia-collegamento', { cache: 'no-store' }).then(r => r.json()).then(d => {
    if (!d || !d.ok) throw new Error((d && d.errore) || 'non disponibile');
    const tokenTxt = d.token || '';
    let base = '';
    try { base = localStorage.getItem('prismaIaTunnel_v1') || ''; } catch (e) {}
    const stato = d.attivo
      ? '<span class="badge attivo">Server IA attivo su questo PC</span>'
      : '<span class="badge stato-errore">Server IA non attivo</span> <span class="helptext">Serve Node.js 18+ e la cartella mcp-server installata (<code>npm install</code>). Poi riavvia Prisma.</span>';
    h('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><h2>Collega ChatGPT, Gemini e altre IA</h2><div class="modal-sub">${stato}</div></div><button class="icon-x" data-action="chiudi-modal">×</button></div>
      <div class="helptext" style="margin:10px 0;">La chiave qui sotto dà accesso ai dati dello studio: non condividerla e non incollarla in chat pubbliche. Se pensi sia finita in mani sbagliate, generane una nuova.</div>
      <div class="field"><label>Chiave di collegamento</label><div style="display:flex;gap:8px;"><input id="iaToken" readonly value="${escapeHtml(tokenTxt)}"><button class="btn" data-action="ia-copia" data-src="iaToken">Copia</button></div></div>
      <div class="field"><label>Gemini CLI e client su questo PC: indirizzo</label><div style="display:flex;gap:8px;"><input id="iaLocale" readonly value="http://127.0.0.1:${d.porta}/mcp"><button class="btn" data-action="ia-copia" data-src="iaLocale">Copia</button></div><div class="helptext">Da usare con l'intestazione <code>Authorization: Bearer &lt;chiave&gt;</code>.</div></div>
      <div class="field"><label>ChatGPT e IA online: indirizzo https pubblico del tunnel (verso la porta ${d.porta})</label><input id="iaTunnel" placeholder="es. https://xxxx.ngrok-free.app" value="${escapeHtml(base)}"></div>
      <div class="field"><label>URL da incollare in ChatGPT (e simili)</label><div style="display:flex;gap:8px;"><input id="iaUrlPubblico" readonly value=""><button class="btn" data-action="ia-copia" data-src="iaUrlPubblico">Copia</button></div></div>
      <div class="modal-actions"><button class="btn" data-action="ia-nuovo-token">Genera nuova chiave</button><button class="btn primary" data-action="chiudi-modal">Chiudi</button></div>
    </div></div>`;
    aggiornaIaUrlPubblico();
    const t = document.getElementById('iaTunnel');
    if (t) t.addEventListener('input', aggiornaIaUrlPubblico);
  }).catch(err => toast('Collegamento IA non disponibile: ' + err.message + ' (apri Prisma da questo PC).', true));
}
function aggiornaIaUrlPubblico() {
  const t = document.getElementById('iaTunnel'), k = document.getElementById('iaToken'), o = document.getElementById('iaUrlPubblico');
  if (!t || !k || !o) return;
  let b = t.value.trim().replace(/\/+$/, '');
  try { localStorage.setItem('prismaIaTunnel_v1', b); } catch (e) {}
  o.value = /^https:\/\//i.test(b) ? b + '/mcp/' + k.value : '';
  o.placeholder = 'Incolla prima l\'indirizzo https del tunnel';
}
function nuovoTokenIa() {
  if (!confermaAzione('Generare una nuova chiave? Le IA già collegate smetteranno di funzionare finché non aggiorni l\'indirizzo.')) return;
  fetch('/api/ia-nuovo-token', { method: 'POST' }).then(r => r.json()).then(() => {
    toast('Chiave eliminata: ne verrà creata una nuova al prossimo avvio del server IA (riavvia Prisma).');
    chiudiModal();
  }).catch(() => toast('Operazione non riuscita.', true));
}

async function esportaMCP() {
  try {
    const vista = esportaVistaMCP();
    const ok = await salvaFileScaricabile('gestionale-mcp.json', JSON.stringify(vista, null, 2));
    if (ok) toast('Vista per MCP esportata.');
  } catch (err) {
    console.error('Esportazione vista MCP non riuscita', err);
    alert('Impossibile esportare in questo browser. Prova ad aprire il file in Chrome, Firefox o Edge aggiornati.');
  }
}

/* -------------------- GESTIONE ANNUALITÀ (task #147) -------------------- */
/* Annualità per cui è già stato scaricato un backup mirato in QUESTA sessione di navigazione —
   solo un promemoria in-memory (si azzera al reload): il vero blocco resta comunque il confirm()
   con l'elenco di conteggi prima di ogni eliminazione, qui sotto in eliminaDatiAnno(). */
let ANNI_ESPORTATI_SESSIONE = new Set();

function aggiungiAnnoGestito(anno) {
  if (!STATE.meta.anniExtra) STATE.meta.anniExtra = [];
  if (!STATE.meta.anniExtra.includes(anno)) { STATE.meta.anniExtra.push(anno); salvaStato(); }
}
function rimuoviAnnoGestito(anno) {
  if (!STATE.meta.anniExtra) return;
  STATE.meta.anniExtra = STATE.meta.anniExtra.filter(a => a !== anno);
  salvaStato();
}

/* Anni per cui esiste almeno un dato in STATE, calcolati dai campi data reali (non un intervallo
   arbitrario): alimenta il selettore di "Backup e pulizia di un'annualità" qui sotto. */
function anniConDatiRilevati() {
  const anni = new Set([STATE.annoCorrente]);
  const add = v => { if (!v) return; const y = parseInt(String(v).slice(0, 4), 10); if (!isNaN(y)) anni.add(y); };
  Object.keys(STATE.scadenzeOverrides || {}).forEach(add);
  Object.keys(STATE.annualiOverrides || {}).forEach(add);
  (STATE.ritenuteRighe || []).forEach(r => add(r.dataFattura));
  (STATE.f24 || []).forEach(f => add(f.data));
  (STATE.comunicazioni || []).forEach(c => add(c.data));
  (STATE.documenti || []).forEach(d => add(d.dataCaricamento));
  (STATE.taskTeam || []).forEach(t => add(t.scadenza));
  (STATE.preventivi || []).forEach(p => add(p.dataEmissione));
  Object.values(STATE.bilanci || {}).forEach(perCliente => Object.keys(perCliente || {}).forEach(add));
  Object.values(STATE.movimentiContabili || {}).forEach(arr => (arr || []).forEach(m => add(m.data)));
  Object.values(STATE.fattureContabili || {}).forEach(arr => (arr || []).forEach(f => add(f.data)));
  Object.values(STATE.documentiContabili || {}).forEach(arr => (arr || []).forEach(d => add(d.dataRiferimento)));
  return Array.from(anni).sort((a, b) => a - b);
}

/* Raccoglie, per una singola annualità, tutti i record di STATE che le appartengono — usato sia
   per l'export mirato sia per l'eliminazione, così le due operazioni vedono sempre lo stesso
   identico insieme di dati (nessun rischio che l'export dimentichi qualcosa che poi verrà cancellato). */
function raccogliDatiAnno(anno) {
  const a = String(anno);
  const scadenzeChiavi = Object.keys(STATE.scadenzeOverrides || {}).filter(k => k.startsWith(a + '-'));
  const annualiChiavi = Object.keys(STATE.annualiOverrides || {}).filter(k => k.startsWith(a + '|'));
  const ritenute = (STATE.ritenuteRighe || []).filter(r => (r.dataFattura || '').startsWith(a));
  const f24 = (STATE.f24 || []).filter(f => (f.data || '').startsWith(a));
  const comunicazioni = (STATE.comunicazioni || []).filter(c => (c.data || '').startsWith(a));
  const documenti = (STATE.documenti || []).filter(d => (d.dataCaricamento || '').startsWith(a));
  const taskTeam = (STATE.taskTeam || []).filter(t => (t.scadenza || '').startsWith(a));
  const preventivi = (STATE.preventivi || []).filter(p => (p.dataEmissione || '').startsWith(a));
  const bilanciVoci = [];
  Object.keys(STATE.bilanci || {}).forEach(clienteId => {
    Object.keys(STATE.bilanci[clienteId] || {}).forEach(periodo => { if (String(periodo).startsWith(a)) bilanciVoci.push({ clienteId, periodo }); });
  });
  const movimenti = [];
  Object.keys(STATE.movimentiContabili || {}).forEach(clienteId => {
    (STATE.movimentiContabili[clienteId] || []).forEach(m => { if ((m.data || '').startsWith(a)) movimenti.push({ clienteId, id: m.id }); });
  });
  const fatture = [];
  Object.keys(STATE.fattureContabili || {}).forEach(clienteId => {
    (STATE.fattureContabili[clienteId] || []).forEach(f => { if ((f.data || '').startsWith(a)) fatture.push({ clienteId, id: f.id }); });
  });
  const documentiContabili = [];
  Object.keys(STATE.documentiContabili || {}).forEach(clienteId => {
    (STATE.documentiContabili[clienteId] || []).forEach(d => { if ((d.dataRiferimento || '').startsWith(a)) documentiContabili.push({ clienteId, id: d.id }); });
  });
  return { scadenzeChiavi, annualiChiavi, ritenute, f24, comunicazioni, documenti, taskTeam, preventivi, bilanciVoci, movimenti, fatture, documentiContabili };
}

function riepilogoDatiAnno(anno) {
  const d = raccogliDatiAnno(anno);
  return [
    { etichetta: 'Scadenze periodiche (stati/note salvati)', n: d.scadenzeChiavi.length },
    { etichetta: 'Adempimenti annuali (avanzamento salvato)', n: d.annualiChiavi.length },
    { etichetta: "Righe ritenute d'acconto", n: d.ritenute.length },
    { etichetta: 'F24 registrati', n: d.f24.length },
    { etichetta: 'Comunicazioni', n: d.comunicazioni.length },
    { etichetta: 'Documenti clienti', n: d.documenti.length },
    { etichetta: 'Task team con scadenza in quest\'anno', n: d.taskTeam.length },
    { etichetta: 'Preventivi e mandati', n: d.preventivi.length },
    { etichetta: 'Bilanci caricati', n: d.bilanciVoci.length },
    { etichetta: 'Movimenti contabili (mastrino)', n: d.movimenti.length },
    { etichetta: 'Fatture contabili', n: d.fatture.length },
    { etichetta: 'Documenti contabili (mastrini/fatture caricate)', n: d.documentiContabili.length },
  ];
}

async function esportaDatiAnno(anno) {
  const d = raccogliDatiAnno(anno);
  const payload = {
    annoEsportato: anno, esportatoIl: oggiISO(), studioNome: STATE.meta.studioNome,
    scadenzeOverrides: Object.fromEntries(d.scadenzeChiavi.map(k => [k, STATE.scadenzeOverrides[k]])),
    annualiOverrides: Object.fromEntries(d.annualiChiavi.map(k => [k, STATE.annualiOverrides[k]])),
    ritenuteRighe: d.ritenute, f24: d.f24, comunicazioni: d.comunicazioni, documenti: d.documenti,
    taskTeam: d.taskTeam, preventivi: d.preventivi,
    bilanci: d.bilanciVoci.map(v => ({ clienteId: v.clienteId, periodo: v.periodo, dati: STATE.bilanci[v.clienteId][v.periodo] })),
    movimentiContabili: d.movimenti.map(v => ({ clienteId: v.clienteId, dati: (STATE.movimentiContabili[v.clienteId] || []).find(m => m.id === v.id) })),
    fattureContabili: d.fatture.map(v => ({ clienteId: v.clienteId, dati: (STATE.fattureContabili[v.clienteId] || []).find(f => f.id === v.id) })),
    documentiContabili: d.documentiContabili.map(v => ({ clienteId: v.clienteId, dati: (STATE.documentiContabili[v.clienteId] || []).find(x => x.id === v.id) })),
  };
  try {
    const ok = await salvaFileScaricabile(`prisma-backup-annualita-${anno}-${oggiISO()}.json`, JSON.stringify(payload, null, 2));
    if (ok) { ANNI_ESPORTATI_SESSIONE.add(anno); toast(`Backup dell'annualità ${anno} esportato.`); }
  } catch (err) {
    console.error('Esportazione dati annualità non riuscita', err);
    alert('Impossibile esportare il backup in questo browser. Prova ad aprire il file in Chrome, Firefox o Edge aggiornati.');
  }
}

/* Elimina definitivamente da STATE tutti i dati di un'annualità. Riusa gli elimina* esistenti
   dove ce n'è uno (gestiscono anche la pulizia dei file caricati fisicamente) invece di manipolare
   gli array a mano, per non riscrivere/disallineare quella logica in un secondo punto del codice. */
function eliminaDatiAnno(anno) {
  const d = raccogliDatiAnno(anno);
  const riepilogo = riepilogoDatiAnno(anno).filter(r => r.n > 0);
  const totale = riepilogo.reduce((s, r) => s + r.n, 0);
  if (totale === 0) { toast(`Nessun dato trovato in Prisma per l'annualità ${anno}.`); return; }
  const avviso = ANNI_ESPORTATI_SESSIONE.has(anno) ? '' : "\n\nATTENZIONE: non risulta un backup di quest'annualità esportato in questa sessione.";
  const elenco = riepilogo.map(r => `• ${r.etichetta}: ${r.n}`).join('\n');
  const msg = `Stai per eliminare definitivamente da Prisma questi dati dell'annualità ${anno}:\n\n${elenco}\n\nAnagrafica clienti, fascicoli antiriciclaggio, catalogo attività, modelli documento e credenziali NON vengono toccati — solo i dati datati ${anno}.${avviso}\n\nVerifica i tuoi obblighi di conservazione documentale prima di procedere. Confermi l'eliminazione?`;
  if (!confermaAzione(msg)) return;

  d.scadenzeChiavi.forEach(k => delete STATE.scadenzeOverrides[k]);
  d.annualiChiavi.forEach(k => delete STATE.annualiOverrides[k]);
  STATE.ritenuteRighe = (STATE.ritenuteRighe || []).filter(r => !d.ritenute.includes(r));
  d.f24.forEach(f => eliminaF24(f.id));
  d.comunicazioni.forEach(c => eliminaComunicazione(c.id));
  d.documenti.forEach(doc => eliminaDocumento(doc.id));
  d.taskTeam.forEach(t => eliminaTaskTeam(t.id));
  d.preventivi.forEach(p => eliminaPreventivo(p.id));
  d.bilanciVoci.forEach(v => eliminaBilancioAnno(v.clienteId, v.periodo));
  d.movimenti.forEach(v => { STATE.movimentiContabili[v.clienteId] = (STATE.movimentiContabili[v.clienteId] || []).filter(m => m.id !== v.id); });
  d.fatture.forEach(v => { STATE.fattureContabili[v.clienteId] = (STATE.fattureContabili[v.clienteId] || []).filter(f => f.id !== v.id); });
  d.documentiContabili.forEach(v => eliminaDocumentoContabile(v.clienteId, v.id));

  // Task #189 (Matteo: "se cancello un'annualità vorrei che si disattivasse dalle annualità
  // selezionabili"): se l'anno era stato aggiunto manualmente al selettore in alto (anniExtra), ora
  // che i suoi dati non ci sono più non ha senso restasse lì selezionabile - lo togliamo. Se era
  // anche l'anno correntemente selezionato, si torna all'anno reale (stesso comportamento già
  // usato da "rimuovi-anno-gestito"). Non tocchiamo invece il selettore "Backup e pulizia" qui
  // sopra: quello (anniConDatiRilevati) si ricalcola da solo dai dati rimasti, quindi l'anno
  // sparisce automaticamente al prossimo render.
  rimuoviAnnoGestito(anno);
  if (STATE.annoCorrente === anno) STATE.annoCorrente = new Date().getFullYear();

  salvaStato();
  render();
  toast(`Dati dell'annualità ${anno} eliminati (${totale} elementi) e annualità disattivata dal selettore.`);
}

/* Task #189 (Matteo: "se dovessi rivedere i dati di un'annualità eliminata avrei dovuto esportarli
   prima e poi reimportarli per controllare le cose - aggiungiamo la possibilità di reimportare"):
   legge un file esportato da esportaDatiAnno() e RIUNISCE i record al loro posto in STATE, invece
   di sovrascrivere tutto come fa importaBackup() (quello è pensato per un ripristino totale, non
   per reinserire un singolo anno dentro dati che nel frattempo sono andati avanti). Per ogni
   categoria: niente duplicati se un id è già presente (reimport ripetuto = no-op sicuro, non crea
   doppioni), e si avvisa chiaramente che gli allegati fisici (documenti/documenti contabili) NON
   tornano - solo i metadati: eliminaDocumento/eliminaDocumentoContabile cancellano anche il file
   vero e proprio dal disco, che il JSON esportato non contiene. */
function importaDatiAnno(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    inputEl.value = '';
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !parsed.annoEsportato) throw new Error('non è un backup di annualità valido (manca annoEsportato)');
    } catch (err) {
      alert('File non valido: ' + err.message);
      return;
    }
    const anno = parsed.annoEsportato;
    const msg = `Reimportare i dati dell'annualità ${anno} (esportati il ${parsed.esportatoIl || '—'})? Verranno riaggiunti a quelli già presenti in Prisma, senza toccare nient'altro - un elemento già presente (stesso id) non viene duplicato.\n\nNota: eventuali documenti/documenti contabili allegati mostreranno di nuovo la voce in elenco, ma il FILE caricato non può essere recuperato (viene eliminato definitivamente quando elimini l'annualità) - solo i dati e i metadati tornano.`;
    if (!confermaAzione(msg)) return;
    const esito = fondiDatiAnno(parsed);
    salvaStato();
    render();
    toast(`Annualità ${anno} reimportata: ${esito.aggiunti} elementi riaggiunti${esito.giaPresenti ? `, ${esito.giaPresenti} già presenti (ignorati)` : ''}.`);
  };
  reader.readAsText(file);
}

/* Riunisce il payload di un export-annualità in STATE. Ritorna {aggiunti, giaPresenti} per il
   messaggio di conferma - usata sia da importaDatiAnno() sia dai test automatici. */
function fondiDatiAnno(payload) {
  let aggiunti = 0, giaPresenti = 0;
  const fondiChiave = (dest, chiave, valore) => {
    if (dest[chiave] !== undefined) { giaPresenti++; return; }
    dest[chiave] = valore; aggiunti++;
  };
  const fondiArray = (arr, record) => {
    if (arr.some(x => x.id === record.id)) { giaPresenti++; return; }
    arr.push(record); aggiunti++;
  };
  if (!STATE.scadenzeOverrides) STATE.scadenzeOverrides = {};
  Object.entries(payload.scadenzeOverrides || {}).forEach(([k, v]) => fondiChiave(STATE.scadenzeOverrides, k, v));
  if (!STATE.annualiOverrides) STATE.annualiOverrides = {};
  Object.entries(payload.annualiOverrides || {}).forEach(([k, v]) => fondiChiave(STATE.annualiOverrides, k, v));
  if (!STATE.ritenuteRighe) STATE.ritenuteRighe = [];
  (payload.ritenuteRighe || []).forEach(r => fondiArray(STATE.ritenuteRighe, r));
  if (!STATE.f24) STATE.f24 = [];
  (payload.f24 || []).forEach(f => fondiArray(STATE.f24, f));
  if (!STATE.comunicazioni) STATE.comunicazioni = [];
  (payload.comunicazioni || []).forEach(c => fondiArray(STATE.comunicazioni, c));
  if (!STATE.documenti) STATE.documenti = [];
  (payload.documenti || []).forEach(d => fondiArray(STATE.documenti, d));
  if (!STATE.taskTeam) STATE.taskTeam = [];
  (payload.taskTeam || []).forEach(t => fondiArray(STATE.taskTeam, t));
  if (!STATE.preventivi) STATE.preventivi = [];
  (payload.preventivi || []).forEach(p => fondiArray(STATE.preventivi, p));
  if (!STATE.bilanci) STATE.bilanci = {};
  (payload.bilanci || []).forEach(v => {
    if (!v || !v.clienteId || !v.periodo) return;
    if (!STATE.bilanci[v.clienteId]) STATE.bilanci[v.clienteId] = {};
    fondiChiave(STATE.bilanci[v.clienteId], v.periodo, v.dati);
  });
  if (!STATE.movimentiContabili) STATE.movimentiContabili = {};
  (payload.movimentiContabili || []).forEach(v => {
    if (!v || !v.clienteId || !v.dati) return;
    if (!STATE.movimentiContabili[v.clienteId]) STATE.movimentiContabili[v.clienteId] = [];
    fondiArray(STATE.movimentiContabili[v.clienteId], v.dati);
  });
  if (!STATE.fattureContabili) STATE.fattureContabili = {};
  (payload.fattureContabili || []).forEach(v => {
    if (!v || !v.clienteId || !v.dati) return;
    if (!STATE.fattureContabili[v.clienteId]) STATE.fattureContabili[v.clienteId] = [];
    fondiArray(STATE.fattureContabili[v.clienteId], v.dati);
  });
  if (!STATE.documentiContabili) STATE.documentiContabili = {};
  (payload.documentiContabili || []).forEach(v => {
    if (!v || !v.clienteId || !v.dati) return;
    if (!STATE.documentiContabili[v.clienteId]) STATE.documentiContabili[v.clienteId] = [];
    fondiArray(STATE.documentiContabili[v.clienteId], v.dati);
  });
  // L'anno torna ad avere dati: se non rientra nella finestra automatica (anno corrente ±1) lo
  // riaggiungiamo al selettore in alto, altrimenti resterebbe reimportato ma non selezionabile.
  if (payload.annoEsportato) aggiungiAnnoGestito(payload.annoEsportato);
  return { aggiunti, giaPresenti };
}

async function esportaBackup() {
  try {
    const ok = await salvaFileScaricabile(`gestionale-backup-${oggiISO()}.json`, JSON.stringify(STATE, null, 2));
    if (ok) { toast('Backup esportato.'); STATE.meta.backupFatto = true; salvaStato(); }
  } catch (err) {
    console.error('Esportazione backup non riuscita', err);
    alert('Impossibile esportare il backup in questo browser. Prova ad aprire il file in Chrome, Firefox o Edge aggiornati.');
  }
}
function importaBackup(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.clienti)) throw new Error('formato non valido');
      if (!confermaAzione('Importare questo backup? Sovrascriverà tutti i dati attuali.')) return;
      STATE = normalizzaStatoCaricato(parsed);
      salvaStato(); render(); toast('Backup importato correttamente.');
    } catch (err) {
      alert('File non valido: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function init() {
  caricaStato();
  caricaOperatoreLocale();
  caricaDeviceIdLocale();
  caricaSessioneOperatoreLocale();
  caricaNavGruppiApertiLocale();
  generaComunicazioniRicorrentiDovute();
  document.body.addEventListener('click', onClickDelegato);
  document.body.addEventListener('change', onChangeDelegato);
  document.body.addEventListener('input', onInputDelegato);
  document.body.addEventListener('focusout', onFocusOutDelegato);
  document.body.addEventListener('dragover', onDragOverDelegato);
  document.body.addEventListener('dragleave', onDragLeaveDelegato);
  document.body.addEventListener('drop', onDropDelegato);
  // Task #202: vedi FINESTRA_HA_FOCUS sopra - un dialog nativo (scegli file, stampa...) toglie il
  // focus alla finestra senza che il DOM lo sappia in nessun altro modo.
  window.addEventListener('blur', () => { FINESTRA_HA_FOCUS = false; });
  window.addEventListener('focus', () => { FINESTRA_HA_FOCUS = true; });
  // Task #188: ogni volta che #modalRoot cambia contenuto (apertura di un modal, o un modal che si
  // ri-apre su se stesso dopo un salvataggio) si ri-fotografa lo stato dei campi come nuova
  // "baseline" - childList basta perché i modali vengono montati con innerHTML = html, mai con
  // append incrementali.
  new MutationObserver(() => { MODAL_SNAPSHOT = serializzaModal(); }).observe(h('modalRoot'), { childList: true });
  h('navMenu').addEventListener('click', (e) => {
    const stella = e.target.closest('.nav-star');
    if (stella) { toggleNavPreferito(stella.dataset.star); renderNav(); return; } // la stellina non naviga
    const ed = e.target.closest('[data-navedit]');
    if (ed) {
      const az = ed.dataset.navedit;
      if (az === 'inizia') NAV_MODIFICA = true;
      else if (az === 'fine') NAV_MODIFICA = false;
      else if (az === 'reset') { ripristinaNavLayout(); toast('Menu ripristinato al layout standard.'); }
      renderNav(); return;
    }
    if (NAV_MODIFICA) return; // in "Personalizza menu" le voci non navigano
    const el = e.target.closest('[data-nav]');
    if (el) setView(el.dataset.nav);
  });
  // Drag & drop del menu (solo in modalità "Personalizza menu"): vedi riordinaNav
  {
    const nm = h('navMenu');
    let trascinato = null;
    const bersaglio = (e) => e.target.closest && e.target.closest('[data-drag]');
    const pulisci = () => nm.querySelectorAll('.drag-prima,.drag-dopo,.drag-dentro,.trascinato').forEach(x => x.classList.remove('drag-prima', 'drag-dopo', 'drag-dentro', 'trascinato'));
    const metaBassa = (e, el) => { const r = el.getBoundingClientRect(); return (e.clientY - r.top) > r.height / 2; };
    nm.addEventListener('dragstart', (e) => {
      const el = bersaglio(e);
      if (!NAV_MODIFICA || !el) return;
      trascinato = { tipo: el.dataset.drag, id: el.dataset.id };
      el.classList.add('trascinato');
      if (e.dataTransfer) { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id); } catch (err) { /* jsdom */ } }
    });
    nm.addEventListener('dragover', (e) => {
      const el = bersaglio(e);
      if (!NAV_MODIFICA || !trascinato || !el) return;
      e.preventDefault();
      nm.querySelectorAll('.drag-prima,.drag-dopo,.drag-dentro').forEach(x => x.classList.remove('drag-prima', 'drag-dopo', 'drag-dentro'));
      if (trascinato.tipo === 'voce' && el.dataset.drag === 'gruppo') el.classList.add('drag-dentro');
      else el.classList.add(metaBassa(e, el) ? 'drag-dopo' : 'drag-prima');
    });
    nm.addEventListener('drop', (e) => {
      const el = bersaglio(e);
      if (!NAV_MODIFICA || !trascinato || !el) return;
      e.preventDefault();
      const dopo = !(trascinato.tipo === 'voce' && el.dataset.drag === 'gruppo') && metaBassa(e, el);
      const fatto = riordinaNav(trascinato.tipo, trascinato.id, el.dataset.drag, el.dataset.id, dopo);
      trascinato = null; pulisci();
      if (fatto) renderNav();
    });
    nm.addEventListener('dragend', () => { trascinato = null; pulisci(); });
  }
  h('annoSelect').addEventListener('change', (e) => {
    STATE.annoCorrente = Number(e.target.value);
    salvaStato(); render();
  });
  // Frecce di navigazione: Alt+Freccia sinistra/destra e tasti laterali del mouse (indietro/avanti), come nel browser.
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'checkbox') return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') navIndietro(); else navAvanti();
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); navIndietro(); } else if (e.button === 4) { e.preventDefault(); navAvanti(); } });
  // Ricerca globale: Ctrl/Cmd+K apre la ricerca da qualsiasi punto dell'app (non solo dal
  // pulsante in topbar); frecce/Invio/Esc la navigano una volta aperta.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      modalRicercaGlobale();
      return;
    }
    // Task #203: se l'overlay di conferma chiusura è aperto, Esc lo tratta come "Continua a
    // modificare" (scelta sicura, mai perdita dati) invece di richiamare chiediPrimaDiChiudereModal
    // sul modal sottostante - altrimenti con Esc ripetuto si rischierebbe di aprirne un secondo.
    if (e.key === 'Escape' && h('confermaChiusuraOverlay')) { chiudiConfermaChiusuraModal(); return; }
    // Esc chiude qualsiasi overlay montato in #modalRoot (modali standard, ricerca globale,
    // anteprima a schermo intero del portale cliente) — non solo la ricerca.
    if (e.key === 'Escape' && h('modalRoot').children.length) { chiediPrimaDiChiudereModal(); return; }
    // Invio invia il messaggio in chat (Maiusc+Invio va a capo normalmente) - task Matteo: "nella
    // chat se premo invio non manda il messaggio, facciamo in modo di si invece".
    if (e.target && e.target.matches && e.target.matches('input[data-action="task-motivo"]') && e.key === 'Enter') {
      e.preventDefault();
      const btn = document.querySelector('[data-action="task-motivo-conferma"][data-id="' + e.target.dataset.id + '"]');
      if (btn) btn.click();
      return;
    }
    if (e.target && e.target.id === 'chatTesto' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const btn = document.querySelector('[data-action="chat-invia"]');
      if (btn) btn.click();
      return;
    }
    const cercaAperta = !!document.getElementById('ricercaInput');
    if (!cercaAperta) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (RICERCA_RISULTATI.length) { RICERCA_SEL = Math.min(RICERCA_RISULTATI.length - 1, RICERCA_SEL + 1); aggiornaRisultatiRicerca(); } return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (RICERCA_RISULTATI.length) { RICERCA_SEL = Math.max(0, RICERCA_SEL - 1); aggiornaRisultatiRicerca(); } return; }
    if (e.key === 'Enter') { e.preventDefault(); const r = RICERCA_RISULTATI[RICERCA_SEL]; if (r && r.azione) r.azione(); return; }
  });
  // Riprova ad applicare un aggiornamento del sync condiviso rimasto in coda (vedi
  // applicaStatoRemotoSeLibero) appena si smette di scrivere in un qualsiasi campo — registrato
  // qui e non dentro inizializzaSyncCondiviso() perché deve esistere comunque, a prescindere da
  // quando/se il backend condiviso si connette (blur non "bubbla": serve la fase di cattura).
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) { ULTIMA_SELEZIONE_TS = Date.now(); return; }
    // selezione finita: si recuperano gli aggiornamenti rimasti in coda mentre si copiava il testo
    if (DB_STATO_REMOTO_PENDENTE) setTimeout(applicaStatoRemotoSeLibero, 200);
    if (RENDER_DOPO_UNIONE) setTimeout(() => { if (!staModificandoQualcosa()) { RENDER_DOPO_UNIONE = false; render(); } }, 200);
  });
  document.addEventListener('blur', () => {
    if (DB_STATO_REMOTO_PENDENTE) setTimeout(applicaStatoRemotoSeLibero, 50);
    if (RENDER_DOPO_UNIONE) setTimeout(() => { if (!staModificandoQualcosa()) { RENDER_DOPO_UNIONE = false; render(); toast('🔄 Modifiche di un collega unite alle tue.'); } }, 50);
  }, true);
  render();
  if (!avviaSetupSeServe()) eventualeSelettoreOperatore(); // primo avvio: questionario; altrimenti task #98: chiede "chi sei" solo se serve (2+ responsabili, non ancora scelto su questo PC)
  inizializzaSyncCondiviso(); // asincrono, non blocca il primo render: se non disponibile (file locale) non fa nulla
}

/* -------------------- Guida in ogni sezione (pulsante "?" accanto al titolo) -------------------- */
const GUIDA_TAB = {
  oggi: { cosa: 'La tua giornata: solo ciò che tocca a te, senza il rumore del resto dello studio.', funzioni: ['Scadenze urgenti assegnate a te', 'Fasi di adempimento pronte per te (quando il collega precedente ha finito)', 'Task e messaggi da leggere'], consiglio: 'Aprila ogni mattina: se è vuota, sei in pari.' },
  dashboard: { cosa: 'Il quadro di tutto lo studio: scadenze, adempimenti e onboarding di tutti.', funzioni: ['Conteggi per stato e per urgenza', 'Filtri per responsabile', 'Accesso rapido alle sezioni che richiedono attenzione'], consiglio: 'Per vedere solo il tuo lavoro usa "Il mio lavoro".' },
  cruscotto: { cosa: 'Vista d\'insieme per il titolare: portafoglio clienti, nuovi e cessati, preventivi, fatturazione e avanzamento degli adempimenti.', funzioni: ['Clienti per tipologia e andamento', 'Preventivi in attesa e accettati', 'Avanzamento adempimenti per fase'], consiglio: 'Se non ti serve, spegni il modulo da Impostazioni › Moduli.' },
  calendario: { cosa: 'Calendario mensile con scadenze, appuntamenti e impegni.', funzioni: ['Vista mese, settimana e giorno', 'Nuovo evento: appuntamento o scadenza ricorrente', '"Prenota un appuntamento" con un consulente, con controllo dei conflitti di orario'], consiglio: 'Clicca un giorno per vedere e aggiungere tutto ciò che lo riguarda.' },
  clienti: { cosa: 'Anagrafica dei clienti e dei flag fiscali che generano le scadenze.', funzioni: ['Nuovo cliente o import da Excel/CSV', 'Filtri per regime, responsabile e stato (anche cessati)', 'Cessazione cliente con data e adempimenti ceduti al nuovo commercialista'], consiglio: 'I flag fiscali del cliente decidono quali scadenze gli vengono generate: tienili aggiornati.' },
  rubrica: { cosa: 'Tutti i contatti dei clienti in un unico elenco ricercabile.', funzioni: ['Ricerca per nome, ruolo o cliente', 'Contatti collegati ai clienti'], consiglio: 'Se usate già un\'altra rubrica puoi spegnere il modulo.' },
  schedacliente: { cosa: 'Tutto ciò che riguarda un singolo cliente in un posto solo.', funzioni: ['Scadenze, adempimenti, documenti e comunicazioni del cliente', 'Rapporto con lo studio: contabilità interna o da terzi', 'Report mensile da inviare al cliente'], consiglio: 'Si apre cliccando il nome di un cliente da qualsiasi elenco.' },
  soci: { cosa: 'Persone collegate ai clienti: soci, amministratori, referenti.', funzioni: ['Anagrafica per socio con ruolo', 'Collegamento a uno o più clienti'], consiglio: 'Utile per sapere a chi rivolgersi per ogni società.' },
  scadenze: { cosa: 'Scadenze periodiche (IVA, INPS, ritenute, IMU, Intrastat…) generate automaticamente dai flag del cliente.', funzioni: ['Segna una scadenza come fatta, in corso o da fare', 'Filtri per periodo, tipo, cliente e responsabile', 'Importi e note per ogni scadenza'], consiglio: 'Non devi creare le scadenze a mano: se ne manca una, controlla i flag del cliente.' },
  ritenute: { cosa: 'Registro delle fatture con ritenuta d\'acconto e cumulo dei versamenti (soglia 100 € al mese).', funzioni: ['Inserimento righe per cliente', 'Calcolo del cumulo da versare', 'Collegamento all\'F24'], consiglio: 'Controlla sempre la soglia prima di rinviare un versamento.' },
  annuali: { cosa: 'Dichiarazioni e adempimenti annuali, divisi in fasi con un responsabile per ogni fase.', funzioni: ['Fasi pronte / in attesa / completate', 'Responsabili a cascata: ditta → adempimento (predefinito per tipo in Impostazioni › Responsabili) → fasi', 'Passaggio di consegne: chi finisce una fase avvisa chi segue', 'Proroghe e adempimenti ceduti nei clienti cessati'], consiglio: 'Segna le fasi man mano: il cruscotto e "Il mio lavoro" si aggiornano da soli.' },
  f24: { cosa: 'Registro degli F24 versati o compensati per cliente.', funzioni: ['Righe multiple con codici tributo', 'Pagamento anche misto (versamento e compensazione)'], consiglio: 'Registra l\'F24 appena pagato per tenere allineato il cumulo ritenute.' },
  taskteam: { cosa: 'Compiti interni dello studio, assegnati a una persona con scadenza.', funzioni: ['Crea, assegna e chiudi task', 'Collegamento a procedure interne', 'Notifica quando un task ti viene assegnato o modificato'], consiglio: 'Per le cose ricorrenti di studio usa le procedure interne, non i task.' },
  onboarding: { cosa: 'Checklist di attivazione per un nuovo cliente.', funzioni: ['Voci da spuntare una a una', 'Si crea da sola quando un preventivo viene accettato'], consiglio: 'Il cliente è "operativo" quando la checklist è completa.' },
  antiriciclaggio: { cosa: 'Adeguata verifica, profilo di rischio e storico delle verifiche per cliente.', funzioni: ['Compilazione guidata dei modelli', 'Rischio per cliente e storico', 'Documenti collegati'], consiglio: 'Conserva sempre la data dell\'ultima verifica: è ciò che ti chiede un controllo.' },
  comunicazioni: { cosa: 'Messaggi tra studio e clienti e comunicazioni ricorrenti.', funzioni: ['Conversazioni per cliente con stato aperto/chiuso', 'Comunicazioni ricorrenti (es. richieste periodiche)', 'Notifiche per i messaggi non letti'], consiglio: 'I messaggi arrivano al cliente solo se ha il portale attivo.' },
  documenti: { cosa: 'Archivio documenti dello studio e dei clienti.', funzioni: ['Cartelle per cliente', 'Richieste di documenti con checklist e solleciti', 'Anteprima e download'], consiglio: 'Le richieste documenti sono il modo più veloce per sollecitare un cliente.' },
  preventivi: { cosa: 'Preventivi, mandati e lettere d\'incarico da modelli precompilati.', funzioni: ['Crea documento dal modello e dal catalogo attività', 'Accettazione: crea il cliente e l\'onboarding', 'Mandati in scadenza da rinnovare'], consiglio: 'Il catalogo attività (Impostazioni) calcola da solo gli importi.' },
  portale: { cosa: 'Anteprima di ciò che vede il cliente nel suo portale.', funzioni: ['Scadenze, documenti e comunicazioni', 'Accesso individuale per cliente'], consiglio: 'Attivalo solo per i clienti che lo useranno davvero: non sostituisce la mail.' },
  bilanci: { cosa: 'Situazioni economico-patrimoniali, indici e grafici.', funzioni: ['Carica un bilancio e ottieni indici con semafori', 'Confronto tra periodi', 'Spiegazioni degli indici in parole semplici'], consiglio: 'Utile se fate consulenza sui numeri dei clienti; altrimenti spegni il modulo.' },
  modelli: { cosa: 'Testi precompilati per preventivi, mandati e antiriciclaggio.', funzioni: ['Editor con segnaposto {{così}} che diventano campi', 'Immagini e formattazione di base'], consiglio: 'I segnaposto mancanti si evidenziano in giallo prima dell\'uso.' },
  incassi: { cosa: 'Compensi da incassare, scadenze di pagamento e solleciti.', funzioni: ['Elenco per cliente e stato', 'Solleciti dal portale', 'Registrazione dell\'incasso'], consiglio: 'È un promemoria per lo studio, non un programma di fatturazione.' },
  carico: { cosa: 'Scadenze e adempimenti aperti per persona e per mese.', funzioni: ['Chi è sovraccarico e chi ha spazio', 'Filtro per mese'], consiglio: 'Usalo prima di assegnare una nuova pratica.' },
  proroghe: { cosa: 'Sposta in blocco una scadenza per tutti i clienti interessati (decreti di proroga).', funzioni: ['Scegli scadenza, nuova data e clienti', 'Registro delle proroghe applicate'], consiglio: 'Controlla l\'anteprima dei clienti coinvolti prima di confermare.' },
  cpb: { cosa: 'Concordato preventivo biennale: stato di adesione per cliente.', funzioni: ['Stato per cliente e note'], consiglio: 'Le regole fiscali cambiano: verifica sempre le soglie sulle fonti ufficiali.' },
  deontologia: { cosa: 'Obblighi deontologici dello studio.', funzioni: ['Check-list di accettazione incarico', 'Registro dell\'uso dell\'IA', 'Formazione continua (FPC)', 'Impegni di riservatezza e privacy'], consiglio: 'Compila la check-list all\'accettazione dell\'incarico, non dopo.' },
  libri: { cosa: 'Libri sociali dei clienti.', funzioni: ['Chi detiene il libro', 'Ultima stampa e ultima pagina'], consiglio: 'Aggiorna la data dopo ogni stampa o vidimazione.' },
  fatturazione: { cosa: 'Attività extra da fatturare e periodicità di fatturazione di ogni cliente.', funzioni: ['Registra le pratiche extra man mano', 'Segnale "da fatturare" alla prossima fattura periodica', 'Segna come fatturate'], consiglio: 'È un promemoria: la fattura la emetti nel tuo software di fatturazione.' },
  procedure: { cosa: 'Istruzioni operative passo per passo per lo staff.', funzioni: ['Procedure con checklist documenti', 'Collegamento a task e appuntamenti'], consiglio: 'Scrivi una procedura per ogni cosa che spieghi più di due volte.' },
  strumenti: { cosa: 'Convertitore Word/PDF e unisci/dividi PDF.', funzioni: ['Conversione file', 'Unione PDF', 'Divisione PDF in più sezioni (un file per ogni intervallo di pagine)'], consiglio: 'La conversione richiede LibreOffice sul PC del server.' },
  credenziali: { cosa: 'Archivio delle credenziali dello studio e dei clienti (Entratel, Telemaco, home banking…).', funzioni: ['Campi personalizzabili per voce', 'Cifrate sul PC dello studio'], consiglio: 'Fai il backup anche del file chiave: senza non si leggono.' },
  impostazioni: { cosa: 'Configurazione dello studio.', funzioni: ['Studio, team e accessi, moduli', 'Responsabili: chi risponde di ditte, adempimenti e fasi', 'Backup e ripristino', 'Catalogo attività e aggiornamenti', 'Gestione studio (solo master): licenza'], consiglio: 'Se qualcosa non compare nel menu, controlla i moduli.' },
  chat: { cosa: 'Messaggi diretti tra i collaboratori.', funzioni: ['Conversazioni per persona', 'Riferimenti a pratiche, task e documenti', 'Indicatore online'], consiglio: 'Per cose da non dimenticare crea un task: la chat scorre.' },
};
function guidaTabHtml(view) {
  const g = GUIDA_TAB[view];
  if (!g) return '';
  const titolo = (PAGE_TITLES[view] || [view])[0];
  return `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Guida: ${escapeHtml(titolo)}</h2></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <p style="margin:12px 0 8px;">${escapeHtml(g.cosa)}</p>
      <div style="font-size:12px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:12px 0 4px;">Cosa puoi fare qui</div>
      <ul style="margin:0 0 12px 18px;padding:0;line-height:1.55;">${g.funzioni.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      <div class="helptext" style="background:var(--bg-2,#f7f8fa);border-radius:8px;padding:10px 12px;"><strong>Consiglio:</strong> ${escapeHtml(g.consiglio)}</div>
      <div class="modal-actions"><button class="btn primary" data-action="chiudi-modal">Ho capito</button></div>
    </div>
  </div>`;
}
function apriGuidaTab() { const html = guidaTabHtml(VIEW); if (html) h('modalRoot').innerHTML = html; }
/* -------------------- Procedura guidata: accesso esterno (editor documenti + ngrok) -------------------- */
// Pensata per chi installa Prisma da solo: 4 passi con controllo automatico di cosa è già pronto.
// Non scarica né installa nulla da sola (si apre il sito ufficiale): il token ngrok è l'unica cosa
// che si incolla qui, e viene salvata da ngrok stesso sul PC (mai inviata altrove).
let WIZ = { passo: 0, soffice: null, ngrok: null, ngrokVer: '', tunnel: '', msg: '', occupato: false };
function wizApri() { WIZ = { passo: 0, soffice: null, ngrok: null, ngrokVer: '', tunnel: '', msg: '', occupato: false }; wizControlla(); }
function wizVai(n) { WIZ.passo = Math.max(0, Math.min(4, n)); WIZ.msg = ''; wizRender(); }
function wizControlla() {
  wizRender();
  Promise.all([
    fetch('/api/conversione-stato').then(r => r.json()).catch(() => null),
    fetch('/api/ngrok-stato').then(r => r.json()).catch(() => null),
    fetch('/api/ngrok-tunnels').then(r => r.json()).catch(() => null),
  ]).then(([c, n, t]) => {
    WIZ.soffice = c ? !!c.disponibile : false;
    WIZ.ngrok = n ? !!n.installato : false; WIZ.ngrokVer = n && n.versione || '';
    const tun = t && t.ok && (t.tunnels || []).find(x => Number(x.porta) === Number(ACCESSO_ESTERNO_CACHE && ACCESSO_ESTERNO_CACHE.porta));
    WIZ.tunnel = tun ? tun.publicUrl : '';
    wizRender();
  });
}
function wizSalvaToken() {
  const campo = h('wizToken'); const token = campo ? campo.value.trim() : '';
  WIZ.occupato = true; WIZ.msg = ''; wizRender();
  fetch('/api/ngrok-authtoken', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    .then(r => r.json()).then(d => { WIZ.occupato = false; WIZ.msg = d.ok ? '✅ Token salvato. Puoi andare avanti.' : ('⚠️ ' + (d.errore || 'Non sono riuscito a salvarlo.')); wizRender(); })
    .catch(() => { WIZ.occupato = false; WIZ.msg = '⚠️ Server locale non raggiungibile.'; wizRender(); });
}
function wizAvviaNgrok() {
  WIZ.occupato = true; WIZ.msg = 'Avvio in corso…'; wizRender();
  fetch('/api/avvia-ngrok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    .then(r => r.json()).then(d => {
      WIZ.occupato = false;
      WIZ.msg = d.ok ? '✅ Avviato.' : ('⚠️ ' + (d.errore || 'Non sono riuscito ad avviare ngrok.'));
      wizControlla();
    }).catch(() => { WIZ.occupato = false; WIZ.msg = '⚠️ Server locale non raggiungibile.'; wizRender(); });
}
function wizRender() {
  const stato = (ok, si, no) => ok === null ? '<span class="badge">⏳ controllo…</span>' : (ok ? `<span class="badge ok">✅ ${si}</span>` : `<span class="badge">⚪ ${no}</span>`);
  const link = (url, testo) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${testo}</a>`;
  const passi = [
    { t: 'Di cosa si tratta', corpo: `<p>Questa procedura prepara il PC per due cose: <b>aprire Prisma da fuori studio</b> (collaboratori) e dare ai clienti la loro <b>area riservata</b>. Servono due programmi gratuiti:</p>
      <ul style="margin:8px 0 8px 18px;line-height:1.6;"><li><b>LibreOffice</b>: per modificare e convertire Word, Excel e PDF dentro Prisma.</li><li><b>ngrok</b>: crea il collegamento sicuro tra internet e il PC dello studio.</li></ul>
      <div class="helptext">Servono circa 10 minuti. Il PC dello studio deve restare acceso quando qualcuno vuole collegarsi. Il piano gratuito di ngrok ha dei limiti (poco traffico mensile, indirizzo che non scegli tu): va bene per iniziare, per uso intenso vale la pena passare a un piano a pagamento.</div>` },
    { t: 'Editor documenti (LibreOffice)', corpo: `<p>Stato: ${stato(WIZ.soffice, 'LibreOffice trovato', 'non trovato')}</p>
      <ol style="margin:8px 0 8px 18px;line-height:1.7;"><li>Scarica e installa LibreOffice (gratuito) da ${link('https://www.libreoffice.org/download/download-libreoffice/', 'libreoffice.org')}.</li><li>Segui l'installazione standard (Avanti, Avanti, Fine).</li><li>Chiudi e riapri Prisma, poi premi “Ricontrolla”.</li></ol>
      <div class="helptext">Puoi saltare questo passo: tutto il resto funziona lo stesso, mancherà solo il convertitore Word/PDF.</div>` },
    { t: 'Collegamento a internet (ngrok)', corpo: `<p>Stato: ${stato(WIZ.ngrok, 'ngrok installato' + (WIZ.ngrokVer ? ' (' + escapeHtml(WIZ.ngrokVer) + ')' : ''), 'ngrok non trovato')}</p>
      <ol style="margin:8px 0 8px 18px;line-height:1.7;"><li>Crea un account gratuito su ${link('https://dashboard.ngrok.com/signup', 'ngrok.com')}.</li><li>Scarica e installa ngrok da ${link('https://ngrok.com/download', 'ngrok.com/download')}, poi premi “Ricontrolla”.</li><li>Nel sito di ngrok apri “Your Authtoken”, copia il codice e incollalo qui sotto.</li></ol>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><input type="password" id="wizToken" placeholder="Incolla qui l'authtoken" style="flex:1;min-width:220px;" autocomplete="off"><button class="btn primary" data-action="wiz-token-salva" ${WIZ.occupato || !WIZ.ngrok ? 'disabled' : ''}>Salva</button></div>` },
    { t: 'Accendi il collegamento', corpo: `<p>Stato: ${stato(WIZ.tunnel ? true : (WIZ.ngrok === null ? null : false), 'collegamento attivo', 'collegamento spento')}</p>
      ${WIZ.tunnel ? `<div class="helptext" style="word-break:break-all;">Indirizzo pubblico: <b>${escapeHtml(WIZ.tunnel)}</b></div>` : ''}
      <div style="margin-top:10px;"><button class="btn primary" data-action="wiz-avvia" ${WIZ.occupato ? 'disabled' : ''}>🚀 Avvia ngrok</button></div>
      <div class="helptext" style="margin-top:10px;">Per averlo sempre pronto, nella schermata principale spunta “Avvia ngrok automaticamente a ogni avvio di Prisma”.</div>` },
    { t: 'Fatto: ora scegli chi può entrare', corpo: `<p>Il collegamento è pronto. Ora, nella stessa schermata:</p>
      <ul style="margin:8px 0 8px 18px;line-height:1.7;"><li><b>Collaboratori</b>: imposta utente e password e copia l'indirizzo.</li><li><b>Clienti</b>: scegli il cliente, copia il suo link personale e mandaglielo.</li></ul>
      <div class="helptext">Usa password robuste e diverse. Se un collaboratore lascia lo studio, cambia o disattiva subito la sua password.</div>` },
  ];
  const p = WIZ.passo, ps = passi[p];
  const pallini = passi.map((_, i) => `<span style="width:${i === p ? 22 : 8}px;height:8px;border-radius:4px;background:${i <= p ? 'var(--blu-mid,#2457D6)' : 'var(--border,#ccd)'};transition:width .2s;"></span>`).join('');
  h('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:600px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div><div style="font-size:12px;font-weight:700;color:var(--text-mut);text-transform:uppercase;">Procedura guidata · passo ${p + 1} di ${passi.length}</div><h2 style="margin-top:2px;">${ps.t}</h2></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div style="display:flex;gap:5px;margin:12px 0 14px;">${pallini}</div>
      <div>${ps.corpo}</div>
      ${WIZ.msg ? `<div class="helptext" style="margin-top:10px;font-weight:600;">${escapeHtml(WIZ.msg)}</div>` : ''}
      <div class="modal-actions" style="justify-content:space-between;">
        <div style="display:flex;gap:8px;">${p > 0 ? `<button class="btn" data-action="wiz-passo" data-passo="${p - 1}">← Indietro</button>` : ''}${p > 0 && p < 4 ? `<button class="btn ghost" data-action="wiz-ricontrolla">Ricontrolla</button>` : ''}</div>
        ${p < passi.length - 1 ? `<button class="btn primary" data-action="wiz-passo" data-passo="${p + 1}">${p === 0 ? 'Iniziamo' : 'Avanti'} →</button>` : `<button class="btn primary" data-action="wiz-fine">Chiudi</button>`}
      </div>
    </div>
  </div>`;
}
window.wizApri = wizApri;

/* -------------------- Tema chiaro / scuro (ott. 2026) -------------------- */
const TEMA_CHIAVE = 'prismaTema_v1';
function temaCorrente() { return document.documentElement.getAttribute('data-tema') === 'scuro' ? 'scuro' : 'chiaro'; }
function impostaTema(t, salva) {
  if (t === 'scuro') document.documentElement.setAttribute('data-tema', 'scuro'); else document.documentElement.removeAttribute('data-tema');
  const b = document.getElementById('btnTema'); if (b) { b.textContent = t === 'scuro' ? '☀️' : '🌙'; b.title = t === 'scuro' ? 'Passa al tema chiaro' : 'Passa al tema scuro'; }
  if (salva !== false) { try { localStorage.setItem(TEMA_CHIAVE, t); } catch (e) { /* storage non disponibile: vale solo per questa sessione */ } }
}
(function () { let t = 'chiaro'; try { t = localStorage.getItem(TEMA_CHIAVE) || 'chiaro'; } catch (e) {} impostaTema(t, false); })();
window.impostaTema = impostaTema; window.temaCorrente = temaCorrente;

window.GUIDA_TAB = GUIDA_TAB;
window.PAGE_TITLES = PAGE_TITLES;
window.apriGuidaTab = apriGuidaTab;

/* -------------------- Master, "Gestione studio" e questionario di primo avvio -------------------- */
// Master = utenza che gestisce moduli, utenze e licenza. Compatibilità: se nessun responsabile ha
// ruolo 'master' (installazioni nate prima di questa funzione) restano tutti "master di fatto", come
// prima; così non si blocca nessuno. Come il resto dei ruoli è un filtro di interfaccia, non un
// controllo di accesso ai dati (vedi commento su tabConsentitiOperatore).
function esisteMaster() {
  return (STATE.meta.responsabili || []).some(r => ruoloOperatore(r) === 'master');
}
function operatoreMaster() {
  if (!esisteMaster()) return true;
  if (!OPERATORE) return true; // nessun operatore scelto: nessuna restrizione (vedi operatorePuoVedere)
  return ruoloOperatore(OPERATORE) === 'master';
}
/* Modalità sviluppatore: preferenza di QUESTO PC (localStorage, mai sincronizzata né nei backup), così
   i clienti non vedono mai gli strumenti di sviluppo. Si attiva toccando 7 volte la riga della versione
   in fondo a Impostazioni › Studio. */
const LS_KEY_SVILUPPATORE = 'prismaModalitaSviluppatore_v1';
function modalitaSviluppatore() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY_SVILUPPATORE) === '1'; } catch (e) { return false; }
}
function impostaModalitaSviluppatore(on) {
  try { if (on) localStorage.setItem(LS_KEY_SVILUPPATORE, '1'); else localStorage.removeItem(LS_KEY_SVILUPPATORE); } catch (e) { /* storage bloccato */ }
}
function impSezioniVisibili() {
  return IMP_SEZIONI.filter(s => (!s.master || operatoreMaster()) && (!s.dev || modalitaSviluppatore()) && (!s.tab || operatorePuoVedere(s.tab)));
}
// Tab "di nucleo": quelli che non appartengono a nessun modulo (sempre attivi per tutti).
/* Elenco "Novita" di un aggiornamento: le voci stanno nel campo note del manifesto separate da " | " o da a capo
   (vedi pubblica-aggiornamento.js). Ogni voce diventa una riga con un segno distintivo, in un riquadro a parte. */
function renderNoteAggiornamento(note, versione) {
  const voci = String(note || '').split(/\s*\|\s*|\r?\n/).map(v => v.trim()).filter(Boolean);
  if (!voci.length) return '';
  return `<div style="background:var(--blu-light);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:0 0 12px;max-width:640px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--blu-mid);margin-bottom:8px;">Novit\u00e0 della versione ${escapeHtml(versione || '')}</div>
    <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px;">${voci.map(v => `<li style="display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.4;color:var(--text);"><span style="flex:none;color:var(--verde);font-weight:700;">\u2713</span><span>${escapeHtml(v)}</span></li>`).join('')}</ul>
  </div>`;
}
function tabNucleo() {
  const inModuli = new Set(); MODULI.forEach(m => m.tabs.forEach(t => inModuli.add(t)));
  const ids = [];
  NAV.forEach(g => g.items.forEach(it => { if (!inModuli.has(it.id) && it.id !== 'impostazioni') ids.push(it.id); }));
  return ids;
}
function renderImpostazioniGestione() {
  setTimeout(async () => {
    const box = h('gestLicenza'); if (!box) return;
    try {
      const r = await fetch('/api/licenza'); const d = await r.json();
      if (!d.richiesta) box.innerHTML = '<div class="helptext">Installazione senza vincolo di licenza (uso interno).</div>';
      else box.innerHTML = `<table class="compact"><tbody>
        <tr><td>Intestata a</td><td><strong>${escapeHtml(d.studio || '—')}</strong></td></tr>
        <tr><td>Stato</td><td>${d.valida ? '<span class="badge attivo">Attiva</span>' : '<span class="badge stato-errore">Non valida</span>'}</td></tr>
        <tr><td>Scadenza</td><td>${d.scadenza ? escapeHtml(d.scadenza) : 'Nessuna scadenza'}</td></tr>
        <tr><td>Codice macchina</td><td><code>${escapeHtml(d.fingerprint || '')}</code></td></tr>
      </tbody></table>`;
    } catch (e) { box.innerHTML = '<div class="helptext">Informazioni sulla licenza non disponibili.</div>'; }
  }, 0);
  const nMod = MODULI.filter(m => moduloAttivo(m.id)).length;
  return `<div class="card">
    <div class="section-title">Licenza</div>
    <div id="gestLicenza"><div class="helptext">Carico…</div></div>
  </div>
  <div class="card">
    <div class="section-title">Gestione dello studio</div>
    <div class="helptext" style="margin-bottom:12px;">Quest'area è visibile solo alle utenze maestro. Moduli attivi: ${nMod} su ${MODULI.length}. Utenze: ${(STATE.meta.responsabili || []).length}.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" data-action="imp-sezione" data-sezione="moduli">Moduli dello studio</button>
      <button class="btn" data-action="imp-sezione" data-sezione="team">Utenze e permessi</button>
      <button class="btn" data-action="imp-sezione" data-sezione="dati">Backup</button>
    </div>
  </div>
  <div class="card" style="border-color:var(--rosso);">
    <div class="section-title" style="color:var(--rosso);">Zona pericolosa</div>
    <div class="helptext" style="margin-bottom:12px;">Cancella tutti i dati dello studio (clienti, scadenze, documenti, comunicazioni…). Servono tre conferme. Fai prima un backup da «Dati e backup».</div>
    <button class="btn danger" data-action="reset-tutto">Svuota tutti i dati</button>
  </div>`;
}

const SETUP_DOMANDE = [
  { id: 'squadra', q: 'Lavorate in più persone e vi passate il lavoro (task, chat)?', moduli: ['team'] },
  { id: 'cal', q: 'Volete gestire appuntamenti e prenotazioni dei consulenti?', moduli: ['calendario'] },
  { id: 'portale', q: 'Volete dare ai clienti un portale (documenti, scadenze, messaggi)?', moduli: ['portale'] },
  { id: 'prev', q: 'Fate preventivi, mandati e lettere d\'incarico e l\'onboarding dei nuovi clienti?', moduli: ['preventivi', 'onboarding'] },
  { id: 'fatt', q: 'Volete tenere traccia di cosa fatturare e degli incassi dei compensi?', moduli: ['fatturazione', 'incassi'] },
  { id: 'compl', q: 'Volete gestire l\'antiriciclaggio (adeguata verifica e profilo di rischio)?', moduli: ['antiriciclaggio'] },
  { id: 'serv', q: 'Offrite ad alcuni clienti ritenute, F24 e bilanci/KPI nel portale (pacchetto avanzato, attivabile cliente per cliente)?', moduli: ['servizi'] },
  { id: 'libri', q: 'Tenete i libri sociali dei clienti?', moduli: ['libri'] },
  { id: 'tit', q: 'Il titolare vuole una vista d\'insieme (cruscotto, carico di lavoro, proroghe, CPB)?', moduli: ['cruscotto', 'carico', 'cpb'] },
  { id: 'proc', q: 'Volete procedure interne e un archivio password dello studio?', moduli: ['procedure', 'credenziali'] },
];
const SETUP_PROFILI = [
  { id: 'essenziale', nome: 'Essenziale', desc: 'Solo il nucleo: scadenze, adempimenti annuali, clienti e documenti. Ideale per partire.', risposte: [] },
  { id: 'strutturato', nome: 'Studio strutturato', desc: 'Più collaboratori, calendario e appuntamenti, preventivi e mandati, antiriciclaggio, incassi, ritenute e F24.', risposte: ['squadra', 'cal', 'prev', 'fatt', 'compl', 'serv'] },
  { id: 'completo', nome: 'Completo', desc: 'Tutti i moduli attivi: potrai spegnere in seguito quelli che non servono.', risposte: SETUP_DOMANDE.map(d => d.id) },
];
let SETUP = null;
function setupDaFare() {
  const m = STATE.meta || {};
  return !m.setupCompletato && !m.moduliConfermati && (STATE.clienti || []).length === 0;
}
/* Configurazione iniziale fatta nell'installer (Installa-Prisma.exe): arriva nell'indirizzo della finestra
   come "#setup=<base64 di un JSON>". Se c'e' ed e' valida, si applica senza mostrare le domande. */
function setupDaInstaller() {
  try {
    const m = /[#&]setup=([A-Za-z0-9+/=_-]+)/.exec(location.hash || '');
    if (!m) return null;
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(decodeURIComponent(Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    const idMod = MODULI.map(x => x.id);
    const testo = v => typeof v === 'string' && v.trim() && v.length <= 120;
    if (!p || !testo(p.studio) || !testo(p.master) || !Array.isArray(p.moduli) || p.moduli.some(x => !idMod.includes(x))) return null;
    const collab = (Array.isArray(p.collab) ? p.collab : []).filter(c => c && testo(c.nome)).map(c => ({
      nome: c.nome.trim(), ruolo: c.ruolo === 'admin' ? 'admin' : 'limitato', moduli: (Array.isArray(c.moduli) ? c.moduli : []).filter(x => idMod.includes(x))
    }));
    const nomi = [p.master.trim()].concat(collab.map(c => c.nome));
    if (new Set(nomi.map(n => n.toLowerCase())).size !== nomi.length) return null;
    return { step: 5, studio: p.studio.trim(), master: p.master.trim(), risposte: {}, moduli: p.moduli.slice(), collab };
  } catch (e) { return null; }
}
function avviaSetupSeServe() {
  if (!setupDaFare()) return false;
  const daInstaller = setupDaInstaller();
  if (daInstaller) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* non blocca */ }
    SETUP = daInstaller;
    applicaSetup();
    return true;
  }
  SETUP = { step: 1, studio: (STATE.meta.studioNome && STATE.meta.studioNome !== 'Studio') ? STATE.meta.studioNome : '', master: '', risposte: {}, moduli: [], collab: [] };
  renderSetup();
  return true;
}
function setupModuliDaRisposte() {
  const s = new Set();
  SETUP_DOMANDE.forEach(d => { if (SETUP.risposte[d.id]) d.moduli.forEach(m => s.add(m)); });
  return Array.from(s);
}
function renderSetup() {
  let root = h('setupRoot');
  if (!SETUP) { if (root) root.remove(); return; }
  if (!root) {
    root = document.createElement('div'); root.id = 'setupRoot';
    root.style.cssText = 'position:fixed;inset:0;z-index:9000;background:var(--bg,#f4f6f9);overflow:auto;display:flex;justify-content:center;padding:32px 16px;';
    document.body.appendChild(root);
    root.addEventListener('click', onSetupClick);
    root.addEventListener('input', onSetupInput);
    root.addEventListener('change', onSetupInput);
  }
  const passi = ['Il tuo studio', 'Cosa vi serve', 'Moduli', 'Collaboratori', 'Ultimi passi'];
  const barra = passi.map((p, i) => `<span style="flex:1;text-align:center;padding:6px 4px;border-radius:6px;font-size:12px;${i + 1 === SETUP.step ? 'background:var(--accent,#2b6cdf);color:#fff;' : 'color:var(--text-mut,#7a8794);'}">${i + 1}. ${p}</span>`).join('');
  let corpo = '';
  if (SETUP.step === 1) {
    corpo = `<h2 style="margin:0 0 6px;">Benvenuto in Prisma</h2>
      <div style="background:var(--bg,#f4f6f9);border-radius:10px;padding:14px 16px;margin-bottom:16px;line-height:1.55;"><strong>Che cos'è Prisma.</strong> È il cruscotto operativo di uno studio di commercialisti: raccoglie in un unico posto scadenze, adempimenti a fasi, attività dei collaboratori e clienti, così sai sempre cosa scade, chi se ne occupa e a che punto è. <strong>Non è</strong> un software di contabilità né di fatturazione: affianca quelli che già usate. I dati restano sul computer dello studio.</div>
      <div class="helptext" style="margin-bottom:18px;">Servono pochi minuti: ti chiedo il nome dello studio, cosa vi serve e chi lavorerà con te. Dopo potrai cambiare tutto dalle Impostazioni.</div>
      <div class="field"><label>Nome dello studio</label><input type="text" data-setup="studio" value="${escapeHtml(SETUP.studio)}" placeholder="es. Studio Rossi"></div>
      <div class="field"><label>Il tuo nome (sarai l'utenza maestro dello studio)</label><input type="text" data-setup="master" value="${escapeHtml(SETUP.master)}" placeholder="es. Mario Rossi"></div>
      <div class="helptext">L'utenza maestro gestisce moduli, utenze, catalogo, backup e licenza. Gli altri collaboratori useranno Prisma con i moduli che sceglierai per loro.</div>`;
  } else if (SETUP.step === 2) {
    corpo = `<h2 style="margin:0 0 6px;">Cosa vi serve?</h2>
      <div class="helptext" style="margin-bottom:12px;">Scegli un punto di partenza, poi aggiusta le risposte qui sotto. Sempre inclusi: scadenzario, adempimenti annuali, dashboard "Oggi", clienti e documenti.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:16px;">${SETUP_PROFILI.map(p => `<button type="button" class="btn" style="text-align:left;white-space:normal;display:block;padding:12px;${SETUP.profilo === p.id ? 'border-color:var(--accent,#2b6cdf);box-shadow:0 0 0 2px var(--accent,#2b6cdf) inset;' : ''}" data-setup-profilo="${p.id}"><strong>${escapeHtml(p.nome)}</strong><br><span class="helptext">${escapeHtml(p.desc)}</span></button>`).join('')}</div>
      ${SETUP_DOMANDE.map(d => `<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);font-weight:400;cursor:pointer;"><input type="checkbox" style="margin-top:3px;" data-setup-risposta="${d.id}" ${SETUP.risposte[d.id] ? 'checked' : ''}><span>${escapeHtml(d.q)}</span></label>`).join('')}`;
  } else if (SETUP.step === 3) {
    corpo = `<h2 style="margin:0 0 6px;">Moduli proposti</h2>
      <div class="helptext" style="margin-bottom:14px;">Ecco i moduli in base alle tue risposte. Puoi aggiungerne o toglierne: li cambi in qualsiasi momento da Impostazioni › Moduli.</div>
      ${MODULI.map(m => `<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);font-weight:400;cursor:pointer;"><input type="checkbox" style="margin-top:3px;" data-setup-modulo="${m.id}" ${SETUP.moduli.includes(m.id) ? 'checked' : ''}><span><strong>${escapeHtml(m.label)}</strong><br><span class="helptext">${escapeHtml(m.desc)}</span></span></label>`).join('')}`;
  } else if (SETUP.step === 5) {
    const mod = MODULI.filter(m => SETUP.moduli.includes(m.id)).length;
    corpo = `<h2 style="margin:0 0 6px;">Tutto pronto, ultimi passi</h2>
      <div class="helptext" style="margin-bottom:14px;">Prisma sarà configurato con ${mod} moduli opzionali e ${1 + SETUP.collab.filter(c => c.nome.trim()).length} utenze. Dopo la chiusura ti consiglio, nell'ordine:</div>
      <ol style="margin:0 0 6px 20px;line-height:1.7;">
        <li><strong>Importa i clienti</strong> da Excel (Clienti › Importa).</li>
        <li><strong>Imposta il backup su un secondo disco</strong> (Impostazioni › Backup): i dati stanno solo su questo computer.</li>
        <li><strong>Accesso da fuori studio</strong>, solo se serve ai collaboratori o ai clienti: Impostazioni › Accesso esterno › Procedura guidata.</li>
        <li><strong>Usa una password lunga</strong> per l'utenza maestro e per i collaboratori che si collegano da remoto.</li>
      </ol>`;
  } else {
    const righe = SETUP.collab.map((c, i) => `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" style="flex:1;min-width:140px;" data-setup-collab-nome="${i}" value="${escapeHtml(c.nome)}" placeholder="Nome del collaboratore">
          <select data-setup-collab-ruolo="${i}"><option value="limitato" ${c.ruolo === 'limitato' ? 'selected' : ''}>Vede solo i moduli scelti</option><option value="admin" ${c.ruolo === 'admin' ? 'selected' : ''}>Accesso completo</option></select>
          <button class="icon-x" data-setup-collab-rimuovi="${i}" title="Rimuovi">✕</button>
        </div>
        ${c.ruolo === 'limitato' ? `<div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:10px;">${MODULI.filter(m => SETUP.moduli.includes(m.id)).map(m => `<label class="checkline" style="font-size:12.5px;"><input type="checkbox" data-setup-collab-modulo="${i}|${m.id}" ${c.moduli.includes(m.id) ? 'checked' : ''}> ${escapeHtml(m.label)}</label>`).join('') || '<span class="helptext">Nessun modulo opzionale attivo: vedrà solo il nucleo base.</span>'}</div>` : ''}
      </div>`).join('');
    corpo = `<h2 style="margin:0 0 6px;">Collaboratori</h2>
      <div class="helptext" style="margin-bottom:14px;">Aggiungi chi lavorerà in Prisma e scegli per ognuno quali moduli vede (tra quelli attivati). Puoi saltare e aggiungerli dopo.</div>
      ${righe || '<div class="helptext" style="margin-bottom:10px;">Nessun collaboratore aggiunto.</div>'}
      <button class="btn small" data-setup-collab-aggiungi="1">+ Aggiungi collaboratore</button>`;
  }
  const errore = SETUP.errore ? `<div style="color:#c0392b;margin-top:10px;font-size:13px;">${escapeHtml(SETUP.errore)}</div>` : '';
  const ultimo = SETUP.step === 5;
  root.innerHTML = `<div style="width:min(720px,100%);">
    <div style="display:flex;gap:4px;margin-bottom:18px;">${barra}</div>
    <div class="card" style="padding:26px;">${corpo}${errore}
      <div style="display:flex;justify-content:space-between;margin-top:22px;gap:10px;">
        ${SETUP.step > 1 ? '<button class="btn" data-setup-indietro="1">Indietro</button>' : '<span></span>'}
        <button class="btn primary" data-setup-avanti="1">${ultimo ? 'Concludi e inizia' : 'Avanti'}</button>
      </div>
    </div></div>`;
}
function onSetupInput(e) {
  const t = e.target;
  if (t.dataset.setup) SETUP[t.dataset.setup] = t.value;
  else if (t.dataset.setupRisposta) {
    SETUP.risposte[t.dataset.setupRisposta] = t.checked;
  } else if (t.dataset.setupModulo) {
    const id = t.dataset.setupModulo; const i = SETUP.moduli.indexOf(id);
    if (t.checked && i === -1) SETUP.moduli.push(id); else if (!t.checked && i !== -1) SETUP.moduli.splice(i, 1);
  } else if (t.dataset.setupCollabNome != null) SETUP.collab[Number(t.dataset.setupCollabNome)].nome = t.value;
  else if (t.dataset.setupCollabRuolo != null && e.type === 'change') {
    const c = SETUP.collab[Number(t.dataset.setupCollabRuolo)]; c.ruolo = t.value; renderSetup();
  } else if (t.dataset.setupCollabModulo) {
    const [i, id] = t.dataset.setupCollabModulo.split('|'); const c = SETUP.collab[Number(i)];
    const k = c.moduli.indexOf(id);
    if (t.checked && k === -1) c.moduli.push(id); else if (!t.checked && k !== -1) c.moduli.splice(k, 1);
  }
}
function onSetupClick(e) {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.setupIndietro) { SETUP.errore = ''; SETUP.step--; renderSetup(); return; }
  if (el.dataset.setupCollabAggiungi) {
    SETUP.collab.push({ nome: '', ruolo: 'limitato', moduli: SETUP.moduli.slice() }); renderSetup();
    return;
  }
  if (el.dataset.setupCollabRimuovi != null) { SETUP.collab.splice(Number(el.dataset.setupCollabRimuovi), 1); renderSetup(); return; }
  if (el.dataset.setupProfilo) {
    const pr = SETUP_PROFILI.find(x => x.id === el.dataset.setupProfilo); if (!pr) return;
    SETUP.profilo = pr.id; SETUP.risposte = {}; pr.risposte.forEach(id => { SETUP.risposte[id] = true; }); renderSetup(); return;
  }
  if (!el.dataset.setupAvanti) return;
  SETUP.errore = '';
  if (SETUP.step === 1) {
    if (!SETUP.studio.trim() || !SETUP.master.trim()) { SETUP.errore = 'Inserisci il nome dello studio e il tuo nome.'; renderSetup(); return; }
    SETUP.step = 2;
  } else if (SETUP.step === 2) {
    SETUP.moduli = setupModuliDaRisposte();
    SETUP.step = 3;
  } else if (SETUP.step === 3) {
    SETUP.step = 4;
  } else if (SETUP.step === 4) {
    const nomi = [SETUP.master.trim()].concat(SETUP.collab.map(c => c.nome.trim()).filter(Boolean));
    if (new Set(nomi.map(n => n.toLowerCase())).size !== nomi.length) { SETUP.errore = 'Ci sono due utenti con lo stesso nome.'; renderSetup(); return; }
    SETUP.step = 5;
  } else {
    applicaSetup();
    return;
  }
  renderSetup();
}
function applicaSetup() {
  // Rete di sicurezza: mai riconfigurare uno studio che ha gia' dati o un setup completato.
  if ((STATE.clienti || []).length > 0 || (STATE.meta && (STATE.meta.setupCompletato || STATE.meta.moduliConfermati))) { SETUP = null; renderSetup(); return; }
  const master = SETUP.master.trim();
  const collab = SETUP.collab.filter(c => c.nome.trim());
  const nucleo = tabNucleo();
  STATE.meta.studioNome = SETUP.studio.trim();
  STATE.meta.responsabili = [master].concat(collab.map(c => c.nome.trim()));
  STATE.meta.consulenti = [master];
  STATE.meta.ruoli = { [master]: 'master' };
  STATE.meta.tabConsentiti = {};
  collab.forEach(c => {
    const nome = c.nome.trim();
    if (c.ruolo === 'admin') return; // admin = default implicito
    STATE.meta.ruoli[nome] = 'limitato';
    const tabs = new Set(nucleo);
    MODULI.filter(m => SETUP.moduli.includes(m.id) && c.moduli.includes(m.id)).forEach(m => m.tabs.forEach(t => tabs.add(t)));
    STATE.meta.tabConsentiti[nome] = Array.from(tabs);
  });
  STATE.meta.moduliDisattivati = MODULI.filter(m => !SETUP.moduli.includes(m.id)).map(m => m.id);
  STATE.meta.moduliConfermati = true;
  STATE.meta.setupCompletato = true;
  salvaStato();
  SETUP = null; renderSetup();
  impostaOperatore(master);
  toast('Prisma è pronto. Puoi cambiare moduli e utenze dalle Impostazioni.');
  VIEW = 'oggi'; render();
  modalBenvenutoDopoSetup();
}
/* Subito dopo la procedura guidata: invece di "catapultare" l'utente dentro Prisma, una finestra con le
   prime mosse concrete. Le stesse stanno nella checklist "Metti a punto Prisma" in cima a "Il mio lavoro". */
function modalBenvenutoDopoSetup() {
  const passo = (n, t, d) => `<div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--border);"><div style="flex:none;width:26px;height:26px;border-radius:50%;background:var(--blu-light);color:var(--blu-scuro);font-weight:800;display:flex;align-items:center;justify-content:center;">${n}</div><div><div style="font-weight:700;font-size:14px;">${t}</div><div class="helptext" style="margin-top:2px;">${d}</div></div></div>`;
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:560px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div><h2>Prisma è pronto. Da dove si parte?</h2><div class="modal-sub">Quattro mosse, in quest'ordine. Le ritrovi sempre in cima a «Il mio lavoro» e si spuntano da sole.</div></div>
      <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
    </div>
    ${passo(1, 'Importa i tuoi clienti', 'Scarica il template Excel (o usa l\'export del tuo vecchio gestionale), compilalo e importalo: prima di scrivere qualsiasi cosa vedi l\'anteprima di tutti i clienti.')}
    ${passo(2, 'Completa le anagrafiche', 'Regime fiscale, periodicità IVA e responsabile fanno nascere scadenze e adempimenti. Le caselle <b style="color:var(--rosso);">rosse</b> sono i dati importanti, quelle <b style="color:var(--giallo);">gialle</b> i dati utili.')}
    ${passo(3, 'Controlla scadenze e adempimenti annuali', 'Si generano da soli in base al tipo di cliente e al regime: dai un\'occhiata che sia tutto giusto.')}
    ${passo(4, 'Fai il primo backup', 'Impostazioni › Dati e backup. I dati stanno solo su questo computer.')}
    <div class="modal-actions">
      <button class="btn" data-action="chiudi-modal">Più tardi</button>
      <button class="btn primary" data-action="setup-vai" data-nav="clienti">Inizia dai clienti</button>
    </div>
  </div></div>`;
}
window.avviaSetupSeServe = avviaSetupSeServe;
window.getSetupDefinizioni = () => ({ MODULI, SETUP_DOMANDE, SETUP_PROFILI });
window.setupDaInstaller = setupDaInstaller;
window.setupDaFare = setupDaFare;
window.operatoreMaster = operatoreMaster;
window.getSETUP = () => SETUP;

/* -------------------- Export su window (debug + test automatici) --------------------
   Nota tecnica: le variabili dichiarate con let/const in uno script non-module NON
   diventano proprietà di window (a differenza di "var" o delle funzioni). Le esponiamo
   esplicitamente qui, sia per poter ispezionare lo stato dalla console del browser
   durante l'uso reale, sia perché la suite di test end-to-end (jsdom-test.js) ne ha bisogno. */
window.getSTATE = () => STATE;
window.setSTATE = (s) => { STATE = s; };
/* Stessa ragione di getSTATE/setSTATE sopra: assegnare direttamente window.HTTP_SYNC_ATTIVO da
   fuori NON tocca il vero "let" usato dal resto del codice (sono binding lessicali di script, non
   proprietà dell'oggetto window) - serve un vero setter per farlo, qui usato solo da jsdom-test.js
   per simulare "server locale acceso" senza un vero server.js in ambiente di test. */
window.setHttpSyncAttivoTest = (v) => { HTTP_SYNC_ATTIVO = !!v; };
// Solo per i test: azzera la cache modulo dello stato del convertitore Word/PDF, così un test può
// verificare più scenari (LibreOffice assente/presente) senza dover riavviare l'intera pagina.
window.resetConversioneStatoTest = () => { CONVERSIONE_STATO_CACHE = null; };
// Stessa ragione, per lo strumento Unisci/Dividi PDF (task #204): azzera sia la cache di
// disponibilità sia lo stato delle due card, così un test può ripartire da zero tra uno scenario e
// l'altro senza riavviare l'intera pagina.
window.resetPortaleBaseTest = () => { PORTALE_BASE_CACHE = null; PORTALE_BASE_TS = 0; PORTALE_BASE_CARICAMENTO = false; };
window.resetPdfStatoTest =() => {
  PDF_STATO_CACHE = null;
  PDFU_FILE = []; PDFU_RISULTATO = null; PDFU_ERRORE = null; PDFU_IN_CORSO = false;
  PDFD_FILE = null; PDFD_NUMPAGINE = null; PDFD_SEZIONI = [{ da: 1, a: 1, nome: '' }]; PDFD_RISULTATI = []; PDFD_ERRORE = null; PDFD_IN_CORSO = false;
};
// Stessa ragione: azzera la cache/draft di Accesso esterno (ngrok) così un test può rileggere lo
// stato (via fetch mockata) con scenari diversi senza riavviare l'intera pagina.
window.resetAccessoEsternoTest = () => { ACCESSO_ESTERNO_CACHE = null; ACCESSO_ESTERNO_DRAFT = null; };
window.derivati = derivati;
window.classificaScadenze = classificaScadenze;
/* Portale cliente esterno (task #87): queste tre sono le uniche funzioni che il motore headless
   di server.js chiama dall'esterno (vedi commento sopra costruisciVistaPortaleClienteEsterna). */
window.costruisciVistaPortaleClienteEsterna = costruisciVistaPortaleClienteEsterna;
window.risolviDocumentoPortaleEsterno = risolviDocumentoPortaleEsterno;
window.attivaPortaleCliente = attivaPortaleCliente;
window.disattivaPortaleCliente = disattivaPortaleCliente;
// Accessi secondari (richiesta Matteo: accessi diversificati per cliente).
window.nuovoAccessoSecondarioPortale = nuovoAccessoSecondarioPortale;
window.aggiornaAccessoSecondarioPortale = aggiornaAccessoSecondarioPortale;
window.rigeneraAccessoSecondarioPortale = rigeneraAccessoSecondarioPortale;
window.eliminaAccessoSecondarioPortale = eliminaAccessoSecondarioPortale;
window.trovaAccessoPortale = trovaAccessoPortale;
window.accessoPortalePuoVedere = accessoPortalePuoVedere;
window.mandatiDaRinnovare = mandatiDaRinnovare; window.reportMensileCliente = reportMensileCliente; window.aggiungiProroga = aggiungiProroga; window.datiCarico = datiCarico; window.opzioniProroga = opzioniProroga;
window.aggiornaAccettazione = aggiornaAccettazione; window.accettazioneCompleta = accettazioneCompleta; window.riepilogoFpc = riepilogoFpc; window.registroIaCsv = registroIaCsv;
window.libriPrevistiCliente = libriPrevistiCliente; window.lacuneLibriCliente = lacuneLibriCliente; window.assegnaAttoLibro = assegnaAttoLibro; window.attiLibroCliente = attiLibroCliente; window.attiDaTrascrivere = attiDaTrascrivere;
window.datiCruscotto = datiCruscotto; window.annualiCedutiCliente = annualiCedutiCliente;
window.aggiungiDocumento = aggiungiDocumento; window.aggiungiLibroSociale = aggiungiLibroSociale; window.aggiornaLibroSociale = aggiornaLibroSociale;
window.calcolaValutazioneAml = calcolaValutazioneAml; window.modalValutazioneAml = modalValutazioneAml; window.confermaValutazioneAml = confermaValutazioneAml; window.AML_PRESTAZIONI = AML_PRESTAZIONI; window.AML_FATTORI = AML_FATTORI; window.modalPreventivo = modalPreventivo; window.modalDettaglioPreventivo = modalDettaglioPreventivo; window.modalAccettazionePreventivo = modalAccettazionePreventivo; window.setPrevFormCompleto = (v) => { PREV_FORM_COMPLETO = !!v; }; window.stepAperturaPosizione = stepAperturaPosizione; window.fogliPronti = fogliPronti; window.apriModalAppuntamento = apriModalAppuntamento; window.modalNuovoPotenziale = modalNuovoPotenziale; window.aggiungiAppuntamento = aggiungiAppuntamento; window.accettaPreventivo = accettaPreventivo; window.parseEstrattoConto = parseEstrattoConto; window.abbinaMovimenti = abbinaMovimenti; window.creaIncassiDaPreventivo = creaIncassiDaPreventivo; window.creaClientePotenziale = creaClientePotenziale; window.aggiungiAttivitaFatturabile = aggiungiAttivitaFatturabile; window.segnaAttivitaFatturate = segnaAttivitaFatturate; window.prossimaFatturazioneCliente = prossimaFatturazioneCliente; window.attivitaAperteCliente = attivitaAperteCliente;
window.clienteAttivo = clienteAttivo; window.cessaCliente = cessaCliente; window.riattivaCliente = riattivaCliente; window.configContabTerzi = configContabTerzi;
/* Area cliente interattiva (task #88): stessa logica di sopra, ma in scrittura. */
window.aggiungiMessaggioPortaleClienteEsterno = aggiungiMessaggioPortaleClienteEsterno;
window.aggiungiRispostaPortaleClienteEsterno = aggiungiRispostaPortaleClienteEsterno;
window.segnaLettaComunicazionePortaleEsterno = segnaLettaComunicazionePortaleEsterno;
window.segnalaPagamentoRitenutaPortaleEsterno = segnalaPagamentoRitenutaPortaleEsterno;
window.aggiungiRispostaComunicazione = aggiungiRispostaComunicazione;
/* Stessa area cliente, ma simulata dentro l'anteprima del gestionale (task #107). */
window.messaggioClientePreview = messaggioClientePreview;
window.rispostaClientePreview = rispostaClientePreview;
window.operatoreCorrente = operatoreCorrente;
window.getPresenzaOnlineTest = () => PRESENZA_ONLINE;
window.setPresenzaOnlineTest = (v) => { PRESENZA_ONLINE = v || {}; };
window.operatoreOnline = operatoreOnline;
window.aggiungiChatMessaggio = aggiungiChatMessaggio;
window.getChatCon = () => CHAT_CON;
window.setChatConTest = (v) => { CHAT_CON = v || null; };
window.impostaOperatore = impostaOperatore;
window.ruoloOperatore = ruoloOperatore;
window.tabConsentitiOperatore = tabConsentitiOperatore;
window.operatorePuoVedere = operatorePuoVedere;
window.getSessioneOperatoreTokenTest = () => SESSIONE_OPERATORE_TOKEN;
window.setSessioneOperatoreTokenTest = (v) => { SESSIONE_OPERATORE_TOKEN = v || null; };
window.responsabileHaPassword = responsabileHaPassword;
window.setResponsabiliConPasswordTest = (v) => { RESPONSABILI_CON_PASSWORD_CACHE = v || []; };
window.aggiornaScadenza = aggiornaScadenza;
window.applicaProroga = applicaProroga;
window.aderentiProroga = aderentiProroga;
window.chiaveNavPersonale = chiaveNavPersonale;
window.generaScadenzePeriodiche = generaScadenzePeriodiche;
window.clienteById = clienteById;
window.nomeCliente = nomeCliente;
window.percentualeOnboarding = percentualeOnboarding;
window.percentualeAntiriciclaggio = percentualeAntiriciclaggio;
window.fascicoloAntiriciclaggio = fascicoloAntiriciclaggio;
window.oggiISO = oggiISO;
window.salvaStato = salvaStato;
window.caricaStato = caricaStato;
window.sincronizzaCatalogoConDefault = sincronizzaCatalogoConDefault;
window.generaComunicazioniRicorrentiDovute = generaComunicazioniRicorrentiDovute;
window.sogliaRicorrenzaGiaPassata = sogliaRicorrenzaGiaPassata;
window.ricorrenzaDovutaOggi = ricorrenzaDovutaOggi;
window.periodoRicorrenza = periodoRicorrenza;
window.aggiungiComunicazioneRicorrente = aggiungiComunicazioneRicorrente;
window.eliminaComunicazioneRicorrente = eliminaComunicazioneRicorrente;
window.adempimentiCollegabili = adempimentiCollegabili;
window.clientiPerAdempimentoCollegato = clientiPerAdempimentoCollegato;
window.nomeAdempimentoCollegato = nomeAdempimentoCollegato;
window.parseRigheBilancio = parseRigheBilancio;
window.calcolaDerivatiBilancio = calcolaDerivatiBilancio;
window.calcolaDerivatiBilancioConPrecedente = calcolaDerivatiBilancioConPrecedente;
window.elaboraImportBilancio = elaboraImportBilancio;
window.parseCSV = parseCSV;
window.anniBilancioCliente = anniBilancioCliente;
window.parsePeriodoHeaderBilancio = parsePeriodoHeaderBilancio;
window.dataFinePeriodoBilancio = dataFinePeriodoBilancio;
window.periodoBilancioInfraAnnuale = periodoBilancioInfraAnnuale;
window.etichettaBreveBilancio = etichettaBreveBilancio;
window.etichettaEstesaBilancio = etichettaEstesaBilancio;
window.salvaBilancioAnno = salvaBilancioAnno;
window.eliminaBilancioAnno = eliminaBilancioAnno;
window.suggerisciVoceBilancioDaTesto = suggerisciVoceBilancioDaTesto;
window.GRUPPO_VOCE_BILANCIO = GRUPPO_VOCE_BILANCIO;
window.pianificaImportBilancio = pianificaImportBilancio;
window.apriModalRiclassificaBilancio = apriModalRiclassificaBilancio;
window.eventiCalendarioPerGiorno = eventiCalendarioPerGiorno;
window.infoCategoriaCalendario = infoCategoriaCalendario;
window.apriModalGiornoCalendario = apriModalGiornoCalendario;
window.suggerisciCategoriaConto = suggerisciCategoriaConto;
window.suggerisciCategoriaContoDaCodice = suggerisciCategoriaContoDaCodice;
window.CATEGORIE_CONTO = CATEGORIE_CONTO;
window.CAMPI_IMPORT = CAMPI_IMPORT;
window.firmaColonne = firmaColonne;
window.suggerisciMappingColonne = suggerisciMappingColonne;
window.applicaMappingRighe = applicaMappingRighe;
window.contiDaClassificare = contiDaClassificare;
window.elaboraImportMovimenti = elaboraImportMovimenti;
window.elaboraImportFatture = elaboraImportFatture;
window.statoAggiornamentoContabile = statoAggiornamentoContabile;
window.apriImportContabile = apriImportContabile;
window.TIPI_DOCUMENTO_CONTABILE = TIPI_DOCUMENTO_CONTABILE;
window.labelTipoDocumentoContabile = labelTipoDocumentoContabile;
window.registraDocumentoContabile = registraDocumentoContabile;
window.eliminaDocumentoContabile = eliminaDocumentoContabile;
window.statoAggiornamentoDocumenti = statoAggiornamentoDocumenti;
window.verificaCoerenzaContabile = verificaCoerenzaContabile;
window.contiCliente = contiCliente;
window.creaContoCliente = creaContoCliente;
window.nomeConto = nomeConto;
window.statoContiCliente = statoContiCliente;
window.migraDocumentiContabiliConti = migraDocumentiContabiliConti;
window.migraNoteTaskTeam = migraNoteTaskTeam;
window.uploadFileReale = uploadFileReale;
window.eliminaFileReale = eliminaFileReale;
window.linkScaricaFileReale = linkScaricaFileReale;
window.apriCartellaDocumento = apriCartellaDocumento;
Object.defineProperty(window, 'HTTP_SYNC_ATTIVO', { get: () => HTTP_SYNC_ATTIVO });
window.calcolaImportoStatutario = calcolaImportoStatutario;
window.aggiungiRegolaImportoStatutario = aggiungiRegolaImportoStatutario;
window.aggiornaRegolaImportoStatutario = aggiornaRegolaImportoStatutario;
window.eliminaRegolaImportoStatutario = eliminaRegolaImportoStatutario;
window.clonaRegoleImportiStatutariDefault = clonaRegoleImportiStatutariDefault;
window.esportaVistaMCP = esportaVistaMCP;
window.eseguiComandoMCP = eseguiComandoMCP;
window.contenutoDesktopPortale = contenutoDesktopPortale;
window.apriAnteprimaPortaleSchermoIntero = apriAnteprimaPortaleSchermoIntero;
window.AZIONI_MCP = AZIONI_MCP;
window.aggiungiCliente = aggiungiCliente;
window.aggiornaCliente = aggiornaCliente;
window.eliminaCliente = eliminaCliente;
window.aggiungiTaskTeam = aggiungiTaskTeam;
window.TIPI_ADEMPIMENTO = TIPI_ADEMPIMENTO;
window.tipoFlagPeriodico = tipoFlagPeriodico;
window.tipoCategoriaScadenzaPeriodica = tipoCategoriaScadenzaPeriodica;
window.raggruppaTipiPerCategoria = raggruppaTipiPerCategoria;
window.itemsPeriodiciPerAnagrafica = itemsPeriodiciPerAnagrafica;
window.itemsAnnualiPerAnagrafica = itemsAnnualiPerAnagrafica;
window.renderAdempimentiApplicabili = renderAdempimentiApplicabili;
window.catalogoAnnualeTutti = catalogoAnnualeTutti;
window.catalogoAnnualeAttivo = catalogoAnnualeAttivo;
window.generaAdempimentiAnnuali = generaAdempimentiAnnuali;
window.SCADENZA_DINAMICA_ANNUALE = SCADENZA_DINAMICA_ANNUALE;
window.CANALI_SOLLECITO = CANALI_SOLLECITO;
window.registraSollecitoScadenza = registraSollecitoScadenza;
window.modalSolleciti = modalSolleciti;
window.dataScadenza = dataScadenza;
window.FLAG_SEMPLICI = FLAG_SEMPLICI;
window.FLAG_LABELS = FLAG_LABELS;
window.DEFAULT_CATALOGO_PERIODICO = DEFAULT_CATALOGO_PERIODICO;
window.DEFAULT_CATALOGO_ANNUALE = DEFAULT_CATALOGO_ANNUALE;
window.gestisciFileImportContabile = gestisciFileImportContabile;
window.procediDopoMapping = procediDopoMapping;
window.renderModalImportContabile = renderModalImportContabile;
window.getImportWizard = () => IMPORT_WIZARD;
window.setImportWizard = (w) => { IMPORT_WIZARD = w; };
window.migraTipoClienteLegacy = migraTipoClienteLegacy;
window.migraAtecoClienteLegacy = migraAtecoClienteLegacy;
window.migraAdempimentiDuplicati = migraAdempimentiDuplicati;
window.ADEMPIMENTI_DUPLICATI_LEGACY = ADEMPIMENTI_DUPLICATI_LEGACY;
window.labelTipoCliente = labelTipoCliente;
window.TIPI_CLIENTE = TIPI_CLIENTE;
window.render = render;
window.setView = setView;
window.mostraAvvisoRiavvioServer = mostraAvvisoRiavvioServer;
window.gestisciRiavvioAnnullato = gestisciRiavvioAnnullato;
window.cliCsvVistaCorrente = cliCsvVistaCorrente;
window.setSchedaClienteTest = function (id) { SCHEDA_CLIENTE = id; };
window.getVIEW = () => VIEW;
window.TIPI_F24 = TIPI_F24;
window.aggiungiF24 = aggiungiF24;
window.aggiornaF24 = aggiornaF24;
window.eliminaF24 = eliminaF24;
window.renderF24 = renderF24;
window.modalF24 = modalF24;
window.REGIMI_FISCALI = REGIMI_FISCALI;
window.aggiungiSocio = aggiungiSocio;
window.aggiornaSocio = aggiornaSocio;
window.eliminaSocio = eliminaSocio;
window.sociDiCliente = sociDiCliente;
window.renderSoci = renderSoci;
window.modalSocio = modalSocio;
window.FASI_F24 = FASI_F24;
window.quadratura770 = quadratura770;
window.STATI_SCADENZA_CHIUSI = STATI_SCADENZA_CHIUSI;
window.migraStatoVersamentoRitardo = migraStatoVersamentoRitardo; window.migraPacchettoPortale = migraPacchettoPortale; window.proponiAddebitoPratica = proponiAddebitoPratica; window.confermaAddebitoPratica = confermaAddebitoPratica; window.getAddebitoBozza = () => ADDEBITO_BOZZA; window.modalAddebitoPratica = modalAddebitoPratica; window.clienteHaPacchetto = clienteHaPacchetto; window.clientiPacchetto = clientiPacchetto;
window.opzioniAvanzamento = opzioniAvanzamento;
window.etichettaStatoScadenza = etichettaStatoScadenza;
window.CATEGORIE_DOCUMENTO = CATEGORIE_DOCUMENTO;
window.CATALOGO_INDICI_BILANCIO = CATALOGO_INDICI_BILANCIO;
window.modalControlloImposta = modalControlloImposta;
window.SOTTO_DICHIARAZIONE_STANDARD = SOTTO_DICHIARAZIONE_STANDARD;
window.LS_KEY = LS_KEY;
window.PAGINE = PAGINE;
window.paginaLista = paginaLista;
window.resetPagina = resetPagina;
window.RIGHE_PER_PAGINA = RIGHE_PER_PAGINA;
window.risultatiRicercaGlobale = risultatiRicercaGlobale;
window.modalRicercaGlobale = modalRicercaGlobale;
window.SCAD_SELEZIONATE = SCAD_SELEZIONATE;
window.scadenzeFiltrate = scadenzeFiltrate;
window.normalizzaStatoCaricato = normalizzaStatoCaricato;
window.inizializzaSyncCondiviso = inizializzaSyncCondiviso;
window.applicaStatoRemotoSeLibero = applicaStatoRemotoSeLibero;
window.pianificaSalvataggioCondiviso = pianificaSalvataggioCondiviso;
window.setStatoRemotoPendenteTest = (v) => { DB_STATO_REMOTO_PENDENTE = v; }; // solo per jsdom-test.js: il resto dell'app non ha bisogno di leggere/forzare questo stato dall'esterno
window.salvaFileScaricabile = salvaFileScaricabile;
window.esportaBackup = esportaBackup;
window.esportaMCP = esportaMCP;
window.elaboraImportClienti = elaboraImportClienti;
window.clienteDaRigaImport = clienteDaRigaImport;
window.campiMancantiCliente = campiMancantiCliente;
window.livelliMancantiCliente = livelliMancantiCliente;
window.confermaAzione = confermaAzione;
window.leggiFasiTarget = leggiFasiTarget;
window.migraNoteTaskTeam = migraNoteTaskTeam;
window.modificaNotaTaskTeam = modificaNotaTaskTeam;
window.eliminaNotaTaskTeam = eliminaNotaTaskTeam;
window.aggiungiNotaTaskTeam = aggiungiNotaTaskTeam;
window.modalTaskTeam = modalTaskTeam;
window.modalitaSviluppatore = modalitaSviluppatore;
window.impostaModalitaSviluppatore = impostaModalitaSviluppatore;
window.staModificandoQualcosa = staModificandoQualcosa;
window.diffStato = diffStato;
window.applicaDiffStato = applicaDiffStato;
window.unisciRemotoConLocale = unisciRemotoConLocale;
window.impostaBaseCondivisa = impostaBaseCondivisa;
window.haModificheNonCondivise = haModificheNonCondivise;
window.aggiornaAnnualeMeta = aggiornaAnnualeMeta;
window.modalBenvenutoDopoSetup = modalBenvenutoDopoSetup;
window.renderNoteAggiornamento = renderNoteAggiornamento;
window.cardAccessoRete = cardAccessoRete;
window.sottocartellaArea = sottocartellaArea;
window.sottocartellaPerCategoria = sottocartellaPerCategoria;
window.procedureTaskFiltrate = procedureTaskFiltrate;
window.htmlListaProcedureTask = htmlListaProcedureTask;
window.impostaProceduraTask = impostaProceduraTask;
window.nomeCartellaPratica = nomeCartellaPratica;
window.htmlCampoPratica = htmlCampoPratica;
window.opzioniProcedureTask = opzioniProcedureTask;
window.navIndietro = navIndietro;
window.navAvanti = navAvanti;
window.navPuoIndietro = navPuoIndietro;
window.navPuoAvanti = navPuoAvanti;
window.resetNavStoriaTest = () => { NAV_STORIA = []; NAV_STORIA_POS = -1; };
window.parseDataTesto = parseDataTesto;
window.patchDaScelta = patchDaScelta;
window.badgeAddebitoF24 = badgeAddebitoF24;
window.operatoreObbligatorio = operatoreObbligatorio;
window.modalSelettoreOperatore = modalSelettoreOperatore;
window.modalPasswordOperatore = modalPasswordOperatore;
window.resetAccessoLanTest = () => { ACCESSO_LAN_CACHE = null; ACCESSO_LAN_CARICAMENTO = false; };
window.passiSetupStudio = passiSetupStudio;
window.annualiEffettivi = annualiEffettivi;
window.annualeAutomatico = annualeAutomatico;
window.evidenziaCampiMancantiForm = evidenziaCampiMancantiForm;
window.renderWizardImportClienti = renderWizardImportClienti;
window.modalCliente = modalCliente;
window.chiudiModal = chiudiModal;
window.scaricaTemplateClienti = scaricaTemplateClienti;
window.COLONNE_IMPORT_CLIENTI = COLONNE_IMPORT_CLIENTI;
window.apriWizardImportClienti = apriWizardImportClienti;
window.mappaturaAutomaticaImportClienti = mappaturaAutomaticaImportClienti;
window.PREVIDENZE = PREVIDENZE;
window.generaRtfDaTesto = generaRtfDaTesto;
window.escapeRtf = escapeRtf;
window.testoElencoAttivita = testoElencoAttivita;
window.creaPreventivoDaModello = creaPreventivoDaModello;
window.datiAssociazione = datiAssociazione; window.testoModuliPreventivo = testoModuliPreventivo; window.stampeLibriTutte = stampeLibriTutte; window.vociAttesaLibri = vociAttesaLibri; window.impostaStampatoFino = impostaStampatoFino; window.sintesiStampaLibri = sintesiStampaLibri; window.assicuraLibriSocieta = assicuraLibriSocieta; window.segnaStampaLibro = segnaStampaLibro; window.libroDelCliente = libroDelCliente; window.stampeLibriDaFare = stampeLibriDaFare; window.unisciLibriSociali = unisciLibriSociali; window.libroDelCliente = libroDelCliente; window.modalPreventivo = modalPreventivo;
window.testoDocumentoToHtml = testoDocumentoToHtml; window.editorDocumentoToTesto = editorDocumentoToTesto; window.documentoStampaHtml = documentoStampaHtml;

init();

/* Se per qualsiasi motivo la pagina scorre in orizzontale (focus su un campo fuori vista, tabella larga), la si riporta a 0: la sidebar fissa coprirebbe il contenuto. */
window.addEventListener('scroll', () => { if (window.scrollX) window.scrollTo(0, window.scrollY); }, { passive: true });
