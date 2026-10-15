'use strict';
/* -------------------- RENDER: PORTALE CLIENTE (framework/anteprima) -------------------- */
let PORTAL_CLIENTE = null;

/* Schermata attiva nell'anteprima DESKTOP a schermo intero. "panoramica" è sempre quella iniziale
   quando si apre l'anteprima. */
let PORTAL_DESKTOP_TAB = 'panoramica';

/* Se true, i dati anagrafici sensibili (P.IVA, CF, contatti, sede) nell'anteprima desktop vengono
   mascherati — utile per mostrare il portale a schermo intero (es. in riunione, su un proiettore)
   senza esporre dati del cliente. Scelta salvata in locale, non per singolo cliente: resta come
   l'hai lasciata anche se chiudi e riapri il gestionale. */
let PORTAL_NASCONDI_SENSIBILI = false;
try { PORTAL_NASCONDI_SENSIBILI = localStorage.getItem('gestionaleStudioPortaleNascondiSensibili_v1') === '1'; } catch (err) { /* storage non disponibile: default visibile */ }
function toggleNascondiSensibiliPortale() {
  PORTAL_NASCONDI_SENSIBILI = !PORTAL_NASCONDI_SENSIBILI;
  try { localStorage.setItem('gestionaleStudioPortaleNascondiSensibili_v1', PORTAL_NASCONDI_SENSIBILI ? '1' : '0'); } catch (err) { /* niente di grave: resta valido solo per questa sessione */ }
  apriAnteprimaPortaleSchermoIntero();
}
function valoreSensibilePortale(valore) {
  if (PORTAL_NASCONDI_SENSIBILI) return '<span class="pd-masked">••••••••</span>';
  return valore ? escapeHtml(valore) : '<span style="color:var(--text-mut);">—</span>';
}

/* Task #88 nell'anteprima: stessa area cliente interattiva del portale VERO (portale-cliente.htm —
   box "scrivi allo studio", "Chiedi info su questa scadenza", risposte ai thread), riproposta qui
   dentro l'anteprima così Matteo può vedere/provare esattamente cosa vedrebbe il cliente, senza
   dover attivare un accesso portale reale né avere server.js acceso (l'anteprima gira sempre,
   legge/scrive direttamente STATE in memoria). */
let PORTAL_PREVIEW_PREFILL_SCAD = null; // {id, nome} - riferimento scadenza pre-compilato dal box "scrivi"
let PORTAL_PREVIEW_RISPOSTA_APERTA = null; // id della comunicazione con il box risposta espanso, o null

/* Stessa validazione/creazione di aggiungiMessaggioPortaleClienteEsterno più sotto, ma senza il
   livello di token: qui il "chiamante" è Matteo dentro il proprio gestionale, non un cliente
   esterno da verificare. Le due funzioni condividono lo stesso nucleo (_creaMessaggioCliente) così
   la logica di creazione non è mai duplicata - solo il modo in cui si risolve il cliente cambia. */
// fileInfo (task #108): { percorso, nomeFile, dimensione } se il cliente ha allegato un file al
// messaggio (es. il documento che lo studio gli aveva chiesto) - null/omesso altrimenti. Chi
// chiama si occupa SEMPRE di salvare il file reale (uploadFileReale in anteprima, il server via
// server.js per il portale vero) PRIMA di arrivare qui: questa funzione si limita ad attaccarne i
// metadati al messaggio, esattamente come già succede per gli allegati lato studio.
function _creaMessaggioCliente(cliente, testo, scadenzaIdRif, fileInfo) {
  if (!cliente) return null;
  const t = (testo || '').trim().slice(0, 4000);
  if (!t) return null;
  let rif = null;
  if (scadenzaIdRif) {
    const scad = derivati().tutteScadenze.find(s => s.id === scadenzaIdRif && s.clienteId === cliente.id);
    if (scad) rif = { id: scad.id, nome: scad.nome, data: scad.data };
  }
  const msg = {
    id: uid('com'), clienteId: cliente.id, data: oggiISO(), direzione: 'cliente',
    categoria: rif ? 'Richiesta su scadenza' : 'Domanda dal cliente',
    oggetto: rif ? ('Richiesta su: ' + rif.nome) : 'Domanda dal portale cliente',
    corpo: t, stato: 'Inviata', visibilePortale: true, vistaPortale: true, vistaStudio: false,
    scadenzaRif: rif, risposte: [],
  };
  if (fileInfo && fileInfo.percorso) {
    msg.filePercorso = fileInfo.percorso; msg.fileNome = fileInfo.nomeFile; msg.fileDimensione = fileInfo.dimensione;
  }
  STATE.comunicazioni.push(msg);
  salvaStato();
  return msg;
}
function messaggioClientePreview(clienteId, testo, scadenzaIdRif, fileInfo) {
  return _creaMessaggioCliente(clienteById(clienteId), testo, scadenzaIdRif, fileInfo);
}
function rispostaClientePreview(clienteId, comunicazioneId, testo, fileInfo) {
  const c = STATE.comunicazioni.find(x => x.id === comunicazioneId && x.clienteId === clienteId && x.visibilePortale !== false);
  if (!c) return null;
  return aggiungiRispostaComunicazione(comunicazioneId, testo, 'cliente', fileInfo);
}

/* Richiesta di Matteo (campagna 770): far vedere al cliente, vicino agli F24, anche le fatture con
   ritenuta d'acconto con il loro stadio. Il problema che descrive è esattamente quello che il motore
   di calcolo già gestisce (vedi calcolaScadenzeRitenute/generaScadenzeRitenute più sopra): finché il
   cliente non paga la fattura (r.dataPagamento nullo) la ritenuta non entra nel cumulo e non genera
   nessuna scadenza F24 - va quindi mostrata come riga a sé, non come scadenza. I tre stadi
   corrispondono esattamente a statoRit, che il resto dell'app già usa (vedi STATI_RITENUTA e
   generaScadenzeRitenute): qui si limita a tradurli in un'etichetta/colore pensati per il cliente,
   senza introdurre un nuovo stato parallelo. */
function stadioRitenutaPortale(r) {
  if (!r.dataPagamento) return { codice: 'non_pagata', label: 'Fattura da pagare', classe: 'nuova' };
  if (['Pagata', 'Inviata'].includes(r.statoRit)) return { codice: 'tutto_pagato', label: 'Tutto pagato', classe: 'chiusa' };
  return { codice: 'ritenuta_da_versare', label: 'Pagata — ritenuta da versare', classe: 'attesa' };
}
/* Dati del portale per un cliente, calcolati una volta e usati dalla vista desktop a schermo intero
   (contenutoDesktopPortale) - isolati qui in una funzione a parte così, se in futuro si aggiunge
   un'altra presentazione della stessa vista, i dati restano un'unica fonte di verità. */
function datiPortaleCliente(cliente) {
  const { tutteScadenze, annuali } = derivati();
  const scadenzeClienteTutte = tutteScadenze.filter(s => s.clienteId === cliente.id && !STATI_SCADENZA_CHIUSI.includes(s.stato))
    .sort((a,b) => a.data.localeCompare(b.data));
  const scadenzeCliente = scadenzeClienteTutte.slice(0, 5);
  const annualiCliente = annuali.filter(a => a.clienteId === cliente.id);
  const annualiIncompleti = annualiCliente.filter(a => !a.completato).length;
  const comClienteTutte = STATE.comunicazioni.filter(c => c.clienteId === cliente.id && c.stato === 'Inviata' && c.visibilePortale !== false)
    // Stesso ordinamento della tabella lato studio (task #124): "data" è solo la data (YYYY-MM-DD),
    // quindi a parità di giorno serve creataIl (timestamp completo) come secondo criterio, altrimenti
    // una comunicazione appena creata oggi non risulta per forza la prima tra quelle di oggi - bug
    // segnalato da Matteo come "sembra uguale a prima" dal portale, perché questo sort qui non era
    // mai stato allineato a quello corretto in renderComunicazioni().
    .sort((a,b) => (b.data||'').localeCompare(a.data||'') || (b.creataIl||'').localeCompare(a.creataIl||''));
  const comCliente = comClienteTutte.filter(c => !c.archiviataPortale);
  const comClienteArchiviate = comClienteTutte.filter(c => c.archiviataPortale);
  const comClienteNonLette = comCliente.filter(c => !c.vistaPortale).length;
  const docCliente = STATE.documenti.filter(d => d.clienteId === cliente.id).sort((a,b)=>(b.dataCaricamento||'').localeCompare(a.dataCaricamento||''));
  const pctOnboarding = percentualeOnboarding(STATE.onboarding[cliente.id]);
  const anniBilancioPortale = anniBilancioCliente(cliente.id);
  // Fatture con ritenuta (richiesta Matteo, campagna 770): sempre visibili finché APERTE (fattura da
  // pagare, o pagata ma ritenuta non ancora versata), qualunque sia l'anno - non si vuole che una
  // fattura vecchia non ancora sistemata sparisca dal portale solo perché "fuori anno". Quelle già
  // chiuse (statoRit Pagata/Inviata) restano visibili solo per l'anno corrente e il precedente, come
  // breve estratto/conferma "tutto pagato", invece di accumulare all'infinito lo storico completo.
  const ritenuteCliente = (STATE.ritenuteRighe || [])
    .filter(r => r.clienteId === cliente.id)
    .filter(r => {
      if (!['Pagata', 'Inviata'].includes(r.statoRit)) return true;
      const annoFattura = (r.dataFattura || '').slice(0, 4);
      return annoFattura === String(STATE.annoCorrente) || annoFattura === String(STATE.annoCorrente - 1);
    })
    .sort((a, b) => (b.dataFattura || '').localeCompare(a.dataFattura || ''));
  return { scadenzeClienteTutte, scadenzeCliente, annualiCliente, annualiIncompleti, comClienteTutte, comCliente, comClienteArchiviate, comClienteNonLette, docCliente, pctOnboarding, anniBilancioPortale, ritenuteCliente };
}

/* -------------------- PORTALE CLIENTE ESTERNO (accesso reale, task #87) --------------------
   Le funzioni sopra (datiPortaleCliente, contenutoDesktopPortale) sono
   pensate per l'ANTEPRIMA interna: girano dentro il gestionale, che ha già l'intero STATE in
   memoria (tutti i clienti) — lì va benissimo, perché a usarle è personale dello studio.
   Per un cliente esterno che accede tramite link con token (vedi attivaPortaleCliente) la
   situazione è diversa: quel browser NON deve mai ricevere un solo byte relativo ad altri
   clienti, nemmeno dentro una risposta di rete che poi "semplicemente non viene mostrata a
   schermo" — è la differenza tra un filtro estetico e un isolamento vero. Per questo:
     - server.js NON manda mai gestionale.htm né l'intero dati-studio.json a un cliente esterno;
       carica invece questo stesso file in un motore headless (jsdom, già usato per i test) e
       chiama SOLO costruisciVistaPortaleClienteEsterna(token), che ritorna già il JSON minimo e
       filtrato da spedire — vedi window.costruisciVistaPortaleClienteEsterna più sotto.
     - i documenti/allegati non espongono mai il percorso reale sul disco (filePercorso): la vista
       ritorna solo un "documentoToken" opaco, che il cliente-facing (portale-cliente.htm) rimanda
       al server per il download; risolviDocumentoPortaleEsterno verifica che quel documento
       appartenga DAVVERO al cliente del token prima di risolverlo a un percorso reale.
     - se il token non corrisponde a nessun cliente attivo (mai attivato, rigenerato, disattivato)
       si ritorna null: chi chiama risponde con un errore generico, senza indizi su "perché". */
// Confronto a tempo costante rispetto al CONTENUTO (non serve nascondere la lunghezza, solo dove le
// due stringhe differiscono - è quello che un === naive rivelerebbe con un timing attack ripetuto).
// Non usa crypto.timingSafeEqual di Node (come invece fa /api/operatore-login in server.js) perché
// questa funzione gira in DUE contesti diversi: nel browser reale per l'anteprima interna allo
// studio, e dentro una finestra jsdom (motorePortale in server.js) per il portale esterno vero - né
// l'uno né l'altro espongono le API crypto di Node.
function confrontoTempoCostante(a, b) {
  a = String(a); b = String(b);
  const lunghezzaMax = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < lunghezzaMax; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function costruisciVistaPortaleClienteEsterna(token, password) {
  if (!token || typeof token !== 'string') return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato) return null;
  const { cliente, accesso } = trovato;
  // Password per-accesso (task Matteo, vedi cardPasswordPortaleCliente): se non impostata il link
  // segreto resta l'unica protezione, come prima - nessuna richiesta di password quindi nessun
  // ostacolo per i clienti già attivi a cui non ne è stata data una. Per l'accesso principale è la
  // stessa identica password di sempre (trovaAccessoPortale la riporta su accesso.password), per un
  // accesso secondario è la sua propria.
  if (accesso.password && !confrontoTempoCostante(accesso.password, password || '')) {
    return { richiedePassword: true };
  }

  const { scadenzeClienteTutte, annualiCliente, annualiIncompleti, comCliente, comClienteArchiviate, comClienteNonLette, docCliente, pctOnboarding, anniBilancioPortale, ritenuteCliente } = datiPortaleCliente(cliente);
  const contattiC = cliente.contatti || {};

  const azienda = {
    ragioneSociale: cliente.ragioneSociale,
    tipo: labelTipoCliente(cliente.tipo),
    regimeFiscale: cliente.regimeFiscale || null,
    settore: cliente.settore || null,
    clienteDal: cliente.annoIngresso || null,
    partitaIva: cliente.partitaIva || null,
    codiceFiscale: cliente.codiceFiscale || null,
    sede: [contattiC.indirizzo, [contattiC.cap, contattiC.localita].filter(Boolean).join(' '), contattiC.provincia].filter(Boolean).join(', ') || null,
    email: contattiC.email || null,
    telefono: contattiC.telefono || null,
    pec: contattiC.pec || null,
    referenteStudio: cliente.responsabileStudio || null,
    nomeStudio: STATE.meta.studioNome || 'Studio',
  };

  const mappaCom = (c) => ({
    id: c.id,
    oggetto: c.oggetto,
    data: c.data,
    categoria: categoriaComunicazione(c),
    corpo: c.corpo || null,
    nuova: !c.vistaPortale,
    richiedeConferma: !!c.richiedeConferma,
    confermaLetturaData: c.confermaLetturaData || null,
    direzione: c.direzione === 'cliente' ? 'cliente' : 'studio',
    richiestaChiusa: c.direzione === 'cliente' ? !!c.richiestaChiusa : false,
    scadenzaRif: c.scadenzaRif || null,
    risposte: (c.risposte || []).map(r => ({
      autore: r.autore === 'cliente' ? 'cliente' : 'studio', testo: r.testo, data: r.data,
      allegato: r.filePercorso ? { nome: r.fileNome || 'Allegato', documentoToken: 'risp_' + r.id } : null,
    })),
    allegato: c.filePercorso ? { nome: c.fileNome || 'Allegato', documentoToken: 'com_' + c.id } : null,
  });
  const comunicazioni = comCliente.map(mappaCom);
  const comunicazioniArchiviate = comClienteArchiviate.map(mappaCom);

  const scadenze = scadenzeClienteTutte.map(s => ({
    id: s.id,
    nome: s.nome,
    tipo: s.tipo || null,
    data: s.data,
    importo: (typeof s.importo === 'number') ? s.importo : null,
    stato: s.stato,
    delta: deltaLabel(s.data),
  }));

  /* Scadenze marcate "Cliente non può pagare" (richiesta Matteo): l'importo del versamento (F24) arriva
     nell'area cliente come "pagamento in ritardo", in un riquadro a sé, con data originale e giorni di
     ritardo. Nessun testo di sollecito: è la fotografia di quanto resta da regolarizzare. */
  const pagamentiInRitardo = scadenzeClienteTutte.filter(s => s.stato === STATO_NON_PUO_PAGARE).map(s => ({
    id: s.id, nome: s.nome, data: s.data,
    importo: (typeof s.importo === 'number') ? s.importo : null,
    delta: deltaLabel(s.data),
  }));

  const ritenute = ritenuteCliente.map(r => ({
    id: r.id, percipiente: r.percipiente, numeroFattura: r.numeroFattura || null,
    dataFattura: r.dataFattura, importo: Number(r.importo) || 0, stadio: stadioRitenutaPortale(r),
  }));

  const documenti = docCliente.map(d => ({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    praticaCartella: d.praticaCartella || null,
    dataCaricamento: d.dataCaricamento || null,
    dataScadenza: d.dataScadenza || null,
    documentoToken: d.filePercorso ? ('doc_' + d.id) : null,
  }));

  // Task #178 (Matteo: "sezione Andamento portale cliente troppo povera"): la causa reale non era
  // l'interfaccia - portale-cliente.htm > renderAndamento() era già costruita per mostrare patrimonio
  // netto, ROI/ROS/margine EBITDA, liquidità, indebitamento, giorni di incasso, composizione dei
  // costi e le variazioni rispetto al periodo precedente (vedi i commenti lì, riferiti a una ricerca
  // su Fathom/Spotlight Reporting/Syft Analytics e al PDF "Dal Business Plan al Cash Flow" di
  // riferimento per questi indicatori) - ma QUESTO oggetto, quello davvero spedito al portale esterno
  // reale, calcolava solo ricavi/utile netto/ROE: il resto arrivava sempre undefined e spariva dietro
  // ai controlli "!= null" del template, lasciando il cliente con tre numeri e due grafichetti invece
  // della vista completa già pronta. Qui si completa il calcolo, riusando le stesse funzioni già
  // usate per la vista Bilanci&KPI dello studio (calcolaDerivatiBilancio/ConPrecedente, semaforoIndice,
  // CATALOGO_INDICI_BILANCIO) così i due lati restano coerenti tra loro.
  let andamento = null;
  if (anniBilancioPortale.length > 0) {
    const ultimoAnno = anniBilancioPortale[anniBilancioPortale.length - 1];
    const idxUltimo = anniBilancioPortale.indexOf(ultimoAnno);
    const annoPrecedente = idxUltimo > 0 ? anniBilancioPortale[idxUltimo - 1] : null;
    const dB = calcolaDerivatiBilancioConPrecedente(STATE.bilanci[cliente.id][ultimoAnno], annoPrecedente ? STATE.bilanci[cliente.id][annoPrecedente] : null);
    const dPrec = annoPrecedente ? calcolaDerivatiBilancio(STATE.bilanci[cliente.id][annoPrecedente]) : null;
    const variazione = (attuale, precedente) => (typeof attuale === 'number' && typeof precedente === 'number' && precedente !== 0) ? (attuale - precedente) / Math.abs(precedente) : null;
    const semaforoPerChiave = (chiave, valore) => {
      const def = CATALOGO_INDICI_BILANCIO.find(i => i.chiave === chiave);
      return def ? semaforoIndice(def, valore) : null;
    };
    andamento = {
      etichettaUltimoPeriodo: etichettaEstesaBilancio(ultimoAnno),
      ricavi: (typeof dB.ricavi === 'number') ? dB.ricavi : null,
      utileNetto: (typeof dB.utileNetto === 'number') ? dB.utileNetto : null,
      patrimonioNetto: (typeof dB.patrimonioNetto === 'number') ? dB.patrimonioNetto : null,
      roe: (typeof dB.roe === 'number') ? dB.roe : null,
      roi: (typeof dB.roi === 'number') ? dB.roi : null,
      ros: (typeof dB.ros === 'number') ? dB.ros : null,
      ebitdaMargin: (typeof dB.ebitdaMargin === 'number') ? dB.ebitdaMargin : null,
      currentRatio: (typeof dB.currentRatio === 'number') ? dB.currentRatio : null,
      indiceIndebitamento: (typeof dB.indiceIndebitamento === 'number') ? dB.indiceIndebitamento : null,
      // DSO (giorni medi di incasso crediti) è calcolabile dai dati che raccogliamo (crediti clienti
      // / ricavi * 365). Il DPO (giorni medi di pagamento debiti) NO: il nostro modello semplificato
      // ha un unico campo "debiti a breve" che mescola debiti verso fornitori e debiti finanziari a
      // breve, quindi qui resta sempre null - meglio n/d (il template lo nasconde) che un numero
      // inventato mescolando cose diverse.
      giorniIncassoCrediti: (typeof dB.ricavi === 'number' && dB.ricavi > 0 && typeof dB.creditiClienti === 'number') ? (dB.creditiClienti / dB.ricavi) * 365 : null,
      giorniPagamentoDebiti: null,
      magazzino: (typeof dB.rimanenze === 'number' && dB.rimanenze > 0) ? dB.rimanenze : null,
      variazioneRicavi: dPrec ? variazione(dB.ricavi, dPrec.ricavi) : null,
      variazioneUtileNetto: dPrec ? variazione(dB.utileNetto, dPrec.utileNetto) : null,
      variazionePatrimonioNetto: dPrec ? variazione(dB.patrimonioNetto, dPrec.patrimonioNetto) : null,
      semaforoRedditivita: semaforoPerChiave('roe', dB.roe),
      semaforoLiquidita: semaforoPerChiave('currentRatio', dB.currentRatio),
      semaforoSolidita: semaforoPerChiave('indiceIndebitamento', dB.indiceIndebitamento),
      serieRicavi: anniBilancioPortale.map(a => ({ etichetta: etichettaBreveBilancio(a), valore: STATE.bilanci[cliente.id][a].ricavi || 0 })),
      serieUtile: anniBilancioPortale.map(a => ({ etichetta: etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).utileNetto || 0 })),
      seriePatrimonioNetto: anniBilancioPortale.map(a => ({ etichetta: etichettaBreveBilancio(a), valore: STATE.bilanci[cliente.id][a].patrimonioNetto || 0 })),
      serieCosti: anniBilancioPortale.map(a => {
        const d = calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]);
        return { etichetta: etichettaBreveBilancio(a), valore: (d.costiEsterni||0) + (d.costoPersonale||0) + (d.ammortamenti||0) };
      }),
      // Composizione dei costi dell'ultimo periodo per la torta (Matteo: "per la differenziazione
      // dei tipi di costi usa grafici a torta", vedi graficoTorta in portale-cliente.htm) - solo le
      // 5 macro-categorie che già raccogliamo, niente di inventato o stimato.
      dettaglio: (function () {
        const bil = STATE.bilanci[cliente.id];
        const dp = (a) => calcolaDerivatiBilancio(bil[a]);
        const serie = (f) => anniBilancioPortale.map(a => ({ etichetta: etichettaBreveBilancio(a), valore: f(a) }));
        const num = (v) => (typeof v === 'number' && !isNaN(v)) ? v : null;
        const indiciDi = (categoria) => CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === categoria).map(def => ({
          chiave: def.chiave, nome: def.nome, formato: def.formato, direzione: def.direzione,
          sogliaVerde: def.sogliaVerde, sogliaGiallo: def.sogliaGiallo,
          valore: num(dB[def.chiave]), semaforo: semaforoIndice(def, dB[def.chiave]),
          spiegazione: def.spiegazione, consiglio: def.consiglio,
        }));
        const pLiq = punteggioCategoria('Liquidità', dB), pRed = punteggioCategoria('Redditività', dB);
        const pSol = punteggioCategoria('Solidità', dB), pEff = punteggioCategoria('Efficienza', dB);
        const validi = [pLiq, pRed, pSol, pEff].filter(p => p !== null);
        const pGen = validi.length ? validi.reduce((a, b) => a + b, 0) / validi.length : null;
        const trend = dPrec ? [['Ricavi', dB.ricavi, dPrec.ricavi], ['EBITDA', dB.ebitda, dPrec.ebitda], ['Utile netto', dB.utileNetto, dPrec.utileNetto]]
          .map(([nome, a, p]) => ({ nome, delta: variazione(a, p) })).filter(t => t.delta !== null) : [];
        // Vista "Situazione comparata" del portale: ogni indice del catalogo sugli ultimi (max 3)
        // periodi disponibili, con il semaforo di ciascuno, più il punteggio delle 4 aree per periodo.
        // Ogni periodo è calcolato col SUO periodo precedente (come per l'ultimo, vedi dB) così CFO/DSCR
        // restano coerenti; un indice mai calcolabile in nessun periodo non compare.
        const annoComp = anniBilancioPortale.slice(-3);
        const derPer = annoComp.map(a => {
          const i = anniBilancioPortale.indexOf(a);
          return calcolaDerivatiBilancioConPrecedente(bil[a], i > 0 ? bil[anniBilancioPortale[i - 1]] : null);
        });
        const comparato = {
          periodi: annoComp.map(a => etichettaBreveBilancio(a)),
          punteggi: ['Liquidità', 'Redditività', 'Solidità', 'Efficienza'].map(cat => ({ nome: cat, valori: derPer.map(dd => num(punteggioCategoria(cat, dd))) })),
          indici: CATALOGO_INDICI_BILANCIO.map(def => ({
            chiave: def.chiave, nome: def.nome, categoria: def.categoria, formato: def.formato, direzione: def.direzione,
            valori: derPer.map(dd => num(dd[def.chiave])),
            semafori: derPer.map(dd => semaforoIndice(def, dd[def.chiave])),
          })).filter(ind => ind.valori.some(v => v !== null)),
        };
        return {
          punteggioGenerale: pGen, etichettaPunteggio: etichettaPunteggio(pGen),
          punteggi: { 'Liquidità': pLiq, 'Redditività': pRed, 'Solidità': pSol, 'Efficienza': pEff },
          comparato,
          trend,
          sezioni: [
            { nome: 'Liquidità', icona: '💧', intro: 'La capacità di far fronte agli impegni a breve termine con quello che l\'azienda ha già in cassa o può incassare rapidamente.', gauge: ['currentRatio', 'quickRatio'], indici: indiciDi('Liquidità') },
            { nome: 'Redditività', icona: '📈', intro: 'Quanto rende l\'attività: il margine che resta dopo i costi, e quanto frutta il capitale messo dai soci.', gauge: ['roe', 'ebitdaMargin'], indici: indiciDi('Redditività') },
            { nome: 'Solidità', icona: '🛡️', intro: 'Quanto l\'azienda dipende dai debiti e quanto regge nel tempo il loro peso.', gauge: ['indiceIndebitamento', 'pfnEbitda', 'dscr'], indici: indiciDi('Solidità') },
            { nome: 'Efficienza', icona: '⚙️', intro: 'Quanto bene l\'azienda "gira": il peso del personale sui ricavi e la velocità con cui trasforma le vendite in cassa.', gauge: ['incidenzaPersonale', 'giorniIncassoCrediti'], indici: indiciDi('Efficienza') },
          ],
          serieLiquidita: serie(a => bil[a].liquidita || 0),
          serieCurrentRatio: serie(a => num(dp(a).currentRatio)),
          serieRicaviTrend: serie(a => bil[a].ricavi || 0),
          serieEbitda: serie(a => num(dp(a).ebitda) || 0),
          serieUtileTrend: serie(a => num(dp(a).utileNetto) || 0),
          seriePfn: serie(a => num(dp(a).pfn) || 0),
          serieDso: serie(a => num(dp(a).giorniIncassoCrediti) || 0),
          donutCircolante: [
            { label: 'Rimanenze', valore: dB.rimanenze || 0, colore: '#06b6d4' },
            { label: 'Crediti verso clienti', valore: dB.creditiClienti || 0, colore: 'var(--blu-mid)' },
            { label: 'Liquidità', valore: dB.liquidita || 0, colore: 'var(--verde)' },
            { label: 'Altre attività', valore: dB.altreAttivita || 0, colore: '#8b93a7' },
          ],
          donutFonti: [
            { label: 'Patrimonio netto', valore: dB.patrimonioNetto || 0, colore: 'var(--verde)' },
            { label: 'Debiti a lungo termine', valore: dB.debitiLungo || 0, colore: 'var(--blu-mid)' },
            { label: 'Debiti a breve termine', valore: dB.debitiBreve || 0, colore: 'var(--giallo)' },
            { label: 'Altre passività', valore: dB.altrePassivita || 0, colore: '#8b93a7' },
          ],
          waterfall: [
            { label: 'Ricavi', valore: dB.ricavi, tipo: 'totale' },
            { label: 'Costi esterni', valore: -(dB.costiEsterni || 0), tipo: 'delta' },
            { label: 'Costo del personale', valore: -(dB.costoPersonale || 0), tipo: 'delta' },
            { label: 'EBITDA', valore: dB.ebitda, tipo: 'totale' },
            { label: 'Ammortamenti', valore: -(dB.ammortamenti || 0), tipo: 'delta' },
            { label: 'Oneri finanziari', valore: -(dB.oneriFinanziari || 0), tipo: 'delta' },
            { label: 'Imposte', valore: -(dB.imposte || 0), tipo: 'delta' },
            { label: 'Utile netto', valore: dB.utileNetto, tipo: 'totale' },
          ],
        };
      })(),
      ripartizioneCosti: [
        { etichetta: 'Costi esterni (materie prime, servizi...)', valore: dB.costiEsterni || 0 },
        { etichetta: 'Personale', valore: dB.costoPersonale || 0 },
        { etichetta: 'Ammortamenti', valore: dB.ammortamenti || 0 },
        { etichetta: 'Oneri finanziari', valore: dB.oneriFinanziari || 0 },
        { etichetta: 'Imposte', valore: dB.imposte || 0 },
      ],
    };
  }

  // Accessi limitati (task Matteo: "amministrazione" con visibilità solo su alcune sezioni): i dati
  // delle sezioni non consentite non vengono nemmeno mandati fuori (non solo nascosti in UI), sia
  // per i pannelli sia per i relativi contatori in "numeri" - stessa cautela già usata altrove in
  // questo file (es. risolviDocumentoPortaleEsterno) di non fidarsi della sola interfaccia.
  const puoVedere = (sezione) => accessoPortalePuoVedere(accesso, sezione);
  const pacchetto = clienteHaPacchetto(cliente);
  const f24Cliente = (pacchetto && puoVedere('scadenze')) ? (STATE.f24 || []).filter(f => f.clienteId === cliente.id).slice().sort((a, b) => (b.data || '').localeCompare(a.data || '')).map(f => ({
    id: f.id, descrizione: f.descrizione || null, tipo: f.tipo, data: f.data, importo: Number(f.importo) || 0, importoPagato: Number(f.importoPagato) || 0,
    stato: statoF24(f), modalitaPagamento: f.modalitaPagamento || null,
    righe: righeF24(f).map(r => ({ id: r.id, codiceTributo: r.codiceTributo || '', descrizione: r.descrizione || '', importo: Number(r.importo) || 0, importoPagato: Number(r.importoPagato) || 0 })),
  })) : [];
  return {
    azienda,
    pacchetto,
    accesso: { nome: accesso.nome, ruolo: accesso.ruolo, sezioniConsentite: (accesso.ruolo === 'completo' ? SEZIONI_PORTALE_LIMITABILI.map(s => s.id) : (accesso.tabConsentiti || [])).filter(s => pacchetto || s !== 'andamento') },
    numeri: {
      scadenzeAperte: puoVedere('scadenze') ? scadenzeClienteTutte.length : 0,
      comunicazioniDaLeggere: puoVedere('comunicazioni') ? comClienteNonLette : 0,
      documentiCondivisi: puoVedere('documenti') ? docCliente.length : 0,
      percorsoOnboardingCompletato: pctOnboarding,
      adempimentiAnnualiCompletati: annualiCliente.length - annualiIncompleti,
      adempimentiAnnualiTotali: annualiCliente.length,
    },
    comunicazioni: puoVedere('comunicazioni') ? comunicazioni : [],
    comunicazioniArchiviate: puoVedere('comunicazioni') ? comunicazioniArchiviate : [],
    scadenze: puoVedere('scadenze') ? scadenze.filter(s => s.stato !== STATO_NON_PUO_PAGARE) : [],
    pagamentiInRitardo: puoVedere('scadenze') ? pagamentiInRitardo : [],
    // Stesso permesso delle scadenze/F24 (vedi SEZIONI_PORTALE_LIMITABILI): sono fatture che
    // riguardano versamenti verso l'Erario, concettualmente la stessa area per un accesso limitato.
    ritenute: (pacchetto && puoVedere('scadenze')) ? ritenute : [],
    f24Tutti: f24Cliente,
    f24InAttesa: f24Cliente.filter(f => f.stato !== 'Pagato'),
    documenti: puoVedere('documenti') ? documenti : [],
    andamento: (pacchetto && puoVedere('andamento')) ? andamento : null,
  };
}

/* Risolve un download richiesto dal portale esterno: dato il token di accesso del cliente e un
   "documentoToken" opaco (mai il percorso reale sul disco — vedi sopra), ritorna il percorso solo
   se il documento/allegato appartiene DAVVERO al cliente di quel token. Usata da server.js prima
   di servire il file: senza questo controllo, un cliente che conoscesse/indovinasse l'id interno
   di un documento altrui potrebbe scaricarlo passando solo il proprio token valido. */
function risolviDocumentoPortaleEsterno(token, documentoToken) {
  if (!token || !documentoToken || typeof documentoToken !== 'string') return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato) return null;
  const { cliente, accesso } = trovato;
  if (documentoToken.indexOf('doc_') === 0) {
    if (!accessoPortalePuoVedere(accesso, 'documenti')) return null;
    const docId = documentoToken.slice(4);
    const d = STATE.documenti.find(x => x.id === docId && x.clienteId === cliente.id);
    if (d && d.filePercorso) return { filePercorso: d.filePercorso, nomeFile: d.nome };
  } else if (documentoToken.indexOf('com_') === 0) {
    if (!accessoPortalePuoVedere(accesso, 'comunicazioni')) return null;
    const comId = documentoToken.slice(4);
    const c = STATE.comunicazioni.find(x => x.id === comId && x.clienteId === cliente.id && x.visibilePortale !== false);
    if (c && c.filePercorso) return { filePercorso: c.filePercorso, nomeFile: c.fileNome || 'Allegato' };
  } else if (documentoToken.indexOf('risp_') === 0) {
    if (!accessoPortalePuoVedere(accesso, 'comunicazioni')) return null;
    // Allegato su UNA RISPOSTA (task #108, non sulla comunicazione originale): va cercato dentro
    // le risposte di una comunicazione che appartenga davvero a questo cliente e sia visibile nel
    // portale — stessa cautela di sopra, solo un livello più in profondità.
    const rispId = documentoToken.slice(5);
    const comCandidata = STATE.comunicazioni.find(x => x.clienteId === cliente.id && x.visibilePortale !== false && (x.risposte || []).some(r => r.id === rispId));
    const risp = comCandidata ? comCandidata.risposte.find(r => r.id === rispId) : null;
    if (risp && risp.filePercorso) return { filePercorso: risp.filePercorso, nomeFile: risp.fileNome || 'Allegato' };
  }
  return null;
}

/* Aggiunge una risposta a un thread di comunicazione (task #88): usata sia dallo studio (dentro
   gestionale.htm, dal modale del thread) sia — tramite aggiungiRispostaPortaleClienteEsterno più
   sotto — da un cliente esterno che risponde dal portale. Una risposta dello studio segna il
   thread come "letto per il cliente" di nuovo da leggere (vistaPortale=false, torna "Nuova" nel
   suo portale) e come letto per lo studio (vistaStudio=true, l'ha appena scritta lui); una
   risposta del cliente fa l'esatto opposto - riapre il thread come "da leggere" per lo studio. */
function aggiungiRispostaComunicazione(id, testo, autore, fileInfo) {
  const c = STATE.comunicazioni.find(x => x.id === id);
  if (!c) return null;
  const t = (testo || '').trim().slice(0, 4000);
  if (!t) return null;
  if (!Array.isArray(c.risposte)) c.risposte = [];
  // operatore (task #98): solo attribuzione/audit di CHI dello studio ha risposto - null se su
  // questo browser non è stato scelto un nome, o se a rispondere è il cliente (non pertinente).
  const risp = { id: uid('risp'), autore: autore === 'cliente' ? 'cliente' : 'studio', testo: t, data: oggiISO() };
  if (risp.autore === 'studio') risp.operatore = operatoreCorrente() || null;
  // fileInfo (task #108): un cliente che risponde a un thread — tipicamente perché lo studio gli
  // ha chiesto un documento — può allegare un file. Stessa idea degli allegati sulle comunicazioni:
  // qui arrivano già i metadati di un file già salvato per davvero da chi ha chiamato.
  if (fileInfo && fileInfo.percorso) {
    risp.filePercorso = fileInfo.percorso; risp.fileNome = fileInfo.nomeFile; risp.fileDimensione = fileInfo.dimensione;
  }
  c.risposte.push(risp);
  if (autore === 'cliente') { c.vistaStudio = false; }
  else { c.vistaStudio = true; c.vistaPortale = false; }
  salvaStato();
  return c;
}


/* -------------------- AREA CLIENTE INTERATTIVA (task #88) --------------------
   Fin qui (task #87) il portale esterno era di sola lettura: il cliente vedeva i propri dati ma
   non poteva scrivere nulla. Qui si apre la direzione opposta - un cliente che scrive un messaggio
   nuovo (una domanda generica, o legata a una scadenza specifica: "a che punto siamo con l'IVA di
   agosto?") o risponde a un thread esistente. Stessa cautela di sicurezza di tutto il resto del
   portale esterno: il chiamante (server.js, tramite il motore headless) passa SEMPRE un token, non
   un clienteId - è la funzione stessa a risolvere il cliente e a verificare che qualunque cosa
   referenziata (una scadenza, un thread) appartenga davvero a lui, non fidandosi di id passati da
   fuori. Il testo viene comunque troncato a una lunghezza ragionevole: qui non è un limite di
   sicurezza (non è codice eseguibile), solo per evitare che un campo libero cresca senza limiti. */
function aggiungiMessaggioPortaleClienteEsterno(token, testo, scadenzaIdRif, fileInfo) {
  if (!token || typeof token !== 'string') return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato || !accessoPortalePuoVedere(trovato.accesso, 'comunicazioni')) return null;
  // La creazione vera e propria (validazione testo, ricalcolo scadenzaRif dal motore di
  // derivazione - mai fidandosi di nome/data passati dall'esterno) è condivisa con l'anteprima
  // interna (messaggioClientePreview più sopra): vedi _creaMessaggioCliente. fileInfo (task #108)
  // arriva già scritto su disco da server.js - qui si limita ad essere attaccato al messaggio.
  return _creaMessaggioCliente(trovato.cliente, testo, scadenzaIdRif, fileInfo);
}

/* Risposta di un cliente esterno a un thread ESISTENTE (una comunicazione che lo studio gli ha
   mandato, o una sua stessa domanda precedente). Verifica che quel thread appartenga davvero al
   cliente del token e sia effettivamente visibile nel portale - altrimenti un cliente non potrebbe
   in nessun modo rispondere a/scoprire l'esistenza di comunicazioni di altri clienti anche
   indovinandone l'id. */
function aggiungiRispostaPortaleClienteEsterno(token, comunicazioneId, testo, fileInfo) {
  if (!token || !comunicazioneId) return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato || !accessoPortalePuoVedere(trovato.accesso, 'comunicazioni')) return null;
  const c = STATE.comunicazioni.find(x => x.id === comunicazioneId && x.clienteId === trovato.cliente.id && x.visibilePortale !== false);
  if (!c) return null;
  return aggiungiRispostaComunicazione(comunicazioneId, testo, 'cliente', fileInfo);
}

/* Il cliente apre una comunicazione nel portale: la si segna come letta (vistaPortale=true), così il
   tag "Nuova" sparisce e non ritorna al successivo aggiornamento (bug: il portale chiamava
   /api/portale-segna-letta ma il server non aveva nessun endpoint, quindi la lettura non veniva
   mai salvata). Stessa verifica di appartenenza delle risposte: solo thread del cliente del token. */
function segnaLettaComunicazionePortaleEsterno(token, comunicazioneId) {
  if (!token || !comunicazioneId) return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato || !accessoPortalePuoVedere(trovato.accesso, 'comunicazioni')) return null;
  const c = STATE.comunicazioni.find(x => x.id === comunicazioneId && x.clienteId === trovato.cliente.id && x.visibilePortale !== false);
  if (!c) return null;
  if (!c.vistaPortale) { c.vistaPortale = true; salvaStato(); }
  return c;
}

/* Terza scrittura possibile da un cliente esterno (richiesta Matteo, campagna 770): segnalare di
   aver pagato una fattura con ritenuta, dal pulsante "Ho pagato questa fattura" del portale. Stessa
   cautela delle altre due funzioni sopra: il token risolve SEMPRE il cliente, non ci si fida di un
   ritenutaId passato dall'esterno senza verificare che appartenga davvero a lui.
   Idempotente di proposito (se la riga risulta già pagata, ritorna comunque la riga senza errore):
   la coda di invio offline del portale (vedi svuotaCoda in portale-cliente.htm) può rimandare la
   stessa richiesta più di una volta se la prima risposta del server è andata persa in rete, e un
   doppio invio non deve mai sembrare un errore al cliente né toccare una data già confermata. */
function segnalaPagamentoRitenutaPortaleEsterno(token, ritenutaId, dataPagamento) {
  if (!token || !ritenutaId || !dataPagamento) return null;
  const trovato = trovaAccessoPortale(token);
  if (!trovato || !accessoPortalePuoVedere(trovato.accesso, 'scadenze')) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) return null;
  if (dataPagamento > oggiISO()) return null; // non si può segnalare un pagamento nel futuro
  const r = (STATE.ritenuteRighe || []).find(x => x.id === ritenutaId && x.clienteId === trovato.cliente.id);
  if (!r) return null;
  if (r.dataPagamento) return r; // già segnalata: vedi nota idempotenza sopra
  r.dataPagamento = dataPagamento;
  // Stesso stato assegnato dal flusso di inserimento manuale lato studio (vedi rit-nuova-riga): la
  // fattura è ora pagata dal cliente, ma la ritenuta non è ancora stata versata dallo studio.
  r.statoRit = 'Da pagare';
  // Richiesta di Matteo: "vorrei che quando il cliente ci comunica che ha pagato una fattura con
  // ritenuta che ci venga inviata una comunicazione [...] così ce ne accorgiamo e non perdiamo il
  // pagamento". La scadenza F24 è già completamente automatica (calcolaScadenzeRitenute/
  // generaScadenzeRitenute sopra la derivano live da r.dataPagamento appena impostato, nessuno step
  // di "creazione" separato esiste o serve) - quello che mancava davvero era un modo per accorgersi
  // che è successo. Si crea quindi una comunicazione in arrivo dal cliente, con la stessa identica
  // forma usata da _creaMessaggioCliente (direzione:'cliente', vistaStudio:false): questo la fa
  // comparire automaticamente nel badge "Da leggere" di Comunicazioni e nel pallino della sidebar
  // (comunicazioniDaLeggereConteggio, già esistenti) - nessuna nuova infrastruttura di notifica,
  // solo lo stesso meccanismo già usato per ogni altro messaggio del cliente. Si crea una sola volta
  // per segnalazione (questo ramo non viene mai rieseguito su un retry idempotente, vedi sopra), e
  // solo qui - non passa da _creaMessaggioCliente perché quella funzione è pensata per testo libero
  // del cliente (categoria "Domanda dal cliente"): qui serve invece un oggetto/corpo dedicati e un
  // riferimento diretto alla riga di ritenuta (ritenutaRif, campo nuovo e opzionale, additivo: chi
  // già legge le comunicazioni esistenti lo ignora senza rompersi).
  const importoFmt = (Number(r.importo) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dataPagamentoFmt = dataPagamento.split('-').reverse().join('/');
  const comunicazione = {
    id: uid('com'), clienteId: trovato.cliente.id, data: oggiISO(), direzione: 'cliente',
    categoria: 'Pagamento ritenuta segnalato',
    oggetto: 'Pagamento fattura con ritenuta: ' + (r.numeroFattura ? ('n. ' + r.numeroFattura) : r.percipiente),
    corpo: 'Il cliente ha segnalato di aver pagato in data ' + dataPagamentoFmt + ' la fattura' +
      (r.numeroFattura ? (' n. ' + r.numeroFattura) : '') + ' intestata a ' + r.percipiente +
      ' (importo € ' + importoFmt + '), con ritenuta d\'acconto. La ritenuta confluirà in automatico ' +
      'nella prossima scadenza F24 (Versamento ritenuta autonomi) non appena il cumulo mensile del ' +
      'cliente raggiunge la soglia, senza bisogno di altro intervento qui.',
    stato: 'Inviata', visibilePortale: false, vistaPortale: true, vistaStudio: false,
    scadenzaRif: null,
    ritenutaRif: { id: r.id, percipiente: r.percipiente, numeroFattura: r.numeroFattura || null, importo: Number(r.importo) || 0, dataFattura: r.dataFattura || null },
    risposte: [],
  };
  STATE.comunicazioni.push(comunicazione);
  salvaStato();
  return r;
}


/* ============================================================================================
   PORTALE AVANZATO (pacchetto per cliente): F24, ravvedimento, conferma di lettura.
   Ricostruito dopo l'incidente: la pagina del portale aveva già i pannelli, mancavano dati e azioni.
   Tutto passa da trovaAccessoPortale(token): si agisce solo sul cliente di quel token, e solo se ha il pacchetto.
   ============================================================================================ */
function portaleConPacchetto(token, sezione) {
  const t = trovaAccessoPortale(token);
  if (!t || !clienteHaPacchetto(t.cliente) || !accessoPortalePuoVedere(t.accesso, sezione || 'scadenze')) return null;
  return t;
}
function comunicazioneDalClientePortale(clienteId, categoria, oggetto, corpo, extra) {
  STATE.comunicazioni.push(Object.assign({
    id: uid('com'), clienteId, data: oggiISO(), direzione: 'cliente', categoria, oggetto, corpo,
    stato: 'Inviata', visibilePortale: false, vistaPortale: true, vistaStudio: false, scadenzaRif: null, risposte: [],
  }, extra || {}));
}
/* Interessi legali annui (%): D.M. MEF di ogni dicembre. 2026 = 1,6% (DM 10/12/2025). Da aggiornare ogni anno. */
const TASSI_LEGALI_ANNUI = { 2017: 0.1, 2018: 0.3, 2019: 0.8, 2020: 0.05, 2021: 0.01, 2022: 1.25, 2023: 5, 2024: 2.5, 2025: 2, 2026: 1.6 };
function tassoLegaleAnno(anno) { return TASSI_LEGALI_ANNUI[anno] != null ? TASSI_LEGALI_ANNUI[anno] : (anno > 2026 ? TASSI_LEGALI_ANNUI[2026] : 1); }
/* Ravvedimento di un omesso/tardivo versamento. Sanzione piena 25% (violazioni dal 1/9/2024, D.Lgs. 87/2024; prima 30%),
   dimezzata se il ritardo non supera 90 giorni. Fasce: entro 14 gg 1/10 di 1/15 della sanzione dimezzata per giorno; 15-30 gg 1/10;
   31-90 gg 1/9 (della sanzione dimezzata); poi 1/8 (entro 1 anno), 1/7 (entro 2 anni), 1/6 (oltre) della sanzione piena.
   Interessi al tasso legale di ogni anno solare, giorno per giorno. Indicativo: per il versamento vale il calcolo dello studio. */
function calcolaRavvedimento(importo, dataScadenza, dataVersamento) {
  const imp = Number(importo);
  if (!(imp > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dataScadenza || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dataVersamento || '')) return null;
  const g = giorniTra(dataScadenza, dataVersamento);
  if (!(g > 0)) return null;
  const nuova = dataScadenza >= '2024-09-01';
  const pieno = nuova ? 25 : 30, meta = pieno / 2;
  let pct, fasciaLabel;
  if (g <= 14) { pct = (meta / 15 / 10) * g; fasciaLabel = 'sprint (entro 14 giorni)'; }
  else if (g <= 30) { pct = meta / 10; fasciaLabel = 'breve (15-30 giorni)'; }
  else if (g <= 90) { pct = meta / 9; fasciaLabel = 'intermedio (31-90 giorni)'; }
  else if (g <= 365) { pct = pieno / 8; fasciaLabel = 'entro 1 anno'; }
  else if (g <= 730) { pct = pieno / 7; fasciaLabel = 'entro 2 anni'; }
  else { pct = pieno / 6; fasciaLabel = 'oltre 2 anni'; }
  let interessi = 0, cur = new Date(dataScadenza + 'T00:00:00'); cur.setDate(cur.getDate() + 1); const fine = new Date(dataVersamento + 'T00:00:00'); fine.setDate(fine.getDate() + 1); // dal giorno dopo la scadenza al giorno del versamento compreso
  while (cur < fine) {
    const anno = cur.getFullYear(), finAnno = new Date(anno + 1, 0, 1), tappa = finAnno < fine ? finAnno : fine;
    const giorni = Math.round((tappa - cur) / 86400000), giorniAnno = (anno % 4 === 0 && (anno % 100 !== 0 || anno % 400 === 0)) ? 366 : 365;
    interessi += imp * (tassoLegaleAnno(anno) / 100) * giorni / giorniAnno; cur = tappa;
  }
  const r2 = (n) => Math.round(n * 100) / 100, sanzione = r2(imp * pct / 100), inter = r2(interessi);
  return { importo: r2(imp), giorniRitardo: g, fasciaLabel, sanzione, interessi: inter, totale: r2(imp + sanzione + inter) };
}
function residuoF24(f) { return Math.max(0, righeF24(f).reduce((s, r) => s + Math.max(0, (Number(r.importo) || 0) - (Number(r.importoPagato) || 0)), 0)); }
function portaleSimulaRavvedimento(token, p) {
  const t = portaleConPacchetto(token); if (!t || !p) return null;
  if (p.f24Id) {
    const f = (STATE.f24 || []).find(x => x.id === p.f24Id && x.clienteId === t.cliente.id); if (!f) return null;
    return calcolaRavvedimento(residuoF24(f) || f.importo, f.data, p.dataVersamento);
  }
  return calcolaRavvedimento(p.importo, p.dataScadenza, p.dataVersamento);
}
function portaleScegliModalitaF24(token, f24Id, modalita) {
  const t = portaleConPacchetto(token); if (!t || !['autonomo', 'addebito'].includes(modalita)) return null;
  const f = (STATE.f24 || []).find(x => x.id === f24Id && x.clienteId === t.cliente.id); if (!f) return null;
  if (statoF24(f) === 'Pagato') return f;
  if (f.modalitaPagamento === modalita) return f;
  f.modalitaPagamento = modalita; f.modalitaScelta = oggiISO();
  comunicazioneDalClientePortale(t.cliente.id, 'Scelta pagamento F24', 'F24 ' + (f.descrizione || f.tipo) + ': ' + (modalita === 'addebito' ? 'addebito richiesto allo studio' : 'pagherà il cliente'),
    'Il cliente ha scelto per l\'F24 "' + (f.descrizione || f.tipo) + '" del ' + fmtData(f.data) + ' (residuo € ' + fmtNum2(residuoF24(f)) + '): ' + (modalita === 'addebito' ? 'Addebito a carico dello studio.' : 'paga da solo.'), { f24Rif: { id: f.id } });
  salvaStato();
  return f;
}
function portaleSegnalaPagamentoF24(token, f24Id, pagamenti) {
  const t = portaleConPacchetto(token); if (!t || !Array.isArray(pagamenti) || !pagamenti.length) return null;
  const f = (STATE.f24 || []).find(x => x.id === f24Id && x.clienteId === t.cliente.id); if (!f) return null;
  const righe = assicuraRigheF24(f); const fatti = [];
  pagamenti.forEach(p => {
    const r = righe.find(x => x.id === p.rigaId); const v = Number(p.importo);
    if (!r || !(v > 0)) return;
    const prima = Number(r.importoPagato) || 0, nuovo = Math.min(Number(r.importo) || 0, Math.round((prima + v) * 100) / 100);
    if (nuovo - prima > 0.004) { r.importoPagato = nuovo; fatti.push((r.descrizione || r.codiceTributo || 'voce') + ' € ' + fmtNum2(nuovo - prima)); }
  });
  if (!fatti.length) return null;
  ricalcolaTotaliF24(f);
  comunicazioneDalClientePortale(t.cliente.id, 'Pagamento F24 segnalato', 'Pagamento F24 segnalato: ' + (f.descrizione || f.tipo),
    'Il cliente segnala di aver pagato per l\'F24 "' + (f.descrizione || f.tipo) + '" del ' + fmtData(f.data) + ': ' + fatti.join('; ') + '. Stato ora: ' + statoF24(f) + '. Verifica sull\'estratto conto.', { f24Rif: { id: f.id } });
  salvaStato();
  return f;
}
function portaleConfermaLettura(token, comunicazioneId) {
  const t = trovaAccessoPortale(token); if (!t || !accessoPortalePuoVedere(t.accesso, 'comunicazioni')) return null;
  const c = (STATE.comunicazioni || []).find(x => x.id === comunicazioneId && x.clienteId === t.cliente.id && x.direzione !== 'cliente'); if (!c || !c.richiedeConferma) return null;
  if (!c.confermaLetturaData) { c.confermaLetturaData = new Date().toISOString(); c.vistaPortale = true; salvaStato(); }
  return c;
}

const PD_ICONE = {
  com: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  scad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2.5h8l5 5v13.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M14.5 2.5v5h5"/></svg>',
  and: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V10M10 19V5M16 19v-8M22 19H2"/></svg>',
  azienda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M15 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/><path d="M8 8h1M8 12h1M8 16h1M11 8h1M11 12h1M11 16h1"/></svg>',
};
/* Le 5 "schermate" dell'anteprima desktop: Panoramica è quella iniziale (recap azienda + numeri
   chiave + stato comunicazioni), le altre corrispondono 1:1 ai vecchi pannelli, ora navigabili
   una alla volta invece che tutte impilate in un'unica pagina lunga. */
const PD_SCHERMATE = [
  { v: 'panoramica', l: 'Panoramica' },
  { v: 'comunicazioni', l: 'Comunicazioni' },
  { v: 'scadenze', l: 'Scadenze' },
  { v: 'documenti', l: 'Documenti' },
  { v: 'andamento', l: 'Andamento' },
];
/* Vista "a schermo intero" del portale pensata per essere vista su un monitor da studio vero: una
   vera pagina desktop (hero con i numeri chiave, poi le sezioni affiancate in una griglia), pensata
   per essere accattivante e leggibile a colpo d'occhio invece che vuota. Usa datiPortaleCliente per
   i dati - quel che il cliente vede davvero, tramite il suo link reale, è lo stesso in sostanza. */
function contenutoDesktopPortale(cliente) {
  const { scadenzeClienteTutte, scadenzeCliente, annualiCliente, annualiIncompleti, comClienteTutte, comCliente, comClienteArchiviate, comClienteNonLette, docCliente, pctOnboarding, anniBilancioPortale } = datiPortaleCliente(cliente);
  const nomeStudio = STATE.meta.studioNome || 'Studio';
  const iniziali = cliente.ragioneSociale.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

  const stat = (n, l) => `<div class="pd-stat"><div class="n">${n}</div><div class="l">${escapeHtml(l)}</div></div>`;
  const stats = stat(scadenzeClienteTutte.length, scadenzeClienteTutte.length === 1 ? 'Scadenza aperta' : 'Scadenze aperte')
    + stat(comClienteNonLette, comClienteNonLette === 1 ? 'Comunicazione da leggere' : 'Comunicazioni da leggere')
    + stat(docCliente.length, docCliente.length === 1 ? 'Documento condiviso' : 'Documenti condivisi')
    + stat(pctOnboarding + '%', 'Percorso con noi completato');

  const panelHeader = (icona, sfondo, colore, titolo, conteggio) =>
    `<h2><span class="ic" style="background:${sfondo};color:${colore};">${icona}</span>${escapeHtml(titolo)}${conteggio != null ? `<span class="cnt">${conteggio}</span>` : ''}</h2>`;

  // ---- Navigazione fra le schermate ----
  // Badge non letti sul tab Comunicazioni della barra di navigazione dell'anteprima (task Matteo:
  // mancava un indicatore qui, come nel portale reale - vedi renderTabbar/.puntino in
  // portale-cliente.htm, stesso concetto).
  const nav = `<div class="pd-nav">${PD_SCHERMATE.map(s => `<div class="pd-nav-item ${PORTAL_DESKTOP_TAB === s.v ? 'active' : ''}" data-action="portal-desktop-tab" data-tab="${s.v}">${escapeHtml(s.l)}${s.v === 'comunicazioni' && comClienteNonLette ? ` <span class="nav-badge">${comClienteNonLette}</span>` : ''}</div>`).join('')}</div>`;

  // ---- Panoramica: recap azienda (con dati mascherabili), stato comunicazioni, numeri chiave ----
  const kv = (k, v, sensibile) => `<div class="pd-kv"><div class="k">${escapeHtml(k)}</div><div class="v">${sensibile ? valoreSensibilePortale(v) : (v ? escapeHtml(v) : '<span style="color:var(--text-mut);">—</span>')}</div></div>`;
  const contattiC = cliente.contatti || {};
  const sede = [contattiC.indirizzo, [contattiC.cap, contattiC.localita].filter(Boolean).join(' '), contattiC.provincia].filter(Boolean).join(', ');
  const panelAzienda = `<div class="pd-panel span2">${panelHeader(PD_ICONE.azienda, 'var(--blu-light)', 'var(--blu-mid)', 'Dati azienda')}
    <div class="pd-kv-grid">
      ${kv('Forma giuridica', labelTipoCliente(cliente.tipo), false)}
      ${kv('Regime fiscale', cliente.regimeFiscale, false)}
      ${kv('Settore', cliente.settore, false)}
      ${kv('Cliente dello studio dal', cliente.annoIngresso ? String(cliente.annoIngresso) : '', false)}
      ${kv('Partita IVA', cliente.partitaIva, true)}
      ${kv('Codice fiscale', cliente.codiceFiscale, true)}
      ${kv('Sede legale', sede, true)}
      ${kv('Email', contattiC.email, true)}
      ${kv('Telefono', contattiC.telefono, true)}
      ${kv('PEC', contattiC.pec, true)}
      ${kv('Referente in studio', cliente.responsabileStudio, false)}
    </div>
  </div>`;

  const inCorsoCount = comCliente.length - comClienteNonLette;
  const miniStats = `<div class="pd-mini-stats">
    <div class="pd-mini-stat aperte"><div class="n">${comClienteNonLette}</div><div class="l">Aperte</div></div>
    <div class="pd-mini-stat corso"><div class="n">${inCorsoCount}</div><div class="l">In corso</div></div>
    <div class="pd-mini-stat chiuse"><div class="n">${comClienteArchiviate.length}</div><div class="l">Chiuse</div></div>
  </div>`;
  const panelComBreakdown = `<div class="pd-panel">${panelHeader(PD_ICONE.com, 'var(--blu-light)', 'var(--blu-mid)', 'Comunicazioni', comClienteTutte.length)}${miniStats}</div>`;

  // ---- Simulatore ravvedimento (solo anteprima statica per lo studio: il calcolo vero e
  // interattivo vive nel portale reale, portale-cliente.htm > panelRavvedimento). Qui basta far
  // vedere che il pannello esiste e cosa mostra al cliente, con i suoi F24 in attesa reali. ----
  const f24NonPagatiCliente = (STATE.f24 || []).filter(f => f.clienteId === cliente.id && statoF24(f) !== 'Pagato');
  const corpoRavvedimento = f24NonPagatiCliente.length
    ? `<div class="pd-empty">Il cliente vede qui ${f24NonPagatiCliente.length} F24 in attesa a cui agganciare il calcolo (sanzione ridotta + interessi), oppure può inserire un importo libero con le sue date.</div>`
    : `<div class="pd-empty">Nessun F24 in attesa al momento: il cliente può comunque simulare un ravvedimento inserendo un importo libero.</div>`;
  const panelRavvedimento = `<div class="pd-panel">${panelHeader(PD_ICONE.scad, 'var(--giallo-bg)', 'var(--giallo)', 'Simulatore ravvedimento')}${corpoRavvedimento}</div>`;

  let corpoNumeri;
  if (anniBilancioPortale.length === 0) {
    corpoNumeri = `<div class="pd-empty">Percorso con noi completato al ${pctOnboarding}%${docCliente.length ? ' · ' + docCliente.length + (docCliente.length === 1 ? ' documento condiviso' : ' documenti condivisi') : ''}. Non appena carichiamo i dati di bilancio, qui trovi anche ricavi, utile e i principali indicatori.</div>`;
  } else {
    const ultimoAnnoP = anniBilancioPortale[anniBilancioPortale.length - 1];
    const dP = calcolaDerivatiBilancio(STATE.bilanci[cliente.id][ultimoAnnoP]);
    corpoNumeri = `<div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:0 0 4px;">${escapeHtml(etichettaEstesaBilancio(ultimoAnnoP))}</div>
      <div class="pd-item"><div class="t">Ricavi</div><div class="s">${fmtEuro(dP.ricavi)}</div></div>
      <div class="pd-item"><div class="t">Utile netto</div><div class="s">${fmtEuro(dP.utileNetto)}</div></div>
      <div class="pd-item"><div class="t">ROE</div><div class="s">${fmtPct(dP.roe)}</div></div>`;
  }
  const panelNumeri = `<div class="pd-panel">${panelHeader(PD_ICONE.and, 'var(--verde-bg)', 'var(--verde)', 'Numeri chiave')}${corpoNumeri}</div>`;

  // ---- Comunicazioni (schermata dedicata) ----
  const campoAllegatoPd = HTTP_SYNC_ATTIVO
    ? `<input type="file" id="previewComposeFilePd" style="margin-top:6px;font-size:12px;">`
    : `<div class="helptext" style="margin-top:6px;">Allegare un file richiede il server locale attivo.</div>`;
  const composeBoxPd = `<div class="pd-item" style="background:var(--blu-light);border-radius:10px;padding:14px;border-bottom:none;">
      <div class="t">${PORTAL_PREVIEW_PREFILL_SCAD ? 'Chiedi info su questa scadenza' : 'Scrivi allo studio'}</div>
      ${PORTAL_PREVIEW_PREFILL_SCAD ? `<div class="badge info" style="margin:4px 0;">Su: ${escapeHtml(PORTAL_PREVIEW_PREFILL_SCAD.nome)}</div>` : ''}
      <textarea id="previewComposePd" placeholder="Scrivi qui il messaggio del cliente..." style="width:100%;min-height:56px;margin-top:6px;border:1px solid var(--border);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:12.5px;resize:vertical;box-sizing:border-box;background:#fff;"></textarea>
      ${campoAllegatoPd}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="btn small primary" data-action="portal-preview-invia-messaggio" data-ctx="pd" data-cliente="${cliente.id}">Invia (come cliente)</button>
        ${PORTAL_PREVIEW_PREFILL_SCAD ? `<button class="btn small" data-action="portal-preview-annulla-prefill">Annulla riferimento</button>` : ''}
      </div>
    </div>`;
  const comItemPd = (c) => {
    const rispostaAperta = PORTAL_PREVIEW_RISPOSTA_APERTA === c.id;
    const risposteHtml = (c.risposte || []).length
      ? `<div style="margin-top:6px;padding-left:8px;border-left:2px solid var(--border);">${c.risposte.map(r => `<div style="padding:3px 0;font-size:11.5px;"><span style="font-weight:800;font-size:9.5px;text-transform:uppercase;color:${r.autore==='cliente'?'var(--blu-mid)':'var(--viola)'};">${r.autore==='cliente'?'Tu':'Studio'}:</span> ${escapeHtml(r.testo)}${r.filePercorso ? ` <a href="${linkScaricaFileReale(r.filePercorso)}" target="_blank">📎 ${escapeHtml(r.fileNome||'Allegato')}</a>` : ''}</div>`).join('')}</div>`
      : '';
    return `<div class="pd-item">
      <div class="t">${escapeHtml(c.oggetto)}${!c.vistaPortale ? ' <span class="badge" style="font-size:9px;background:var(--rosso-bg);color:var(--rosso);">Nuova</span>' : ''}</div>
      <div class="s">${fmtData(c.data)} · ${escapeHtml(categoriaComunicazione(c))}${c.corpo ? ' — ' + escapeHtml(c.corpo.length > 160 ? c.corpo.slice(0, 160) + '…' : c.corpo) : ''}</div>
      ${c.scadenzaRif ? `<div class="badge info" style="margin-top:4px;">Su: ${escapeHtml(c.scadenzaRif.nome)}</div>` : ''}
      ${c.filePercorso ? `<div class="s" style="margin-top:4px;"><a href="${linkScaricaFileReale(c.filePercorso)}" target="_blank">📎 ${escapeHtml(c.fileNome||'Allegato')}</a></div>` : ''}
      ${risposteHtml}
      <button class="btn small" style="margin-top:6px;" data-action="portal-preview-toggle-risposta" data-id="${c.id}">Rispondi</button>
      ${rispostaAperta ? `<div style="margin-top:6px;">
        <textarea id="previewRispostaPd_${c.id}" placeholder="Scrivi la risposta del cliente..." style="width:100%;min-height:46px;border:1px solid var(--border);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:12.5px;resize:vertical;box-sizing:border-box;"></textarea>
        ${HTTP_SYNC_ATTIVO ? `<input type="file" id="previewRispostaFilePd_${c.id}" style="margin-top:6px;font-size:12px;display:block;">` : ''}
        <button class="btn small primary" style="margin-top:6px;" data-action="portal-preview-invia-risposta" data-ctx="pd" data-cliente="${cliente.id}" data-id="${c.id}">Invia risposta</button>
      </div>` : ''}
    </div>`;
  };
  const comItems = comCliente.slice(0, 8).map(comItemPd).join('') || `<div class="pd-empty">Nessuna comunicazione ricevuta per ora.</div>`;
  const comArchiviateHtml = comClienteArchiviate.length ? `<details style="margin-top:8px;">
      <summary style="cursor:pointer;font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;">Archiviate (${comClienteArchiviate.length})</summary>
      <div style="margin-top:8px;">${comClienteArchiviate.map(c => `<div class="pd-item"><div class="t">${escapeHtml(c.oggetto)}</div><div class="s">${fmtData(c.data)} · ${escapeHtml(categoriaComunicazione(c))}</div></div>`).join('')}</div>
    </details>` : '';
  const panelCom = `<div class="pd-panel span2">${panelHeader(PD_ICONE.com, 'var(--blu-light)', 'var(--blu-mid)', 'Comunicazioni', comClienteTutte.length)}${composeBoxPd}${comItems}${comArchiviateHtml}</div>`;

  // ---- Scadenze e adempimenti (schermata dedicata) ----
  const scadItems = scadenzeCliente.map(s => {
    const d = deltaLabel(s.data);
    return `<div class="pd-item"><div class="t">${escapeHtml(s.nome)}</div><div class="s">Entro il ${fmtData(s.data)} · <span class="pill-delta ${d.cls}" style="font-size:10.5px;">${d.txt}</span></div>
      <button class="btn small" data-action="portal-preview-chiedi-info" data-ctx="pd" data-id="${s.id}" data-nome="${escapeHtml(s.nome)}" style="margin-top:6px;">Chiedi info su questa scadenza</button>
    </div>`;
  }).join('') || `<div class="pd-empty">Nessuna scadenza imminente.</div>`;
  const pctAnnuali = annualiCliente.length ? Math.round(((annualiCliente.length - annualiIncompleti) / annualiCliente.length) * 100) : 100;
  const panelScad = `<div class="pd-panel span2">${panelHeader(PD_ICONE.scad, 'var(--giallo-bg)', 'var(--giallo)', 'Scadenze e adempimenti', scadenzeClienteTutte.length)}
    ${scadItems}
    ${annualiCliente.length ? `<div class="pd-item" style="border-top:1px solid var(--border);margin-top:2px;padding-top:14px;">
      <div class="t">Adempimenti annuali</div>
      <div class="pd-progress-row"><div class="bar"><div style="width:${pctAnnuali}%;"></div></div><div class="pct">${annualiCliente.length - annualiIncompleti}/${annualiCliente.length}</div></div>
    </div>` : ''}
  </div>`;

  // ---- Documenti (schermata dedicata) ----
  const docItems = docCliente.slice(0, 12).map(d => `<div class="pd-item">
      <div class="t">${escapeHtml(d.nome)}</div>
      <div class="s">${escapeHtml(d.categoria)} · caricato il ${fmtData(d.dataCaricamento)}${d.dataScadenza ? ' · scade ' + fmtData(d.dataScadenza) : ''}${d.filePercorso ? ` · <a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank">apri</a>` : ''}</div>
    </div>`).join('') || `<div class="pd-empty">Nessun documento condiviso per ora.</div>`;
  const panelDoc = `<div class="pd-panel span2">${panelHeader(PD_ICONE.doc, 'var(--viola-bg)', 'var(--viola)', 'Documenti', docCliente.length)}${docItems}</div>`;

  // ---- Andamento (bilancio, se disponibile) ----
  let corpoAndamento;
  if (anniBilancioPortale.length === 0) {
    corpoAndamento = `<div class="pd-empty">Non appena carichiamo i dati del bilancio, qui trovi un riepilogo semplice dell'andamento — ricavi, utile e qualche indicatore chiave.</div>`;
  } else {
    const ultimoAnnoP = anniBilancioPortale[anniBilancioPortale.length - 1];
    const idxAndP = anniBilancioPortale.indexOf(ultimoAnnoP);
    const annoPrecP = idxAndP > 0 ? anniBilancioPortale[idxAndP - 1] : null;
    const dP = calcolaDerivatiBilancioConPrecedente(STATE.bilanci[cliente.id][ultimoAnnoP], annoPrecP ? STATE.bilanci[cliente.id][annoPrecP] : null);
    const puntiRicaviP = anniBilancioPortale.map(a => ({ label: etichettaBreveBilancio(a), valore: STATE.bilanci[cliente.id][a].ricavi || 0 }));
    const puntiEbitdaP = anniBilancioPortale.map(a => ({ label: etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).ebitda }));
    const puntiUtileP = anniBilancioPortale.map(a => ({ label: etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).utileNetto }));
    // Task #157 (Matteo: aggiungere anche una frase in linguaggio semplice, il cliente di solito
    // non è un contabile): stessa lettura semaforica degli indici di solidità usata lato studio, ma
    // tradotta in una frase discorsiva invece che in un rapporto numerico nudo e crudo.
    const fraseSolidita = [];
    if (dP.pfnEbitda !== null) {
      const semPfn = semaforoIndice(CATALOGO_INDICI_BILANCIO.find(i=>i.chiave==='pfnEbitda'), dP.pfnEbitda);
      const giudizioPfn = semPfn === 'verde' ? 'un livello di indebitamento solido' : (semPfn === 'giallo' ? 'un indebitamento da tenere sotto controllo' : 'un indebitamento piuttosto elevato rispetto ai margini');
      fraseSolidita.push(`il debito finanziario residuo equivale a circa ${fmtNum2(dP.pfnEbitda)} anni di EBITDA: ${giudizioPfn}`);
    }
    if (dP.dscr !== null) {
      const semDscr = semaforoIndice(CATALOGO_INDICI_BILANCIO.find(i=>i.chiave==='dscr'), dP.dscr);
      const giudizioDscr = semDscr === 'verde' ? 'ampio margine per pagare le rate' : (semDscr === 'giallo' ? 'una copertura risicata delle rate' : 'una copertura insufficiente delle rate, da affrontare per tempo');
      fraseSolidita.push(`la cassa generata dalla gestione copre ${fmtNum2(dP.dscr)} volte la rata annua dei finanziamenti: ${giudizioDscr}`);
    }
    const rigaFrase = fraseSolidita.length ? `<div class="helptext" style="margin:8px 0 14px;">${fraseSolidita.map(f=>f.charAt(0).toUpperCase()+f.slice(1)).join('. ')}.</div>` : '';
    corpoAndamento = `
      <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:0 0 10px;">${escapeHtml(etichettaEstesaBilancio(ultimoAnnoP))} · Ricavi ${fmtEuro(dP.ricavi)} · Utile netto ${fmtEuro(dP.utileNetto)} · ROE ${fmtPct(dP.roe)}</div>
      ${rigaFrase}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;">
        <div><div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:0 0 6px;">Andamento ricavi</div>${graficoBarreSvg(puntiRicaviP)}</div>
        <div><div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:0 0 6px;">Andamento EBITDA</div>${graficoBarreSvg(puntiEbitdaP)}</div>
        <div><div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;margin:0 0 6px;">Andamento utile netto</div>${graficoBarreSvg(puntiUtileP)}</div>
      </div>`;
  }
  const panelAndamento = `<div class="pd-panel span2">${panelHeader(PD_ICONE.and, 'var(--verde-bg)', 'var(--verde)', 'Andamento')}${corpoAndamento}</div>`;

  let corpo;
  // Task #184 (Matteo: "il simulatore di ravvedimento lo metterei nel tab scadenze del portale
  // clienti, nella panoramica non ha senso"): spostato qui da Panoramica, stesso cambiamento fatto
  // nel portale reale (portale-cliente.htm > renderScadenze/renderPanoramica) - questa è solo
  // l'anteprima statica che lo studio vede dentro Prisma, deve restare coerente con quella vera.
  if (PORTAL_DESKTOP_TAB === 'comunicazioni') corpo = panelCom;
  else if (PORTAL_DESKTOP_TAB === 'scadenze') corpo = panelScad + panelRavvedimento;
  else if (PORTAL_DESKTOP_TAB === 'documenti') corpo = panelDoc;
  else if (PORTAL_DESKTOP_TAB === 'andamento') corpo = panelAndamento;
  else corpo = panelAzienda + panelComBreakdown + panelNumeri;

  return `<div class="pd-hero">
    <div class="eyebrow">Il tuo spazio con ${escapeHtml(nomeStudio)}</div>
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex:none;">${escapeHtml(iniziali)}</div>
      <div>
        <h1>Ciao, ${escapeHtml(cliente.ragioneSociale)}</h1>
        <div class="sub">Qui trovi in un colpo d'occhio le comunicazioni, i documenti e le scadenze che ti riguardano — sempre aggiornato, senza dover scrivere per chiedere.</div>
      </div>
    </div>
    <div class="pd-stats">${stats}</div>
  </div>
  ${nav}
  <div class="pd-body">${corpo}</div>`;
}

/* Task #111: tabella "Accesso di tutti i clienti" in cima alla pagina, per
   attivare/copiare/rigenerare/disattivare il link di QUALSIASI cliente con un click, senza doverlo
   prima selezionare nel menu qui sotto. */
/* Base dei link da dare ai clienti. Bug segnalato da Matteo ("non c'è un modo per reperire il
   link"): i link usavano location.origin, cioè l'indirizzo con cui lo studio apre Prisma
   (http://localhost:8420), che fuori da questo PC non porta da nessuna parte. La base giusta è il
   dominio pubblico del tunnel ngrok (porta esterna 8421); se ngrok non è attivo si ripiega
   sull'IP di rete locale (valido solo in studio) e lo si dice chiaramente. */
let PORTALE_BASE_CACHE = null; // { url, tipo: 'ngrok' | 'rete' | 'locale' }
let PORTALE_BASE_CARICAMENTO = false;
let PORTALE_BASE_TS = 0;
function caricaBasePortale() {
  if (!HTTP_SYNC_ATTIVO || typeof fetch !== 'function' || PORTALE_BASE_CARICAMENTO || (Date.now() - PORTALE_BASE_TS) < 15000) return;
  PORTALE_BASE_CARICAMENTO = true;
  Promise.all([
    fetch('/api/accesso-esterno').then(r => r.json()).catch(() => null),
    fetch('/api/ngrok-tunnels').then(r => r.json()).catch(() => null),
    fetch('/api/indirizzi-rete').then(r => r.json()).catch(() => null),
  ]).then(([acc, tun, rete]) => {
    const porta = acc && acc.ok ? acc.porta : 8421;
    const t = tun && tun.ok ? (tun.tunnel || []).find(x => x.porta === porta && /^https:/.test(x.publicUrl || '')) : null;
    let nuova;
    if (t) nuova = { url: t.publicUrl.replace(/\/+$/, ''), tipo: 'ngrok' };
    else if (rete && rete.ok && (rete.indirizzi || []).length) {
      nuova = { url: 'http://' + rete.indirizzi[0] + ':' + porta, tipo: 'rete' };
    } else nuova = { url: location.origin, tipo: 'locale' };
    const cambiato = !PORTALE_BASE_CACHE || PORTALE_BASE_CACHE.url !== nuova.url;
    PORTALE_BASE_CACHE = nuova;
    PORTALE_BASE_TS = Date.now();
    if (cambiato && VIEW === 'portale') render();
  }).finally(() => { PORTALE_BASE_CARICAMENTO = false; });
}
function linkPortale(token) {
  return (PORTALE_BASE_CACHE ? PORTALE_BASE_CACHE.url : location.origin) + '/portale/' + token;
}
function avvisoBasePortale() {
  caricaBasePortale();
  const b = PORTALE_BASE_CACHE;
  if (!b || b.tipo === 'ngrok') return '';
  return `<div class="helptext" style="margin-bottom:14px;color:var(--warn,#b45309);">I link qui sotto usano ${b.tipo === 'rete' ? 'l\'indirizzo di rete locale: funzionano solo da PC collegati alla rete dello studio' : 'l\'indirizzo di questo PC: funzionano solo qui'}. Per link utilizzabili dai clienti da internet avvia ngrok (Impostazioni → Accesso esterno): i link si aggiorneranno da soli.</div>`;
}
function tabellaAccessoPortaleClienti(attivi) {
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="helptext" style="margin-bottom:14px;">Per attivare un link vero (raggiungibile da fuori dal gestionale) serve il server locale acceso — vedi Impostazioni → Server e sincronizzazione. Nel frattempo l'anteprima qui sotto funziona comunque.</div>`;
  }
  const righe = attivi.map(c => {
    const link = c.portaleToken ? linkPortale(c.portaleToken) : '';
    const azioni = c.portaleToken
      ? `<button class="btn small" data-action="portale-copia-link" data-link="${escapeHtml(link)}">Copia link</button>
         <button class="btn small" data-action="portale-rigenera-link" data-id="${c.id}" title="Genera un nuovo link: quello vecchio smette subito di funzionare">Rigenera</button>
         <button class="btn small danger" data-action="portale-disattiva-accesso" data-id="${c.id}">Disattiva</button>`
      : `<button class="btn small primary" data-action="portale-attiva-accesso" data-id="${c.id}">Attiva accesso</button>`;
    return `<tr>
      <td>${escapeHtml(c.ragioneSociale)}</td>
      <td>${c.portaleToken ? '<span class="badge stato-inviato-telematicamente">Attivo</span>' : '<span class="badge">Non attivo</span>'}</td>
      <td style="white-space:nowrap;">${c.portaleToken && c.portaleAttivatoIl ? fmtData(c.portaleAttivatoIl) : '—'}</td>
      <td style="white-space:nowrap;">${azioni}</td>
    </tr>`;
  }).join('');
  return `<div class="card" style="padding:0;overflow-x:auto;margin-bottom:16px;">
    <table class="compact"><thead><tr><th>Cliente</th><th>Accesso portale</th><th>Attivo dal</th><th>Gestisci</th></tr></thead>
    <tbody>${righe}</tbody></table>
  </div>`;
}

function renderPortaleCliente() {
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (attivi.length === 0) {
    return `<div class="card"><div class="empty"><div class="big">Nessun cliente attivo</div>Aggiungi un cliente per vedere l'anteprima del portale.</div></div>`;
  }
  if (!PORTAL_CLIENTE || !attivi.find(c=>c.id===PORTAL_CLIENTE)) PORTAL_CLIENTE = attivi[0].id;
  const cliente = clienteById(PORTAL_CLIENTE);

  const tabellaAccesso = avvisoBasePortale() + tabellaAccessoPortaleClienti(attivi);

  const banner = `<div class="portal-banner"><span class="tag-anteprima">Anteprima</span> Per dare a un cliente un accesso VERO (un link che apre solo i suoi dati, utilizzabile da computer o telefono) usa la tabella qui sopra, o scegli il cliente qui sotto per il suo link e — se vuoi vedere esattamente cosa vedrebbe lui — l'anteprima a schermo intero.</div>`;

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cliente</label><select data-action="portal-seleziona-cliente">
      ${attivi.map(c=>`<option value="${c.id}" ${c.id===PORTAL_CLIENTE?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field" style="align-self:flex-end;"><button class="btn small" data-action="portal-schermo-intero">Anteprima a schermo intero</button></div>
  </div>`;

  return tabellaAccesso + banner + toolbar + cardAccessoPortaleReale(cliente) + cardAccessiSecondariPortale(cliente);
}

/* Card "Accesso portale reale" (task #87): a differenza dell'anteprima sopra (che gira SEMPRE,
   anche senza server.js, perché legge STATE già in memoria nel browser dello studio), questa
   richiede il server locale attivo — è lui che, tramite il motore headless in server.js, serve
   /portale/<token> ai clienti esterni senza mai mandare loro l'intero archivio. Senza server.js
   acceso il link non porterebbe da nessuna parte, quindi qui lo diciamo chiaramente invece di
   mostrare un pulsante "Attiva" che genererebbe un link inutilizzabile. */
function cardAccessoPortaleReale(cliente) {
  if (!HTTP_SYNC_ATTIVO) {
    return `<div class="card" id="cardAccessoPortaleReale">
      <div class="section-title">Accesso portale reale</div>
      <div class="helptext">Per attivare un link vero per ${escapeHtml(cliente.ragioneSociale)} serve il server locale acceso (vedi Impostazioni → Server e sincronizzazione): è lui a servire il portale ai clienti esterni, senza mai esporgli i dati degli altri clienti. Con il gestionale aperto come semplice file, questa funzione resta disattivata.</div>
    </div>`;
  }
  const link = cliente.portaleToken ? linkPortale(cliente.portaleToken) : '';
  const stato = cliente.portaleToken
    ? `<div class="helptext" style="margin-bottom:12px;">Accesso attivo${cliente.portaleAttivatoIl ? ' dal ' + fmtData(cliente.portaleAttivatoIl) : ''}. ${escapeHtml(cliente.ragioneSociale)} può aprire questo link da computer o telefono e vede SOLO i propri dati (comunicazioni, scadenze, documenti, andamento) — in sola lettura per ora.</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" readonly value="${escapeHtml(link)}" style="flex:1;font-size:12.5px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-mut);" onclick="this.select()">
        <button class="btn small" data-action="portale-copia-link" data-link="${escapeHtml(link)}">Copia link</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="btn small" data-action="portale-rigenera-link" data-id="${cliente.id}" title="Genera un nuovo link: quello vecchio smette subito di funzionare">Rigenera link</button>
        <button class="btn small danger" data-action="portale-disattiva-accesso" data-id="${cliente.id}">Disattiva accesso</button>
      </div>
      <div class="helptext">La password di accesso si gestisce in Impostazioni → Accesso esterno → Area riservata clienti.</div>`
    : `<div class="helptext" style="margin-bottom:12px;">${escapeHtml(cliente.ragioneSociale)} non ha ancora un accesso al portale. Attivandolo genera un link personale (con un token di sicurezza, non indovinabile) da mandargli via email o chat: da lì vede solo i propri dati, mai quelli di altri clienti.</div>
      <button class="btn small" data-action="portale-attiva-accesso" data-id="${cliente.id}">Attiva accesso portale</button>`;
  const pacchetto = moduloAttivo('servizi') ? `<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;"><label class="checkline"><input type="checkbox" data-action="portale-pacchetto-toggle" data-id="${cliente.id}" ${cliente.pacchettoPortale ? 'checked' : ''}> <b>Portale avanzato</b> per questo cliente</label><div class="helptext">Ritenute, F24 (con ravvedimento), bilanci e KPI/Andamento. Richiede che lo studio li tenga aggiornati: attivalo solo per chi lo vuole.</div></div>` : '';
  return `<div class="card" id="cardAccessoPortaleReale">
    <div class="section-title">Accesso portale reale</div>
    ${stato}${pacchetto}
  </div>`;
}

/* Password del portale per SINGOLO cliente (task Matteo: "trova il modo per dare una password ad
   ogni cliente" — il link già contiene un token segreto non indovinabile, ma Matteo vuole una vera
   password che il cliente digiti). Stesso pattern-draft di ACCESSO_ESTERNO_DRAFT: un buffer locale
   per non perdere quanto digitato se un re-render "in background" arriva mentre si sta scrivendo.
   La password è salvata in chiaro sul cliente (stesso livello di riservatezza di altri dati
   anagrafici già in STATE, es. codice fiscale) — è un secondo fattore leggero ABBINATO al link
   segreto, non pensata per reggere da sola un attacco mirato. */
let PORTALE_PASSWORD_DRAFT = {}; // clienteId -> valore digitato, non ancora salvato

/* Accessi secondari al portale (richiesta Matteo: dare all'amministrazione un accesso limitato a
   sole comunicazioni/scadenze-F24/documenti, senza l'andamento economico riservato al legale
   rappresentante) — un link/password propri per ciascun accesso, in aggiunta al link principale
   sopra che resta ad accesso completo e non cambia comportamento. Stesso pattern-draft per la
   password (PORTALE_PASSWORD_DRAFT_SEC, chiave accessoId invece di clienteId). */
let PORTALE_PASSWORD_DRAFT_SEC = {}; // accessoId -> valore digitato, non ancora salvato
function cardAccessiSecondariPortale(cliente) {
  if (!HTTP_SYNC_ATTIVO) return '';
  const accessi = cliente.accessiSecondari || [];
  const righe = accessi.map(a => {
    const link = linkPortale(a.token);
    const valorePwd = Object.prototype.hasOwnProperty.call(PORTALE_PASSWORD_DRAFT_SEC, a.id) ? PORTALE_PASSWORD_DRAFT_SEC[a.id] : (a.password || '');
    const pwdAttiva = !!a.password;
    const sezioniHtml = SEZIONI_PORTALE_LIMITABILI.map(s => `<label class="checkline" style="white-space:nowrap;font-size:12px;">
        <input type="checkbox" data-action="accp-toggle-sezione" data-cliente="${cliente.id}" data-accesso="${a.id}" data-sezione="${s.id}" ${(a.tabConsentiti||[]).includes(s.id)?'checked':''}> ${escapeHtml(s.label)}
      </label>`).join('');
    return `<div class="cat-tipo ${a.attivo===false?'disattivo':''}" style="padding:10px 14px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <input type="text" value="${escapeHtml(a.nome)}" data-action="accp-rinomina" data-cliente="${cliente.id}" data-accesso="${a.id}" style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12.5px;">
        <span class="badge ${a.attivo===false?'':'stato-inviato-telematicamente'}">${a.attivo===false?'Disattivato':'Attivo'}</span>
        <button class="btn small" data-action="portale-copia-link" data-link="${escapeHtml(link)}">Copia link</button>
        <button class="btn small" data-action="accp-rigenera" data-cliente="${cliente.id}" data-accesso="${a.id}" title="Genera un nuovo link: quello vecchio smette subito di funzionare">Rigenera</button>
        <button class="btn small ${a.attivo===false?'':'ghost'}" data-action="accp-toggle-attivo" data-cliente="${cliente.id}" data-accesso="${a.id}">${a.attivo===false?'Riattiva':'Disattiva'}</button>
        <button class="btn small danger" data-action="accp-elimina" data-cliente="${cliente.id}" data-accesso="${a.id}">Elimina</button>
      </div>
      <div class="helptext" style="margin-bottom:6px;">Sezioni visibili con questo accesso:</div>
      <div style="display:flex;gap:4px 14px;flex-wrap:wrap;margin-bottom:8px;">${sezioniHtml}</div>
      <div style="display:flex;gap:8px;max-width:420px;flex-wrap:wrap;">
        <input type="text" value="${escapeHtml(valorePwd)}" placeholder="Password (facoltativa)" data-action="accp-password-campo" data-cliente="${cliente.id}" data-accesso="${a.id}" style="flex:1;min-width:160px;font-size:12.5px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;">
        <button class="btn small" data-action="accp-password-salva" data-cliente="${cliente.id}" data-accesso="${a.id}">Salva password</button>
        ${pwdAttiva ? `<button class="btn small ghost" data-action="accp-password-rimuovi" data-cliente="${cliente.id}" data-accesso="${a.id}">Rimuovi</button>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="section-title">Accessi aggiuntivi al portale</div>
    <div class="helptext" style="margin-bottom:10px;">Per dare a qualcun altro (es. l'amministrazione della società) un link diverso da quello sopra, limitato solo ad alcune sezioni — il link principale resta comunque ad accesso completo.</div>
    ${righe || '<div class="helptext" style="margin-bottom:10px;">Nessun accesso aggiuntivo per questo cliente.</div>'}
    <button class="btn small primary" data-action="accp-nuovo" data-cliente="${cliente.id}">+ Nuovo accesso limitato</button>
  </div>`;
}

/* Anteprima a schermo intero: mostra SOLO il telefono (nessun elemento del gestionale intorno),
   così Matteo vede esattamente cosa vedrebbe il cliente — utile anche per uno screenshot pulito
   da mandare al cliente o al team. Usa lo stesso mount (#modalRoot) dei modali, quindi Escape e
   il click sul fondo scuro lo chiudono già gratis (vedi chiudiModal/onClickDelegato). */
/* Se il server locale è acceso, l'anteprima mostra il portale VERO del cliente (la stessa pagina
   portale-cliente.htm che vede lui, in un riquadro): così non può mai restare indietro rispetto
   al portale reale. Se il cliente non ha ancora un accesso, lo si attiva (come "Attiva accesso").
   Senza server (gestionale aperto come file) resta la vecchia anteprima interna. */
function urlPortaleRealePerAnteprima(cliente) {
  if (!HTTP_SYNC_ATTIVO || !cliente) return '';
  if (!cliente.portaleToken) { cliente = attivaPortaleCliente(cliente.id) || cliente; }
  return cliente.portaleToken ? location.origin + '/portale/' + cliente.portaleToken : '';
}
function corpoAnteprimaPortale(cliente) {
  const url = urlPortaleRealePerAnteprima(cliente);
  if (!url) return contenutoDesktopPortale(cliente);
  return `<iframe src="${escapeHtml(url)}" title="Portale cliente" style="width:100%;height:calc(100vh - 70px);border:0;background:#fff;border-radius:12px;"></iframe>`;
}
function apriAnteprimaPortaleSchermoIntero() {
  if (!PORTAL_CLIENTE) return;
  const reale = !!urlPortaleRealePerAnteprima(clienteById(PORTAL_CLIENTE));
  const toggleSens = reale ? '' : `<button class="pd-toggle-sens ${PORTAL_NASCONDI_SENSIBILI ? 'on' : ''}" data-action="toggle-sensibili-portale" title="Maschera P.IVA, codice fiscale, sede e contatti — utile se mostri questa schermata ad altri">
    <span class="dot"></span>${PORTAL_NASCONDI_SENSIBILI ? 'Dati sensibili nascosti' : 'Nascondi dati sensibili'}
  </button>`;
  document.getElementById('modalRoot').innerHTML = `<div class="portal-fullscreen-backdrop desktop" data-action="chiudi-modal-backdrop">
    <div class="portal-fullscreen-bar desktop">
      <div class="lbl">Anteprima portale — ${reale ? 'il portale reale, come lo vede il cliente' : 'cosa vedrebbe il cliente su desktop'}</div>
      <div class="bar-right">${toggleSens}<button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    </div>
    <div id="portalFullscreenPhone">${corpoAnteprimaPortale(clienteById(PORTAL_CLIENTE))}</div>
  </div>`;
}
/* Richiamata dopo un cambio di cliente/tab: se l'anteprima a schermo intero è aperta, la
   riallinea sul posto invece di lasciarla ferma alla vecchia selezione. */
function aggiornaAnteprimaPortaleSchermoIntero() {
  const mount = document.getElementById('portalFullscreenPhone');
  if (mount && PORTAL_CLIENTE) mount.innerHTML = corpoAnteprimaPortale(clienteById(PORTAL_CLIENTE));
}

/* -------------------- RENDER: CALENDARIO -------------------- */
let CAL_MESE = new Date().getMonth();

/* Colore per categoria di adempimento (le stesse 7 di TIPI_ADEMPIMENTO) più una categoria dedicata
   ai task team con scadenza (task #131): così il calendario non è più tutto blu, e i task interni
   sono visivamente distinti dagli adempimenti fiscali. "colore" qui serve solo per il puntino
   nella legenda/nel modal (dove serve un valore esadecimale diretto, non una classe). */
const CATEGORIA_TASK_TEAM_CAL = 'Task team';
const CATEGORIA_APPUNTAMENTO_CAL = 'Appuntamenti';
const COLORE_CATEGORIA_CALENDARIO = {
  'Imposte dirette':                { classe: 'cat-imposte-dirette',   colore: '#B3261E' },
  'Imposte indirette':              { classe: 'cat-imposte-indirette', colore: '#2E63C7' },
  'Adempimenti contabili':          { classe: 'cat-contabili',         colore: '#5b2d90' },
  'Adempimenti previdenziali':      { classe: 'cat-previdenziali',     colore: '#1B7A43' },
  'Adempimenti del lavoro':         { classe: 'cat-lavoro',            colore: '#9C6500' },
  'Adempimenti camerali/societari': { classe: 'cat-camerali',          colore: '#0E7C86' },
  'Altri tributi':                  { classe: 'cat-altri',             colore: '#C2540A' },
  [CATEGORIA_TASK_TEAM_CAL]:        { classe: 'cat-task-team',         colore: '#565E6D' },
  [CATEGORIA_APPUNTAMENTO_CAL]:     { classe: 'cat-appuntamento',      colore: '#B3268E' },
};
function infoCategoriaCalendario(categoria) {
  return COLORE_CATEGORIA_CALENDARIO[categoria] || COLORE_CATEGORIA_CALENDARIO['Altri tributi'];
}
/* Un evento è "chiuso" con vocabolari di stato diversi a seconda della provenienza: scadenze
   periodiche/annuali usano STATI_SCADENZA_CHIUSI, i task team solo "Fatto". */
function eventoCalendarioChiuso(kind, stato) {
  if (kind === 'task') return stato === 'Fatto';
  if (kind === 'appuntamento') return stato === 'Concluso' || stato === 'Annullato';
  return STATI_SCADENZA_CHIUSI.includes(stato);
}
/* Etichetta del "titolare" dell'evento: nome cliente, oppure un'etichetta esplicita per i task
   team/appuntamenti senza cliente collegato (non "(cliente eliminato)", che ha senso solo se
   l'id punta davvero a un cliente rimosso). */
function etichettaClienteEvento(kind, clienteId) {
  if (clienteId) return nomeCliente(clienteId);
  if (kind === 'task') return 'Task interno (studio)';
  if (kind === 'appuntamento') return 'Nessun cliente collegato';
  return '(cliente eliminato)';
}

/* Costruisce la mappa data ISO -> EVENTI GREZZI del mese: scadenze periodiche, adempimenti
   annuali, E i task team con una scadenza impostata (task #131 - prima non comparivano affatto in
   calendario). Ogni evento porta kind/categoria/titolo SEPARATI dal nome cliente (a differenza
   della versione precedente, che li concatenava in "label"): serve per poterli raggruppare per
   tipo (vedi raggruppaEventiGiorno) prima di renderizzarli. Usata sia dalla griglia mensile sia dal
   modal "espandi giorno", così le due viste non possono mai mostrare dati diversi per lo stesso
   giorno. */
function eventiCalendarioPerGiorno() {
  const { tutteScadenze, annuali } = derivati();
  const eventiPerGiorno = {};
  const aggiungiEvento = (dataISO, evento) => {
    if (!dataISO) return;
    if (!eventiPerGiorno[dataISO]) eventiPerGiorno[dataISO] = [];
    eventiPerGiorno[dataISO].push(evento);
  };
  tutteScadenze.forEach(s => aggiungiEvento(s.data, {
    kind: 'scadenza', id: s.id, clienteId: s.clienteId, titolo: s.nome, stato: s.stato,
    categoria: tipoCategoriaScadenzaPeriodica(s.tipo),
  }));
  annuali.forEach(a => { if (a.scadenza) aggiungiEvento(a.scadenza, {
    kind: 'annuale', clienteId: a.clienteId, titolo: a.tipoNome, stato: a.completato?'Inviato telematicamente':'Da fare',
    categoria: a.tipo || TIPO_ADEMPIMENTO_DEFAULT,
  }); });
  (STATE.taskTeam || []).forEach(t => { if (t.scadenza) aggiungiEvento(t.scadenza, {
    kind: 'task', id: t.id, clienteId: t.clienteId || null, titolo: t.titolo, stato: t.stato || 'Da fare',
    categoria: CATEGORIA_TASK_TEAM_CAL, assegnatoA: t.assegnatoA,
  }); });
  (STATE.appuntamenti || []).forEach(a => { if (a.data) aggiungiEvento(a.data, {
    kind: 'appuntamento', id: a.id, clienteId: a.clienteId || null, titolo: a.oggetto || 'Appuntamento',
    stato: a.stato || 'Programmato', categoria: CATEGORIA_APPUNTAMENTO_CAL, ora: a.ora,
  }); });
  return eventiPerGiorno;
}

/* Raggruppa gli eventi di UN giorno per (kind + categoria + titolo): con 100+ clienti in studio
   "IVA mensile" ricorre identica per decine di anagrafiche nello stesso giorno - senza
   raggruppamento sia la cella del calendario sia il modal "espandi giorno" diventerebbero una
   lista illeggibile di righe quasi identiche ("Cliente A — IVA mensile", "Cliente B — IVA
   mensile"...). Un gruppo con un solo evento si comporta esattamente come prima (nessuna novità
   per il caso comune, che resta la maggioranza); un gruppo con più eventi diventa una riga sola
   col conteggio, espandibile nel modal giorno. L'ordine segue quello della legenda (le 7 categorie
   fiscali, poi Task team), poi il titolo: prevedibile e coerente con le altre viste. */
function raggruppaEventiGiorno(eventi) {
  const ordineCategoria = TIPI_ADEMPIMENTO.concat([CATEGORIA_TASK_TEAM_CAL, CATEGORIA_APPUNTAMENTO_CAL]);
  const gruppi = new Map();
  eventi.forEach(e => {
    const chiave = `${e.kind}::${e.categoria}::${e.titolo}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, { kind: e.kind, categoria: e.categoria, titolo: e.titolo, items: [] });
    gruppi.get(chiave).items.push(e);
  });
  return Array.from(gruppi.values()).sort((a, b) => {
    const ia = ordineCategoria.indexOf(a.categoria), ib = ordineCategoria.indexOf(b.categoria);
    if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.titolo.localeCompare(b.titolo);
  });
}

/* Bug segnalato da Matteo: "ne ho una sull'utenza matteo e non se ne va via e non capisco a cosa
   sia collegata" - il pallino di notifica sul Calendario (appuntamentiNonVistiConteggio) esisteva
   già, ma a differenza di Task team (che ha un banner "novità" con l'elenco cliccabile, vedi
   renderTaskTeam) qui non c'era NESSUN modo di scoprire QUALE appuntamento generasse il pallino:
   bisognava sfogliare i mesi a caso sperando di incontrare quello prenotato dalla segreteria mai
   aperto. Stesso pattern del banner di Task team, con "Segna tutti come visti" come valvola di
   sfogo per un caso limite (es. un vecchio nome consulente non più in uso). */
function renderCalendario() {
  const anno = STATE.annoCorrente;
  const eventiPerGiorno = eventiCalendarioPerGiorno();
  const nonVistiApp = appuntamentiNonVistiPerConsulente();
  // Task #186: come per Task team, il banner unisce le notifiche "vive" (creato/riassegnato/
  // modificato, ancora attaccate all'appuntamento) con quelle di eliminazione (STATE.
  // notificheEliminazioni, l'appuntamento non esiste più quindi non c'è nulla da "aprire" - solo
  // da confermare con "Ok").
  const appEliminati = notificheEliminazioniPerOperatore('appuntamento');
  const bannerApp = (nonVistiApp.length || appEliminati.length) ? `<div class="card" style="border-left:4px solid var(--rosso,#d33);background:var(--rosso-bg,#fdeceb);margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;">🔔 ${nonVistiApp.length + appEliminati.length} novità sui tuoi appuntamenti</div>
      <button class="btn small" data-action="app-segna-tutti-visti">Segna tutti come visti</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${nonVistiApp.map(a => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:4px 0;" data-action="apri-dettaglio-appuntamento" data-id="${a.id}">
        <span style="font-size:13px;">${escapeHtml(fmtData(a.data))}${a.ora?' · '+escapeHtml(a.ora):''} — ${escapeHtml(a.oggetto||'Appuntamento')}${a.clienteId?' · '+escapeHtml(nomeCliente(a.clienteId)):''}${(a.notificaCreatoDa) ? ` <span class="helptext" style="display:inline;">— ${etichettaNotificaAppuntamento(a)}${a.notificaTipo!=='riassegnato'?' da '+escapeHtml(a.notificaCreatoDa):''}</span>` : ''}</span>
        <span class="badge">Apri →</span>
      </div>`).join('')}
      ${appEliminati.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;">
        <span style="font-size:13px;">🗑️ ${escapeHtml(n.titolo)}${n.dettaglio ? ' · ' + escapeHtml(n.dettaglio) : ''} <span class="helptext" style="display:inline;">— eliminato da ${escapeHtml(n.eliminatoDa || '—')}</span></span>
        <button class="btn small" data-action="elimina-notifica-eliminazione" data-id="${n.id}">Ok</button>
      </div>`).join('')}
    </div>
  </div>` : '';

  const primoDelMese = new Date(anno, CAL_MESE, 1);
  const ultimoDelMese = new Date(anno, CAL_MESE + 1, 0);
  let offsetInizio = primoDelMese.getDay(); // 0=domenica
  offsetInizio = offsetInizio === 0 ? 6 : offsetInizio - 1; // lun=0
  const nGiorniMese = ultimoDelMese.getDate();
  const oggi = oggiISO();

  const celle = [];
  for (let i = 0; i < offsetInizio; i++) celle.push(null);
  for (let g = 1; g <= nGiorniMese; g++) celle.push(g);
  while (celle.length % 7 !== 0) celle.push(null);

  const nav = `<div class="toolbar" style="align-items:center;justify-content:space-between;flex-wrap:wrap;">
    <div class="toolbar" style="align-items:center;">
      <button class="btn" data-action="cal-prev">← Mese prec.</button>
      <div style="font-weight:700;font-size:15px;min-width:160px;text-align:center;">${MESI_COMPLETI[CAL_MESE]} ${anno}</div>
      <button class="btn" data-action="cal-next">Mese succ. →</button>
      <button class="btn ghost" data-action="cal-oggi">Vai a oggi</button>
    </div>
    ${(STATE.meta.consulenti || []).length ? `<button class="btn primary" data-action="prenota-appuntamento">📞 Prenota un appuntamento</button>` : ''}
  </div>`;

  const legenda = `<div class="cal-legenda">${TIPI_ADEMPIMENTO.concat([CATEGORIA_TASK_TEAM_CAL, CATEGORIA_APPUNTAMENTO_CAL]).map(t => {
    const info = infoCategoriaCalendario(t);
    return `<div class="voce"><span class="dot" style="background:${info.colore};"></span>${escapeHtml(t)}</div>`;
  }).join('')}</div>`;

  const testate = GIORNI_IT.map(g => `<div class="cal-head">${g}</div>`).join('');
  const giorni = celle.map(g => {
    if (g === null) return `<div class="cal-day altromese"></div>`;
    const dataISO = toISO(anno, CAL_MESE + 1, g);
    const eventi = eventiPerGiorno[dataISO] || [];
    const gruppi = raggruppaEventiGiorno(eventi);
    const isOggi = dataISO === oggi;
    const evHtml = gruppi.slice(0, 4).map(gr => {
      const chiusi = gr.items.filter(it => eventoCalendarioChiuso(gr.kind, it.stato)).length;
      const tutteChiuse = chiusi === gr.items.length;
      const scaduto = !tutteChiuse && gr.items.some(it => !eventoCalendarioChiuso(gr.kind, it.stato) && giorniTra(oggi, dataISO) < 0);
      const info = infoCategoriaCalendario(gr.categoria);
      const cls = [info.classe, tutteChiuse ? 'completato' : '', scaduto ? 'scaduto' : ''].filter(Boolean).join(' ');
      const nomiClienti = gr.items.map(it => etichettaClienteEvento(it.kind, it.clienteId));
      const etichettaCorta = gr.items.length > 1 ? `${gr.titolo} · ${gr.items.length} clienti` : `${nomiClienti[0]} — ${gr.titolo}`;
      const tooltip = gr.items.length > 1 ? `${gr.categoria} — ${gr.titolo} (${gr.items.length}): ${nomiClienti.join(', ')}` : `${gr.categoria} — ${etichettaCorta}`;
      return `<div class="ev ${cls}" title="${escapeHtml(tooltip)}">${tutteChiuse?'✓ ':''}${escapeHtml(etichettaCorta)}</div>`;
    }).join('');
    const extra = gruppi.length > 4 ? `<div class="cal-piu">+${gruppi.length-4} altre</div>` : '';
    const hasEventi = eventi.length > 0;
    /* Task #141: prima solo i giorni con eventi erano cliccabili. Ora ogni giorno è cliccabile —
       un giorno pieno apre l'espansione (con un pulsante "+ Nuovo evento" al suo interno), un
       giorno vuoto apre direttamente il modale di creazione evento. */
    const azione = hasEventi
      ? `data-action="cal-espandi-giorno" data-data="${dataISO}"`
      : `data-action="cal-nuovo-evento" data-data="${dataISO}"`;
    return `<div class="cal-day ${isOggi?'oggi':''} ${hasEventi?'has-eventi':''}" ${azione}><div class="num">${g}</div>${evHtml}${extra}</div>`;
  }).join('');

  return bannerApp + nav + legenda + `<div class="card"><div class="cal-grid">${testate}${giorni}</div></div>`;
}

/* Pulsante di dettaglio nel modal giorno: scadenze periodiche aprono il dettaglio della scadenza
   stessa (Stato/Nota/Importo/storico solleciti — vedi modalDettaglioScadenza), i task team aprono
   il modale del task (stesso pattern del Task team), gli adempimenti annuali (niente modello
   dettaglio proprio) restano sulla scheda cliente, dove già si gestiscono. */
function pulsanteEventoCalendario(it) {
  if (it.kind === 'scadenza' && it.id) return `<button class="btn small" data-action="apri-dettaglio-scadenza" data-id="${it.id}">Apri scadenza</button>`;
  if (it.kind === 'task') return `<button class="btn small" data-action="apri-dettaglio-task-team" data-id="${it.id}">Apri task</button>`;
  if (it.kind === 'appuntamento') return `<button class="btn small" data-action="apri-dettaglio-appuntamento" data-id="${it.id}">Apri appuntamento</button>`;
  return `<button class="btn small" data-action="apri-cliente" data-id="${it.clienteId}">Apri cliente</button>`;
}
/* Una riga evento nel modal giorno: "compatto" (gruppo con un solo evento) mostra "Cliente —
   Titolo" com'era prima del raggruppamento; le righe espanse di un gruppo multiplo mostrano solo
   il nome del cliente/titolare (il titolo è già nell'intestazione del gruppo) più, per i task,
   l'assegnatario. */
function rigaEventoCalendario(it, gr, dataISO, oggi, compatto) {
  const chiuso = eventoCalendarioChiuso(it.kind, it.stato);
  const scaduto = !chiuso && giorniTra(oggi, dataISO) < 0;
  const titolo = compatto
    ? `${escapeHtml(etichettaClienteEvento(it.kind, it.clienteId))} — ${escapeHtml(gr.titolo)}`
    : escapeHtml(etichettaClienteEvento(it.kind, it.clienteId));
  const sottotitoloParti = [];
  if (compatto) sottotitoloParti.push(escapeHtml(gr.categoria));
  if (it.kind === 'task' && it.assegnatoA) sottotitoloParti.push(`assegnato a ${escapeHtml(it.assegnatoA)}`);
  if (scaduto) sottotitoloParti.push(`<span style="color:var(--rosso);font-weight:700;">${it.kind === 'task' ? 'scaduto' : 'scaduta'}</span>`);
  return `<div class="voce ${chiuso?'completato':''}" style="${compatto?'':'padding-left:26px;'}">
    ${compatto ? `<span class="dot" style="background:${infoCategoriaCalendario(gr.categoria).colore};"></span>` : ''}
    <div style="flex:1;min-width:0;">
      <div class="titolo" style="font-weight:600;">${titolo}</div>
      ${sottotitoloParti.length ? `<div class="helptext">${sottotitoloParti.join(' · ')}</div>` : ''}
    </div>
    <span class="badge ${statoBadgeClass(it.stato)}">${escapeHtml(it.stato)}</span>
    ${pulsanteEventoCalendario(it)}
  </div>`;
}

/* Espansione dei gruppi multipli nel modal giorno: chiave "dataISO::indiceGruppo" (l'ordine dei
   gruppi è deterministico a parità di STATE/giorno, quindi l'indice torna sempre a puntare allo
   stesso gruppo quando si riapre lo stesso giorno) — persiste per tutta la sessione, non solo
   mentre il modal è aperto, comodo se lo si riapre più volte sullo stesso giorno affollato. */
let CAL_GRUPPI_ESPANSI = new Set();

/* Modal "espandi giorno": lista completa (non troncata a 4, e ora RAGGRUPPATA per tipo — task
   #131) degli eventi di una data. Un gruppo con un solo evento è una riga singola cliccabile come
   prima; un gruppo con più eventi (tipicamente una scadenza periodica ricorrente su tanti clienti)
   è un'intestazione con conteggio "N/M completate", espandibile per vedere/agire sui singoli
   clienti. */
/* Una riga della scaletta oraria (vedi apriModalGiornoCalendario sotto): orario ben visibile a
   sinistra (intervallo inizio-fine, calcolato dalla durata dell'appuntamento), poi cliente/oggetto,
   stato e il pulsante di apertura - stesso "pulsanteEventoCalendario" usato altrove, per coerenza. */
function rigaScalettaOraria(it, dataISO, oggi) {
  const a = trovaAppuntamento(it.id);
  const fine = a ? oraFineAppuntamento(a) : null;
  const chiuso = eventoCalendarioChiuso('appuntamento', it.stato);
  const scaduto = !chiuso && giorniTra(oggi, dataISO) < 0;
  return `<div class="voce ${chiuso?'completato':''}" style="gap:10px;">
    <div style="min-width:76px;flex:none;font-weight:700;font-size:12.5px;color:var(--blu-scuro);">${it.ora ? escapeHtml(it.ora) + (fine ? '–' + escapeHtml(fine) : '') : '— : —'}</div>
    <div style="flex:1;min-width:0;">
      <div class="titolo" style="font-weight:600;">${escapeHtml(etichettaClienteEvento('appuntamento', it.clienteId))} — ${escapeHtml(it.titolo)}</div>
      ${scaduto ? `<div class="helptext"><span style="color:var(--rosso);font-weight:700;">scaduto</span></div>` : ''}
    </div>
    <span class="badge ${statoBadgeClass(it.stato)}">${escapeHtml(it.stato)}</span>
    ${pulsanteEventoCalendario(it)}
  </div>`;
}
/* Segnalato da Matteo: "non c'è indicata una scaletta oraria e sono tutti mescolati" - gli
   appuntamenti (gli unici eventi di calendario con un orario proprio) finivano raggruppati per
   categoria insieme a scadenze/adempimenti/task, quindi comparivano in ordine alfabetico di
   categoria invece che in ordine cronologico, senza che l'orario risaltasse. Separati qui in una
   scaletta dedicata in cima al modale, ordinata per ora crescente e con l'intervallo inizio-fine di
   ciascuno (vedi durataAppuntamento/oraFineAppuntamento); il resto (eventi senza un orario proprio)
   resta sotto, raggruppato come prima - nessuna modifica al comportamento per quella parte. */
/* Task #172 (Matteo: "aprendo un giorno in calendario gli orari degli impegni sono solo scritti,
   vorrei fosse più simile a google dove c'è la griglia con gli orari e il riquadro
   dell'appuntamento si estende sugli orari che ricopre"): la "scaletta oraria" (task #167) era già
   in ordine cronologico ma restava un elenco testuale - qui diventa una griglia a una colonna, lo
   stesso identico meccanismo (asse ore + blocchi proporzionati) della settimana di "Prenota un
   appuntamento" sopra, con i blocchi cliccabili per aprire il dettaglio dell'appuntamento. Gli
   appuntamenti senza un orario valido (rari: dati molto vecchi) non si possono posizionare in una
   griglia oraria e restano elencati sotto, invariato. */
function scalettaOrariaGrigliaHtml(conOra, dataISO) {
  if (!conOra.length) return '';
  const range = rangeOrarioGriglia(conOra.map(it => trovaAppuntamento(it.id)).filter(Boolean));
  const altezza = altezzaGrigliaPx(range);
  const blocchi = conOra.map(it => {
    const a = trovaAppuntamento(it.id);
    if (!a) return '';
    const pos = posizioneBloccoGriglia(a, range);
    if (!pos) return '';
    const chiuso = eventoCalendarioChiuso('appuntamento', it.stato);
    return `<div class="cal-grid-blocco cliccabile ${chiuso ? 'annullato' : ''}" style="top:${pos.top}px;height:${pos.altezza}px;" data-action="apri-dettaglio-appuntamento" data-id="${it.id}" title="${escapeHtml(it.ora)}–${escapeHtml(oraFineAppuntamento(a) || '?')} ${escapeHtml(etichettaClienteEvento('appuntamento', it.clienteId))} — ${escapeHtml(it.titolo)}">
      <span class="ora">${escapeHtml(it.ora)}–${escapeHtml(oraFineAppuntamento(a) || '?')}</span>${escapeHtml(etichettaClienteEvento('appuntamento', it.clienteId))} — ${escapeHtml(it.titolo)}
    </div>`;
  }).join('');
  return `<div class="cal-grid-wrap" style="margin-top:4px;">
    <div class="cal-grid-ore" style="height:${altezza}px;position:relative;">${tacchePerOreGrigliaHtml(range)}</div>
    <div class="cal-grid-colonne"><div class="cal-grid-colonna-wrap"><div class="cal-grid-colonna" style="height:${altezza}px;--cal-grid-ora-px:${CAL_GRID_PX_PER_ORA}px;">${blocchi}</div></div></div>
  </div>`;
}
function apriModalGiornoCalendario(dataISO) {
  const eventiPerGiorno = eventiCalendarioPerGiorno();
  const eventi = eventiPerGiorno[dataISO] || [];
  if (eventi.length === 0) return;
  const oggi = oggiISO();

  const appuntamentiGiorno = eventi.filter(e => e.kind === 'appuntamento');
  const altriEventi = eventi.filter(e => e.kind !== 'appuntamento');
  const conOra = appuntamentiGiorno.filter(e => e.ora).sort((a, b) => a.ora.localeCompare(b.ora));
  const senzaOra = appuntamentiGiorno.filter(e => !e.ora);
  const scalettaHtml = appuntamentiGiorno.length ? `
    <div style="margin-top:10px;">
      <div class="section-title" style="margin:0 0 4px 0;font-size:12px;">🕐 Scaletta oraria — ${appuntamentiGiorno.length} appuntament${appuntamentiGiorno.length===1?'o':'i'}</div>
      ${scalettaOrariaGrigliaHtml(conOra, dataISO)}
      ${senzaOra.length ? `<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">${senzaOra.map(it => rigaScalettaOraria(it, dataISO, oggi)).join('')}</div>` : ''}
    </div>` : '';

  const gruppi = raggruppaEventiGiorno(altriEventi);
  const righe = gruppi.map((gr, idx) => {
    const items = gr.items.slice().sort((a,b) => etichettaClienteEvento(a.kind, a.clienteId).localeCompare(etichettaClienteEvento(b.kind, b.clienteId)));
    if (items.length === 1) return rigaEventoCalendario(items[0], gr, dataISO, oggi, true);
    const chiave = `${dataISO}::${idx}`;
    const chiusi = items.filter(it => eventoCalendarioChiuso(gr.kind, it.stato)).length;
    const espanso = CAL_GRUPPI_ESPANSI.has(chiave);
    const info = infoCategoriaCalendario(gr.categoria);
    return `<div class="cal-gruppo">
      <div class="voce" style="cursor:pointer;" data-action="cal-toggle-gruppo" data-chiave="${chiave}">
        <span class="dot" style="background:${info.colore};"></span>
        <div style="flex:1;min-width:0;">
          <div class="titolo" style="font-weight:600;">${escapeHtml(gr.titolo)}</div>
          <div class="helptext">${escapeHtml(gr.categoria)} · ${items.length} eventi</div>
        </div>
        <span class="badge ${chiusi===items.length?'stato-inviato-telematicamente':'info'}">${chiusi}/${items.length} completate</span>
        <span style="padding:0 4px;">${espanso?'▾':'▸'}</span>
      </div>
      ${espanso ? items.map(it => rigaEventoCalendario(it, gr, dataISO, oggi, false)).join('') : ''}
    </div>`;
  }).join('');
  const altriHtml = gruppi.length ? `${appuntamentiGiorno.length ? `<div class="section-title" style="margin:14px 0 4px 0;font-size:12px;">Altri impegni della giornata</div>` : ''}${righe}` : '';
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>${escapeHtml(fmtData(dataISO))}</h2><div class="modal-sub">${eventi.length} ${eventi.length===1?'evento':'eventi'} in questa data${gruppi.length!==altriEventi.length?` · ${gruppi.length} ${gruppi.length===1?'voce':'voci'} in elenco`:''}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="toolbar" style="margin:8px 0 0 0;">
        <button type="button" class="btn small" data-action="cal-nuovo-evento" data-data="${dataISO}">+ Nuovo evento</button>
      </div>
      ${scalettaHtml}
      <div class="cal-giorno-lista" style="max-height:420px;overflow-y:auto;margin-top:6px;">${altriHtml}</div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* -------------------- CALENDARIO: creazione eventi (task #141) --------------------
   Cliccare su un giorno (vuoto o pieno) apre una scelta tra due tipi di evento:
   - "Appuntamento con cliente": evento puntuale, salvato in STATE.appuntamenti.
   - "Scadenza ricorrente": crea un nuovo tipo nel catalogo scadenze periodiche (stesso
     motore/flags già usato dall'app) con un prospetto guidato (nome, tipo, frequenza,
     giorno, clienti a cui si applica) al posto del vecchio prompt() di
     aggiungiTipoPeriodicoCustom, e attiva subito il flag sui clienti scelti invece di
     richiedere un secondo passaggio manuale in anagrafica. */
const STATI_APPUNTAMENTO = ['Programmato', 'Concluso', 'Annullato'];
/* Motivi dell'appuntamento (task #147, "Prenota un appuntamento"): prima lista proposta da Prisma,
   da affinare con l'uso — collegati (dove pertinente) al campo motiviAppuntamento delle Procedure
   interne (vedi procedureInterneDefault), così la procedura giusta viene suggerita al consulente in
   base al motivo scelto dalla segreteria al telefono. */
const MOTIVI_APPUNTAMENTO = [
  'Apertura nuova attività',
  'Consulenza per attività esistente',
  'Dichiarazione dei redditi',
  'Problema con una scadenza o una sanzione',
  'Richiesta di preventivo',
  'Cambio commercialista (subentro)',
  'Consulenza societaria (costituzione, modifica, cessione quote)',
  'Altro',
];
// Task #159 ("prenota un appuntamento", richiesta Matteo): canale attraverso cui chi chiama ha
// trovato lo studio, stesso pattern a elenco fisso di MOTIVI_APPUNTAMENTO.
const CANALI_PROVENIENZA_APPUNTAMENTO = [
  'Passaparola',
  'Internet / Google',
  'Social media',
  'Cliente già esistente',
  'Collega / altro professionista',
  'Altro',
];
// Task #160: decisione del CONSULENTE (non della segreteria) su un eventuale software di
// fatturazione da proporre — per questo vive in apriModalAppuntamento, non nel form di prenotazione.
const OPZIONI_SOFTWARE_FATTURAZIONE = ['Da valutare', 'Sì, necessario', 'Probabile, da approfondire', 'No'];
const TIPI_RICHIESTA_APPUNTAMENTO = ['Nuova attività', 'Consulenza per attività esistente'];

/* Richiesta di Matteo: gli appuntamenti avevano solo un orario di INIZIO, mai una durata - quindi
   non c'era modo di sapere quando finivano né, di conseguenza, di accorgersi che due appuntamenti
   si sovrapponevano. DURATA_APPUNTAMENTO_DEFAULT (60') è il valore storico implicito: ogni
   appuntamento creato PRIMA di questa modifica non ha durataMinuti salvato, quindi ovunque lo si
   legge si usa "a.durataMinuti || DURATA_APPUNTAMENTO_DEFAULT" (mai un valore diverso da quello che
   l'app assumeva finora, così i controlli di conflitto restano corretti anche sui dati vecchi). */
const DURATA_APPUNTAMENTO_DEFAULT = 60;
// DURATE_APPUNTAMENTO (elenco a scelta fissa 15min/30min/...) è stato rimosso con il task #171:
// Matteo ha chiesto ora inizio + ora fine al posto di un elenco di durate, vedi durataDaOrari più
// sotto - DURATA_APPUNTAMENTO_DEFAULT resta solo come valore implicito per gli appuntamenti vecchi
// senza durataMinuti salvato.
function oraAMinuti(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function minutiAOra(min) {
  const m = ((min % 1440) + 1440) % 1440; // avvolge oltre la mezzanotte invece di andare negativo/oltre 24h
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function durataAppuntamento(a) { return Number(a && a.durataMinuti) || DURATA_APPUNTAMENTO_DEFAULT; }
function oraFineAppuntamento(a) {
  const inizio = oraAMinuti(a && a.ora);
  if (inizio === null) return null;
  return minutiAOra(inizio + durataAppuntamento(a));
}
/* Richiesta di Matteo: "creando gli eventi se clicco sull'ora non posso cambiarla, si cambia solo
   cliccando sull'orologio [...] devo anche poter scrivere con la tastiera" - gli <input type="time">
   nativi lasciano la digitazione al widget del browser, che in pratica risultava modificabile solo
   aprendo il mini-popup dell'orologio. Sostituiti ovunque da un campo di testo semplice (digitazione
   SEMPRE affidabile, nessuna dipendenza da un widget nativo) che si autoformatta mentre si scrive -
   vedi formattaInputOrario, richiamato dal delegato 'input' - e viene validato in formato HH:MM
   prima di essere usato (orarioValido). campoOrarioHtml genera il markup comune a tutti i punti
   dell'app che chiedono un orario (nuovo appuntamento, modifica appuntamento, prenota appuntamento).
   Di norma l'azione è solo di formattazione (il valore si legge dal campo al salvataggio, come
   prima con type="time"); dove serve salvare ad ogni modifica (modale di un appuntamento già
   esistente, che si auto-salva campo per campo) si passa un'azione dedicata, gestita sia
   nell'autoformattazione (onInputDelegato) sia nel salvataggio vero e proprio (onChangeDelegato). */
function campoOrarioHtml(id, valore, opts) {
  opts = opts || {};
  const azione = opts.azione || 'orario-autoformat';
  const extra = opts.extra || '';
  // Digitazione da tastiera (campo di testo) + icona orologio che apre il selettore nativo (Matteo:
  // "lasciamo l'icona dell'orologio nelle caselle di ora inizio e ora fine, così cliccando
  // sull'orologio si apre la finestra per selezionare l'orario"). Il selettore è un <input type=time>
  // nascosto: quando si sceglie, il valore passa nel campo di testo e si lancia 'change' su di esso, così
  // le azioni esistenti (anche l'auto-salvataggio dei modali già aperti) funzionano identiche.
  return `<span class="orario-wrap"><input type="text" inputmode="numeric" class="campo-orario" id="${id}" value="${escapeHtml(valore || '')}" placeholder="--:--" maxlength="5" autocomplete="off" data-action="${azione}" ${extra}>`
    + `<button type="button" class="btn-orologio" data-action="orario-apri-picker" data-target="${id}" title="Scegli l'orario" aria-label="Scegli l'orario"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg></button>`
    + `<input type="time" class="orario-picker-nascosto" tabindex="-1" aria-hidden="true" data-action="orario-picker-scelto" data-target="${id}"></span>`;
}
function formattaInputOrario(el) {
  let v = el.value.replace(/[^0-9]/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
  el.value = v;
}
function orarioValido(str) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(str || '').trim());
}
/* Richiesta di Matteo: "per gli eventi non mettere la durata tipo 1 ora due ore ecc ma metti ora
   inizio e ora fine, è più pratico" - il dato salvato resta durataMinuti (durataAppuntamento,
   oraFineAppuntamento, il controllo conflitti: tutto invariato), calcolato qui da due orari invece
   che scelto da un elenco di intervalli fissi. null se uno dei due orari non è valido o se la fine
   non è successiva all'inizio (niente appuntamenti a durata zero o negativa - si assume sempre
   stesso giorno, non si gestisce un appuntamento che "sfora" la mezzanotte). */
function durataDaOrari(inizio, fine) {
  if (!orarioValido(inizio) || !orarioValido(fine)) return null;
  const d = oraAMinuti(fine) - oraAMinuti(inizio);
  return d > 0 ? d : null;
}

/* -------------------- Task #172: griglia oraria stile Google Calendar --------------------
   Richiesta di Matteo: "vorrei fosse più simile a google dove c'è la griglia con gli orari e il
   riquadro dell'appuntamento si estende sugli orari che ricopre" - sostituisce sia l'elenco
   testuale nelle caselle della settimana di "Prenota un appuntamento" sia la "scaletta oraria" a
   righe del modal giorno del calendario. CAL_GRID_PX_PER_ORA è l'altezza in pixel di un'ora: da
   questa si ricavano sia le tacche dell'asse ore sia la posizione/altezza di ogni blocco
   appuntamento, in proporzione diretta all'orario che occupa (lo stesso identico numero usato sia
   per calcolare il blocco sia per disegnare le righe orizzontali di sfondo via CSS, altrimenti
   andrebbero fuori sincrono). */
const CAL_GRID_PX_PER_ORA = 48;
// Fascia oraria coperta dalla griglia: 8-19 di default (l'orario di studio più comune), allargata
// automaticamente se un appuntamento esce da quella fascia - non si vuole mai tagliare un impegno
// fuori dal bordo della griglia, né mostrare una griglia vuota enorme quando non serve.
function rangeOrarioGriglia(appuntamenti) {
  let minOra = 8 * 60, maxOra = 19 * 60;
  appuntamenti.forEach(a => {
    const inizio = oraAMinuti(a.ora);
    if (inizio === null) return;
    const fine = inizio + durataAppuntamento(a);
    if (inizio < minOra) minOra = Math.max(0, Math.floor(inizio / 60) * 60);
    if (fine > maxOra) maxOra = Math.min(24 * 60, Math.ceil(fine / 60) * 60);
  });
  return { minOra, maxOra };
}
function altezzaGrigliaPx(range) { return ((range.maxOra - range.minOra) / 60) * CAL_GRID_PX_PER_ORA; }
// Top/altezza in px del blocco di un appuntamento dentro la griglia - null se l'appuntamento non
// ha un orario valido (chi chiama filtra già per .ora prima di arrivare qui, ma meglio restare
// difensivi). Un'altezza minima di 16px evita blocchi illeggibili per appuntamenti brevissimi.
function posizioneBloccoGriglia(a, range) {
  const inizio = oraAMinuti(a.ora);
  if (inizio === null) return null;
  const fine = inizio + durataAppuntamento(a);
  const top = ((Math.max(inizio, range.minOra) - range.minOra) / 60) * CAL_GRID_PX_PER_ORA;
  const altezza = Math.max(((Math.min(fine, range.maxOra) - Math.max(inizio, range.minOra)) / 60) * CAL_GRID_PX_PER_ORA, 16);
  return { top, altezza };
}
function tacchePerOreGrigliaHtml(range) {
  let html = '';
  for (let m = range.minOra; m < range.maxOra; m += 60) {
    const top = ((m - range.minOra) / 60) * CAL_GRID_PX_PER_ORA;
    html += `<div class="cal-grid-ora-tacca" style="top:${top}px;">${minutiAOra(m)}</div>`;
  }
  return html;
}
/* Conflitto = due appuntamenti dello STESSO consulente, nello STESSO giorno, i cui intervalli
   [inizio, fine) si sovrappongono (il classico test "inizio1 < fine2 && inizio2 < fine1"). Ignora
   gli appuntamenti Annullati (non occupano davvero l'agenda) e, in modifica, esclude se stesso via
   escludiId. Appuntamenti senza un orario valido non possono essere confrontati (nessun conflitto
   rilevabile) - meglio non bloccare che dare un falso allarme. */
function appuntamentiInConflitto(consulente, dataISO, ora, durataMinuti, escludiId) {
  if (!consulente || !dataISO) return [];
  const inizio = oraAMinuti(ora);
  if (inizio === null) return [];
  const fine = inizio + (Number(durataMinuti) || DURATA_APPUNTAMENTO_DEFAULT);
  return appuntamentiDiConsulente(consulente).filter(a => {
    if (a.id === escludiId) return false;
    if (a.data !== dataISO) return false;
    const altroInizio = oraAMinuti(a.ora);
    if (altroInizio === null) return false;
    const altroFine = altroInizio + durataAppuntamento(a);
    return inizio < altroFine && altroInizio < fine;
  });
}
/* Messaggio da mostrare in confermaAzione() quando si sta per salvare un appuntamento in conflitto
   - elenca gli appuntamenti già presenti a quell'ora, così chi conferma sa esattamente cosa rischia
   di sovrapporre invece di un generico "c'è un conflitto". */
function messaggioConflittoAppuntamenti(conflitti) {
  const righe = conflitti.map(a => `• ${a.ora}–${oraFineAppuntamento(a) || '?'} ${a.oggetto || 'Appuntamento'}${a.clienteId ? ' (' + etichettaClienteEvento('appuntamento', a.clienteId) + ')' : ''}`);
  return `Attenzione: in questa fascia oraria risultano già ${conflitti.length === 1 ? 'un impegno' : 'impegni'}:\n\n${righe.join('\n')}\n\nVuoi prenotare comunque?`;
}

function trovaAppuntamento(id) {
  return (STATE.appuntamenti || []).find(a => a.id === id);
}
function aggiungiAppuntamento(dati) {
  const prenotatoDaSegreteria = !!dati.prenotatoDaSegreteria;
  const a = {
    id: uid('app'), clienteId: dati.clienteId || null, data: dati.data, ora: dati.ora || '',
    durataMinuti: Number(dati.durataMinuti) || DURATA_APPUNTAMENTO_DEFAULT,
    oggetto: (dati.oggetto || '').trim() || 'Appuntamento', note: (dati.note || '').trim(),
    responsabile: operatoreCorrente() || '', stato: 'Programmato', creatoIl: new Date().toISOString(),
    /* Campi task #147 (flusso "Prenota un appuntamento" della segreteria): "consulente" è il
       responsabile per cui è prenotato l'appuntamento (distinto da "responsabile" sopra, che resta
       chi lo ha materialmente creato — la segreteria, in questo caso). notificaVista segue lo stesso
       pattern di taskTeam.notificaVista: false solo per gli appuntamenti prenotati dalla segreteria,
       così il pallino di notifica non compare per gli appuntamenti che un consulente si crea da sé. */
    consulente: dati.consulente || null,
    prenotatoDaSegreteria,
    tipoRichiesta: dati.tipoRichiesta || null,
    telefono: (dati.telefono || '').trim(),
    motivo: dati.motivo || null,
    motivoAltro: (dati.motivoAltro || '').trim(),
    notificaVista: !prenotatoDaSegreteria,
    notificaCreatoDa: prenotatoDaSegreteria ? (operatoreCorrente() || null) : null,
    notificaTipo: prenotatoDaSegreteria ? 'creato' : null,
  };
  STATE.appuntamenti = STATE.appuntamenti || [];
  STATE.appuntamenti.push(a);
  salvaStato();
  return a;
}
// Task #186 (Matteo: notifiche anche su modifica/eliminazione di appuntamenti collegati, stesso
// principio già applicato a Task team con #138/#186): riassegnare il consulente o cambiare un
// campo sostanziale (data/ora/oggetto/stato) riapre la notifica per il consulente destinatario,
// a meno che non sia lui stesso a modificarsi l'appuntamento.
function aggiornaAppuntamento(id, patch) {
  const a = trovaAppuntamento(id);
  if (!a) return;
  const attore = operatoreCorrente() || null;
  const cambiaConsulente = 'consulente' in patch && patch.consulente !== a.consulente;
  if (cambiaConsulente) {
    a.notificaCreatoDa = attore;
    a.notificaTipo = 'riassegnato';
    a.notificaVista = !patch.consulente || patch.consulente === attore;
  } else {
    const campiRilevanti = ['data', 'ora', 'oggetto', 'stato'];
    const cambiaQualcosaDiRilevante = campiRilevanti.some(k => k in patch && patch[k] !== a[k]);
    if (cambiaQualcosaDiRilevante && a.consulente && attore && a.consulente !== attore) {
      a.notificaCreatoDa = attore;
      a.notificaTipo = 'modificato';
      a.notificaVista = false;
    }
  }
  Object.assign(a, patch);
  if (!STATI_APPUNTAMENTO.includes(a.stato)) a.stato = STATI_APPUNTAMENTO[0];
  salvaStato();
}
function rimuoviAppuntamento(id) {
  const a = trovaAppuntamento(id);
  if (a && a.consulente) {
    const quando = [a.data, a.ora].filter(Boolean).join(' ');
    notificaEliminazione('appuntamento', a.consulente, a.oggetto || 'Appuntamento', quando);
  }
  STATE.appuntamenti = (STATE.appuntamenti || []).filter(a => a.id !== id);
  salvaStato();
}
// Etichetta breve per il tipo di notifica di un appuntamento (creato/riassegnato/modificato) -
// stesso schema di etichettaNotificaTaskTeam.
function etichettaNotificaAppuntamento(a) {
  return { creato: 'creato', riassegnato: 'riassegnato a te', modificato: 'modificato' }[a.notificaTipo] || 'creato';
}
/* Notifica "nuovo appuntamento prenotato dalla segreteria" per il consulente destinatario — stesso
   pattern di taskTeamNonVistiPerOperatore/segnaTaskTeamVisto (task #119). */
function appuntamentiNonVistiPerConsulente() {
  const io = operatoreCorrente();
  if (!io) return [];
  return (STATE.appuntamenti || []).filter(a => a.consulente === io && a.notificaVista === false);
}
function appuntamentiNonVistiConteggio() { return appuntamentiNonVistiPerConsulente().length + notificheEliminazioniPerOperatore('appuntamento').length; }
function segnaAppuntamentoVisto(id) {
  const a = trovaAppuntamento(id);
  if (a && a.notificaVista === false) {
    a.notificaVista = true;
    salvaStato();
    renderNav();
  }
}
/* Procedura interna suggerita per un appuntamento, in base al motivo scelto dalla segreteria (task
   #147: "l'ideale sarebbe poter trovare un modo per collegare l'appuntamento a delle procedure").
   Usata SOLO come suggerimento di default quando l'appuntamento non ha ancora un collegamento
   manuale (vedi proceduraCollegataAppuntamento sotto) - task #185 (Matteo: "non è che chi vuole
   aprire partita iva segua sempre la stessa procedura, ci sono mille procedure diverse [...]
   lasciamolo come un campo libero nella gestione dell'evento-appuntamento"): l'abbinamento
   automatico per motivo non è più l'unica fonte di verità, solo un punto di partenza comodo.
   Nessun suggerimento per gli appuntamenti creati direttamente dal consulente (motivo assente). */
const PROC_NESSUNA = '__nessuna__'; // marcatore: "nessuna procedura" scelto a mano (vince sul suggerimento automatico)
function proceduraSuggeritaPerAppuntamento(a) {
  if (!a || !a.motivo) return null;
  return (STATE.procedureInterne || []).find(p => p.attivo && (p.motiviAppuntamento || []).includes(a.motivo)) || null;
}
/* Procedura EFFETTIVAMENTE collegata a un appuntamento (task #185): se è stata scelta a mano
   (a.procedureId, impostabile dal campo libero in apriModalAppuntamento - di solito DOPO aver preso
   l'appuntamento, quando si sa meglio a quale procedura corrisponde) quella vince sempre; altrimenti
   si ripiega sul suggerimento automatico per motivo, per compatibilità con gli appuntamenti già
   prenotati prima di questo task e per chi non ha ancora toccato il campo. */
function proceduraCollegataAppuntamento(a) {
  if (!a) return null;
  if (a.procedureId === PROC_NESSUNA) return null; // scelta esplicita: attività mai trattata, nessuna procedura
  if (a.procedureId) return procedureById(a.procedureId) || null;
  return proceduraSuggeritaPerAppuntamento(a);
}

/* Modale "Nuovo evento": due pulsanti per scegliere il tipo, poi un form dedicato sotto. Lo stato
   del form vive negli input del DOM (nessuna variabile duplicata) — i pulsanti "Crea" leggono i
   campi visibili al momento del click, come negli altri modali di creazione dell'app. Solo il TIPO
   scelto (appuntamento/scadenza) è tenuto in una variabile di modulo, perché serve a scegliere
   quale form disegnare. */
let NUOVO_EVENTO_TIPO = 'appuntamento';
let CAL_NUOVO_EVENTO_DATA = null;
function apriModalNuovoEvento(dataISO) {
  NUOVO_EVENTO_TIPO = 'appuntamento';
  CAL_NUOVO_EVENTO_DATA = dataISO;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Nuovo evento</h2><div class="modal-sub">${escapeHtml(fmtData(dataISO))}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="toolbar" style="margin:10px 0;">
        <button type="button" class="btn small primary" id="nevBtnApp" data-action="nuovo-evento-tipo" data-tipo="appuntamento">Appuntamento con cliente</button>
        <button type="button" class="btn small ghost" id="nevBtnScad" data-action="nuovo-evento-tipo" data-tipo="scadenza">Scadenza ricorrente</button>
      </div>
      <div id="nuovoEventoForm"></div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  renderFormNuovoEvento(dataISO);
}
function renderFormNuovoEvento(dataISO) {
  const el = document.getElementById('nuovoEventoForm');
  if (!el) return;
  const btnApp = document.getElementById('nevBtnApp'), btnScad = document.getElementById('nevBtnScad');
  if (btnApp) btnApp.className = 'btn small ' + (NUOVO_EVENTO_TIPO === 'appuntamento' ? 'primary' : 'ghost');
  if (btnScad) btnScad.className = 'btn small ' + (NUOVO_EVENTO_TIPO === 'scadenza' ? 'primary' : 'ghost');
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b) => a.ragioneSociale.localeCompare(b.ragioneSociale));

  if (NUOVO_EVENTO_TIPO === 'appuntamento') {
    el.innerHTML = `
      <div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Cliente (opzionale)</label>
          <select id="nevCliente"><option value="">— nessun cliente —</option>${attivi.map(c=>`<option value="${c.id}">${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Ora inizio</label>${campoOrarioHtml('nevOraInizio', '')}</div>
        <div class="field"><label>Ora fine</label>${campoOrarioHtml('nevOraFine', '')}</div>
        <div class="field full" style="grid-column:1/-1;"><label>Oggetto</label><input type="text" id="nevOggetto" placeholder="es. Incontro bilancio, consulenza IVA..."></div>
        <div class="field full" style="grid-column:1/-1;"><label>Note</label><input type="text" id="nevNote" placeholder="facoltative"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="nuovo-evento-salva-appuntamento" data-data="${dataISO}">Crea appuntamento</button>
      </div>`;
  } else {
    const dataObj = dataISO ? new Date(dataISO + 'T00:00:00') : new Date();
    el.innerHTML = `
      <div class="grid2">
        <div class="field full" style="grid-column:1/-1;"><label>Nome scadenza</label><input type="text" id="nevScadNome" placeholder='es. &quot;Comunicazione dati liquidazioni periodiche&quot;'></div>
        <div class="field"><label>Tipo/categoria</label><select id="nevScadTipo">${TIPI_ADEMPIMENTO.map(t=>`<option value="${escapeHtml(t)}" ${t===TIPO_ADEMPIMENTO_DEFAULT?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></div>
        <div class="field"><label>Frequenza</label>
          <select id="nevScadFrequenza" data-action="nuovo-evento-scad-frequenza">
            <option value="mensile">Mensile</option>
            <option value="trimestrale">Trimestrale (mar/giu/set/dic)</option>
            <option value="annuale" selected>Annuale</option>
          </select>
        </div>
        <div class="field" id="nevScadMeseWrap"><label>Mese</label>
          <select id="nevScadMese">${MESI_COMPLETI.map((m,i)=>`<option value="${i+1}" ${i+1===dataObj.getMonth()+1?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Giorno del mese</label><input type="number" id="nevScadGiorno" min="1" max="31" value="${dataObj.getDate()}"></div>
        <div class="field full" style="grid-column:1/-1;">
          <label>Clienti a cui si applica</label>
          <input type="text" id="nevScadCerca" placeholder="Cerca cliente..." style="margin-bottom:6px;" data-action="nuovo-evento-scad-cerca" autocomplete="off">
          <div id="nevScadClientiLista" style="max-height:170px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;">
            ${attivi.map(c=>`<label class="checkline" data-nome-ricerca="${escapeHtml(c.ragioneSociale.toLowerCase())}"><input type="checkbox" data-multi-cliente="nuovo-evento-scadenza" value="${c.id}"> ${escapeHtml(c.ragioneSociale)}</label>`).join('')}
            <div id="nevScadClientiVuoto" class="empty" style="display:none;padding:10px 4px;">Nessun cliente trovato.</div>
          </div>
          <div class="helptext" style="margin-top:4px;">Puoi lasciare la lista vuota e attivare la scadenza in anagrafica in un secondo momento.</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="nuovo-evento-salva-scadenza">Crea scadenza ricorrente</button>
      </div>`;
    aggiornaVisibilitaMeseScadenzaRicorrente();
  }
}
function aggiornaVisibilitaMeseScadenzaRicorrente() {
  const freq = document.getElementById('nevScadFrequenza');
  const wrap = document.getElementById('nevScadMeseWrap');
  if (!freq || !wrap) return;
  wrap.style.display = freq.value === 'annuale' ? '' : 'none';
}
function salvaNuovoAppuntamento(dataISO) {
  const clienteId = document.getElementById('nevCliente').value || null;
  const ora = document.getElementById('nevOraInizio').value.trim();
  const oraFine = document.getElementById('nevOraFine').value.trim();
  if (ora && !orarioValido(ora)) { toast('Ora inizio non valida: usa il formato HH:MM.', true); return; }
  if (oraFine && !orarioValido(oraFine)) { toast('Ora fine non valida: usa il formato HH:MM.', true); return; }
  let durataMinuti = DURATA_APPUNTAMENTO_DEFAULT;
  if (ora && oraFine) {
    const d = durataDaOrari(ora, oraFine);
    if (d === null) { toast('L\'ora di fine deve essere successiva all\'ora di inizio.', true); return; }
    durataMinuti = d;
  }
  const oggetto = document.getElementById('nevOggetto').value;
  const note = document.getElementById('nevNote').value;
  // Un appuntamento creato da qui (non dalla segreteria) non ha un "consulente" esplicito: occupa
  // l'agenda di chi lo sta creando (vedi appuntamentiDiConsulente, che per questo caso guarda
  // responsabile invece di consulente) - il controllo conflitti verifica quindi contro se stessi.
  const io = operatoreCorrente();
  if (io && ora) {
    const conflitti = appuntamentiInConflitto(io, dataISO, ora, durataMinuti, null);
    if (conflitti.length && !confermaAzione(messaggioConflittoAppuntamenti(conflitti))) return;
  }
  aggiungiAppuntamento({ clienteId, data: dataISO, ora, durataMinuti, oggetto, note });
  chiudiModal(); render();
  toast('Appuntamento creato.');
}
function salvaNuovaScadenzaRicorrente() {
  const nome = document.getElementById('nevScadNome').value.trim();
  if (!nome) { toast('Serve un nome per la scadenza.'); return; }
  const tipo = document.getElementById('nevScadTipo').value;
  const frequenza = document.getElementById('nevScadFrequenza').value;
  const giorno = Math.min(31, Math.max(1, Number(document.getElementById('nevScadGiorno').value) || 1));
  const meseAnnuale = Number(document.getElementById('nevScadMese').value) || 1;
  const clientiIds = Array.from(document.querySelectorAll('[data-multi-cliente="nuovo-evento-scadenza"]:checked')).map(i => i.value);

  let mesi;
  if (frequenza === 'mensile') mesi = [1,2,3,4,5,6,7,8,9,10,11,12];
  else if (frequenza === 'trimestrale') mesi = [3,6,9,12];
  else mesi = [meseAnnuale];

  const flag = 'custom_' + uid('').replace(/^_/, '');
  STATE.catalogoPeriodico.push({
    id: flag, flag, nome, attivo: true, personalizzato: true, tipo,
    conImporto: true, fasi: FASI_DEFAULT_CUSTOM.slice(),
    occorrenze: mesi.map(m => ({ m, g: giorno, nota: nome })),
  });
  clientiIds.forEach(cid => {
    const c = STATE.clienti.find(x => x.id === cid);
    if (!c) return;
    c.flags = c.flags || {};
    c.flags[flag] = true;
  });
  salvaStato(); chiudiModal(); render();
  toast(clientiIds.length
    ? `Scadenza ricorrente creata e attivata su ${clientiIds.length} client${clientiIds.length===1?'e':'i'}.`
    : 'Scadenza ricorrente creata. Nessun cliente selezionato: attivala in anagrafica quando serve.');
}

/* Dettaglio/modifica di un appuntamento: stato, ora, oggetto, note, più eliminazione. Per gli
   appuntamenti prenotati dalla segreteria (task #147) mostra anche i dati raccolti al telefono, la
   procedura interna suggerita in base al motivo e il pulsante per il riepilogo stampabile — e segna
   la notifica come vista appena il consulente la apre. */
/* Modifica di un appuntamento già esistente (cambio ora/durata dal suo modale): qui i campi si
   salvano da soli ad ogni modifica (stesso pattern di tutti gli altri modali dell'app, es.
   scad-cambia-importo), quindi un blocco "vuoi procedere comunque?" prima del salvataggio non ha
   senso - il salvataggio è già avvenuto. Un avviso non bloccante (toast) dopo il cambio è la
   controparte corretta: segnala il conflitto senza disfare quanto appena digitato. */
function avvisaSeConflittoAppuntamento(id) {
  const a = trovaAppuntamento(id);
  if (!a || !a.ora) return;
  const consulente = a.consulente || (!a.prenotatoDaSegreteria ? a.responsabile : null);
  if (!consulente) return;
  const conflitti = appuntamentiInConflitto(consulente, a.data, a.ora, durataAppuntamento(a), a.id);
  if (conflitti.length) toast(`⚠️ Si sovrappone con ${conflitti.length === 1 ? "un altro appuntamento" : conflitti.length + " altri appuntamenti"} di ${consulente} in questa fascia oraria.`, true);
}
/* Foglio guida dell'appuntamento: check list che il consulente compila durante/dopo l'incontro con un NUOVO cliente.
   Quando e completo la segreteria lo usa per creare il cliente potenziale (Preventivi > + Preventivo a nuovo cliente). */
const POSIZIONI_PREV_FOGLIO = ['Nessuna', 'INPS artigiani / commercianti', 'Gestione separata INPS', 'Cassa privata', 'Altro'];
function foglioAppuntamento(a) { return a.foglio || {}; }
function fogliPronti() { return (STATE.appuntamenti || []).filter(a => a.foglio && a.foglio.completato && !a.clientePotenzialeId); }
function htmlFoglioGuida(a) {
  const f = foglioAppuntamento(a), id = a.id;
  const sel = (campo, opzioni, valore) => `<select data-action="app-foglio-campo" data-campo="${campo}" data-id="${id}"><option value="">— scegli —</option>${opzioni.map(o => { const v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l; return `<option value="${escapeHtml(v)}" ${valore === v ? 'selected' : ''}>${escapeHtml(l)}</option>`; }).join('')}</select>`;
  return `<div class="card" style="margin:10px 0;border:1px solid var(--blu,#2f5bd1);">
    <div class="section-title" style="margin-top:0;">📋 Foglio guida del consulente ${f.completato ? '<span class="badge verde" style="margin-left:6px;">Consegnato alla segreteria</span>' : ''}</div>
    <div class="grid2">
      <div class="field"><label>Posizione da aprire</label>${sel('tipo', TIPI_CLIENTE, f.tipo)}</div>
      <div class="field"><label>Regime fiscale</label>${sel('regimeFiscale', REGIMI_FISCALI, f.regimeFiscale)}</div>
      <div class="field"><label>Posizione contributiva</label>${sel('posizioneContributiva', POSIZIONI_PREV_FOGLIO, f.posizioneContributiva)}</div>
      <div class="field"><label>Codice ATECO</label><input type="text" value="${escapeHtml(f.ateco || '')}" data-action="app-foglio-campo" data-campo="ateco" data-id="${id}" placeholder="es. 47.91.10"></div>
      <div class="field"><label class="checkline"><input type="checkbox" ${f.inail ? 'checked' : ''} data-action="app-foglio-campo" data-campo="inail" data-id="${id}"> Apertura posizione INAIL</label></div>
      <div class="field"><label class="checkline"><input type="checkbox" ${f.dipendenti ? 'checked' : ''} data-action="app-foglio-campo" data-campo="dipendenti" data-id="${id}"> Avra dipendenti</label></div>
      <div class="field full" style="grid-column:1/-1;"><label>Attivita da svolgere / note per la segreteria</label><textarea rows="2" data-action="app-foglio-campo" data-campo="note" data-id="${id}">${escapeHtml(f.note || '')}</textarea></div>
    </div>
    <div style="margin-top:8px;">${f.completato
      ? `<button class="btn small" data-action="app-foglio-riapri" data-id="${id}">Riapri il foglio</button>${a.clientePotenzialeId ? ' <span class="helptext" style="display:inline;">Cliente potenziale gia creato.</span>' : ''}`
      : `<button class="btn small primary" data-action="app-foglio-completa" data-id="${id}">✓ Foglio completato: consegna alla segreteria</button>`}</div>
  </div>`;
}
function apriModalAppuntamento(id) {
  const a = trovaAppuntamento(id);
  if (!a) return;
  if (a.prenotatoDaSegreteria) segnaAppuntamentoVisto(id);
  const bloccoSegreteria = a.prenotatoDaSegreteria ? `
    <div class="card" style="margin:10px 0;background:var(--rosa-bg);">
      <div class="section-title" style="margin-top:0;">Prenotato dalla segreteria</div>
      <div style="font-size:13px;line-height:1.7;">
        ${a.nomeChiamante ? `<div><strong>Nome:</strong> ${escapeHtml(a.nomeChiamante)}</div>` : ''}
        ${a.consulente ? `<div><strong>Consulente:</strong> ${escapeHtml(a.consulente)}</div>` : ''}
        ${a.tipoRichiesta ? `<div><strong>Tipo richiesta:</strong> ${escapeHtml(a.tipoRichiesta)}</div>` : ''}
        ${a.telefono ? `<div><strong>Telefono di chi ha chiamato:</strong> ${escapeHtml(a.telefono)}</div>` : ''}
        ${a.email ? `<div><strong>Email:</strong> ${escapeHtml(a.email)}</div>` : ''}
        ${a.tipologiaAttivita ? `<div><strong>Tipologia attività:</strong> ${escapeHtml(a.tipologiaAttivita)}</div>` : ''}
        ${a.canaleProvenienza ? `<div><strong>Come ci ha trovato:</strong> ${escapeHtml(a.canaleProvenienza)}</div>` : ''}
        ${a.motivo ? `<div><strong>Cosa vuole:</strong> ${escapeHtml(a.motivo)}${a.motivo==='Altro'&&a.motivoAltro?': '+escapeHtml(a.motivoAltro):''}</div>` : ''}
      </div>
      <div style="margin-top:8px;"><button class="btn small" data-action="stampa-riepilogo-appuntamento" data-id="${a.id}">🖨 Riepilogo stampabile per l'incontro</button></div>
    </div>` : '';
  // Task #185 (Matteo: "forse gestirei questo collegamento dopo aver preso l'appuntamento [...]
  // lasciamolo come un campo libero"): collegamento a una procedura SEMPRE modificabile a mano, non
  // solo per gli appuntamenti prenotati dalla segreteria - preselezionato con il suggerimento
  // automatico per motivo solo se non è già stato scelto nulla manualmente (vedi
  // proceduraCollegataAppuntamento), ma liberamente cambiabile con qualunque procedura attiva.
  const procedureAttiveOrdinate = (STATE.procedureInterne || []).filter(p => p.attivo).sort((x, y) => x.nome.localeCompare(y.nome));
  const procedureIdSelezionata = a.procedureId === PROC_NESSUNA ? '' : (a.procedureId || (proceduraSuggeritaPerAppuntamento(a) || {}).id || '');
  const bloccoProcedura = `
    <div class="field full" style="grid-column:1/-1;">
      <label>Procedura collegata <span style="font-weight:400;color:var(--text-mut);">(facoltativa, cambiabile in qualsiasi momento)</span></label>
      <div style="display:flex;gap:8px;align-items:center;">
        <select style="flex:1;" data-action="app-cambia-procedura" data-id="${a.id}">
          <option value="${PROC_NESSUNA}" ${!procedureIdSelezionata?'selected':''}>— Nessuna (attività mai trattata) —</option>
          ${procedureAttiveOrdinate.map(p => `<option value="${p.id}" ${procedureIdSelezionata===p.id?'selected':''}>${escapeHtml(p.categoria)} · ${escapeHtml(p.nome)}</option>`).join('')}
        </select>
        ${procedureIdSelezionata ? `<button type="button" class="btn small" data-action="apri-procedura" data-id="${procedureIdSelezionata}" data-app="${a.id}">Apri</button>` : ''}
      </div>
    </div>`;
  // Task #160: decisione del consulente (non della segreteria) su un eventuale bisogno di
  // software di fatturazione del cliente/prospect — per questo va nella scheda dell'incontro,
  // fuori dal bloccoSegreteria che è la sola trascrizione di quanto raccolto al telefono.
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:560px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Appuntamento</h2><div class="modal-sub">${escapeHtml(fmtData(a.data))}${a.ora?` · ${escapeHtml(a.ora)}–${escapeHtml(oraFineAppuntamento(a)||'?')}`:''} — ${escapeHtml(etichettaClienteEvento('appuntamento', a.clienteId))}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      ${bloccoSegreteria}
      ${a.prenotatoDaSegreteria && a.tipoRichiesta !== 'Consulenza per attività esistente' ? htmlFoglioGuida(a) : ''}
      <div class="grid2">
        <div class="field"><label>Stato</label><select data-action="app-cambia-stato" data-id="${a.id}">${STATI_APPUNTAMENTO.map(s=>`<option value="${s}" ${a.stato===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Ora inizio</label>${campoOrarioHtml('appOraInizio_'+a.id, a.ora||'', {azione:'app-cambia-ora-inizio', extra:`data-id="${a.id}"`})}</div>
        <div class="field"><label>Ora fine</label>${campoOrarioHtml('appOraFine_'+a.id, oraFineAppuntamento(a)||'', {azione:'app-cambia-ora-fine', extra:`data-id="${a.id}"`})}</div>
        <div class="field full" style="grid-column:1/-1;"><label>Oggetto</label><input type="text" value="${escapeHtml(a.oggetto||'')}" data-action="app-cambia-oggetto" data-id="${a.id}"></div>
        <div class="field full" style="grid-column:1/-1;"><label>Bisogno di software di fatturazione <span style="font-weight:400;color:var(--text-mut);">(valutazione del consulente)</span></label>
          <select data-action="app-cambia-software-fatturazione" data-id="${a.id}">
            ${OPZIONI_SOFTWARE_FATTURAZIONE.map(o => `<option value="${escapeHtml(o)}" ${(a.bisognoSoftwareFatturazione||OPZIONI_SOFTWARE_FATTURAZIONE[0])===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}
          </select>
        </div>
        <div class="field full" style="grid-column:1/-1;"><label>Note</label><textarea rows="3" data-action="app-cambia-note" data-id="${a.id}">${escapeHtml(a.note||'')}</textarea></div>
        ${bloccoProcedura}
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="app-elimina" data-id="${a.id}" style="color:var(--rosso);">Elimina</button>
        <button class="btn primary" data-action="chiudi-modal">Fatto</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

/* Foglio riepilogativo stampabile (task #147: "si potrà guidare l'appuntamento avendo una chiara
   idea di cosa vuole il cliente"; ridisegnato per task #161: fac-simile personalizzabile con
   intestazione dello studio e logo posizionabile) — stesso meccanismo/limiti di apriStampaPreventivo:
   finestra separata, window.print() avvolto in try/catch perché non disponibile in jsdom (mai
   testabile end-to-end) e perché in ambienti con popup bloccati il documento deve restare comunque
   aperto e leggibile/stampabile a mano. */
function apriRiepilogoAppuntamento(id) {
  const a = trovaAppuntamento(id);
  if (!a) { toast('Appuntamento non trovato.'); return; }
  const procedura = proceduraCollegataAppuntamento(a);

  // Righe del riepilogo come coppie campo/valore (invece della vecchia lista <br>-separata), per
  // un fac-simile leggibile anche stampato: ogni riga nuova richiesta da Matteo (nome, email,
  // tipologia attività, canale, bisogno software) è inclusa solo se valorizzata.
  const campi = [];
  campi.push(['Data e ora', `${fmtData(a.data)}${a.ora ? ' alle ' + a.ora : ''}`]);
  if (a.consulente) campi.push(['Consulente', a.consulente]);
  campi.push(['Cliente', etichettaClienteEvento('appuntamento', a.clienteId)]);
  if (a.nomeChiamante) campi.push(['Nome di chi chiama', a.nomeChiamante]);
  if (a.telefono) campi.push(['Telefono', a.telefono]);
  if (a.email) campi.push(['Email', a.email]);
  if (a.tipoRichiesta) campi.push(['Tipo richiesta', a.tipoRichiesta]);
  if (a.tipologiaAttivita) campi.push(['Tipologia di attività', a.tipologiaAttivita]);
  if (a.canaleProvenienza) campi.push(['Come ci ha trovato', a.canaleProvenienza]);
  if (a.motivo) campi.push(['Cosa vuole', a.motivo === 'Altro' && a.motivoAltro ? a.motivoAltro : a.motivo]);
  if (a.bisognoSoftwareFatturazione && a.bisognoSoftwareFatturazione !== OPZIONI_SOFTWARE_FATTURAZIONE[0]) campi.push(['Software di fatturazione', a.bisognoSoftwareFatturazione]);
  if (a.note) campi.push(['Note aggiuntive', a.note]);

  // Task #185 (Matteo: "quello devo dire risulta impaginato brutto, senza nessuna immagine e senza
  // colori"): righe zebrate con etichetta colorata invece della tabella piatta bianco/nero di
  // prima, stessa palette del resto di Prisma (vedi --blu-* in :root) - questa pagina vive in una
  // finestra popup separata (window.open), quindi non eredita il foglio di stile principale: i
  // colori vanno ripetuti qui in esadecimale.
  const BLU_SCURO = '#132A4C', BLU_MID = '#2E63C7', BLU_LIGHT = '#E7EEFC';
  const righeTabella = campi.map(([etichetta, valore], i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F7F9FD'};">
      <td style="padding:8px 14px;color:${BLU_MID};font-weight:600;white-space:nowrap;vertical-align:top;font-size:12px;border-bottom:1px solid #E7EBF2;">${escapeHtml(etichetta)}</td>
      <td style="padding:8px 14px;font-size:13.5px;border-bottom:1px solid #E7EBF2;">${escapeHtml(String(valore))}</td>
    </tr>`).join('');
  let corpo = `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px #E7EBF2;">${righeTabella}</table>`;
  if (procedura) {
    corpo += `<div style="margin-top:26px;background:${BLU_LIGHT};border-radius:10px;padding:16px 18px;">
      <div style="font-size:10.5px;font-weight:700;color:${BLU_MID};text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">📋 Procedura collegata</div>
      <h2 style="font-size:16px;margin:0 0 10px;color:${BLU_SCURO};">${escapeHtml(procedura.nome)}</h2>
      <div style="white-space:pre-wrap;font-size:13px;">${escapeHtml(procedura.contenuto)}</div>`;
    if ((procedura.checklistDocumenti || []).length) {
      corpo += `<h3 style="font-size:13px;margin-top:14px;color:${BLU_SCURO};">Documenti necessari</h3><ul style="margin:6px 0 0;padding-left:18px;">${procedura.checklistDocumenti.map(d=>`<li style="margin-bottom:3px;">${escapeHtml(d)}</li>`).join('')}</ul>`;
    }
    corpo += `</div>`;
  }

  // Intestazione dello studio: dati anagrafici sempre a sinistra, logo (se caricato) posizionato
  // secondo STATE.meta.logoPosizione — vedi cardLogoStudio() in Impostazioni > Studio.
  const m = STATE.meta;
  const datiStudioHtml = `<div>
      <div style="font-weight:700;font-size:16px;color:${BLU_SCURO};">${escapeHtml(m.studioNome || 'Studio')}</div>
      ${m.iscrizione ? `<div style="font-size:11.5px;color:#5B6678;margin-top:2px;">${escapeHtml(m.iscrizione)}</div>` : ''}
      ${m.indirizzoStudio ? `<div style="font-size:11.5px;color:#5B6678;">${escapeHtml(m.indirizzoStudio)}</div>` : ''}
      ${m.cfStudio ? `<div style="font-size:11.5px;color:#5B6678;">C.F./P.IVA ${escapeHtml(m.cfStudio)}</div>` : ''}
    </div>`;
  const logoHtml = m.logoStudio ? `<img src="${m.logoStudio}" alt="Logo" style="max-width:160px;max-height:70px;">` : '';
  const posizione = m.logoPosizione || 'sinistra';
  let intestazioneHtml;
  if (!logoHtml) {
    intestazioneHtml = datiStudioHtml;
  } else if (posizione === 'centro') {
    intestazioneHtml = `<div style="text-align:center;margin-bottom:8px;">${logoHtml}</div>${datiStudioHtml}`;
  } else if (posizione === 'destra') {
    intestazioneHtml = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">${datiStudioHtml}<div>${logoHtml}</div></div>`;
  } else {
    intestazioneHtml = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;"><div>${logoHtml}</div>${datiStudioHtml}</div>`;
  }

  const win = window.open('', '_blank');
  if (!win) { toast('Impossibile aprire la finestra di stampa (popup bloccato dal browser?).', true); return; }
  // Barra colorata in cima (puramente decorativa, @media print la mantiene: i browser stampano gli
  // sfondi solo se l'utente ha "grafica di sfondo" attiva nella finestra di stampa, scelta sua) e
  // intestazione "RIEPILOGO APPUNTAMENTO" con lo stesso accento blu del resto di Prisma, invece del
  // vecchio titolo nero su sfondo bianco piatto.
  win.document.write(`<!DOCTYPE html><html><head><title>Riepilogo appuntamento</title><meta charset="utf-8"><style>
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:680px;margin:0 auto;padding:0 24px 40px;line-height:1.6;font-size:14px;color:#161B26;}
    .barra-top{height:8px;background:linear-gradient(90deg, ${BLU_MID}, ${BLU_SCURO});margin:0 -9999px 32px;}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BLU_MID};margin:0 0 4px;}
  </style></head><body>
    <div class="barra-top"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid ${BLU_LIGHT};padding-bottom:16px;margin-bottom:24px;">${intestazioneHtml}</div>
    <div class="eyebrow">Promemoria incontro</div>
    <h1 style="font-size:20px;margin:0 0 20px;color:${BLU_SCURO};">Riepilogo appuntamento</h1>
    ${corpo}
  </body></html>`);
  win.document.close();
  win.focus();
  try { win.print(); } catch (e) { /* il documento resta comunque aperto e stampabile manualmente */ }
}

/* -------------------- "PRENOTA UN APPUNTAMENTO" (task #147, flusso segreteria) --------------------
   Un consulente è considerato impegnato in un appuntamento se è lui/lei il destinatario di una
   prenotazione fatta dalla segreteria (a.consulente) OPPURE se se l'è creato da sé dal calendario
   normale (a.responsabile, quando non prenotato dalla segreteria) — così l'agenda mostrata qui è
   completa anche per gli appuntamenti che il consulente si è già segnato da solo. Calendario interno
   di Prisma per ora: il collegamento con Google Calendar resta task #59. */
function appuntamentiDiConsulente(nome) {
  return (STATE.appuntamenti || []).filter(a => a.stato !== 'Annullato' && (a.consulente === nome || (!a.prenotatoDaSegreteria && a.responsabile === nome)));
}
let PRENOTA_CONSULENTE = null;
// Task #158: offset in settimane (0 = settimana corrente) usato dalla vista impegni del
// consulente nel form di prenotazione, per poter dire al telefono "questa settimana" o "la
// prossima" e navigare di conseguenza senza dover contare le date a mano.
let PRENOTA_SETTIMANA_OFFSET = 0;
// Lunedì della settimana di "riferimento" (oggi) spostata di offset settimane.
function inizioSettimanaPrenota(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const giornoSett = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setDate(d.getDate() - giornoSett + offset * 7);
  return d;
}
function dataISOLocale(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}
function modalPrenotaAppuntamento() {
  const consulenti = STATE.meta.consulenti || [];
  if (!consulenti.length) { toast('Nessun consulente configurato: attivali in Impostazioni > Team.'); return; }
  PRENOTA_CONSULENTE = consulenti[0];
  PRENOTA_SETTIMANA_OFFSET = 0;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Prenota un appuntamento</h2><div class="modal-sub">Per chi telefona, senza dover riaprire il calendario del consulente.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div id="prenotaAppuntamentoForm"></div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  renderFormPrenotaAppuntamento();
}
// Task #158: griglia di 7 giorni (lun-dom) con gli impegni del consulente selezionato nella
// settimana individuata da PRENOTA_SETTIMANA_OFFSET, per poter dire al cliente "questa settimana
// libero il..." o "la prossima" con un colpo d'occhio, invece di scorrere una lista piatta.
/* Task #172 (Matteo: "le caselle dei giorni sono troppo strette e non si capisce bene quando hanno
   tempo [...] vorrei fosse più simile a google dove c'è la griglia con gli orari e il riquadro
   dell'appuntamento si estende sugli orari che ricopre"): da 7 caselle con un elenco testuale a una
   vera griglia oraria condivisa (vedi rangeOrarioGriglia/posizioneBloccoGriglia più sopra) - un
   solo asse ore a sinistra, 7 colonne affiancate (scrollabili in orizzontale se lo schermo è
   stretto), ciascun appuntamento un blocco posizionato/alto in proporzione al suo orario. Lo
   "spazio libero" si vede ora a colpo d'occhio dal vuoto nella colonna, non va più dedotto
   leggendo un elenco. */
function agendaSettimanalePrenotaHtml() {
  const lunedi = inizioSettimanaPrenota(PRENOTA_SETTIMANA_OFFSET);
  const oggi = oggiISO();
  const impegni = appuntamentiDiConsulente(PRENOTA_CONSULENTE);
  const giorni = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunedi);
    d.setDate(d.getDate() + i);
    giorni.push(d);
  }
  const NOMI_GIORNO = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const perGiorno = giorni.map(d => {
    const iso = dataISOLocale(d);
    return impegni.filter(a => a.data === iso && a.ora).sort((a, b) => a.ora.localeCompare(b.ora));
  });
  const range = rangeOrarioGriglia(perGiorno.flat());
  const altezza = altezzaGrigliaPx(range);
  const colonne = giorni.map((d, i) => {
    const iso = dataISOLocale(d);
    const delGiorno = perGiorno[i];
    const eOggi = iso === oggi;
    const blocchi = delGiorno.map(a => {
      const pos = posizioneBloccoGriglia(a, range);
      if (!pos) return '';
      return `<div class="cal-grid-blocco" style="top:${pos.top}px;height:${pos.altezza}px;" title="${escapeHtml(a.ora)}–${escapeHtml(oraFineAppuntamento(a) || '?')} ${escapeHtml(a.oggetto || '')}${a.clienteId ? ' — ' + escapeHtml(etichettaClienteEvento('appuntamento', a.clienteId)) : ''}">
        <span class="ora">${escapeHtml(a.ora)}–${escapeHtml(oraFineAppuntamento(a) || '?')}</span>${escapeHtml(a.oggetto || '')}
      </div>`;
    }).join('');
    return `<div class="cal-grid-colonna-wrap">
      <div class="cal-grid-intestazione ${eOggi ? 'oggi' : ''}">${NOMI_GIORNO[i]} ${d.getDate()}/${d.getMonth() + 1}${delGiorno.length ? ` · ${delGiorno.length}` : ''}</div>
      <div class="cal-grid-colonna ${eOggi ? 'oggi' : ''}" style="height:${altezza}px;--cal-grid-ora-px:${CAL_GRID_PX_PER_ORA}px;">${blocchi}</div>
    </div>`;
  }).join('');
  const etichettaSettimana = PRENOTA_SETTIMANA_OFFSET === 0 ? 'Questa settimana' : PRENOTA_SETTIMANA_OFFSET === 1 ? 'Prossima settimana' : PRENOTA_SETTIMANA_OFFSET === -1 ? 'Settimana scorsa' : `Settimana del ${dataISOLocale(lunedi).split('-').reverse().join('/')}`;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;margin-bottom:6px;">
      <div class="section-title" style="margin:0;font-size:12px;">Impegni di ${escapeHtml(PRENOTA_CONSULENTE || '')} — ${etichettaSettimana}</div>
      <div style="display:flex;gap:4px;">
        <button type="button" class="btn small ghost" data-action="prenota-settimana-prec" title="Settimana precedente">‹</button>
        <button type="button" class="btn small ghost" data-action="prenota-settimana-oggi" title="Torna a questa settimana">Oggi</button>
        <button type="button" class="btn small ghost" data-action="prenota-settimana-succ" title="Settimana successiva">›</button>
      </div>
    </div>
    <div class="cal-grid-wrap" style="margin-bottom:12px;">
      <div class="cal-grid-ore" style="height:${altezza + 24}px;"><div style="height:24px;"></div><div style="position:relative;height:${altezza}px;">${tacchePerOreGrigliaHtml(range)}</div></div>
      <div class="cal-grid-colonne">${colonne}</div>
    </div>`;
}
function renderFormPrenotaAppuntamento() {
  const el = document.getElementById('prenotaAppuntamentoForm');
  if (!el) return;
  const consulenti = STATE.meta.consulenti || [];
  const oggi = oggiISO();
  const attivi = STATE.clienti.filter(c => clienteAttivo(c)).sort((a,b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
  el.innerHTML = `
    <div class="field"><label>Consulente</label>
      <select id="prenConsulente" data-action="prenota-cambia-consulente">${consulenti.map(c => `<option value="${escapeHtml(c)}" ${c===PRENOTA_CONSULENTE?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
    </div>
    <div id="prenAgendaSettimana">${agendaSettimanalePrenotaHtml()}</div>

    <div class="grid2">
      <div class="field"><label>Data</label><input type="date" id="prenData" value="${oggi}"></div>
      <div class="field"><label>Ora inizio</label>${campoOrarioHtml('prenOraInizio', '')}</div>
      <div class="field"><label>Ora fine</label>${campoOrarioHtml('prenOraFine', '')}</div>
    </div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;"><label>Nome di chi chiama</label><input type="text" id="prenNomeChiamante" placeholder="nome e cognome, o ragione sociale"></div>

    <div class="grid2" style="margin-top:8px;">
      <div class="field"><label>Telefono</label><input type="tel" id="prenTelefono" placeholder="es. 0444 123456"></div>
      <div class="field"><label>Email</label><input type="email" id="prenEmail" placeholder="per mandare il preventivo"></div>
    </div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;">
      <label>Tipo di richiesta</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        ${TIPI_RICHIESTA_APPUNTAMENTO.map((t,i) => `<label class="checkline"><input type="radio" name="prenTipo" value="${escapeHtml(t)}" data-action="prenota-tipo-change" ${i===0?'checked':''}> ${escapeHtml(t)}</label>`).join('')}
      </div>
    </div>
    <div class="field full" id="prenClienteWrap" style="grid-column:1/-1;margin-top:6px;display:none;">
      <label>Cliente</label>
      <select id="prenCliente"><option value="">— seleziona —</option>${attivi.map(c=>`<option value="${c.id}">${escapeHtml(c.ragioneSociale)}</option>`).join('')}</select>
    </div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;"><label>Tipologia di attività (svolta o da avviare)</label><input type="text" id="prenTipologiaAttivita" placeholder="es. e-commerce, artigianato, libero professionista..."></div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;">
      <label>Come ci ha trovato</label>
      <select id="prenCanale">${CANALI_PROVENIENZA_APPUNTAMENTO.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
    </div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;">
      <label>Cosa vuole</label>
      <div style="display:flex;flex-direction:column;gap:6px;border:1px solid var(--border);border-radius:6px;padding:8px 10px;">
        ${MOTIVI_APPUNTAMENTO.map((m,i) => `<label class="checkline"><input type="radio" name="prenMotivo" value="${escapeHtml(m)}" data-action="prenota-motivo-change" ${i===0?'checked':''}> ${escapeHtml(m)}</label>`).join('')}
      </div>
    </div>
    <div class="field full" id="prenMotivoAltroWrap" style="grid-column:1/-1;margin-top:6px;display:none;">
      <label>Specifica</label><input type="text" id="prenMotivoAltro" placeholder="cosa vuole, in poche parole">
    </div>

    <div class="field full" style="grid-column:1/-1;margin-top:8px;"><label>Note aggiuntive (facoltative)</label><textarea id="prenNote" rows="2" placeholder="qualsiasi altro dettaglio utile al consulente"></textarea></div>

    <div class="modal-actions">
      <button class="btn" data-action="chiudi-modal">Annulla</button>
      <button class="btn primary" data-action="salva-prenota-appuntamento">Prenota appuntamento</button>
    </div>`;
}
/* Cambio tipo richiesta/motivo: manipolazione diretta del DOM (mostra/nasconde un campo) invece di
   un renderFormPrenotaAppuntamento() completo, per non perdere quanto già digitato negli altri campi
   del form (stesso principio di cred-campo-input: niente re-render che azzeri l'input). */
function aggiornaVisibilitaClientePrenota() {
  const tipo = document.querySelector('input[name="prenTipo"]:checked');
  const wrap = document.getElementById('prenClienteWrap');
  if (wrap) wrap.style.display = (tipo && tipo.value === 'Consulenza per attività esistente') ? '' : 'none';
}
function aggiornaVisibilitaMotivoAltroPrenota() {
  const motivo = document.querySelector('input[name="prenMotivo"]:checked');
  const wrap = document.getElementById('prenMotivoAltroWrap');
  if (wrap) wrap.style.display = (motivo && motivo.value === 'Altro') ? '' : 'none';
}
// Task #158: come sopra, aggiorna solo il blocco della settimana (prev/succ/oggi) senza ridisegnare
// l'intero form, così non si perde quanto già digitato negli altri campi.
function aggiornaAgendaSettimanalePrenota() {
  const wrap = document.getElementById('prenAgendaSettimana');
  if (wrap) wrap.innerHTML = agendaSettimanalePrenotaHtml();
}
function salvaPrenotaAppuntamento() {
  const data = h('prenData').value;
  if (!data) { toast('Serve una data per l\'appuntamento.'); return; }
  const ora = h('prenOraInizio').value.trim();
  const oraFine = h('prenOraFine').value.trim();
  if (ora && !orarioValido(ora)) { toast('Ora inizio non valida: usa il formato HH:MM.', true); return; }
  if (oraFine && !orarioValido(oraFine)) { toast('Ora fine non valida: usa il formato HH:MM.', true); return; }
  let durataMinuti = DURATA_APPUNTAMENTO_DEFAULT;
  if (ora && oraFine) {
    const d = durataDaOrari(ora, oraFine);
    if (d === null) { toast('L\'ora di fine deve essere successiva all\'ora di inizio.', true); return; }
    durataMinuti = d;
  }
  if (PRENOTA_CONSULENTE && ora) {
    const conflitti = appuntamentiInConflitto(PRENOTA_CONSULENTE, data, ora, durataMinuti, null);
    if (conflitti.length && !confermaAzione(messaggioConflittoAppuntamenti(conflitti))) return;
  }
  const tipoEl = document.querySelector('input[name="prenTipo"]:checked');
  const tipoRichiesta = tipoEl ? tipoEl.value : TIPI_RICHIESTA_APPUNTAMENTO[0];
  const clienteId = (tipoRichiesta === 'Consulenza per attività esistente' && h('prenCliente')) ? (h('prenCliente').value || null) : null;
  const nomeChiamante = h('prenNomeChiamante') ? h('prenNomeChiamante').value.trim() : '';
  const telefono = h('prenTelefono').value;
  const email = h('prenEmail') ? h('prenEmail').value.trim() : '';
  const tipologiaAttivita = h('prenTipologiaAttivita') ? h('prenTipologiaAttivita').value.trim() : '';
  const canaleProvenienza = h('prenCanale') ? h('prenCanale').value : '';
  const motivoEl = document.querySelector('input[name="prenMotivo"]:checked');
  const motivo = motivoEl ? motivoEl.value : null;
  const motivoAltro = h('prenMotivoAltro') ? h('prenMotivoAltro').value : '';
  const note = h('prenNote').value;
  const oggetto = motivo === 'Altro' && motivoAltro.trim() ? motivoAltro.trim() : (motivo || 'Appuntamento');
  aggiungiAppuntamento({
    clienteId, data, ora, durataMinuti, oggetto, note, consulente: PRENOTA_CONSULENTE,
    nomeChiamante, email, tipologiaAttivita, canaleProvenienza,
    prenotatoDaSegreteria: true, tipoRichiesta, telefono, motivo, motivoAltro,
  });
  chiudiModal(); render();
  toast(`Appuntamento prenotato per ${PRENOTA_CONSULENTE}.`);
}

