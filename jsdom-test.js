// Test end-to-end dell'app in un DOM simulato (jsdom), senza bisogno di un vero browser.
// Simula un commercialista che usa l'app per un anno intero: crea clienti, marca scadenze,
// registra ritenute, gestisce onboarding e sotto-adempimenti, naviga il calendario.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'gestionale.htm'), 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost/gestionale.htm',
  pretendToBeVisual: true,
  virtualConsole: (() => {
    const { VirtualConsole } = require('jsdom');
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
    vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
    return vc;
  })(),
});

const { window } = dom;
window.requestAnimationFrame = window.requestAnimationFrame || (cb => setTimeout(cb, 0));
window.confirm = () => true;
window.prompt = () => 'Nuovo Responsabile Test';
window.alert = (msg) => { console.log('  [alert]', msg); };
window.addEventListener('error', (e) => {
  errors.push('window error: ' + (e.error ? (e.error.stack || e.error.message) : e.message));
});

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function assert(cond, msg) { if (!cond) { throw new Error('ASSERT FALLITO: ' + msg); } }
function q(sel) { return window.document.querySelector(sel); }
function qa(sel) { return Array.from(window.document.querySelectorAll(sel)); }
function fire(el, type) { const ev = new window.Event(type, { bubbles: true }); el.dispatchEvent(ev); }
function click(el) { assert(el, 'elemento da cliccare non trovato'); fire(el, 'click'); }
function setVal(el, val) { assert(el, 'elemento input non trovato'); el.value = val; fire(el, 'input'); fire(el, 'change'); }
function setChecked(el, val) { assert(el, 'checkbox non trovato'); el.checked = val; fire(el, 'change'); }
/* Ogni <form> dei modali contiene solo input/select ma i bottoni "Salva"/"Annulla" vivono FUORI
   dal form (in un div .modal-actions sibling), senza un submit button associato: senza
   onsubmit="return false;" premere Invio in un campo di testo attiverebbe comunque l'invio
   implicito nativo del form (specifica WHATWG), causando un reload dell'intera pagina e la
   perdita di quel che si stava scrivendo. Verifica che il guardrail non venga mai rimosso. */
function assertNoAutoSubmit(formEl, nomeForm) {
  assert(formEl, `form "${nomeForm}" non trovato per il controllo anti-invio-nativo`);
  assert(formEl.getAttribute('onsubmit') === 'return false;', `form "${nomeForm}" senza onsubmit="return false;": Invio in un campo di testo causerebbe un reload dell'intera pagina`);
}

setTimeout(() => { console.error('\n❌ WATCHDOG: timeout duro, il test si è bloccato da qualche parte.'); process.exit(3); }, 90000).unref?.();

async function main() {
  await wait(200); // lascia girare init()
  assert(window.getSTATE(), 'STATE non inizializzato dopo init()');
  console.log('=== INIT OK, vista iniziale:', window.getVIEW());

  // ---------- 1) Vai in Impostazioni e carica i dati di esempio ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="avanzate"]')); // task Matteo: Impostazioni ora è divisa in sezioni/categorie
  await wait(20);
  click(q('[data-action="carica-demo"]'));
  await wait(20);
  assert(window.getSTATE().clienti.length === 24, `attesi 24 clienti demo, trovati ${window.getSTATE().clienti.length}`);
  const nCessatiDemo = window.getSTATE().clienti.filter(c => c.stato === 'cessato').length;
  assert(nCessatiDemo === 2, `attesi 2 clienti cessati nel demo, trovati ${nCessatiDemo}`);
  console.log('=== Dati demo caricati:', window.getSTATE().clienti.length, 'clienti (' + nCessatiDemo + ' cessati),', window.getSTATE().ritenuteRighe.length, 'righe ritenute,', window.getSTATE().comunicazioni.length, 'comunicazioni,', window.getSTATE().documenti.length, 'documenti');

  // ---------- 2) Dashboard: verifica KPI coerenti con classificaScadenze ----------
  click(q('[data-nav="dashboard"]'));
  await wait(20);
  const { tutteScadenze } = window.derivati();
  const classi = window.classificaScadenze(tutteScadenze, window.oggiISO());
  const kpiNums = qa('.kpi .n').map(el => Number(el.textContent));
  assert(kpiNums[0] === classi.scaduti.length, `KPI scaduti dashboard (${kpiNums[0]}) != calcolo motore (${classi.scaduti.length})`);
  assert(kpiNums[1] === classi.inScadenza.length, `KPI in scadenza dashboard (${kpiNums[1]}) != calcolo motore (${classi.inScadenza.length})`);
  assert(kpiNums[2] === classi.futuri.length, `KPI futuri dashboard (${kpiNums[2]}) != calcolo motore (${classi.futuri.length})`);
  assert(kpiNums[3] === classi.completati.length, `KPI completati dashboard (${kpiNums[3]}) != calcolo motore (${classi.completati.length})`);
  console.log(`=== Dashboard KPI coerenti: scaduti=${kpiNums[0]} inScadenza=${kpiNums[1]} futuri=${kpiNums[2]} completati=${kpiNums[3]}`);

  // filtro responsabile sulla dashboard
  const selResp = q('[data-action="dash-resp"]');
  setVal(selResp, 'Matteo');
  await wait(20);
  const kpiMatteo = qa('.kpi .n').map(el => Number(el.textContent));
  const totMatteo = kpiMatteo.reduce((a,b)=>a+b,0);
  const totTutti = kpiNums.reduce((a,b)=>a+b,0);
  assert(totMatteo <= totTutti, 'filtro responsabile deve ridurre o mantenere uguale il totale scadenze');
  console.log(`=== Filtro responsabile "Matteo" funziona: ${totMatteo} scadenze (su ${totTutti} totali)`);
  setVal(selResp, 'Tutti');
  await wait(20);

  // ---------- 2b) Dashboard: click su una scadenza apre il suo riepilogo; click su un adempimento
  //             annuale porta alla vista Adempimenti annuali con la riga già espansa (task #115/#116) ----------
  const rigaScadDash = q('[data-action="apri-dettaglio-scadenza"]');
  assert(rigaScadDash, 'nessuna riga scadenza cliccabile in dashboard (atteso: almeno una scaduta o in scadenza nel demo)');
  const idScadDash = rigaScadDash.dataset.id;
  click(rigaScadDash);
  await wait(20);
  assert(q('.modal h2'), 'click su una scadenza in dashboard non apre alcun modale');
  assert(q(`[data-action="scad-detail-cambia-stato"][data-id="${idScadDash}"]`), 'il modale aperto dalla dashboard non è il dettaglio della scadenza cliccata');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Dashboard (task #115): click su una scadenza apre il riepilogo della scadenza OK');

  // ---------- Storico solleciti / Step di controllo aperti dal dettaglio scadenza: pulsante
  //            "← Indietro" per tornare al dettaglio invece di dover chiudere tutto (task #117) ----------
  const scadConStep = window.derivati().tutteScadenze.find(s => (s.step || []).length > 0);
  assert(scadConStep, 'precondizione test #117: nessuna scadenza demo con step di controllo trovata');
  window.modalDettaglioScadenza(scadConStep.id);
  await wait(20);
  assert(q('[data-action="scad-detail-apri-solleciti"]'), 'dettaglio scadenza: pulsante Storico solleciti mancante o non aggiornato alla nuova azione dedicata');
  click(q('[data-action="scad-detail-apri-solleciti"]'));
  await wait(20);
  assert(q('.modal h2') && q('.modal h2').textContent === 'Storico solleciti', 'click su "Storico solleciti" dal dettaglio non apre il modale giusto');
  // NB: "apri-dettaglio-scadenza" è lo stesso data-action usato ANCHE dalle righe scadenza in
  // dashboard (task #115) — con la dashboard ancora renderizzata dietro il modale (non si è mai
  // cambiata VIEW), un q('[data-action="apri-dettaglio-scadenza"]') non scoperto rischia di
  // beccare la riga sbagliata in #content invece del pulsante "← Indietro" dentro il modale
  // corrente. Si scopa quindi la query dentro '.modal' esplicitamente.
  assert(q('.modal [data-action="apri-dettaglio-scadenza"]'), 'Storico solleciti aperto dal dettaglio scadenza non offre un pulsante per tornare indietro');
  click(q('.modal [data-action="apri-dettaglio-scadenza"]'));
  await wait(20);
  assert(q('.modal [data-action="scad-detail-cambia-stato"]') && q('.modal [data-action="scad-detail-cambia-stato"]').dataset.id === scadConStep.id, 'il pulsante "← Indietro" di Storico solleciti non torna al dettaglio della scadenza di partenza');
  console.log('=== Storico solleciti dal dettaglio scadenza: "← Indietro" torna al dettaglio OK');

  assert(q('[data-action="scad-detail-apri-controllo"]'), 'dettaglio scadenza: pulsante Step di controllo mancante o non aggiornato alla nuova azione dedicata');
  click(q('[data-action="scad-detail-apri-controllo"]'));
  await wait(20);
  assert(q('.modal h2') && q('.modal h2').textContent === 'Step di controllo', 'click su "Step di controllo" dal dettaglio non apre il modale giusto');
  // stesso scoping di sopra: "apri-dettaglio-scadenza" è ambiguo con le righe scadenza in dashboard
  assert(q('.modal [data-action="apri-dettaglio-scadenza"]'), 'Step di controllo aperto dal dettaglio scadenza non offre un pulsante per tornare indietro');
  click(q('.modal [data-action="apri-dettaglio-scadenza"]'));
  await wait(20);
  assert(q('.modal [data-action="scad-detail-cambia-stato"]') && q('.modal [data-action="scad-detail-cambia-stato"]').dataset.id === scadConStep.id, 'il pulsante "← Indietro" di Step di controllo non torna al dettaglio della scadenza di partenza');
  console.log('=== Step di controllo dal dettaglio scadenza: "← Indietro" torna al dettaglio OK');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // Aperti direttamente dal pulsante 🔔 nella tabella Scadenze periodiche (non passando dal
  // dettaglio), invece, devono restare come prima: solo "Chiudi", senza "← Indietro" (non c'è un
  // dettaglio a cui tornare in quel percorso) — click vero sull'azione reale, non una chiamata
  // diretta alla funzione, perché è proprio quell'azione (scad-apri-solleciti) ad azzerare il flag.
  click(q('[data-nav="scadenze"]'));
  await wait(20);
  const btnSollecitoTabella = q('[data-action="scad-apri-solleciti"]');
  assert(btnSollecitoTabella, 'nessun pulsante 🔔 Storico solleciti trovato in tabella Scadenze periodiche');
  click(btnSollecitoTabella);
  await wait(20);
  assert(!qa('.modal-actions button').some(b => b.textContent.includes('Indietro')), 'Storico solleciti aperto direttamente dalla tabella (non dal dettaglio scadenza) non dovrebbe mostrare "← Indietro"');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Storico solleciti aperto direttamente dalla tabella: nessun "← Indietro" mostrato, comportamento invariato OK');
  click(q('[data-nav="dashboard"]'));
  await wait(20);

  const rigaAnnDash = q('[data-action="dash-apri-annuale"]');
  assert(rigaAnnDash, 'nessun adempimento annuale incompleto cliccabile in dashboard (atteso: almeno uno nel demo)');
  const idAnnDash = rigaAnnDash.dataset.id;
  click(rigaAnnDash);
  await wait(20);
  assert(window.getVIEW() === 'annuali', 'click su un adempimento annuale in dashboard non naviga alla vista Adempimenti annuali');
  const cardAnnEspansa = q(`[data-action="ann-toggle-expand"][data-id="${idAnnDash}"]`);
  assert(cardAnnEspansa, 'la vista Adempimenti annuali non mostra la riga corrispondente dopo il click dalla dashboard (probabile problema di filtro/paginazione)');
  assert(cardAnnEspansa.closest('.card').textContent.includes('Sotto-adempimenti'), 'la riga non risulta già espansa dopo il click dalla dashboard');
  assert(q('[data-action="ann-filtro-q"]').value, 'il filtro cliente non è stato precompilato per isolare la riga cliccata dalla dashboard');
  console.log('=== Dashboard (task #116): click su un adempimento annuale apre la vista Adempimenti annuali già espansa OK');
  // pulizia: azzera il filtro cliente per non alterare i test successivi sulla vista Annuali
  setVal(q('[data-action="ann-filtro-q"]'), '');
  await wait(20);

  // ---------- 3) Clienti: crea un nuovo cliente da zero (form completo) ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  const nClientiPrima = window.getSTATE().clienti.length;
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);
  assert(q('#formCliente'), 'form nuovo cliente non renderizzato');
  assertNoAutoSubmit(q('#formCliente'), 'formCliente');
  setVal(q('#fRagioneSociale'), 'Cliente Di Prova SRL');
  setVal(q('#fPartitaIva'), '09999999999');
  setVal(q('#fPeriodIva'), 'Mensile');
  setVal(q('#fPrevidenza'), 'No previdenza');
  setChecked(q('[data-annuale="DICH_IVA_ANNUALE"]'), true);
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  assert(window.getSTATE().clienti.length === nClientiPrima + 1, 'il nuovo cliente non è stato salvato');
  const nuovoCliente = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Cliente Di Prova SRL');
  assert(nuovoCliente, 'nuovo cliente non trovato in STATE dopo il salvataggio');
  assert(nuovoCliente.adempimentiAnnualiApplicabili.includes('DICH_IVA_ANNUALE'), 'DICH_IVA_ANNUALE non salvato tra gli adempimenti annuali applicabili');
  assert(!('dichiarazioneIva' in nuovoCliente.flags), 'il flag periodico dichiarazioneIva non deve più esistere (eliminata la duplicazione col catalogo annuale)');
  console.log('=== Nuovo cliente creato da form:', nuovoCliente.ragioneSociale, '— id', nuovoCliente.id);

  // verifica che generi scadenze coerenti: 12 IVA mensili, e "Dichiarazione IVA" NON più come
  // scadenza periodica separata (era la duplicazione segnalata) — vive solo nell'adempimento
  // annuale, con scadenza calcolata in automatico al 30/4 (o primo feriale successivo)
  const scadNuovoCliente = window.derivati().periodiche.filter(s => s.clienteId === nuovoCliente.id);
  assert(scadNuovoCliente.filter(s=>s.tipo==='Liquidazione IVA mensile').length === 12, 'il nuovo cliente deve avere 12 IVA mensili');
  assert(scadNuovoCliente.filter(s=>s.tipo==='Dichiarazione IVA').length === 0, 'Dichiarazione IVA non deve più generare anche una scadenza periodica separata');
  console.log('=== Scadenze generate correttamente per il nuovo cliente:', scadNuovoCliente.length, 'totali');

  const { annuali: annualiNuovoCliente } = window.derivati();
  const admIvaAnnualeNuovoCliente = annualiNuovoCliente.find(a => a.clienteId === nuovoCliente.id && a.tipoChiave === 'DICH_IVA_ANNUALE');
  assert(admIvaAnnualeNuovoCliente, 'adempimento annuale DICH_IVA_ANNUALE non generato per il nuovo cliente');
  const scadenzaIvaAttesa = window.dataScadenza(window.getSTATE().annoCorrente, 4, 30);
  assert(admIvaAnnualeNuovoCliente.scadenza === scadenzaIvaAttesa, `scadenza DICH_IVA_ANNUALE attesa in automatico ${scadenzaIvaAttesa}, trovata ${admIvaAnnualeNuovoCliente.scadenza}`);
  assert(admIvaAnnualeNuovoCliente.tipo === 'Imposte indirette', `DICH_IVA_ANNUALE dovrebbe avere tipo "Imposte indirette", trovato "${admIvaAnnualeNuovoCliente.tipo}"`);
  console.log('=== Dichiarazione IVA unificata nel solo catalogo annuale, con scadenza 30/4 calcolata in automatico:', admIvaAnnualeNuovoCliente.scadenza);

  // modifica il cliente appena creato (regime + flag)
  click(q(`[data-action="modifica-cliente"][data-id="${nuovoCliente.id}"]`));
  await wait(20);
  setVal(q('#fRegime'), 'Forfettario');
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  assert(window.clienteById(nuovoCliente.id).regimeFiscale === 'Forfettario', 'modifica regime fiscale non salvata');
  console.log('=== Modifica cliente esistente OK (regime -> Forfettario)');

  // elimina il cliente di prova (per non sporcare i controlli successivi sui 6 demo)
  click(q(`[data-action="modifica-cliente"][data-id="${nuovoCliente.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-cliente"][data-id="${nuovoCliente.id}"]`));
  await wait(20);
  assert(!window.clienteById(nuovoCliente.id), 'cliente di prova non eliminato');
  console.log('=== Eliminazione cliente OK');

  // ---------- 3a-bis) Tipi cliente granulari, codici ATECO multipli, etichette leggibili ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);

  // il "Tipo" cliente ora ha una voce standalone per ciascuna forma giuridica, niente più raggruppamento
  const opzTipo = qa('#fTipo option').map(o => o.value);
  assert(opzTipo.length === 8, `attese 8 voci distinte per il tipo cliente, trovate ${opzTipo.length}`);
  ['persona_fisica','ditta_individuale','societa_persone','societa_capitali','cooperativa','associazione','impresa_sociale','altra_forma'].forEach(v => {
    assert(opzTipo.includes(v), `manca la voce tipo cliente "${v}"`);
  });
  assert(!opzTipo.includes('società'), 'il vecchio valore raggruppato "società" non deve più essere tra le opzioni');
  console.log('=== Tipo cliente: 8 forme giuridiche distinte disponibili, niente più raggruppamento OK');

  // etichette leggibili (non tutto maiuscolo) per Addebito F24 e Tenuta contabilità, valori invariati
  const optAddebito = qa('#fAddebito option');
  assert(optAddebito.some(o => o.value === 'NOI' && o.textContent === 'Noi (studio)'), 'etichetta "Addebito F24" non in maiuscolo-iniziale per il valore NOI');
  assert(optAddebito.every(o => o.textContent !== o.textContent.toUpperCase() || !/[A-Za-z]/.test(o.textContent)), 'etichetta Addebito F24 ancora tutta in maiuscolo');
  const optContab = qa('#fContabilita option');
  const optContabEsterna = optContab.find(o => o.value === 'ESTERNA');
  assert(optContabEsterna && optContabEsterna.textContent === 'Esterna (tenuta dallo studio)', `etichetta "Tenuta contabilità" (ESTERNA) non corretta: "${optContabEsterna && optContabEsterna.textContent}"`);
  const optContabInterna = optContab.find(o => o.value === 'INTERNA');
  assert(optContabInterna && optContabInterna.textContent === 'Interna (tenuta dalla società)', `etichetta "Tenuta contabilità" (INTERNA) non corretta: "${optContabInterna && optContabInterna.textContent}"`);
  console.log('=== Etichette "Addebito F24"/"Tenuta contabilità" leggibili (maiuscolo solo iniziale, parentesi esplicativa) OK');

  // codici ATECO multipli: input libero separato da virgola -> array in STATE, senza duplicati
  setVal(q('#fRagioneSociale'), 'Multi Ateco Test SRL');
  setVal(q('#fPartitaIva'), '07777777777');
  setVal(q('#fTipo'), 'societa_capitali');
  setVal(q('#fAteco'), '62.01.00, 47.91.10 , 62.01.00, 63.11.20');
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  const clienteMultiAteco = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Multi Ateco Test SRL');
  assert(clienteMultiAteco, 'cliente di test per ATECO multipli non salvato');
  assert(Array.isArray(clienteMultiAteco.atecoCodici), 'atecoCodici deve essere un array');
  assert(JSON.stringify(clienteMultiAteco.atecoCodici) === JSON.stringify(['62.01.00','47.91.10','63.11.20']), `codici ATECO attesi ['62.01.00','47.91.10','63.11.20'] (con spazi tolti e duplicato rimosso), trovati ${JSON.stringify(clienteMultiAteco.atecoCodici)}`);
  console.log('=== Codici ATECO multipli: parsing da input libero (spazi tolti, duplicati rimossi) OK');

  // riapertura del form: il campo mostra i codici già separati da virgola, e la scheda cliente li elenca
  click(q(`[data-action="modifica-cliente"][data-id="${clienteMultiAteco.id}"]`));
  await wait(20);
  assert(q('#fAteco').value === '62.01.00, 47.91.10, 63.11.20', `riapertura form: campo ATECO atteso "62.01.00, 47.91.10, 63.11.20", trovato "${q('#fAteco').value}"`);
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteMultiAteco.id);
  await wait(20);
  assert(q('#content').innerHTML.includes('62.01.00, 47.91.10, 63.11.20'), 'la scheda cliente non elenca i codici ATECO multipli nell\'intestazione');
  assert(q('#content').innerHTML.includes(window.labelTipoCliente('societa_capitali')), 'la scheda cliente non mostra l\'etichetta leggibile del tipo cliente (mostra ancora il valore interno?)');
  console.log('=== Scheda cliente: codici ATECO multipli ed etichetta tipo cliente leggibile mostrati correttamente OK');

  // pulizia
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q(`[data-action="modifica-cliente"][data-id="${clienteMultiAteco.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-cliente"][data-id="${clienteMultiAteco.id}"]`));
  await wait(20);
  assert(!window.clienteById(clienteMultiAteco.id), 'cliente di test ATECO multipli non eliminato');

  // ---------- 3a-ter) Adempimenti applicabili: un'unica sezione in anagrafica, raggruppata per tipo ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);
  const legendTesti = qa('#formCliente fieldset legend').map(l => l.textContent);
  assert(legendTesti.includes('Adempimenti applicabili'), 'manca la fieldset unica "Adempimenti applicabili" in anagrafica');
  assert(!legendTesti.includes('Altri adempimenti periodici applicabili'), 'la vecchia fieldset separata "Altri adempimenti periodici applicabili" non deve più esistere');
  assert(!legendTesti.includes('Adempimenti annuali applicabili'), 'la vecchia fieldset separata "Adempimenti annuali applicabili" non deve più esistere');
  console.log('=== Anagrafica cliente: le due sezioni periodici/annuali sono state unificate in "Adempimenti applicabili" OK');

  // dentro la sezione unica, i checkbox periodici (data-flag) e annuali (data-annuale) convivono,
  // raggruppati per tipo (imposte dirette/indirette/ecc.), e "Dichiarazione IVA" compare una sola volta
  const nCheckboxFlag = qa('#formCliente [data-flag]').length;
  const nCheckboxAnnuale = qa('#formCliente [data-annuale]').length;
  assert(nCheckboxFlag === window.FLAG_SEMPLICI.length, `attesi ${window.FLAG_SEMPLICI.length} checkbox periodici (solo FLAG_SEMPLICI: dirittoCamerale non ha più un checkbox periodico dedicato, è applicabile solo tramite il checkbox annuale), trovati ${nCheckboxFlag}`);
  assert(!q('#formCliente [data-flag="dirittoCamerale"]'), 'non deve più esistere un checkbox periodico per "dirittoCamerale" (vive solo nell\'annuale DIRITTO_CAMERALE)');
  assert(!q('#formCliente [data-flag="vidimazione"]'), 'non deve più esistere un checkbox periodico per "vidimazione" (vive solo nell\'annuale VIDIMAZIONE_LIBRI)');
  assert(q('#formCliente #selDirittoCamScelta'), 'il selettore "data scelta" per il diritto camerale deve restare (serve a calcolare la scadenza dell\'adempimento annuale)');
  assert(nCheckboxAnnuale === window.catalogoAnnualeAttivo().length, `attesi ${window.catalogoAnnualeAttivo().length} checkbox annuali, trovati ${nCheckboxAnnuale}`);
  assert(!q('#formCliente [data-flag="dichiarazioneIva"]'), 'non deve più esistere un checkbox periodico per "dichiarazioneIva"');
  const labelTesti = qa('#formCliente .checkline').map(l => l.textContent.trim());
  const nDichiarazioneIva = labelTesti.filter(t => t.startsWith('Dichiarazione IVA')).length;
  assert(nDichiarazioneIva === 1, `"Dichiarazione IVA" deve comparire una sola volta in anagrafica, trovata ${nDichiarazioneIva} volte`);
  // Il titolo del gruppo ora contiene anche il badge "N/M selezionati" (nodo <span> a parte):
  // isoliamo il solo testo del nome categoria dal primo nodo di testo, escludendo lo span.
  const gruppiTitoli = qa('#formCliente .adm-gruppo-titolo').map(el => el.firstChild.textContent.trim());
  assert(gruppiTitoli.length > 1, 'gli adempimenti dovrebbero essere raggruppati in più di un sottogruppo per tipo');
  assert(new Set(gruppiTitoli).size === gruppiTitoli.length, 'i titoli dei gruppi di adempimenti non devono ripetersi');
  gruppiTitoli.forEach(t => assert(window.TIPI_ADEMPIMENTO.includes(t), `titolo di gruppo "${t}" non fa parte della tassonomia TIPI_ADEMPIMENTO`));
  qa('#formCliente .adm-gruppo-cnt').forEach(el => assert(/^\d+\/\d+ selezionati$/.test(el.textContent), `il badge di conteggio del gruppo dovrebbe avere la forma "N/M selezionati", trovato "${el.textContent}"`));
  qa('#formCliente .adm-sotto-titolo').forEach(el => assert(/^(Ricorrenti|Annuali) \d+\/\d+$/.test(el.textContent.replace(/\s+/g,' ').trim()), `la sotto-sezione dovrebbe avere la forma "Ricorrenti/Annuali N/M", trovato "${el.textContent}"`));
  console.log(`=== Adempimenti applicabili raggruppati per tipo (${gruppiTitoli.join(', ')}), con sotto-sezioni Ricorrenti/Annuali e contatori di selezione, "Dichiarazione IVA" compare una sola volta OK`);

  // I contatori devono aggiornarsi dal vivo quando si spunta/toglie una voce, non solo al riapertura del modale
  {
    const primoCheckbox = q('#formCliente [data-flag]') || q('#formCliente [data-annuale]');
    assert(primoCheckbox, 'serve almeno un checkbox di adempimento per testare l\'aggiornamento live dei contatori');
    const gruppoDelCheckbox = primoCheckbox.closest('.adm-gruppo');
    const cntEl = gruppoDelCheckbox.querySelector('.adm-gruppo-cnt');
    const prima = cntEl.textContent;
    const eraSpuntato = primoCheckbox.checked;
    primoCheckbox.checked = !eraSpuntato;
    fire(primoCheckbox, 'change');
    await wait(10);
    const dopo = cntEl.textContent;
    assert(dopo !== prima, `il contatore del gruppo dovrebbe aggiornarsi subito dopo aver spuntato/tolto una voce (era "${prima}", rimasto "${dopo}")`);
    primoCheckbox.checked = eraSpuntato; // ripristina per non alterare gli assert successivi sul form
    fire(primoCheckbox, 'change');
    await wait(10);
    assert(cntEl.textContent === prima, 'il contatore dovrebbe tornare al valore originale dopo aver ripristinato la spunta');
    console.log('=== Contatori "N/M selezionati" degli adempimenti si aggiornano dal vivo al change, senza bisogno di riaprire il modale OK');
  }
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // migrazioni per dati salvati prima di queste modifiche: tipo:'società' legacy e ateco stringa singola
  const clienteLegacyMigraz = { id: 'cli_legacy_test', ragioneSociale: 'Legacy SRL', tipo: 'società', ateco: '62.01.00' };
  const statoFinto = { clienti: [clienteLegacyMigraz] };
  const nMigratiTipo = window.migraTipoClienteLegacy(statoFinto);
  assert(nMigratiTipo === 1 && clienteLegacyMigraz.tipo === 'societa_capitali', `migrazione tipo cliente legacy fallita: tipo="${clienteLegacyMigraz.tipo}"`);
  const nMigratiAteco = window.migraAtecoClienteLegacy(statoFinto);
  assert(nMigratiAteco === 1 && JSON.stringify(clienteLegacyMigraz.atecoCodici) === JSON.stringify(['62.01.00']), `migrazione ATECO legacy fallita: atecoCodici=${JSON.stringify(clienteLegacyMigraz.atecoCodici)}`);
  // idempotenza: un cliente già con atecoCodici[] non viene ritoccato
  const nMigratiAtecoSeconda = window.migraAtecoClienteLegacy(statoFinto);
  assert(nMigratiAtecoSeconda === 0, 'la migrazione ATECO non è idempotente: ha ritoccato un cliente già migrato');
  console.log('=== Migrazione dati legacy (tipo cliente raggruppato -> forma specifica, ateco stringa -> array) OK, idempotente');

  // migrazione: tre adempimenti (Dichiarazione IVA, Vidimazione libri sociali, Diritto camerale)
  // non devono più comparire sia tra i periodici sia tra gli annuali — chi ha già uno stato
  // salvato coi vecchi flag periodici va migrato sull'annuale corrispondente (senza perdita di
  // dati), rimuovendo flag e voce di catalogo legacy. migraAdempimentiDuplicati copre tutti e tre
  // via ADEMPIMENTI_DUPLICATI_LEGACY, con lo stesso meccanismo generico.
  assert(window.ADEMPIMENTI_DUPLICATI_LEGACY.length === 3, `attesi 3 adempimenti duplicati noti (IVA, vidimazione, diritto camerale), trovati ${window.ADEMPIMENTI_DUPLICATI_LEGACY.length}`);
  const clienteVecchiFlag = {
    id: 'cli_legacy_dup', ragioneSociale: 'Legacy Duplicati SRL',
    flags: { dichiarazioneIva: true, vidimazione: true, dirittoCamerale: true, lipe: true },
    adempimentiAnnualiApplicabili: ['CU'],
  };
  const statoFintoDup = {
    clienti: [clienteVecchiFlag],
    catalogoPeriodico: [
      { id: 'dichiarazioneIva', flag: 'dichiarazioneIva', nome: 'Dichiarazione IVA', attivo: true, occorrenze: [] },
      { id: 'vidimazione', flag: 'vidimazione', nome: 'Vidimazione libri sociali', attivo: true, occorrenze: [] },
      { id: 'lipe', flag: 'lipe', nome: 'LIPE', attivo: true, occorrenze: [] },
    ],
  };
  const nMigratiDup = window.migraAdempimentiDuplicati(statoFintoDup);
  assert(nMigratiDup >= 5, `migrazione adempimenti duplicati: attesi almeno 5 elementi migrati (3 flag cliente + 2 voci catalogo periodico, dirittoCamerale non era nel catalogo), trovati ${nMigratiDup}`);
  assert(!('dichiarazioneIva' in clienteVecchiFlag.flags) && !('vidimazione' in clienteVecchiFlag.flags) && !('dirittoCamerale' in clienteVecchiFlag.flags), 'tutti e tre i flag legacy dovevano essere rimossi dal cliente dopo la migrazione');
  assert(clienteVecchiFlag.flags.lipe === true, 'la migrazione non deve toccare gli altri flag del cliente (lipe)');
  ['DICH_IVA_ANNUALE', 'VIDIMAZIONE_LIBRI', 'DIRITTO_CAMERALE'].forEach(chiave => {
    assert(clienteVecchiFlag.adempimentiAnnualiApplicabili.includes(chiave), `la migrazione deve aggiungere ${chiave} tra gli adempimenti annuali applicabili, per non perdere il dato`);
  });
  assert(clienteVecchiFlag.adempimentiAnnualiApplicabili.includes('CU'), 'la migrazione non deve toccare gli adempimenti annuali già presenti (CU)');
  assert(!statoFintoDup.catalogoPeriodico.some(d => d.id === 'dichiarazioneIva' || d.id === 'vidimazione'), 'le voci di catalogo periodico legacy dovevano essere rimosse');
  assert(statoFintoDup.catalogoPeriodico.some(d => d.id === 'lipe'), 'la migrazione non deve toccare le altre voci del catalogo periodico (lipe)');
  // idempotenza
  const nMigratiDupSeconda = window.migraAdempimentiDuplicati(statoFintoDup);
  assert(nMigratiDupSeconda === 0, 'la migrazione adempimenti duplicati non è idempotente: ha ritoccato uno stato già migrato');
  console.log('=== Migrazione adempimenti duplicati (Dichiarazione IVA, Vidimazione, Diritto camerale: periodico -> solo annuale) OK, idempotente, nessuna perdita di dati');

  // scadenza dinamica per adempimento annuale: DIRITTO_CAMERALE non ha scadenzaDefault fissa in
  // catalogo, ma la calcola da cliente.dirittoCameraleScelta tramite SCADENZA_DINAMICA_ANNUALE
  // (stessa logica/date che prima usava la scadenza periodica ora rimossa)
  assert(typeof window.SCADENZA_DINAMICA_ANNUALE.DIRITTO_CAMERALE === 'function', 'manca il resolver dinamico per DIRITTO_CAMERALE');
  const clienteDCTest = { dirittoCameraleScelta: '20/07 (proroga ISA/forfettari)' };
  const scadDCTest = window.SCADENZA_DINAMICA_ANNUALE.DIRITTO_CAMERALE(clienteDCTest, window.getSTATE().annoCorrente);
  assert(scadDCTest === window.dataScadenza(window.getSTATE().annoCorrente, 7, 20), `scadenza dinamica diritto camerale attesa dal 20/7 (proroga), trovata ${scadDCTest}`);
  const clienteDCVuoto = { dirittoCameraleScelta: null };
  assert(window.SCADENZA_DINAMICA_ANNUALE.DIRITTO_CAMERALE(clienteDCVuoto, window.getSTATE().annoCorrente) === null, 'senza una scelta impostata, la scadenza dinamica del diritto camerale deve restare null (non generare una data a caso)');
  console.log('=== Scadenza dinamica DIRITTO_CAMERALE calcolata correttamente da dirittoCameraleScelta OK');

  // spot-check sui clienti demo: le forme giuridiche più comuni sono state riclassificate correttamente
  const srlDemo = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Rossi Impianti Elettrici SRL');
  assert(srlDemo && srlDemo.tipo === 'societa_capitali', `Rossi Impianti SRL atteso tipo "societa_capitali", trovato "${srlDemo && srlDemo.tipo}"`);
  const sncDemo = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Bianchi Costruzioni SNC');
  assert(sncDemo && sncDemo.tipo === 'societa_persone', `Bianchi Costruzioni SNC atteso tipo "societa_persone", trovato "${sncDemo && sncDemo.tipo}"`);
  const assDemo = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Associazione Sportiva Dilettantistica Vicenza Nord');
  assert(assDemo && assDemo.tipo === 'associazione', `Associazione Sportiva atteso tipo "associazione", trovato "${assDemo && assDemo.tipo}"`);
  console.log('=== Clienti demo: forme giuridiche riclassificate correttamente (SRL->societa_capitali, SNC->societa_persone, Associazione->associazione) OK');

  // ---------- 3b) Nuovi tipi di scadenza (F24 Paghe, Enasarco/FIRR, INPS Agricoltura) ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);
  const chkPaghe = qa('[data-flag="paghe"]');
  assert(chkPaghe.length === 1, `atteso un solo checkbox "paghe" nel form (niente doppioni), trovati ${chkPaghe.length}`);
  const chkEnasarco = qa('[data-flag="enasarco"]');
  assert(chkEnasarco.length === 1, `atteso un solo checkbox "enasarco" nel form, trovati ${chkEnasarco.length}`);
  const optAgricoltura = qa('#fPrevidenza option').find(o => o.textContent === 'Agricoltura (CD/IAP)');
  assert(optAgricoltura, 'opzione previdenza "Agricoltura (CD/IAP)" non trovata nel select');
  setVal(q('#fRagioneSociale'), 'Test Nuovi Flag SRL');
  setVal(q('#fPartitaIva'), '08888888888');
  setVal(q('#fPrevidenza'), 'Agricoltura (CD/IAP)');
  setChecked(chkPaghe[0], true);
  setChecked(chkEnasarco[0], true);
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  const clienteNuoviFlag = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Test Nuovi Flag SRL');
  assert(clienteNuoviFlag, 'cliente di test per i nuovi flag non salvato');
  assert(clienteNuoviFlag.flags.paghe === true, 'flag paghe non salvato');
  assert(clienteNuoviFlag.flags.enasarco === true, 'flag enasarco non salvato');
  assert(clienteNuoviFlag.previdenza === 'Agricoltura (CD/IAP)', 'previdenza Agricoltura non salvata');
  const scadNuoviFlag = window.derivati().periodiche.filter(s => s.clienteId === clienteNuoviFlag.id);
  const nPaghe = scadNuoviFlag.filter(s => s.tipo === 'F24 Paghe dipendenti').length;
  const nEnasarco = scadNuoviFlag.filter(s => s.tipo === 'Enasarco e FIRR (agenti di commercio)').length;
  const nAgricoltura = scadNuoviFlag.filter(s => s.tipo === 'INPS Agricoltura (CD/IAP)').length;
  assert(nPaghe === 12, `attese 12 scadenze F24 Paghe, trovate ${nPaghe}`);
  assert(nEnasarco === 5, `attese 5 scadenze Enasarco/FIRR (4 trim + 1 FIRR), trovate ${nEnasarco}`);
  assert(nAgricoltura === 4, `attese 4 scadenze INPS Agricoltura, trovate ${nAgricoltura}`);
  console.log(`=== Nuovi flag OK: F24 Paghe=${nPaghe}, Enasarco/FIRR=${nEnasarco}, INPS Agricoltura=${nAgricoltura}`);
  // pulizia: elimina il cliente di test
  click(q(`[data-action="modifica-cliente"][data-id="${clienteNuoviFlag.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-cliente"][data-id="${clienteNuoviFlag.id}"]`));
  await wait(20);
  assert(!window.clienteById(clienteNuoviFlag.id), 'cliente di test nuovi flag non eliminato');

  // ---------- 4) Scadenze periodiche: simula gestione durante l'anno ----------
  click(q('[data-nav="scadenze"]'));
  await wait(20);
  setVal(q('[data-action="scad-filtro-bucket"]'), 'Tutti');
  await wait(20);
  let righeScad = qa('[data-action="scad-cambia-stato"]');
  assert(righeScad.length > 40, `attese molte righe scadenze, trovate ${righeScad.length}`);
  // marca le prime 5 come "Inviato telematicamente" (simula lavoro fatto durante l'anno)
  for (let i = 0; i < 5; i++) {
    setVal(righeScad[i], 'Inviato telematicamente');
    await wait(10);
    righeScad = qa('[data-action="scad-cambia-stato"]'); // il DOM viene ricreato ad ogni render
  }
  const idsMarcati = window.derivati().periodiche.filter(s => s.stato === 'Inviato telematicamente').map(s=>s.id);
  assert(idsMarcati.length >= 5, `attese almeno 5 scadenze marcate Inviato telematicamente, trovate ${idsMarcati.length}`);
  // verifica che la data di completamento sia stata impostata in automatico
  const primaMarcata = window.getSTATE().scadenzeOverrides[idsMarcati[0]];
  assert(primaMarcata.dataCompletamento, 'la data di completamento non è stata impostata automaticamente');
  console.log('=== 5 scadenze marcate "Inviato telematicamente", data completamento auto-impostata:', primaMarcata.dataCompletamento);

  // marca una scadenza come "Errore" e verifica badge/colore applicato (classe css)
  const primaRiga = qa('[data-action="scad-cambia-stato"]')[5];
  const idErrore = primaRiga.dataset.id;
  setVal(primaRiga, 'Errore');
  await wait(20);
  const selectErrore = qa('select.statoSel.stato-errore');
  assert(selectErrore.length >= 1, 'nessuna select con classe stato-errore trovata dopo aver marcato una scadenza in errore');
  assert(window.getSTATE().scadenzeOverrides[idErrore].stato === 'Errore', 'stato Errore non salvato in STATE');
  console.log('=== Stato "Errore" applicato e colorazione select aggiornata correttamente');

  // scrivi una nota su una scadenza e verifica persistenza (senza perdita al render)
  const inputNota = qa('[data-action="scad-cambia-nota"]')[0];
  const idNota = inputNota.dataset.id;
  setVal(inputNota, 'verificato con cliente via mail');
  await wait(20);
  assert(window.getSTATE().scadenzeOverrides[idNota].nota === 'verificato con cliente via mail', 'nota non salvata correttamente');
  console.log('=== Nota su scadenza salvata correttamente');

  // importo per scadenza (ispirato al "readiness" di Scadero: quante scadenze in arrivo hanno
  // già l'importo impostato) — round-trip via input, persistenza, e KPI di readiness in vista
  const inputImporto = qa('[data-action="scad-cambia-importo"]')[0];
  const idImporto = inputImporto.dataset.id;
  setVal(inputImporto, '1234.56');
  await wait(20);
  assert(window.getSTATE().scadenzeOverrides[idImporto].importo === 1234.56, `importo non salvato correttamente, trovato ${window.getSTATE().scadenzeOverrides[idImporto].importo}`);
  const scadConImporto = window.derivati().periodiche.find(s => s.id === idImporto);
  assert(scadConImporto && scadConImporto.importo === 1234.56, 'il motore di generazione non rilegge l\'importo salvato nell\'override');
  // svuotare il campo deve tornare a importo null, non 0 o stringa vuota
  setVal(inputImporto, '');
  await wait(20);
  assert(window.getSTATE().scadenzeOverrides[idImporto].importo === null, 'svuotare il campo importo deve salvare null, non azzerarlo o lasciarlo stringa');
  console.log('=== Importo su scadenza: round-trip salva/rilegge/svuota correttamente OK');

  // readiness: imposta l'importo su TUTTE le scadenze "in scadenza" e verifica che il badge KPI arrivi al 100%
  const { inScadenza: inScadPrimaReadiness } = window.classificaScadenze(window.derivati().periodiche, window.oggiISO());
  inScadPrimaReadiness.forEach(s => window.aggiornaScadenza(s.id, { importo: 100 }));
  window.render();
  await wait(20);
  if (inScadPrimaReadiness.length > 0) {
    assert(q('#content').innerHTML.includes('100%'), 'il badge di readiness non mostra 100% dopo aver impostato l\'importo su tutte le scadenze in scadenza');
    assert(q('#content').innerHTML.includes(`${inScadPrimaReadiness.length}/${inScadPrimaReadiness.length}`), 'il badge di readiness non mostra il conteggio corretto (N/N)');
  }
  console.log(`=== Readiness scadenze: badge KPI coerente col conteggio (${inScadPrimaReadiness.length} scadenze in scadenza) OK`);

  // storico solleciti: apri il modal su una scadenza, verifica stato vuoto, registra un sollecito,
  // verifica che compaia nello storico e che il badge col conteggio si aggiorni nella tabella
  const primaRigaSolleciti = qa('[data-action="scad-apri-solleciti"]')[0];
  const idSolleciti = primaRigaSolleciti.dataset.id;
  assert(window.getSTATE().scadenzeOverrides[idSolleciti]?.solleciti === undefined || window.getSTATE().scadenzeOverrides[idSolleciti].solleciti.length === 0, 'precondizione: la scadenza di test non deve avere già solleciti');
  click(primaRigaSolleciti);
  await wait(20);
  assert(q('#formSollecito'), 'form/modal storico solleciti non renderizzato');
  assertNoAutoSubmit(q('#formSollecito'), 'formSollecito');
  assert(window.document.body.textContent.includes('Nessun sollecito registrato'), 'stato vuoto storico solleciti non mostrato correttamente');
  setVal(q('#solCanale'), 'Telefono');
  setVal(q('#solNota'), 'richiamare la prossima settimana');
  click(q('[data-action="salva-sollecito"]'));
  await wait(20);
  assert(window.getSTATE().scadenzeOverrides[idSolleciti].solleciti.length === 1, 'sollecito non salvato in STATE dopo il click su "Registra sollecito"');
  assert(window.getSTATE().scadenzeOverrides[idSolleciti].solleciti[0].canale === 'Telefono', 'canale del sollecito non salvato correttamente');
  assert(window.document.body.textContent.includes('richiamare la prossima settimana'), 'la nota del sollecito appena registrato non compare nello storico del modal (che deve restare aperto e aggiornarsi)');
  const badgeSolleciti = qa('[data-action="scad-apri-solleciti"]').find(b => b.dataset.id === idSolleciti);
  assert(badgeSolleciti && badgeSolleciti.textContent.includes('1'), 'il badge del conteggio solleciti nella tabella non si è aggiornato a 1');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Storico solleciti: apertura, registrazione, aggiornamento storico e badge conteggio OK');

  // ---------- 5) Ritenute d'acconto: aggiungi righe e verifica cumulo/scadenza F24 ----------
  click(q('[data-nav="ritenute"]'));
  await wait(20);
  const clientePerRitenute = window.getSTATE().clienti[3]; // Neri Consulenze (gestione separata)
  click(q('[data-action="nuova-ritenuta"]'));
  await wait(20);
  assertNoAutoSubmit(q('#formRitenuta'), 'formRitenuta');
  setVal(q('#rCliente'), clientePerRitenute.id);
  setVal(q('#rPercipiente'), 'Fornitore Test Rossi');
  setVal(q('#rDataFattura'), `${window.getSTATE().annoCorrente}-05-03`);
  setVal(q('#rDataPagamento'), `${window.getSTATE().annoCorrente}-05-10`);
  setVal(q('#rImporto'), '25');
  click(q('[data-action="salva-ritenuta"]'));
  await wait(20);
  const nuovaRiga = window.getSTATE().ritenuteRighe.find(r => r.percipiente === 'Fornitore Test Rossi');
  assert(nuovaRiga, 'riga ritenuta non salvata');
  assert(nuovaRiga.importo === 25, 'importo ritenuta non salvato correttamente');
  console.log('=== Nuova ritenuta registrata:', nuovaRiga.percipiente, '€', nuovaRiga.importo);

  // cambia stato di una ritenuta esistente — trova la RIGA giusta cercando il testo del
  // percipiente appena creato, non il primo <select> del DOM: da quando esiste il placeholder
  // senza data pagamento (che si ordina per primo in tabella, vedi sotto) il primo <select> in
  // pagina potrebbe non essere più quello di questa riga.
  const rigaNuovaRitenuta = qa('tr').find(tr => tr.textContent.includes('Fornitore Test Rossi'));
  assert(rigaNuovaRitenuta, 'riga della tabella per la ritenuta appena creata non trovata');
  const selStatoRit = rigaNuovaRitenuta.querySelector('[data-action="rit-cambia-stato"]');
  setVal(selStatoRit, 'Pagata');
  await wait(20);
  console.log('=== Stato ritenuta modificato a "Pagata"');

  // ---------- 5b) Ritenute d'acconto: placeholder senza data di pagamento ----------
  // Una ritenuta può essere registrata senza sapere ancora quando il cliente pagherà la fattura:
  // resta visibile come promemoria ("In attesa di pagamento") ma non deve generare NESSUNA
  // scadenza F24 finché non le si imposta una data — a quel punto rientra nel calcolo normale.
  {
    const primaDelPlaceholder = window.derivati().ritenuteScad.length;
    click(q('[data-action="nuova-ritenuta"]'));
    await wait(20);
    setVal(q('#rCliente'), clientePerRitenute.id);
    setVal(q('#rPercipiente'), 'Fornitore Placeholder Test');
    setVal(q('#rDataFattura'), `${window.getSTATE().annoCorrente}-08-01`);
    // NON impostiamo #rDataPagamento: deve poter salvare comunque (non più required)
    setVal(q('#rImporto'), '99');
    click(q('[data-action="salva-ritenuta"]'));
    await wait(20);
    const rigaPlaceholder = window.getSTATE().ritenuteRighe.find(r => r.percipiente === 'Fornitore Placeholder Test');
    assert(rigaPlaceholder, 'la ritenuta senza data di pagamento dovrebbe comunque salvarsi come placeholder');
    assert(rigaPlaceholder.dataPagamento === null, 'un placeholder dovrebbe avere dataPagamento null');
    assert(rigaPlaceholder.statoRit === 'In attesa di pagamento', `un placeholder dovrebbe avere stato "In attesa di pagamento", trovato "${rigaPlaceholder.statoRit}"`);
    assert(window.derivati().ritenuteScad.length === primaDelPlaceholder, 'un placeholder senza data di pagamento non deve generare nessuna scadenza F24');

    click(q('[data-nav="ritenute"]'));
    await wait(20);
    const trPlaceholder = qa('tr').find(tr => tr.textContent.includes('Fornitore Placeholder Test'));
    assert(trPlaceholder, 'riga del placeholder non trovata in tabella');
    assert(trPlaceholder.textContent.includes('in attesa di pagamento'), 'la riga placeholder dovrebbe mostrare il badge "in attesa di pagamento" al posto della scadenza F24');
    const inputDataPag = trPlaceholder.querySelector('[data-action="rit-imposta-pagamento"]');
    assert(inputDataPag, 'la cella data pagamento di un placeholder dovrebbe essere un input di tipo data, non testo statico');
    const selStatoPlaceholder = trPlaceholder.querySelector('[data-action="rit-cambia-stato"]');
    assert(selStatoPlaceholder && selStatoPlaceholder.disabled, 'il cambio stato dovrebbe essere disabilitato finché il placeholder non ha una data di pagamento');

    // il cliente paga: impostiamo la data di pagamento dalla tabella
    setVal(inputDataPag, `${window.getSTATE().annoCorrente}-08-14`);
    await wait(20);
    const rigaDopoPagamento = window.getSTATE().ritenuteRighe.find(r => r.percipiente === 'Fornitore Placeholder Test');
    assert(rigaDopoPagamento.dataPagamento === `${window.getSTATE().annoCorrente}-08-14`, 'la data di pagamento impostata dalla tabella non è stata salvata');
    assert(rigaDopoPagamento.statoRit === 'Da pagare', `dopo aver impostato la data di pagamento lo stato dovrebbe tornare "Da pagare", trovato "${rigaDopoPagamento.statoRit}"`);
    assert(window.derivati().ritenuteScad.length === primaDelPlaceholder + 1, 'dopo aver impostato la data di pagamento dovrebbe comparire esattamente una nuova scadenza F24 in più');
    console.log('=== Ritenuta placeholder (senza data pagamento): salvabile, nessuna scadenza generata, badge dedicato, cambio stato disabilitato; impostando la data dalla tabella diventa una riga normale e genera la scadenza F24 OK');

    // pulizia: rimuovi le righe di test per non alterare i dati demo per i test successivi
    window.getSTATE().ritenuteRighe = window.getSTATE().ritenuteRighe.filter(r => !['Fornitore Test Rossi','Fornitore Placeholder Test'].includes(r.percipiente));
    window.salvaStato(); window.render();
    await wait(20);
  }

  // ---------- 6) Adempimenti annuali: espandi, completa sotto-task ----------
  click(q('[data-nav="annuali"]'));
  await wait(20);
  const primoAnnuale = q('[data-action="ann-toggle-expand"]');
  assert(primoAnnuale, 'nessun adempimento annuale trovato in lista');
  const idAnnuale = primoAnnuale.dataset.id;
  click(primoAnnuale);
  await wait(20);
  let checkSotto = qa(`[data-action="ann-toggle-sotto"][data-id="${idAnnuale}"]`);
  assert(checkSotto.length > 0, 'sotto-adempimenti non visualizzati dopo espansione');
  setChecked(checkSotto[0], true);
  await wait(20);
  const annualeAgg = window.derivati().annuali.find(a => a.id === idAnnuale);
  assert(annualeAgg.sotto[0].completato === true, 'sotto-adempimento non marcato completato');
  assert(annualeAgg.percentuale > 0, 'percentuale adempimento annuale non aggiornata dopo completamento sotto-task');
  console.log(`=== Sotto-adempimento completato: "${annualeAgg.sotto[0].nome}" — avanzamento ora ${annualeAgg.percentuale}%`);

  // completa tutti i sotto-adempimenti e verifica che risulti "Completato"
  // (il DOM viene ricreato ad ogni render: ri-otteniamo gli elementi freschi ad ogni giro,
  // altrimenti l'evento su un nodo staccato dal document non risale fino al listener delegato)
  for (let guard = 0; guard < 10; guard++) {
    const nonSpuntati = qa(`[data-action="ann-toggle-sotto"][data-id="${idAnnuale}"]`).filter(cb => !cb.checked);
    if (nonSpuntati.length === 0) break;
    setChecked(nonSpuntati[0], true);
    await wait(15);
  }
  const annualeCompleto = window.derivati().annuali.find(a => a.id === idAnnuale);
  assert(annualeCompleto.completato === true, 'adempimento annuale non risulta completato al 100%');
  console.log('=== Adempimento annuale completato al 100%:', annualeCompleto.tipoNome, '-', window.nomeCliente(annualeCompleto.clienteId));

  // ---------- 7) Onboarding: seleziona cliente e completa checklist ----------
  click(q('[data-nav="onboarding"]'));
  await wait(20);
  const righeOnboard = qa('[data-action="onboard-seleziona"]');
  assert(righeOnboard.length >= 20, `lista onboarding clienti incompleta (${righeOnboard.length})`);
  // seleziona il cliente forfettario (onboarding parziale nel demo)
  const clienteForfettario = window.getSTATE().clienti.find(c => c.regimeFiscale === 'Forfettario');
  click(q(`[data-action="onboard-seleziona"][data-id="${clienteForfettario.id}"]`));
  await wait(20);
  const checkOnboard = qa('[data-action="onboard-toggle"]');
  assert(checkOnboard.length === 9, `attese 9 voci onboarding, trovate ${checkOnboard.length}`);
  for (let guard = 0; guard < 12; guard++) {
    const nonSpuntate = qa('[data-action="onboard-toggle"]').filter(c => !c.checked);
    if (nonSpuntate.length === 0) break;
    setChecked(nonSpuntate[0], true);
    await wait(10);
  }
  const pctFinale = window.percentualeOnboarding(window.getSTATE().onboarding[clienteForfettario.id]);
  assert(pctFinale === 100, `onboarding atteso 100%, trovato ${pctFinale}%`);
  console.log('=== Onboarding completato al 100% per', clienteForfettario.ragioneSociale);

  // ---------- 7-bis) Antiriciclaggio (task #119): lista, selezione, checklist, rischio, date, storico ----------
  click(q('[data-nav="antiriciclaggio"]'));
  await wait(20);
  const attiviAml = window.getSTATE().clienti.filter(c => c.stato !== 'cessato');
  const righeAml = qa('[data-action="aml-seleziona"]');
  assert(righeAml.length >= 20, `lista antiriciclaggio clienti incompleta (${righeAml.length})`);

  // il seed demo assegna un fascicolo con rischio "Alto" e revisione scaduta a un cliente preciso:
  // lo usiamo per verificare che la selezione mostri i dati corretti (non solo un fascicolo vuoto).
  const clienteRischioAltoId = Object.keys(window.getSTATE().antiriciclaggio).find(id => window.getSTATE().antiriciclaggio[id].profiloRischio === 'Alto');
  assert(clienteRischioAltoId, 'nessun cliente demo con profilo di rischio "Alto" da usare per il test');
  click(q(`[data-action="aml-seleziona"][data-id="${clienteRischioAltoId}"]`));
  await wait(20);
  const selRischio = q('[data-action="aml-cambia-rischio"]');
  assert(selRischio && selRischio.value === 'Alto', 'selezionando il cliente a rischio alto il select profilo di rischio non mostra "Alto"');
  assert(q('#amlBadgeRevisione') && q('#amlBadgeRevisione').textContent.includes('Scaduta'), 'revisione scaduta non segnalata con badge "Scaduta"');
  console.log('=== Antiriciclaggio: selezione cliente mostra profilo di rischio e stato revisione corretti');

  // ---------- 7-bis-bis) Documenti antiriciclaggio nel fascicolo cliente (task #126) ----------
  // Il cliente a rischio "Alto" selezionato sopra è lo stesso a cui il seed demo (task #127) ha
  // agganciato 2 documenti AML (Dichiarazione cliente + Nota di accettazione): li verifichiamo qui,
  // ancora con quel cliente selezionato, prima di passare ad altri clienti più sotto.
  const docAmlDemoCliente = window.getSTATE().preventivi.filter(p => p.clienteId === clienteRischioAltoId && window.categoriaEAml(p.categoria));
  assert(docAmlDemoCliente.length === 2, `attesi 2 documenti AML demo per il cliente a rischio alto, trovati ${docAmlDemoCliente.length}`);
  const righeDocAml = qa('[data-action="apri-preventivo"]');
  assert(righeDocAml.length === 2, `la sezione Documenti del fascicolo non mostra i 2 documenti AML demo (trovati ${righeDocAml.length} pulsanti "Apri")`);
  assert(q('body').textContent.includes('AML - Dichiarazione cliente') && q('body').textContent.includes('AML - Nota di accettazione incarico'), 'le categorie dei documenti AML demo non compaiono nel fascicolo');
  // questi stessi documenti NON devono comparire tra i documenti non-AML (isolamento dalla vista Preventivi e mandati)
  assert(!window.getSTATE().preventivi.filter(p => !window.categoriaEAml(p.categoria)).some(p => p.id === docAmlDemoCliente[0].id), 'un documento AML compare per errore anche tra i documenti non-AML');
  assert(window.statiPerCategoriaDocumento(docAmlDemoCliente[0].categoria).length === 2, 'un documento AML deve avere solo 2 stati possibili (Bozza/Firmato)');

  // crea un nuovo documento AML dal fascicolo: il cliente deve restare bloccato su quello selezionato
  click(q('[data-action="nuovo-preventivo"][data-aml="1"]'));
  await wait(20);
  assert(q('#formPreventivo'), 'form nuovo documento AML non renderizzato dal fascicolo cliente');
  assert(!q('#pCliente'), 'il cliente non dovrebbe essere selezionabile quando il documento AML si crea dal fascicolo di un cliente specifico');
  assert(q('.modal').dataset.contestoAml === '1', 'il contesto AML del modale non risulta impostato');
  assert(q('.modal').dataset.clienteBloccato === '1', 'il documento aperto dal fascicolo di un cliente specifico dovrebbe risultare bloccato su quel cliente');
  setVal(q('#pOggetto'), 'Test documento AML dal fascicolo');
  click(q('[data-action="salva-preventivo"]'));
  await wait(20);
  const nuovoDocAml = window.getSTATE().preventivi.find(p => p.oggetto === 'Test documento AML dal fascicolo');
  assert(nuovoDocAml, 'nuovo documento AML dal fascicolo non salvato in STATE');
  assert(nuovoDocAml.clienteId === clienteRischioAltoId, 'il documento AML creato dal fascicolo non è collegato al cliente selezionato');
  assert(window.categoriaEAml(nuovoDocAml.categoria), 'il modello scelto di default per un documento AML dal fascicolo non ha categoria AML');
  assert(q('body').textContent.includes('Test documento AML dal fascicolo'), 'il nuovo documento AML non compare nella sezione Documenti del fascicolo dopo il salvataggio');

  // pulizia
  click(q(`[data-action="elimina-preventivo"][data-id="${nuovoDocAml.id}"]`));
  await wait(20);
  assert(!window.getSTATE().preventivi.some(p => p.id === nuovoDocAml.id), 'documento AML di test non eliminato');
  console.log('=== Documenti antiriciclaggio nel fascicolo cliente: elenco demo, isolamento da Preventivi e mandati, creazione con cliente bloccato, eliminazione OK');

  // cliente senza fascicolo ancora aperto: deve crearsi al volo, vuoto, senza errori
  const clienteSenzaFascicolo = attiviAml.find(c => !window.getSTATE().antiriciclaggio[c.id]);
  assert(clienteSenzaFascicolo, 'nessun cliente demo senza fascicolo AML da usare per il test di creazione al volo');
  click(q(`[data-action="aml-seleziona"][data-id="${clienteSenzaFascicolo.id}"]`));
  await wait(20);
  assert(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id], 'il fascicolo non è stato creato al volo selezionando un cliente senza fascicolo');
  assert(window.percentualeAntiriciclaggio(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id]) === 0, 'un fascicolo appena creato dovrebbe essere a 0%');
  const checkAml = qa('[data-action="aml-toggle-checklist"]');
  assert(checkAml.length === 8, `attese 8 voci checklist antiriciclaggio, trovate ${checkAml.length}`);
  console.log('=== Antiriciclaggio: fascicolo creato al volo per un cliente senza dati pregressi, checklist a 8 voci');

  // completa la checklist e verifica che la percentuale salga fino al 100%
  for (let guard = 0; guard < 10; guard++) {
    const nonSpuntate = qa('[data-action="aml-toggle-checklist"]').filter(c => !c.checked);
    if (nonSpuntate.length === 0) break;
    setChecked(nonSpuntate[0], true);
    await wait(10);
  }
  const pctAmlFinale = window.percentualeAntiriciclaggio(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id]);
  assert(pctAmlFinale === 100, `checklist antiriciclaggio attesa 100%, trovata ${pctAmlFinale}%`);
  console.log('=== Antiriciclaggio: checklist completata al 100% per', clienteSenzaFascicolo.ragioneSociale);

  // cambia profilo di rischio, date di verifica/revisione, aggiunge una nota allo storico
  setVal(q('[data-action="aml-cambia-rischio"]'), 'Medio');
  await wait(20);
  assert(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id].profiloRischio === 'Medio', 'cambio profilo di rischio non salvato in STATE');
  const rigaAggiornata = q(`[data-action="aml-seleziona"][data-id="${clienteSenzaFascicolo.id}"]`);
  assert(rigaAggiornata.textContent.includes('Medio'), 'la riga cliente nella lista non riflette il nuovo profilo di rischio');

  setVal(q('[data-action="aml-cambia-verifica"]'), window.oggiISO());
  await wait(20);
  assert(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id].dataAdeguataVerifica === window.oggiISO(), 'data adeguata verifica non salvata');

  const revisioneFutura = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  setVal(q('[data-action="aml-cambia-revisione"]'), revisioneFutura);
  await wait(20);
  assert(window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id].scadenzaRevisione === revisioneFutura, 'scadenza revisione non salvata');
  assert(q('#amlBadgeRevisione') && q('#amlBadgeRevisione').textContent.includes('Nel termine'), 'revisione futura non segnalata come "Nel termine"');
  console.log('=== Antiriciclaggio: profilo di rischio e date di verifica/revisione aggiornati e riflessi nella UI');

  const amlStoricoPrimaLen = (window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id].storico || []).length;
  setVal(q('#amlNuovaNota'), 'Verifica rinnovata, documento di identità aggiornato.');
  click(q('[data-action="aml-aggiungi-nota"]'));
  await wait(20);
  const storicoAml = window.getSTATE().antiriciclaggio[clienteSenzaFascicolo.id].storico;
  assert(storicoAml.length === amlStoricoPrimaLen + 1, 'la nuova verifica non è stata aggiunta allo storico');
  assert(storicoAml[storicoAml.length - 1].testo === 'Verifica rinnovata, documento di identità aggiornato.', 'testo della verifica registrata non corrisponde');
  assert(q('body').textContent.includes('Verifica rinnovata, documento di identità aggiornato.'), 'la verifica appena aggiunta non compare nello storico visualizzato');
  console.log('=== Antiriciclaggio: nuova verifica aggiunta allo storico (append-only) e visualizzata');

  // KPI in cima alla vista: ricalcola dai dati correnti e confronta coi numeri mostrati
  const kpiAmlAttesi = {
    completi: attiviAml.filter(c => window.percentualeAntiriciclaggio(window.getSTATE().antiriciclaggio[c.id]) === 100).length,
    rischioAlto: attiviAml.filter(c => (window.getSTATE().antiriciclaggio[c.id]||{}).profiloRischio === 'Alto').length,
  };
  // Task #126: i KPI antiriciclaggio non usano più .kpi-grid .kpi .n (griglia a colonne, troppo
  // stretta nella colonna laterale da 280px) ma .kpi-riga .n (righe orizzontali etichetta+numero).
  const kpiAmlNumeri = qa('.kpi-riga .n').map(el => Number(el.textContent));
  assert(kpiAmlNumeri[0] === kpiAmlAttesi.completi, `KPI "fascicoli completi" atteso ${kpiAmlAttesi.completi}, mostrato ${kpiAmlNumeri[0]}`);
  assert(kpiAmlNumeri[1] === kpiAmlAttesi.rischioAlto, `KPI "clienti a rischio alto" atteso ${kpiAmlAttesi.rischioAlto}, mostrato ${kpiAmlNumeri[1]}`);
  console.log('=== Antiriciclaggio: contatori KPI coerenti con i dati correnti');

  // collegamento dalla scheda cliente 360°: deve navigare alla vista Antiriciclaggio con quel
  // cliente già selezionato (stesso pattern di "schcli-apri-onboarding", task #115/#116)
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteRischioAltoId);
  await wait(20);
  click(q('[data-action="schcli-apri-aml"]'));
  await wait(20);
  const sectionTitleAml = q('.section-title');
  assert(sectionTitleAml && sectionTitleAml.textContent.includes(window.nomeCliente(clienteRischioAltoId)), 'il collegamento dalla scheda cliente non apre il fascicolo del cliente giusto');
  assert(q('[data-action="aml-cambia-rischio"]').value === 'Alto', 'il fascicolo aperto dalla scheda cliente non mostra i dati del cliente corretto');
  console.log('=== Antiriciclaggio: collegamento rapido dalla scheda cliente 360° apre il fascicolo del cliente giusto');

  // ---------- 8) Calendario: naviga tutti i 12 mesi senza errori ----------
  click(q('[data-nav="calendario"]'));
  await wait(20);
  for (let m = 0; m < 12; m++) {
    click(q('[data-action="cal-next"]'));
    await wait(15);
    assert(qa('.cal-day').length >= 28, `griglia calendario mese ${m} non renderizzata correttamente`);
  }
  click(q('[data-action="cal-oggi"]'));
  await wait(20);
  console.log('=== Calendario: navigati 12 mesi senza errori, torna a "oggi" OK');

  // ---------- 8a-bis) Calendario: colori per categoria (7 fiscali + Task team, task #131) ----------

  // mappatura categoria -> colore/classe: le 7 categorie di TIPI_ADEMPIMENTO PIÙ "Task team" (i
  // task team con scadenza, task #131) hanno tutte un colore distinto, e una categoria non mappata
  // (non dovrebbe mai succedere, ma niente crash) ricade su "Altri tributi" invece di esplodere
  const categorieCalTotali = window.TIPI_ADEMPIMENTO.concat(['Task team', 'Appuntamenti']);
  const classiCategoria = new Set(categorieCalTotali.map(t => window.infoCategoriaCalendario(t).classe));
  assert(classiCategoria.size === categorieCalTotali.length, `attese ${categorieCalTotali.length} classi colore distinte (7 fiscali + Task team + Appuntamenti), trovate ${classiCategoria.size}`);
  assert(window.infoCategoriaCalendario('Categoria mai vista') === window.infoCategoriaCalendario('Altri tributi'), 'una categoria non mappata deve ricadere su "Altri tributi", non esplodere');

  // gli eventi del calendario portano con sé la categoria corretta (periodiche via
  // tipoCategoriaScadenzaPeriodica, annuali via il campo "tipo", task team via CATEGORIA_TASK_TEAM_CAL) -
  // e ORA (task #131) includono anche i task team con una scadenza impostata: prima erano
  // completamente invisibili in calendario pur essendo contati nelle KPI (bug segnalato da Matteo
  // su un task reale, "Comprare il latte", creato via il ponte MCP)
  const eventiCal = window.eventiCalendarioPerGiorno();
  const tutteLeDateCal = Object.keys(eventiCal);
  assert(tutteLeDateCal.length > 0, 'nessun evento generato per il calendario nel demo (atteso: molti, con 22+ clienti)');
  const categorieViste = new Set();
  let nEventiTotali = 0, nEventiTask = 0;
  tutteLeDateCal.forEach(d => eventiCal[d].forEach(e => {
    categorieViste.add(e.categoria);
    nEventiTotali++;
    if (e.kind === 'task') nEventiTask++;
    assert(['scadenza', 'annuale', 'task'].includes(e.kind), `kind evento calendario non valido: "${e.kind}"`);
    assert(categorieCalTotali.includes(e.categoria), `categoria evento calendario non valida: "${e.categoria}"`);
  }));
  assert(categorieViste.size >= 3, `attese almeno 3 categorie diverse tra gli eventi del calendario demo, trovate ${categorieViste.size} (${Array.from(categorieViste).join(', ')})`);
  assert(nEventiTask > 0, 'bug #131: nessun task team con scadenza risulta tra gli eventi calendario (i task demo con scadenza devono comparire, non solo contare nelle KPI)');
  console.log(`=== Calendario: ${nEventiTotali} eventi su ${tutteLeDateCal.length} giorni (di cui ${nEventiTask} task team), ${categorieViste.size} categorie diverse rappresentate OK`);

  // regressione mirata sul bug: un task team con scadenza E cliente collegato deve comparire come
  // evento 'task' esattamente nella data della sua scadenza
  const taskConScadenzaDemo = window.getSTATE().taskTeam.find(t => t.scadenza && t.clienteId);
  assert(taskConScadenzaDemo, 'nessun task team demo con scadenza+cliente trovato per testare la correzione del bug #131');
  const eventoTaskAtteso = (eventiCal[taskConScadenzaDemo.scadenza] || []).find(e => e.kind === 'task' && e.id === taskConScadenzaDemo.id);
  assert(eventoTaskAtteso, `il task team "${taskConScadenzaDemo.titolo}" (scadenza ${taskConScadenzaDemo.scadenza}) non compare tra gli eventi calendario di quella data - bug #131 non corretto`);
  console.log('=== Calendario: task team con scadenza ora visibile in calendario (bug #131 corretto) OK');

  // legenda: una voce per categoria (7 fiscali + Task team)
  click(q('[data-nav="calendario"]'));
  await wait(20);
  assert(qa('.cal-legenda .voce').length === categorieCalTotali.length, `attese ${categorieCalTotali.length} voci in legenda, trovate ${qa('.cal-legenda .voce').length}`);
  assert(q('.cal-legenda').textContent.includes('Task team'), 'la legenda calendario non include la categoria "Task team"');
  console.log('=== Legenda calendario: una voce colorata per ciascuna delle 8 categorie (7 fiscali + Task team) OK');

  // ---------- 8a-ter) Raggruppamento scadenze multiple nello stesso giorno (task #131) ----------
  // con 100+ clienti in studio, molte scadenze periodiche ricorrono identiche (stesso kind+categoria+
  // titolo) per decine di clienti nello stesso giorno: raggruppaEventiGiorno le riunisce in un'unica
  // "voce" espandibile invece di una riga per cliente (prima: "IVA cliente A", "IVA cliente B"... ora:
  // "IVA mensile · N clienti", espandibile)
  const dataConGruppoMultiplo = tutteLeDateCal.find(d => window.raggruppaEventiGiorno(eventiCal[d]).some(gr => gr.items.length > 1));
  assert(dataConGruppoMultiplo, 'nessuna data con un gruppo di 2+ eventi identici trovata nel demo per testare il raggruppamento');
  const gruppiDelGiorno = window.raggruppaEventiGiorno(eventiCal[dataConGruppoMultiplo]);
  const gruppoMultiplo = gruppiDelGiorno.find(gr => gr.items.length > 1);
  window.apriModalGiornoCalendario(dataConGruppoMultiplo);
  await wait(20);
  assert(qa('.cal-giorno-lista .voce').length === gruppiDelGiorno.length, `il modal "espandi giorno" deve mostrare una riga per GRUPPO (non per evento grezzo): attesi ${gruppiDelGiorno.length} gruppi, trovate ${qa('.cal-giorno-lista .voce').length} voci`);

  // task #110: le scadenze PERIODICHE (evento con "id") aprono il proprio dettaglio, i task team
  // aprono il proprio modale, gli adempimenti ANNUALI restano su "Apri cliente" - solo per le righe
  // a evento SINGOLO (gruppo da 1): le intestazioni di gruppo aprono/chiudono l'espansione, non un dettaglio.
  const gruppiSingoli = gruppiDelGiorno.filter(gr => gr.items.length === 1);
  const nBottoniDettaglio = qa('.cal-giorno-lista [data-action="apri-dettaglio-scadenza"]').length;
  const nBottoniCliente = qa('.cal-giorno-lista [data-action="apri-cliente"]').length;
  const nBottoniTask = qa('.cal-giorno-lista [data-action="modifica-task-team"]').length;
  assert(nBottoniDettaglio + nBottoniCliente + nBottoniTask === gruppiSingoli.length, `ogni riga a evento singolo deve avere un pulsante di dettaglio (scadenza/cliente/task) - attesi ${gruppiSingoli.length}, trovati ${nBottoniDettaglio + nBottoniCliente + nBottoniTask}`);
  console.log('=== Modal "espandi giorno": una riga per gruppo, pulsante di dettaglio sulle righe a evento singolo OK');

  // espandere l'intestazione del gruppo multiplo deve rivelare tutte le sue righe (con pulsante di
  // dettaglio ciascuna), ri-cliccarla deve richiuderlo - lo stato di espansione persiste per chiave
  // "dataISO::indiceGruppo" quindi riapre sempre lo stesso gruppo
  const chiaveGruppoMultiplo = `${dataConGruppoMultiplo}::${gruppiDelGiorno.indexOf(gruppoMultiplo)}`;
  const headerGruppo = q(`[data-action="cal-toggle-gruppo"][data-chiave="${chiaveGruppoMultiplo}"]`);
  assert(headerGruppo, 'intestazione del gruppo multiplo non trovata nel modal giorno');
  assert(headerGruppo.textContent.includes(`${gruppoMultiplo.items.length} eventi`), 'l\'intestazione del gruppo non mostra il conteggio atteso di eventi');
  click(headerGruppo);
  await wait(20);
  // l'intestazione del gruppo resta sempre visibile (è lei stessa una ".voce" cliccabile per
  // richiudere), le righe espanse si aggiungono SOTTO, non la sostituiscono
  const totaleVociEspanso = gruppiDelGiorno.length + gruppoMultiplo.items.length;
  assert(qa('.cal-giorno-lista .voce').length === totaleVociEspanso, `dopo l'espansione del gruppo, attese ${totaleVociEspanso} voci (${gruppiDelGiorno.length} intestazioni di gruppo + ${gruppoMultiplo.items.length} righe del gruppo espanso), trovate ${qa('.cal-giorno-lista .voce').length}`);
  assert(qa('.cal-giorno-lista [data-action="apri-dettaglio-scadenza"],.cal-giorno-lista [data-action="apri-cliente"],.cal-giorno-lista [data-action="modifica-task-team"]').length === gruppiSingoli.length + gruppoMultiplo.items.length, 'espandendo il gruppo, ogni riga rivelata deve avere il proprio pulsante di dettaglio');
  // il primo click ha rifatto il markup del modal (apriModalGiornoCalendario re-invocata) - il
  // riferimento DOM precedente è staccato, va riletto prima del secondo click
  click(q(`[data-action="cal-toggle-gruppo"][data-chiave="${chiaveGruppoMultiplo}"]`));
  await wait(20);
  assert(qa('.cal-giorno-lista .voce').length === gruppiDelGiorno.length, 'ri-cliccando l\'intestazione il gruppo non si è richiuso correttamente');
  console.log(`=== Raggruppamento calendario: gruppo "${gruppoMultiplo.titolo}" (${gruppoMultiplo.items.length} clienti) espandibile/richiudibile, righe singole invariate OK`);

  // se in questa data c'è anche un adempimento annuale (riga singola), "Apri cliente" deve ancora
  // portare alla scheda cliente (comportamento invariato per quel tipo di evento)
  if (nBottoniCliente > 0) {
    click(qa('.cal-giorno-lista [data-action="apri-cliente"]')[0]);
    await wait(20);
    assert(window.getVIEW() === 'schedacliente', `dal modal giorno, "Apri cliente" (adempimento annuale) deve portare alla scheda cliente, vista attuale: ${window.getVIEW()}`);
    assert(!q('#modalRoot').children.length, 'il modal "espandi giorno" non si è chiuso aprendo la scheda cliente');
    click(q('[data-nav="calendario"]'));
    await wait(20);
  }

  // ---------- 8a-quater) Click su una scadenza periodica (riga singola) apre il suo DETTAGLIO (task #110) ----------
  let dataConScadenzaPeriodica = null, eventoScadenzaTest = null;
  for (const d of tutteLeDateCal) {
    // deve essere un gruppo isolato (1 solo evento, niente espansione da gestire nel test) E ancora
    // APERTA (non già chiusa): serve per verificare che passare a uno stato definitivo imposti
    // davvero "Completata il" ad oggi, cosa che non succederebbe ri-chiudendo una scadenza già chiusa
    const gr = window.raggruppaEventiGiorno(eventiCal[d]).find(g => g.kind === 'scadenza' && g.items.length === 1 && !window.eventoCalendarioChiuso('scadenza', g.items[0].stato));
    if (gr) { dataConScadenzaPeriodica = d; eventoScadenzaTest = gr.items[0]; break; }
  }
  assert(dataConScadenzaPeriodica, 'nessuna scadenza periodica isolata e ancora aperta trovata nel demo per testare "Apri scadenza"');
  window.apriModalGiornoCalendario(dataConScadenzaPeriodica);
  await wait(20);
  const btnApriScadenza = q(`.cal-giorno-lista [data-action="apri-dettaglio-scadenza"][data-id="${eventoScadenzaTest.id}"]`);
  assert(btnApriScadenza, 'pulsante "Apri scadenza" non trovato per la scadenza periodica di test');
  click(btnApriScadenza);
  await wait(20);
  assert(!q('.cal-giorno-lista'), 'il modal giorno dovrebbe aver lasciato il posto al dettaglio della scadenza');
  const selStatoDettaglio = q('[data-action="scad-detail-cambia-stato"]');
  const selRespDettaglio = q('[data-action="scad-detail-cambia-resp"]');
  const campoNotaDettaglio = q('[data-action="scad-cambia-nota"]');
  const campoImportoDettaglio = q('[data-action="scad-cambia-importo"]');
  assert(selStatoDettaglio && selRespDettaglio && campoNotaDettaglio && campoImportoDettaglio, 'il dettaglio scadenza non mostra tutti i campi attesi (Stato/Responsabile/Nota/Importo)');
  assert(q('.modal h2').textContent.trim() === eventoScadenzaTest.titolo, 'il titolo del dettaglio scadenza non corrisponde al nome della scadenza cliccata');

  // cambiare Stato deve aggiornare davvero la scadenza e, passando a uno stato "definitivo",
  // impostare in automatico "Completata il" (visibile subito nello stesso modale, senza richiuderlo)
  const overridePrimaTest = Object.assign({}, (window.getSTATE().scadenzeOverrides || {})[eventoScadenzaTest.id] || {});
  const scadenzaPrimaTest = window.derivati().tutteScadenze.find(s => s.id === eventoScadenzaTest.id);
  assert(scadenzaPrimaTest, 'scadenza di test non trovata in derivati() dopo l\'apertura del dettaglio');
  setVal(selStatoDettaglio, 'Inviato telematicamente');
  await wait(20);
  const scadenzaDopoStato = window.derivati().tutteScadenze.find(s => s.id === eventoScadenzaTest.id);
  assert(scadenzaDopoStato.stato === 'Inviato telematicamente', 'lo stato non è stato aggiornato dal dettaglio scadenza');
  assert(scadenzaDopoStato.dataCompletamento === window.oggiISO(), 'passando a uno stato definitivo dal dettaglio scadenza, "Completata il" deve impostarsi in automatico');
  assert(q('#modalRoot').textContent.includes(window.fmtData(window.oggiISO())), 'il dettaglio scadenza (ancora aperto) non mostra la nuova "Completata il" senza bisogno di riaprirlo');

  // Responsabile/Nota/Importo si salvano anche loro dal dettaglio (stessi data-action della
  // tabella per Nota/Importo, varianti dedicate per Responsabile - vedi commento nel codice).
  // Nota: cambiare Stato poco sopra ha rifatto il markup del modale (per mostrare "Completata il"
  // aggiornato), quindi i riferimenti DOM presi prima sono ormai staccati - vanno riletti. Anche
  // il cambio Responsabile (scad-detail-cambia-resp) rifà il markup allo stesso modo: va fatto
  // PRIMA, con la sua attesa separata, per poter rileggere Nota/Importo DOPO quel re-render.
  const respAlternativo = window.getSTATE().meta.responsabili.find(r => r !== scadenzaDopoStato.responsabile) || window.getSTATE().meta.responsabili[0];
  setVal(q('[data-action="scad-detail-cambia-resp"]'), respAlternativo);
  await wait(20);
  const campoNotaDettaglio2 = q('[data-action="scad-cambia-nota"]');
  const campoImportoDettaglio2 = q('[data-action="scad-cambia-importo"]');
  setVal(campoNotaDettaglio2, 'Nota di prova dal dettaglio scadenza');
  setVal(campoImportoDettaglio2, '321.50');
  await wait(20);
  const scadenzaFinale = window.derivati().tutteScadenze.find(s => s.id === eventoScadenzaTest.id);
  assert(scadenzaFinale.responsabile === respAlternativo, 'il responsabile non è stato salvato dal dettaglio scadenza');
  assert(scadenzaFinale.nota === 'Nota di prova dal dettaglio scadenza', 'la nota non è stata salvata dal dettaglio scadenza');
  assert(Number(scadenzaFinale.importo) === 321.50, 'l\'importo non è stato salvato dal dettaglio scadenza');

  // pulizia: ripristina esattamente l'override precedente (scrittura diretta, non aggiornaScadenza,
  // per non far scattare di nuovo la logica automatica di "Completata il")
  if (Object.keys(overridePrimaTest).length) window.getSTATE().scadenzeOverrides[eventoScadenzaTest.id] = overridePrimaTest;
  else delete window.getSTATE().scadenzeOverrides[eventoScadenzaTest.id];
  window.salvaStato();
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Dettaglio scadenza dal calendario (task #110): apertura, cambio stato/responsabile/nota/importo, ripristino OK');

  // click diretto su una cella del calendario con eventi: deve aprire lo stesso modal, con lo
  // stesso numero di VOCI (gruppi, non eventi grezzi) di quella data — le celle senza eventi
  // restano prive di azione
  click(q('[data-nav="calendario"]'));
  await wait(20);
  const celleConEventi = qa('.cal-day.has-eventi');
  assert(celleConEventi.length > 0, 'nessuna cella del calendario del mese corrente ha eventi (atteso per il mese di "oggi" nel demo)');
  const dataPrimaCella = celleConEventi[0].dataset.data;
  click(celleConEventi[0]);
  await wait(20);
  const gruppiPrimaCella = window.raggruppaEventiGiorno(eventiCal[dataPrimaCella]);
  assert(qa('.cal-giorno-lista .voce').length === gruppiPrimaCella.length, 'il click su una cella del calendario non apre il modal con il numero corretto di voci (gruppi) di quel giorno');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  // Task #141: un giorno SENZA eventi ora è comunque cliccabile e apre direttamente il modale
  // "Nuovo evento" (creazione appuntamento/scadenza ricorrente), non più nessun modal.
  const celleSenzaEventi = qa('.cal-day').filter(el => el.classList.contains('altromese') === false && !el.classList.contains('has-eventi') && el.querySelector('.num'));
  if (celleSenzaEventi.length) {
    click(celleSenzaEventi[0]);
    await wait(20);
    assert(q('#nuovoEventoForm'), 'il click su un giorno senza eventi deve aprire il modale "Nuovo evento"');
    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
  }
  console.log('=== Click su cella calendario: apre il modal giorno se ci sono eventi (numero corretto di voci/gruppi), o il modale "Nuovo evento" se il giorno è vuoto OK');

  // ---------- 8a-bis) Calendario: creazione evento (appuntamento + scadenza ricorrente, task #141) ----------
  {
    const celleTarget = qa('.cal-day').filter(el => el.classList.contains('altromese') === false && el.querySelector('.num'));
    assert(celleTarget.length > 0, 'nessuna cella cliccabile per testare la creazione evento');
    const dataTarget = celleTarget[0].dataset.data;
    click(celleTarget[0]);
    await wait(20);
    assert(q('#nuovoEventoForm'), 'manca il form del modale "Nuovo evento"');

    // Appuntamento con cliente
    const clienteSelect = q('#nevCliente');
    assert(clienteSelect, 'manca il select cliente nel form appuntamento');
    const primaOpzione = clienteSelect.options[1];
    if (primaOpzione) clienteSelect.value = primaOpzione.value;
    q('#nevOggetto').value = 'Incontro di prova';
    const nAppPrima = (window.getSTATE().appuntamenti || []).length;
    click(q('[data-action="nuovo-evento-salva-appuntamento"]'));
    await wait(20);
    assert((window.getSTATE().appuntamenti || []).length === nAppPrima + 1, 'la creazione dell\'appuntamento non ha aggiunto la voce a STATE.appuntamenti');
    const appCreato = window.getSTATE().appuntamenti[window.getSTATE().appuntamenti.length - 1];
    assert(appCreato.data === dataTarget, 'l\'appuntamento creato non ha la data del giorno cliccato');
    assert(appCreato.oggetto === 'Incontro di prova', 'l\'oggetto dell\'appuntamento creato non corrisponde');
    assert(!q('#modalRoot').children.length, 'il modale non si è chiuso dopo la creazione dell\'appuntamento');

    // L'appuntamento appena creato deve comparire come evento nel calendario
    const eventiCalDopo = window.eventiCalendarioPerGiorno();
    const eventiGiornoDopo = eventiCalDopo[dataTarget] || [];
    assert(eventiGiornoDopo.some(e => e.kind === 'appuntamento' && e.id === appCreato.id), 'l\'appuntamento creato non compare tra gli eventi calendario del giorno');

    // Apertura/modifica/eliminazione dal dettaglio
    window.apriModalAppuntamento(appCreato.id);
    await wait(10);
    assert(q('[data-action="app-elimina"]'), 'manca il pulsante elimina nel dettaglio appuntamento');
    click(q('[data-action="app-elimina"]'));
    await wait(20);
    assert(!window.getSTATE().appuntamenti.find(a => a.id === appCreato.id), 'l\'appuntamento non è stato rimosso da STATE dopo "Elimina"');

    // Scadenza ricorrente: crea un tipo nel catalogo periodico e attiva il flag sul primo cliente selezionato.
    // Riapre il modale via funzione diretta invece di ricliccare la cella calendario: dopo i render()
    // precedenti il riferimento DOM a celleTarget[0] è ormai staccato dal documento.
    window.apriModalNuovoEvento(dataTarget);
    await wait(20);
    click(q('[data-action="nuovo-evento-tipo"][data-tipo="scadenza"]'));
    await wait(20);
    assert(q('#nevScadNome'), 'manca il form scadenza ricorrente dopo lo switch di tipo');
    q('#nevScadNome').value = 'Comunicazione di prova';
    const primaCheckbox = q('[data-multi-cliente="nuovo-evento-scadenza"]');
    if (primaCheckbox) primaCheckbox.checked = true;
    const nCatalogoPrima = window.getSTATE().catalogoPeriodico.length;
    click(q('[data-action="nuovo-evento-salva-scadenza"]'));
    await wait(20);
    assert(window.getSTATE().catalogoPeriodico.length === nCatalogoPrima + 1, 'la creazione della scadenza ricorrente non ha aggiunto la voce al catalogo periodico');
    const tipoCreato = window.getSTATE().catalogoPeriodico[window.getSTATE().catalogoPeriodico.length - 1];
    assert(tipoCreato.nome === 'Comunicazione di prova', 'il nome della scadenza ricorrente creata non corrisponde');
    if (primaCheckbox) {
      const clienteFlaggato = window.getSTATE().clienti.find(c => c.id === primaCheckbox.value);
      assert(clienteFlaggato && clienteFlaggato.flags && clienteFlaggato.flags[tipoCreato.flag] === true, 'il flag della nuova scadenza ricorrente non è stato attivato sul cliente selezionato');
    }
    assert(!q('#modalRoot').children.length, 'il modale non si è chiuso dopo la creazione della scadenza ricorrente');
    // Pulizia: rimuove il tipo di prova dal catalogo per non alterare gli altri test a valle
    window.getSTATE().catalogoPeriodico = window.getSTATE().catalogoPeriodico.filter(t => t.id !== tipoCreato.id);
  }
  console.log('=== Calendario: creazione evento (appuntamento + scadenza ricorrente) OK');

  // ---------- 8b) Clienti: filtro "mostra cessati" ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  const righeClientiVisibili = qa('[data-action="apri-cliente"]').length;
  assert(righeClientiVisibili === 22, `senza "mostra cessati" attesi 22 clienti visibili, trovati ${righeClientiVisibili}`);
  setChecked(q('[data-action="cli-filtro-cessati"]'), true);
  await wait(20);
  const righeClientiConCessati = qa('[data-action="apri-cliente"]').length;
  assert(righeClientiConCessati === 24, `con "mostra cessati" attesi 24 clienti visibili, trovati ${righeClientiConCessati}`);
  assert(qa('.badge.cessato').length === 2, 'badge CESSATO non mostrato per i 2 clienti cessati');
  setChecked(q('[data-action="cli-filtro-cessati"]'), false);
  await wait(20);
  console.log('=== Filtro "mostra cessati" funziona: 22 attivi, 24 con cessati inclusi');

  // ---------- 8c) Comunicazioni: invio singolo, broadcast, ricorrenti ----------
  click(q('[data-nav="comunicazioni"]'));
  await wait(20);
  const nComPrima = window.getSTATE().comunicazioni.length;
  // Task #122: "Registra sollecito" ora crea SEMPRE anche una comunicazione nel portale cliente
  // (non solo la voce nello storico solleciti) - il sollecito di test registrato sopra (§4) ne
  // aggiunge quindi una in più alle 10 comunicazioni demo originali.
  assert(nComPrima === 11, `attese 11 comunicazioni (10 demo + 1 dal sollecito di test registrato sopra), trovate ${nComPrima}`);
  const clientePerCom = window.getSTATE().clienti.find(c => c.stato !== 'cessato');

  // invio a un cliente singolo (modo default del form)
  click(q('[data-action="nuova-comunicazione"]'));
  await wait(20);
  assert(q('#formComunicazione'), 'form nuova comunicazione non renderizzato');
  assertNoAutoSubmit(q('#formComunicazione'), 'formComunicazione');
  // Nell'ambiente di test non c'è un server locale attivo: come per Documenti/Contabilità, il campo
  // per allegare un file alla comunicazione deve sparire con una spiegazione, non fallire in silenzio.
  assert(!q('#cFile'), 'senza server locale attivo non deve comparire il campo allegato nel form comunicazione');
  assert(q('.modal').textContent.includes('server locale'), 'manca la spiegazione che l\'allegato richiede il server locale (form comunicazione)');
  assert(q('#cDestSingolo'), 'select destinatario singolo non trovato nel form');
  setVal(q('#cDestSingolo'), clientePerCom.id);
  setVal(q('#cData'), window.oggiISO());
  setVal(q('#cCategoria'), 'Amministrativa');
  setVal(q('#cOggetto'), 'Test comunicazione automatica');
  setVal(q('#cCorpo'), 'Testo di prova visibile nel portale.');
  click(q('[data-action="salva-comunicazione"]'));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrima + 1, 'nuova comunicazione singola non salvata');
  const comCreata = window.getSTATE().comunicazioni.find(c => c.oggetto === 'Test comunicazione automatica');
  assert(comCreata && comCreata.stato === 'Inviata', 'stato di default comunicazione non corretto');
  assert(comCreata.clienteId === clientePerCom.id, 'destinatario comunicazione singola non corretto');
  assert(!comCreata.gruppoId, 'una comunicazione a un solo cliente non deve avere gruppoId');
  console.log('=== Comunicazione singola creata:', comCreata.oggetto, '-', comCreata.stato);
  const selStatoCom = q(`[data-action="com-cambia-stato"][data-id="${comCreata.id}"]`);
  setVal(selStatoCom, 'Bozza');
  await wait(20);
  assert(window.getSTATE().comunicazioni.find(c=>c.id===comCreata.id).stato === 'Bozza', 'cambio stato comunicazione non salvato');
  click(q(`[data-action="elimina-comunicazione"][data-id="${comCreata.id}"]`));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrima, 'comunicazione singola di test non eliminata');
  console.log('=== Comunicazioni: creazione, cambio stato ed eliminazione (invio singolo) OK');

  // ---- Task #142: categoria "Raccolta documentale" mostra/nasconde il campo categoria-documento-richiesta ----
  click(q('[data-action="nuova-comunicazione"]'));
  await wait(20);
  assert(q('#cCategoriaDocRichiesta'), 'select categoria documento richiesto non renderizzata nel form comunicazione');
  const wrapRaccoltaDoc = q('#cRaccoltaDocWrap');
  assert(wrapRaccoltaDoc && wrapRaccoltaDoc.style.display === 'none', 'il campo "categoria del documento richiesto" deve essere nascosto di default (categoria diversa da Raccolta documentale)');
  setVal(q('#cCategoria'), 'Raccolta documentale');
  await wait(20);
  assert(wrapRaccoltaDoc.style.display !== 'none', 'cambiando la categoria in "Raccolta documentale" il campo categoria-documento-richiesta deve comparire');
  setVal(q('#cCategoriaDocRichiesta'), 'Pratiche');
  setVal(q('#cDestSingolo'), clientePerCom.id);
  setVal(q('#cData'), window.oggiISO());
  setVal(q('#cOggetto'), 'Serve la vostra visura camerale aggiornata');
  setVal(q('#cCorpo'), 'Per favore allegate la visura camerale aggiornata.');
  click(q('[data-action="salva-comunicazione"]'));
  await wait(20);
  const comRaccoltaDoc = window.getSTATE().comunicazioni.find(c => c.oggetto === 'Serve la vostra visura camerale aggiornata');
  assert(comRaccoltaDoc && comRaccoltaDoc.categoria === 'Raccolta documentale' && comRaccoltaDoc.categoriaDocumentoRichiesta === 'Pratiche', 'la comunicazione "Raccolta documentale" non ha salvato categoria/categoriaDocumentoRichiesta correttamente');
  // tornando su una categoria diversa il campo torna nascosto (verifica di regressione sul toggle)
  click(q('[data-action="nuova-comunicazione"]'));
  await wait(20);
  setVal(q('#cCategoria'), 'Raccolta documentale');
  await wait(20);
  setVal(q('#cCategoria'), 'Amministrativa');
  await wait(20);
  assert(q('#cRaccoltaDocWrap').style.display === 'none', 'tornando a una categoria diversa da "Raccolta documentale" il campo deve rinascondersi');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => c.id !== comRaccoltaDoc.id);
  window.salvaStato();
  console.log('=== Task #142: categoria "Raccolta documentale" mostra il campo categoria-documento-richiesta e lo salva sulla comunicazione OK');

  // invio broadcast a "tutti i clienti attivi"
  const nClientiAttivi = window.getSTATE().clienti.filter(c => c.stato !== 'cessato').length;
  click(q('[data-action="nuova-comunicazione"]'));
  await wait(20);
  const radioTutti = q('input[name="cDestModo"][value="tutti"]');
  assert(radioTutti, 'radio "tutti i clienti" non trovato');
  setChecked(radioTutti, true);
  await wait(20);
  setVal(q('#cData'), window.oggiISO());
  setVal(q('#cCategoria'), 'Novità legislativa');
  setVal(q('#cOggetto'), 'Test broadcast a tutti');
  click(q('[data-action="salva-comunicazione"]'));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrima + nClientiAttivi, `broadcast a tutti deve creare ${nClientiAttivi} comunicazioni, trovate ${window.getSTATE().comunicazioni.length - nComPrima}`);
  const rigeBroadcast = window.getSTATE().comunicazioni.filter(c => c.oggetto === 'Test broadcast a tutti');
  assert(rigeBroadcast.length === nClientiAttivi, 'numero destinatari broadcast non corretto in STATE');
  const gruppoIdBroadcast = rigeBroadcast[0].gruppoId;
  assert(gruppoIdBroadcast && rigeBroadcast.every(r => r.gruppoId === gruppoIdBroadcast), 'le righe broadcast devono condividere lo stesso gruppoId');
  const badgeGruppo = q(`[data-action="com-toggle-gruppo"][data-id="${gruppoIdBroadcast}"]`);
  assert(badgeGruppo, 'riga raggruppata "N destinatari" non trovata nella lista comunicazioni');
  click(badgeGruppo);
  await wait(20);
  assert(window.document.body.textContent.includes(window.nomeCliente(rigeBroadcast[0].clienteId)), 'espandendo il gruppo non si vedono i nomi dei destinatari');
  const selStatoGruppo = q(`[data-action="com-cambia-stato-gruppo"][data-id="${gruppoIdBroadcast}"]`);
  setVal(selStatoGruppo, 'Bozza');
  await wait(20);
  assert(window.getSTATE().comunicazioni.filter(c=>c.gruppoId===gruppoIdBroadcast).every(c=>c.stato==='Bozza'), 'cambio stato di gruppo non applicato a tutte le righe');
  click(q(`[data-action="elimina-comunicazione-gruppo"][data-id="${gruppoIdBroadcast}"]`));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrima, 'eliminazione di gruppo non ha rimosso tutte le righe broadcast');
  console.log(`=== Comunicazioni: broadcast a ${nClientiAttivi} clienti (raggruppamento, cambio stato di gruppo, eliminazione di gruppo) OK`);

  // ---------- 8c-bis) Comunicazione con F24 collegato (task #105) ----------
  const nComPrimaComF24 = window.getSTATE().comunicazioni.length;
  const nF24PrimaComF24 = window.getSTATE().f24.length;
  const clientePerF24 = window.getSTATE().clienti.find(c => c.stato !== 'cessato');

  // il blocco F24 deve essere visibile di default (il modo destinatari all'apertura è "singolo")
  click(q('[data-action="nuova-comunicazione"]'));
  await wait(20);
  assert(q('#cF24Wrap'), 'blocco "Riguarda un F24" non presente nel form comunicazione');
  assert(q('#cF24Wrap').style.display !== 'none', 'il blocco F24 deve essere visibile di default (destinatario singolo)');
  assert(q('#cF24Campi').style.display === 'none', 'i campi Tipo/Importo F24 non devono essere visibili prima di spuntare la casella');

  // passando a "tutti i clienti" il blocco F24 deve nascondersi (un importo F24 non ha senso su un broadcast)
  setChecked(q('input[name="cDestModo"][value="tutti"]'), true);
  await wait(20);
  assert(q('#cF24Wrap').style.display === 'none', 'il blocco F24 deve nascondersi quando il destinatario non è singolo');
  setChecked(q('input[name="cDestModo"][value="singolo"]'), true);
  await wait(20);
  assert(q('#cF24Wrap').style.display !== 'none', 'il blocco F24 deve tornare visibile ripassando a destinatario singolo');

  // validazione: spunta attiva ma importo vuoto -> il salvataggio non deve creare nulla
  setVal(q('#cDestSingolo'), clientePerF24.id);
  setVal(q('#cData'), window.oggiISO());
  setVal(q('#cOggetto'), 'Test comunicazione con F24 collegato');
  setChecked(q('#cIsF24'), true);
  await wait(20);
  assert(q('#cF24Campi').style.display !== 'none', 'spuntando "Riguarda un F24" i campi Tipo/Importo devono comparire');
  click(q('[data-action="salva-comunicazione"]'));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrimaComF24, 'senza importo F24 valido il salvataggio non deve creare la comunicazione');
  assert(window.getSTATE().f24.length === nF24PrimaComF24, 'senza importo F24 valido non deve essere creato nessun F24');

  // compiliamo l'importo e salviamo: deve creare sia la comunicazione sia l'F24 collegato
  setVal(q('#cF24Importo'), '1234.56');
  setVal(q('#cF24Tipo'), 'Credito');
  click(q('[data-action="salva-comunicazione"]'));
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrimaComF24 + 1, 'la comunicazione con F24 collegato non è stata salvata');
  const comConF24 = window.getSTATE().comunicazioni.find(c => c.oggetto === 'Test comunicazione con F24 collegato');
  assert(comConF24, 'comunicazione di test con F24 non trovata');
  assert(window.getSTATE().f24.length === nF24PrimaComF24 + 1, `l'F24 collegato alla comunicazione non è stato registrato (attesi ${nF24PrimaComF24+1}, trovati ${window.getSTATE().f24.length})`);
  const f24Creato = window.getSTATE().f24.find(f => f.comunicazioneRif === comConF24.id);
  assert(f24Creato, 'F24 creato non ha il comunicazioneRif che punta alla comunicazione appena creata');
  assert(f24Creato.clienteId === clientePerF24.id, 'F24 collegato ha il cliente sbagliato');
  assert(f24Creato.tipo === 'Credito', 'F24 collegato non ha il tipo selezionato nel form');
  assert(Number(f24Creato.importo) === 1234.56, `F24 collegato ha un importo sbagliato (atteso 1234.56, trovato ${f24Creato.importo})`);
  assert(f24Creato.descrizione === comConF24.oggetto, "F24 collegato non riporta l'oggetto della comunicazione come descrizione");
  console.log('=== Comunicazione + F24 collegato (task #105): validazione importo, creazione, campi corretti OK');

  // pulizia: rimuoviamo sia la comunicazione che l'F24 di test (uso delle funzioni dedicate, che
  // gestiscono già in modo sicuro un eventuale allegato condiviso tra le due entità)
  window.eliminaComunicazione(comConF24.id);
  window.eliminaF24(f24Creato.id);
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrimaComF24, 'comunicazione di test con F24 non ripulita correttamente');
  assert(window.getSTATE().f24.length === nF24PrimaComF24, 'F24 di test non ripulito correttamente');
  console.log('=== Pulizia comunicazione+F24 di test OK');

  // Nota: il modello ricorrente demo ("Promemoria scadenze del mese", giorno 3) potrebbe risultare
  // "dovuto" a seconda del giorno del mese in cui gira il test (dal giorno 3 in poi), dato che viene
  // caricato con ultimaGenerazionePeriodo:null e non è mai stato generato prima d'ora. Lo marchiamo
  // come già generato per il periodo corrente PRIMA di ogni test di generazione qui sotto, così a
  // scattare è solo il modello di test creato di volta in volta (nessun rumore dal demo).
  const demoTemplateRicorrente = window.getSTATE().comunicazioniRicorrenti.find(t => t.oggetto === 'Promemoria scadenze del mese');
  if (demoTemplateRicorrente) {
    const [annoOggiP, meseOggiP] = window.oggiISO().split('-');
    demoTemplateRicorrente.ultimaGenerazionePeriodo = `${annoOggiP}-${meseOggiP}`;
  }

  // ---------- bug corretto: un modello ricorrente creato DOPO la soglia del periodo corrente
  // non deve scattare subito per tutti i destinatari, ma aspettare la prossima occorrenza ----------
  // sogliaRicorrenzaGiaPassata: logica pura, testata con date sintetiche (indipendente dal giorno reale)
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Mensile', giorno: 15 }, '2026-06-20') === true, 'Mensile: soglia 15 con oggi 20 deve risultare già passata');
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Mensile', giorno: 15 }, '2026-06-10') === false, 'Mensile: soglia 15 con oggi 10 NON deve risultare già passata');
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Trimestrale', giorno: 10 }, '2026-05-15') === false, 'Trimestrale: maggio non è mese di scatto (gen/apr/lug/ott), soglia non passata');
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Trimestrale', giorno: 10 }, '2026-04-15') === true, 'Trimestrale: aprile è mese di scatto, giorno 15 >= soglia 10, deve risultare passata');
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Annuale', giorno: 10, mese: 3 }, '2026-03-15') === true, 'Annuale: mese di scatto marzo, giorno 15 >= soglia 10, deve risultare passata');
  assert(window.sogliaRicorrenzaGiaPassata({ frequenza: 'Annuale', giorno: 10, mese: 3 }, '2026-06-15') === false, 'Annuale: giugno non è il mese configurato (marzo), soglia non passata');
  console.log('=== sogliaRicorrenzaGiaPassata: calcolo corretto per Mensile/Trimestrale/Annuale su date sintetiche OK');

  // integrazione: aggiungiComunicazioneRicorrente con giorno=1 (soglia sempre già passata, qualunque
  // sia il giorno del mese reale in cui gira il test) NON deve generare comunicazioni immediatamente
  const oggiBugTest = window.oggiISO();
  const nRicPrimaBug = window.getSTATE().comunicazioniRicorrenti.length;
  const nComPrimaBug = window.getSTATE().comunicazioni.length;
  window.aggiungiComunicazioneRicorrente({ oggetto: 'Test bug soglia già passata alla creazione', corpo: '', categoria: 'Altro', destinatari: { modo: 'tutti', clienteIds: [] }, frequenza: 'Mensile', giorno: 1, mese: 1, attiva: true });
  const templateBug = window.getSTATE().comunicazioniRicorrenti[window.getSTATE().comunicazioniRicorrenti.length - 1];
  assert(window.getSTATE().comunicazioniRicorrenti.length === nRicPrimaBug + 1, 'modello di test per il bug della soglia non salvato');
  assert(templateBug.ultimaGenerazionePeriodo === window.periodoRicorrenza('Mensile', oggiBugTest), `un modello creato con soglia già passata deve avere ultimaGenerazionePeriodo impostato al periodo corrente (${window.periodoRicorrenza('Mensile', oggiBugTest)}), trovato ${templateBug.ultimaGenerazionePeriodo}`);
  assert(window.ricorrenzaDovutaOggi(templateBug, oggiBugTest) === false, 'un modello appena creato con soglia già passata NON deve risultare "dovuto oggi" (altrimenti scatterebbe subito per tutti i clienti attivi)');
  const generateBug = window.generaComunicazioniRicorrentiDovute();
  assert(window.getSTATE().comunicazioni.length === nComPrimaBug, `il modello appena creato con soglia già passata non deve generare comunicazioni immediate (comunicazioni ${nComPrimaBug} -> ${window.getSTATE().comunicazioni.length})`);
  window.eliminaComunicazioneRicorrente(templateBug.id);
  console.log('=== Fix bug: modello ricorrente creato a soglia già superata NON genera comunicazioni immediate, aspetta la prossima occorrenza OK');

  // comunicazione ricorrente: creazione, generazione automatica (idempotente)
  const clientiPerRicorrente = window.getSTATE().clienti.filter(c => c.stato !== 'cessato').slice(0, 2);
  click(q('[data-action="nuova-comunicazione-ricorrente"]'));
  await wait(20);
  assert(q('#formComunicazioneRicorrente'), 'form modello ricorrente non renderizzato');
  assertNoAutoSubmit(q('#formComunicazioneRicorrente'), 'formComunicazioneRicorrente');
  const radioMultiRic = q('input[name="crDestModo"][value="multi"]');
  setChecked(radioMultiRic, true);
  await wait(20);
  clientiPerRicorrente.forEach(c => setChecked(q(`[data-multi-cliente="cr"][value="${c.id}"]`), true));
  setVal(q('#crFrequenza'), 'Mensile');
  setVal(q('#crGiorno'), '1');
  setVal(q('#crOggetto'), 'Test ricorrente mensile');
  click(q('[data-action="salva-comunicazione-ricorrente"]'));
  await wait(20);
  const nRicorrentiPrima = window.getSTATE().comunicazioniRicorrenti.length;
  assert(nRicorrentiPrima === 2, `attesi 2 modelli ricorrenti (1 demo + 1 di test), trovati ${nRicorrentiPrima}`);
  const templateRic = window.getSTATE().comunicazioniRicorrenti.find(t => t.oggetto === 'Test ricorrente mensile');
  assert(templateRic, 'modello ricorrente di test non trovato in STATE');
  assert(templateRic.destinatari.modo === 'multi' && templateRic.destinatari.clienteIds.length === 2, 'destinatari modello ricorrente non salvati correttamente');
  // simula che il modello esistesse già da prima di questo periodo e sia ora "dovuto": col fix del
  // bug qui sopra, un modello appena creato con soglia già passata parte già marcato come generato
  // per il periodo corrente (comportamento testato a parte) — qui verifichiamo invece il meccanismo
  // di generazione/idempotenza in sé, indipendentemente dal momento della creazione.
  templateRic.ultimaGenerazionePeriodo = null;

  const nComPrimaGenerazione = window.getSTATE().comunicazioni.length;
  const generate1 = window.generaComunicazioniRicorrentiDovute();
  assert(generate1 >= 1, 'la generazione automatica non ha prodotto nulla al primo giro (atteso almeno il modello di test)');
  const nDopoGenerazione1 = window.getSTATE().comunicazioni.length;
  assert(nDopoGenerazione1 === nComPrimaGenerazione + 2, `la generazione dal modello di test deve aggiungere 2 comunicazioni (una per cliente), aggiunte ${nDopoGenerazione1 - nComPrimaGenerazione}`);
  // idempotenza: richiamata subito dopo, per lo stesso periodo, non deve generare doppioni
  window.generaComunicazioniRicorrentiDovute();
  const nDopoGenerazione2 = window.getSTATE().comunicazioni.length;
  assert(nDopoGenerazione2 === nDopoGenerazione1, `la generazione ricorrente non è idempotente: da ${nDopoGenerazione1} a ${nDopoGenerazione2} comunicazioni richiamandola due volte nello stesso periodo`);
  console.log('=== Comunicazioni ricorrenti: creazione, generazione automatica e idempotenza OK');

  // pulizia: rimuove sia il modello di test che le comunicazioni generate, per non alterare i conteggi successivi
  window.getSTATE().comunicazioniRicorrenti = window.getSTATE().comunicazioniRicorrenti.filter(t => t.id !== templateRic.id);
  window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => c.generataDaRicorrenteId !== templateRic.id);
  window.salvaStato(); window.render();
  await wait(20);
  assert(window.getSTATE().comunicazioni.length === nComPrima, 'pulizia post-test ricorrenti non ha ripristinato il conteggio comunicazioni originale');

  // ---------- 8c-bis) Comunicazioni ricorrenti collegate ad un adempimento (flag/chiave): destinatari automatici ----------
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);
  setVal(q('#fRagioneSociale'), 'Test Comunicazione Collegata SRL');
  setVal(q('#fPartitaIva'), '07777777777');
  setChecked(q('[data-flag="paghe"]'), true);
  setChecked(q('[data-annuale="DICH_IVA_ANNUALE"]'), true);
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  const clienteComCollegata = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Test Comunicazione Collegata SRL');
  assert(clienteComCollegata, 'cliente di test per comunicazione collegata non salvato');
  assert(clienteComCollegata.flags.paghe === true, 'flag paghe non salvato sul cliente di test');
  assert((clienteComCollegata.adempimentiAnnualiApplicabili||[]).includes('DICH_IVA_ANNUALE'), 'adempimento annuale DICH_IVA_ANNUALE non salvato sul cliente di test');

  const opzioniCollegabili = window.adempimentiCollegabili();
  assert(opzioniCollegabili.some(a => a.valore === 'p:paghe'), 'adempimentiCollegabili non include il flag periodico "paghe"');
  assert(opzioniCollegabili.some(a => a.valore === 'a:DICH_IVA_ANNUALE'), 'adempimentiCollegabili non include la chiave annuale "DICH_IVA_ANNUALE"');
  assert(window.nomeAdempimentoCollegato('p:paghe') === 'F24 Paghe dipendenti', `nome atteso "F24 Paghe dipendenti", trovato "${window.nomeAdempimentoCollegato('p:paghe')}"`);

  const clientiPaghePrimaRimozione = window.clientiPerAdempimentoCollegato('p:paghe');
  assert(clientiPaghePrimaRimozione.includes(clienteComCollegata.id), 'clientiPerAdempimentoCollegato("p:paghe") non include il cliente di test appena creato');

  click(q('[data-nav="comunicazioni"]'));
  await wait(20);
  click(q('[data-action="nuova-comunicazione-ricorrente"]'));
  await wait(20);
  setVal(q('#crAdempimento'), 'p:paghe');
  await wait(20);
  assert(q('#crDestinatariWrap').style.display === 'none', 'destinatari manuali non nascosti dopo aver collegato un adempimento');
  assert(q('#crAdempimentoInfo').style.display !== 'none', 'info destinatari automatici non mostrata dopo aver collegato un adempimento');
  assert(q('#crAdempimentoInfoTxt').textContent.includes(String(clientiPaghePrimaRimozione.length)), `testo destinatari automatici deve mostrare il conteggio corrente (${clientiPaghePrimaRimozione.length}), trovato "${q('#crAdempimentoInfoTxt').textContent}"`);
  setVal(q('#crFrequenza'), 'Mensile');
  setVal(q('#crGiorno'), '1');
  setVal(q('#crOggetto'), 'Test comunicazione collegata a paghe');
  click(q('[data-action="salva-comunicazione-ricorrente"]'));
  await wait(20);
  const templateCollegato = window.getSTATE().comunicazioniRicorrenti.find(t => t.oggetto === 'Test comunicazione collegata a paghe');
  assert(templateCollegato, 'modello ricorrente collegato a un adempimento non salvato');
  assert(templateCollegato.adempimentoCollegato === 'p:paghe', `adempimentoCollegato atteso "p:paghe", trovato "${templateCollegato.adempimentoCollegato}"`);
  assert(templateCollegato.destinatari.modo === 'adempimento', 'destinatari.modo atteso "adempimento" per un modello collegato');

  templateCollegato.ultimaGenerazionePeriodo = null;
  const nComPrimaGenCollegata = window.getSTATE().comunicazioni.length;
  window.generaComunicazioniRicorrentiDovute();
  const nComDopoGenCollegata = window.getSTATE().comunicazioni.length;
  assert(nComDopoGenCollegata === nComPrimaGenCollegata + clientiPaghePrimaRimozione.length, `la generazione dal modello collegato deve creare una comunicazione per ciascuno dei ${clientiPaghePrimaRimozione.length} clienti con "paghe" attivo, create ${nComDopoGenCollegata - nComPrimaGenCollegata}`);
  const comGenerataPerTest = window.getSTATE().comunicazioni.find(c => c.generataDaRicorrenteId === templateCollegato.id && c.clienteId === clienteComCollegata.id);
  assert(comGenerataPerTest, 'comunicazione generata per il cliente di test non trovata');

  // togliendo il flag al cliente, la platea si aggiorna da sola al giro successivo (nessuna lista da tenere allineata a mano)
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q(`[data-action="modifica-cliente"][data-id="${clienteComCollegata.id}"]`));
  await wait(20);
  setChecked(q('[data-flag="paghe"]'), false);
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  const clientiPagheDopoRimozione = window.clientiPerAdempimentoCollegato('p:paghe');
  assert(!clientiPagheDopoRimozione.includes(clienteComCollegata.id), 'clientiPerAdempimentoCollegato("p:paghe") deve escludere il cliente dopo la rimozione del flag');
  templateCollegato.ultimaGenerazionePeriodo = null;
  const nComPrimaGenCollegata2 = window.getSTATE().comunicazioni.length;
  window.generaComunicazioniRicorrentiDovute();
  const nComDopoGenCollegata2 = window.getSTATE().comunicazioni.length;
  assert(nComDopoGenCollegata2 === nComPrimaGenCollegata2 + clientiPagheDopoRimozione.length, `dopo la rimozione del flag la generazione deve seguire la nuova platea (${clientiPagheDopoRimozione.length} clienti), create ${nComDopoGenCollegata2 - nComPrimaGenCollegata2}`);
  const comNonPiuGenerataPerTest = window.getSTATE().comunicazioni.find(c => c.generataDaRicorrenteId === templateCollegato.id && c.clienteId === clienteComCollegata.id && c.id !== comGenerataPerTest.id);
  assert(!comNonPiuGenerataPerTest, 'il cliente senza più il flag non deve ricevere una nuova comunicazione dal modello collegato');
  console.log('=== Comunicazioni ricorrenti collegate ad un adempimento: destinatari automatici che si aggiornano da soli OK');

  // pulizia
  window.getSTATE().comunicazioniRicorrenti = window.getSTATE().comunicazioniRicorrenti.filter(t => t.id !== templateCollegato.id);
  window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => c.generataDaRicorrenteId !== templateCollegato.id);
  window.salvaStato();
  click(q(`[data-action="modifica-cliente"][data-id="${clienteComCollegata.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-cliente"][data-id="${clienteComCollegata.id}"]`));
  await wait(20);
  assert(!window.clienteById(clienteComCollegata.id), 'cliente di test comunicazione collegata non eliminato');
  window.render();
  await wait(20);

  // ---------- 8d) Documenti: crea, verifica stato scadenza, elimina ----------
  click(q('[data-nav="documenti"]'));
  await wait(20);
  const nDocPrima = window.getSTATE().documenti.length;
  assert(nDocPrima === 8, `attesi 8 documenti demo, trovati ${nDocPrima}`);
  click(q('[data-action="nuovo-documento"]'));
  await wait(20);
  assert(q('#formDocumento'), 'form nuovo documento non renderizzato');
  assertNoAutoSubmit(q('#formDocumento'), 'formDocumento');
  // Nell'ambiente di test non c'è un server locale attivo (HTTP_SYNC_ATTIVO false): l'upload del
  // file vero deve essere disabilitato (nessun input file) con una spiegazione, non un errore muto.
  assert(window.HTTP_SYNC_ATTIVO === false, 'HTTP_SYNC_ATTIVO dovrebbe essere false senza server locale in ambiente di test');
  assert(!q('#dFile'), 'senza server locale attivo non deve comparire il campo di upload file');
  assert(q('.modal').textContent.includes('server locale'), 'manca la spiegazione che il caricamento file richiede il server locale');
  let rifiutoUpload = null;
  try { await window.uploadFileReale({ name: 'test.pdf' }, clientePerCom.id, 'Test', ''); } catch (e) { rifiutoUpload = e; }
  assert(rifiutoUpload, 'uploadFileReale dovrebbe rifiutare (reject) quando il server locale non è attivo, non tentare comunque');
  setVal(q('#dCliente'), clientePerCom.id);
  setVal(q('#dNome'), 'Documento di test');
  const dataScadPassata = new Date(Date.now() - 5*86400000).toISOString().slice(0,10);
  setVal(q('#dDataScadenza'), dataScadPassata);
  click(q('[data-action="salva-documento"]'));
  await wait(20);
  assert(window.getSTATE().documenti.length === nDocPrima + 1, 'nuovo documento non salvato');
  const docCreato = window.getSTATE().documenti.find(d => d.nome === 'Documento di test');
  assert(docCreato, 'documento di test non trovato in STATE');
  const badgeScaduto = qa('.badge.stato-errore').length;
  assert(badgeScaduto >= 1, 'documento con scadenza passata non mostra badge "Scaduto"');
  click(q(`[data-action="elimina-documento"][data-id="${docCreato.id}"]`));
  await wait(20);
  assert(window.getSTATE().documenti.length === nDocPrima, 'documento di test non eliminato');

  // ---- Task #112: categorie base dei documenti cliente (ampliate oltre le 6 generiche iniziali) ----
  const categorieAttese = ['Anagrafica', 'Visura camerale', 'Atto costitutivo/Statuto', 'Contratto', 'Bilancio', 'Dichiarazione fiscale', 'F24', 'Registro contabile', 'Busta paga', 'Certificazione', 'Corrispondenza Enti', 'Polizza assicurativa', 'Pratiche', 'Altro'];
  assert(JSON.stringify(window.CATEGORIE_DOCUMENTO) === JSON.stringify(categorieAttese), `CATEGORIE_DOCUMENTO non corrisponde all'elenco atteso, trovato: ${JSON.stringify(window.CATEGORIE_DOCUMENTO)}`);
  click(q('[data-action="nuovo-documento"]'));
  await wait(20);
  const opzioniCategoriaModal = Array.from(q('#dCategoria').options).map(o => o.value);
  assert(JSON.stringify(opzioniCategoriaModal) === JSON.stringify(categorieAttese), 'il <select> Categoria nel form "Nuovo documento" non elenca tutte le categorie base nell\'ordine atteso');
  setVal(q('#dCliente'), clientePerCom.id);
  setVal(q('#dNome'), 'Modello Redditi di prova');
  setVal(q('#dCategoria'), 'Dichiarazione fiscale');
  click(q('[data-action="salva-documento"]'));
  await wait(20);
  const docConCategoriaNuova = window.getSTATE().documenti.find(d => d.nome === 'Modello Redditi di prova');
  assert(docConCategoriaNuova && docConCategoriaNuova.categoria === 'Dichiarazione fiscale', 'la nuova categoria "Dichiarazione fiscale" non è stata salvata correttamente sul documento');
  assert(q(`[data-action="elimina-documento"][data-id="${docConCategoriaNuova.id}"]`).closest('tr').textContent.includes('Dichiarazione fiscale'), 'la tabella documenti non mostra la nuova categoria sulla riga corrispondente');
  // il filtro Categoria in cima alla vista deve includere anche le nuove voci, non solo le 6 originali
  const opzioniFiltroCategoria = Array.from(q('[data-action="doc-filtro-categoria"]').options).map(o => o.value);
  assert(opzioniFiltroCategoria.includes('F24') && opzioniFiltroCategoria.includes('Busta paga') && opzioniFiltroCategoria.includes('Registro contabile'), 'il filtro Categoria nella vista Documenti non include le nuove categorie base');
  setVal(q('[data-action="doc-filtro-categoria"]'), 'Dichiarazione fiscale');
  await wait(20);
  // NB: si controlla il testo di #content (l'area effettivamente renderizzata), non dell'intero
  // document.body: quest'ultimo include anche il sorgente dei tag <script> (textContent, a differenza
  // di innerText, non esclude script/style), e la stringa 'Visura camerale aggiornata' esiste sempre
  // nei dati demo incorporati nello script — quindi il controllo su body.textContent non potrebbe MAI
  // passare, a prescindere dal comportamento reale del filtro.
  const testoVistaDocumenti = q('#content').textContent;
  assert(testoVistaDocumenti.includes('Modello Redditi di prova') && !testoVistaDocumenti.includes('Visura camerale aggiornata'), 'il filtro per la nuova categoria "Dichiarazione fiscale" non isola correttamente i documenti');
  setVal(q('[data-action="doc-filtro-categoria"]'), 'Tutti');
  await wait(20);
  click(q(`[data-action="elimina-documento"][data-id="${docConCategoriaNuova.id}"]`));
  await wait(20);
  assert(window.getSTATE().documenti.length === nDocPrima, 'documento di test con la nuova categoria non eliminato correttamente');
  console.log('=== Task #112: categorie base dei documenti cliente ampliate, selezionabili e filtrabili correttamente OK');
  console.log('=== Documenti: creazione, badge scaduto ed eliminazione OK');

  // ---------- 8d-bis) Auto-classificazione documenti (task #120): suggerimento categoria dal nome ----------
  // Nessuna struttura dati a parte: si "insegnano" dei pattern semplicemente salvando documenti già
  // categorizzati (proprio come farebbe l'utente nell'uso normale), poi si verifica che la funzione
  // pura di suggerimento li riconosca — prima della soglia minima (2 esempi) niente suggerimento,
  // dopo sì. "DURC" e "locazione" sono scelte deliberatamente lontane dai nomi dei documenti demo
  // già presenti, per non dipendere da conteggi preesistenti fragili.
  assert(window.suggerisciCategoriaDocumento('Nuovo contratto di locazione Vicenza') === null, 'con zero documenti storici corrispondenti il suggerimento non dovrebbe scattare');
  window.aggiungiDocumento({ clienteId: clientePerCom.id, nome: 'Contratto locazione ufficio Verona', categoria: 'Contratto', dataCaricamento: window.oggiISO() });
  assert(window.suggerisciCategoriaDocumento('Nuovo contratto di locazione Vicenza') === null, 'con un solo documento storico corrispondente il suggerimento non dovrebbe ancora scattare (soglia minima 2)');
  window.aggiungiDocumento({ clienteId: clientePerCom.id, nome: 'Contratto locazione magazzino', categoria: 'Contratto', dataCaricamento: window.oggiISO() });
  assert(window.suggerisciCategoriaDocumento('Nuovo contratto di locazione Vicenza') === 'Contratto', 'con 2 documenti storici concordanti il suggerimento dovrebbe proporre "Contratto"');
  window.aggiungiDocumento({ clienteId: clientePerCom.id, nome: 'DURC gennaio 2026', categoria: 'Certificazione', dataCaricamento: window.oggiISO() });
  window.aggiungiDocumento({ clienteId: clientePerCom.id, nome: 'DURC febbraio 2026', categoria: 'Certificazione', dataCaricamento: window.oggiISO() });
  assert(window.suggerisciCategoriaDocumento('DURC marzo 2026') === 'Certificazione', 'pattern "DURC" -> Certificazione non riconosciuto dopo 2 esempi storici');
  console.log('=== Auto-classificazione documenti: funzione di suggerimento riconosce i pattern solo dopo almeno 2 esempi storici concordanti');

  // Ora lo stesso comportamento, ma passando dalla UI reale del modale "Nuovo documento": si digita
  // nel campo Nome (senza mai chiamare render(), altrimenti si perderebbe il focus a metà parola) e
  // si verifica che il <select> Categoria si aggiorni da solo — poi che una scelta manuale successiva
  // dell'utente venga rispettata e non più sovrascritta mentre continua a digitare.
  click(q('[data-action="nuovo-documento"]'));
  await wait(20);
  setVal(q('#dCliente'), clientePerCom.id);
  const campoNomeDoc = q('#dNome');
  assert(q('#dCategoriaSuggerimento').textContent === '', 'il suggerimento non dovrebbe comparire a modale appena aperto, campo nome vuoto');
  setVal(campoNomeDoc, 'DURC aprile 2026');
  await wait(20);
  assert(q('#dCategoria').value === 'Certificazione', 'digitando un nome con pattern riconosciuto ("DURC") la categoria non si auto-seleziona');
  assert(q('#dCategoriaSuggerimento').textContent.includes('Certificazione'), 'il testo che spiega il suggerimento non compare o non è corretto');
  // l'utente sceglie a mano una categoria diversa da quella suggerita: da qui in poi deve restare la sua
  setVal(q('#dCategoria'), 'Corrispondenza Enti');
  await wait(20);
  setVal(campoNomeDoc, 'DURC aprile 2026 aggiornato');
  await wait(20);
  assert(q('#dCategoria').value === 'Corrispondenza Enti', 'una categoria scelta manualmente viene sovrascritta dal suggerimento automatico mentre si continua a digitare il nome');
  click(q('[data-action="salva-documento"]'));
  await wait(20);
  const docDurc = window.getSTATE().documenti.find(d => d.nome === 'DURC aprile 2026 aggiornato');
  assert(docDurc && docDurc.categoria === 'Corrispondenza Enti', 'la categoria scelta manualmente dall\'utente non è stata salvata correttamente (il suggerimento l\'ha sovrascritta a insaputa dell\'utente)');
  console.log('=== Auto-classificazione documenti: suggerimento applicato live nel form, rispettata una scelta manuale successiva dell\'utente');

  // pulizia: rimuove tutti i documenti di addestramento/test creati in questa sezione
  ['Contratto locazione ufficio Verona', 'Contratto locazione magazzino', 'DURC gennaio 2026', 'DURC febbraio 2026', 'DURC aprile 2026 aggiornato'].forEach(nome => {
    const d = window.getSTATE().documenti.find(x => x.nome === nome);
    if (d) window.eliminaDocumento(d.id);
  });
  window.render();
  await wait(20);
  assert(window.getSTATE().documenti.length === nDocPrima, 'pulizia post-test auto-classificazione non ha ripristinato il conteggio documenti originale');

  // ---------- 8d-ter) Motore modelli documento: funzioni pure (task #123, fix segnaposto riservati) ----------
  const modelloPrevDefTest = window.getSTATE().modelliDocumento.find(m => m.categoria === 'Preventivo');
  assert(modelloPrevDefTest, 'modello di default "Preventivo" non trovato (seed task #127)');
  const campiPersPrevTest = window.placeholderPersonalizzatiModello(modelloPrevDefTest.corpo);
  assert(campiPersPrevTest.length === 2 && campiPersPrevTest.includes('dettaglioAttivita') && campiPersPrevTest.includes('condizioniPagamento'), `il modello Preventivo dovrebbe esporre 2 campi personalizzati (dettaglioAttivita, condizioniPagamento), trovati: ${campiPersPrevTest.join(', ')}`);
  assert(!campiPersPrevTest.includes('oggetto') && !campiPersPrevTest.includes('importo') && !campiPersPrevTest.includes('dataEmissione') && !campiPersPrevTest.includes('validoFino'), 'i segnaposto riservati (oggetto/importo/dataEmissione/validoFino) non devono diventare campi personalizzati del form: hanno già un input dedicato');
  const corpoRisolto = window.risolviTemplateDocumento('Ciao {{cliente.ragioneSociale}}, ti scrive {{studio.nome}}. Manca: {{nonEsisteAncora}}.', clientePerCom.id, {});
  assert(corpoRisolto.includes(window.nomeCliente(clientePerCom.id)), 'risolviTemplateDocumento non sostituisce correttamente un placeholder automatico cliente');
  assert(corpoRisolto.includes(window.getSTATE().meta.studioNome), 'risolviTemplateDocumento non sostituisce correttamente un placeholder automatico studio');
  assert(corpoRisolto.includes('[nonEsisteAncora]'), 'un placeholder personalizzato non compilato deve restare visibile tra parentesi quadre invece di sparire in silenzio');
  assert(window.categoriaEAml('AML - Dichiarazione cliente') && window.categoriaEAml('aml - test') && !window.categoriaEAml('Preventivo'), 'la convenzione di naming "AML*" per categoriaEAml non funziona come atteso');
  console.log('=== Motore modelli documento: segnaposto riservati esclusi dai campi personalizzati, sostituzione automatica/personalizzata OK, placeholder mancante visibile, convenzione naming AML OK');

  // ---------- 8d-ter-bis) Compilazione guidata campi modello AML (richiesto da Matteo: etichette
  // leggibili + raggruppamento invece di caselle tipo "ESECUTORENOME" senza direzione) ----------
  {
    const raggruppati = window.raggruppaCampiPersonalizzatiModello(['clienteRea', 'esecutoreNome', 'esecutoreCf', 'esecutoreNascita', 'esecutoreCittadinanza', 'esecutoreResidenza', 'esecutoreDocumento', 'scopoPrestazione']);
    const gruppoEsecutore = raggruppati.find(v => v.tipo === 'gruppo' && v.label === 'Esecutore');
    assert(gruppoEsecutore, 'i 6 campi "esecutore*" del modello AML dovrebbero formare un gruppo "Esecutore"');
    assert(gruppoEsecutore.campi.length === 6, `attesi 6 campi nel gruppo "Esecutore", trovati ${gruppoEsecutore.campi.length}`);
    assert(gruppoEsecutore.campi.find(c => c.chiave === 'esecutoreNascita' && c.label === 'Nascita'), 'il campo "esecutoreNascita" dentro il gruppo dovrebbe avere l\'etichetta breve "Nascita", non la chiave grezza');
    const campoRea = raggruppati.find(v => v.tipo === 'campo' && v.chiave === 'clienteRea');
    assert(campoRea && campoRea.label === 'Cliente Rea', `"clienteRea" (unico col suo prefisso) dovrebbe restare un campo singolo con etichetta leggibile "Cliente Rea", trovato: ${campoRea && campoRea.label}`);
    const campoScopo = raggruppati.find(v => v.tipo === 'campo' && v.chiave === 'scopoPrestazione');
    assert(campoScopo && campoScopo.label === 'Scopo Prestazione', `"scopoPrestazione" dovrebbe restare un campo singolo con etichetta leggibile, trovato: ${campoScopo && campoScopo.label}`);
    console.log('=== raggruppaCampiPersonalizzatiModello (unit): campi con prefisso condiviso raggruppati, campi isolati con etichetta leggibile OK');

    // Stessa cosa, ma nel modale vero: apre "Nuovo documento" per il modello AML e verifica che il
    // form mostri davvero la sezione "Esecutore" raggruppata invece delle textarea grezze.
    window.modalPreventivo(null, null, true);
    await wait(20);
    assert(q('#formPreventivo'), 'form nuovo documento AML non renderizzato');
    const testoForm = q('#formPreventivo').textContent;
    assert(testoForm.includes('Esecutore'), 'il form del documento AML dovrebbe mostrare l\'intestazione di gruppo "Esecutore"');
    assert(testoForm.includes('Nascita') && !testoForm.includes('ESECUTORENASCITA') && !testoForm.includes('esecutoreNascita'), 'dentro il gruppo l\'etichetta dovrebbe essere la breve "Nascita", non la chiave grezza del segnaposto');
    const campoNascitaInput = qa('#formPreventivo [data-campo-custom]').find(el => el.dataset.chiave === 'esecutoreNascita');
    assert(campoNascitaInput && campoNascitaInput.tagName === 'INPUT', 'i campi dentro un gruppo dovrebbero essere input su una riga, non textarea');
    const campoScopoInput = qa('#formPreventivo [data-campo-custom]').find(el => el.dataset.chiave === 'scopoPrestazione');
    assert(campoScopoInput && campoScopoInput.tagName === 'TEXTAREA', 'un campo isolato come "scopoPrestazione" dovrebbe restare una textarea, non essere convertito a input');
    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    console.log('=== Modale "Nuovo documento" AML: sezione "Esecutore" raggruppata renderizzata correttamente nel form OK');
  }

  // ---------- 8d-quater) Preventivi e mandati sul motore a modelli (task #121, riscritto #125) ----------
  click(q('[data-nav="preventivi"]'));
  await wait(20);
  const prevNonAmlPrima = window.getSTATE().preventivi.filter(p => !window.categoriaEAml(p.categoria));
  assert(prevNonAmlPrima.length === 4, `attesi 4 preventivi/mandati demo non-AML, trovati ${prevNonAmlPrima.length}`);
  assert(window.getSTATE().preventivi.length === 6, `attesi 6 documenti totali in STATE.preventivi (4 non-AML + 2 AML demo), trovati ${window.getSTATE().preventivi.length}`);
  const kpiPrevNums = qa('.kpi-grid .kpi .n').map(el => el.textContent);
  assert(kpiPrevNums[0] === String(prevNonAmlPrima.length), `KPI "totale documenti" (${kpiPrevNums[0]}) non coincide col numero di documenti non-AML in STATE (${prevNonAmlPrima.length})`);
  const prevAccettato = prevNonAmlPrima.find(p => p.stato === 'Accettato');
  assert(prevAccettato, 'nessun preventivo/mandato demo con stato Accettato trovato, il test successivo non può verificare il KPI valore accettato');
  const cifraKpiAccettato = Number(q('.kpi-grid .kpi.futuri .n').textContent.replace(/[^\d]/g, ''));
  assert(cifraKpiAccettato === prevAccettato.importo, `il KPI "valore accettato" (${cifraKpiAccettato}) non riflette l'importo del documento Accettato demo (${prevAccettato.importo})`);

  // creazione: apre il modale, valida i campi obbligatori, sceglie prima il CLIENTE e poi il
  // MODELLO (in quest'ordine): verifica che cambiare modello dopo aver scelto il cliente non perda
  // più il cliente già scelto (bug corretto in questa sessione, vedi modalPreventivo/docm-cambia-*).
  click(q('[data-action="nuovo-preventivo"]'));
  await wait(20);
  assert(q('#formPreventivo'), 'form nuovo preventivo/mandato non renderizzato');
  assertNoAutoSubmit(q('#formPreventivo'), 'formPreventivo');
  click(q('[data-action="salva-preventivo"]')); // senza compilare i campi obbligatori: non deve salvare nulla
  await wait(20);
  assert(window.getSTATE().preventivi.length === 6, 'il salvataggio senza Oggetto compilato non dovrebbe creare un documento');
  assert(q('#formPreventivo'), 'il modale non dovrebbe chiudersi se la validazione fallisce');

  setVal(q('#pCliente'), clientePerCom.id);
  await wait(20);
  assert(q('#pCliente') && q('#pCliente').value === clientePerCom.id, 'dopo aver scelto un cliente dal menu libero il selettore dovrebbe restare un menu (non bloccato) con quel cliente selezionato');
  const modelloMandatoTest = window.getSTATE().modelliDocumento.find(m => m.categoria === 'Mandato professionale');
  assert(modelloMandatoTest, 'modello di default "Mandato professionale" non trovato (seed task #127)');
  setVal(q('#pModello'), modelloMandatoTest.id);
  await wait(20);
  assert(q('#pCliente') && q('#pCliente').value === clientePerCom.id, 'cambiando modello dopo aver scelto il cliente, il cliente scelto è andato perso (bug che questa sessione doveva correggere)');
  assert(q('#pModello').value === modelloMandatoTest.id, 'il modello scelto non risulta selezionato dopo il cambio');
  const campiCustomForm = qa('#formPreventivo [data-campo-custom]');
  assert(campiCustomForm.length === 2, `attesi 2 campi personalizzati per il modello Mandato professionale, trovati ${campiCustomForm.length}`);
  setVal(q('#pOggetto'), 'Test mandato automatico');
  setVal(q('#pImporto'), '999');
  setVal(campiCustomForm.find(el => el.dataset.chiave === 'dettaglioAttivita'), 'Attività di prova per il test end-to-end.');
  setVal(campiCustomForm.find(el => el.dataset.chiave === 'condizioniPagamento'), 'Pagamento a 30 giorni, a titolo di prova.');
  click(q('[data-action="salva-preventivo"]'));
  await wait(20);
  assert(window.getSTATE().preventivi.length === 7, 'nuovo preventivo/mandato non salvato');
  const prevCreato = window.getSTATE().preventivi.find(p => p.oggetto === 'Test mandato automatico');
  assert(prevCreato, 'documento di test non trovato in STATE');
  assert(prevCreato.categoria === 'Mandato professionale' && prevCreato.modelloId === modelloMandatoTest.id && prevCreato.stato === 'Bozza' && prevCreato.importo === 999 && prevCreato.clienteId === clientePerCom.id, 'i campi del documento appena creato non corrispondono a quanto inserito nel form');
  assert(prevCreato.valoriCustom.dettaglioAttivita === 'Attività di prova per il test end-to-end.', 'il valore del campo personalizzato "dettaglioAttivita" non è stato salvato');
  assert(q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`).closest('tr').textContent.includes('Test mandato automatico'), 'la tabella preventivi non mostra il nuovo documento appena creato');

  // il testo generato deve contenere i dati automatici (cliente/studio) e quelli personalizzati
  // inseriti, e non deve restare nessun segnaposto {{...}} non risolto
  assert(prevCreato.corpo.includes(window.nomeCliente(clientePerCom.id)), 'il documento generato non contiene la ragione sociale del cliente');
  assert(prevCreato.corpo.includes('Test mandato automatico'), 'il documento generato non contiene l\'oggetto inserito (segnaposto riservato {{oggetto}})');
  assert(prevCreato.corpo.includes(window.getSTATE().meta.studioNome), 'il documento generato non contiene il nome dello studio');
  assert(prevCreato.corpo.includes('Attività di prova per il test end-to-end.'), 'il documento generato non contiene il testo del campo personalizzato "dettaglioAttivita"');
  assert(!prevCreato.corpo.includes('{{'), 'il documento generato contiene ancora segnaposto {{...}} non risolti');

  // dettaglio: l'anteprima (editabile) mostra lo stesso testo salvato, poi cambia stato dal select del dettaglio
  click(q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`));
  await wait(20);
  assert(q('#prevAnteprimaCorpo') && q('#prevAnteprimaCorpo').value === prevCreato.corpo, 'l\'anteprima del dettaglio non mostra il testo salvato sul documento');
  assert(q('[data-action="preventivo-rigenera"]'), 'il pulsante "Rigenera dal modello" dovrebbe essere presente: il modello di origine esiste ancora');
  setVal(q('[data-action="prev-cambia-stato"]'), 'Accettato');
  await wait(20);
  assert(window.getSTATE().preventivi.find(p => p.id === prevCreato.id).stato === 'Accettato', 'il cambio di stato dal dettaglio non è stato salvato in STATE');
  assert(q('[data-action="prev-cambia-stato"]').value === 'Accettato', 'il select di stato nel dettaglio (riaperto dopo il cambio) non mostra il nuovo stato');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  const badgesRigaPrev = q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`).closest('tr').querySelectorAll('.badge');
  assert(badgesRigaPrev[1].textContent.includes('Accettato'), 'la riga di tabella non riflette il nuovo stato dopo la chiusura del dettaglio'); // [0]=badge Categoria, [1]=badge Stato

  // ritocco manuale del testo ("Salva testo") e successiva rigenerazione dal modello: il ritocco
  // manuale deve sparire dopo "Rigenera dal modello" (con conferma, mockata a true in questo test)
  click(q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`));
  await wait(20);
  setVal(q('#prevAnteprimaCorpo'), prevCreato.corpo + '\n\nP.S. ritocco manuale di prova.');
  click(q('[data-action="preventivo-salva-testo"]'));
  await wait(20);
  assert(window.getSTATE().preventivi.find(p => p.id === prevCreato.id).corpo.includes('P.S. ritocco manuale di prova.'), 'il ritocco manuale del testo ("Salva testo") non è stato salvato in STATE');
  click(q('[data-action="preventivo-rigenera"]'));
  await wait(20);
  const corpoDopoRigenera = window.getSTATE().preventivi.find(p => p.id === prevCreato.id).corpo;
  assert(!corpoDopoRigenera.includes('P.S. ritocco manuale di prova.'), '"Rigenera dal modello" dovrebbe scartare il ritocco manuale precedente e ripartire dal modello');
  assert(corpoDopoRigenera.includes('Test mandato automatico') && corpoDopoRigenera.includes('Attività di prova per il test end-to-end.'), 'il testo rigenerato dal modello ha perso i dati del documento (oggetto/campi personalizzati)');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // modifica dal modale combinato: cliente e modello sono bloccati (testo, non selezionabili) in modifica
  click(q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`));
  await wait(20);
  click(q('[data-action="modifica-preventivo"]'));
  await wait(20);
  assert(!q('#pCliente') && !q('#pModello'), 'in modifica cliente e modello non dovrebbero più essere selezionabili (solo testo informativo)');
  assert(q('#pOggetto').value === 'Test mandato automatico', 'il modale di modifica non è precompilato con i dati esistenti');
  const campoCustomModifica = qa('#formPreventivo [data-campo-custom]').find(el => el.dataset.chiave === 'dettaglioAttivita');
  assert(campoCustomModifica && campoCustomModifica.value === 'Attività di prova per il test end-to-end.', 'in modifica i campi personalizzati non sono precompilati con i valori esistenti');
  setVal(q('#pOggetto'), 'Test mandato automatico modificato');
  click(q('[data-action="salva-preventivo"]'));
  await wait(20);
  assert(window.getSTATE().preventivi.find(p => p.id === prevCreato.id).oggetto === 'Test mandato automatico modificato', 'la modifica del documento esistente non è stata salvata');
  assert(window.getSTATE().preventivi.length === 7, 'la modifica ha creato un duplicato invece di aggiornare il documento esistente');

  // filtri: per cliente/categoria/stato — deve essere un cliente DIVERSO da quello usato per prevCreato
  const prevClienteEsempio = prevNonAmlPrima.find(p => p.clienteId !== clientePerCom.id);
  assert(prevClienteEsempio, 'precondizione test filtro: serve un preventivo/mandato demo legato a un cliente diverso da quello del documento di test');
  setVal(q('[data-action="prev-filtro-cliente"]'), prevClienteEsempio.clienteId);
  await wait(20);
  const testoFiltrato = q('#content').textContent;
  assert(testoFiltrato.includes(prevClienteEsempio.oggetto) && !testoFiltrato.includes('Test mandato automatico modificato'), 'il filtro per cliente non isola correttamente i documenti');
  setVal(q('[data-action="prev-filtro-cliente"]'), 'Tutti');
  await wait(20);
  setVal(q('[data-action="prev-filtro-categoria"]'), 'Mandato professionale');
  await wait(20);
  assert(q('#content').textContent.includes('Test mandato automatico modificato'), 'il filtro per categoria "Mandato professionale" dovrebbe includere il documento di test');
  assert(!q('#content').textContent.includes(prevNonAmlPrima.find(p => p.categoria === 'Preventivo').oggetto), 'il filtro per categoria non isola correttamente i documenti di altre categorie');
  setVal(q('[data-action="prev-filtro-categoria"]'), 'Tutti');
  await wait(20);

  // eliminazione con conferma
  click(q(`[data-action="elimina-preventivo"][data-id="${prevCreato.id}"]`));
  await wait(20);
  assert(window.getSTATE().preventivi.length === 6, 'il documento di test non è stato eliminato');
  assert(!q(`[data-action="apri-preventivo"][data-id="${prevCreato.id}"]`), 'il documento eliminato è ancora presente in tabella');
  console.log('=== Preventivi e mandati: creazione con cliente scelto prima del modello (bug corretto), campi personalizzati, anteprima editabile, salva testo, rigenera dal modello, cambio stato, modifica, filtri ed eliminazione OK');

  // ---------- 8d-quater-bis) Attività a listino dello studio: catalogo, calcolo automatico, collegamento preventivo->mandato (task #138) ----------
  {
    const catalogoPrima = window.getSTATE().catalogoAttivitaStudio;
    assert(Array.isArray(catalogoPrima) && catalogoPrima.length === 8, `attese 8 attività di listino seed, trovate ${catalogoPrima ? catalogoPrima.length : 'undefined'}`);
    const attivitaConMandato = catalogoPrima.find(a => a.richiedeMandato);
    const attivitaSenzaMandato = catalogoPrima.find(a => !a.richiedeMandato && a.prezzo != null);
    assert(attivitaConMandato && attivitaSenzaMandato, 'precondizione: servono un\'attività seed con richiedeMandato true e una senza, entrambe con prezzo');

    // CRUD del catalogo da Impostazioni
    click(q('[data-nav="impostazioni"]'));
    await wait(20);
    click(q('[data-action="imp-sezione"][data-sezione="catalogo"]'));
    await wait(20);
    assert(q('body').textContent.includes('Attività e tariffario dello studio'), 'sezione catalogo attività non presente in Impostazioni');
    click(q('[data-action="nuova-attivita-catalogo"]'));
    await wait(20);
    assert(q('#formAttivitaCatalogo'), 'form nuova attività non renderizzato');
    assertNoAutoSubmit(q('#formAttivitaCatalogo'), 'formAttivitaCatalogo');
    click(q('[data-action="salva-attivita-catalogo"]')); // senza nome: non deve salvare
    await wait(20);
    assert(window.getSTATE().catalogoAttivitaStudio.length === 8, 'il salvataggio senza nome non dovrebbe creare un\'attività');
    setVal(q('#acNome'), 'Attività di test end-to-end');
    setVal(q('#acDescrizione'), 'Descrizione di prova.');
    setVal(q('#acPrezzo'), '333.50');
    setChecked(q('#acRichiedeMandato'), true);
    click(q('[data-action="salva-attivita-catalogo"]'));
    await wait(20);
    assert(window.getSTATE().catalogoAttivitaStudio.length === 9, 'nuova attività di listino non salvata');
    const attTest = window.getSTATE().catalogoAttivitaStudio.find(a => a.nome === 'Attività di test end-to-end');
    assert(attTest && attTest.prezzo === 333.5 && attTest.richiedeMandato === true, 'campi dell\'attività appena creata non salvati correttamente');
    click(q(`[data-action="modifica-attivita-catalogo"][data-id="${attTest.id}"]`));
    await wait(20);
    assert(q('#acNome').value === 'Attività di test end-to-end', 'il modale di modifica non è precompilato con i dati esistenti');
    setVal(q('#acPrezzo'), '400');
    click(q(`[data-action="salva-attivita-catalogo"][data-id="${attTest.id}"]`));
    await wait(20);
    assert(window.getSTATE().catalogoAttivitaStudio.find(a => a.id === attTest.id).prezzo === 400, 'la modifica del prezzo non è stata salvata');
    console.log('=== Task #138: catalogo attività/tariffario dello studio — CRUD da Impostazioni OK');

    // selezione attività nel modale Preventivo: calcolo automatico dell'importo + auto-compilazione
    // del campo personalizzato "dettaglioAttivita" già presente nel modello standard di Matteo
    click(q('[data-nav="preventivi"]'));
    await wait(20);
    const clientePerAttivita = window.getSTATE().clienti.find(c => c.stato !== 'cessato');
    click(q('[data-action="nuovo-preventivo"]'));
    await wait(20);
    setVal(q('#pCliente'), clientePerAttivita.id);
    await wait(20);
    const modelloPreventivoAttivita = window.getSTATE().modelliDocumento.find(m => m.categoria === 'Preventivo');
    setVal(q('#pModello'), modelloPreventivoAttivita.id);
    await wait(20);
    assert(q('[data-attivita-catalogo]'), 'checklist attività dal catalogo non renderizzata nel modale preventivo');
    const checkConMandato = q(`[data-attivita-catalogo][data-id="${attivitaConMandato.id}"]`);
    const checkSenzaMandato = q(`[data-attivita-catalogo][data-id="${attivitaSenzaMandato.id}"]`);
    setChecked(checkConMandato, true);
    await wait(20);
    assert(Number(q('#pImporto').value) === attivitaConMandato.prezzo, 'selezionando un\'attività l\'importo non si calcola automaticamente');
    setChecked(checkSenzaMandato, true);
    await wait(20);
    assert(Number(q('#pImporto').value) === (attivitaConMandato.prezzo + attivitaSenzaMandato.prezzo), 'selezionando una seconda attività l\'importo non si ricalcola sulla somma');
    const campoDettaglioTest = q('#campoDettaglioAttivita');
    assert(campoDettaglioTest, 'il campo "dettaglioAttivita" del modello Preventivo dovrebbe avere l\'id speciale per l\'auto-compilazione');
    assert(campoDettaglioTest.value.includes(attivitaConMandato.nome) && campoDettaglioTest.value.includes(attivitaSenzaMandato.nome) && campoDettaglioTest.value.includes('Totale:'), 'il campo dettaglioAttivita non si è auto-compilato con l\'elenco attività e il totale');
    setVal(q('#pOggetto'), 'Preventivo test attività a listino');
    click(q('[data-action="salva-preventivo"]'));
    await wait(20);
    const prevConAttivita = window.getSTATE().preventivi.find(p => p.oggetto === 'Preventivo test attività a listino');
    assert(prevConAttivita, 'preventivo con attività non salvato');
    assert(prevConAttivita.attivitaScelte && prevConAttivita.attivitaScelte.length === 2, 'attivitaScelte non salvate sul documento');
    assert(prevConAttivita.attivitaScelte.some(a => a.id === attivitaConMandato.id && a.richiedeMandato === true), 'lo snapshot attivitaScelte non conserva richiedeMandato');
    assert(prevConAttivita.corpo.includes('Totale:'), 'il testo generato non contiene l\'elenco attività auto-compilato (segnaposto {{dettaglioAttivita}} risolto)');
    console.log('=== Task #138: selezione attività nel modale preventivo calcola l\'importo e compila dettaglioAttivita in automatico OK');

    // collegamento preventivo -> mandato: compare solo dopo l'accettazione, e solo una volta
    click(q(`[data-action="apri-preventivo"][data-id="${prevConAttivita.id}"]`));
    await wait(20);
    assert(!q('[data-action="preventivo-genera-mandato"]'), 'il pulsante "Genera mandato" non dovrebbe comparire prima dell\'accettazione');
    setVal(q('[data-action="prev-cambia-stato"]'), 'Accettato');
    await wait(20);
    assert(q(`[data-action="preventivo-genera-mandato"][data-id="${prevConAttivita.id}"]`), 'il pulsante "Genera mandato collegato" dovrebbe comparire ora che il preventivo è Accettato e richiede un mandato');
    click(q(`[data-action="preventivo-genera-mandato"][data-id="${prevConAttivita.id}"]`));
    await wait(20);
    const mandatoGenerato = window.getSTATE().preventivi.find(p => p.preventivoOrigineId === prevConAttivita.id);
    assert(mandatoGenerato, 'il mandato collegato non è stato creato');
    assert(mandatoGenerato.categoria === 'Mandato professionale' && mandatoGenerato.clienteId === prevConAttivita.clienteId && mandatoGenerato.importo === prevConAttivita.importo, 'i dati del mandato generato non corrispondono al preventivo di origine');
    assert(window.getSTATE().preventivi.find(p => p.id === prevConAttivita.id).mandatoGeneratoId === mandatoGenerato.id, 'il preventivo di origine non è stato marcato con mandatoGeneratoId');
    assert(q('h2').textContent.includes('Mandato professionale'), 'dopo la generazione il dettaglio dovrebbe aprirsi sul mandato appena creato');
    assert(q('.modal').textContent.includes(prevConAttivita.oggetto), 'il dettaglio del mandato generato non mostra il riferimento al preventivo di origine');
    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    click(q(`[data-action="apri-preventivo"][data-id="${prevConAttivita.id}"]`));
    await wait(20);
    assert(!q('[data-action="preventivo-genera-mandato"]'), 'il pulsante non dovrebbe più comparire: il mandato è già stato generato una volta');
    assert(q('.modal').textContent.includes('Mandato già generato'), 'il dettaglio del preventivo non segnala il mandato già generato');
    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    console.log('=== Task #138: collegamento preventivo -> mandato compare solo dopo l\'accettazione e genera un mandato precompilato una sola volta OK');

    // KPI "mandati generati" nella vista Preventivi riflette la conversione appena avvenuta
    click(q('[data-nav="preventivi"]'));
    await wait(20);
    const daConvertireAttesi = window.getSTATE().preventivi.filter(p => !window.categoriaEAml(p.categoria) && p.categoria === 'Preventivo' && p.stato === 'Accettato' && (p.attivitaScelte||[]).some(a => a.richiedeMandato));
    const convertitiAttesi = daConvertireAttesi.filter(p => p.mandatoGeneratoId).length;
    assert(convertitiAttesi >= 1, 'precondizione: ci si aspetta almeno un preventivo già convertito in mandato');
    const kpiConversioneTesto = qa('.kpi-grid .kpi .l').find(el => el.textContent.includes('MANDATI GENERATI'));
    assert(kpiConversioneTesto && kpiConversioneTesto.textContent.includes(`${convertitiAttesi}/${daConvertireAttesi.length}`), 'il KPI "mandati generati" non riflette il conteggio corretto');
    console.log('=== Task #138: KPI di conversione preventivo->mandato coerente con i dati OK');

    // pulizia: rimuove i documenti/l'attività di test creati in questo blocco
    window.getSTATE().preventivi = window.getSTATE().preventivi.filter(p => p.id !== prevConAttivita.id && p.id !== mandatoGenerato.id);
    window.getSTATE().catalogoAttivitaStudio = window.getSTATE().catalogoAttivitaStudio.filter(a => a.id !== attTest.id);
    window.salvaStato();
  }

  // Esportazione Word (.rtf): test unitario della funzione pura di generazione, non del download da
  // browser — jsdom non implementa URL.createObjectURL (vedi altrove in questa suite per il backup),
  // quindi qui basta verificare che il testo RTF generato sia corretto (intestazione, euristica di
  // grassetto sui titoli in maiuscolo, escape di graffe e caratteri accentati).
  {
    const rtf = window.generaRtfDaTesto('Studio Rossi\nSpett.le Cliente\n\nCONDIZIONI GENERALI\nTesto normale con {graffe} e caratteri accentati.');
    assert(rtf.startsWith('{\\rtf1'), 'il testo RTF generato non ha l\'intestazione RTF corretta');
    assert(rtf.includes('{\\b\\fs26 Studio Rossi}'), 'la prima riga (nome studio) dovrebbe essere in grassetto nell\'RTF');
    assert(rtf.includes('{\\b\\fs26 CONDIZIONI GENERALI}'), 'una riga tutta maiuscola dovrebbe diventare un titolo in grassetto nell\'RTF');
    assert(!rtf.includes('{graffe}') && rtf.includes('\\{graffe\\}'), 'le graffe nel testo originale devono essere escapate per non rompere la sintassi RTF');
    console.log('=== Task #138: generazione RTF per l\'esportazione Word — intestazione, grassetto sui titoli, escape delle graffe OK');
  }

  // ---------- 8d-quinquies) Modelli documenti: pagina di gestione CRUD (task #124) ----------
  click(q('[data-nav="modelli"]'));
  await wait(20);
  const nModelliPrima = window.getSTATE().modelliDocumento.length;
  assert(nModelliPrima === 4, `attesi 4 modelli di default (seed task #127), trovati ${nModelliPrima}`);
  assert(q('body').textContent.includes('Preventivo') && q('body').textContent.includes('AML - Dichiarazione cliente'), 'le categorie dei modelli di default non compaiono nella pagina Modelli documenti');

  click(q('[data-action="nuovo-modello"]'));
  await wait(20);
  assert(q('#formModello'), 'form nuovo modello non renderizzato');
  assertNoAutoSubmit(q('#formModello'), 'formModello');
  const categorieDatalist = qa('#modCategorieList option').map(o => o.value);
  ['Preventivo', 'Mandato professionale', 'Lettera di incarico', 'AML - Dichiarazione cliente', 'AML - Nota di accettazione incarico'].forEach(cat => {
    assert(categorieDatalist.includes(cat), `la categoria base "${cat}" non compare nel datalist di suggerimento`);
  });
  click(q('[data-action="salva-modello"]')); // senza compilare nulla: non deve salvare
  await wait(20);
  assert(window.getSTATE().modelliDocumento.length === nModelliPrima, 'il salvataggio di un modello senza categoria/nome/testo non dovrebbe creare nulla');

  setVal(q('#modCategoria'), 'Preventivo'); // stessa categoria del modello predefinito esistente
  setVal(q('#modNome'), 'Preventivo di prova (test)');
  setVal(q('#modCorpo'), 'Testo iniziale di prova per {{cliente.ragioneSociale}}, oggetto: {{oggetto}}, nota libera: {{notaLibera}}.');
  await wait(20);
  // Task #175: il testo digitato resta invariato (il formato salvato non cambia, solo l'aspetto)
  // e il backdrop sotto la textarea mostra gli stessi segnaposto avvolti in <mark> colorati.
  assert(q('#modCorpo').value === 'Testo iniziale di prova per {{cliente.ragioneSociale}}, oggetto: {{oggetto}}, nota libera: {{notaLibera}}.', 'il testo del modello non dovrebbe essere alterato dall\'evidenziazione visiva dei segnaposto');
  const backdropIniziale = q('#modCorpoHighlight');
  assert(backdropIniziale, 'manca il div di evidenziazione (#modCorpoHighlight) accanto alla textarea del modello (task #175)');
  assert(backdropIniziale.querySelectorAll('mark').length === 3, `attesi 3 segnaposto evidenziati (<mark>) nel backdrop, trovati ${backdropIniziale.querySelectorAll('mark').length}`);
  assert(backdropIniziale.innerHTML.includes('<mark>{{cliente.ragioneSociale}}</mark>'), 'il segnaposto {{cliente.ragioneSociale}} non risulta evidenziato nel backdrop');
  click(q('[data-action="modello-inserisci-placeholder"][data-chiave="studio.nome"]'));
  await wait(20);
  assert(q('#modCorpo').value.includes('{{studio.nome}}'), 'il pulsante di inserimento rapido del segnaposto non ha aggiunto il token nel testo del modello');
  assert(q('#modCorpoHighlight').innerHTML.includes('<mark>{{studio.nome}}</mark>'), 'il backdrop non si è aggiornato dopo l\'inserimento rapido del segnaposto (evento input sintetico mancante?)');
  setChecked(q('#modPredefinito'), true);
  click(q('[data-action="salva-modello"]'));
  await wait(20);
  assert(window.getSTATE().modelliDocumento.length === nModelliPrima + 1, 'nuovo modello di test non salvato');
  const modelloTest = window.getSTATE().modelliDocumento.find(m => m.nome === 'Preventivo di prova (test)');
  assert(modelloTest, 'modello di test non trovato in STATE');
  assert(modelloTest.categoria === 'Preventivo' && modelloTest.predefinito === true, 'categoria o flag predefinito del modello di test non salvati correttamente');
  const campiModelloTest = window.placeholderPersonalizzatiModello(modelloTest.corpo);
  assert(campiModelloTest.length === 1 && campiModelloTest[0] === 'notaLibera', `il modello di test dovrebbe esporre solo il campo personalizzato "notaLibera" (oggetto è riservato), trovati: ${campiModelloTest.join(', ')}`);
  const modelloPreventivoOriginale = window.getSTATE().modelliDocumento.find(m => m.nome === 'Preventivo standard');
  assert(modelloPreventivoOriginale && modelloPreventivoOriginale.predefinito === false, 'il modello "Preventivo standard" dovrebbe aver perso il flag predefinito a favore del nuovo modello di test nella stessa categoria (un solo predefinito per categoria)');
  console.log('=== Modelli documenti: creazione, validazione, datalist categorie, inserimento rapido segnaposto, esclusività del flag "predefinito" per categoria OK');

  // duplicazione
  click(q(`[data-action="duplica-modello"][data-id="${modelloTest.id}"]`));
  await wait(20);
  assert(window.getSTATE().modelliDocumento.length === nModelliPrima + 2, 'la duplicazione del modello di test non ha creato una nuova voce');
  const modelloDuplicato = window.getSTATE().modelliDocumento.find(m => m.nome === 'Preventivo di prova (test) (copia)');
  assert(modelloDuplicato, 'modello duplicato non trovato (nome atteso con suffisso "(copia)")');
  assert(modelloDuplicato.predefinito === false, 'il duplicato di un modello predefinito non dovrebbe ereditare il flag predefinito');
  assert(modelloDuplicato.corpo === modelloTest.corpo, 'il testo del modello duplicato non coincide con l\'originale');

  // modifica
  click(q(`[data-action="modifica-modello"][data-id="${modelloDuplicato.id}"]`));
  await wait(20);
  assert(q('#modNome').value === 'Preventivo di prova (test) (copia)', 'il modale di modifica non è precompilato con i dati esistenti del modello');
  setVal(q('#modNome'), 'Preventivo di prova (test) modificato');
  setChecked(q('#modAttivo'), false);
  click(q('[data-action="salva-modello"]'));
  await wait(20);
  const modelloDuplicatoAgg = window.getSTATE().modelliDocumento.find(m => m.id === modelloDuplicato.id);
  assert(modelloDuplicatoAgg.nome === 'Preventivo di prova (test) modificato' && modelloDuplicatoAgg.attivo === false, 'la modifica del modello duplicato non è stata salvata correttamente');
  assert(window.getSTATE().modelliDocumento.length === nModelliPrima + 2, 'la modifica ha creato un duplicato invece di aggiornare il modello esistente');

  // un modello disattivato non deve più comparire tra quelli selezionabili per un nuovo documento
  click(q('[data-nav="preventivi"]'));
  await wait(20);
  click(q('[data-action="nuovo-preventivo"]'));
  await wait(20);
  const modelliSelezionabili = qa('#pModello option').map(o => o.value);
  assert(!modelliSelezionabili.includes(modelloDuplicatoAgg.id), 'un modello disattivato compare ancora tra quelli selezionabili per un nuovo documento');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // pulizia: elimina i due modelli di test (i documenti già creati da un modello non vengono toccati)
  click(q('[data-nav="modelli"]'));
  await wait(20);
  click(q(`[data-action="elimina-modello"][data-id="${modelloTest.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-modello"][data-id="${modelloDuplicato.id}"]`));
  await wait(20);
  assert(window.getSTATE().modelliDocumento.length === nModelliPrima, 'i modelli di test non sono stati eliminati correttamente');
  console.log('=== Modelli documenti: duplicazione, modifica, disattivazione (non più selezionabile per nuovi documenti), eliminazione OK');

  // ---------- 8d-sexies) Procedure interne: pagina di gestione CRUD (task #146) ----------
  click(q('[data-nav="procedure"]'));
  await wait(20);
  const nProcPrima = window.getSTATE().procedureInterne.length;
  assert(nProcPrima === 3, `attese 3 procedure di default (seed task #146), trovate ${nProcPrima}`);
  assert(q('#content').textContent.includes('Apertura Partita IVA') && q('#content').textContent.includes('Apertura Bar'), 'le procedure di default non compaiono nella pagina Procedure interne');

  click(q('[data-action="nuova-procedura"]'));
  await wait(20);
  assert(q('#formProcedura'), 'form nuova procedura non renderizzato');
  assertNoAutoSubmit(q('#formProcedura'), 'formProcedura');
  const categorieProcDatalist = qa('#procCategorieList option').map(o => o.value);
  ['Apertura attività', 'Cessazione attività', 'Consulenza società'].forEach(cat => {
    assert(categorieProcDatalist.includes(cat), `la categoria base "${cat}" non compare nel datalist di suggerimento delle procedure`);
  });
  click(q('[data-action="salva-procedura"]')); // senza compilare nulla: non deve salvare
  await wait(20);
  assert(window.getSTATE().procedureInterne.length === nProcPrima, 'il salvataggio di una procedura senza categoria/nome/contenuto non dovrebbe creare nulla');

  setVal(q('#procCategoria'), 'Apertura attività');
  setVal(q('#procNome'), 'Procedura di prova (test)');
  setVal(q('#procContenuto'), '1. Primo passaggio di prova.\n2. Secondo passaggio di prova.');
  setVal(q('#procChecklist'), 'Documento A\nDocumento B\n\nDocumento C'); // riga vuota nel mezzo: va scartata
  click(q('[data-action="salva-procedura"]'));
  await wait(20);
  assert(window.getSTATE().procedureInterne.length === nProcPrima + 1, 'nuova procedura di test non salvata');
  const procTest = window.getSTATE().procedureInterne.find(p => p.nome === 'Procedura di prova (test)');
  assert(procTest, 'procedura di test non trovata in STATE');
  assert(procTest.categoria === 'Apertura attività' && procTest.attivo === true, 'categoria o flag attivo della procedura di test non salvati correttamente');
  assert(procTest.checklistDocumenti.length === 3 && procTest.checklistDocumenti.join(',') === 'Documento A,Documento B,Documento C', `la checklist documenti dovrebbe avere 3 righe non vuote, trovato: ${JSON.stringify(procTest.checklistDocumenti)}`);
  console.log('=== Procedure interne: creazione, validazione, datalist categorie, checklist "un documento per riga" OK');

  // vista di dettaglio (sola lettura, pensata per il consulente prima dell'appuntamento)
  click(q(`[data-action="apri-procedura"][data-id="${procTest.id}"]`));
  await wait(20);
  assert(q('.modal').textContent.includes('Primo passaggio di prova') && q('.modal').textContent.includes('Documento A'), 'la vista di dettaglio della procedura non mostra contenuto e checklist');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // duplicazione
  click(q(`[data-action="duplica-procedura"][data-id="${procTest.id}"]`));
  await wait(20);
  assert(window.getSTATE().procedureInterne.length === nProcPrima + 2, 'la duplicazione della procedura di test non ha creato una nuova voce');
  const procDuplicata = window.getSTATE().procedureInterne.find(p => p.nome === 'Procedura di prova (test) (copia)');
  assert(procDuplicata, 'procedura duplicata non trovata (nome atteso con suffisso "(copia)")');
  assert(procDuplicata.checklistDocumenti.join(',') === procTest.checklistDocumenti.join(','), 'la checklist documenti della procedura duplicata non coincide con l\'originale');

  // modifica + ricerca
  click(q(`[data-action="modifica-procedura"][data-id="${procDuplicata.id}"]`));
  await wait(20);
  assert(q('#procNome').value === 'Procedura di prova (test) (copia)', 'il modale di modifica non è precompilato con i dati esistenti della procedura');
  setVal(q('#procNome'), 'Procedura di prova (test) modificata');
  setChecked(q('#procAttivo'), false);
  click(q('[data-action="salva-procedura"]'));
  await wait(20);
  const procDuplicataAgg = window.getSTATE().procedureInterne.find(p => p.id === procDuplicata.id);
  assert(procDuplicataAgg.nome === 'Procedura di prova (test) modificata' && procDuplicataAgg.attivo === false, 'la modifica della procedura duplicata non è stata salvata correttamente');

  setVal(q('[data-action="proc-filtro-q"]'), 'Procedura di prova (test) modificata');
  await wait(20);
  // Nota: qui si controlla #content (non body) perché body.textContent include anche il testo grezzo
  // dello <script>, che contiene "Apertura Bar" nel codice sorgente (seed di default) a prescindere
  // dal filtro applicato in UI — un falso negativo, non un bug della ricerca.
  assert(q('#content').textContent.includes('Procedura di prova (test) modificata'), 'la ricerca in Procedure interne non mostra la procedura cercata per nome');
  assert(!q('#content').textContent.includes('Apertura Bar'), 'la ricerca in Procedure interne dovrebbe filtrare via le procedure non corrispondenti');
  setVal(q('[data-action="proc-filtro-q"]'), '');
  await wait(20);

  // pulizia: elimina le procedure di test
  click(q(`[data-action="elimina-procedura"][data-id="${procTest.id}"]`));
  await wait(20);
  click(q(`[data-action="elimina-procedura"][data-id="${procDuplicata.id}"]`));
  await wait(20);
  assert(window.getSTATE().procedureInterne.length === nProcPrima, 'le procedure di test non sono state eliminate correttamente');
  console.log('=== Procedure interne: vista di dettaglio, duplicazione, modifica, ricerca, eliminazione OK');

  // ---------- 8d-septies) Calendario: "Prenota un appuntamento" (task #147, flusso segreteria) ----------
  // Operatore impostato esplicitamente qui (non dato per scontato dal blocco "Chi sei": altri test
  // nel frattempo possono averlo azzerato, es. ricaricando i dati demo) perché il resto di questo
  // blocco verifica la notifica per il CONSULENTE che ha operatoreCorrente() === 'Matteo'.
  window.impostaOperatore('Matteo');
  assert(window.operatoreCorrente() === 'Matteo', `impostaOperatore('Matteo') non ha impostato operatoreCorrente, trovato "${window.operatoreCorrente()}"`);
  assert(window.getSTATE().meta.consulenti.length === 1 && window.getSTATE().meta.consulenti[0] === 'Matteo', `atteso un solo consulente "Matteo" a questo punto della suite, trovato ${JSON.stringify(window.getSTATE().meta.consulenti)}`);
  click(q('[data-nav="calendario"]'));
  await wait(20);
  const nAppPrima = window.getSTATE().appuntamenti.length;
  const btnPrenota = q('[data-action="prenota-appuntamento"]');
  assert(btnPrenota, 'pulsante "Prenota un appuntamento" non presente in Calendario (con almeno un consulente configurato dovrebbe esserci)');
  click(btnPrenota);
  await wait(20);
  assert(q('#prenotaAppuntamentoForm'), 'form "Prenota un appuntamento" non renderizzato');
  const opzioniConsulente = qa('#prenConsulente option').map(o => o.value);
  assert(opzioniConsulente.length === 1 && opzioniConsulente[0] === 'Matteo', `il selettore consulente dovrebbe mostrare solo "Matteo", trovato ${JSON.stringify(opzioniConsulente)}`);

  // di default "Nuova attività" è selezionato: il campo cliente deve restare nascosto
  assert(q('#prenClienteWrap').style.display === 'none', 'con tipo richiesta "Nuova attività" il campo cliente non dovrebbe essere visibile di default');
  setChecked(q('input[name="prenTipo"][value="Consulenza per attività esistente"]'), true);
  await wait(20);
  assert(q('#prenClienteWrap').style.display !== 'none', 'selezionando "Consulenza per attività esistente" il campo cliente dovrebbe comparire');
  const clientePrenota = window.getSTATE().clienti.filter(c => c.stato !== 'cessato')[0];
  setVal(q('#prenCliente'), clientePrenota.id);

  // motivo di default "Apertura nuova attività": il campo "Altro" resta nascosto finché non si sceglie "Altro"
  assert(q('#prenMotivoAltroWrap').style.display === 'none', 'il campo "Specifica" (motivo Altro) non dovrebbe essere visibile per un motivo diverso da "Altro"');

  setVal(q('#prenData'), '2026-11-10');
  setVal(q('#prenOraInizio'), '15:30');
  setVal(q('#prenTelefono'), '0444 999888');
  setVal(q('#prenNote'), 'Cliente ha chiesto se portare anche il socio.');
  click(q('[data-action="salva-prenota-appuntamento"]'));
  await wait(20);
  assert(window.getSTATE().appuntamenti.length === nAppPrima + 1, 'appuntamento prenotato dalla segreteria non salvato');
  const appPrenotato = window.getSTATE().appuntamenti.find(a => a.telefono === '0444 999888');
  assert(appPrenotato, 'appuntamento prenotato non trovato in STATE (cercato per telefono)');
  assert(appPrenotato.consulente === 'Matteo' && appPrenotato.prenotatoDaSegreteria === true, 'appuntamento prenotato: consulente o flag prenotatoDaSegreteria non corretti');
  assert(appPrenotato.tipoRichiesta === 'Consulenza per attività esistente' && appPrenotato.clienteId === clientePrenota.id, 'appuntamento prenotato: tipo richiesta o cliente collegato non corretti');
  assert(appPrenotato.motivo === 'Apertura nuova attività' && appPrenotato.oggetto === 'Apertura nuova attività', 'appuntamento prenotato: motivo od oggetto non corretti (motivo di default atteso, non "Altro")');
  assert(appPrenotato.notificaVista === false, 'un appuntamento prenotato dalla segreteria deve nascere con notificaVista=false (per il pallino di notifica al consulente)');
  console.log('=== "Prenota un appuntamento": form (consulente/agenda/tipo richiesta/cliente/telefono/motivo/note), toggle campi condizionali, salvataggio OK');

  // notifica per il consulente: pallino sulla voce "Calendario" della sidebar finché non apre l'appuntamento
  assert(window.appuntamentiNonVistiConteggio() >= 1, 'appuntamentiNonVistiConteggio dovrebbe contare il nuovo appuntamento non ancora visto dal consulente');
  const badgeCalendario = q('[data-nav="calendario"] .nav-badge');
  assert(badgeCalendario && Number(badgeCalendario.textContent) >= 1, 'la voce "Calendario" della sidebar dovrebbe mostrare il pallino di notifica per il nuovo appuntamento prenotato');

  window.apriModalAppuntamento(appPrenotato.id);
  await wait(20);
  assert(q('.modal').textContent.includes('Prenotato dalla segreteria'), 'il dettaglio dell\'appuntamento non mostra il blocco "Prenotato dalla segreteria"');
  assert(q('.modal').textContent.includes('0444 999888') && q('.modal').textContent.includes('Cliente ha chiesto'), 'il dettaglio dell\'appuntamento non mostra telefono/note raccolti dalla segreteria');
  const btnProcCollegata = q('[data-action="apri-procedura"]');
  assert(btnProcCollegata, 'manca il pulsante della procedura interna collegata al motivo "Apertura nuova attività" (dovrebbe suggerirne almeno una tra quelle seed)');
  assert(q('[data-action="stampa-riepilogo-appuntamento"]'), 'manca il pulsante per il riepilogo stampabile dell\'appuntamento prenotato dalla segreteria');
  assert(window.getSTATE().appuntamenti.find(a => a.id === appPrenotato.id).notificaVista === true, 'aprire il dettaglio dell\'appuntamento dovrebbe segnarlo come visto (notificaVista=true)');
  assert(window.appuntamentiNonVistiConteggio() === 0, 'dopo aver aperto l\'appuntamento la notifica non dovrebbe più essere conteggiata');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  assert(!q('[data-nav="calendario"] .nav-badge'), 'il pallino di notifica sulla voce Calendario dovrebbe sparire dopo aver visto l\'appuntamento');

  // un appuntamento creato normalmente dal calendario (non dalla segreteria) non genera notifiche né
  // il blocco "Prenotato dalla segreteria"
  const appNormale = window.aggiungiAppuntamento({ clienteId: null, data: '2026-11-11', ora: '10:00', oggetto: 'Appuntamento auto-creato' });
  assert(appNormale.prenotatoDaSegreteria === false && appNormale.notificaVista === true, 'un appuntamento creato dal consulente stesso (non dalla segreteria) non deve generare una notifica');
  window.apriModalAppuntamento(appNormale.id);
  await wait(20);
  assert(!q('.modal').textContent.includes('Prenotato dalla segreteria'), 'un appuntamento non prenotato dalla segreteria non dovrebbe mostrare il blocco "Prenotato dalla segreteria"');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Notifica appuntamento prenotato: pallino sidebar Calendario, sparisce all\'apertura, procedura interna suggerita in base al motivo, nessuna notifica per gli appuntamenti auto-creati OK');

  // ---------- 8d-octies) Task #186: notifiche su modifica/eliminazione di un task collegato ----------
  {
    window.impostaOperatore('Matteo');
    const nTaskPrimaElim = window.getSTATE().notificheEliminazioni.length;
    window.aggiungiTaskTeam({ titolo: 'Task #186 da eliminare', assegnatoA: 'Sabrina', stato: 'Da fare' });
    const taskDaEliminare = window.getSTATE().taskTeam.find(t => t.titolo === 'Task #186 da eliminare');
    window.eliminaTaskTeam(taskDaEliminare.id);
    assert(window.getSTATE().notificheEliminazioni.length === nTaskPrimaElim + 1, 'eliminare un task assegnato ad altri deve aggiungere una notifica di eliminazione');
    const notifTaskElim = window.getSTATE().notificheEliminazioni[window.getSTATE().notificheEliminazioni.length - 1];
    assert(notifTaskElim.tipo === 'task' && notifTaskElim.destinatario === 'Sabrina' && notifTaskElim.eliminatoDa === 'Matteo' && notifTaskElim.titolo === 'Task #186 da eliminare', 'la notifica di eliminazione task non ha i campi attesi (tipo/destinatario/eliminatoDa/titolo)');

    window.impostaOperatore('Sabrina');
    assert(window.notificheEliminazioniPerOperatore('task').some(n => n.id === notifTaskElim.id), 'notificheEliminazioniPerOperatore("task") non trova la notifica per il destinatario corretto');
    assert(window.taskTeamNonVistiConteggio() >= 1, 'il conteggio pallino Task team deve includere anche le notifiche di eliminazione');
    window.segnaNotificaEliminazioneVista(notifTaskElim.id);
    assert(!window.getSTATE().notificheEliminazioni.some(n => n.id === notifTaskElim.id), 'segnaNotificaEliminazioneVista non ha rimosso la notifica dalla lista');
    window.impostaOperatore('Matteo');

    // eliminare un proprio task (assegnato a sé stessi) non deve generare alcuna notifica
    const nTaskPrimaElimSelf = window.getSTATE().notificheEliminazioni.length;
    window.aggiungiTaskTeam({ titolo: 'Task #186 proprio', assegnatoA: 'Matteo', stato: 'Da fare' });
    const taskProprio = window.getSTATE().taskTeam.find(t => t.titolo === 'Task #186 proprio');
    window.eliminaTaskTeam(taskProprio.id);
    assert(window.getSTATE().notificheEliminazioni.length === nTaskPrimaElimSelf, 'eliminare un proprio task non deve generare una notifica di eliminazione');
    console.log('=== Task #186: eliminazione di un task genera una notifica persistente per l\'assegnatario (non per sé stessi) OK');

    // modifica sostanziale di un task da parte di qualcun altro rispetto all'assegnatario riapre
    // la notifica con dicitura "modificato"
    window.aggiungiTaskTeam({ titolo: 'Task #186 da modificare', assegnatoA: 'Sabrina', stato: 'Da fare' });
    const taskDaModificare = window.getSTATE().taskTeam.find(t => t.titolo === 'Task #186 da modificare');
    taskDaModificare.notificaVista = true; // simula che Sabrina l'abbia già vista
    window.aggiornaTaskTeam(taskDaModificare.id, { titolo: 'Task #186 modificato' });
    const taskModificato = window.getSTATE().taskTeam.find(t => t.id === taskDaModificare.id);
    assert(taskModificato.notificaVista === false && taskModificato.notificaTipo === 'modificato' && taskModificato.notificaCreatoDa === 'Matteo', 'modificare un campo rilevante di un task assegnato ad altri deve riaprire la notifica con tipo "modificato"');
    assert(window.etichettaNotificaTaskTeam(taskModificato) === 'modificato', 'etichettaNotificaTaskTeam non restituisce "modificato" per notificaTipo="modificato"');
    window.eliminaTaskTeam(taskDaModificare.id);
    window.getSTATE().notificheEliminazioni = window.getSTATE().notificheEliminazioni.filter(n => !(n.destinatario === 'Sabrina' && n.titolo === 'Task #186 modificato'));
    console.log('=== Task #186: modifica di un task da parte di un altro operatore riapre la notifica ("modificato") OK');
  }

  // ---------- 8d-nonies) Task #186: notifiche su modifica/riassegnazione/eliminazione di un appuntamento collegato ----------
  {
    const consulentiPrima = window.getSTATE().meta.consulenti.slice();
    if (!consulentiPrima.includes('Sabrina')) window.getSTATE().meta.consulenti.push('Sabrina');
    window.impostaOperatore('Matteo');

    const appCreatoSegreteria = window.aggiungiAppuntamento({ consulente: 'Sabrina', data: '2026-11-12', ora: '09:00', oggetto: 'Appuntamento #186 creato da segreteria', prenotatoDaSegreteria: true });
    assert(appCreatoSegreteria.notificaCreatoDa === 'Matteo' && appCreatoSegreteria.notificaTipo === 'creato', 'un appuntamento prenotato dalla segreteria deve avere notificaCreatoDa/notificaTipo valorizzati');

    // modifica sostanziale (oggetto) da parte di un operatore diverso dal consulente destinatario
    window.getSTATE().appuntamenti.find(a => a.id === appCreatoSegreteria.id).notificaVista = true;
    window.aggiornaAppuntamento(appCreatoSegreteria.id, { oggetto: 'Appuntamento #186 modificato' });
    const appModificato = window.getSTATE().appuntamenti.find(a => a.id === appCreatoSegreteria.id);
    assert(appModificato.notificaVista === false && appModificato.notificaTipo === 'modificato' && appModificato.notificaCreatoDa === 'Matteo', 'modificare un campo rilevante di un appuntamento di un altro consulente deve riaprire la notifica con tipo "modificato"');
    assert(window.etichettaNotificaAppuntamento(appModificato) === 'modificato', 'etichettaNotificaAppuntamento non restituisce "modificato" per notificaTipo="modificato"');

    // riassegnazione del consulente: a sé stessi non deve lasciare la notifica come non vista
    window.aggiornaAppuntamento(appCreatoSegreteria.id, { notificaVista: true });
    window.aggiornaAppuntamento(appCreatoSegreteria.id, { consulente: 'Matteo' });
    const appRiassegnato = window.getSTATE().appuntamenti.find(a => a.id === appCreatoSegreteria.id);
    assert(appRiassegnato.notificaTipo === 'riassegnato' && appRiassegnato.notificaVista === true, 'riassegnare un appuntamento a sé stessi non deve lasciare la notifica come non vista');
    assert(window.etichettaNotificaAppuntamento(appRiassegnato) === 'riassegnato a te', 'etichettaNotificaAppuntamento non restituisce "riassegnato a te"');

    // modificare il proprio stesso appuntamento non deve generare notifiche
    window.aggiornaAppuntamento(appRiassegnato.id, { notificaVista: true });
    window.aggiornaAppuntamento(appRiassegnato.id, { oggetto: 'Appuntamento #186 modificato da me stesso' });
    assert(window.getSTATE().appuntamenti.find(a => a.id === appRiassegnato.id).notificaVista === true, 'modificare il proprio stesso appuntamento non deve riaprire la notifica');

    // eliminazione: genera una notifica persistente per il consulente destinatario, mai per sé stessi
    window.impostaOperatore('Sabrina');
    const appDaEliminare = window.aggiungiAppuntamento({ consulente: 'Matteo', data: '2026-11-13', ora: '11:00', oggetto: 'Appuntamento #186 da eliminare' });
    const nElimPrima = window.getSTATE().notificheEliminazioni.length;
    window.rimuoviAppuntamento(appDaEliminare.id);
    assert(window.getSTATE().notificheEliminazioni.length === nElimPrima + 1, 'eliminare un appuntamento di un altro consulente deve aggiungere una notifica di eliminazione');
    const notifAppElim = window.getSTATE().notificheEliminazioni[window.getSTATE().notificheEliminazioni.length - 1];
    assert(notifAppElim.tipo === 'appuntamento' && notifAppElim.destinatario === 'Matteo' && notifAppElim.eliminatoDa === 'Sabrina' && notifAppElim.titolo === 'Appuntamento #186 da eliminare', 'la notifica di eliminazione appuntamento non ha i campi attesi');

    window.impostaOperatore('Matteo');
    assert(window.appuntamentiNonVistiConteggio() >= 1, 'il conteggio pallino Calendario deve includere anche le notifiche di eliminazione appuntamento');
    window.segnaNotificaEliminazioneVista(notifAppElim.id);
    assert(!window.getSTATE().notificheEliminazioni.some(n => n.id === notifAppElim.id), 'segnaNotificaEliminazioneVista non ha rimosso la notifica di eliminazione appuntamento');

    // eliminare un proprio appuntamento non deve generare notifiche
    const nElimPrimaSelf = window.getSTATE().notificheEliminazioni.length;
    const appProprio = window.aggiungiAppuntamento({ consulente: 'Matteo', data: '2026-11-14', ora: '12:00', oggetto: 'Appuntamento #186 proprio' });
    window.rimuoviAppuntamento(appProprio.id);
    assert(window.getSTATE().notificheEliminazioni.length === nElimPrimaSelf, 'eliminare un proprio appuntamento non deve generare una notifica di eliminazione');

    // pulizia: rimuove gli appuntamenti di test rimasti e ripristina l'elenco consulenti
    window.getSTATE().appuntamenti = window.getSTATE().appuntamenti.filter(a => !String(a.oggetto || '').includes('#186'));
    window.getSTATE().meta.consulenti = consulentiPrima;
    window.render();
    await wait(20);
    console.log('=== Task #186: notifiche di modifica/riassegnazione/eliminazione sugli appuntamenti (consulente destinatario, mai su se stessi) OK');
  }

  // ---------- 8d-octies) Appuntamenti: durata, orario di fine, conflitti (richiesta Matteo) ----------
  // Durata di default (60') per un appuntamento creato senza specificarla esplicitamente - i vecchi
  // appuntamenti salvati prima di questa funzionalità non hanno durataMinuti, quindi ogni lettura
  // deve ricadere sullo stesso default implicito che l'app assumeva finora.
  assert(window.durataAppuntamento(appNormale) === 60, `un appuntamento senza durataMinuti esplicita dovrebbe assumere il default di 60', trovato ${window.durataAppuntamento(appNormale)}`);
  const appDurata90 = window.aggiungiAppuntamento({ clienteId: null, data: '2026-11-12', ora: '10:00', durataMinuti: 90, oggetto: 'Test durata' });
  assert(appDurata90.durataMinuti === 90, 'durataMinuti non salvata correttamente su un nuovo appuntamento');
  assert(window.oraFineAppuntamento(appDurata90) === '11:30', `oraFineAppuntamento su 10:00 + 90' dovrebbe dare 11:30, trovato ${window.oraFineAppuntamento(appDurata90)}`);

  // Conflitto: due appuntamenti dello stesso consulente, stesso giorno, fasce orarie sovrapposte.
  const consTest = 'Matteo';
  const appA = window.aggiungiAppuntamento({ clienteId: null, data: '2026-11-13', ora: '09:00', durataMinuti: 60, oggetto: 'Conflitto A', consulente: consTest, prenotatoDaSegreteria: true });
  const conflittiSovrapposti = window.appuntamentiInConflitto(consTest, '2026-11-13', '09:30', 30, null);
  assert(conflittiSovrapposti.length === 1 && conflittiSovrapposti[0].id === appA.id, `un nuovo appuntamento 09:30-10:00 dovrebbe risultare in conflitto con "Conflitto A" (09:00-10:00), trovati ${conflittiSovrapposti.length} conflitti`);
  const conflittiAdiacenti = window.appuntamentiInConflitto(consTest, '2026-11-13', '10:00', 30, null);
  assert(conflittiAdiacenti.length === 0, `un appuntamento che inizia esattamente quando "Conflitto A" finisce (10:00) non dovrebbe risultare in conflitto, trovati ${conflittiAdiacenti.length}`);
  const conflittiAltroGiorno = window.appuntamentiInConflitto(consTest, '2026-11-14', '09:30', 30, null);
  assert(conflittiAltroGiorno.length === 0, 'appuntamenti in giorni diversi non dovrebbero mai risultare in conflitto');
  const conflittiEsclusiSe = window.appuntamentiInConflitto(consTest, '2026-11-13', '09:30', 30, appA.id);
  assert(conflittiEsclusiSe.length === 0, 'escludiId dovrebbe escludere l\'appuntamento stesso dal controllo conflitti (caso: modifica in corso)');
  console.log('=== Appuntamenti: durata di default, oraFineAppuntamento, rilevazione conflitti (sovrapposti/adiacenti/altro giorno/esclusione) OK');

  // Conflitto end-to-end dal form "Prenota un appuntamento": un secondo appuntamento nella stessa
  // fascia oraria di "Conflitto A" deve passare da confermaAzione() - con window.confirm forzato a
  // "Annulla" (false) il salvataggio deve essere bloccato (nessun nuovo appuntamento creato).
  click(q('[data-nav="calendario"]'));
  await wait(20);
  click(q('[data-action="prenota-appuntamento"]'));
  await wait(20);
  setVal(q('#prenData'), '2026-11-13');
  setVal(q('#prenOraInizio'), '09:15');
  setVal(q('#prenTelefono'), '0444 111222');
  const confirmOriginale = window.confirm;
  window.confirm = () => false; // simula "Annulla" sul dialog di conferma conflitto
  const nAppPrimaConflitto = window.getSTATE().appuntamenti.length;
  click(q('[data-action="salva-prenota-appuntamento"]'));
  await wait(20);
  assert(window.getSTATE().appuntamenti.length === nAppPrimaConflitto, 'rifiutando la conferma del conflitto (Annulla) l\'appuntamento non dovrebbe essere salvato');
  window.confirm = () => true; // ripristina il mock globale (sempre "OK", usato dal resto della suite)
  click(q('[data-action="salva-prenota-appuntamento"]'));
  await wait(20);
  assert(window.getSTATE().appuntamenti.length === nAppPrimaConflitto + 1, 'confermando nonostante il conflitto (OK) l\'appuntamento dovrebbe essere salvato normalmente');
  window.confirm = confirmOriginale;
  const appConConflittoConfermato = window.getSTATE().appuntamenti.find(a => a.telefono === '0444 111222');
  window.rimuoviAppuntamento(appConConflittoConfermato.id);
  window.rimuoviAppuntamento(appA.id);
  window.rimuoviAppuntamento(appDurata90.id);
  console.log('=== "Prenota un appuntamento": un conflitto rilevato passa da confermaAzione(), rifiutare blocca il salvataggio, confermare procede comunque OK');

  // ---------- Task #171: campi orario testuali (non più <input type="time">) + ora inizio/ora fine
  // al posto della durata a elenco fisso ----------
  {
    assert(window.orarioValido('09:30') === true && window.orarioValido('23:59') === true, 'orarioValido dovrebbe accettare orari validi');
    assert(window.orarioValido('9:30') === false && window.orarioValido('24:00') === false && window.orarioValido('09:60') === false && window.orarioValido('') === false, 'orarioValido dovrebbe rifiutare formati non HH:MM o fuori range');
    assert(window.durataDaOrari('09:00', '10:30') === 90, 'durataDaOrari dovrebbe calcolare correttamente i minuti tra due orari');
    assert(window.durataDaOrari('10:00', '09:00') === null, 'durataDaOrari dovrebbe rifiutare una fine precedente all\'inizio');
    assert(window.durataDaOrari('10:00', '10:00') === null, 'durataDaOrari dovrebbe rifiutare inizio e fine uguali (durata zero)');
    assert(window.durataDaOrari('10:00', 'non un orario') === null, 'durataDaOrari dovrebbe rifiutare un orario malformato');
    console.log('=== Task #171: orarioValido/durataDaOrari coprono i casi validi/invalidi/di confine OK');

    // Autoformattazione "mentre si scrive": digitare 4 cifre deve inserire da solo i due punti.
    const fakeInput = { value: '0930' };
    window.formattaInputOrario(fakeInput);
    assert(fakeInput.value === '09:30', `formattaInputOrario dovrebbe trasformare "0930" in "09:30", trovato "${fakeInput.value}"`);

    // Modifica di un appuntamento esistente tramite i nuovi campi Ora inizio/Ora fine (che
    // sostituiscono il vecchio input type="time" + select Durata): editare l'ora inizio deve
    // mantenere la durata (sposta anche la fine), editare l'ora fine deve ricalcolare solo la durata.
    const appPerModificaOrario = window.aggiungiAppuntamento({ clienteId: null, data: '2026-11-20', ora: '09:00', durataMinuti: 60, oggetto: 'Test modifica orario' });
    window.apriModalAppuntamento(appPerModificaOrario.id);
    await wait(20);
    const campoInizio = q('#appOraInizio_' + appPerModificaOrario.id);
    const campoFine = q('#appOraFine_' + appPerModificaOrario.id);
    assert(campoInizio && campoFine, 'il modale di modifica appuntamento dovrebbe avere i campi Ora inizio/Ora fine (non più Ora/Durata)');
    assert(campoInizio.value === '09:00' && campoFine.value === '10:00', `i campi dovrebbero precompilarsi con inizio/fine correnti, trovato inizio="${campoInizio.value}" fine="${campoFine.value}"`);

    setVal(campoInizio, '11:00');
    await wait(20);
    let aggiornato = window.trovaAppuntamento(appPerModificaOrario.id);
    assert(aggiornato.ora === '11:00' && aggiornato.durataMinuti === 60, 'cambiare l\'ora inizio dovrebbe spostare l\'appuntamento mantenendo la durata di 60\'');
    assert(q('#appOraFine_' + appPerModificaOrario.id).value === '12:00', 'il campo Ora fine dovrebbe aggiornarsi da solo di conseguenza (inizio 11:00 + 60\' = 12:00)');

    setVal(campoFine, '11:30');
    await wait(20);
    aggiornato = window.trovaAppuntamento(appPerModificaOrario.id);
    assert(aggiornato.ora === '11:00' && aggiornato.durataMinuti === 30, 'cambiare l\'ora fine dovrebbe mantenere l\'inizio e ricalcolare solo la durata (11:00-11:30 = 30\')');

    // un'ora fine non valida (prima dell'inizio) viene rifiutata e il campo torna al valore corretto
    setVal(campoFine, '08:00');
    await wait(20);
    aggiornato = window.trovaAppuntamento(appPerModificaOrario.id);
    assert(aggiornato.durataMinuti === 30, 'un\'ora fine precedente all\'inizio non deve essere accettata (la durata precedente deve restare invariata)');
    assert(q('#appOraFine_' + appPerModificaOrario.id).value === '11:30', 'dopo un tentativo non valido il campo Ora fine dovrebbe tornare a mostrare il valore corretto');

    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    window.rimuoviAppuntamento(appPerModificaOrario.id);
    console.log('=== Task #171: modifica Ora inizio/Ora fine di un appuntamento esistente (sincronizzazione campi, validazione, rifiuto orari non validi) OK');
  }

  // Bug segnalato da Matteo ("le frecce per cambiare settimana non fanno nulla"): erano registrate
  // per errore su onChangeDelegato (evento 'change', mai generato da un click su <button>) invece di
  // onClickDelegato - verificato qui cliccandole davvero e controllando che l'etichetta della
  // settimana mostrata cambi di conseguenza. Il salvataggio andato a buon fine sopra ha chiuso il
  // modale (chiudiModal() su successo): lo si riapre apposta per questo test.
  click(q('[data-action="prenota-appuntamento"]'));
  await wait(20);
  assert(q('#prenAgendaSettimana').textContent.includes('Questa settimana'), 'all\'apertura del form "Prenota un appuntamento" dovrebbe essere selezionata "Questa settimana"');
  click(q('[data-action="prenota-settimana-succ"]'));
  await wait(20);
  assert(q('#prenAgendaSettimana').textContent.includes('Prossima settimana'), 'cliccando la freccia "settimana successiva" l\'etichetta dovrebbe diventare "Prossima settimana" (bug: prima non succedeva nulla)');
  click(q('[data-action="prenota-settimana-succ"]'));
  await wait(20);
  assert(!q('#prenAgendaSettimana').textContent.includes('Prossima settimana') && !q('#prenAgendaSettimana').textContent.includes('Questa settimana'), 'cliccando di nuovo "successiva" ci si aspetta l\'etichetta con la data della settimana (due settimane avanti)');
  click(q('[data-action="prenota-settimana-prec"]'));
  await wait(20);
  click(q('[data-action="prenota-settimana-prec"]'));
  await wait(20);
  click(q('[data-action="prenota-settimana-prec"]'));
  await wait(20);
  assert(q('#prenAgendaSettimana').textContent.includes('Settimana scorsa'), 'tre "precedente" dopo due "successiva" (offset 2-3=-1) dovrebbero mostrare "Settimana scorsa"');
  click(q('[data-action="prenota-settimana-oggi"]'));
  await wait(20);
  assert(q('#prenAgendaSettimana').textContent.includes('Questa settimana'), 'il pulsante "Oggi" dovrebbe riportare a "Questa settimana"');
  console.log('=== "Prenota un appuntamento": le frecce di navigazione settimana (prec/succ/oggi) funzionano e aggiornano l\'etichetta OK');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // ---------- 8d-nonies) Calendario: scaletta oraria nel modal "espandi giorno" (richiesta Matteo) ----------
  // "non c'è indicata una scaletta oraria e sono tutti mescolati": due appuntamenti nello stesso
  // giorno devono comparire in ordine cronologico (non alfabetico di categoria) con l'intervallo
  // inizio-fine, in una sezione dedicata separata dagli altri eventi del giorno.
  const giornoScalettaISO = '2026-11-16';
  const appTardi = window.aggiungiAppuntamento({ clienteId: null, data: giornoScalettaISO, ora: '15:00', durataMinuti: 30, oggetto: 'Appuntamento pomeriggio' });
  const appPresto = window.aggiungiAppuntamento({ clienteId: null, data: giornoScalettaISO, ora: '08:30', durataMinuti: 45, oggetto: 'Appuntamento mattina' });
  window.apriModalGiornoCalendario(giornoScalettaISO);
  await wait(20);
  const testoModalGiorno = q('.modal').textContent;
  assert(testoModalGiorno.includes('Scaletta oraria'), 'il modal giorno dovrebbe mostrare una sezione "Scaletta oraria" quando ci sono appuntamenti');
  const posMattina = testoModalGiorno.indexOf('Appuntamento mattina');
  const posPomeriggio = testoModalGiorno.indexOf('Appuntamento pomeriggio');
  assert(posMattina >= 0 && posPomeriggio >= 0 && posMattina < posPomeriggio, 'nella scaletta oraria l\'appuntamento delle 08:30 dovrebbe comparire prima di quello delle 15:00 (ordine cronologico, non alfabetico)');
  assert(testoModalGiorno.includes('08:30–09:15'), `la scaletta dovrebbe mostrare l'intervallo inizio-fine (08:30 + 45' = 09:15), testo: ${testoModalGiorno.slice(0,400)}`);
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  window.rimuoviAppuntamento(appTardi.id);
  window.rimuoviAppuntamento(appPresto.id);
  console.log('=== Calendario: modal giorno mostra una "Scaletta oraria" cronologica (non per categoria) con intervallo inizio-fine OK');

  // ---------- Task #172: griglia oraria stile Google Calendar (helper di calcolo) ----------
  {
    // range di default 8-19, allargato solo se un appuntamento esce da quella fascia
    const rangeDefault = window.rangeOrarioGriglia([{ ora: '10:00', durataMinuti: 30 }]);
    assert(rangeDefault.minOra === 8 * 60 && rangeDefault.maxOra === 19 * 60, 'senza appuntamenti fuori fascia il range dovrebbe restare 8-19 di default');
    const rangeAllargato = window.rangeOrarioGriglia([{ ora: '07:15', durataMinuti: 30 }, { ora: '18:30', durataMinuti: 90 }]);
    assert(rangeAllargato.minOra === 7 * 60 && rangeAllargato.maxOra === 20 * 60, `un appuntamento alle 07:15 e uno che finisce alle 20:00 dovrebbero allargare il range a 7-20, trovato ${JSON.stringify(rangeAllargato)}`);

    // posizione/altezza del blocco in px, proporzionale alla fascia oraria della griglia
    const range = { minOra: 8 * 60, maxOra: 19 * 60 };
    // CAL_GRID_PX_PER_ORA è un const di modulo (non esposto su window, come gli altri const top-level
    // di questo file): 48px/ora è il valore attuale, verificato qui per nome nel commento sopra la
    // sua dichiarazione in gestionale.htm.
    const pos1 = window.posizioneBloccoGriglia({ ora: '09:00', durataMinuti: 60 }, range);
    assert(pos1.top === 48 && pos1.altezza === 48, `un appuntamento 09:00-10:00 (un'ora dopo l'inizio griglia, lungo un'ora) dovrebbe avere top e altezza pari a un'ora in px (48), trovato ${JSON.stringify(pos1)}`);
    const posBreve = window.posizioneBloccoGriglia({ ora: '10:00', durataMinuti: 5 }, range);
    assert(posBreve.altezza >= 16, 'un appuntamento brevissimo deve avere comunque un\'altezza minima leggibile (16px)');
    assert(window.posizioneBloccoGriglia({ ora: 'non valido', durataMinuti: 30 }, range) === null, 'un orario non valido non deve produrre una posizione (evitare NaN nel CSS)');
    console.log('=== Task #172: rangeOrarioGriglia/posizioneBloccoGriglia calcolano correttamente fascia oraria e geometria dei blocchi OK');
  }

  // pulizia
  const nAppuntamentiPrimaCleanup = window.getSTATE().appuntamenti.length;
  window.rimuoviAppuntamento(appPrenotato.id);
  window.rimuoviAppuntamento(appNormale.id);
  assert(window.getSTATE().appuntamenti.length === nAppuntamentiPrimaCleanup - 2, 'pulizia appuntamenti di test non riuscita');

  // ---------- 8e) Portale cliente: dati/stato riusati dall'anteprima desktop a schermo intero ----------
  // Task #111: il mockup inline "a telefono" (portal-tabs/phone-frame/phone-screen) è stato rimosso
  // insieme al relativo case 'portal-tab' — l'unica anteprima interattiva rimasta in-app è quella a
  // schermo intero (sezione sotto), navigabile per schermate. Qui si prepara solo il cliente/i dati
  // che le sezioni successive riusano, e si verifica il selettore cliente sulla vista normale.
  click(q('[data-nav="portale"]'));
  await wait(20);
  const selPortale = q('[data-action="portal-seleziona-cliente"]');
  assert(selPortale, 'selettore cliente portale non trovato');
  const altroClientePortale = window.getSTATE().clienti.filter(c => c.stato !== 'cessato')[2];
  setVal(selPortale, altroClientePortale.id);
  await wait(20);
  assert(q('[data-action="portal-seleziona-cliente"]').value === altroClientePortale.id, 'il selettore cliente del portale non riflette il cliente scelto');
  console.log('=== Portale cliente: selettore cliente aggiorna il cliente selezionato (PORTAL_CLIENTE)');

  const clientePortaleConCom = window.getSTATE().clienti.find(c => window.getSTATE().comunicazioni.some(com => com.clienteId === c.id && com.stato === 'Inviata' && com.visibilePortale !== false));
  assert(clientePortaleConCom, 'nessun cliente demo ha comunicazioni pubblicate da usare per il test del portale');
  // ri-cerca il select: il render precedente ha sostituito il DOM, il riferimento selPortale è ormai staccato
  setVal(q('[data-action="portal-seleziona-cliente"]'), clientePortaleConCom.id);
  await wait(20);
  const comAttese = window.getSTATE().comunicazioni.filter(c => c.clienteId === clientePortaleConCom.id && c.stato === 'Inviata' && c.visibilePortale !== false);

  // niente emoji decorative nel banner del portale (richiesta esplicita: via l'emoji "brutta")
  const EMOJI_DECORATIVE_RX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert(!EMOJI_DECORATIVE_RX.test(q('.portal-banner').textContent), 'il banner del portale non deve contenere emoji decorative');
  console.log('=== Portale cliente: nessuna emoji decorativa nel banner OK');

  // anteprima a schermo intero: NON è più un telefono ingrandito, è una vera pagina desktop
  // navigabile per schermate (Panoramica/Comunicazioni/Scadenze/Documenti/Andamento) — non più
  // tutto impilato in un'unica pagina lunga (vedi contenutoDesktopPortale). Panoramica è sempre
  // la schermata iniziale quando si apre l'anteprima.
  const figliDiretti = (el, classe) => Array.from(el.children).filter(c => c.classList.contains(classe));
  setVal(q('[data-action="portal-seleziona-cliente"]'), clientePortaleConCom.id);
  await wait(20);
  const btnSchermoIntero = q('[data-action="portal-schermo-intero"]');
  assert(btnSchermoIntero, 'pulsante "Anteprima a schermo intero" non trovato nella vista Portale');
  click(btnSchermoIntero);
  await wait(20);
  assert(q('.portal-fullscreen-backdrop.desktop'), 'anteprima a schermo intero non aperta (o non in versione desktop)');
  assert(!q('#portalFullscreenPhone .phone-frame'), 'anteprima a schermo intero non deve più essere un mockup di telefono ingrandito');
  assert(q('#portalFullscreenPhone .pd-hero h1').textContent.includes(clientePortaleConCom.ragioneSociale), 'anteprima a schermo intero non mostra il cliente corrente');

  // schermata iniziale = Panoramica: recap azienda + stato comunicazioni + numeri chiave
  assert(q('.pd-nav-item.active').textContent.trim() === 'Panoramica', 'la schermata iniziale dell\'anteprima desktop deve essere "Panoramica"');
  const panelAzienda = qa('#portalFullscreenPhone .pd-panel').find(p => p.querySelector('h2').textContent.includes('Dati azienda'));
  assert(panelAzienda, 'pannello "Dati azienda" non trovato nella schermata Panoramica');
  if (clientePortaleConCom.partitaIva) {
    assert(panelAzienda.textContent.includes(clientePortaleConCom.partitaIva), 'la Partita IVA dovrebbe essere visibile di default (dati sensibili non ancora nascosti)');
  }
  const panelComBreakdown = qa('#portalFullscreenPhone .pd-panel').find(p => p.querySelector('h2').textContent.includes('Comunicazioni'));
  assert(panelComBreakdown, 'pannello di riepilogo Comunicazioni non trovato nella schermata Panoramica');
  assert(panelComBreakdown.querySelectorAll('.pd-mini-stat').length === 3, 'il riepilogo comunicazioni in Panoramica deve avere 3 voci (Aperte/In corso/Chiuse)');
  assert(qa('#portalFullscreenPhone .pd-panel').length === 3, 'attesi 3 pannelli nella schermata Panoramica (Dati azienda, Comunicazioni, Numeri chiave)');
  console.log('=== Portale cliente: anteprima desktop, schermata Panoramica con recap azienda e comunicazioni OK');

  // Task #184 (Matteo: "il simulatore di ravvedimento lo metterei nel tab scadenze del portale
  // clienti, nella panoramica non ha senso"): verificato che non sia più in Panoramica (appena
  // sopra) e che sia comparso nel tab Scadenze, qui, nella stessa identica anteprima.
  click(q('[data-action="portal-desktop-tab"][data-tab="scadenze"]'));
  await wait(20);
  assert(q('.pd-nav-item.active').textContent.trim() === 'Scadenze', 'il click sulla voce "Scadenze" dovrebbe attivare quella schermata');
  const panelRavInScadenze = qa('#portalFullscreenPhone .pd-panel').find(p => p.querySelector('h2').textContent.includes('ravvedimento'));
  assert(panelRavInScadenze, 'il pannello simulatore ravvedimento dovrebbe ora comparire nella schermata Scadenze, non più in Panoramica');
  console.log('=== Portale cliente: simulatore ravvedimento spostato nel tab Scadenze (anteprima desktop) OK');
  click(q('[data-action="portal-desktop-tab"][data-tab="panoramica"]'));
  await wait(20);

  // pulsante "Nascondi dati sensibili": maschera P.IVA/CF/contatti e resta selezionato, anche
  // riaprendo l'anteprima da zero (preferenza salvata in locale, non solo in memoria)
  const toggleSens = q('[data-action="toggle-sensibili-portale"]');
  assert(toggleSens, 'pulsante "Nascondi dati sensibili" non trovato nella barra dell\'anteprima desktop');
  click(toggleSens);
  await wait(20);
  assert(q('[data-action="toggle-sensibili-portale"]').classList.contains('on'), 'il pulsante "Nascondi dati sensibili" non risulta attivo dopo il click');
  const panelAziendaMascherato = qa('#portalFullscreenPhone .pd-panel').find(p => p.querySelector('h2').textContent.includes('Dati azienda'));
  if (clientePortaleConCom.partitaIva) {
    assert(!panelAziendaMascherato.textContent.includes(clientePortaleConCom.partitaIva), 'la Partita IVA doveva essere mascherata dopo aver attivato "Nascondi dati sensibili"');
  }
  assert(panelAziendaMascherato.querySelectorAll('.pd-masked').length > 0, 'i campi sensibili mascherati devono usare la classe .pd-masked');
  assert(window.localStorage.getItem('gestionaleStudioPortaleNascondiSensibili_v1') === '1', 'la preferenza "nascondi dati sensibili" deve essere salvata in locale');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  click(q('[data-action="portal-schermo-intero"]'));
  await wait(20);
  assert(q('[data-action="toggle-sensibili-portale"]').classList.contains('on'), 'la scelta "Nascondi dati sensibili" non è rimasta selezionata riaprendo l\'anteprima');
  assert(q('.pd-nav-item.active').textContent.trim() === 'Panoramica', 'riaprendo l\'anteprima si deve sempre ripartire dalla schermata Panoramica');
  // ripristino lo stato per non condizionare eventuali controlli successivi
  click(q('[data-action="toggle-sensibili-portale"]'));
  await wait(20);
  assert(!q('[data-action="toggle-sensibili-portale"]').classList.contains('on'), 'il pulsante "Nascondi dati sensibili" non si disattiva correttamente');
  console.log('=== Portale cliente: toggle "Nascondi dati sensibili" maschera i campi e resta selezionato tra le riaperture OK');

  // navigazione fra le schermate: click su "Comunicazioni" mostra solo quel pannello, a piena larghezza
  click(q('[data-action="portal-desktop-tab"][data-tab="comunicazioni"]'));
  await wait(20);
  // Task #123: la voce "Comunicazioni" ora può portare accodato il badge col conteggio non lette
  // (<span class="nav-badge">N</span>), quindi il testo non è più l'etichetta esatta - basta che
  // inizi con "Comunicazioni".
  assert(q('.pd-nav-item.active').textContent.trim().startsWith('Comunicazioni'), 'click sulla voce di navigazione "Comunicazioni" non la attiva');
  assert(qa('#portalFullscreenPhone .pd-panel').length === 1, 'la schermata Comunicazioni deve mostrare un solo pannello a piena larghezza');
  const panelCom = q('#portalFullscreenPhone .pd-panel');
  assert(panelCom.querySelector('h2').textContent.includes('Comunicazioni'), 'la schermata attiva non è quella delle Comunicazioni');
  assert(panelCom.querySelector('h2 .cnt').textContent.trim() === String(comAttese.length), `il pannello Comunicazioni deve mostrare il conteggio totale reale (${comAttese.length}) anche se la lista è troncata`);
  // -1: il primo .pd-item diretto del pannello è ora il box "Scrivi allo studio" (task #88/#107),
  // sempre presente, non una comunicazione.
  assert(figliDiretti(panelCom, 'pd-item').length - 1 === Math.min(comAttese.length, 8), 'il pannello Comunicazioni deve mostrare al massimo 8 voci dirette oltre al box "Scrivi allo studio" (non deve sembrare vuoto né traboccare)');
  console.log('=== Portale cliente: navigazione a schermate nell\'anteprima desktop (Comunicazioni isolata, 1 pannello) OK');

  // cambiando cliente (dal select sotto, ancora presente nel DOM) l'anteprima si allinea da sola
  setVal(q('[data-action="portal-seleziona-cliente"]'), altroClientePortale.id);
  await wait(20);
  assert(q('#portalFullscreenPhone .pd-hero h1').textContent.includes(altroClientePortale.ragioneSociale), 'anteprima a schermo intero non si riallinea al cambio cliente');
  setVal(q('[data-action="portal-seleziona-cliente"]'), clientePortaleConCom.id);
  await wait(20);
  // chiusura con Escape (stesso meccanismo dei modali standard)
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert(!q('.portal-fullscreen-backdrop'), 'anteprima a schermo intero non chiusa con Escape');
  console.log('=== Portale cliente: anteprima a schermo intero desktop (non più un telefono ingrandito), coerente coi dati, si aggiorna e si chiude con Escape OK');

  // NB: task #111 ha rimosso anche "segna come letta"/"archivia"/"ripristina" una comunicazione
  // dall'anteprima in-app — erano azioni esistenti SOLO nel mockup a telefono ora eliminato (i case
  // 'portal-com-vista'/'portal-com-archivia'/'portal-com-disarchivia' sono stati rimossi perché
  // rimasti senza alcun pulsante che li richiamasse). Il portale reale servito da server.js è in
  // sola lettura, quindi questa funzionalità non esisteva comunque al di fuori dell'anteprima.

  // ---------- 8e-ter) Accesso portale reale (task #87): attiva/rigenera/disattiva + isolamento ----------
  {
    const clientePerAccesso = window.getSTATE().clienti.filter(c => c.stato !== 'cessato')[5];
    assert(clientePerAccesso, 'serve almeno 6 clienti attivi per questo test');
    assert(!clientePerAccesso.portaleToken, 'precondizione: il cliente scelto per il test non deve avere già un accesso attivo');
    setVal(q('[data-action="portal-seleziona-cliente"]'), clientePerAccesso.id);
    await wait(20);

    // senza server locale attivo, la card deve dirlo chiaramente e NON offrire il pulsante di attivazione
    assert(window.document.body.textContent.includes('serve il server locale acceso'), 'senza HTTP_SYNC_ATTIVO la card deve spiegare che serve il server locale');
    assert(!q('[data-action="portale-attiva-accesso"]'), 'senza server locale attivo non deve comparire il pulsante "Attiva accesso portale" (genererebbe un link inutilizzabile)');
    console.log('=== Accesso portale reale: senza server locale attivo, messaggio chiaro e nessun pulsante di attivazione OK');

    // con il server locale "attivo" (simulato, come per i test del backup). Task #111 ha aggiunto
    // in cima alla pagina una tabella con l'accesso di TUTTI i clienti (stessi data-action della
    // card sotto, uno per riga): da qui in poi le query si scopano sempre a "#cardAccessoPortaleReale"
    // (la card del cliente selezionato nel menu) per non prendere per sbaglio la riga di un altro
    // cliente nella tabella.
    window.setHttpSyncAttivoTest(true);
    window.render();
    await wait(20);
    const btnAttiva = q('#cardAccessoPortaleReale [data-action="portale-attiva-accesso"]');
    assert(btnAttiva && btnAttiva.dataset.id === clientePerAccesso.id, 'pulsante "Attiva accesso portale" non trovato per il cliente selezionato');
    click(btnAttiva);
    await wait(20);
    const tokenIniziale = window.clienteById(clientePerAccesso.id).portaleToken;
    assert(tokenIniziale && tokenIniziale.length === 48, `token non generato correttamente dopo l'attivazione (trovato: ${tokenIniziale})`);
    assert(q('#cardAccessoPortaleReale [data-action="portale-rigenera-link"]') && q('#cardAccessoPortaleReale [data-action="portale-disattiva-accesso"]'), 'dopo l\'attivazione devono comparire i pulsanti "Rigenera link" e "Disattiva accesso"');
    const campoLink = q('#cardAccessoPortaleReale input[readonly]');
    assert(campoLink && campoLink.value.endsWith('/portale/' + tokenIniziale), `il campo link non mostra l'URL atteso, trovato "${campoLink && campoLink.value}"`);
    const btnCopia = q('#cardAccessoPortaleReale [data-action="portale-copia-link"]');
    assert(btnCopia && btnCopia.dataset.link === campoLink.value, 'il pulsante "Copia link" non ha il link corretto in dataset.link');
    console.log('=== Accesso portale reale: attivazione genera un token valido e mostra link/copia/rigenera/disattiva OK');

    // Link per i clienti: con ngrok attivo la base è il dominio pubblico, non localhost; senza
    // ngrok si ripiega sull'IP di rete con un avviso.
    window.resetPortaleBaseTest();
    window.fetch = (url) => {
      if (url === '/api/accesso-esterno') return Promise.resolve({ json: async () => ({ ok: true, porta: 8421 }) });
      if (url === '/api/ngrok-tunnels') return Promise.resolve({ json: async () => ({ ok: true, tunnel: [{ publicUrl: 'https://xyz.ngrok-free.dev', porta: 8421 }] }) });
      if (url === '/api/indirizzi-rete') return Promise.resolve({ json: async () => ({ ok: true, indirizzi: ['192.168.1.50'] }) });
      return Promise.reject(new Error('inatteso ' + url));
    };
    window.render(); await wait(50);
    assert(q('#cardAccessoPortaleReale input[readonly]').value === 'https://xyz.ngrok-free.dev/portale/' + tokenIniziale, 'il link del portale deve usare il dominio pubblico ngrok');
    window.resetPortaleBaseTest();
    window.fetch = (url) => {
      if (url === '/api/ngrok-tunnels') return Promise.resolve({ json: async () => ({ ok: true, tunnel: [] }) });
      if (url === '/api/indirizzi-rete') return Promise.resolve({ json: async () => ({ ok: true, indirizzi: ['192.168.1.50'] }) });
      return Promise.resolve({ json: async () => ({ ok: true, porta: 8421 }) });
    };
    window.render(); await wait(50);
    assert(q('#cardAccessoPortaleReale input[readonly]').value === 'http://192.168.1.50:8421/portale/' + tokenIniziale, 'senza ngrok il link ripiega sull\'IP di rete');
    assert(window.document.body.textContent.includes('avvia ngrok'), 'senza ngrok deve comparire l\'avviso');
    delete window.fetch; window.resetPortaleBaseTest();
    window.render(); await wait(20);
    console.log('=== Accesso portale reale: i link usano il dominio pubblico ngrok, con ripiego su IP di rete + avviso OK');

    // rigenera: nuovo token, diverso dal precedente (il vecchio link smette di funzionare)
    click(q('#cardAccessoPortaleReale [data-action="portale-rigenera-link"]'));
    await wait(20);
    const tokenRigenerato = window.clienteById(clientePerAccesso.id).portaleToken;
    assert(tokenRigenerato && tokenRigenerato !== tokenIniziale, 'la rigenerazione deve produrre un token diverso dal precedente');
    console.log('=== Accesso portale reale: rigenerazione produce un token nuovo e diverso OK');

    // isolamento vero: la vista costruita per il token del cliente NON deve contenere alcuna
    // traccia di un altro cliente (stesso controllo del task #87 sull'architettura di isolamento)
    const altroClienteIsolamento = window.getSTATE().clienti.find(c => c.id !== clientePerAccesso.id && c.stato !== 'cessato');
    const vistaIsolata = window.costruisciVistaPortaleClienteEsterna(tokenRigenerato);
    assert(vistaIsolata && vistaIsolata.azienda.ragioneSociale === clientePerAccesso.ragioneSociale, 'la vista per il token del cliente non corrisponde al cliente giusto');
    assert(!JSON.stringify(vistaIsolata).includes(altroClienteIsolamento.ragioneSociale), 'la vista isolata contiene tracce di un altro cliente!');
    assert(window.costruisciVistaPortaleClienteEsterna('token-di-fantasia-non-esistente') === null, 'un token inesistente deve tornare null (non un errore, non dati parziali)');
    console.log('=== Accesso portale reale: la vista per il token è isolata al singolo cliente, nessuna cross-contaminazione OK');

    // disattiva: il token viene azzerato e la vista per il vecchio token smette di funzionare
    click(q('#cardAccessoPortaleReale [data-action="portale-disattiva-accesso"]'));
    await wait(20);
    assert(window.clienteById(clientePerAccesso.id).portaleToken === null, 'portaleToken non azzerato dopo la disattivazione');
    assert(window.costruisciVistaPortaleClienteEsterna(tokenRigenerato) === null, 'un token disattivato deve tornare null anche se il valore è ancora quello corretto');
    assert(q('#cardAccessoPortaleReale [data-action="portale-attiva-accesso"]'), 'dopo la disattivazione deve ricomparire il pulsante "Attiva accesso portale"');
    assert(!q('#cardAccessoPortaleReale [data-action="portale-rigenera-link"]'), 'dopo la disattivazione non devono più comparire i pulsanti di gestione del link attivo');
    console.log('=== Accesso portale reale: disattivazione azzera il token e invalida il vecchio link OK');

    window.setHttpSyncAttivoTest(false);
    window.render();
    await wait(20);
  }

  // ---------- 8e-ter-bis) Password portale per singolo cliente (task Matteo #153): richiedePassword,
  // confronto a tempo costante (confrontoTempoCostante), nessun blocco per chi non ha password ----------
  {
    const clientePassword = window.getSTATE().clienti.filter(c => c.stato !== 'cessato')[6];
    assert(clientePassword, 'serve almeno 7 clienti attivi per questo test');
    assert(!clientePassword.portaleToken, 'precondizione: il cliente scelto per il test password non deve avere già un accesso attivo');

    window.setHttpSyncAttivoTest(true);
    window.render();
    await wait(20);
    setVal(q('[data-action="portal-seleziona-cliente"]'), clientePassword.id);
    await wait(20);
    click(q('#cardAccessoPortaleReale [data-action="portale-attiva-accesso"]'));
    await wait(20);
    const tokenPw = window.clienteById(clientePassword.id).portaleToken;
    assert(tokenPw, 'token non generato per il test password');

    // nessuna password impostata sul cliente: la vista è quella completa, nessun richiedePassword
    const vistaSenzaPw = window.costruisciVistaPortaleClienteEsterna(tokenPw);
    assert(vistaSenzaPw && !vistaSenzaPw.richiedePassword && vistaSenzaPw.azienda, 'senza password impostata sul cliente, la vista deve essere quella completa (nessuna richiesta password)');
    console.log('=== Password portale: cliente senza password impostata, nessun blocco OK');

    // impostiamo una password direttamente sullo STATE (equivalente a cardPasswordPortaleCliente + salvataggio)
    window.clienteById(clientePassword.id).portalePassword = 'SegretoDelCliente123';

    const vistaSenzaPassword = window.costruisciVistaPortaleClienteEsterna(tokenPw);
    assert(vistaSenzaPassword && vistaSenzaPassword.richiedePassword === true && !vistaSenzaPassword.azienda, 'senza inserire nessuna password deve tornare richiedePassword:true e nessun dato del cliente');

    const vistaPasswordSbagliata = window.costruisciVistaPortaleClienteEsterna(tokenPw, 'password-sbagliata');
    assert(vistaPasswordSbagliata && vistaPasswordSbagliata.richiedePassword === true && !vistaPasswordSbagliata.azienda, 'con la password sbagliata deve tornare richiedePassword:true e nessun dato del cliente');

    const vistaPasswordPrefisso = window.costruisciVistaPortaleClienteEsterna(tokenPw, 'SegretoDelCliente12');
    assert(vistaPasswordPrefisso && vistaPasswordPrefisso.richiedePassword === true, 'una password che è un prefisso esatto di quella giusta (più corta) deve comunque essere rifiutata, non solo quelle di lunghezza uguale');

    const vistaPasswordCorretta = window.costruisciVistaPortaleClienteEsterna(tokenPw, 'SegretoDelCliente123');
    assert(vistaPasswordCorretta && !vistaPasswordCorretta.richiedePassword && vistaPasswordCorretta.azienda && vistaPasswordCorretta.azienda.ragioneSociale === clientePassword.ragioneSociale, 'con la password corretta deve tornare la vista completa del cliente giusto');
    console.log('=== Password portale: richiedePassword su password mancante/sbagliata/più corta, vista completa solo con la password corretta OK');

    // rimuovendo la password (stringa vuota) il link torna a essere l'unica protezione, come prima
    window.clienteById(clientePassword.id).portalePassword = '';
    const vistaDopoRimozione = window.costruisciVistaPortaleClienteEsterna(tokenPw);
    assert(vistaDopoRimozione && !vistaDopoRimozione.richiedePassword && vistaDopoRimozione.azienda, 'dopo aver rimosso la password, il link deve tornare a funzionare senza richiederla');
    console.log('=== Password portale: rimuovendo la password il link torna a funzionare senza richiederla OK');

    // pulizia: disattiva accesso per non sporcare i test successivi
    window.clienteById(clientePassword.id).portaleToken = null;
    window.setHttpSyncAttivoTest(false);
    window.render();
    await wait(20);
  }

  // ---------- 8e-ter-quater) Accessi portale diversificati (richiesta Matteo): accesso principale
  // invariato, accesso secondario limitato a sole sezioni scelte, negato a quelle non consentite,
  // isolamento tra clienti diversi ----------
  {
    const clienti = window.getSTATE().clienti.filter(c => c.stato !== 'cessato');
    const clienteA = clienti[8], clienteB = clienti[9];
    assert(clienteA && clienteB, 'servono almeno 10 clienti attivi per questo test');

    window.attivaPortaleCliente(clienteA.id);
    const tokenPrincipale = window.clienteById(clienteA.id).portaleToken;
    assert(tokenPrincipale, 'token principale non generato');

    // l'accesso principale deve continuare a funzionare esattamente come prima (ruolo 'completo',
    // tutte le sezioni presenti) — nessuna regressione introdotta dal refactor su trovaAccessoPortale.
    const vistaPrincipale = window.costruisciVistaPortaleClienteEsterna(tokenPrincipale);
    assert(vistaPrincipale && !vistaPrincipale.richiedePassword && vistaPrincipale.azienda, 'accesso principale: deve funzionare come prima');
    assert(vistaPrincipale.accesso && vistaPrincipale.accesso.ruolo === 'completo', 'accesso principale: ruolo deve essere completo');
    assert(vistaPrincipale.accesso.sezioniConsentite.includes('andamento'), 'accesso principale: sezioniConsentite deve includere andamento (nessuna restrizione)');
    console.log('=== Accessi portale diversificati: accesso principale invariato (ruolo completo, nessuna sezione nascosta) OK');

    // accesso secondario limitato a comunicazioni+scadenze+documenti (preset di default), NON andamento
    const accessoLim = window.nuovoAccessoSecondarioPortale(clienteA.id, 'Amministrazione');
    assert(accessoLim && accessoLim.token && accessoLim.ruolo === 'limitato', 'accesso secondario non creato correttamente');
    assert(accessoLim.tabConsentiti.includes('comunicazioni') && accessoLim.tabConsentiti.includes('scadenze') && accessoLim.tabConsentiti.includes('documenti') && !accessoLim.tabConsentiti.includes('andamento'), 'preset di default inatteso per un nuovo accesso limitato');

    const vistaLimitata = window.costruisciVistaPortaleClienteEsterna(accessoLim.token);
    assert(vistaLimitata && !vistaLimitata.richiedePassword && vistaLimitata.azienda && vistaLimitata.azienda.ragioneSociale === clienteA.ragioneSociale, 'accesso limitato: deve comunque risolvere il cliente giusto');
    assert(vistaLimitata.andamento === null, 'accesso limitato: andamento non deve essere incluso nel payload (sezione non consentita)');
    assert(Array.isArray(vistaLimitata.scadenze), 'accesso limitato: scadenze deve essere presente come array (sezione consentita)');
    assert(Array.isArray(vistaLimitata.documenti), 'accesso limitato: documenti deve essere presente come array (sezione consentita)');
    console.log('=== Accessi portale diversificati: accesso limitato vede solo le sezioni consentite (andamento nascosto) OK');

    // togliendo anche "documenti" dalle sezioni consentite, il payload documenti deve azzerarsi
    window.aggiornaAccessoSecondarioPortale(clienteA.id, accessoLim.id, { tabConsentiti: ['comunicazioni'] });
    const vistaAncoraPiuLimitata = window.costruisciVistaPortaleClienteEsterna(accessoLim.token);
    assert(vistaAncoraPiuLimitata.documenti.length === 0 && vistaAncoraPiuLimitata.scadenze.length === 0 && vistaAncoraPiuLimitata.andamento === null, 'restringendo le sezioni consentite, i dati esclusi non devono comparire nel payload');
    assert(vistaAncoraPiuLimitata.comunicazioni !== undefined, 'la sezione ancora consentita (comunicazioni) deve restare presente');
    console.log('=== Accessi portale diversificati: restringere le sezioni consentite aggiorna subito cosa viene esposto OK');

    // un token disattivato non deve più risolvere nulla, anche se la stringa è ancora quella giusta
    window.aggiornaAccessoSecondarioPortale(clienteA.id, accessoLim.id, { attivo: false });
    assert(window.costruisciVistaPortaleClienteEsterna(accessoLim.token) === null, 'un accesso secondario disattivato non deve più risolvere alcuna vista');
    window.aggiornaAccessoSecondarioPortale(clienteA.id, accessoLim.id, { attivo: true, tabConsentiti: ['comunicazioni', 'scadenze', 'documenti'] });

    // password propria dell'accesso secondario, indipendente da quella (assente) dell'accesso principale
    window.aggiornaAccessoSecondarioPortale(clienteA.id, accessoLim.id, { password: 'Amministrazione2026' });
    assert(window.costruisciVistaPortaleClienteEsterna(accessoLim.token).richiedePassword === true, 'con password impostata sull\'accesso secondario, senza inserirla deve tornare richiedePassword');
    assert(window.costruisciVistaPortaleClienteEsterna(tokenPrincipale) && !window.costruisciVistaPortaleClienteEsterna(tokenPrincipale).richiedePassword, 'la password del secondario non deve in alcun modo richiedersi anche sul principale');
    assert(!window.costruisciVistaPortaleClienteEsterna(accessoLim.token, 'Amministrazione2026').richiedePassword, 'con la password corretta dell\'accesso secondario, deve funzionare');
    console.log('=== Accessi portale diversificati: password propria dell\'accesso secondario, indipendente dal principale OK');

    // isolamento: un accesso secondario del cliente A non deve MAI risolvere dati del cliente B
    window.attivaPortaleCliente(clienteB.id);
    const risolto = window.trovaAccessoPortale(accessoLim.token);
    assert(risolto && risolto.cliente.id === clienteA.id, 'un accesso secondario deve risolvere sempre e solo il proprio cliente, mai un altro');
    console.log('=== Accessi portale diversificati: isolamento tra clienti diversi OK');

    // eliminazione: il token smette di funzionare
    window.eliminaAccessoSecondarioPortale(clienteA.id, accessoLim.id);
    assert(window.costruisciVistaPortaleClienteEsterna(accessoLim.token) === null, 'dopo l\'eliminazione, l\'accesso non deve più risolvere nulla');
    console.log('=== Accessi portale diversificati: eliminazione revoca subito l\'accesso OK');

    // pulizia
    window.clienteById(clienteA.id).portaleToken = null;
    window.clienteById(clienteA.id).accessiSecondari = [];
    window.clienteById(clienteB.id).portaleToken = null;
    window.render();
    await wait(20);
  }

  // ---------- 8e-ter-quinquies) Fatture con ritenuta d'acconto nel portale cliente, 3 stadi (richiesta
  // Matteo, campagna 770) ----------
  {
    const clienteRit = window.getSTATE().clienti.filter(c => c.stato !== 'cessato')[11];
    assert(clienteRit, 'serve almeno un 12esimo cliente attivo per questo test');
    window.attivaPortaleCliente(clienteRit.id);
    const tokenRit = window.clienteById(clienteRit.id).portaleToken;
    assert(tokenRit, 'token portale non generato per il test ritenute');

    const anno = window.getSTATE().annoCorrente;
    const rNonPagata = { id: window.uid('rit'), clienteId: clienteRit.id, dataFattura: `${anno}-02-01`, dataPagamento: null, numeroFattura: 'TST-1', percipiente: 'Fornitore Test Uno', importo: 50, statoRit: 'In attesa di pagamento' };
    const rDaVersare = { id: window.uid('rit'), clienteId: clienteRit.id, dataFattura: `${anno}-03-01`, dataPagamento: `${anno}-03-05`, numeroFattura: 'TST-2', percipiente: 'Fornitore Test Due', importo: 60, statoRit: 'Da pagare' };
    const rTuttoPagato = { id: window.uid('rit'), clienteId: clienteRit.id, dataFattura: `${anno}-01-01`, dataPagamento: `${anno}-01-05`, numeroFattura: 'TST-3', percipiente: 'Fornitore Test Tre', importo: 70, statoRit: 'Inviata' };
    window.getSTATE().ritenuteRighe.push(rNonPagata, rDaVersare, rTuttoPagato);

    const vistaRit = window.costruisciVistaPortaleClienteEsterna(tokenRit);
    assert(Array.isArray(vistaRit.ritenute) && vistaRit.ritenute.length >= 3, `la vista portale dovrebbe includere le fatture con ritenuta, trovate ${vistaRit.ritenute && vistaRit.ritenute.length}`);
    const vNonPagata = vistaRit.ritenute.find(r => r.id === rNonPagata.id);
    const vDaVersare = vistaRit.ritenute.find(r => r.id === rDaVersare.id);
    const vTuttoPagato = vistaRit.ritenute.find(r => r.id === rTuttoPagato.id);
    assert(vNonPagata && vNonPagata.stadio.codice === 'non_pagata', 'una fattura senza dataPagamento deve avere stadio "non_pagata"');
    assert(vDaVersare && vDaVersare.stadio.codice === 'ritenuta_da_versare', 'una fattura pagata con statoRit "Da pagare" deve avere stadio "ritenuta_da_versare"');
    assert(vTuttoPagato && vTuttoPagato.stadio.codice === 'tutto_pagato', 'una fattura con statoRit "Inviata" deve avere stadio "tutto_pagato"');
    console.log('=== Portale cliente: fatture con ritenuta esposte con i tre stadi corretti (non pagata / ritenuta da versare / tutto pagato) OK');

    // "Ho pagato questa fattura": la segnalazione dal portale deve impostare dataPagamento e
    // passare lo statoRit a "Da pagare" (pagata dal cliente, ritenuta non ancora versata dallo studio).
    const esito = window.segnalaPagamentoRitenutaPortaleEsterno(tokenRit, rNonPagata.id, `${anno}-02-10`);
    assert(esito && esito.dataPagamento === `${anno}-02-10` && esito.statoRit === 'Da pagare', 'segnalaPagamentoRitenutaPortaleEsterno non ha aggiornato correttamente la riga');
    const vistaDopoSegnalazione = window.costruisciVistaPortaleClienteEsterna(tokenRit);
    assert(vistaDopoSegnalazione.ritenute.find(r => r.id === rNonPagata.id).stadio.codice === 'ritenuta_da_versare', 'dopo la segnalazione la fattura deve passare allo stadio "ritenuta_da_versare"');

    // idempotenza (coda offline che reinvia la stessa richiesta): non deve sovrascrivere la data già confermata né dare errore
    const esito2 = window.segnalaPagamentoRitenutaPortaleEsterno(tokenRit, rNonPagata.id, `${anno}-02-28`);
    assert(esito2 && esito2.dataPagamento === `${anno}-02-10`, 'un secondo invio della stessa segnalazione non deve sovrascrivere la data già registrata');

    // un token che non è quello del cliente giusto non deve poter toccare la fattura
    const clienteAltroRit = window.getSTATE().clienti.filter(c => c.stato !== 'cessato' && c.id !== clienteRit.id)[0];
    window.attivaPortaleCliente(clienteAltroRit.id);
    const tokenAltro = window.clienteById(clienteAltroRit.id).portaleToken;
    assert(window.segnalaPagamentoRitenutaPortaleEsterno(tokenAltro, rDaVersare.id, `${anno}-03-10`) === null, 'il token di un altro cliente non deve poter segnalare il pagamento di una fattura non sua');
    window.clienteById(clienteAltroRit.id).portaleToken = null;
    console.log('=== Portale cliente: "Ho pagato questa fattura" aggiorna lo stadio, idempotente, isolato per cliente OK');

    // Task #170 (Matteo: "vorrei che quando il cliente ci comunica che ha pagato una fattura con
    // ritenuta che ci venga inviata una comunicazione [...] così ce ne accorgiamo e non perdiamo il
    // pagamento"): la segnalazione appena avvenuta sopra (rNonPagata) deve aver creato una
    // comunicazione in arrivo dal cliente, "da leggere" per lo studio con lo stesso meccanismo già
    // usato per ogni altro messaggio dal portale.
    const comRitNonPagata = window.getSTATE().comunicazioni.find(c => c.ritenutaRif && c.ritenutaRif.id === rNonPagata.id);
    assert(comRitNonPagata, 'la prima segnalazione di pagamento deve creare una comunicazione collegata alla riga di ritenuta');
    assert(comRitNonPagata.clienteId === clienteRit.id, 'la comunicazione deve essere attribuita al cliente giusto');
    assert(comRitNonPagata.direzione === 'cliente' && comRitNonPagata.vistaStudio === false, 'la comunicazione deve risultare "dal cliente" e "da leggere" per lo studio, per comparire nel badge esistente');
    assert(comRitNonPagata.ritenutaRif.numeroFattura === 'TST-1' && comRitNonPagata.ritenutaRif.percipiente === 'Fornitore Test Uno', 'il riferimento alla fattura nella comunicazione non è corretto');
    assert(comRitNonPagata.oggetto.includes('TST-1'), 'l\'oggetto della comunicazione dovrebbe citare il numero fattura');
    assert(window.comunicazioniDaLeggereConteggio() >= 1, 'il contatore "da leggere" esistente deve includere anche questa nuova comunicazione');
    console.log('=== Comunicazioni: segnalare un pagamento ritenuta crea una comunicazione "da leggere" per lo studio OK');

    // idempotenza: il secondo invio (già testato sopra per la riga) NON deve creare una seconda comunicazione
    const comRitNonPagataConteggio = window.getSTATE().comunicazioni.filter(c => c.ritenutaRif && c.ritenutaRif.id === rNonPagata.id).length;
    assert(comRitNonPagataConteggio === 1, `un secondo invio idempotente della stessa segnalazione non deve creare una seconda comunicazione (trovate ${comRitNonPagataConteggio})`);
    console.log('=== Comunicazioni: un rinvio idempotente della segnalazione non duplica la comunicazione OK');

    // la comunicazione di sistema non deve comparire nel portale del cliente stesso (non serve, il
    // cliente ha già la conferma a schermo dal pulsante "Ho pagato"): visibilePortale deve essere false
    const vistaDopoComRit = window.costruisciVistaPortaleClienteEsterna(tokenRit);
    assert(!vistaDopoComRit.comunicazioni.some(c => c.id === comRitNonPagata.id), 'la comunicazione di notifica allo studio non deve comparire tra i messaggi visibili al cliente nel suo portale');
    console.log('=== Comunicazioni: la notifica di sistema allo studio resta invisibile al cliente nel suo portale OK');

    // pulizia
    window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => !(c.ritenutaRif && [rNonPagata.id, rDaVersare.id, rTuttoPagato.id].includes(c.ritenutaRif.id)));
    window.getSTATE().ritenuteRighe = window.getSTATE().ritenuteRighe.filter(r => ![rNonPagata.id, rDaVersare.id, rTuttoPagato.id].includes(r.id));
    window.clienteById(clienteRit.id).portaleToken = null;
    window.render();
    await wait(20);
  }

  // ---------- 8e-ter-ter) Sessione operatore locale: token esclusivo per referente con password (task #154) ----------
  {
    const nomeResp = window.getSTATE().meta.responsabili[0];
    assert(nomeResp, 'serve almeno un responsabile per questo test');

    // impostare un operatore SENZA passare da eseguiLoginOperatore non deve mai lasciare un token residuo
    window.setSessioneOperatoreTokenTest(null);
    window.impostaOperatore(nomeResp);
    assert(window.getSessioneOperatoreTokenTest() === null, 'impostare un operatore senza login non deve creare un token di sessione');
    console.log('=== Sessione operatore: nessun token residuo per un operatore scelto senza password OK');

    // un token salvato per un nome resta valido finché l'operatore corrente resta quel nome
    window.setSessioneOperatoreTokenTest({ nome: nomeResp, token: 'token-di-prova-123' });
    window.impostaOperatore(nomeResp);
    assert(window.getSessioneOperatoreTokenTest() && window.getSessioneOperatoreTokenTest().token === 'token-di-prova-123', 'scegliere di nuovo lo stesso nome non deve scartare un token già valido per quel nome');

    const altroNomeResp = window.getSTATE().meta.responsabili.find(n => n !== nomeResp);
    if (altroNomeResp) {
      window.impostaOperatore(altroNomeResp);
      assert(window.getSessioneOperatoreTokenTest() === null, 'cambiare operatore deve scartare un token di sessione che apparteneva al nome precedente');
      console.log('=== Sessione operatore: un token residuo di un nome diverso viene scartato al cambio operatore OK');
      window.impostaOperatore(nomeResp); // ripristina per non alterare l'operatore corrente per i test successivi
    }

    // responsabileHaPassword legge dalla cache dei nomi protetti (mai la password stessa)
    window.setResponsabiliConPasswordTest([nomeResp]);
    assert(window.responsabileHaPassword(nomeResp) === true, 'responsabileHaPassword deve risultare true per un nome presente nella cache');
    assert(window.responsabileHaPassword('Nome Che Di Sicuro Non Esiste Come Responsabile') === false, 'responsabileHaPassword deve risultare false per un nome non presente nella cache');
    window.setResponsabiliConPasswordTest([]);
    console.log('=== Sessione operatore: responsabileHaPassword coerente con la cache dei referenti protetti OK');

    window.setSessioneOperatoreTokenTest(null);
  }

  // ---------- 8e-quater) Area cliente interattiva (task #88): messaggi/risposte dal portale + thread studio ----------
  {
    const attiviQuater = window.getSTATE().clienti.filter(c => c.stato !== 'cessato');
    const clienteX = attiviQuater[6];
    const clienteY = attiviQuater[7];
    assert(clienteX && clienteY && clienteX.id !== clienteY.id, 'servono almeno 8 clienti attivi distinti per questo test');
    assert(!clienteX.portaleToken, 'precondizione: il cliente scelto non deve avere già un accesso portale attivo');
    window.attivaPortaleCliente(clienteX.id);
    const tokenX = window.clienteById(clienteX.id).portaleToken;
    assert(tokenX, 'token non generato per il cliente di test');

    const scadClienteX = window.derivati().tutteScadenze.find(s => s.clienteId === clienteX.id);
    const scadClienteY = window.derivati().tutteScadenze.find(s => s.clienteId === clienteY.id);
    assert(scadClienteX && scadClienteY, 'servono scadenze reali per entrambi i clienti di test');

    // ---- aggiungiMessaggioPortaleClienteEsterno: validazione, token, ownership della scadenza ----
    assert(window.aggiungiMessaggioPortaleClienteEsterno(tokenX, '   ', null) === null, 'un testo vuoto/di soli spazi deve essere rifiutato');
    assert(window.aggiungiMessaggioPortaleClienteEsterno('token-inventato-di-fantasia', 'ciao', null) === null, 'un token inesistente deve essere rifiutato');
    assert(window.aggiungiMessaggioPortaleClienteEsterno(null, 'ciao', null) === null, 'un token null deve essere rifiutato senza errore');
    assert(window.aggiungiMessaggioPortaleClienteEsterno(123, 'ciao', null) === null, 'un token non-stringa deve essere rifiutato senza errore');

    const msgGenerico = window.aggiungiMessaggioPortaleClienteEsterno(tokenX, 'Buongiorno, avrei una domanda generale sulla mia posizione.', null);
    assert(msgGenerico, 'il messaggio generico valido deve essere creato');
    assert(msgGenerico.clienteId === clienteX.id, 'il messaggio deve essere attribuito al cliente del token, non ad altri');
    assert(msgGenerico.direzione === 'cliente', 'un messaggio dal portale deve avere direzione "cliente"');
    assert(msgGenerico.categoria === 'Domanda dal cliente' && msgGenerico.oggetto === 'Domanda dal portale cliente', 'categoria/oggetto di default per un messaggio generico non corretti');
    assert(msgGenerico.vistaPortale === true && msgGenerico.vistaStudio === false, 'un messaggio appena scritto dal cliente deve essere "letto" per lui e "da leggere" per lo studio');
    assert(msgGenerico.scadenzaRif === null, 'un messaggio senza scadenza collegata non deve avere scadenzaRif');
    assert(window.getSTATE().comunicazioni.some(c => c.id === msgGenerico.id), 'il messaggio non risulta salvato in STATE.comunicazioni');
    console.log('=== Area cliente: messaggio generico dal portale creato correttamente (direzione, categoria, flag vista) OK');

    const msgScadAltrui = window.aggiungiMessaggioPortaleClienteEsterno(tokenX, 'Domanda che tenta di riferirsi alla scadenza di un altro cliente.', scadClienteY.id);
    assert(msgScadAltrui && msgScadAltrui.scadenzaRif === null, 'una scadenza che non appartiene al cliente del token deve essere ignorata silenziosamente, non fidandosi dell\'id passato dall\'esterno');
    assert(msgScadAltrui.categoria === 'Domanda dal cliente', 'senza una scadenza propria valida, il messaggio deve restare categorizzato come domanda generica');
    console.log('=== Area cliente: scadenzaIdRif di un altro cliente viene ignorato (nessuna cross-contaminazione) OK');

    const msgScadPropria = window.aggiungiMessaggioPortaleClienteEsterno(tokenX, 'A che punto siamo con questa scadenza?', scadClienteX.id);
    assert(msgScadPropria && msgScadPropria.scadenzaRif && msgScadPropria.scadenzaRif.id === scadClienteX.id, 'una scadenza propria valida deve essere collegata al messaggio');
    assert(msgScadPropria.scadenzaRif.nome === scadClienteX.nome && msgScadPropria.scadenzaRif.data === scadClienteX.data, 'nome/data della scadenza collegata devono essere ricalcolati dal motore, non presi da un input esterno');
    assert(msgScadPropria.categoria === 'Richiesta su scadenza' && msgScadPropria.oggetto.includes(scadClienteX.nome), 'categoria/oggetto di un messaggio legato a una scadenza non corretti');
    console.log('=== Area cliente: messaggio legato a una scadenza propria collegato correttamente (nome/data ricalcolati) OK');

    // ---- aggiungiRispostaPortaleClienteEsterno: ownership del thread ----
    const rispostaOk = window.aggiungiRispostaPortaleClienteEsterno(tokenX, msgGenerico.id, 'Aggiungo un dettaglio alla mia domanda.');
    assert(rispostaOk && rispostaOk.risposte.length === 1 && rispostaOk.risposte[0].autore === 'cliente' && rispostaOk.risposte[0].testo === 'Aggiungo un dettaglio alla mia domanda.', 'risposta del cliente a un proprio thread non salvata correttamente');
    assert(rispostaOk.vistaStudio === false, 'una risposta del cliente deve rimettere il thread "da leggere" per lo studio');

    const comAltrui = window.getSTATE().comunicazioni.find(c => c.clienteId !== clienteX.id);
    assert(comAltrui, 'serve almeno una comunicazione demo di un altro cliente per testare l\'ownership');
    assert(window.aggiungiRispostaPortaleClienteEsterno(tokenX, comAltrui.id, 'tentativo indebito di rispondere al thread di un altro cliente') === null, 'non deve essere possibile rispondere al thread di un altro cliente anche conoscendone l\'id');
    console.log('=== Area cliente: risposta cliente OK sul proprio thread, rifiutata su un thread di un altro cliente OK');

    window.getSTATE().comunicazioni.push({
      id: 'com_test_solointerno_88', clienteId: clienteX.id, data: window.oggiISO(), direzione: 'studio',
      categoria: 'Nota', oggetto: 'Nota interna di test (non visibile al cliente)', corpo: 'Riservato.',
      stato: 'Inviata', visibilePortale: false, vistaPortale: true, vistaStudio: true, risposte: [],
    });
    assert(window.aggiungiRispostaPortaleClienteEsterno(tokenX, 'com_test_solointerno_88', 'il cliente non dovrebbe poter rispondere qui') === null, 'non deve essere possibile rispondere a una comunicazione marcata "solo interno" anche se appartiene al cliente giusto');
    console.log('=== Area cliente: risposta rifiutata su una comunicazione "solo interno" anche se del cliente giusto OK');

    // ---- aggiungiRispostaComunicazione (lato studio) + flip dei flag vistaStudio/vistaPortale ----
    assert(window.aggiungiRispostaComunicazione(msgScadPropria.id, '   ', 'studio') === null, 'una risposta vuota dello studio deve essere rifiutata');
    const dopoRispostaStudio = window.aggiungiRispostaComunicazione(msgScadPropria.id, 'Ci stiamo lavorando, ti aggiorniamo entro venerdì.', 'studio');
    assert(dopoRispostaStudio.risposte.length === 1 && dopoRispostaStudio.risposte[0].autore === 'studio', 'risposta dello studio non salvata correttamente');
    assert(dopoRispostaStudio.vistaStudio === true && dopoRispostaStudio.vistaPortale === false, 'una risposta dello studio deve segnare il thread letto per lo studio e "nuovo" per il cliente');

    const dopoRispostaCliente2 = window.aggiungiRispostaPortaleClienteEsterno(tokenX, msgScadPropria.id, 'Grazie, resto in attesa.');
    assert(dopoRispostaCliente2 && dopoRispostaCliente2.risposte.length === 2 && dopoRispostaCliente2.risposte[1].autore === 'cliente', 'seconda risposta del cliente sullo stesso thread non salvata correttamente');
    assert(dopoRispostaCliente2.vistaStudio === false, 'la risposta del cliente deve riaprire il thread come "da leggere" per lo studio');
    console.log('=== Area cliente: botta e risposta studio/cliente sullo stesso thread, flag vistaStudio/vistaPortale coerenti a ogni passo OK');

    // ---- UI studio: badge "Da leggere", modale thread, risposta dal modale ----
    window.setView('comunicazioni');
    window.render();
    await wait(20);
    setVal(q('[data-action="com-filtro-cliente"]'), 'Tutti');
    setVal(q('[data-action="com-filtro-stato"]'), 'Tutti');
    await wait(20);

    const nDaLeggereAtteso = window.getSTATE().comunicazioni.filter(c => {
      const ultima = (c.risposte || []).length ? c.risposte[c.risposte.length - 1].autore : null;
      return (c.direzione === 'cliente' || ultima === 'cliente') && c.vistaStudio === false;
    }).length;
    assert(nDaLeggereAtteso >= 3, 'precondizione: ci si aspettano almeno 3 thread "da leggere" a questo punto del test');
    assert(q('.portal-banner') && q('.portal-banner').textContent.includes(String(nDaLeggereAtteso)), `il banner "da leggere" in cima a Comunicazioni deve mostrare il conteggio corretto (${nDaLeggereAtteso})`);

    const rigaScadPropria = q(`[data-action="com-apri-thread"][data-id="${msgScadPropria.id}"]`).closest('tr');
    // Task #26 (redesign riga Comunicazioni): il "da leggere" non è più un badge testuale ma un
    // puntino rosso con title="Da leggere" (niente testo visibile in .textContent) + la classe
    // "non-letta" sulla riga stessa - la asseriamo su quei due segnali invece del testo, che dal
    // redesign in poi non esiste più.
    assert(rigaScadPropria && rigaScadPropria.classList.contains('non-letta') && !!rigaScadPropria.querySelector('.puntino-rosso'), 'la riga del thread non ancora aperto dallo studio deve mostrare l\'indicatore "Da leggere"');
    assert(rigaScadPropria.textContent.includes('Dal cliente'), 'la riga di un messaggio scritto dal cliente deve mostrare il badge "Dal cliente"');
    console.log('=== Area cliente: badge "Da leggere"/"Dal cliente" e banner riepilogo in Comunicazioni corretti OK');

    click(q(`[data-action="com-apri-thread"][data-id="${msgScadPropria.id}"]`));
    await wait(20);
    assert(q('.modal h2') && q('.modal h2').textContent.trim() === msgScadPropria.oggetto, 'il titolo del modale thread non corrisponde all\'oggetto del messaggio');
    assert(q('.modal .modal-sub').textContent.includes('Dal cliente'), 'il modale thread deve mostrare il badge "Dal cliente" per un messaggio con direzione cliente');
    assert(q('.modal').textContent.includes(scadClienteX.nome), 'il modale thread non mostra il contesto della scadenza collegata');
    assert(q('.modal').textContent.includes('Ci stiamo lavorando') && q('.modal').textContent.includes('Grazie, resto in attesa.'), 'il modale thread non mostra tutte le risposte esistenti in ordine');
    assert(window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).vistaStudio === true, 'aprire il modale del thread deve segnarlo come letto dallo studio');
    assert(!q(`[data-action="com-apri-thread"][data-id="${msgScadPropria.id}"]`).closest('tr').querySelector('.puntino-rosso'), 'il badge "Da leggere" deve sparire dalla tabella non appena il thread viene aperto');
    console.log('=== Area cliente: apertura del modale thread mostra corpo/contesto/risposte e segna il thread come letto OK');

    click(q('[data-action="com-rispondi"]'));
    await wait(20);
    assert(window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).risposte.length === 2, 'un tentativo di invio con la risposta vuota dal modale non deve aggiungere nulla');

    setVal(q('#threadRispostaTesto'), 'Aggiornamento: pratica completata, tutto ok.');
    click(q('[data-action="com-rispondi"]'));
    await wait(20);
    const dopoRispostaModale = window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id);
    assert(dopoRispostaModale.risposte.length === 3, 'la risposta inviata dal modale del thread non è stata salvata');
    assert(dopoRispostaModale.risposte[2].autore === 'studio' && dopoRispostaModale.risposte[2].testo === 'Aggiornamento: pratica completata, tutto ok.', 'contenuto/autore della risposta inviata dal modale non corretti');
    assert(dopoRispostaModale.vistaPortale === false, 'la nuova risposta dello studio deve tornare visibile come "nuova" nel portale del cliente');
    assert(q('#threadRispostaTesto') && q('#threadRispostaTesto').value === '', 'il modale del thread deve ripresentarsi con il campo risposta vuoto dopo un invio riuscito');
    console.log('=== Area cliente: risposta dal modale thread salvata, textarea ripulita, vistaPortale riaperto per il cliente OK');

    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    assert(!q('.modal-backdrop'), 'il modale del thread non si chiude correttamente');

    // ---- isolamento finale: la vista del cliente riflette tutte le mutazioni, senza fughe verso l'altro cliente ----
    const vistaFinaleX = window.costruisciVistaPortaleClienteEsterna(tokenX);
    const comVistaFinale = vistaFinaleX.comunicazioni.find(c => c.id === msgScadPropria.id) || vistaFinaleX.comunicazioniArchiviate.find(c => c.id === msgScadPropria.id);
    assert(comVistaFinale, 'il thread di test deve comparire nella vista esterna del cliente');
    assert(comVistaFinale.risposte.map(r => r.autore).join(',') === 'studio,cliente,studio', 'la sequenza di risposte nella vista esterna non rispecchia l\'ordine reale del thread');
    assert(comVistaFinale.scadenzaRif && comVistaFinale.scadenzaRif.id === scadClienteX.id, 'il riferimento alla scadenza deve comparire anche nella vista esterna');
    assert(!JSON.stringify(vistaFinaleX).includes(clienteY.ragioneSociale), 'la vista esterna del cliente, dopo tutte le mutazioni del test, contiene ancora tracce di un altro cliente!');
    console.log('=== Area cliente: vista esterna del cliente coerente con tutte le mutazioni e ancora isolata dall\'altro cliente OK');

    // ---- Task #108: il cliente allega un documento (messaggio nuovo + risposta a un thread) ----
    // In questo ambiente di test non c'è un server.js reale che scriva il file (HTTP_SYNC_ATTIVO è
    // false, come verificato altrove): qui si esercita la logica dati a valle dell'upload, esattamente
    // come se server.js avesse già scritto il file e passato {percorso, nomeFile, dimensione}.
    const fileInfoMsg = { percorso: 'Cliente Test [123456]/Dal cliente/ricevuta.pdf', nomeFile: 'ricevuta.pdf', dimensione: 12345 };
    const msgConAllegato = window.aggiungiMessaggioPortaleClienteEsterno(tokenX, 'Ecco la ricevuta che mi avete chiesto.', null, fileInfoMsg);
    assert(msgConAllegato && msgConAllegato.filePercorso === fileInfoMsg.percorso && msgConAllegato.fileNome === fileInfoMsg.nomeFile && msgConAllegato.fileDimensione === fileInfoMsg.dimensione, 'il messaggio del cliente con allegato non ha salvato filePercorso/fileNome/fileDimensione correttamente');
    console.log('=== Task #108: messaggio nuovo del cliente con allegato salva filePercorso/fileNome/fileDimensione OK');

    const fileInfoRisp = { percorso: 'Cliente Test [123456]/Dal cliente/allegato2.pdf', nomeFile: 'allegato2.pdf', dimensione: 999 };
    const rispostaConAllegato = window.aggiungiRispostaPortaleClienteEsterno(tokenX, msgScadPropria.id, 'Allego anche questo, grazie.', fileInfoRisp);
    assert(rispostaConAllegato, 'la risposta con allegato del cliente non è stata salvata');
    const ultimaRisposta = rispostaConAllegato.risposte[rispostaConAllegato.risposte.length - 1];
    assert(ultimaRisposta.filePercorso === fileInfoRisp.percorso && ultimaRisposta.fileNome === fileInfoRisp.nomeFile, 'la risposta con allegato non ha salvato filePercorso/fileNome correttamente');
    console.log('=== Task #108: risposta del cliente con allegato salva filePercorso/fileNome correttamente OK');

    // La vista esterna deve mappare gli allegati (messaggio e risposta) a documentoToken opachi, mai al percorso reale
    const vistaConAllegati = window.costruisciVistaPortaleClienteEsterna(tokenX);
    const comMsgAllegato = vistaConAllegati.comunicazioni.find(c => c.id === msgConAllegato.id);
    assert(comMsgAllegato && comMsgAllegato.allegato && comMsgAllegato.allegato.documentoToken === 'com_' + msgConAllegato.id && comMsgAllegato.allegato.nome === fileInfoMsg.nomeFile, 'la vista esterna non mappa correttamente l\'allegato del messaggio a un documentoToken opaco');
    assert(!JSON.stringify(comMsgAllegato).includes(fileInfoMsg.percorso), 'la vista esterna non deve MAI esporre il percorso reale del file, solo il documentoToken');
    const comConRispostaAllegato = vistaConAllegati.comunicazioni.find(c => c.id === msgScadPropria.id);
    const rispVista = comConRispostaAllegato.risposte[comConRispostaAllegato.risposte.length - 1];
    assert(rispVista.allegato && rispVista.allegato.documentoToken === 'risp_' + ultimaRisposta.id && rispVista.allegato.nome === fileInfoRisp.nomeFile, 'la vista esterna non mappa correttamente l\'allegato della risposta a un documentoToken opaco "risp_"');
    console.log('=== Task #108: vista esterna espone gli allegati di messaggi e risposte solo via documentoToken opaco OK');

    // risolviDocumentoPortaleEsterno deve risolvere il nuovo prefisso "risp_" (documenti/comunicazioni già testati altrove)
    const risoltoRisp = window.risolviDocumentoPortaleEsterno(tokenX, 'risp_' + ultimaRisposta.id);
    assert(risoltoRisp && risoltoRisp.filePercorso === fileInfoRisp.percorso && risoltoRisp.nomeFile === fileInfoRisp.nomeFile, 'risolviDocumentoPortaleEsterno non risolve correttamente un allegato di risposta (prefisso risp_)');
    assert(window.risolviDocumentoPortaleEsterno('token-di-fantasia-non-esistente', 'risp_' + ultimaRisposta.id) === null, 'un token inesistente non deve risolvere nessun allegato');
    console.log('=== Task #108: risolviDocumentoPortaleEsterno risolve un allegato di risposta (prefisso risp_) e resta isolato per token OK');

    // ---- Task #142: salvataggio di un allegato-risposta come Documento del cliente ("raccolta documentale") ----
    window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).categoriaDocumentoRichiesta = 'Pratiche';
    const nDocClienteXPrima = window.getSTATE().documenti.filter(d => d.clienteId === clienteX.id).length;
    assert(window.salvaDocumentoDaComunicazione('id-inesistente', ultimaRisposta.id) === null, 'salvaDocumentoDaComunicazione con un id comunicazione inesistente deve restituire null');
    assert(window.salvaDocumentoDaComunicazione(msgScadPropria.id, 'id-risposta-inesistente') === null, 'salvaDocumentoDaComunicazione con un id risposta inesistente deve restituire null');
    const docSalvato = window.salvaDocumentoDaComunicazione(msgScadPropria.id, ultimaRisposta.id);
    assert(docSalvato, 'il documento non è stato creato dalla risposta con allegato');
    assert(docSalvato.clienteId === clienteX.id, 'il documento salvato deve appartenere al cliente giusto');
    assert(docSalvato.categoria === 'Pratiche', 'il documento salvato deve ereditare la categoria richiesta dalla comunicazione');
    assert(docSalvato.filePercorso === fileInfoRisp.percorso && docSalvato.fileNome === fileInfoRisp.nomeFile, 'il documento salvato non punta al file reale della risposta');
    assert(window.getSTATE().documenti.filter(d => d.clienteId === clienteX.id).length === nDocClienteXPrima + 1, 'il numero di documenti del cliente non è aumentato di uno');
    const rispostaAggiornata = window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).risposte.find(r => r.id === ultimaRisposta.id);
    assert(rispostaAggiornata.salvatoComeDocumento === true && rispostaAggiornata.documentoIdSalvato === docSalvato.id, 'la risposta non risulta marcata come "salvata come documento"');
    assert(window.salvaDocumentoDaComunicazione(msgScadPropria.id, ultimaRisposta.id) === null, 'un allegato già salvato come documento non deve poter essere salvato una seconda volta (niente duplicati)');
    console.log('=== Task #142: salvaDocumentoDaComunicazione crea il documento nella categoria giusta, marca la risposta e blocca i duplicati OK');

    // ---- Task #142 (UI): bottone "Salva in Documenti" nel thread ----
    const fileInfoRisp2 = { percorso: 'Cliente Test [123456]/Dal cliente/allegato3.pdf', nomeFile: 'allegato3.pdf', dimensione: 555 };
    const rispostaConAllegato2 = window.aggiungiRispostaPortaleClienteEsterno(tokenX, msgScadPropria.id, 'Ecco anche questo secondo allegato.', fileInfoRisp2);
    assert(rispostaConAllegato2, 'seconda risposta con allegato non salvata');
    const ultimaRisposta2 = rispostaConAllegato2.risposte[rispostaConAllegato2.risposte.length - 1];

    window.setView('comunicazioni');
    window.render();
    await wait(20);
    click(q(`[data-action="com-apri-thread"][data-id="${msgScadPropria.id}"]`));
    await wait(20);
    const bottoneSalvaDoc = q(`[data-action="apri-salva-risposta-doc"][data-risp="${ultimaRisposta2.id}"]`);
    assert(bottoneSalvaDoc, 'il bottone "Salva in Documenti…" non compare per un allegato non ancora salvato');
    assert(!q(`[data-action="apri-salva-risposta-doc"][data-risp="${ultimaRisposta.id}"]`), 'per un allegato già salvato non deve più comparire il bottone "Salva in Documenti…"');
    assert(q('.modal').textContent.includes('Salvato in Documenti'), 'per un allegato già salvato deve comparire il badge "Salvato in Documenti"');
    // Il bottone apre il modale di scelta categoria/anno (non salva più subito con una categoria
    // indovinata - task Matteo: "quando ti dicevo che vorrei categorizzare i documenti intendevo questo")
    click(bottoneSalvaDoc);
    await wait(20);
    const selCategoria = q('#salvaDocCategoria');
    assert(selCategoria, 'il modale "Salva in Documenti" non mostra il selettore categoria');
    assert(selCategoria.value === 'Pratiche', 'la categoria proposta di default dovrebbe essere quella richiesta dalla comunicazione (Pratiche)');
    const bottoneConferma = q(`[data-action="conferma-salva-risposta-doc"][data-risp="${ultimaRisposta2.id}"]`);
    assert(bottoneConferma, 'il modale non ha il bottone di conferma "Salva"');
    click(bottoneConferma);
    await wait(20);
    const docDaUI = window.getSTATE().documenti.find(d => d.filePercorso === fileInfoRisp2.percorso);
    assert(docDaUI, 'il click su "Salva" nel modale non ha creato il documento');
    assert(docDaUI.categoria === 'Pratiche', 'il documento creato dalla UI non ha la categoria scelta nel modale');
    assert(q('.modal').textContent.includes('allegato3.pdf') && !q(`[data-action="apri-salva-risposta-doc"][data-risp="${ultimaRisposta2.id}"]`), 'dopo il salvataggio il bottone deve sparire e il thread deve riaprirsi con il badge aggiornato');
    console.log('=== Task #142: bottone "Salva in Documenti" nel thread crea il documento e si aggiorna in badge "Salvato" senza chiudere il modale OK');

    // ---- Task #140: chiudere/riaprire una richiesta arrivata dal cliente ----
    assert(window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).richiestaChiusa !== true, 'precondizione: la richiesta non deve essere già chiusa');
    const bottoneChiudi = q(`[data-action="com-chiudi-richiesta"][data-id="${msgScadPropria.id}"]`);
    assert(bottoneChiudi, 'per una richiesta arrivata dal cliente (direzione "cliente") deve comparire il bottone "Chiudi richiesta" nel thread');
    click(bottoneChiudi);
    await wait(20);
    assert(window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).richiestaChiusa === true, 'il click su "Chiudi richiesta" non ha marcato richiestaChiusa a true');
    // Task #124: il badge è stato rinominato "Richiesta chiusa" (minuscolo) per distinguerlo dal
    // nuovo badge "Archiviata dal portale" (archiviataPortale, indipendente da richiestaChiusa).
    assert(q('.modal .modal-sub').textContent.includes('Richiesta chiusa'), 'il modale thread non mostra il badge "Richiesta chiusa" dopo la chiusura');
    const bottoneRiapri = q(`[data-action="com-riapri-richiesta"][data-id="${msgScadPropria.id}"]`);
    assert(bottoneRiapri, 'dopo la chiusura deve comparire il bottone "Riapri richiesta" al posto di "Chiudi richiesta"');
    click(bottoneRiapri);
    await wait(20);
    assert(window.getSTATE().comunicazioni.find(c => c.id === msgScadPropria.id).richiestaChiusa === false, 'il click su "Riapri richiesta" non ha rimesso richiestaChiusa a false');
    console.log('=== Task #140: chiudi/riapri richiesta dal thread aggiorna richiestaChiusa e il bottone/badge coerentemente OK');

    click(q('[data-action="chiudi-modal"]'));
    await wait(20);

    // una comunicazione scritta dallo studio (direzione "studio") non deve avere il bottone chiudi/riapri:
    // non è una "richiesta" arrivata dal cliente, ha già il proprio stato Bozza/Programmata/Inviata.
    const comStudioEsempio = window.getSTATE().comunicazioni.find(c => c.direzione !== 'cliente');
    assert(comStudioEsempio, 'serve almeno una comunicazione demo scritta dallo studio per questo controllo');
    click(q(`[data-action="com-apri-thread"][data-id="${comStudioEsempio.id}"]`));
    await wait(20);
    assert(!q('[data-action="com-chiudi-richiesta"]') && !q('[data-action="com-riapri-richiesta"]'), 'una comunicazione scritta dallo studio non deve mai mostrare i bottoni chiudi/riapri richiesta');
    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    console.log('=== Task #140: il bottone chiudi/riapri richiesta compare solo per comunicazioni con direzione "cliente" OK');

    // pulizia: rimuove solo il messaggio nuovo creato in questo blocco, per non alterare i conteggi
    // che i test successivi (e il blocco di pulizia già presente sopra) si aspettano.
    window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => c.id !== msgConAllegato.id);
    window.salvaStato();

    // ---- cross-check: token disattivato non deve più poter scrivere ----
    window.disattivaPortaleCliente(clienteX.id);
    assert(window.aggiungiMessaggioPortaleClienteEsterno(tokenX, 'messaggio dopo la disattivazione', null) === null, 'un token disattivato non deve poter più scrivere messaggi');
    assert(window.aggiungiRispostaPortaleClienteEsterno(tokenX, msgScadPropria.id, 'risposta dopo la disattivazione') === null, 'un token disattivato non deve poter più rispondere ai thread');
    console.log('=== Area cliente: un token disattivato perde ogni capacità di scrittura, non solo di lettura OK');
  }

  // ---------- 8e-quinquies) "Chi sei" (task #98) + interazione nell'anteprima portale (task #107) ----------
  {
    window.impostaOperatore('Nome Che Non Esiste');
    assert(window.operatoreCorrente() === null, 'un nome non tra i responsabili non deve mai diventare operatore corrente');
    window.impostaOperatore('Sabrina');
    assert(window.operatoreCorrente() === 'Sabrina', 'impostaOperatore con un nome valido deve impostare operatoreCorrente');
    window.getSTATE().meta.responsabili = window.getSTATE().meta.responsabili.filter(r => r !== 'Sabrina');
    assert(window.operatoreCorrente() === null, 'operatoreCorrente deve auto-correggersi a null se il nome scelto non è più tra i responsabili');
    window.getSTATE().meta.responsabili.push('Sabrina'); // ripristina per il resto della suite
    window.impostaOperatore('Matteo');
    assert(window.operatoreCorrente() === 'Matteo', 'operatoreCorrente non ripristinato correttamente dopo il self-heal');
    console.log('=== "Chi sei": impostaOperatore/operatoreCorrente validano e si auto-correggono OK');

    // Comunicazione USA E GETTA per il test di attribuzione, per non alterare i flag/risposte di
    // una comunicazione demo di cui altri test più avanti nella suite potrebbero fidarsi (conteggi,
    // stato) - viene rimossa da STATE in fondo al blocco insieme al resto creato qui.
    const clientePerAttrib = window.getSTATE().clienti.find(c => c.stato !== 'cessato');
    const comAttrib = { id: 'com_test_attrib_98', clienteId: clientePerAttrib.id, data: window.oggiISO(), direzione: 'studio',
      categoria: 'Nota', oggetto: 'Comunicazione usa-e-getta per test attribuzione operatore', corpo: '',
      stato: 'Inviata', visibilePortale: true, vistaPortale: true, vistaStudio: true, risposte: [] };
    window.getSTATE().comunicazioni.push(comAttrib);
    const dopoAttrib = window.aggiungiRispostaComunicazione(comAttrib.id, 'Test attribuzione operatore.', 'studio');
    const ultimaRisp = dopoAttrib.risposte[dopoAttrib.risposte.length - 1];
    assert(ultimaRisp.operatore === 'Matteo', 'una risposta dello studio deve riportare il nome dell\'operatore corrente');
    const rispostaCliente = window.aggiungiRispostaComunicazione(comAttrib.id, 'Test risposta cliente.', 'cliente');
    const ultimaRispCliente = rispostaCliente.risposte[rispostaCliente.risposte.length - 1];
    assert(!ultimaRispCliente.operatore, 'una risposta del cliente non deve avere un operatore attribuito');
    console.log('=== "Chi sei": le risposte dello studio riportano il nome dell\'operatore corrente OK');

    // ---- Anteprima portale (desktop, a schermo intero): "Chiedi info su questa scadenza" +
    // "Scrivi allo studio" + risposta ----
    // Task #111: il mockup "a telefono" è stato rimosso, quindi questa interazione si testa solo
    // nell'anteprima desktop a schermo intero (unica superficie in-app rimasta). Cerca fra i clienti
    // attivi il primo che ha almeno una scadenza APERTA (visibile nel portale: datiPortaleCliente
    // filtra quelle chiuse) - non si può assumere che derivati().tutteScadenze[0] appartenga a un
    // cliente con scadenze aperte nel portale, quindi si cerca direttamente nell'interfaccia finché
    // non si trova un pulsante reale. Il cambio cliente ad anteprima già aperta la riallinea da solo
    // (comportamento già verificato sopra), quindi l'anteprima si apre una volta sola prima del ciclo.
    click(q('[data-nav="portale"]'));
    await wait(20);
    const attiviPerPreview = window.getSTATE().clienti.filter(c => c.stato !== 'cessato');
    setVal(q('[data-action="portal-seleziona-cliente"]'), attiviPerPreview[0].id);
    await wait(20);
    click(q('[data-action="portal-schermo-intero"]'));
    await wait(20);
    click(q('[data-action="portal-desktop-tab"][data-tab="scadenze"]'));
    await wait(20);
    let btnChiediInfoPd = null, clientePreviewId = null;
    for (const c of attiviPerPreview) {
      setVal(q('[data-action="portal-seleziona-cliente"]'), c.id);
      await wait(10);
      const btn = q('[data-action="portal-preview-chiedi-info"][data-ctx="pd"]');
      if (btn) { btnChiediInfoPd = btn; clientePreviewId = c.id; break; }
    }
    assert(btnChiediInfoPd, 'nessun cliente demo ha una scadenza aperta con il pulsante "Chiedi info su questa scadenza" nell\'anteprima desktop');
    const scadIdAttesa = btnChiediInfoPd.dataset.id, scadNomeAtteso = btnChiediInfoPd.dataset.nome;
    click(btnChiediInfoPd);
    await wait(20);
    assert(q('.pd-nav-item.active').textContent.trim().startsWith('Comunicazioni'), 'click su "Chiedi info" deve portare alla schermata Comunicazioni'); // task #123: può avere il badge non-lette accodato
    assert(q('#portalFullscreenPhone').textContent.includes('Chiedi info su questa scadenza'), 'il box compose deve mostrare il titolo "Chiedi info su questa scadenza" col riferimento pre-compilato');
    assert(q('#portalFullscreenPhone').textContent.includes(scadNomeAtteso), 'il box compose deve mostrare il nome della scadenza scelta come riferimento');
    const campoComposePd = q('#previewComposePd');
    assert(campoComposePd, 'box compose non trovato nell\'anteprima desktop dopo il click');
    const nComPrima = window.getSTATE().comunicazioni.length;
    click(q('[data-action="portal-preview-invia-messaggio"][data-ctx="pd"]'));
    await wait(20);
    assert(window.getSTATE().comunicazioni.length === nComPrima, 'un invio con testo vuoto non deve creare nulla');
    setVal(q('#previewComposePd'), 'A che punto siamo con questa scadenza?');
    click(q('[data-action="portal-preview-invia-messaggio"][data-ctx="pd"]'));
    await wait(20);
    assert(window.getSTATE().comunicazioni.length === nComPrima + 1, 'il messaggio simulato non è stato creato');
    const msgCreato = window.getSTATE().comunicazioni[window.getSTATE().comunicazioni.length - 1];
    assert(msgCreato.clienteId === clientePreviewId && msgCreato.direzione === 'cliente' && msgCreato.scadenzaRif && msgCreato.scadenzaRif.id === scadIdAttesa, 'il messaggio simulato non è attribuito correttamente al cliente/scadenza giusti');
    console.log('=== Anteprima portale (desktop): "Chiedi info su questa scadenza" pre-compila e invia correttamente OK');

    const btnRispondiPd = q(`[data-action="portal-preview-toggle-risposta"][data-id="${msgCreato.id}"]`);
    assert(btnRispondiPd, 'pulsante "Rispondi" non trovato per il nuovo thread nell\'anteprima desktop');
    click(btnRispondiPd);
    await wait(20);
    const campoRispostaPd = q(`#previewRispostaPd_${msgCreato.id}`);
    assert(campoRispostaPd, 'campo risposta non apparso dopo il toggle');
    setVal(campoRispostaPd, 'Aggiungo un dettaglio (simulato).');
    click(q(`[data-action="portal-preview-invia-risposta"][data-ctx="pd"][data-id="${msgCreato.id}"]`));
    await wait(20);
    const msgConRisposta = window.getSTATE().comunicazioni.find(c => c.id === msgCreato.id);
    assert(msgConRisposta.risposte.length === 1 && msgConRisposta.risposte[0].autore === 'cliente' && msgConRisposta.risposte[0].testo === 'Aggiungo un dettaglio (simulato).', 'la risposta simulata dall\'anteprima desktop non è stata salvata correttamente');
    console.log('=== Anteprima portale (desktop): risposta simulata al thread salvata correttamente OK');
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(20);

    // pulizia: rimuove tutto quel che questo blocco ha creato, per non alterare i conteggi che i
    // test successivi si aspettano sulle comunicazioni demo originali.
    const idsDaRimuovere = new Set([comAttrib.id, msgCreato.id]);
    window.getSTATE().comunicazioni = window.getSTATE().comunicazioni.filter(c => !idsDaRimuovere.has(c.id));
    window.salvaStato(); window.render();
    await wait(20);
  }

  // ---------- 8f) Catalogo scadenze (Impostazioni): modifica, disattiva, nuovo tipo personalizzato ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="catalogo"]'));
  await wait(20);
  const tipoIvaMensile = q('[data-action="cat-per-expand"][data-tipo="ivaMensile"]');
  assert(tipoIvaMensile, 'tipo scadenza "ivaMensile" non trovato nel catalogo');
  click(tipoIvaMensile);
  await wait(20);
  const primoGiornoInput = q('[data-action="cat-per-giorno"][data-tipo="ivaMensile"][data-idx="0"]');
  assert(primoGiornoInput, 'input giorno prima occorrenza IVA mensile non trovato');
  setVal(primoGiornoInput, '18');
  await wait(20);
  assert(window.getSTATE().catalogoPeriodico.find(t=>t.id==='ivaMensile').occorrenze[0].g === 18, 'modifica giorno scadenza catalogo non salvata');
  console.log('=== Catalogo periodico: giorno IVA mensile modificato a 18 e salvato in STATE');

  const nTipiPrima = window.getSTATE().catalogoPeriodico.length;
  click(q('[data-action="cat-per-nuovo-tipo"]'));
  await wait(20);
  assert(window.getSTATE().catalogoPeriodico.length === nTipiPrima + 1, 'nuovo tipo di scadenza personalizzata non creato');
  const tipoCustom = window.getSTATE().catalogoPeriodico[window.getSTATE().catalogoPeriodico.length - 1];
  assert(tipoCustom.personalizzato === true, 'il nuovo tipo non risulta marcato come personalizzato');
  console.log('=== Nuovo tipo di scadenza personalizzata creato:', tipoCustom.nome);
  // il flag personalizzato deve comparire come checkbox selezionabile nel form cliente
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q('[data-action="nuovo-cliente"]'));
  await wait(20);
  const chkCustom = q(`[data-flag="${tipoCustom.flag}"]`);
  assert(chkCustom, 'checkbox del tipo di scadenza personalizzata non compare nel form cliente');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  // pulizia: rimuove il tipo personalizzato di test dal catalogo
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="catalogo"]'));
  await wait(20);
  click(q(`[data-action="cat-per-expand"][data-tipo="${tipoCustom.id}"]`));
  await wait(20);
  click(q(`[data-action="cat-per-elimina-tipo"][data-tipo="${tipoCustom.id}"]`));
  await wait(20);
  assert(window.getSTATE().catalogoPeriodico.length === nTipiPrima, 'tipo personalizzato di test non rimosso correttamente');
  console.log('=== Catalogo periodico: tipo personalizzato di test eliminato correttamente');

  // disattiva un tipo di adempimento annuale e verifica sparisca dalle nuove scadenze generate
  const tipoAnnualeToggle = q('[data-action="cat-ann-toggle-attivo"][data-tipo="VIDIMAZIONE_LIBRI"]');
  assert(tipoAnnualeToggle, 'tipo annuale VIDIMAZIONE_LIBRI non trovato nel catalogo');
  setChecked(tipoAnnualeToggle, false);
  await wait(20);
  assert(window.getSTATE().catalogoAnnuale.find(t=>t.chiave==='VIDIMAZIONE_LIBRI').attivo === false, 'disattivazione tipo annuale non salvata');
  const annualiDopoDisattivazione = window.derivati().annuali;
  assert(annualiDopoDisattivazione.every(a => a.tipoChiave !== 'VIDIMAZIONE_LIBRI'), 'un tipo annuale disattivato continua a generare adempimenti');
  // Ripristina: il "cat-ann-toggle-attivo" sopra chiama render(), che sostituisce l'intero DOM —
  // il riferimento "tipoAnnualeToggle" catturato prima è ormai un nodo staccato dal documento, e
  // dispatchEvent su un nodo staccato non risale mai fino al listener delegato su document.body
  // (bug di isolamento del test, non dell'app: il ripristino sarebbe stato un no-op silenzioso,
  // lasciando VIDIMAZIONE_LIBRI disattivato per il resto della suite — scoperto perché il test
  // sulla data predefinita del catalogo annuale più avanti dipende proprio da questa voce attiva).
  setChecked(q('[data-action="cat-ann-toggle-attivo"][data-tipo="VIDIMAZIONE_LIBRI"]'), true);
  await wait(20);
  assert(window.getSTATE().catalogoAnnuale.find(t=>t.chiave==='VIDIMAZIONE_LIBRI').attivo === true, 'ripristino tipo annuale VIDIMAZIONE_LIBRI non riuscito (nodo staccato dal DOM dopo il render intermedio)');
  console.log('=== Catalogo annuale: disattivazione tipo esclude correttamente le nuove generazioni, ripristino verificato');

  // ---------- 8g) Task team: creazione, assegnazione, cambio stato, filtri, eliminazione ----------
  click(q('[data-nav="taskteam"]'));
  await wait(20);
  const nTaskPrima = window.getSTATE().taskTeam.length;
  assert(nTaskPrima === 5, `attesi 5 task demo, trovati ${nTaskPrima}`);
  const inRitardoPrima = window.getSTATE().taskTeam.filter(t => t.stato !== 'Fatto' && t.scadenza && t.scadenza < window.oggiISO()).length;
  assert(inRitardoPrima >= 1, 'atteso almeno un task demo in ritardo per testare il badge');
  assert(qa('.pill-delta.scaduto').length >= 1, 'nessun badge "In ritardo" mostrato nella board task, atteso almeno uno');

  click(q('[data-action="nuovo-task-team"]'));
  await wait(20);
  assert(q('#formTaskTeam'), 'form nuovo task non renderizzato');
  assertNoAutoSubmit(q('#formTaskTeam'), 'formTaskTeam');
  const clientePerTask = window.getSTATE().clienti.find(c => c.stato !== 'cessato');
  const responsabili = window.getSTATE().meta.responsabili;
  const assegnatario = responsabili[responsabili.length - 1]; // un collega diverso da chi "crea" idealmente, qui basta un valore valido
  setVal(q('#tTitolo'), 'Task di prova assegnato da un collega');
  setVal(q('#tAssegnato'), assegnatario);
  setVal(q('#tCliente'), clientePerTask.id);
  setVal(q('#tNuovaNota'), 'Nota di prova.');
  click(q('[data-action="salva-task-team"]'));
  await wait(20);
  assert(window.getSTATE().taskTeam.length === nTaskPrima + 1, 'nuovo task non salvato');
  const taskCreato = window.getSTATE().taskTeam.find(t => t.titolo === 'Task di prova assegnato da un collega');
  assert(taskCreato && taskCreato.assegnatoA === assegnatario && taskCreato.clienteId === clientePerTask.id, 'assegnazione/cliente del nuovo task non corretti');
  assert(taskCreato.stato === 'Da fare', 'stato di default del nuovo task non corretto');
  // Task #114: la nota iniziale scritta in creazione deve diventare la prima voce dello storico,
  // con autore e data - non un campo testo semplice sovrascrivibile.
  assert(Array.isArray(taskCreato.noteStorico) && taskCreato.noteStorico.length === 1, 'la nota iniziale del nuovo task non è finita nello storico noteStorico');
  assert(taskCreato.noteStorico[0].testo === 'Nota di prova.', 'il testo della nota iniziale non corrisponde');
  assert(taskCreato.noteStorico[0].data === window.oggiISO(), 'la data della nota iniziale non è quella odierna');
  console.log('=== Task creato:', taskCreato.titolo, '- assegnato a', taskCreato.assegnatoA);

  // ---- Task #114: storico note multiple in modifica (append, mai sovrascrittura) ----
  click(q(`[data-action="modifica-task-team"][data-id="${taskCreato.id}"]`));
  await wait(20);
  assert(q('#formTaskTeam'), 'form modifica task non renderizzato');
  assert(window.document.body.textContent.includes('Nota di prova.'), 'lo storico note in modifica non mostra la nota iniziale');
  setVal(q('#tNuovaNota'), 'Seconda nota, aggiunta in un momento successivo.');
  click(q(`[data-action="task-aggiungi-nota"][data-id="${taskCreato.id}"]`));
  await wait(20);
  const taskDopoSecondaNota = window.getSTATE().taskTeam.find(t => t.id === taskCreato.id);
  assert(taskDopoSecondaNota.noteStorico.length === 2, 'la seconda nota non si è accodata allo storico (deve restare anche la prima)');
  assert(taskDopoSecondaNota.noteStorico[0].testo === 'Nota di prova.', 'la prima nota è sparita/è stata sovrascritta aggiungendone una seconda');
  assert(taskDopoSecondaNota.noteStorico[1].testo === 'Seconda nota, aggiunta in un momento successivo.', 'la seconda nota non è stata salvata correttamente');
  assert(q('#formTaskTeam'), 'il modale deve restare aperto (sullo stesso task) dopo "Aggiungi nota", non chiudersi');
  assert(q('#tNuovaNota').value === '', 'il campo nuova nota deve svuotarsi dopo averla aggiunta');
  assert(window.document.body.textContent.includes('Seconda nota, aggiunta in un momento successivo.'), 'lo storico riaperto non mostra la nota appena aggiunta');
  // una nota vuota non deve essere accodata
  click(q(`[data-action="task-aggiungi-nota"][data-id="${taskCreato.id}"]`));
  await wait(20);
  assert(window.getSTATE().taskTeam.find(t => t.id === taskCreato.id).noteStorico.length === 2, 'una nota vuota non deve essere aggiunta allo storico');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Task team: storico note multiple (autore/data, append-only) funziona correttamente OK');

  // ---- Task #114: migrazione di un task salvato col vecchio campo "note" (stringa singola) ----
  const statoConNoteLegacy = {
    taskTeam: [
      { id: 'task_legacy_1', titolo: 'Task salvato prima della migrazione', assegnatoA: 'Sabrina', note: '  Nota scritta prima dello storico.  ', creatoIl: '2026-01-10', stato: 'Da fare' },
      { id: 'task_legacy_2', titolo: 'Task già con noteStorico (non deve essere toccato)', assegnatoA: 'Matteo', noteStorico: [{ id: 'nota_x', testo: 'Nota già migrata.', autore: 'Matteo', data: '2026-02-01' }], creatoIl: '2026-02-01', stato: 'Da fare' },
      { id: 'task_legacy_3', titolo: 'Task senza nessuna nota', assegnatoA: 'Matteo', creatoIl: '2026-03-01', stato: 'Da fare' },
    ],
  };
  const nMigratiNote = window.migraNoteTaskTeam(statoConNoteLegacy);
  assert(nMigratiNote === 1, `attesa 1 migrazione (solo il task col vecchio campo "note" popolato), trovate ${nMigratiNote}`);
  const taskLegacy1 = statoConNoteLegacy.taskTeam.find(t => t.id === 'task_legacy_1');
  assert(taskLegacy1.noteStorico.length === 1 && taskLegacy1.noteStorico[0].testo === 'Nota scritta prima dello storico.', 'la vecchia nota testo non è stata spostata correttamente (e/o non è stata "trim"-ata) in noteStorico');
  assert(taskLegacy1.noteStorico[0].autore === 'Sabrina', 'la nota migrata deve essere attribuita all\'assegnatario del task (unica informazione plausibile disponibile)');
  assert(taskLegacy1.noteStorico[0].data === '2026-01-10', 'la data della nota migrata deve essere quella di creazione del task, non oggi');
  assert(taskLegacy1.note === undefined, 'il vecchio campo "note" deve sparire dopo la migrazione, non restare come doppione');
  const taskLegacy2 = statoConNoteLegacy.taskTeam.find(t => t.id === 'task_legacy_2');
  assert(taskLegacy2.noteStorico.length === 1 && taskLegacy2.noteStorico[0].id === 'nota_x', 'un task già con noteStorico non deve essere toccato/duplicato dalla migrazione');
  const taskLegacy3 = statoConNoteLegacy.taskTeam.find(t => t.id === 'task_legacy_3');
  assert(Array.isArray(taskLegacy3.noteStorico) && taskLegacy3.noteStorico.length === 0, 'un task senza alcuna nota deve comunque ricevere un array noteStorico vuoto, non restare undefined');
  console.log('=== Task team: migrazione del vecchio campo "note" in noteStorico OK (idempotente, attribuisce autore/data plausibili)');

  // cambio stato rapido dalla board (senza passare dal modal)
  const selStatoTask = q(`[data-action="task-cambia-stato"][data-id="${taskCreato.id}"]`);
  assert(selStatoTask, 'select cambio stato rapido non trovato sulla card del task');
  setVal(selStatoTask, 'In corso');
  await wait(20);
  assert(window.getSTATE().taskTeam.find(t=>t.id===taskCreato.id).stato === 'In corso', 'cambio stato rapido task non salvato');

  // filtro per assegnatario
  setVal(q('[data-action="task-filtro-assegnato"]'), assegnatario);
  await wait(20);
  assert(window.document.body.textContent.includes('Task di prova assegnato da un collega'), 'filtro per assegnatario nasconde un task che dovrebbe essere visibile');
  setVal(q('[data-action="task-filtro-assegnato"]'), 'Tutti');
  await wait(20);

  click(q(`[data-action="elimina-task-team"][data-id="${taskCreato.id}"]`));
  await wait(20);
  assert(window.getSTATE().taskTeam.length === nTaskPrima, 'task di test non eliminato');
  console.log('=== Task team: creazione, assegnazione, cambio stato rapido, filtro ed eliminazione OK');

  // ---------- 8h) Bilanci & KPI: calcolo puro, parsing CSV, import, grafici, portale ----------
  const almostEq = (a, b, tol) => Math.abs(a - b) < (tol || 0.001);

  // calcolo KPI con numeri tondi verificabili a mano
  const derivatiTest = window.calcolaDerivatiBilancio({
    patrimonioNetto: 1000, debitiLungo: 200, debitiBreve: 300, altrePassivita: 0,
    immobImmateriali: 100, immobMateriali: 400, immobFinanziarie: 0,
    rimanenze: 100, creditiClienti: 200, liquidita: 200, altreAttivita: 0,
    ricavi: 2000, costiEsterni: 1000, costoPersonale: 500, ammortamenti: 100, oneriFinanziari: 50, imposte: 70,
  });
  assert(derivatiTest.totAttivo === 1000, `totAttivo atteso 1000, trovato ${derivatiTest.totAttivo}`);
  assert(derivatiTest.ebitda === 500, `EBITDA atteso 500, trovato ${derivatiTest.ebitda}`);
  assert(derivatiTest.ebit === 400, `EBIT atteso 400, trovato ${derivatiTest.ebit}`);
  assert(derivatiTest.utileNetto === 280, `Utile netto atteso 280, trovato ${derivatiTest.utileNetto}`);
  assert(almostEq(derivatiTest.roe, 0.28), `ROE atteso 0.28, trovato ${derivatiTest.roe}`);
  assert(almostEq(derivatiTest.roi, 0.40), `ROI atteso 0.40, trovato ${derivatiTest.roi}`);
  assert(almostEq(derivatiTest.ebitdaMargin, 0.25), `EBITDA margin atteso 0.25, trovato ${derivatiTest.ebitdaMargin}`);
  assert(almostEq(derivatiTest.currentRatio, 500/300), `current ratio atteso ${500/300}, trovato ${derivatiTest.currentRatio}`);
  const derivatiVuoto = window.calcolaDerivatiBilancio({}); // nessuna divisione per zero deve esplodere
  assert(derivatiVuoto.roe === null && derivatiVuoto.roi === null, 'con dati vuoti i KPI calcolati devono essere null, non NaN/Infinity');
  console.log('=== Calcolo KPI bilancio: valori corretti su dati noti, nessuna divisione per zero esplosa');

  // parsing righe (formato comune a import CSV ed Excel)
  const parseTest = window.parseRigheBilancio([
    ['Voce', '2024', '2025'],
    ['Ricavi delle vendite', '1000', '2000'],
    ['Costo del personale', '300', '500'],
    ['Rimanenze', '1.234,56', ''],
    ['Voce sconosciuta che non esiste nel template', '999', '999'],
  ]);
  assert(JSON.stringify(parseTest.anni) === JSON.stringify(['2024','2025']), `periodi riconosciuti attesi ["2024","2025"], trovati ${JSON.stringify(parseTest.anni)}`);
  assert(parseTest.datiPerAnno[2024].ricavi === 1000, 'valore ricavi 2024 non estratto correttamente');
  assert(parseTest.datiPerAnno[2025].ricavi === 2000, 'valore ricavi 2025 non estratto correttamente');
  assert(almostEq(parseTest.datiPerAnno[2024].rimanenze, 1234.56), `numero in formato italiano (1.234,56) non interpretato correttamente, trovato ${parseTest.datiPerAnno[2024].rimanenze}`);
  assert(parseTest.datiPerAnno[2025].rimanenze === undefined, 'una cella vuota non deve diventare 0');
  assert(parseTest.vociNonRiconosciute.includes('Voce sconosciuta che non esiste nel template'), 'una riga con etichetta non nel template deve finire tra le non riconosciute, non sparire silenziosamente');
  console.log('=== Parsing righe bilancio: anni, valori, formato numerico italiano e righe non riconosciute OK');

  // parsing CSV vero e proprio (con separatore ; e campo tra virgolette)
  const righeCsv = window.parseCSV('Voce;2024;2025\r\n"Ricavi delle vendite";1000;2000\r\n');
  assert(righeCsv.length === 2 && righeCsv[0][0] === 'Voce' && righeCsv[1][0] === 'Ricavi delle vendite' && righeCsv[1][2] === '2000', `parsing CSV con separatore ";" non corretto: ${JSON.stringify(righeCsv)}`);
  console.log('=== Parsing CSV (separatore ";", campi tra virgolette) OK');

  // ---------- 8h-bis) Bilanci infra-annuali: parsing periodo, etichette, ordinamento cronologico ----------
  assert(window.parsePeriodoHeaderBilancio('2026') === '2026', 'anno intero a 4 cifre non riconosciuto come periodo');
  assert(window.parsePeriodoHeaderBilancio('2026-06') === '2026-06', 'periodo ISO anno-mese non riconosciuto');
  assert(window.parsePeriodoHeaderBilancio('06/2026') === '2026-06', 'formato MM/YYYY non normalizzato correttamente');
  assert(window.parsePeriodoHeaderBilancio('30/06/2026') === '2026-06', 'formato DD/MM/YYYY non normalizzato correttamente (deve prendere mese/anno)');
  assert(window.parsePeriodoHeaderBilancio('non un periodo') === null, 'una intestazione non riconoscibile non deve diventare un periodo a caso');
  assert(window.parsePeriodoHeaderBilancio('1800') === null, 'un anno fuori range plausibile non deve essere accettato');
  assert(window.dataFinePeriodoBilancio('2026') === '2026-12-31', 'data di fine periodo per un anno intero deve essere il 31/12');
  assert(window.dataFinePeriodoBilancio('2026-06') === '2026-06-30', 'data di fine periodo per giugno deve essere il 30 (mese di 30 giorni)');
  assert(window.dataFinePeriodoBilancio('2026-02') === '2026-02-28', 'data di fine periodo per febbraio (non bisestile) deve essere il 28');
  assert(window.periodoBilancioInfraAnnuale('2026') === false, 'un anno intero non deve risultare infra-annuale');
  assert(window.periodoBilancioInfraAnnuale('2026-06') === true, 'un periodo YYYY-MM deve risultare infra-annuale');
  assert(window.etichettaBreveBilancio('2026') === '2026', 'etichetta breve di un anno intero deve essere l\'anno stesso');
  assert(window.etichettaBreveBilancio('2026-06') === '30/06/26', `etichetta breve infra-annuale attesa "30/06/26", trovata "${window.etichettaBreveBilancio('2026-06')}"`);
  assert(window.etichettaEstesaBilancio('2026').includes('anno intero'), 'etichetta estesa di un anno intero deve specificarlo');
  assert(window.etichettaEstesaBilancio('2026-06').includes('infra-annuale') && window.etichettaEstesaBilancio('2026-06').includes('30/06/2026'), 'etichetta estesa infra-annuale deve indicare la data di riferimento');
  console.log('=== Bilanci infra-annuali: riconoscimento periodo (anno, ISO, MM/YYYY, DD/MM/YYYY), data di fine ed etichette OK');

  // vista Bilanci & KPI: il cliente demo con 3 anni interi + 1 situazione infra-annuale più recente
  click(q('[data-nav="bilanci"]'));
  await wait(20);
  const clienteConBilanci = window.getSTATE().clienti[0]; // Rossi Impianti
  setVal(q('[data-action="bilancio-seleziona-cliente"]'), clienteConBilanci.id);
  await wait(20);
  const periodiBilCliente = window.anniBilancioCliente(clienteConBilanci.id);
  assert(periodiBilCliente.length === 4, `atteso il cliente demo con 4 periodi di bilancio caricati (3 anni interi + 1 infra-annuale), trovati ${periodiBilCliente.length}`);
  // il periodo infra-annuale (più recente in ordine cronologico) deve comparire per ultimo, non ordinato come stringa
  assert(window.periodoBilancioInfraAnnuale(periodiBilCliente[periodiBilCliente.length-1]), 'il periodo infra-annuale più recente deve risultare l\'ultimo in ordine cronologico');
  // Redesign Bilanci&KPI (Matteo, ott. 2026: "dividiamo il tab in più sezioni per appartenenza,
  // liquidità/redditività/ecc... vibe futuristica... l'imprenditore deve capire a colpo d'occhio"):
  // 4 sezioni tematiche (Liquidità/Redditività/Solidità/Efficienza), ciascuna con la propria
  // .kpi-grid di card dettaglio - il totale delle card resta pari al numero di indici nel catalogo,
  // la sola distribuzione tra le 4 sezioni cambia in base a CATALOGO_INDICI_BILANCIO.
  const categorieIndiciBilancio = Array.from(new Set(window.CATALOGO_INDICI_BILANCIO.map(i => i.categoria)));
  assert(categorieIndiciBilancio.length === 4, `attese 4 categorie di indici (Liquidità/Redditività/Solidità/Efficienza), trovate ${categorieIndiciBilancio.length}: ${categorieIndiciBilancio.join(', ')}`);
  assert(qa('.kpi-grid').length === 4, `attesa una .kpi-grid per ciascuna delle 4 sezioni, trovate ${qa('.kpi-grid').length}`);
  assert(qa('.kpi-grid .kpi').length === window.CATALOGO_INDICI_BILANCIO.length, `attese ${window.CATALOGO_INDICI_BILANCIO.length} card KPI nella vista Bilanci (una per indice del catalogo)`);
  // Cruscotto di sintesi in cima: punteggio 0-100 "a testo-gradiente" + radar a 4 assi + badge di
  // trend vs anno precedente - la sintesi visiva che l'imprenditore deve cogliere a colpo d'occhio.
  assert(q('.bilanci-dash .cruscotto'), 'manca il cruscotto di sintesi in cima alla vista Bilanci');
  assert(q('.bilanci-dash .cruscotto .punteggio-num'), 'manca il punteggio di sintesi 0-100 nel cruscotto');
  assert(/^(\d+|n\/d)$/.test(q('.bilanci-dash .cruscotto .punteggio-num').textContent.trim()), 'il punteggio di sintesi dovrebbe essere un numero intero (o "n/d"), non un valore grezzo non arrotondato');
  // 4 sezioni tematiche, ciascuna con titolo e icona riconoscibili
  const titoliSezione = qa('.sezione-titolo').map(el => el.textContent);
  assert(['Liquidità','Redditività','Solidità','Efficienza'].every(t => titoliSezione.includes(t)), `mancano una o più sezioni tematiche attese, trovate: ${titoliSezione.join(', ')}`);
  // molti più grafici SVG di prima (gauge per ogni mini-gauge, donut, area, barre, radar, waterfall)
  assert(qa('svg').length >= 20, `attesi almeno 20 grafici SVG nella nuova vista Bilanci (gauge/donut/area/barre/radar/waterfall), trovati ${qa('svg').length}`);
  // la cascata (waterfall) del conto economico nella sezione Redditività, dai ricavi all'utile netto
  const sezioneRedditivitaCard = qa('.sezione-bilancio').find(c => (c.querySelector('.sezione-titolo')||{}).textContent === 'Redditività');
  assert(sezioneRedditivitaCard, 'sezione Redditività non trovata nel DOM');
  assert(sezioneRedditivitaCard.textContent.includes('Costo del personale') && sezioneRedditivitaCard.textContent.includes('Utile netto'), 'la cascata (waterfall) del conto economico nella sezione Redditività non mostra le voci attese');
  // il mini-gauge del ROE (dentro Redditività) deve mostrare una percentuale, non un euro
  assert(/%/.test(sezioneRedditivitaCard.querySelector('.mini-gauge-riga').textContent), 'il mini-gauge del ROE nella sezione Redditività dovrebbe mostrare una percentuale ("%")');
  assert(qa('table.compact tbody tr').length === 4, 'attesa una riga di tabella per ciascuno dei 4 periodi caricati');
  assert(q('#content').textContent.includes('infra-annuale'), 'la tabella bilanci non mostra l\'etichetta "infra-annuale" per il periodo più recente');

  // import diretto (bypassa FileReader/XLSX, che richiedono un vero file binario — qui testiamo
  // la logica di importazione, non la lettura del file, già coperta dai test sopra)
  const clientePerImportBilancio = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && window.anniBilancioCliente(c.id).length === 0);
  assert(clientePerImportBilancio, 'nessun cliente demo senza bilanci trovato per testare l\'import');
  window.elaboraImportBilancio(clientePerImportBilancio.id, [
    ['Voce', '2026', '30/06/2027'],
    ['Ricavi delle vendite', '500000', '280000'],
    ['Patrimonio netto', '150000', '160000'],
  ]);
  await wait(20);
  assert(window.anniBilancioCliente(clientePerImportBilancio.id).length === 2, 'import diretto (anno intero + infra-annuale nella stessa intestazione) non ha salvato entrambi i periodi');
  assert(window.getSTATE().bilanci[clientePerImportBilancio.id]['2026'].ricavi === 500000, 'valore importato (anno intero) non salvato correttamente in STATE');
  assert(window.getSTATE().bilanci[clientePerImportBilancio.id]['2027-06'].ricavi === 280000, 'valore importato (infra-annuale, intestazione "30/06/2027") non salvato correttamente in STATE');
  console.log('=== Import bilancio (dati grezzi, senza file reale): anno intero + infra-annuale nella stessa intestazione OK');

  // eliminazione periodo infra-annuale: verifica che la chiave stringa "YYYY-MM" non venga
  // convertita in un numero (NaN) andando a colpire la voce sbagliata (bug corretto in questo giro)
  setVal(q('[data-action="bilancio-seleziona-cliente"]'), clientePerImportBilancio.id);
  await wait(20);
  click(q(`[data-action="elimina-bilancio-anno"][data-cliente="${clientePerImportBilancio.id}"][data-anno="2027-06"]`));
  await wait(20);
  assert(window.anniBilancioCliente(clientePerImportBilancio.id).length === 1, 'eliminazione del periodo infra-annuale non riuscita (o ha cancellato la voce sbagliata)');
  assert(window.getSTATE().bilanci[clientePerImportBilancio.id]['2026'], 'l\'eliminazione del periodo infra-annuale non deve intaccare il periodo anno intero rimasto');
  click(q(`[data-action="elimina-bilancio-anno"][data-cliente="${clientePerImportBilancio.id}"][data-anno="2026"]`));
  await wait(20);
  assert(window.anniBilancioCliente(clientePerImportBilancio.id).length === 0, 'eliminazione anno intero non riuscita');
  console.log('=== Vista Bilanci & KPI: selezione cliente, KPI, grafici, tabella ed eliminazione periodo (anno intero e infra-annuale) OK');

  // portale cliente: schermata "Andamento" (task #111: solo più nell'anteprima desktop a schermo
  // intero, il tab "bilancio" del mockup a telefono non esiste più)
  click(q('[data-nav="portale"]'));
  await wait(20);
  setVal(q('[data-action="portal-seleziona-cliente"]'), clienteConBilanci.id);
  await wait(20);
  click(q('[data-action="portal-schermo-intero"]'));
  await wait(20);
  click(q('[data-action="portal-desktop-tab"][data-tab="andamento"]'));
  await wait(20);
  assert(q('#portalFullscreenPhone').textContent.includes('infra-annuale'), 'la schermata "Andamento" del portale non mostra l\'etichetta del periodo più recente (infra-annuale) per un cliente con bilanci caricati');
  const clienteSenzaBilanci = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && window.anniBilancioCliente(c.id).length === 0);
  setVal(q('[data-action="portal-seleziona-cliente"]'), clienteSenzaBilanci.id);
  await wait(20);
  assert(q('#portalFullscreenPhone').textContent.includes('Non appena carichiamo i dati del bilancio'), 'la schermata "Andamento" non mostra il messaggio corretto per un cliente senza bilanci');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  console.log('=== Portale cliente: schermata "Andamento" coerente con presenza/assenza dati OK');

  // Task #178 (Matteo: "sezione Andamento portale cliente troppo povera"): il problema reale non era
  // l'interfaccia (portale-cliente.htm > renderAndamento() era già pronta per patrimonio netto, ROI/
  // ROS/margine EBITDA, liquidità, indebitamento, giorni incasso crediti, variazioni, semafori e
  // ripartizione costi) ma l'oggetto "andamento" dentro costruisciVistaPortaleClienteEsterna - quello
  // DAVVERO spedito al portale esterno reale (il test sopra, sulla "pd-" anteprima desktop, usa
  // un'altra funzione più semplice e non copre questo) - che calcolava solo ricavi/utile/ROE,
  // lasciando il resto sempre undefined. Qui si verifica che il payload reale sia completo.
  if (!window.clienteById(clienteConBilanci.id).portaleToken) window.attivaPortaleCliente(clienteConBilanci.id);
  const tokenBilanci = window.clienteById(clienteConBilanci.id).portaleToken;
  const vistaAndamento = window.costruisciVistaPortaleClienteEsterna(tokenBilanci);
  assert(vistaAndamento && vistaAndamento.andamento, 'la vista del portale esterno per un cliente con bilanci caricati deve includere "andamento"');
  const and = vistaAndamento.andamento;
  ['ricavi','utileNetto','patrimonioNetto','roe','roi','ros','ebitdaMargin','currentRatio','indiceIndebitamento'].forEach(campo => {
    assert(typeof and[campo] === 'number', `andamento.${campo} dovrebbe essere un numero per il cliente demo con bilanci completi, trovato ${JSON.stringify(and[campo])}`);
  });
  assert(typeof and.giorniIncassoCrediti === 'number', 'andamento.giorniIncassoCrediti dovrebbe essere calcolabile (crediti clienti e ricavi sono entrambi nel template)');
  assert(and.giorniPagamentoDebiti === null, 'andamento.giorniPagamentoDebiti deve restare null: il modello dati non distingue i debiti fornitori dal resto dei debiti a breve, mai un numero inventato per riempire un campo');
  ['semaforoRedditivita','semaforoLiquidita','semaforoSolidita'].forEach(campo => {
    assert(['verde','giallo','rosso'].includes(and[campo]), `andamento.${campo} deve essere un colore di semaforo valido, trovato ${JSON.stringify(and[campo])}`);
  });
  assert(typeof and.variazioneRicavi === 'number', 'andamento.variazioneRicavi deve essere calcolabile (il cliente ha più di un periodo di bilancio caricato)');
  assert(Array.isArray(and.seriePatrimonioNetto) && and.seriePatrimonioNetto.length === periodiBilCliente.length, 'andamento.seriePatrimonioNetto deve avere un punto per ogni periodo caricato');
  assert(Array.isArray(and.serieCosti) && and.serieCosti.length === periodiBilCliente.length, 'andamento.serieCosti deve avere un punto per ogni periodo caricato');
  assert(Array.isArray(and.ripartizioneCosti) && and.ripartizioneCosti.length === 5, 'andamento.ripartizioneCosti deve avere le 5 macro-categorie di costo (esterni, personale, ammortamenti, oneri finanziari, imposte)');
  assert(and.ripartizioneCosti.every(r => typeof r.etichetta === 'string' && typeof r.valore === 'number'), 'ogni voce di ripartizioneCosti deve avere {etichetta, valore} - stessa forma attesa da graficoTorta() in portale-cliente.htm');
  console.log('=== #178: payload reale del portale esterno (andamento) ora completo - patrimonio netto, ROI/ROS/margine, liquidità/indebitamento, giorni incasso, variazioni, semafori e ripartizione costi OK');

  // ---------- 8h-ter) Bilanci: riclassifica automatica da stampa grezza (senza riclassifica manuale) ----------

  // classificatore per parole chiave su etichette di una stampa contabile grezza (bilancio di
  // verifica), più dettagliate delle 17 voci semplificate del template
  assert(window.suggerisciVoceBilancioDaTesto('Banca Intesa c/c') === 'liquidita', 'voce grezza "Banca Intesa c/c" non riclassificata come liquidita');
  assert(window.suggerisciVoceBilancioDaTesto('Impianti e macchinari') === 'immobMateriali', 'voce grezza "Impianti e macchinari" non riclassificata come immobMateriali');
  assert(window.suggerisciVoceBilancioDaTesto('Salari e stipendi') === 'costoPersonale', 'voce grezza "Salari e stipendi" non riclassificata come costoPersonale');
  assert(window.suggerisciVoceBilancioDaTesto('Debiti verso fornitori') === 'debitiBreve', 'voce grezza "Debiti verso fornitori" non riclassificata come debitiBreve');
  assert(window.suggerisciVoceBilancioDaTesto('Crediti verso clienti') === 'creditiClienti', 'voce grezza "Crediti verso clienti" non riclassificata come creditiClienti');
  assert(window.suggerisciVoceBilancioDaTesto('Ricavi delle vendite e delle prestazioni') === 'ricavi', 'voce grezza "Ricavi delle vendite e delle prestazioni" non riclassificata come ricavi');
  assert(window.suggerisciVoceBilancioDaTesto('IRES') === 'imposte', 'voce grezza "IRES" non riclassificata come imposte');
  assert(window.suggerisciVoceBilancioDaTesto('Fondo TFR') === 'debitiLungo', 'voce grezza "Fondo TFR" non riclassificata come debitiLungo');
  assert(window.suggerisciVoceBilancioDaTesto('Quote di ammortamento') === 'ammortamenti', 'voce grezza "Quote di ammortamento" non riclassificata come ammortamenti');
  assert(window.suggerisciVoceBilancioDaTesto('Voce totalmente sconosciuta xyz') === null, 'una voce non riconoscibile non deve ricevere una categoria indovinata a caso');
  assert(window.suggerisciVoceBilancioDaTesto('') === null, 'stringa vuota non deve produrre una categoria');
  console.log('=== Riclassifica automatica bilancio: voci grezze -> categoria semplificata per parole chiave OK (nessuna indovinata)');

  // pianificazione import: corrispondenza esatta col template ha priorità sul suggerimento per
  // parole chiave; più righe grezze sulla stessa voce semplificata vengono sommate
  const pianoTest = window.pianificaImportBilancio([
    ['Voce', '2026', '30/06/2027'],
    ['Ricavi delle vendite', '500000', '280000'],       // etichetta esatta del template
    ['Ricavi per vendita merci', '20000', '10000'],      // grezza -> ricavi (per keyword, si somma alla riga sopra)
    ['Banca Intesa c/c', '80000', '90000'],              // grezza -> liquidita
    ['Voce totalmente incomprensibile', '5', '5'],       // non riconosciuta
    ['Riga senza numeri', '', ''],                        // deve essere scartata, nessun valore
  ]);
  assert(JSON.stringify(pianoTest.periodi) === JSON.stringify(['2026','2027-06']), `periodi del piano import attesi ["2026","2027-06"], trovati ${JSON.stringify(pianoTest.periodi)}`);
  assert(pianoTest.righe.length === 4, `attese 4 righe pianificate (esclusa quella senza numeri), trovate ${pianoTest.righe.length}`);
  const rigaEsatta = pianoTest.righe.find(r => r.testoRiga === 'Ricavi delle vendite');
  assert(rigaEsatta.origine === 'esatta' && rigaEsatta.chiave === 'ricavi', 'corrispondenza esatta col template non riconosciuta come tale');
  const rigaSuggerita = pianoTest.righe.find(r => r.testoRiga === 'Ricavi per vendita merci');
  assert(rigaSuggerita.origine === 'suggerita' && rigaSuggerita.chiave === 'ricavi', 'voce grezza non riclassificata correttamente per parole chiave');
  const rigaBanca = pianoTest.righe.find(r => r.testoRiga === 'Banca Intesa c/c');
  assert(rigaBanca.chiave === 'liquidita', 'voce grezza "Banca Intesa c/c" non pianificata come liquidita');
  const rigaIgnota = pianoTest.righe.find(r => r.testoRiga === 'Voce totalmente incomprensibile');
  assert(rigaIgnota.origine === 'nessuna' && rigaIgnota.chiave === '', 'una voce non riconoscibile non deve avere una chiave suggerita');
  console.log('=== Pianificazione import bilancio: corrispondenza esatta prioritaria sul suggerimento, righe senza valori scartate OK');

  // modal di riclassifica: apre, mostra le righe con la select pre-compilata, e salva solo dopo
  // conferma esplicita — mai un numero scritto in STATE senza che Matteo lo veda prima
  const clientePerRiclassifica = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && window.anniBilancioCliente(c.id).length === 0);
  assert(clientePerRiclassifica, 'nessun cliente demo senza bilanci trovato per testare la riclassifica');
  click(q('[data-nav="bilanci"]'));
  await wait(20);
  setVal(q('[data-action="bilancio-seleziona-cliente"]'), clientePerRiclassifica.id);
  await wait(20);
  window.apriModalRiclassificaBilancio(clientePerRiclassifica.id, [
    ['Voce', '2028'],
    ['Ricavi delle vendite', '400000'],
    ['Banca Sella c/c', '60000'],
    ['Voce non riconoscibile qualunque', '10'],
  ]);
  await wait(20);
  assert(qa('[data-ribil-voce]').length === 3, `attese 3 select di riclassifica nel modal, trovate ${qa('[data-ribil-voce]').length}`);
  assert(q('[data-ribil-voce][data-idx="0"]').value === 'ricavi', 'select pre-compilata non corrisponde al suggerimento per la riga "Ricavi delle vendite"');
  assert(q('[data-ribil-voce][data-idx="1"]').value === 'liquidita', 'select pre-compilata non corrisponde al suggerimento per la riga "Banca Sella c/c"');
  assert(q('[data-ribil-voce][data-idx="2"]').value === '', 'una riga non riconosciuta deve restare su "Non importare" finché non è Matteo a scegliere');
  // Matteo corregge manualmente la voce non riconosciuta prima di confermare
  setVal(q('[data-ribil-voce][data-idx="2"]'), 'altreAttivita');
  await wait(20);
  click(q('[data-action="salva-import-bilancio"]'));
  await wait(20);
  assert(window.anniBilancioCliente(clientePerRiclassifica.id).length === 1, 'periodo non salvato dopo conferma della riclassifica');
  assert(window.getSTATE().bilanci[clientePerRiclassifica.id]['2028'].ricavi === 400000, 'valore ricavi non salvato correttamente dopo riclassifica confermata');
  assert(window.getSTATE().bilanci[clientePerRiclassifica.id]['2028'].liquidita === 60000, 'valore liquidita non salvato correttamente dopo riclassifica confermata');
  assert(window.getSTATE().bilanci[clientePerRiclassifica.id]['2028'].altreAttivita === 10, 'correzione manuale della voce non riconosciuta non salvata');
  assert(!q('#modalRoot').children.length, 'il modal di riclassifica non si è chiuso dopo il salvataggio');
  // pulizia
  window.eliminaBilancioAnno(clientePerRiclassifica.id, '2028');
  console.log('=== Modal riclassifica bilancio: apertura, pre-compilazione, correzione manuale e salvataggio solo dopo conferma OK');

  // riga senza periodi riconoscibili o senza righe utili: nessun modal, avviso invece di un errore muto
  window.apriModalRiclassificaBilancio(clientePerRiclassifica.id, [['Voce', 'non un periodo'], ['Qualcosa', '10']]);
  await wait(20);
  assert(!q('#modalRoot').children.length, 'senza periodi riconoscibili non deve aprirsi alcun modal di riclassifica');
  console.log('=== Import senza periodi riconoscibili: nessun modal aperto, nessun errore muto OK');

  // ---------- 8i) Contabilità / Prima nota: classificazione conti, mapping colonne, import, wizard ----------

  // Task #176: la sezione è sospesa di default (menu nascosto) - qui testiamo la logica e la vista
  // vera e propria, quindi la riattiviamo per tutta la durata di 8i/8j/8k (il comportamento da
  // sospesa, quello "di serie" su un'installazione nuova, è testato esplicitamente più sotto in 8k
  // e la sezione torna disattivata al termine di quel blocco).
  window.getSTATE().meta.contabilitaAttiva = true;
  window.render();

  // classificazione automatica per parole chiave
  assert(window.suggerisciCategoriaConto('Banca Intesa C/C 1234') === 'Banca', 'conto "Banca Intesa C/C" non classificato come Banca');
  assert(window.suggerisciCategoriaConto('Cassa contanti') === 'Cassa', 'conto "Cassa contanti" non classificato come Cassa');
  assert(window.suggerisciCategoriaConto('Carta Visa Business') === 'Carta di credito', 'conto "Carta Visa" non classificato come Carta di credito');
  assert(window.suggerisciCategoriaConto('Stipendi dipendenti') === 'Personale', 'conto "Stipendi dipendenti" non classificato come Personale');
  assert(window.suggerisciCategoriaConto('Fornitore XYZ Srl') === 'Fornitori', 'conto "Fornitore XYZ" non classificato come Fornitori');
  assert(window.suggerisciCategoriaConto('Voce contabile bizzarra 42') === null, 'un conto non riconoscibile non deve ricevere una categoria indovinata a caso');
  assert(window.suggerisciCategoriaConto('') === null, 'stringa vuota non deve produrre una categoria');
  console.log('=== Classificazione automatica conti per parole chiave OK (nessuna categoria indovinata quando non riconoscibile)');

  // classificazione automatica per codice conto (piano dei conti Profis reale, mastro numerico)
  assert(window.suggerisciCategoriaContoDaCodice('31.01.05') === 'Banca', 'codice 31.01.05 (mastro banche/posta) non classificato come Banca');
  assert(window.suggerisciCategoriaContoDaCodice('31.03.01') === 'Cassa', 'codice 31.03.01 (mastro cassa) non classificato come Cassa');
  assert(window.suggerisciCategoriaContoDaCodice('23.03.01') === 'Clienti', 'codice 23.03.01 (mastro crediti commerciali) non classificato come Clienti');
  assert(window.suggerisciCategoriaContoDaCodice('57.03.01') === 'Fornitori', 'codice 57.03.01 (mastro debiti commerciali) non classificato come Fornitori');
  assert(window.suggerisciCategoriaContoDaCodice('59.01.09') === 'Erario', 'codice 59.01.09 (mastro conti erariali) non classificato come Erario');
  assert(window.suggerisciCategoriaContoDaCodice('61.01.01') === 'Personale', 'codice 61.01.01 (mastro enti previdenziali) non classificato come Personale');
  assert(window.suggerisciCategoriaContoDaCodice('81.01.01') === 'Personale', 'codice 81.01.01 (mastro costi personale dipendente) non classificato come Personale');
  assert(window.suggerisciCategoriaContoDaCodice('63.07.01') === 'Personale', 'codice 63.07.01 (debiti verso il personale) non classificato come Personale');
  assert(window.suggerisciCategoriaContoDaCodice('11.01.01') === null, 'un mastro non mappato (es. immobilizzazioni) non deve ricevere una categoria indovinata');
  assert(window.suggerisciCategoriaContoDaCodice('') === null, 'codice vuoto non deve produrre una categoria');
  assert(window.suggerisciCategoriaContoDaCodice(null) === null, 'codice nullo non deve produrre una categoria');
  console.log('=== Classificazione automatica conti per codice (mastro piano dei conti Profis) OK');

  // combinazione testo+codice: il codice ha priorità sul testo generico, ma il testo ha sempre
  // l'ultima parola per carte di credito/PayPal (sottoconti del mastro Cassa nel PdC reale)
  assert(window.suggerisciCategoriaConto('Banca Sella', '31.01.02') === 'Banca', 'testo+codice concordi (Banca) non classificati correttamente');
  assert(window.suggerisciCategoriaConto('Voce non riconoscibile', '57.03.05') === 'Fornitori', 'con codice mastro Fornitori disponibile, il testo generico non deve bloccare la classificazione');
  assert(window.suggerisciCategoriaConto('Carta di Credito Nexi', '31.03.02') === 'Carta di credito', 'una carta di credito nel mastro Cassa deve restare classificata come Carta di credito (il testo vince sul codice)');
  assert(window.suggerisciCategoriaConto('PAYPAL', '31.03.09') === 'Carta di credito', 'PayPal nel mastro Cassa deve essere classificato come Carta di credito');
  assert(window.suggerisciCategoriaConto('Voce contabile bizzarra 42', '99.01.01') === null, 'testo non riconoscibile + codice fuori mappa non deve produrre una categoria');
  console.log('=== Classificazione combinata testo+codice conto OK (carte/PayPal riconosciute dal testo anche dentro il mastro Cassa)');

  // il campo "codice conto" è ora tra quelli mappabili per i movimenti (facoltativo)
  assert(window.CAMPI_IMPORT.movimenti.some(c => c.chiave === 'codiceConto' && !c.obbligatorio), 'manca il campo facoltativo "codiceConto" tra i campi mappabili per i movimenti');
  const mappingConCodice = window.suggerisciMappingColonne(['Data', 'Codice Conto', 'Conto', 'Importo'], 'movimenti');
  assert(mappingConCodice.codiceConto === 'Codice Conto', `mapping automatico campo codiceConto errato: ${mappingConCodice.codiceConto}`);
  console.log('=== Campo facoltativo "Codice conto" disponibile e mappabile automaticamente OK');

  // firma colonne: stessa intestazione -> stessa firma; ordine diverso -> firma diversa
  const firmaA = window.firmaColonne(['Data', 'Conto', 'Importo']);
  const firmaB = window.firmaColonne(['Data', 'Conto', 'Importo']);
  const firmaC = window.firmaColonne(['Conto', 'Data', 'Importo']);
  assert(firmaA === firmaB, 'stessa intestazione deve produrre la stessa firma');
  assert(firmaA !== firmaC, 'un ordine diverso delle colonne deve produrre una firma diversa (tracciato diverso)');

  // suggerimento mapping colonne per parole chiave, con campo assente lasciato vuoto
  const headerTest = ['Data Operazione', 'Conto Intestato', 'Descrizione', 'Importo Euro'];
  const mappingTest = window.suggerisciMappingColonne(headerTest, 'movimenti');
  assert(mappingTest.data === 'Data Operazione', `mapping automatico campo data errato: ${mappingTest.data}`);
  assert(mappingTest.conto === 'Conto Intestato', `mapping automatico campo conto errato: ${mappingTest.conto}`);
  assert(mappingTest.importo === 'Importo Euro', `mapping automatico campo importo errato: ${mappingTest.importo}`);
  const mappingSenzaDescr = window.suggerisciMappingColonne(['Data', 'Conto', 'Importo'], 'movimenti');
  assert(mappingSenzaDescr.descrizione === null, 'un campo non presente nel file deve restare non mappato (null), mai indovinato');
  console.log('=== Suggerimento automatico mapping colonne OK, campo assente lasciato esplicitamente vuoto');

  // applicazione del mapping alle righe grezze, righe vuote scartate
  const righeApplicate = window.applicaMappingRighe([
    headerTest,
    ['2026-08-01', 'Banca Sella', 'Incasso cliente', '1.500,00'],
    ['', '', '', ''],
    ['2026-08-05', 'Cassa Ufficio', 'Spese varie', '-45,20'],
  ], mappingTest);
  assert(righeApplicate.length === 2, `righe vuote non scartate correttamente: attese 2, trovate ${righeApplicate.length}`);
  assert(righeApplicate[0].conto === 'Banca Sella' && righeApplicate[0].importo === '1.500,00', 'mapping applicato non estrae correttamente i valori');
  console.log('=== Applicazione mapping a righe grezze OK (righe vuote scartate)');

  // classificazione conti nuovi vs già noti: il cliente demo Rossi Impianti ha già "Banca Intesa..." classificato
  const clienteContabDemo = window.getSTATE().clienti[0];
  const contiNuoviTest = window.contiDaClassificare(clienteContabDemo.id, [
    { conto: 'Banca Intesa C/C 1234', importo: '100' }, // già classificato nel demo
    { conto: 'Carta Amex Nuova', importo: '-50' },       // mai vista prima
  ]);
  assert(contiNuoviTest.length === 1 && contiNuoviTest[0].conto === 'Carta Amex Nuova', `atteso solo 1 conto nuovo da classificare, trovati ${contiNuoviTest.length}`);
  assert(contiNuoviTest[0].categoria === 'Carta di credito', 'suggerimento categoria per conto nuovo non applicato');
  console.log('=== Conti già classificati non richiesti di nuovo, solo i conti mai visti prima OK');

  // contiDaClassificare usa anche il codice conto quando presente nella riga mappata
  const contiNuoviConCodice = window.contiDaClassificare(clienteContabDemo.id, [
    { conto: 'Debiti v/INPS c/contributi', codiceConto: '61.01.03', importo: '-500' },
    { conto: 'Erario c/IVA', codiceConto: '59.01.01', importo: '-800' },
  ]);
  assert(contiNuoviConCodice.length === 2, `attesi 2 conti nuovi da classificare con codice, trovati ${contiNuoviConCodice.length}`);
  const suggINPS = contiNuoviConCodice.find(c => c.conto === 'Debiti v/INPS c/contributi');
  const suggErario = contiNuoviConCodice.find(c => c.conto === 'Erario c/IVA');
  assert(suggINPS && suggINPS.categoria === 'Personale', 'conto INPS con codice mastro 61 non suggerito come Personale');
  assert(suggErario && suggErario.categoria === 'Erario', 'conto Erario c/IVA con codice mastro 59 non suggerito come Erario');
  console.log('=== contiDaClassificare sfrutta il codice conto (mastro Profis) quando presente nella riga mappata OK');

  // import movimenti: dedup su reimport identico, righe senza dato obbligatorio scartate esplicitamente
  const clienteImportTest = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && !(window.getSTATE().movimentiContabili && window.getSTATE().movimentiContabili[c.id] && window.getSTATE().movimentiContabili[c.id].length));
  assert(clienteImportTest, 'nessun cliente demo senza movimenti trovato per testare import/dedup');
  const righeMovTest = [
    { data: '2026-07-01', conto: 'Banca Sella', descrizione: 'Incasso test', importo: '1500' },
    { data: '2026-07-03', conto: 'Cassa Ufficio', descrizione: 'Spesa test', importo: '-45' },
    { data: '', conto: 'Banca Sella', descrizione: 'riga senza data', importo: '10' }, // deve essere scartata, non indovinata
  ];
  const esito1 = window.elaboraImportMovimenti(clienteImportTest.id, righeMovTest, { 'banca sella': 'Banca', 'cassa ufficio': 'Cassa' });
  assert(esito1.aggiunti === 2, `primo import: attesi 2 movimenti aggiunti, trovati ${esito1.aggiunti}`);
  assert(esito1.senzaData === 1, `primo import: attesa 1 riga scartata per dato mancante, trovate ${esito1.senzaData}`);
  const esito2 = window.elaboraImportMovimenti(clienteImportTest.id, righeMovTest, {});
  assert(esito2.aggiunti === 0 && esito2.saltati === 2, `reimport identico: atteso dedup completo (0 aggiunti, 2 saltati), trovato aggiunti=${esito2.aggiunti} saltati=${esito2.saltati}`);
  assert(window.getSTATE().movimentiContabili[clienteImportTest.id].length === 2, 'numero movimenti salvati non corretto dopo dedup');
  assert(window.getSTATE().contoMappings[clienteImportTest.id]['banca sella'] === 'Banca', 'classificazione conto non memorizzata (learn-once) dopo import');
  console.log('=== Import movimenti: dedup su reimport identico OK, righe senza data scartate esplicitamente (mai indovinate), classificazione memorizzata');

  // import fatture attive/passive: stesso meccanismo di dedup
  const esitoFatt1 = window.elaboraImportFatture(clienteImportTest.id, 'fattureAttive', [
    { numero: '10', controparte: 'Cliente Test Srl', dataEmissione: '2026-07-10', imponibile: '1000', iva: '220', totale: '1220' },
  ]);
  assert(esitoFatt1.aggiunti === 1, 'import fattura attiva non riuscito');
  const esitoFatt2 = window.elaboraImportFatture(clienteImportTest.id, 'fattureAttive', [
    { numero: '10', controparte: 'Cliente Test Srl', dataEmissione: '2026-07-10', imponibile: '1000', iva: '220', totale: '1220' },
  ]);
  assert(esitoFatt2.aggiunti === 0 && esitoFatt2.saltati === 1, 'reimport fattura identica non deduplicato correttamente');
  console.log('=== Import fatture: dedup su reimport identico OK');

  // "aggiornato al": calcolato SEMPRE dalla data più recente importata, mai inserito a mano
  const statoAggDemo = window.statoAggiornamentoContabile(clienteContabDemo.id);
  const etichetteAgg = statoAggDemo.map(s => s.etichetta).sort();
  assert(JSON.stringify(etichetteAgg) === JSON.stringify(['Banca', 'Cassa', 'Fatture attive', 'Fatture passive', 'Personale']), `categorie con dati attesi diverse da quelle trovate: ${JSON.stringify(etichetteAgg)}`);
  const rigaBancaAgg = statoAggDemo.find(s => s.etichetta === 'Banca');
  assert(rigaBancaAgg.giorniFa === 6, `giorni dall'ultimo movimento Banca attesi 6, trovati ${rigaBancaAgg.giorniFa}`);
  const rigaFattAttiveAgg = statoAggDemo.find(s => s.etichetta === 'Fatture attive');
  assert(rigaFattAttiveAgg.giorniFa === 3, `giorni dall'ultima fattura attiva attesi 3 (la più recente delle due demo), trovati ${rigaFattAttiveAgg.giorniFa}`);
  console.log('=== "Aggiornato al" calcolato sempre dal dato più recente importato, per categoria OK');

  // vista Contabilità: cliente demo con dati mostra le card di aggiornamento e le tabelle
  click(q('[data-nav="contabilita"]'));
  await wait(20);
  setVal(q('[data-action="contabilita-seleziona-cliente"]'), clienteContabDemo.id);
  await wait(20);
  assert(qa('details .kpi-grid .kpi').length === 5, `attese 5 card di aggiornamento nell'import avanzato (una per categoria con dati), trovate ${qa('details .kpi-grid .kpi').length}`);
  assert(qa('#contabDocStato .kpi-grid .kpi').length === 2, `attese 2 card di stato desunte dai documenti (registro IVA, prima nota), trovate ${qa('#contabDocStato .kpi-grid .kpi').length}`);
  assert(qa('table.compact tbody tr').length >= 5, 'tabelle documenti/movimenti/fatture non mostrano abbastanza righe per il cliente demo');
  console.log('=== Vista Contabilità: card di stato desunte dai documenti + import avanzato con dati OK');

  // vista Contabilità: cliente senza dati mostra il messaggio di invito a registrare un documento
  const clienteContabVuoto = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && c.id !== clienteContabDemo.id && c.id !== clienteImportTest.id);
  setVal(q('[data-action="contabilita-seleziona-cliente"]'), clienteContabVuoto.id);
  await wait(20);
  assert(q('#content').innerHTML.includes('Nessun documento ancora registrato'), 'messaggio di invito a registrare un documento non mostrato per cliente senza dati contabili');
  console.log('=== Vista Contabilità: messaggio corretto per cliente senza dati OK');

  // ---------- 8i-bis) Stato contabilità desunto da documenti periodici (registro IVA, bilancio, ecc.) ----------
  assert(window.TIPI_DOCUMENTO_CONTABILE.length === 3, 'attesi 3 tipi di documento contabile registrabili (registro IVA unico, bilancio, mastrino conti)');
  assert(window.statoAggiornamentoDocumenti(clienteContabVuoto.id).length === 0, 'cliente senza documenti registrati deve avere stato vuoto');
  assert(window.verificaCoerenzaContabile(clienteContabVuoto.id).length === 0, 'senza bilancio caricato non ci deve essere alcun avviso di coerenza');

  window.registraDocumentoContabile(clienteContabVuoto.id, 'registroIva', '2026-07-31', 'Da Profis');
  window.registraDocumentoContabile(clienteContabVuoto.id, 'bilancio', '2026-06-30', 'Bilancio 4 sezioni');
  let statoDocVuoto = window.statoAggiornamentoDocumenti(clienteContabVuoto.id);
  assert(statoDocVuoto.length === 2, `attese 2 categorie di stato dopo 2 documenti di tipo diverso, trovate ${statoDocVuoto.length}`);
  const rigaRegistroIvaDoc = statoDocVuoto.find(s => s.etichetta === 'Registro IVA');
  assert(rigaRegistroIvaDoc && rigaRegistroIvaDoc.data === '2026-07-31', 'data "aggiornato al" per registro IVA non presa dal documento registrato');
  const rigaPrimaNotaDoc = statoDocVuoto.find(s => s.etichetta === 'Prima nota');
  assert(rigaPrimaNotaDoc && rigaPrimaNotaDoc.data === '2026-06-30', 'data "aggiornato al" per prima nota non presa dal bilancio registrato');

  // un secondo registro IVA più recente deve sostituire il precedente come riferimento
  window.registraDocumentoContabile(clienteContabVuoto.id, 'registroIva', '2026-08-10', '');
  statoDocVuoto = window.statoAggiornamentoDocumenti(clienteContabVuoto.id);
  assert(statoDocVuoto.find(s => s.etichetta === 'Registro IVA').data === '2026-08-10', 'il documento più recente per tipo non ha aggiornato correttamente lo stato "Registro IVA"');
  console.log('=== Stato desunto da documenti periodici: aggregazione per tipo, sempre il più recente OK');

  // ---------- 8i-bis-2) Registro conti per cliente: crea conto, mastrino per conto, coerenza per singolo conto ----------
  assert(window.contiCliente(clienteContabVuoto.id).length === 0, 'cliente nuovo non deve avere conti registrati');
  const contoBancaTest = window.creaContoCliente(clienteContabVuoto.id, 'Intesa c/c Test');
  assert(contoBancaTest && contoBancaTest.nome === 'Intesa c/c Test', 'creazione conto non riuscita');
  const contoBancaTestBis = window.creaContoCliente(clienteContabVuoto.id, 'intesa c/c test');
  assert(contoBancaTestBis.id === contoBancaTest.id, 'creare un conto con nome già esistente (case-insensitive) deve restituire quello esistente, non duplicarlo');
  assert(window.contiCliente(clienteContabVuoto.id).length === 1, 'il conto duplicato per nome non deve essere stato aggiunto');
  const contoPagheTest = window.creaContoCliente(clienteContabVuoto.id, 'Conto ponte retribuzioni Test');

  assert(window.verificaCoerenzaContabile(clienteContabVuoto.id).length === 0, 'senza mastrini non ci deve essere alcun avviso');
  window.registraDocumentoContabile(clienteContabVuoto.id, 'mastrino', '2026-06-30', '', contoBancaTest.id);
  const avvisiOk = window.verificaCoerenzaContabile(clienteContabVuoto.id);
  assert(avvisiOk.length === 0, 'mastrino antecedente/coincidente col bilancio non deve generare avvisi');
  window.registraDocumentoContabile(clienteContabVuoto.id, 'mastrino', '2026-07-15', '', contoPagheTest.id);
  const avvisiKo = window.verificaCoerenzaContabile(clienteContabVuoto.id);
  assert(avvisiKo.length === 1 && avvisiKo[0].includes('Conto ponte retribuzioni Test'), `atteso un avviso di incoerenza sul conto ponte retribuzioni, trovato: ${JSON.stringify(avvisiKo)}`);
  const statoContiTest = window.statoContiCliente(clienteContabVuoto.id);
  assert(statoContiTest.length === 2, `attesi 2 conti con mastrino registrato, trovati ${statoContiTest.length}`);
  console.log('=== Registro conti per cliente: crea-nuovo-o-riusa, coerenza per singolo conto OK');

  // flusso UI: registrazione ed eliminazione di un documento contabile dal modal (registro IVA, senza conto)
  click(q('[data-action="apri-documento-contabile"]'));
  await wait(20);
  assert(q('#formDocContab'), 'modal "registra documento contabile" non aperto');
  assertNoAutoSubmit(q('#formDocContab'), 'formDocContab');
  setVal(q('#dcTipo'), 'registroIva');
  setVal(q('#dcData'), '2026-08-20');
  setVal(q('#dcNote'), 'Prova UI');
  click(q('[data-action="salva-documento-contabile"]'));
  await wait(20);
  assert(q('.modal-backdrop') === null, 'il modal non si è chiuso dopo il salvataggio');
  const docsDopoSalvataggio = window.getSTATE().documentiContabili[clienteContabVuoto.id];
  const nuovoDoc = docsDopoSalvataggio.find(d => d.note === 'Prova UI');
  assert(nuovoDoc && nuovoDoc.dataRiferimento === '2026-08-20', 'documento registrato dal modal non salvato correttamente in STATE');
  click(q(`[data-action="elimina-documento-contabile"][data-id="${nuovoDoc.id}"]`));
  await wait(20);
  assert(!window.getSTATE().documentiContabili[clienteContabVuoto.id].find(d => d.id === nuovoDoc.id), 'documento non eliminato correttamente dal pulsante Elimina');
  console.log('=== Flusso UI registrazione/eliminazione documento contabile OK');

  // flusso UI: scegliendo tipo "mastrino" compare il selettore Conto con "+ Nuovo conto...", creazione inline
  click(q('[data-action="apri-documento-contabile"]'));
  await wait(20);
  setVal(q('#dcTipo'), 'mastrino');
  await wait(20);
  assert(q('#dcConto'), 'selettore Conto non mostrato dopo aver scelto tipo mastrino');
  const optNuovo = qa('#dcConto option').find(o => o.value === '__nuovo__');
  assert(optNuovo, 'opzione "+ Nuovo conto..." mancante nel selettore Conto');
  setVal(q('#dcConto'), '__nuovo__');
  assert(q('#dcContoNuovo'), 'campo nome nuovo conto non presente');
  setVal(q('#dcContoNuovo'), 'Cassa contanti UI Test');
  setVal(q('#dcData'), '2026-08-22');
  click(q('[data-action="salva-documento-contabile"]'));
  await wait(20);
  assert(q('.modal-backdrop') === null, 'il modal non si è chiuso dopo il salvataggio del mastrino con nuovo conto');
  const contoCreatoUI = window.contiCliente(clienteContabVuoto.id).find(c => c.nome === 'Cassa contanti UI Test');
  assert(contoCreatoUI, 'il nuovo conto creato dal modal non è stato salvato in STATE.contiCliente');
  const docMastrinoUI = window.getSTATE().documentiContabili[clienteContabVuoto.id].find(d => d.tipo === 'mastrino' && d.contoId === contoCreatoUI.id);
  assert(docMastrinoUI && docMastrinoUI.dataRiferimento === '2026-08-22', 'documento mastrino con conto creato al volo non salvato correttamente');
  console.log('=== Flusso UI mastrino con creazione conto al volo OK');

  // ---------- 8i-ter) Esportazione vista per MCP locale: dati già calcolati, coerenti col motore ----------
  const vistaMCP = window.esportaVistaMCP();
  assert(Array.isArray(vistaMCP.clienti) && vistaMCP.clienti.length === window.getSTATE().clienti.length, 'vista MCP: numero clienti esportati non coerente con STATE');
  assert(Array.isArray(vistaMCP.scadenze) && vistaMCP.scadenze.length > 0, 'vista MCP: nessuna scadenza esportata');
  const { tutteScadenze: tutteScadCheckMCP } = window.derivati();
  const classiCheckMCP = window.classificaScadenze(tutteScadCheckMCP, window.oggiISO());
  assert(vistaMCP.scadenzeRiepilogo.scaduti === classiCheckMCP.scaduti.length, `vista MCP: riepilogo scaduti (${vistaMCP.scadenzeRiepilogo.scaduti}) diverso dal calcolo diretto (${classiCheckMCP.scaduti.length})`);
  assert(vistaMCP.scadenzeRiepilogo.completati === classiCheckMCP.completati.length, `vista MCP: riepilogo completati (${vistaMCP.scadenzeRiepilogo.completati}) diverso dal calcolo diretto (${classiCheckMCP.completati.length})`);
  assert(vistaMCP.scadenze.every(s => ['scaduto','in_scadenza','futuro','completato'].includes(s.categoria)), 'vista MCP: ogni scadenza esportata deve avere una categoria valida (scaduto/in_scadenza/futuro/completato)');
  const scadutiMCP = vistaMCP.scadenze.filter(s => s.categoria === 'scaduto').length;
  assert(scadutiMCP === classiCheckMCP.scaduti.length, `vista MCP: conteggio scadenze con categoria "scaduto" (${scadutiMCP}) diverso dal calcolo diretto (${classiCheckMCP.scaduti.length})`);
  const clienteMCPDemo = vistaMCP.clienti.find(c => c.id === clienteContabDemo.id);
  assert(clienteMCPDemo, 'vista MCP: cliente demo Rossi Impianti non trovato nell\'esportazione');
  assert(Array.isArray(clienteMCPDemo.contabilita) && clienteMCPDemo.contabilita.length === window.statoAggiornamentoDocumenti(clienteContabDemo.id).length, 'vista MCP: stato contabilità del cliente demo non coerente con statoAggiornamentoDocumenti');
  const periodiMCPDemo = window.anniBilancioCliente(clienteContabDemo.id);
  assert(clienteMCPDemo.ultimoBilancio && clienteMCPDemo.ultimoBilancio.periodo === periodiMCPDemo[periodiMCPDemo.length-1], 'vista MCP: ultimo bilancio del cliente demo non è il periodo più recente atteso');
  assert(clienteMCPDemo.ultimoBilancio.infraAnnuale === true, 'vista MCP: il periodo più recente del cliente demo è infra-annuale, il campo infraAnnuale deve rifletterlo');
  assert(clienteMCPDemo.ultimoBilancio.periodoEtichetta === window.etichettaEstesaBilancio(periodiMCPDemo[periodiMCPDemo.length-1]), 'vista MCP: periodoEtichetta non coerente con etichettaEstesaBilancio');
  assert(typeof vistaMCP.taskApertiCount === 'number' && vistaMCP.taskAperti.length === vistaMCP.taskApertiCount, 'vista MCP: conteggio task aperti non coerente con l\'elenco esportato');
  assert(vistaMCP.taskAperti.every(t => t.stato !== 'Fatto'), 'vista MCP: task già completati non devono comparire tra i task aperti esportati');
  console.log('=== Esportazione vista per MCP locale: struttura coerente col motore di derivazione/classificazione OK');

  // Preventivi/mandati + catalogo/modelli (task #143): esportati senza il testo integrale
  // (corpo/valoriCustom), coerenti col numero reale in STATE.
  assert(Array.isArray(vistaMCP.preventivi) && vistaMCP.preventivi.length === window.getSTATE().preventivi.length, 'vista MCP: numero preventivi/mandati esportati non coerente con STATE');
  assert(vistaMCP.preventivi.every(p => !('corpo' in p) && !('valoriCustom' in p)), 'vista MCP: i preventivi esportati non devono includere il testo integrale del documento');
  assert(Array.isArray(vistaMCP.modelliDocumento) && vistaMCP.modelliDocumento.length === window.getSTATE().modelliDocumento.filter(m => m.attivo).length, 'vista MCP: numero modelli documento attivi esportati non coerente con STATE');
  assert(vistaMCP.modelliDocumento.every(m => !('corpo' in m)), 'vista MCP: i modelli esportati non devono includere il testo del modello');
  assert(Array.isArray(vistaMCP.catalogoAttivitaStudio) && vistaMCP.catalogoAttivitaStudio.length === window.getSTATE().catalogoAttivitaStudio.length, 'vista MCP: numero attività a listino esportate non coerente con STATE');
  console.log('=== Esportazione vista per MCP locale: preventivi/modelliDocumento/catalogoAttivitaStudio coerenti con STATE, senza testo integrale OK');

  // ---------- 8j) Wizard di import guidato: mapping colonne + classificazione conti nuovi, end-to-end via UI ----------
  const clienteWizard = clienteContabVuoto;
  click(q(`[data-action="apri-import-contabile"][data-cliente="${clienteWizard.id}"]`));
  await wait(20);
  assert(q('[data-action="import-contab-file"]'), 'passo "scegli": input file non presente nel wizard');
  assert(qa('input[name="importContabTipo"]').length === 3, 'passo "scegli": attese 3 opzioni di tipo import (movimenti/fatture attive/fatture passive)');

  // simula l'esito della lettura file (bypassando FileReader, come già fatto per l'import bilanci):
  // due conti mai visti da questo cliente, per testare lo step di classificazione.
  const headerWizard = ['Data Operazione', 'Conto Intestato', 'Descrizione', 'Importo Euro'];
  const righeAoaWizard = [
    headerWizard,
    ['2026-08-01', 'Banca Sella Nuova', 'Incasso cliente', '2000,00'],
    ['2026-08-02', 'Cassa Ufficio Nuova', 'Spesa piccola', '-30,00'],
  ];
  const mappingWizard = window.suggerisciMappingColonne(headerWizard, 'movimenti');
  assert(mappingWizard.data && mappingWizard.conto && mappingWizard.importo, 'mapping automatico wizard incompleto per i campi obbligatori');
  window.setImportWizard({ clienteId: clienteWizard.id, tipo: 'movimenti', righeAoa: righeAoaWizard, mapping: mappingWizard, firma: 'movimenti::' + window.firmaColonne(headerWizard), righeMappate: null, contiNuovi: null, step: 'mappa', esito: null });
  window.renderModalImportContabile();
  await wait(20);
  assert(qa('[data-action="import-contab-mappa-campo"]').length === 5, 'passo "mappa": attesi 5 select di mapping (data, conto, codiceConto, descrizione, importo)');

  click(q('[data-action="import-contab-conferma-mapping"]'));
  await wait(20);
  assert(window.getSTATE().importProfili['movimenti::' + window.firmaColonne(headerWizard)], 'profilo di mapping non salvato per riutilizzo futuro sullo stesso tracciato');
  const wizardDopoMapping = window.getImportWizard();
  assert(wizardDopoMapping.step === 'classifica', `dopo la mappatura con 2 conti mai visti ci si attende lo step "classifica", trovato "${wizardDopoMapping.step}"`);
  assert(qa('[data-action="import-contab-classifica-conto"]').length === 2, 'passo "classifica": attese 2 righe di classificazione conto (2 conti nuovi)');
  const contoBancaWizard = wizardDopoMapping.contiNuovi.find(c => c.conto === 'Banca Sella Nuova');
  assert(contoBancaWizard.categoria === 'Banca', 'suggerimento automatico categoria nel wizard non applicato per "Banca Sella Nuova"');

  // prova a confermare con una categoria mancante: non deve avanzare
  const selectClassifica0 = q('[data-action="import-contab-classifica-conto"][data-idx="0"]');
  setVal(selectClassifica0, '');
  click(q('[data-action="import-contab-conferma-classificazione"]'));
  await wait(20);
  assert(window.getImportWizard().step === 'classifica', 'con una categoria mancante il wizard non deve avanzare allo step successivo');
  setVal(q('[data-action="import-contab-classifica-conto"][data-idx="0"]'), 'Banca');
  click(q('[data-action="import-contab-conferma-classificazione"]'));
  await wait(20);
  assert(window.getImportWizard().step === 'anteprima', 'dopo aver completato la classificazione il wizard deve avanzare allo step "anteprima"');
  assert(window.document.body.textContent.includes('pronte per l\'import'), 'passo "anteprima": riepilogo righe pronte non mostrato');

  click(q('[data-action="import-contab-conferma-import"]'));
  await wait(20);
  assert(window.getImportWizard().step === 'fatto', 'dopo la conferma import il wizard deve mostrare lo step "fatto"');
  assert(window.getSTATE().movimentiContabili[clienteWizard.id].length === 2, 'i 2 movimenti del wizard non sono stati salvati in STATE');
  const movBancaWizard = window.getSTATE().movimentiContabili[clienteWizard.id].find(m => m.conto === 'Banca Sella Nuova');
  assert(movBancaWizard.categoria === 'Banca' && almostEq(movBancaWizard.importo, 2000), 'movimento importato dal wizard non ha categoria/importo corretti');
  assert(window.getSTATE().contoMappings[clienteWizard.id]['banca sella nuova'] === 'Banca', 'classificazione scelta nel wizard non memorizzata per i prossimi import');

  click(q('[data-action="import-contab-chiudi"]'));
  await wait(20);
  assert(window.getImportWizard() === null, 'il wizard non è stato azzerato alla chiusura');
  assert(q('.modal-backdrop') === null, 'il modal del wizard non si è chiuso correttamente');
  assert(qa('details .kpi-grid .kpi').length === 2, `dopo l'import dal wizard attese 2 card di aggiornamento nell'import avanzato (Banca, Cassa), trovate ${qa('details .kpi-grid .kpi').length}`);
  console.log('=== Wizard import guidato: mapping -> classificazione (con validazione categoria obbligatoria) -> anteprima -> import -> chiusura con aggiornamento vista OK');

  // ---------- 8k) Scheda cliente 360°: aggregazione e collegamenti rapidi ----------
  const clienteScheda = window.getSTATE().clienti[0]; // Rossi Impianti: ha scadenze, task, comunicazioni, contabilità e bilanci demo

  // il click su una riga della lista Clienti apre la scheda, non più il modale di modifica
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q(`[data-action="apri-cliente"][data-id="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'schedacliente', `il click su una riga cliente deve aprire la scheda cliente, vista attuale: ${window.getVIEW()}`);
  assert(q('.modal-backdrop') === null, 'il click sulla riga cliente non deve più aprire il modale di modifica');
  assert(q('#content').innerHTML.includes(clienteScheda.ragioneSociale), 'la scheda cliente non mostra la ragione sociale del cliente aperto');
  console.log('=== Click su riga cliente: apre la Scheda cliente (non più il modale) OK');

  // il pulsante "Modifica" deve invece continuare ad aprire il modale di modifica anagrafica
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q(`[data-action="modifica-cliente"][data-id="${clienteScheda.id}"]`));
  await wait(20);
  assert(q('.modal-backdrop'), 'il pulsante "Modifica" deve continuare ad aprire il modale di modifica anagrafica');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  // vista Scheda cliente: selezione cliente e coerenza dei riepiloghi con i dati grezzi
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteScheda.id);
  await wait(20);

  const { tutteScadenze: tutteScadCheck } = window.derivati();
  const scadClienteCheck = tutteScadCheck.filter(s => s.clienteId === clienteScheda.id);
  const classiCliente = window.classificaScadenze(scadClienteCheck, window.oggiISO());
  const kpiSchedaNums = qa('.kpi-grid .kpi .n').slice(0, 4).map(el => Number(el.textContent));
  assert(kpiSchedaNums[0] === classiCliente.scaduti.length, `Scheda cliente: KPI scaduti (${kpiSchedaNums[0]}) diverso dal calcolo diretto (${classiCliente.scaduti.length})`);
  assert(kpiSchedaNums[3] === classiCliente.completati.length, `Scheda cliente: KPI completati (${kpiSchedaNums[3]}) diverso dal calcolo diretto (${classiCliente.completati.length})`);
  console.log('=== Scheda cliente: riepilogo scadenze coerente con il motore di classificazione OK');

  const taskApertiCliente = window.getSTATE().taskTeam.filter(t => t.clienteId === clienteScheda.id && t.stato !== 'Fatto');
  assert(taskApertiCliente.length === 2, `attesi 2 task aperti demo per questo cliente, trovati ${taskApertiCliente.length}`);
  assert(q('#content').innerHTML.includes(`${taskApertiCliente.length} aperti`), 'Scheda cliente: conteggio task aperti non mostrato correttamente');

  const comCliente = window.getSTATE().comunicazioni.filter(c => c.clienteId === clienteScheda.id);
  assert(comCliente.length === 3, `attese 3 comunicazioni demo per questo cliente (2 singole + 1 broadcast), trovate ${comCliente.length}`);
  assert(q('#content').innerHTML.includes(`${comCliente.length} totali`), 'Scheda cliente: conteggio comunicazioni non mostrato correttamente');

  const statoContabCliente = window.statoAggiornamentoContabile(clienteScheda.id);
  assert(statoContabCliente.length === 5, `attese 5 categorie di aggiornamento contabile per questo cliente, trovate ${statoContabCliente.length}`);

  const anniBilCliente = window.anniBilancioCliente(clienteScheda.id);
  assert(q('#content').innerHTML.includes(window.etichettaEstesaBilancio(anniBilCliente[anniBilCliente.length-1])), 'Scheda cliente: sezione Bilanci & KPI non mostra il periodo più recente corretto');
  console.log('=== Scheda cliente: task, comunicazioni, contabilità e bilanci aggregati correttamente OK');

  // collegamenti rapidi: ognuno deve portare alla vista giusta, con il cliente già preselezionato/filtrato
  click(q(`[data-action="schcli-apri-bilanci"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'bilanci', 'collegamento rapido Bilanci: vista errata');
  assert(qa('.kpi-grid .kpi').length === window.CATALOGO_INDICI_BILANCIO.length, 'collegamento rapido Bilanci: il cliente giusto non risulta preselezionato');

  // Task #176 (Matteo: "rimuovere/sospendere tab Contabilità"): sospeso di default, quindi il
  // collegamento rapido e il tab di navigazione sono testati qui riattivando la sezione prima e
  // verificando poi esplicitamente che da sospesa (lo stato normale su una installazione nuova)
  // sia davvero invisibile ovunque, senza toccare i dati sottostanti.
  window.getSTATE().meta.contabilitaAttiva = true;
  window.render();
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  click(q(`[data-action="schcli-apri-contabilita"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'contabilita', 'collegamento rapido Contabilità: vista errata (con la sezione riattivata)');
  assert(qa('details .kpi-grid .kpi').length === 5, 'collegamento rapido Contabilità: il cliente giusto non risulta preselezionato');
  console.log('=== #176: con la sezione riattivata, tab e collegamento rapido Contabilità funzionano come prima OK');

  window.getSTATE().meta.contabilitaAttiva = false;
  window.render();
  assert(!window.operatorePuoVedere('contabilita'), '#176: operatorePuoVedere dovrebbe negare "contabilita" quando la sezione è sospesa (default)');
  assert(!qa('.navitem').some(el => el.dataset.nav === 'contabilita'), '#176: la voce di menu Contabilità non dovrebbe comparire nel DOM quando la sezione è sospesa');
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteScheda.id);
  await wait(20);
  assert(!q('[data-action="schcli-apri-contabilita"]'), '#176: la card Contabilità nella scheda cliente non dovrebbe comparire quando la sezione è sospesa');
  window.setView('contabilita');
  await wait(20);
  assert(window.getVIEW() === 'dashboard', '#176: tentare di aprire direttamente "contabilita" da sospesa dovrebbe reindirizzare alla dashboard, non mostrare la sezione');
  assert(window.statoAggiornamentoContabile(clienteContabDemo.id).length === 5, '#176: i dati contabili (import demo) devono restare leggibili/intatti anche a sezione sospesa, nessuna cancellazione legata al toggle');
  console.log('=== #176: sezione Contabilità sospesa (default) - nascosta da menu, scheda cliente e accesso diretto, dati intatti OK');

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  click(q(`[data-action="schcli-apri-task"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'taskteam', 'collegamento rapido Task team: vista errata');
  const taskTotaliCliente = window.getSTATE().taskTeam.filter(t => t.clienteId === clienteScheda.id).length;
  assert(qa('.task-card').length === taskTotaliCliente, `collegamento rapido Task team: il filtro cliente non è stato applicato (attesi ${taskTotaliCliente} task-card, trovate ${qa('.task-card').length})`);

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  click(q(`[data-action="schcli-apri-comunicazioni"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'comunicazioni', 'collegamento rapido Comunicazioni: vista errata');

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  click(q(`[data-action="schcli-apri-documenti"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'documenti', 'collegamento rapido Documenti: vista errata');

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  click(q(`[data-action="schcli-apri-portale"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'portale', 'collegamento rapido Portale cliente: vista errata');

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteScheda.id);
  await wait(20);
  click(q(`[data-action="schcli-apri-onboarding"][data-cliente="${clienteScheda.id}"]`));
  await wait(20);
  assert(window.getVIEW() === 'onboarding', 'collegamento rapido Onboarding: vista errata');

  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clienteScheda.id);
  await wait(20);
  click(q(`[data-action="schcli-apri-scadenze"][data-cliente="${clienteScheda.id}"][data-filtro="scaduti"]`));
  await wait(20);
  assert(window.getVIEW() === 'scadenze', 'collegamento rapido Scadenze: vista errata');
  assert(q('[data-action="scad-filtro-bucket"]').value === 'Scaduti', `collegamento rapido Scadenze: bucket atteso "Scaduti", trovato "${q('[data-action="scad-filtro-bucket"]').value}"`);
  assert(q('[data-action="scad-filtro-q"]').value === clienteScheda.ragioneSociale, 'collegamento rapido Scadenze: filtro testuale sul nome cliente non impostato');
  console.log('=== Scheda cliente: collegamenti rapidi a Bilanci/Contabilità/Task/Comunicazioni/Documenti/Portale/Onboarding/Scadenze tutti funzionanti OK');

  // scorciatoie "nuovo task"/"nuova comunicazione" dalla scheda: precompilano già il cliente
  const clientePerScorciatoie = window.getSTATE().clienti.find(c => c.stato !== 'cessato' && c.id !== clienteScheda.id);
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), clientePerScorciatoie.id);
  await wait(20);
  click(q(`[data-action="nuovo-task-team"][data-cliente="${clientePerScorciatoie.id}"]`));
  await wait(20);
  assert(q('#tCliente').value === clientePerScorciatoie.id, 'scorciatoia "Nuovo task" dalla scheda cliente non precompila il cliente');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  click(q(`[data-action="nuova-comunicazione"][data-cliente="${clientePerScorciatoie.id}"]`));
  await wait(20);
  assert(q('#cDestSingolo').value === clientePerScorciatoie.id, 'scorciatoia "Nuova comunicazione" dalla scheda cliente non precompila il cliente');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Scheda cliente: scorciatoie "Nuovo task"/"Nuova comunicazione" precompilano il cliente corretto OK');

  // ---------- 9) Cambio anno dal topbar: verifica rigenerazione scadenze ----------
  const annoOriginale = window.getSTATE().annoCorrente;
  const selAnno = q('#annoSelect');
  const nuovoAnnoOpt = qa('#annoSelect option').find(o => Number(o.value) === annoOriginale + 1);
  assert(nuovoAnnoOpt, 'opzione anno successivo non trovata nel selettore');
  setVal(selAnno, String(annoOriginale + 1));
  await wait(20);
  assert(window.getSTATE().annoCorrente === annoOriginale + 1, 'cambio anno non applicato');
  const scadAnnoSucc = window.derivati().periodiche;
  assert(scadAnnoSucc.every(s => s.data.startsWith(String(annoOriginale+1))), 'le scadenze del nuovo anno non hanno le date corrette');
  console.log(`=== Cambio anno OK: ${annoOriginale} -> ${annoOriginale+1}, scadenze rigenerate (${scadAnnoSucc.length})`);
  setVal(selAnno, String(annoOriginale));
  await wait(20);

  // verifica che tornando all'anno originale gli stati marcati prima siano ancora lì (persistenza cross-anno)
  const primaMarcataAncora = window.getSTATE().scadenzeOverrides[idsMarcati[0]];
  assert(primaMarcataAncora && primaMarcataAncora.stato === 'Inviato telematicamente', 'stato perso dopo cambio anno avanti e indietro');
  console.log('=== Stati preservati dopo cambio anno avanti/indietro');

  // ---------- 10) Backup: esporta e reimporta ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="dati"]'));
  await wait(20);
  click(q('[data-action="esporta-backup"]')); // non deve lanciare eccezioni
  await wait(20);
  console.log('=== Esportazione backup eseguita senza errori');

  const statoPrimaDiReset = JSON.parse(JSON.stringify(window.getSTATE()));
  // reset e verifica stato vuoto
  click(q('[data-action="imp-sezione"][data-sezione="avanzate"]'));
  await wait(20);
  click(q('[data-action="reset-tutto"]'));
  await wait(20);
  assert(window.getSTATE().clienti.length === 0, 'reset-tutto non ha svuotato i clienti');
  console.log('=== Reset dati OK, stato tornato vuoto');
  // ripristina lo stato per completezza (simula "importa backup" riscrivendo STATE direttamente,
  // il flusso reale del file-input non è simulabile facilmente in jsdom)
  window.setSTATE(statoPrimaDiReset);
  window.salvaStato();
  window.render();
  await wait(20);
  assert(window.getSTATE().clienti.length === 24, 'ripristino manuale post-reset fallito'); // il cliente di prova era già stato eliminato
  console.log('=== Stato ripristinato dopo il test di reset');

  // ---------- 11) Responsabili: aggiungi e rinomina ----------
  click(q('[data-action="imp-sezione"][data-sezione="team"]'));
  await wait(20);
  const nRespPrima = window.getSTATE().meta.responsabili.length;
  click(q('[data-action="aggiungi-responsabile"]'));
  await wait(20);
  assert(window.getSTATE().meta.responsabili.length === nRespPrima + 1, 'nuovo responsabile non aggiunto');
  console.log('=== Responsabile aggiunto:', window.getSTATE().meta.responsabili[window.getSTATE().meta.responsabili.length-1]);

  // ---------- 11b) F24: registrazione, KPI a debito/credito, modifica, eliminazione ----------
  click(q('[data-nav="f24"]'));
  await wait(20);
  const clientiF24 = window.getSTATE().clienti;
  const clienteF24a = clientiF24[0], clienteF24b = clientiF24[1];
  const nF24Prima = window.getSTATE().f24.length;
  assert(nF24Prima === 0, `attesi 0 F24 all'avvio (nessun generatore demo), trovati ${nF24Prima}`);
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  assert(q('#formF24'), 'form nuovo F24 non renderizzato');
  assertNoAutoSubmit(q('#formF24'), 'formF24');
  // Il form F24 supporta più righe/codici tributo (task Matteo: pagamento misto) - non esiste più
  // un unico campo #fImporto, l'importo si scrive nella prima riga via [data-action="f24-riga-input"].
  const rigaImporto = (idx) => q(`[data-action="f24-riga-input"][data-idx="${idx}"][data-campo="importo"]`);
  setVal(q('#fCliente'), clienteF24a.id);
  setVal(q('#fTipo'), 'Debito');
  setVal(rigaImporto(0), '1250.50');
  setVal(q('#fDescrizione'), 'Saldo IVA test');
  click(q('[data-action="salva-f24"]'));
  await wait(20);
  assert(window.getSTATE().f24.length === nF24Prima + 1, 'nuovo F24 a debito non salvato');
  const f24Debito = window.getSTATE().f24.find(f => f.descrizione === 'Saldo IVA test');
  assert(f24Debito && f24Debito.tipo === 'Debito' && f24Debito.importo === 1250.5 && f24Debito.clienteId === clienteF24a.id, 'F24 a debito salvato con dati errati');
  // secondo F24, a credito, su un altro cliente, per verificare i totali KPI separati
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  setVal(q('#fCliente'), clienteF24b.id);
  setVal(q('#fTipo'), 'Credito');
  setVal(rigaImporto(0), '300');
  click(q('[data-action="salva-f24"]'));
  await wait(20);
  assert(window.getSTATE().f24.length === nF24Prima + 2, 'nuovo F24 a credito non salvato');
  const kpiF24 = q('.kpi-grid').textContent;
  assert(/1[.,]?251/.test(kpiF24), `KPI "totale a debito" non coerente col F24 registrato: ${kpiF24}`);
  assert(kpiF24.includes('300'), `KPI "totale a credito" non coerente col F24 registrato: ${kpiF24}`);
  // modifica: cambia l'importo del F24 a debito
  click(q(`[data-action="modifica-f24"][data-id="${f24Debito.id}"]`));
  await wait(20);
  setVal(rigaImporto(0), '999');
  click(q(`[data-action="salva-f24"][data-id="${f24Debito.id}"]`));
  await wait(20);
  assert(window.getSTATE().f24.find(f => f.id === f24Debito.id).importo === 999, 'modifica importo F24 non salvata');
  // eliminazione di entrambi, ripristino conteggio (query e click uno alla volta: ogni eliminazione
  // ri-renderizza la tabella, quindi un elenco di bottoni raccolto prima del primo click sarebbe stale)
  while (q('[data-action="elimina-f24"]')) {
    click(q('[data-action="elimina-f24"]'));
    await wait(20);
  }
  assert(window.getSTATE().f24.length === nF24Prima, 'eliminazione F24 di test non ha ripristinato il conteggio originale');
  console.log('=== F24: registrazione (debito/credito), KPI totali, modifica ed eliminazione OK');

  // ---------- 11c) Precompilazione importi statutari: regole configurabili, calcolo, prefill in F24 ----------
  const regoleDefault = window.getSTATE().regoleImportiStatutari;
  assert(Array.isArray(regoleDefault) && regoleDefault.length === 2, `attese 2 regole di default (vidimazione libri, diritto camerale), trovate ${regoleDefault ? regoleDefault.length : 0}`);
  const regolaVidimazione = regoleDefault.find(r => r.chiave === 'VIDIMAZIONE_LIBRI');
  assert(regolaVidimazione, 'regola di default per VIDIMAZIONE_LIBRI mancante');

  // capitale sociale sotto soglia -> importo base
  click(q('[data-nav="clienti"]'));
  await wait(20);
  click(q(`[data-action="modifica-cliente"][data-id="${clienteF24a.id}"]`));
  await wait(20);
  setVal(q('#fCapitaleSociale'), '10000');
  setVal(q('#fNumeroSedi'), '0');
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  assert(window.clienteById(clienteF24a.id).capitaleSociale === 10000, 'capitale sociale non salvato');
  let importoCalc = window.calcolaImportoStatutario('VIDIMAZIONE_LIBRI', window.clienteById(clienteF24a.id));
  assert(importoCalc === 200, `sotto soglia capitale sociale atteso importo 200, trovato ${importoCalc}`);

  // capitale sociale sopra soglia -> importo maggiorato
  click(q(`[data-action="modifica-cliente"][data-id="${clienteF24a.id}"]`));
  await wait(20);
  setVal(q('#fCapitaleSociale'), '1000000');
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  importoCalc = window.calcolaImportoStatutario('VIDIMAZIONE_LIBRI', window.clienteById(clienteF24a.id));
  assert(importoCalc === 309.87, `sopra soglia capitale sociale atteso importo 309.87, trovato ${importoCalc}`);

  // diritto camerale: regola di default con importoBase 0 (da compilare) -> nessun suggerimento (mai "€0,00" spacciato per un valore vero)
  assert(window.calcolaImportoStatutario('DIRITTO_CAMERALE', window.clienteById(clienteF24a.id)) === null, 'con importoBase non compilato non deve essere suggerito alcun importo');
  assert(window.calcolaImportoStatutario('CHIAVE_INESISTENTE', window.clienteById(clienteF24a.id)) === null, 'chiave senza regola non deve restituire un importo');

  // sedi secondarie aggiuntive: aggiorna temporaneamente la regola DIRITTO_CAMERALE esistente (una sola regola per chiave è ammessa)
  const regolaCamerale = regoleDefault.find(r => r.chiave === 'DIRITTO_CAMERALE');
  window.aggiornaRegolaImportoStatutario(regolaCamerale.id, { importoBase: 100, importoPerSedeAggiuntiva: 30 });
  click(q(`[data-action="modifica-cliente"][data-id="${clienteF24a.id}"]`));
  await wait(20);
  setVal(q('#fNumeroSedi'), '3');
  click(q('[data-action="salva-cliente"]'));
  await wait(20);
  importoCalc = window.calcolaImportoStatutario('DIRITTO_CAMERALE', window.clienteById(clienteF24a.id));
  assert(importoCalc === 190, `atteso importo base 100 + 3 sedi * 30 = 190, trovato ${importoCalc}`);
  window.aggiornaRegolaImportoStatutario(regolaCamerale.id, { importoBase: 0, importoPerSedeAggiuntiva: 0 }); // ripristino stato di default
  assert(window.calcolaImportoStatutario('DIRITTO_CAMERALE', window.clienteById(clienteF24a.id)) === null, 'ripristino regola diritto camerale non riuscito');
  console.log('=== Calcolo importo statutario: soglia capitale sociale, sedi aggiuntive, nessun suggerimento senza importo compilato OK');

  // flusso UI: nel modal F24 la scelta dell'adempimento precompila l'importo, senza sovrascrivere un valore già digitato
  click(q('[data-nav="f24"]'));
  await wait(20);
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  assert(q('#fChiaveAdempimento'), 'selettore adempimento non presente nel modal F24 (dovrebbe esserci, ci sono regole configurate)');
  setVal(q('#fCliente'), clienteF24a.id);
  setVal(q('#fChiaveAdempimento'), 'VIDIMAZIONE_LIBRI');
  await wait(20);
  assert(rigaImporto(0).value === '309.87', `importo non precompilato correttamente dalla regola, trovato "${rigaImporto(0).value}"`);
  assert(q('#f24SuggerimentoImporto').textContent.includes('309,87') || q('#f24SuggerimentoImporto').textContent.includes('309.87'), 'testo di suggerimento importo non mostrato');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  console.log('=== Modal F24: prefill importo da regola statutaria in base al cliente selezionato OK');

  // ---------- 11d) Impostazioni: CRUD regole importi statutari ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="catalogo"]'));
  await wait(20);
  const nRegolePrima = window.getSTATE().regoleImportiStatutari.length;
  // chiave scelta apposta perché NON ha già una regola di default (VIDIMAZIONE_LIBRI e DIRITTO_CAMERALE sono già presenti)
  const chiaveUiTest = (window.catalogoAnnualeTutti().find(c => !regoleDefault.some(r => r.chiave === c.chiave)) || {}).chiave;
  assert(chiaveUiTest, 'nessuna chiave libera trovata nel catalogo per il test CRUD regole');
  click(q('[data-action="nuova-regola-importo"]'));
  await wait(20);
  assert(q('#formRegolaImporto'), 'form nuova regola importo non renderizzato');
  assertNoAutoSubmit(q('#formRegolaImporto'), 'formRegolaImporto');
  setVal(q('#riNome'), 'Regola di prova UI');
  setVal(q('#riChiave'), chiaveUiTest);
  setVal(q('#riImportoBase'), '50');
  click(q('[data-action="salva-regola-importo"]'));
  await wait(20);
  assert(window.getSTATE().regoleImportiStatutari.length === nRegolePrima + 1, 'nuova regola non salvata');
  const regolaUI = window.getSTATE().regoleImportiStatutari.find(r => r.nome === 'Regola di prova UI');
  assert(regolaUI && regolaUI.importoBase === 50, 'regola creata dal modal con dati errati');
  click(q(`[data-action="modifica-regola-importo"][data-id="${regolaUI.id}"]`));
  await wait(20);
  setVal(q('#riImportoBase'), '75');
  click(q(`[data-action="salva-regola-importo"][data-id="${regolaUI.id}"]`));
  await wait(20);
  assert(window.getSTATE().regoleImportiStatutari.find(r => r.id === regolaUI.id).importoBase === 75, 'modifica regola non salvata');

  // guard anti-duplicati: creare una nuova regola con una chiave già usata (es. DIRITTO_CAMERALE) deve essere rifiutato
  click(q('[data-action="nuova-regola-importo"]'));
  await wait(20);
  setVal(q('#riNome'), 'Diritto camerale doppione');
  setVal(q('#riChiave'), 'DIRITTO_CAMERALE');
  setVal(q('#riImportoBase'), '1');
  const nRegolePreDoppione = window.getSTATE().regoleImportiStatutari.length;
  click(q('[data-action="salva-regola-importo"]'));
  await wait(20);
  assert(window.getSTATE().regoleImportiStatutari.length === nRegolePreDoppione, 'il guard anti-duplicati non ha impedito la creazione di una seconda regola per la stessa chiave');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);

  click(q(`[data-action="elimina-regola-importo"][data-id="${regolaUI.id}"]`));
  await wait(20);
  assert(!window.getSTATE().regoleImportiStatutari.find(r => r.id === regolaUI.id), 'regola di prova non eliminata');
  assert(window.getSTATE().regoleImportiStatutari.length === nRegolePrima, 'conteggio regole non ripristinato dopo eliminazione');
  console.log('=== Impostazioni: creazione, modifica, eliminazione e guard anti-duplicati regola importo statutario OK');

  // ---------- 11c) Soci e referenti: creazione multi-cliente, visibilità in Scheda cliente, eliminazione ----------
  click(q('[data-nav="soci"]'));
  await wait(20);
  const clientiSoci = window.getSTATE().clienti;
  const socioClienteA = clientiSoci[0], socioClienteB = clientiSoci[1];
  const nSociPrima = window.getSTATE().soci.length;
  assert(nSociPrima === 0, `attesi 0 soci all'avvio (nessun generatore demo), trovati ${nSociPrima}`);
  click(q('[data-action="nuovo-socio"]'));
  await wait(20);
  assert(q('#formSocio'), 'form nuovo socio non renderizzato');
  assertNoAutoSubmit(q('#formSocio'), 'formSocio');
  setVal(q('#sNome'), 'Mario Rossi Test');
  setVal(q('#sRuolo'), 'Socio amministratore');
  setVal(q('#sEmail'), 'mario.rossi.test@example.com');
  setChecked(q(`[data-multi-cliente="socio"][value="${socioClienteA.id}"]`), true);
  setChecked(q(`[data-multi-cliente="socio"][value="${socioClienteB.id}"]`), true);
  click(q('[data-action="salva-socio"]'));
  await wait(20);
  assert(window.getSTATE().soci.length === nSociPrima + 1, 'nuovo socio non salvato');
  const socioCreato = window.getSTATE().soci.find(s => s.nome === 'Mario Rossi Test');
  assert(socioCreato, 'socio di test non trovato in STATE');
  assert(socioCreato.clienteIds.length === 2 && socioCreato.clienteIds.includes(socioClienteA.id) && socioCreato.clienteIds.includes(socioClienteB.id), 'clienteIds del socio non salvati correttamente (collegamento a più clienti)');
  assert(window.sociDiCliente(socioClienteA.id).some(s => s.id === socioCreato.id), 'sociDiCliente non trova il socio sul primo cliente collegato');
  assert(window.sociDiCliente(socioClienteB.id).some(s => s.id === socioCreato.id), 'sociDiCliente non trova il socio sul secondo cliente collegato (collegamento N:M)');
  // verifica che compaia anche nella Scheda cliente di entrambi i clienti collegati
  click(q('[data-nav="schedacliente"]'));
  await wait(20);
  setVal(q('[data-action="schcli-seleziona-cliente"]'), socioClienteA.id);
  await wait(20);
  assert(window.document.body.textContent.includes('Mario Rossi Test'), 'socio collegato non compare nella Scheda cliente del primo cliente');
  setVal(q('[data-action="schcli-seleziona-cliente"]'), socioClienteB.id);
  await wait(20);
  assert(window.document.body.textContent.includes('Mario Rossi Test'), 'socio collegato non compare nella Scheda cliente del secondo cliente');
  // eliminazione, ripristino conteggio
  click(q('[data-nav="soci"]'));
  await wait(20);
  click(q(`[data-action="elimina-socio"][data-id="${socioCreato.id}"]`));
  await wait(20);
  assert(window.getSTATE().soci.length === nSociPrima, 'eliminazione socio di test non ha ripristinato il conteggio originale');
  console.log('=== Soci e referenti: creazione multi-cliente, collegamento N:M, visibilità in Scheda cliente ed eliminazione OK');

  // ---------- 11d) Adempimenti per enti associativi (associazioni, ASD/SSD, ETS) ----------
  assert(window.REGIMI_FISCALI.includes('Forfettario L.398/91'), 'regime "Forfettario L.398/91" non disponibile in REGIMI_FISCALI');
  assert(window.FLAG_SEMPLICI.includes('iva398'), 'flag periodico iva398 (L.398/91) non registrato in FLAG_SEMPLICI');
  assert(window.FLAG_LABELS.iva398, 'etichetta per il flag iva398 mancante');
  const catPeriodico398 = window.DEFAULT_CATALOGO_PERIODICO.find(d => d.id === 'iva398');
  assert(catPeriodico398 && catPeriodico398.tipo === 'Imposte indirette' && catPeriodico398.occorrenze.length === 4, 'catalogo periodico: voce iva398 mancante o mal configurata');
  const chiaviAssociative = ['REDDITI_ENC', 'MODELLO_EAS', 'RENDICONTO_ASSOCIAZIONE', 'RENDICONTO_398', 'RUNTS_BILANCIO', 'CINQUE_PER_MILLE', 'AFFILIAZIONE_SPORTIVA'];
  chiaviAssociative.forEach(chiave => {
    const def = window.DEFAULT_CATALOGO_ANNUALE.find(d => d.chiave === chiave);
    assert(def, `catalogo annuale: voce ${chiave} mancante`);
    assert(window.TIPI_ADEMPIMENTO.includes(def.tipo), `catalogo annuale: voce ${chiave} ha un tipo non valido (${def.tipo})`);
    assert(Array.isArray(def.sotto) && def.sotto.length >= 2, `catalogo annuale: voce ${chiave} senza sotto-task sufficienti`);
  });
  // il cliente demo ASD deve usare il nuovo regime L.398/91 con il flag periodico e tre adempimenti annuali
  const clienteAsd = window.getSTATE().clienti.find(c => c.ragioneSociale.includes('Associazione Sportiva Dilettantistica'));
  assert(clienteAsd && clienteAsd.tipo === 'associazione', 'cliente demo ASD non trovato o tipo errato');
  assert(clienteAsd.regimeFiscale === 'Forfettario L.398/91', 'cliente demo ASD non usa il nuovo regime L.398/91');
  assert(clienteAsd.flags && clienteAsd.flags.iva398 === true, 'cliente demo ASD non ha il flag periodico iva398 attivo');
  ['RENDICONTO_398', 'MODELLO_EAS', 'AFFILIAZIONE_SPORTIVA'].forEach(chiave => {
    assert(clienteAsd.adempimentiAnnualiApplicabili.includes(chiave), `cliente demo ASD non ha l'adempimento annuale ${chiave} applicabile`);
  });
  assert(!clienteAsd.adempimentiAnnualiApplicabili.includes('VIDIMAZIONE_LIBRI'), 'cliente demo ASD ha ancora la vidimazione libri sociali (non dovuta dalle associazioni)');
  // le scadenze periodiche generate per l'ASD includono le 4 rate trimestrali IVA/IRES L.398/91
  const { tutteScadenze: scadenzeAsd, annuali: annualiAsd } = window.derivati();
  const rateAsd398 = scadenzeAsd.filter(s => s.clienteId === clienteAsd.id && s.tipo === 'Versamento IVA/IRES forfettaria L.398/91');
  assert(rateAsd398.length === 4, `attese 4 rate periodiche L.398/91 per l'ASD demo, trovate ${rateAsd398.length}`);
  // gli adempimenti annuali generati riportano le date di default previste (rendiconto 30/4, affiliazione 31/8), EAS senza data automatica
  const annualiAsdAttivi = annualiAsd.filter(a => a.clienteId === clienteAsd.id);
  const rendiconto398Asd = annualiAsdAttivi.find(a => a.tipoChiave === 'RENDICONTO_398');
  const affiliazioneAsd = annualiAsdAttivi.find(a => a.tipoChiave === 'AFFILIAZIONE_SPORTIVA');
  const easAsd = annualiAsdAttivi.find(a => a.tipoChiave === 'MODELLO_EAS');
  assert(rendiconto398Asd && rendiconto398Asd.scadenza === window.dataScadenza(window.getSTATE().annoCorrente, 4, 30), 'scadenza di default del rendiconto L.398/91 errata per l\'ASD demo');
  assert(affiliazioneAsd && affiliazioneAsd.scadenza === window.dataScadenza(window.getSTATE().annoCorrente, 8, 31), 'scadenza di default affiliazione sportiva errata per l\'ASD demo');
  assert(easAsd && !easAsd.scadenza, 'il Modello EAS non dovrebbe avere una scadenza automatica (è dovuto solo in caso di variazioni, va impostata manualmente)');
  console.log('=== Adempimenti enti associativi: catalogo (periodico L.398/91 + 7 voci annuali), regime L.398/91, cliente demo ASD e date di default OK');

  // ---------- 11e) Step di controllo sulle scadenze periodiche (imposte) ----------
  click(q('[data-nav="scadenze"]'));
  await wait(20);
  // reset di tutti i filtri (test precedenti possono aver lasciato bucket/stato filtrati),
  // così la riga scelta sotto è garantita visibile nella tabella effettivamente renderizzata
  setVal(q('[data-action="scad-filtro-bucket"]'), 'Tutti');
  await wait(20);
  setVal(q('[data-action="scad-filtro-stato"]'), 'Tutti');
  await wait(20);
  setVal(q('[data-action="scad-filtro-resp"]'), 'Tutti');
  await wait(20);
  setVal(q('[data-action="scad-filtro-tipo"]'), 'Tutti');
  await wait(20);
  setVal(q('[data-action="scad-filtro-q"]'), '');
  await wait(20);
  assert(window.STEP_CONTROLLO_IMPOSTA.length === 4, `attesi 4 step di controllo, trovati ${window.STEP_CONTROLLO_IMPOSTA.length}`);
  assert(window.STEP_CONTROLLO_IMPOSTA[0] === 'Calcolato' && window.STEP_CONTROLLO_IMPOSTA[3] === 'Inviato', 'ordine/nomi degli step di controllo inattesi');
  // sceglie una scadenza ancora "Da fare" (non toccata dai test precedenti su Stato) per non avere ambiguità
  const primaScadenza = window.derivati().periodiche.find(s => s.stato === 'Da fare');
  assert(primaScadenza, 'nessuna scadenza "Da fare" disponibile per il test degli step di controllo');
  assert(primaScadenza.step && primaScadenza.step.length === 4 && primaScadenza.step.every(st => st.completato === false), 'step di controllo iniziali di una scadenza non azzerati correttamente');
  const btnControllo = q(`[data-action="scad-apri-controllo"][data-id="${primaScadenza.id}"]`);
  assert(btnControllo && btnControllo.textContent.includes('0/4'), 'badge "Controllo" iniziale non mostra 0/4');
  click(btnControllo);
  await wait(20);
  assert(window.document.body.textContent.includes('Step di controllo'), 'modale step di controllo non aperto');
  const checkStep = qa('[data-action="scad-toggle-step"]');
  assert(checkStep.length === 4, `attese 4 checkbox nel modale step di controllo, trovate ${checkStep.length}`);
  // completa i primi due step (Calcolato, Comunicato al cliente) e verifica indipendenza reciproca e dallo Stato
  setChecked(checkStep[0], true);
  await wait(20);
  setChecked(qa('[data-action="scad-toggle-step"]')[1], true); // il modale viene ri-renderizzato ad ogni toggle: ri-query necessaria
  await wait(20);
  const scadenzaDopoStep = window.derivati().periodiche.find(s => s.id === primaScadenza.id);
  assert(scadenzaDopoStep.step[0].completato === true, 'step "Calcolato" non risulta completato dopo il toggle');
  assert(!!scadenzaDopoStep.step[0].data, 'step "Calcolato" completato ma senza data automatica');
  assert(scadenzaDopoStep.step[1].completato === true, 'step "Comunicato al cliente" non risulta completato dopo il toggle');
  assert(scadenzaDopoStep.step[2].completato === false && scadenzaDopoStep.step[3].completato === false, 'gli step non toccati sono stati alterati erroneamente (non sono indipendenti)');
  assert(scadenzaDopoStep.stato === 'Da fare', 'lo Stato della scadenza è stato alterato dal semplice avanzamento degli step di controllo (devono restare indipendenti)');
  click(q('[data-action="chiudi-modal"]'));
  await wait(20);
  const btnControlloDopo = q(`[data-action="scad-apri-controllo"][data-id="${primaScadenza.id}"]`);
  assert(btnControlloDopo && btnControlloDopo.textContent.includes('2/4'), `badge "Controllo" non aggiornato a 2/4 dopo i toggle, trovato: ${btnControlloDopo && btnControlloDopo.textContent}`);
  // pulizia: riporta gli step a zero per non alterare lo stato demo per i test successivi
  window.getSTATE().scadenzeOverrides[primaScadenza.id] = Object.assign({}, window.getSTATE().scadenzeOverrides[primaScadenza.id], { step: {} });
  window.salvaStato(); window.render();
  await wait(20);
  console.log('=== Step di controllo scadenze: badge, apertura modale, toggle indipendenti tra loro e dallo Stato, persistenza OK');

  // ---------- 11e-bis) Annotazioni datate sulla scadenza (dettagli tipo "compensazione con credito IVA") ----------
  // Stesso modale "Step di controllo": un log di note datate, distinto dal campo "nota" a riga
  // singola, per registrare dettagli operativi che maturano nel tempo (es. bilancio depositato in
  // ritardo, poi più avanti la conferma della compensazione con un credito IVA da modello TR).
  {
    assert(!primaScadenza.annotazioni || primaScadenza.annotazioni.length === 0, 'la scadenza scelta per il test ha già annotazioni: test non isolato');
    click(q(`[data-action="scad-apri-controllo"][data-id="${primaScadenza.id}"]`));
    await wait(20);
    assert(window.document.body.textContent.includes('Nessuna annotazione ancora'), 'messaggio di elenco annotazioni vuoto non mostrato');

    // click su "Aggiungi" senza aver scritto nulla: non deve creare un'annotazione vuota
    click(q('[data-action="scad-aggiungi-annotazione"]'));
    await wait(20);
    assert((window.derivati().periodiche.find(s => s.id === primaScadenza.id).annotazioni || []).length === 0, 'un\'annotazione vuota è stata aggiunta nonostante il campo fosse vuoto');

    setVal(q('#scadNuovaAnnotazione'), 'Bilancio depositato in ritardo; versamento imposte in ritardo.');
    click(q('[data-action="scad-aggiungi-annotazione"]'));
    await wait(20);
    let scadConAnnotazioni = window.derivati().periodiche.find(s => s.id === primaScadenza.id);
    assert(scadConAnnotazioni.annotazioni.length === 1, `attesa 1 annotazione dopo il primo inserimento, trovate ${scadConAnnotazioni.annotazioni.length}`);
    assert(scadConAnnotazioni.annotazioni[0].testo === 'Bilancio depositato in ritardo; versamento imposte in ritardo.', 'testo della prima annotazione non salvato correttamente');
    assert(scadConAnnotazioni.annotazioni[0].data === window.oggiISO(), 'data automatica della prima annotazione non corretta');
    assert(scadConAnnotazioni.annotazioni[0].autore === window.operatoreCorrente(), `autore dell'annotazione non registrato correttamente (atteso "${window.operatoreCorrente()}", trovato "${scadConAnnotazioni.annotazioni[0].autore}")`);
    assert(q('#scadNuovaAnnotazione').value === '', 'il campo annotazione non si svuota dopo l\'inserimento (il modale va ricostruito da capo)');

    setVal(q('#scadNuovaAnnotazione'), 'Il cliente vuole compensare le imposte col credito IVA del modello TR in corso di invio.');
    click(q('[data-action="scad-aggiungi-annotazione"]'));
    await wait(20);
    scadConAnnotazioni = window.derivati().periodiche.find(s => s.id === primaScadenza.id);
    assert(scadConAnnotazioni.annotazioni.length === 2, `attese 2 annotazioni dopo il secondo inserimento, trovate ${scadConAnnotazioni.annotazioni.length}`);
    const righeAnnotazioniDom = qa('[data-action="scad-elimina-annotazione"]');
    assert(righeAnnotazioniDom.length === 2, `attese 2 righe di annotazione nel modale, trovate ${righeAnnotazioniDom.length}`);
    // la più recente (seconda aggiunta) deve comparire per prima
    assert(righeAnnotazioniDom[0].closest('.subtask-row').textContent.includes('credito IVA'), 'l\'annotazione più recente non compare per prima nell\'elenco');
    assert(righeAnnotazioniDom[0].closest('.subtask-row').textContent.includes(window.operatoreCorrente()), 'l\'autore non compare nell\'intestazione della riga di annotazione (task: storico con autore+data come Task Team)');
    console.log('=== Annotazioni scadenza: aggiunta (con campo vuoto ignorato), ordine più-recente-prima, svuotamento campo dopo l\'inserimento, autore mostrato OK');

    // l'esportazione per MCP deve includere le annotazioni, così Claude può vederle se richiesto
    const vistaMCP = window.esportaVistaMCP();
    const scadInVistaMCP = vistaMCP.scadenze.find(s => s.id === primaScadenza.id);
    assert(scadInVistaMCP && Array.isArray(scadInVistaMCP.annotazioni) && scadInVistaMCP.annotazioni.length === 2, 'le annotazioni non compaiono nella vista esportata per MCP');
    assert(scadInVistaMCP.annotazioni.some(a => a.testo.includes('credito IVA')), 'il testo delle annotazioni nella vista MCP non corrisponde');
    assert(scadInVistaMCP.annotazioni.every(a => a.autore === window.operatoreCorrente()), 'l\'autore delle annotazioni non compare nella vista esportata per MCP');
    console.log('=== Annotazioni scadenza: presenti nella vista esportata per MCP (con autore) OK');

    // eliminazione di un'annotazione (quella più recente, mostrata per prima)
    click(righeAnnotazioniDom[0]);
    await wait(20);
    scadConAnnotazioni = window.derivati().periodiche.find(s => s.id === primaScadenza.id);
    assert(scadConAnnotazioni.annotazioni.length === 1, `attesa 1 annotazione dopo l'eliminazione, trovate ${scadConAnnotazioni.annotazioni.length}`);
    assert(scadConAnnotazioni.annotazioni[0].testo.includes('Bilancio depositato'), 'è stata eliminata l\'annotazione sbagliata');
    console.log('=== Annotazioni scadenza: eliminazione di una singola voce OK');

    click(q('[data-action="chiudi-modal"]'));
    await wait(20);
    // pulizia: rimuove le annotazioni residue per non alterare lo stato demo per i test successivi
    window.getSTATE().scadenzeOverrides[primaScadenza.id] = Object.assign({}, window.getSTATE().scadenzeOverrides[primaScadenza.id], { annotazioni: [] });
    window.salvaStato(); window.render();
    await wait(20);
  }

  // ---------- 11f) Step precisi con responsabile per bilanci e dichiarazioni ----------
  assert(window.SOTTO_DICHIARAZIONE_STANDARD.length === 7, `attesi 7 step standard di dichiarazione, trovati ${window.SOTTO_DICHIARAZIONE_STANDARD.length}`);
  ['Calcolo imposte dovute', 'Comunicazione importi dovuti al cliente', 'Predisposizione F24 di versamento'].forEach(nomeStep => {
    assert(window.SOTTO_DICHIARAZIONE_STANDARD.includes(nomeStep), `step "${nomeStep}" mancante nella checklist standard delle dichiarazioni`);
  });
  ['DICH_IVA_ANNUALE', 'REDDITI_FORFETTARI', 'REDDITI_SEMPLIFICATI', 'REDDITI_ORDINARI', 'REDDITI_ENC'].forEach(chiave => {
    const def = window.DEFAULT_CATALOGO_ANNUALE.find(d => d.chiave === chiave);
    assert(def.sotto.length === 7, `${chiave}: attesi 7 step di dichiarazione, trovati ${def.sotto.length}`);
  });
  // regressione: ogni cliente attivo in regime "Ordinario" deve avere la propria dichiarazione
  // redditi (REDDITI_ORDINARI) tra gli adempimenti applicabili — in precedenza REDDITI_ORDINARI
  // non era mai assegnato a nessun cliente demo, un vero e proprio buco di completezza (un
  // cliente in regime ordinario dichiara sempre i redditi, non solo IVA/bilancio/770/CU).
  const clientiOrdinariAttivi = window.getSTATE().clienti.filter(c => c.regimeFiscale === 'Ordinario' && c.stato !== 'cessato');
  assert(clientiOrdinariAttivi.length >= 10, `attesi almeno 10 clienti demo in regime Ordinario, trovati ${clientiOrdinariAttivi.length}`);
  const senzaRedditiOrdinari = clientiOrdinariAttivi.filter(c => !(c.adempimentiAnnualiApplicabili || []).includes('REDDITI_ORDINARI'));
  assert(senzaRedditiOrdinari.length === 0, `clienti in regime Ordinario senza dichiarazione redditi tra gli adempimenti: ${senzaRedditiOrdinari.map(c=>c.ragioneSociale).join(', ')}`);
  console.log(`=== Copertura REDDITI_ORDINARI: tutti i ${clientiOrdinariAttivi.length} clienti attivi in regime Ordinario hanno la dichiarazione redditi tra gli adempimenti applicabili`);
  // Sotto-task del Bilancio scelti esplicitamente da Matteo (non i 7 step standard di
  // dichiarazione): raccolta -> chiusura contabile -> calcolo imposte -> condivisione col
  // cliente -> predisposizione pratica -> deposito. Categoria spostata da "Adempimenti
  // contabili" a "Adempimenti camerali/societari" (si deposita in CCIAA, come il diritto
  // camerale, non è solo una scrittura contabile).
  const bilancioDef = window.DEFAULT_CATALOGO_ANNUALE.find(d => d.chiave === 'BILANCIO');
  assert(bilancioDef.sotto.length === 6, `BILANCIO: attesi 6 step, trovati ${bilancioDef.sotto.length}`);
  assert(bilancioDef.sotto.some(s => s.toLowerCase().includes('raccolta')), 'BILANCIO: manca lo step di raccolta documenti');
  assert(bilancioDef.sotto.some(s => s.toLowerCase().includes('chiusura contabile')), 'BILANCIO: manca lo step di chiusura contabile dell\'anno');
  assert(bilancioDef.sotto.some(s => s.toLowerCase().includes('calcolo imposte')), 'BILANCIO: manca lo step di calcolo imposte');
  assert(bilancioDef.sotto.some(s => s.toLowerCase().includes('cliente')), 'BILANCIO: manca uno step esplicito di condivisione col cliente');
  assert(bilancioDef.sotto.some(s => s.toLowerCase().includes('predisposizione pratica')), 'BILANCIO: manca lo step di predisposizione pratica');
  assert(bilancioDef.sotto.some(s => s.toLowerCase() === 'deposito'), 'BILANCIO: manca lo step di deposito');
  assert(bilancioDef.tipo === 'Adempimenti camerali/societari', `BILANCIO dovrebbe essere categorizzato come "Adempimenti camerali/societari" (si deposita in CCIAA), trovato "${bilancioDef.tipo}"`);
  // verifica end-to-end: apri un adempimento "dichiarazione" con 7 step, assegna responsabili diversi
  // a due step distinti (chi fa cosa) e verifica che restino indipendenti l'uno dall'altro
  click(q('[data-nav="annuali"]'));
  await wait(20);
  setVal(q('[data-action="ann-filtro-tipo"]'), 'REDDITI_ORDINARI');
  await wait(20);
  const toggleRedditiOrdinari = q('[data-action="ann-toggle-expand"]');
  assert(toggleRedditiOrdinari, 'nessun adempimento "Dichiarazione redditi ordinari" trovato per il test degli step con responsabile (ogni cliente in regime Ordinario deve avercelo tra gli adempimenti applicabili)');
  const idRedditiOrdinari = toggleRedditiOrdinari.dataset.id;
  click(toggleRedditiOrdinari);
  await wait(20);
  let respSottoEl = qa(`[data-action="ann-resp-sotto"][data-id="${idRedditiOrdinari}"]`);
  assert(respSottoEl.length === 7, `attesi 7 selettori responsabile (uno per step), trovati ${respSottoEl.length}`);
  const [respA, respB] = window.getSTATE().meta.responsabili;
  assert(respA && respB, 'servono almeno due responsabili in anagrafica studio per questo test');
  setVal(respSottoEl[0], respA); // step 0 "Raccolta dati e documentazione" -> respA
  await wait(20);
  respSottoEl = qa(`[data-action="ann-resp-sotto"][data-id="${idRedditiOrdinari}"]`);
  setVal(respSottoEl[4], respB); // step 4 "Predisposizione F24 di versamento" -> respB
  await wait(20);
  const redditiOrdinariAgg = window.derivati().annuali.find(a => a.id === idRedditiOrdinari);
  assert(redditiOrdinariAgg.sotto[0].responsabile === respA, 'responsabile del primo step non assegnato correttamente');
  assert(redditiOrdinariAgg.sotto[4].responsabile === respB, 'responsabile del quinto step (F24) non assegnato correttamente');
  assert(redditiOrdinariAgg.sotto[0].responsabile !== redditiOrdinariAgg.sotto[4].responsabile, 'i responsabili di step diversi non sono indipendenti tra loro (bug "chi fa cosa")');
  assert(redditiOrdinariAgg.sotto[1].responsabile !== respB || redditiOrdinariAgg.sotto[1].nome !== redditiOrdinariAgg.sotto[4].nome, 'assegnazione responsabile trapelata su uno step non toccato');
  console.log('=== Step precisi con responsabile per bilanci e dichiarazioni: 7 step su dichiarazioni, step estesi su BILANCIO, responsabili per singolo step indipendenti ("chi fa cosa") OK');
  // pulizia filtri per non condizionare i test successivi
  setVal(q('[data-action="ann-filtro-tipo"]'), 'Tutti');
  await wait(20);

  // ---------- 11g) Recupero da localStorage corrotto (audit di affidabilità) ----------
  // Prima della correzione, un JSON.parse fallito in caricaStato() resettava lo stato a vuoto
  // SENZA avvisare l'utente né preservare i dati grezzi: il primo salvaStato() successivo (da
  // un qualsiasi click) avrebbe sovrascritto per sempre l'unica copia dei dati. Verifica che ora:
  // (1) i dati grezzi corrotti vengano preservati sotto una chiave di backup dedicata,
  // (2) l'utente venga avvisato con un alert bloccante (non un semplice toast ignorabile),
  // (3) lo stato in memoria comunque riparta pulito (non crashi l'app).
  const statoPrimaCorruzione = window.getSTATE();
  const jsonCorrotto = '{ "clienti": [ questo non è JSON valido';
  window.localStorage.setItem(window.LS_KEY, jsonCorrotto);
  const chiaviPrimaRecupero = Object.keys(window.localStorage).filter(k => k.startsWith(window.LS_KEY + '_corrotto_'));
  let alertCatturato = null;
  const alertOriginale = window.alert;
  window.alert = (msg) => { alertCatturato = msg; };
  window.caricaStato();
  window.alert = alertOriginale;
  assert(alertCatturato && alertCatturato.toLowerCase().includes('corrott'), 'nessun avviso mostrato all\'utente dopo il caricamento di dati corrotti');
  const chiaviDopoRecupero = Object.keys(window.localStorage).filter(k => k.startsWith(window.LS_KEY + '_corrotto_'));
  assert(chiaviDopoRecupero.length === chiaviPrimaRecupero.length + 1, 'nessuna copia di backup dei dati corrotti salvata in localStorage');
  const chiaveBackup = chiaviDopoRecupero.find(k => !chiaviPrimaRecupero.includes(k));
  assert(window.localStorage.getItem(chiaveBackup) === jsonCorrotto, 'la copia di backup non contiene i dati grezzi originali');
  assert(Array.isArray(window.getSTATE().clienti) && window.getSTATE().clienti.length === 0, 'lo stato in memoria dopo un caricamento corrotto dovrebbe ripartire vuoto, non a metà o con dati sporchi');
  // pulizia: rimuove la chiave di backup di test e ripristina lo stato demo per i test successivi
  window.localStorage.removeItem(chiaveBackup);
  window.setSTATE(statoPrimaCorruzione);
  window.salvaStato();
  window.render();
  await wait(20);
  console.log('=== Recupero da localStorage corrotto: dati grezzi preservati in backup, utente avvisato, stato ripartito pulito senza crash OK');

  // ---------- 11h) Paginazione liste lunghe (fix da audit "occhi da commercialista") ----------
  // Misurato con uno stress test dedicato: con 130 clienti sintetici la vista Scadenze generava
  // 1595 righe e il render() ci metteva oltre 5 secondi perché stampava tutto il DOM senza
  // paginare. Verifica che l'helper paginaLista() tagli correttamente le pagine (unit-level) e
  // che i controlli prev/next in UI funzionino, resettando la pagina a 1 quando cambia un filtro.
  {
    const finto = Array.from({ length: 123 }, (_, i) => i);
    window.resetPagina('__test__');
    let p = window.paginaLista('__test__', finto, 50);
    assert(p.pagina.length === 50 && p.pagina[0] === 0 && p.pagina[49] === 49, 'prima pagina non contiene i primi 50 elementi attesi');
    assert(p.totalePagine === 3, 'totale pagine calcolato male per 123 elementi da 50');
    window.PAGINE['__test__'] = 3;
    p = window.paginaLista('__test__', finto, 50);
    assert(p.pagina.length === 23 && p.pagina[0] === 100, 'ultima pagina parziale non corretta');
    window.PAGINE['__test__'] = 99; // oltre il limite: deve essere agganciata all'ultima pagina valida
    p = window.paginaLista('__test__', finto, 50);
    assert(p.numeroPagina === 3, 'una pagina fuori range non viene riportata entro i limiti validi');
    delete window.PAGINE['__test__'];
    console.log('=== Paginazione (unit): taglio pagine, ultima pagina parziale, pagina fuori range corretti OK');
  }

  click(q('[data-nav="scadenze"]'));
  await wait(20);
  // pulizia filtri: SCAD_FILTRO è stato globale che sopravvive tra le sezioni di test (vedi 11e)
  setVal(q('[data-action="scad-filtro-bucket"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-stato"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-resp"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-tipo"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-q"]'), '');
  await wait(20);

  const totalePeriodiche = window.derivati().periodiche.length;
  assert(totalePeriodiche > window.RIGHE_PER_PAGINA, `servono più di ${window.RIGHE_PER_PAGINA} scadenze nei dati demo per testare la paginazione a schermo (trovate ${totalePeriodiche}) — se il catalogo demo si riduce, questo test va rivisto`);

  const righeTbody1 = qa('table.compact tbody tr');
  assert(righeTbody1.length === window.RIGHE_PER_PAGINA, `la prima pagina di Scadenze dovrebbe mostrare esattamente ${window.RIGHE_PER_PAGINA} righe, trovate ${righeTbody1.length}`);
  const primaRigaPag1 = righeTbody1[0].textContent;

  const btnNextScad = q('[data-action="pagina-next"][data-vista="scadenze"]');
  assert(btnNextScad, 'controllo "pagina successiva" non trovato in vista Scadenze nonostante ci siano più di 50 righe');
  assert(!btnNextScad.disabled, 'pulsante pagina successiva disabilitato sulla prima pagina pur avendo altre pagine');
  click(btnNextScad);
  await wait(20);
  assert(window.PAGINE.scadenze === 2, 'il click su "pagina successiva" non ha avanzato lo stato di paginazione');
  const righeTbody2 = qa('table.compact tbody tr');
  assert(righeTbody2.length > 0 && righeTbody2[0].textContent !== primaRigaPag1, 'la seconda pagina mostra le stesse righe della prima: la paginazione non è applicata al render');

  const btnPrevScad = q('[data-action="pagina-prev"][data-vista="scadenze"]');
  click(btnPrevScad);
  await wait(20);
  assert(window.PAGINE.scadenze === 1, 'il click su "pagina precedente" non è tornato alla prima pagina');
  const righeTbody1bis = qa('table.compact tbody tr');
  assert(righeTbody1bis[0].textContent === primaRigaPag1, 'tornando alla pagina 1 le righe mostrate non coincidono con quelle originarie');

  // un cambio filtro deve azzerare la pagina anche partendo da una pagina avanzata
  click(q('[data-action="pagina-next"][data-vista="scadenze"]'));
  await wait(20);
  assert(window.PAGINE.scadenze === 2, 'setup del sotto-test: dovremmo essere sulla pagina 2 prima di cambiare filtro');
  setVal(q('[data-action="scad-filtro-stato"]'), 'Da fare');
  await wait(20);
  assert(window.PAGINE.scadenze === 1, 'cambiare un filtro non ha azzerato la pagina corrente (si resterebbe bloccati su una pagina 2+ che magari non esiste più coi nuovi filtri)');
  // ripristina i filtri per non condizionare i test successivi
  setVal(q('[data-action="scad-filtro-stato"]'), 'Tutti');
  await wait(20);

  // filtri data "Scadenza da/a": NON devono reagire né a "input" né a "change" (un <input
  // type="date"> nativo può emettere "change" già al primo carattere digitato nel segmento anno,
  // ancora prima che la data sia completa/valida — un render() in quel momento distruggerebbe e
  // ricreerebbe il campo a metà digitazione, facendo perdere il focus e impedendo di scrivere
  // l'anno per intero: bug reale segnalato da Matteo). Il filtro si applica solo quando il campo
  // perde davvero il focus ("focusout", l'evento che bubbla al posto di "blur"), quando il valore
  // è ormai quello finale — da quel momento in poi un render() non interrompe più alcuna digitazione.
  const nRigheBase = qa('table.compact tbody tr').length;
  assert(nRigheBase > 0, 'setup del sotto-test filtri data: nessuna riga di scadenze da filtrare');
  // ogni fire() qui sotto ri-cerca l'elemento perché il render() successivo a "focusout" ricrea
  // l'intero DOM del content (il vecchio riferimento diventerebbe un nodo staccato, il cui evento
  // non risalirebbe più fino a document.body dove è agganciato il listener delegato)
  q('[data-action="scad-filtro-data-da"]').value = '2099-01-01'; // data lontanissima nel futuro: se applicato, azzera i risultati
  fire(q('[data-action="scad-filtro-data-da"]'), 'input');
  fire(q('[data-action="scad-filtro-data-da"]'), 'change');
  await wait(20);
  assert(qa('table.compact tbody tr').length === nRigheBase, 'né "input" né "change" su "Scadenza da" devono filtrare da soli (altrimenti un re-render a metà digitazione dell\'anno interromperebbe la scrittura, come nel bug segnalato) — solo "focusout" deve farlo');
  q('[data-action="scad-filtro-data-da"]').value = '2099-01-01';
  fire(q('[data-action="scad-filtro-data-da"]'), 'focusout');
  await wait(20);
  assert(qa('table.compact tbody tr').length < nRigheBase, 'l\'evento "focusout" (campo che perde il focus) su "Scadenza da" con una data lontanissima nel futuro deve ridurre i risultati mostrati');
  q('[data-action="scad-filtro-data-da"]').value = '';
  fire(q('[data-action="scad-filtro-data-da"]'), 'focusout');
  await wait(20);
  assert(qa('table.compact tbody tr').length === nRigheBase, 'svuotare "Scadenza da" non ripristina tutte le righe');
  q('[data-action="scad-filtro-data-a"]').value = '2000-01-01'; // data lontanissima nel passato: se applicato, azzera i risultati
  fire(q('[data-action="scad-filtro-data-a"]'), 'input');
  fire(q('[data-action="scad-filtro-data-a"]'), 'change');
  await wait(20);
  assert(qa('table.compact tbody tr').length === nRigheBase, 'né "input" né "change" su "Scadenza a" devono filtrare da soli');
  q('[data-action="scad-filtro-data-a"]').value = '2000-01-01';
  fire(q('[data-action="scad-filtro-data-a"]'), 'focusout');
  await wait(20);
  assert(qa('table.compact tbody tr').length === 0, 'l\'evento "focusout" su "Scadenza a" con una data lontanissima nel passato deve azzerare i risultati mostrati');
  q('[data-action="scad-filtro-data-a"]').value = '';
  fire(q('[data-action="scad-filtro-data-a"]'), 'focusout');
  await wait(20);
  assert(qa('table.compact tbody tr').length === nRigheBase, 'svuotare "Scadenza a" non ripristina tutte le righe');
  console.log('=== Filtri "Scadenza da/a": reagiscono solo a "focusout" (mai a metà digitazione, nemmeno al "change" prematuro del segmento anno), filtrano correttamente OK');

  // liste sotto soglia (es. i 24 clienti demo, ben sotto RIGHE_PER_PAGINA=50): nessun controllo di
  // paginazione superfluo a schermo.
  click(q('[data-nav="clienti"]'));
  await wait(20);
  assert(window.getSTATE().clienti.filter(c => c.stato !== 'cessato').length <= window.RIGHE_PER_PAGINA, 'assunzione del test non più valida: i clienti demo attivi superano ora RIGHE_PER_PAGINA, rivedere il test');
  assert(!q('[data-action="pagina-prev"][data-vista="clienti"]'), 'controlli di paginazione mostrati anche quando la lista clienti sta tutta in una pagina sola');
  console.log('=== Paginazione (UI): 50 righe per pagina su Scadenze, prev/next funzionanti, reset pagina al cambio filtro, nessun controllo superfluo sotto soglia OK');

  // ---------- 11i) Ricerca globale (Ctrl/Cmd+K) ----------
  // Fix dall'audit "occhi da commercialista": con 150 clienti, trovare "quel cliente/quella
  // comunicazione/quel documento" senza sapere in anticipo dove cercare era impossibile.
  {
    assert(window.risultatiRicercaGlobale('a').length === 0, 'la ricerca con un solo carattere dovrebbe restituire zero risultati (soglia minima 2 caratteri)');
    const clientiDemo = window.getSTATE().clienti;
    assert(clientiDemo.length > 0, 'servono clienti demo per testare la ricerca globale');
    const clienteTest = clientiDemo[0];
    const frammento = clienteTest.ragioneSociale.slice(0, 6);
    const risultatiCliente = window.risultatiRicercaGlobale(frammento);
    const hitCliente = risultatiCliente.find(r => r.categoria === 'Clienti' && r.titolo === clienteTest.ragioneSociale);
    assert(hitCliente, `ricerca "${frammento}" non trova il cliente "${clienteTest.ragioneSociale}" nella categoria Clienti`);
    assert(typeof hitCliente.azione === 'function', 'il risultato di ricerca non ha un\'azione di navigazione eseguibile');
    hitCliente.azione();
    await wait(20);
    assert(window.document.getElementById('pageTitle').textContent === 'Scheda cliente', 'cliccare un risultato Clienti dovrebbe portare alla scheda cliente 360°');

    // categoria Scadenze: cerca SOLO sul nome dell'adempimento, mai genericamente sul nome
    // cliente (altrimenti un cliente con 12 scadenze/anno inonderebbe i risultati di righe
    // ridondanti — vedi nota di design sopra risultatiRicercaGlobale)
    const risultatiIva = window.risultatiRicercaGlobale('IVA');
    assert(risultatiIva.some(r => r.categoria === 'Scadenze'), 'ricerca "IVA" non trova nessuna scadenza (atteso: scadenze IVA nei dati demo)');
    const risultatiNomeCliente = window.risultatiRicercaGlobale(clienteTest.ragioneSociale);
    assert(!risultatiNomeCliente.some(r => r.categoria === 'Scadenze'), 'cercare il nome di un cliente non deve restituire anche le sue scadenze in categorie separate (rumore)');
    console.log('=== Ricerca globale (unit): soglia 2 caratteri, categoria Clienti trovata e navigabile, categoria Scadenze filtra solo sul proprio testo OK');
  }

  click(q('[data-action="apri-ricerca-globale"]'));
  await wait(20);
  assert(q('#ricercaInput'), 'la ricerca globale non si apre cliccando il pulsante in topbar');
  setVal(q('#ricercaInput'), window.getSTATE().clienti[0].ragioneSociale.slice(0, 6));
  await wait(20);
  const rigaRisultatoRicerca = q('[data-action="ricerca-apri"]');
  assert(rigaRisultatoRicerca, 'nessuna riga di risultato mostrata nel modale di ricerca dopo aver digitato');
  click(rigaRisultatoRicerca);
  await wait(20);
  assert(!q('#ricercaInput'), 'il modale di ricerca dovrebbe chiudersi dopo aver aperto un risultato');

  // scorciatoia da tastiera: Ctrl/Cmd+K apre la ricerca da qualsiasi punto dell'app, Esc la chiude
  click(q('[data-nav="dashboard"]'));
  await wait(20);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await wait(20);
  assert(q('#ricercaInput'), 'Ctrl+K non apre la ricerca globale');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert(!q('#ricercaInput'), 'Esc non chiude la ricerca globale');
  console.log('=== Ricerca globale (UI): apertura da pulsante e da Ctrl+K, digitazione live, click su risultato naviga e chiude, Esc chiude OK');

  // ---------- 11j) Azioni bulk su Scadenze (fix da audit "occhi da commercialista") ----------
  // Prima si poteva cambiare stato/responsabile/step di controllo solo una riga alla volta:
  // con 150 clienti e magari 30 dichiarazioni forfettarie da segnare "Comunicato al cliente"
  // insieme, era un lavoro ripetitivo enorme nei periodi di picco (LIPE, F24, dichiarazioni).
  click(q('[data-nav="scadenze"]'));
  await wait(20);
  setVal(q('[data-action="scad-filtro-bucket"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-stato"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-resp"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-tipo"]'), 'Tutti');
  setVal(q('[data-action="scad-filtro-q"]'), '');
  window.SCAD_SELEZIONATE.clear();
  window.render();
  await wait(20);

  assert(!q('[data-action="scad-bulk-deseleziona"]'), 'la barra delle azioni bulk non dovrebbe comparire senza nessuna riga selezionata');
  const checkboxRighe = qa('[data-action="scad-toggle-sel"]');
  assert(checkboxRighe.length >= 2, 'servono almeno 2 scadenze nella prima pagina per testare la selezione multipla');
  const idSelezionati = [checkboxRighe[0].dataset.id, checkboxRighe[1].dataset.id];
  click(checkboxRighe[0]);
  await wait(20);
  click(q(`[data-action="scad-toggle-sel"][data-id="${idSelezionati[1]}"]`)); // ri-query: il render dopo il primo click ha ricreato il DOM
  await wait(20);
  assert(window.SCAD_SELEZIONATE.size === 2, `dopo 2 click di selezione ci si aspettavano 2 righe selezionate, trovate ${window.SCAD_SELEZIONATE.size}`);
  assert(q('[data-action="scad-bulk-deseleziona"]'), 'la barra delle azioni bulk non compare pur avendo righe selezionate');
  assert(q('#scadBulkBar').textContent.includes('2 selezionate'), 'il conteggio "N selezionate" non è corretto o non è mostrato');

  // "seleziona tutte le filtrate" deve operare sull'INTERA lista filtrata, non solo sulla pagina visibile
  const totaleFiltrate = window.scadenzeFiltrate().length;
  click(q('[data-action="scad-seleziona-tutti-filtrati"]'));
  await wait(20);
  assert(window.SCAD_SELEZIONATE.size === totaleFiltrate, `"seleziona tutte" dovrebbe selezionare tutte le ${totaleFiltrate} scadenze filtrate (anche oltre la pagina corrente), trovate ${window.SCAD_SELEZIONATE.size}`);

  click(q('[data-action="scad-bulk-deseleziona"]'));
  await wait(20);
  assert(window.SCAD_SELEZIONATE.size === 0, '"deseleziona tutte" non ha svuotato la selezione');
  assert(!q('[data-action="scad-bulk-deseleziona"]'), 'la barra bulk dovrebbe sparire dopo aver deselezionato tutto');

  // riseleziona le stesse 2 righe per testare le applicazioni bulk una per una
  const riseleziona = () => { idSelezionati.forEach(id => { const cb = q(`[data-action="scad-toggle-sel"][data-id="${id}"]`); if (cb && !cb.checked) click(cb); }); };
  riseleziona();
  await wait(20);
  assert(window.SCAD_SELEZIONATE.size === 2, 'riselezione delle 2 scadenze di test non riuscita prima del test bulk-stato');

  setVal(q('#scadBulkStato'), 'Calcolato');
  click(q('[data-action="scad-bulk-stato"]'));
  await wait(20);
  const dopoBulkStato = window.derivati().tutteScadenze.filter(s => idSelezionati.includes(s.id));
  assert(dopoBulkStato.length === 2 && dopoBulkStato.every(s => s.stato === 'Calcolato'), 'il cambio di stato bulk non è stato applicato a entrambe le scadenze selezionate');
  assert(window.SCAD_SELEZIONATE.size === 0, 'la selezione dovrebbe azzerarsi dopo aver applicato un\'azione bulk');

  riseleziona();
  await wait(20);
  const respTest = window.getSTATE().meta.responsabili[0];
  setVal(q('#scadBulkResp'), respTest);
  click(q('[data-action="scad-bulk-resp"]'));
  await wait(20);
  const dopoBulkResp = window.derivati().tutteScadenze.filter(s => idSelezionati.includes(s.id));
  assert(dopoBulkResp.every(s => s.responsabile === respTest), 'l\'assegnazione responsabile bulk non è stata applicata a entrambe le scadenze selezionate');

  riseleziona();
  await wait(20);
  const stepTest = window.STEP_CONTROLLO_IMPOSTA[0];
  setVal(q('#scadBulkStep'), stepTest);
  click(q('[data-action="scad-bulk-step"]'));
  await wait(20);
  const dopoBulkStep = window.derivati().tutteScadenze.filter(s => idSelezionati.includes(s.id));
  assert(dopoBulkStep.every(s => { const st = (s.step||[]).find(x => x.nome === stepTest); return st && st.completato; }), `lo step "${stepTest}" non risulta completato su entrambe le scadenze dopo l'applicazione bulk`);

  riseleziona();
  await wait(20);
  const nSollecitiPrima = window.derivati().tutteScadenze.filter(s => idSelezionati.includes(s.id)).map(s => (s.solleciti||[]).length);
  click(q('[data-action="scad-bulk-sollecito"]'));
  await wait(20);
  assert(q('#formSollecitoBulk'), 'il modale del sollecito bulk non si è aperto');
  setVal(q('#solBulkNota'), 'test sollecito bulk');
  click(q('[data-action="salva-sollecito-bulk"]'));
  await wait(20);
  assert(!q('#formSollecitoBulk'), 'il modale del sollecito bulk dovrebbe chiudersi dopo il salvataggio');
  const nSollecitiDopo = window.derivati().tutteScadenze.filter(s => idSelezionati.includes(s.id)).map(s => (s.solleciti||[]).length);
  assert(nSollecitiDopo.every((n, i) => n === nSollecitiPrima[i] + 1), 'il sollecito bulk non ha aggiunto esattamente un sollecito a ciascuna delle scadenze selezionate');
  assert(window.SCAD_SELEZIONATE.size === 0, 'la selezione dovrebbe azzerarsi anche dopo il sollecito bulk');
  console.log('=== Azioni bulk su Scadenze: selezione multipla, "seleziona tutte le filtrate" su tutte le pagine, bulk stato/responsabile/step/sollecito, reset selezione dopo ogni azione OK');

  // pulizia: ripristina gli stati/responsabile toccati dal test per non alterare i dati demo per i test successivi
  idSelezionati.forEach(id => window.aggiornaScadenza(id, { stato: 'Da fare' }));
  window.render();
  await wait(20);

  // ---------- 11k) Sync condiviso multi-postazione (fix da audit "occhi da commercialista") ----------
  // window.claude/db esistono solo quando la pagina gira come Artifact pubblicato su claude.ai
  // con la capability "db" — qui in jsdom (come in un file .html locale aperto normalmente)
  // window.claude non esiste affatto: verifica che tutto il modulo di sync si disattivi da solo
  // senza errori, e che localStorage/il resto dell'app restino del tutto invariati.
  {
    assert(typeof window.claude === 'undefined', 'assunzione del test non valida: window.claude non dovrebbe esistere in questo ambiente di test');
    let lanciato = false;
    try { await window.inizializzaSyncCondiviso(); } catch (e) { lanciato = true; }
    assert(!lanciato, 'inizializzaSyncCondiviso() non dovrebbe lanciare eccezioni quando window.claude non è disponibile (es. file locale)');
    const badge = q('#syncBadge');
    assert(badge, 'il badge di stato sync non è presente in topbar');
    assert(badge.textContent === '', 'il badge di sync dovrebbe restare vuoto quando non c\'è alcun backend condiviso disponibile (nessun falso positivo mostrato all\'utente)');

    // normalizzaStatoCaricato: stessa funzione usata sia per localStorage sia per un documento
    // condiviso ricevuto dal backend — deve riempire tutti i campi mancanti con i default
    const parziale = { clienti: [{ id: 'probe', ragioneSociale: 'Prova' }] };
    const normalizzato = window.normalizzaStatoCaricato(parziale);
    ['meta', 'scadenzeOverrides', 'ritenuteRighe', 'annualiOverrides', 'onboarding', 'comunicazioni', 'taskTeam', 'f24', 'soci', 'catalogoPeriodico', 'catalogoAnnuale'].forEach(campo => {
      assert(normalizzato[campo] !== undefined, `normalizzaStatoCaricato non ha riempito il campo mancante "${campo}" con il default`);
    });
    assert(normalizzato.clienti.length === 1 && normalizzato.clienti[0].id === 'probe', 'normalizzaStatoCaricato ha perso i dati presenti nell\'input invece di limitarsi a riempire i campi mancanti');
    assert(Array.isArray(normalizzato.meta.responsabili) && normalizzato.meta.responsabili.length > 0, 'normalizzaStatoCaricato non ha applicato i default di meta su uno stato che non li aveva');

    // guardia anti-perdita-di-battitura: un aggiornamento remoto in coda non deve essere applicato
    // mentre l'utente sta scrivendo in un campo di testo, per non cancellargli a metà la frase
    click(q('[data-nav="clienti"]'));
    await wait(20);
    const campoRicerca = q('[data-action="cli-filtro-q"]');
    campoRicerca.focus();
    const statoRemotoFinto = window.normalizzaStatoCaricato({ clienti: [{ id: 'remoto-finto', ragioneSociale: 'Cliente Remoto Finto' }] });
    window.setStatoRemotoPendenteTest(statoRemotoFinto);
    window.applicaStatoRemotoSeLibero();
    await wait(20);
    assert(window.getSTATE().clienti.every(c => c.id !== 'remoto-finto'), 'un aggiornamento remoto è stato applicato mentre si stava scrivendo in un campo: rischio concreto di perdere quello che si stava digitando');
    campoRicerca.blur();
    await wait(80); // il listener globale di blur riprova con un piccolo setTimeout
    assert(window.getSTATE().clienti.some(c => c.id === 'remoto-finto'), 'l\'aggiornamento remoto rimasto in coda non è stato applicato dopo che il campo ha perso il focus');
    console.log('=== Sync condiviso: nessun errore/falso positivo senza backend disponibile, normalizzazione stato completa, aggiornamento remoto rimandato mentre si scrive e applicato al blur OK');
    // ripristina lo stato demo pulito per non alterare i test successivi
    window.caricaStato();
    window.render();
    await wait(20);
  }

  // ---------- 11l) Backup scaricabile: usa la capability "downloads" quando disponibile ----------
  // Verificato dal vivo (non indovinato): downloads.save({filename, data}) risolve {status:'saved'}
  // sia con data stringa sia Blob, e rifiuta con {code:'declined'} se l'utente annulla dal proprio
  // dialogo di salvataggio nativo. Qui window.claude non esiste (come su un file locale aperto
  // normalmente), quindi lo mockiamo temporaneamente per testare il ramo capability senza un vero
  // Artifact pubblicato — poi lo ripristiniamo esattamente com'era.
  {
    assert(typeof window.claude === 'undefined', 'assunzione del test non valida: window.claude non dovrebbe esistere prima del mock');
    const chiamateSalva = [];
    window.claude = {
      use: async (nome) => nome === 'downloads' ? { save: async (opts) => { chiamateSalva.push(opts); return { status: 'saved' }; } } : null,
    };
    const ok = await window.salvaFileScaricabile('prova.json', '{"a":1}');
    assert(ok === true, 'salvaFileScaricabile dovrebbe restituire true quando downloads.save() va a buon fine');
    assert(chiamateSalva.length === 1 && chiamateSalva[0].filename === 'prova.json' && chiamateSalva[0].data === '{"a":1}', 'salvaFileScaricabile non ha chiamato downloads.save() con filename/data attesi');

    window.claude.use = async (nome) => nome === 'downloads' ? { save: async () => { const e = new Error('viewer declined'); e.code = 'declined'; throw e; } } : null;
    const okAnnullato = await window.salvaFileScaricabile('prova2.json', '{}');
    assert(okAnnullato === false, 'un annullamento del viewer (code "declined") dovrebbe restituire false, non propagarsi come errore');

    delete window.claude;
    assert(typeof window.claude === 'undefined', 'pulizia del mock di window.claude non riuscita: window.claude non dovrebbe più esistere dopo il test');
    console.log('=== Backup scaricabile: usa downloads.save() quando disponibile (verificato dal vivo), annullamento utente gestito senza errori, mock ripulito correttamente OK');
  }

  // ---------- 11m) Import clienti da Excel/CSV ----------
  // Il motore di import (elaboraImportClienti/clienteDaRigaImport) è testato qui direttamente con
  // dati sintetici a forma di array-di-array, esattamente come arrivano da XLSX.utils.sheet_to_json
  // o da parseCSV — non serve un vero file .xlsx per verificarne la logica.
  {
    click(q('[data-nav="clienti"]'));
    await wait(20);
    assert(q('[data-action="scarica-template-clienti"]'), 'manca il pulsante "Scarica template Excel" nella vista Clienti');
    assert(q('[data-action="importa-clienti-file"]'), 'manca l\'input file "Importa clienti (Excel/CSV)" nella vista Clienti');
    assert(q('[data-action="importa-clienti-file"]').tagName === 'INPUT' && q('[data-action="importa-clienti-file"]').type === 'file', 'l\'elemento di import clienti dovrebbe essere un input file');

    const clientiPrima = window.getSTATE().clienti.length;
    const responsabileValido = window.getSTATE().meta.responsabili[0];

    const header = window.COLONNE_IMPORT_CLIENTI.map(c => c.intestazione);
    const rigaValida = [
      'Ditta individuale', 'Test Import Rossi Mario', 'RSSMRA80A01L840X', '99999999991',
      'Forfettario', 'N.A.', responsabileValido, 'Interna (tenuta dalla società)', 'Cliente',
      'Artigiani/Commercianti', 'test1@test.it', 'test1@pec.it', '3331234567', 'Via Test 1',
      '36100', 'Vicenza', 'vi', 'Test settore', '01.11.00, 01.12.00', 'riga di test valida',
    ];
    const rigaConValoriNonRiconosciuti = [
      'Tipo Inesistente XYZ', 'Test Import Bianchi SRL', '', '99999999992',
      'RegimeInventato', 'Semestrale', 'Nome Inventato Che Non Esiste', 'ModoInventato', 'BohInventato',
      'CassaInventata', 'test2@test.it', '', '', '', '', '', '', '', '', '',
    ];
    const rigaSenzaRagioneSociale = ['Ditta individuale', '', '', '99999999993', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const rigaCompletamenteVuota = header.map(() => '');

    const righe = [header, rigaValida, rigaConValoriNonRiconosciuti, rigaSenzaRagioneSociale, rigaCompletamenteVuota];

    window.elaboraImportClienti(righe);
    await wait(20);

    const clientiDopo = window.getSTATE().clienti.length;
    assert(clientiDopo === clientiPrima + 2, `attesi ${clientiPrima + 2} clienti dopo l'import (2 righe valide, 1 senza ragione sociale saltata, 1 riga vuota saltata), trovati ${clientiDopo}`);

    const importatoValido = window.getSTATE().clienti.find(c => c.partitaIva === '99999999991');
    assert(importatoValido, 'il cliente della riga valida non è stato importato (cercato per Partita IVA)');
    assert(importatoValido.tipo === 'ditta_individuale', `tipo non mappato correttamente dall'etichetta: atteso "ditta_individuale", trovato "${importatoValido.tipo}"`);
    assert(importatoValido.ragioneSociale === 'Test Import Rossi Mario', 'ragione sociale non importata correttamente');
    assert(importatoValido.regimeFiscale === 'Forfettario', 'regime fiscale non importato correttamente');
    assert(importatoValido.contabilita === 'INTERNA', `contabilità non mappata correttamente dall'etichetta: atteso "INTERNA", trovato "${importatoValido.contabilita}"`);
    assert(importatoValido.addebitoF24 === 'CLIENTE', `addebito F24 non mappato correttamente dall'etichetta: atteso "CLIENTE", trovato "${importatoValido.addebitoF24}"`);
    assert(importatoValido.previdenza === 'Artigiani/Commercianti', 'previdenza non importata correttamente');
    assert(importatoValido.contatti.provincia === 'VI', `la provincia dovrebbe essere normalizzata in maiuscolo: attesa "VI", trovata "${importatoValido.contatti.provincia}"`);
    assert(importatoValido.contatti.pec === 'test1@pec.it', 'PEC non importata correttamente');
    assert(Array.isArray(importatoValido.atecoCodici) && importatoValido.atecoCodici.length === 2 && importatoValido.atecoCodici.includes('01.11.00') && importatoValido.atecoCodici.includes('01.12.00'), 'codici ATECO multipli (separati da virgola) non spezzati correttamente in array');

    const importatoConDefault = window.getSTATE().clienti.find(c => c.partitaIva === '99999999992');
    assert(importatoConDefault, 'il cliente con valori enum non riconosciuti non è stato importato (dovrebbe procedere comunque con i default, non bloccare la riga)');
    assert(importatoConDefault.tipo === 'societa_capitali', `un tipo non riconosciuto dovrebbe ricadere sul default "societa_capitali", trovato "${importatoConDefault.tipo}"`);
    assert(importatoConDefault.regimeFiscale === 'Ordinario', 'un regime fiscale non riconosciuto dovrebbe ricadere sul default "Ordinario"');
    assert(importatoConDefault.periodicitaIva === 'N.A.', 'una periodicità IVA non riconosciuta dovrebbe ricadere sul default "N.A."');
    assert(importatoConDefault.contabilita === 'ESTERNA', 'una tenuta contabilità non riconosciuta dovrebbe ricadere sul default "ESTERNA"');
    assert(importatoConDefault.addebitoF24 === 'NOI', 'un addebito F24 non riconosciuto dovrebbe ricadere sul default "NOI"');
    assert(importatoConDefault.previdenza === 'No previdenza', 'una previdenza non riconosciuta dovrebbe ricadere sul default "No previdenza"');

    // clienteDaRigaImport (usato internamente da elaboraImportClienti) deve restituire un avviso
    // testuale per ogni valore fuori enum, MAI bloccare la riga: lo richiamiamo direttamente sulla
    // stessa riga per ispezionare gli avvisi (gli .idx delle colonne sono già stati impostati
    // dall'elaboraImportClienti appena eseguita, che ha processato lo stesso header).
    const { cliente: clienteIspezionato, warnings } = window.clienteDaRigaImport(rigaConValoriNonRiconosciuti, 3);
    assert(clienteIspezionato, 'clienteDaRigaImport non dovrebbe restituire null per una riga con solo valori enum non riconosciuti (ha comunque la ragione sociale)');
    assert(warnings.length === 7, `attesi 7 avvisi (tipo, regime fiscale, periodicità IVA, responsabile, tenuta contabilità, addebito F24, previdenza) per i 7 valori non riconosciuti nella riga di test, trovati ${warnings.length}: ${JSON.stringify(warnings)}`);

    // riga senza ragione sociale: clienteDaRigaImport deve restituire cliente:null e un avviso, non lanciare eccezioni
    const rigaVuotaTest = window.clienteDaRigaImport(rigaSenzaRagioneSociale, 4);
    assert(rigaVuotaTest.cliente === null, 'una riga senza ragione sociale/nome dovrebbe restituire cliente:null');
    assert(rigaVuotaTest.warnings.length === 1 && /manca la ragione sociale/i.test(rigaVuotaTest.warnings[0]), 'manca l\'avviso atteso per la riga senza ragione sociale');

    // duplicati: reimportare lo STESSO file non deve creare nuovi clienti (riconoscimento per P.IVA/CF)
    const clientiPrimaReimport = window.getSTATE().clienti.length;
    window.elaboraImportClienti(righe);
    await wait(20);
    assert(window.getSTATE().clienti.length === clientiPrimaReimport, `reimportare lo stesso file non dovrebbe aggiungere clienti (già presenti per stessa P.IVA), ma il conteggio è passato da ${clientiPrimaReimport} a ${window.getSTATE().clienti.length}`);

    console.log('=== Import clienti da Excel/CSV: pulsanti toolbar presenti, mappatura campi (incl. enum da etichetta, PEC, ATECO multipli, provincia maiuscola), valori non riconosciuti mai bloccanti (default + avviso), righe vuote/senza ragione sociale saltate senza eccezioni, nessun duplicato su reimport (P.IVA/CF) OK');

    // pulizia: rimuovi i clienti di test per non alterare i dati demo per i test successivi
    const st = window.getSTATE();
    st.clienti = st.clienti.filter(c => c.partitaIva !== '99999999991' && c.partitaIva !== '99999999992');
    window.setSTATE(st);
    window.salvaStato();
    window.render();
    await wait(20);
  }

  // ---------- 12) Migrazione catalogo: uno stato "vecchio" salvato deve ricevere i nuovi tipi ----------
  // Simula un utente che ha uno STATE già salvato in localStorage PRIMA che il catalogo predefinito
  // venisse esteso (F24 Paghe, Enasarco/FIRR, INPS Agricoltura non esistevano ancora), con anche una
  // personalizzazione su un tipo esistente (nome rinominato) da preservare durante il merge.
  const statoAttuale = window.getSTATE();
  const catalogoVecchio = statoAttuale.catalogoPeriodico
    .filter(t => !['f24Paghe', 'enasarco', 'inpsAgricoltura'].includes(t.id))
    .map(t => t.id === 'ivaMensile' ? Object.assign({}, t, { nome: 'IVA mensile (rinominata dall\'utente)' }) : t);
  const statoVecchioSimulato = Object.assign({}, JSON.parse(JSON.stringify(statoAttuale)), { catalogoPeriodico: catalogoVecchio });
  window.localStorage.setItem('gestionaleStudioState_v1', JSON.stringify(statoVecchioSimulato));
  window.caricaStato();
  const idDopoMigrazione = window.getSTATE().catalogoPeriodico.map(t => t.id);
  assert(idDopoMigrazione.includes('f24Paghe'), 'migrazione: F24 Paghe non aggiunto a uno stato vecchio salvato');
  assert(idDopoMigrazione.includes('enasarco'), 'migrazione: Enasarco non aggiunto a uno stato vecchio salvato');
  assert(idDopoMigrazione.includes('inpsAgricoltura'), 'migrazione: INPS Agricoltura non aggiunto a uno stato vecchio salvato');
  const ivaMensileDopo = window.getSTATE().catalogoPeriodico.find(t => t.id === 'ivaMensile');
  assert(ivaMensileDopo.nome === 'IVA mensile (rinominata dall\'utente)', 'migrazione: personalizzazione utente su tipo esistente persa durante il merge');
  // niente duplicati: la migrazione deve essere idempotente se rilanciata
  window.sincronizzaCatalogoConDefault(window.getSTATE());
  const nF24PagheDopoDoppioMerge = window.getSTATE().catalogoPeriodico.filter(t => t.id === 'f24Paghe').length;
  assert(nF24PagheDopoDoppioMerge === 1, `migrazione non idempotente: attesa 1 voce f24Paghe, trovate ${nF24PagheDopoDoppioMerge}`);
  console.log('=== Migrazione catalogo OK: nuovi tipi aggiunti a uno stato vecchio, personalizzazioni preservate, idempotente');
  // ripristina lo stato demo per non lasciare residui di questo test
  window.setSTATE(statoAttuale);
  window.salvaStato();
  window.render();
  await wait(20);

  // ---------- Ponte comandi MCP (eseguiComandoMCP) ----------
  // Verifica che il dispatcher lato browser usi DAVVERO le stesse funzioni del resto dell'app
  // (aggiungiCliente, aggiornaTaskTeam...) - nessuna logica duplicata - gestisca gli errori senza
  // mai lanciare (li riporta come esito ok:false), e mandi sempre l'esito a /api/comando-risultato.
  // server.js (il bridge HTTP reale) e i tool MCP lato Node hanno le loro suite a parte
  // (rispettivamente: verifica manuale/live, mcp-server/test-server.mjs).
  {
    const richiesteFetch = [];
    const fetchOriginale = window.fetch;
    window.fetch = (url, opts) => {
      richiesteFetch.push({ url, opts });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    };

    const nClientiPrima = window.getSTATE().clienti.length;
    await window.eseguiComandoMCP({ id: 'cmdtest1', azione: 'creaCliente', parametri: { ragioneSociale: 'Cliente Creato Da Claude Test SRL', tipo: 'societa_capitali' } });
    assert(window.getSTATE().clienti.length === nClientiPrima + 1, 'eseguiComandoMCP creaCliente: il cliente non è stato aggiunto a STATE');
    const clienteCreato = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Cliente Creato Da Claude Test SRL');
    assert(!!clienteCreato, 'eseguiComandoMCP creaCliente: cliente non trovato per ragione sociale dopo la creazione');
    assert(richiesteFetch.length === 1 && richiesteFetch[0].url === '/api/comando-risultato', 'eseguiComandoMCP: non ha mandato il risultato a /api/comando-risultato');
    let corpoInviato = JSON.parse(richiesteFetch[0].opts.body);
    assert(corpoInviato.id === 'cmdtest1' && corpoInviato.ok === true, 'eseguiComandoMCP: il risultato mandato al server non è quello atteso');
    console.log('=== eseguiComandoMCP(creaCliente) OK: usa aggiungiCliente() reale, cliente presente in STATE, esito riportato correttamente');

    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest2', azione: 'modificaCliente', parametri: { id: clienteCreato.id, patch: { stato: 'cessato', note: 'modificato da Claude' } } });
    const clienteModificato = window.clienteById(clienteCreato.id);
    assert(clienteModificato.stato === 'cessato' && clienteModificato.note === 'modificato da Claude', 'eseguiComandoMCP modificaCliente: il patch non è stato applicato correttamente');
    assert(clienteModificato.ragioneSociale === 'Cliente Creato Da Claude Test SRL', 'eseguiComandoMCP modificaCliente: un campo non toccato dal patch è andato perso (non è un merge)');
    console.log('=== eseguiComandoMCP(modificaCliente) OK: merge sui soli campi indicati, resto invariato');

    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest3', azione: 'eliminaCliente', parametri: { id: clienteCreato.id } });
    assert(!window.clienteById(clienteCreato.id), 'eseguiComandoMCP eliminaCliente: il cliente non è stato rimosso da STATE');
    console.log('=== eseguiComandoMCP(eliminaCliente) OK');

    // Errori (azione sconosciuta, id inesistente): non devono mai far saltare il dispatcher, solo
    // tornare un esito ok:false con un messaggio leggibile.
    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest4', azione: 'azioneCheNonEsiste', parametri: {} });
    let corpoErrore = JSON.parse(richiesteFetch[0].opts.body);
    assert(corpoErrore.ok === false && /sconosciuta/i.test(corpoErrore.errore || ''), 'eseguiComandoMCP: un\'azione sconosciuta deve riportare ok:false con errore leggibile, non lanciare');

    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest5', azione: 'modificaCliente', parametri: { id: 'id-che-non-esiste-di-sicuro', patch: { note: 'x' } } });
    corpoErrore = JSON.parse(richiesteFetch[0].opts.body);
    assert(corpoErrore.ok === false && /non trovato/i.test(corpoErrore.errore || ''), 'eseguiComandoMCP: un id inesistente deve riportare ok:false con errore leggibile, non lanciare');
    console.log('=== eseguiComandoMCP: errori (azione sconosciuta, id inesistente) gestiti senza lanciare, riportati come ok:false OK');

    // Task team: stesso giro, verifica che passi dalle funzioni reali aggiungiTaskTeam/eliminaTaskTeam
    richiesteFetch.length = 0;
    const nTaskPrima = window.getSTATE().taskTeam.length;
    await window.eseguiComandoMCP({ id: 'cmdtest6', azione: 'creaTask', parametri: { titolo: 'Task da Claude test', assegnatoA: 'Matteo' } });
    assert(window.getSTATE().taskTeam.length === nTaskPrima + 1, 'eseguiComandoMCP creaTask: il task non è stato aggiunto');
    const taskCreato = window.getSTATE().taskTeam.find(t => t.titolo === 'Task da Claude test');
    assert(!!taskCreato && taskCreato.assegnatoA === 'Matteo', 'eseguiComandoMCP creaTask: dati del task non coerenti con i parametri');
    await window.eseguiComandoMCP({ id: 'cmdtest7', azione: 'eliminaTask', parametri: { id: taskCreato.id } });
    assert(!window.getSTATE().taskTeam.find(t => t.id === taskCreato.id), 'eseguiComandoMCP eliminaTask: il task non è stato rimosso');
    console.log('=== eseguiComandoMCP(creaTask/eliminaTask) OK: usa aggiungiTaskTeam()/eliminaTaskTeam() reali');

    // Preventivi/mandati (task #143): creaPreventivo deve passare da creaPreventivoDaModello()
    // (stessa funzione usata dal form), risolvere il testo dal modello, e tradurre attivitaIds nello
    // snapshot {id,nome,prezzo,richiedeMandato} sommando il prezzo nell'importo se non indicato.
    richiesteFetch.length = 0;
    const clientePrevMCP = window.getSTATE().clienti[0];
    const modelloPrevMCP = window.getSTATE().modelliDocumento.find(m => m.categoria === 'Preventivo');
    const attivitaPrevMCP = window.getSTATE().catalogoAttivitaStudio.slice(0, 2);
    const nPreventiviPrima = window.getSTATE().preventivi.length;
    await window.eseguiComandoMCP({ id: 'cmdtest8', azione: 'creaPreventivo', parametri: {
      clienteId: clientePrevMCP.id, modelloId: modelloPrevMCP.id, oggetto: 'Preventivo creato da Claude test',
      dataEmissione: '2026-09-15', attivitaIds: attivitaPrevMCP.map(a => a.id),
    } });
    assert(window.getSTATE().preventivi.length === nPreventiviPrima + 1, 'eseguiComandoMCP creaPreventivo: il preventivo non è stato aggiunto a STATE');
    const preventivoCreatoMCP = window.getSTATE().preventivi.find(p => p.oggetto === 'Preventivo creato da Claude test');
    assert(!!preventivoCreatoMCP, 'eseguiComandoMCP creaPreventivo: preventivo non trovato per oggetto dopo la creazione');
    assert(preventivoCreatoMCP.clienteId === clientePrevMCP.id && preventivoCreatoMCP.modelloId === modelloPrevMCP.id, 'eseguiComandoMCP creaPreventivo: clienteId/modelloId non coerenti con i parametri');
    const importoAttesoMCP = attivitaPrevMCP.reduce((s, a) => s + (a.prezzo || 0), 0);
    assert(preventivoCreatoMCP.importo === importoAttesoMCP, `eseguiComandoMCP creaPreventivo: importo non calcolato sommando le attività (atteso ${importoAttesoMCP}, trovato ${preventivoCreatoMCP.importo})`);
    assert(preventivoCreatoMCP.attivitaScelte.length === 2, 'eseguiComandoMCP creaPreventivo: attivitaIds non tradotte correttamente nello snapshot attivitaScelte');
    assert(!preventivoCreatoMCP.corpo.includes('{{'), 'eseguiComandoMCP creaPreventivo: il testo del documento non è stato risolto dal modello (segnaposto residui)');
    console.log('=== eseguiComandoMCP(creaPreventivo) OK: usa creaPreventivoDaModello() reale, attivitaIds tradotte, importo sommato, testo risolto dal modello');

    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest9', azione: 'modificaPreventivo', parametri: { id: preventivoCreatoMCP.id, patch: { stato: 'Accettato' } } });
    assert(window.getSTATE().preventivi.find(p => p.id === preventivoCreatoMCP.id).stato === 'Accettato', 'eseguiComandoMCP modificaPreventivo: il patch non è stato applicato');
    console.log('=== eseguiComandoMCP(modificaPreventivo) OK');

    richiesteFetch.length = 0;
    await window.eseguiComandoMCP({ id: 'cmdtest10', azione: 'eliminaPreventivo', parametri: { id: preventivoCreatoMCP.id } });
    assert(!window.getSTATE().preventivi.find(p => p.id === preventivoCreatoMCP.id), 'eseguiComandoMCP eliminaPreventivo: il preventivo non è stato rimosso');
    console.log('=== eseguiComandoMCP(eliminaPreventivo) OK');

    window.fetch = fetchOriginale;
    window.salvaStato();
    window.render();
    await wait(20);
  }

  // ---------- Backup automatici lato server (card "Backup automatici" in Impostazioni) ----------
  // HTTP_SYNC_ATTIVO è false in questo ambiente di test (nessun server.js reale) - qui si verificano
  // entrambi i rami: (a) il messaggio esplicativo quando il server non è attivo, il caso normale in
  // questa suite, e (b) forzando temporaneamente il flag, il caricamento dell'elenco dal server (via
  // fetch mockato) e il ripristino, per verificare che la UI chiami davvero gli endpoint giusti con
  // i parametri giusti - il bridge HTTP reale (server.js) ha la sua verifica live a parte.
  {
    window.setView('impostazioni');
    await wait(20);
    // La sotto-sezione Impostazioni resta su "catalogo" dal test F24 (11d) qui sopra - la card
    // Backup automatici vive nella sotto-sezione "Dati & backup" (data-sezione="dati").
    click(q('[data-action="imp-sezione"][data-sezione="dati"]'));
    await wait(20);
    assert(window.document.body.textContent.includes('Backup automatici (server locale)'), 'la card "Backup automatici" non è presente in Impostazioni');
    assert(q('#content').textContent.includes('server locale acceso'), 'senza server locale attivo la card deve spiegare come attivarlo, non mostrare un elenco vuoto');
    console.log('=== Impostazioni: card "Backup automatici" spiega come attivarli quando il server locale non è in esecuzione OK');

    const fetchOriginale2 = window.fetch;
    const richieste = [];
    // già in ordine dal più recente al più vecchio: è così che il vero server.js li restituisce
    // (elencoBackup() li ordina lato server), il client li mostra semplicemente nell'ordine ricevuto.
    let rispostaElenco = [
      { file: 'dati-studio_2026-01-02_12-00-00.json', data: '2026-01-02T11:00:00.000Z', dimensione: 2200 },
      { file: 'dati-studio_2026-01-01_08-00-00.json', data: '2026-01-01T07:00:00.000Z', dimensione: 2048 },
    ];
    window.fetch = (url, opts) => {
      richieste.push({ url, opts });
      if (url === '/api/backup/elenco') return Promise.resolve({ json: async () => rispostaElenco });
      if (url === '/api/backup/ripristina') return Promise.resolve({ json: async () => ({ ok: true }) });
      return Promise.reject(new Error('URL non atteso nel mock: ' + url));
    };
    window.setHttpSyncAttivoTest(true);
    window.setView('impostazioni'); // rientra nella vista: fa scattare il caricamento dell'elenco
    await wait(30);

    assert(richieste.some(r => r.url === '/api/backup/elenco'), 'con il server locale attivo la card deve chiedere l\'elenco a /api/backup/elenco');
    const righeTabella = qa('#content table.backup-elenco-tabella tbody tr');
    assert(righeTabella.length === 2, `attese 2 righe nella tabella dei backup (una per snapshot), trovate ${righeTabella.length}`);
    assert(q('#content').textContent.includes('2.0 KB'), 'la dimensione del backup non è mostrata correttamente (KB)');
    console.log('=== Impostazioni: elenco backup automatici caricato dal server e mostrato in tabella OK');

    const btnRipristina = q('[data-action="ripristina-backup-server"]');
    assert(btnRipristina, 'pulsante "Ripristina" non trovato per un backup in elenco');
    assert(btnRipristina.dataset.file === 'dati-studio_2026-01-02_12-00-00.json', 'il pulsante Ripristina non è collegato al file di backup corretto (atteso il più recente per primo)');
    richieste.length = 0;
    click(btnRipristina);
    await wait(30);
    const richiestaRipristino = richieste.find(r => r.url === '/api/backup/ripristina');
    assert(richiestaRipristino, 'click su "Ripristina" non ha chiamato /api/backup/ripristina');
    const corpoRipristino = JSON.parse(richiestaRipristino.opts.body);
    assert(corpoRipristino.file === 'dati-studio_2026-01-02_12-00-00.json', 'il ripristino non ha mandato il nome file corretto al server');
    console.log('=== Impostazioni: click su "Ripristina" chiama /api/backup/ripristina col file corretto OK');

    window.fetch = fetchOriginale2;
    window.setHttpSyncAttivoTest(false);
    window.setView('dashboard');
    await wait(20);
  }

  // ---------- Strumenti: convertitore Word <-> PDF (task #133) ----------
  {
    // senza server locale attivo: messaggio chiaro, nessun form di conversione
    window.setView('strumenti');
    await wait(20);
    assert(window.document.body.textContent.includes('serve il server locale acceso'), 'senza HTTP_SYNC_ATTIVO la pagina Strumenti deve spiegare che serve il server locale');
    assert(!q('[data-action="strumenti-scegli-file"]'), 'senza server locale attivo non deve comparire il selettore file');
    console.log('=== Strumenti: senza server locale attivo, messaggio chiaro e nessun form OK');

    const fetchOriginaleStrumenti = window.fetch;
    let statoConversioneFinto = { ok: true, disponibile: false };
    const richiesteStrumenti = [];
    window.fetch = (url, opts) => {
      richiesteStrumenti.push({ url, opts });
      if (url === '/api/conversione-stato') return Promise.resolve({ json: async () => statoConversioneFinto });
      if (url === '/api/converti') return Promise.resolve({ json: async () => ({ ok: true, nomeFile: 'documento.pdf', contenutoBase64: 'ZmludG8=' }) });
      return Promise.reject(new Error('URL non atteso nel mock strumenti: ' + url));
    };
    window.setHttpSyncAttivoTest(true);

    // con server attivo ma LibreOffice NON installato: istruzioni di installazione, niente form
    window.setView('strumenti');
    await wait(30);
    assert(window.document.body.textContent.includes('LibreOffice'), 'senza LibreOffice disponibile deve comparire l\'istruzione di installazione');
    assert(!q('[data-action="strumenti-scegli-file"]'), 'senza LibreOffice disponibile non deve comparire il selettore file');
    console.log('=== Strumenti: LibreOffice non disponibile, istruzioni di installazione mostrate OK');

    // con LibreOffice disponibile: form di conversione, upload, chiamata a /api/converti, risultato scaricabile
    statoConversioneFinto = { ok: true, disponibile: true };
    window.resetConversioneStatoTest();
    window.setView('strumenti');
    await wait(30);
    assert(q('[data-action="strumenti-scegli-file"]'), 'con LibreOffice disponibile deve comparire il selettore file');
    assert(!q('[data-action="strumenti-converti"]'), 'prima di scegliere un file non deve comparire ancora il pulsante Converti');

    const fileFintoDocx = new window.File(['contenuto finto di prova'], 'Preventivo Rossi.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    window.selezionaFileConversione({ files: [fileFintoDocx] });
    await wait(30);
    assert(window.document.body.textContent.includes('Preventivo Rossi.docx'), 'il nome del file scelto non compare dopo la selezione');
    const btnConverti = q('[data-action="strumenti-converti"]');
    assert(btnConverti && btnConverti.textContent.includes('PDF'), 'il pulsante Converti deve proporre la conversione in PDF per un .docx');

    richiesteStrumenti.length = 0;
    click(btnConverti);
    await wait(30);
    const richiestaConverti = richiesteStrumenti.find(r => r.url === '/api/converti');
    assert(richiestaConverti, 'click su "Converti" non ha chiamato /api/converti');
    const corpoConverti = JSON.parse(richiestaConverti.opts.body);
    assert(corpoConverti.nomeFile === 'Preventivo Rossi.docx' && corpoConverti.formatoDestinazione === 'pdf' && corpoConverti.contenutoBase64, '/api/converti non ha ricevuto nomeFile/formatoDestinazione/contenutoBase64 corretti');
    assert(window.document.body.textContent.includes('Conversione completata') && window.document.body.textContent.includes('documento.pdf'), 'dopo la conversione riuscita non compare il messaggio di completamento col nome del file risultante');
    assert(q('[data-action="strumenti-scarica"]'), 'manca il pulsante "Scarica" dopo una conversione riuscita');
    assert(q('[data-action="strumenti-salva-cartella"]'), 'manca il pulsante "Salva nella cartella del file originario" dopo una conversione riuscita (task #202)');
    console.log('=== Strumenti: upload .docx, conversione via /api/converti, risultato scaricabile mostrato correttamente OK');

    // Task #202 (Matteo: "aggiungiamo anche la possibilità di trascinare i file"): la dropzone
    // intorno al pulsante "Scegli file" reagisce a dragover/dragleave/drop con lo stesso esito di
    // selezionaFileConversione, passando dal percorso condiviso elaboraFileConversione.
    click(q('[data-action="strumenti-reset"]'));
    await wait(20);
    const zonaDrop = q('[data-dropzone="converti-file"]');
    assert(zonaDrop, 'manca la dropzone per trascinare il file nel convertitore (task #202)');

    const dragOverFinto = new window.Event('dragover', { bubbles: true, cancelable: true });
    dragOverFinto.dataTransfer = {};
    zonaDrop.dispatchEvent(dragOverFinto);
    assert(zonaDrop.classList.contains('dropzone-attiva'), 'il trascinamento sopra la dropzone deve accenderne il contorno (classe dropzone-attiva)');

    const dragLeaveFinto = new window.Event('dragleave', { bubbles: true, cancelable: true });
    zonaDrop.dispatchEvent(dragLeaveFinto);
    assert(!zonaDrop.classList.contains('dropzone-attiva'), 'uscendo dalla dropzone senza rilasciare il contorno acceso deve spegnersi');

    const fileFintoTrascinato = new window.File(['contenuto finto'], 'Bilancio Trascinato.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const dropFinto = new window.Event('drop', { bubbles: true, cancelable: true });
    dropFinto.dataTransfer = { files: [fileFintoTrascinato] };
    zonaDrop.dispatchEvent(dropFinto);
    await wait(30);
    assert(window.document.body.textContent.includes('Bilancio Trascinato.docx'), 'il file trascinato sulla dropzone non è stato preso in carico dal convertitore (task #202)');
    console.log('=== Strumenti: trascinare un file sulla dropzone lo carica come con "Scegli file..." OK');

    // un .pdf offre DUE destinazioni (Word e PDF/A, task #136): compare il select, cambiarlo aggiorna
    // sia l'etichetta del pulsante sia il formatoDestinazione inviato a /api/converti
    click(q('[data-action="strumenti-reset"]'));
    await wait(20);
    const fileFintoPdf = new window.File(['%PDF-finto'], 'Fattura.pdf', { type: 'application/pdf' });
    window.selezionaFileConversione({ files: [fileFintoPdf] });
    await wait(30);
    const selFormato = q('[data-action="strumenti-scegli-formato"]');
    assert(selFormato, 'per un .pdf deve comparire il select per scegliere tra Word e PDF/A');
    assert(selFormato.value === 'docx', 'il formato preselezionato per un .pdf deve essere Word (.docx)');
    let btnConvertiPdf = q('[data-action="strumenti-converti"]');
    assert(btnConvertiPdf.textContent.includes('Word'), 'col formato preselezionato il pulsante deve proporre Word');

    selFormato.value = 'pdfa';
    selFormato.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(20);
    btnConvertiPdf = q('[data-action="strumenti-converti"]');
    assert(btnConvertiPdf.textContent.includes('PDF/A'), 'dopo aver scelto PDF/A il pulsante deve proporre PDF/A, non più Word');

    richiesteStrumenti.length = 0;
    click(btnConvertiPdf);
    await wait(30);
    const richiestaPdfA = richiesteStrumenti.find(r => r.url === '/api/converti');
    assert(richiestaPdfA, 'click su "Converti" (PDF/A) non ha chiamato /api/converti');
    const corpoPdfA = JSON.parse(richiestaPdfA.opts.body);
    assert(corpoPdfA.formatoDestinazione === 'pdfa', 'scegliendo PDF/A il formatoDestinazione inviato al server deve essere "pdfa", trovato: ' + corpoPdfA.formatoDestinazione);
    console.log('=== Strumenti: scelta Word/PDF-A per un .pdf, formatoDestinazione corretto inviato al server OK');

    // un file con estensione non supportata viene rifiutato subito, senza chiamare il server
    click(q('[data-action="strumenti-reset"]'));
    await wait(20);
    richiesteStrumenti.length = 0;
    const fileFintoNonSupportato = new window.File(['x'], 'appunti.txt', { type: 'text/plain' });
    window.selezionaFileConversione({ files: [fileFintoNonSupportato] });
    await wait(20);
    assert(window.document.body.textContent.includes('non supportato'), 'un formato non supportato (.txt) dovrebbe mostrare un errore chiaro');
    assert(!q('[data-action="strumenti-converti"]'), 'un formato non supportato non dovrebbe mai mostrare il pulsante Converti');
    assert(richiesteStrumenti.length === 0, 'un formato non supportato non dovrebbe chiamare alcun endpoint del server');
    console.log('=== Strumenti: formato file non supportato rifiutato subito, senza chiamate al server OK');

    window.fetch = fetchOriginaleStrumenti;
    window.setHttpSyncAttivoTest(false);
    window.setView('dashboard');
    await wait(20);
  }

  // ---------- Strumenti: unisci/dividi PDF (task #204, richiesta Matteo: "manca uno strumento per
  // unire e dividere i file, possiamo implementarlo?") ----------
  {
    const fetchOriginalePdf = window.fetch;
    let statoPdfFinto = { ok: true, disponibile: false };
    const richiestePdf = [];
    window.fetch = (url, opts) => {
      richiestePdf.push({ url, opts });
      if (url === '/api/pdf-stato') return Promise.resolve({ json: async () => statoPdfFinto });
      if (url === '/api/pdf-info') return Promise.resolve({ json: async () => ({ ok: true, numeroPagine: 6 }) });
      if (url === '/api/pdf-unisci') return Promise.resolve({ json: async () => ({ ok: true, nomeFile: 'documenti-uniti.pdf', contenutoBase64: 'ZmludG8=' }) });
      if (url === '/api/pdf-dividi') return Promise.resolve({ json: async () => ({ ok: true, nomeFile: 'Fattura_pag2-4.pdf', contenutoBase64: 'ZmludG8=' }) });
      return Promise.reject(new Error('URL non atteso nel mock pdf: ' + url));
    };
    window.setHttpSyncAttivoTest(true);

    // libreria pdf-lib non installata sul PC: istruzioni chiare, niente form
    window.resetPdfStatoTest();
    window.setView('strumenti');
    await wait(30);
    assert(window.document.body.textContent.includes('pdf-lib'), 'senza pdf-lib disponibile deve comparire l\'istruzione di installazione (task #204)');
    assert(!q('[data-dropzone="unisci-pdf-file"]'), 'senza pdf-lib disponibile non deve comparire la dropzone di Unisci PDF');
    console.log('=== Strumenti: pdf-lib non disponibile, istruzioni di installazione mostrate OK (task #204)');

    // con pdf-lib disponibile: due card distinte, Unisci e Dividi
    statoPdfFinto = { ok: true, disponibile: true };
    window.resetPdfStatoTest();
    window.setView('strumenti');
    await wait(30);
    assert(window.document.body.textContent.includes('Unisci PDF'), 'manca la card "Unisci PDF"');
    assert(window.document.body.textContent.includes('Dividi PDF'), 'manca la card "Dividi PDF"');
    const zonaDropUnisci = q('[data-dropzone="unisci-pdf-file"]');
    const zonaDropDividi = q('[data-dropzone="dividi-pdf-file"]');
    assert(zonaDropUnisci, 'manca la dropzone di Unisci PDF');
    assert(zonaDropDividi, 'manca la dropzone di Dividi PDF');

    // --- Unisci: due file caricati via "Scegli file...", riordino, rimozione, unione ---
    const fileA = new window.File(['%PDF-finto-A'], 'A.pdf', { type: 'application/pdf' });
    const fileB = new window.File(['%PDF-finto-B'], 'B.pdf', { type: 'application/pdf' });
    const fileC = new window.File(['%PDF-finto-C'], 'C.pdf', { type: 'application/pdf' });
    assert(!q('[data-action="pdfu-unisci"]'), 'senza file caricati non deve comparire ancora il pulsante Unisci');
    window.selezionaFileUnisciPdf({ files: [fileA] });
    await wait(30);
    assert(window.document.body.textContent.includes('A.pdf'), 'A.pdf non mostrato nella lista di Unisci PDF dopo la selezione');
    let btnUnisci = q('[data-action="pdfu-unisci"]');
    assert(btnUnisci && btnUnisci.disabled, 'con un solo file caricato il pulsante Unisci deve restare disabilitato (ne servono almeno due)');

    window.selezionaFileUnisciPdf({ files: [fileB, fileC] });
    await wait(30);
    assert(window.document.body.textContent.includes('B.pdf') && window.document.body.textContent.includes('C.pdf'), 'B.pdf/C.pdf non mostrati dopo una seconda selezione multipla');
    btnUnisci = q('[data-action="pdfu-unisci"]');
    assert(btnUnisci && !btnUnisci.disabled, 'con tre file caricati il pulsante Unisci deve essere attivo');

    // riordino: sposto il terzo file (C.pdf, idx 2) su di una posizione -> deve finire al centro
    click(q('[data-action="pdfu-sposta-su"][data-idx="2"]'));
    await wait(20);
    assert(window.document.body.textContent.indexOf('B.pdf') > window.document.body.textContent.indexOf('A.pdf') && window.document.body.textContent.indexOf('C.pdf') < window.document.body.textContent.indexOf('B.pdf'), 'lo spostamento "su" di C.pdf non ha cambiato l\'ordine della lista come atteso (task #204)');

    // rimozione: dopo il riordino sopra l'elenco è A, C, B (A.pdf resta comunque primo) - lo rimuovo
    const righePdfU = qa('[data-action="pdfu-rimuovi"]');
    assert(righePdfU.length === 3, `attesi 3 pulsanti di rimozione nella lista di Unisci PDF, trovati ${righePdfU.length}`);
    click(righePdfU[0]); // rimuove il primo elemento della lista attuale (A.pdf)
    await wait(20);
    assert(!window.document.body.textContent.includes('A.pdf'), 'A.pdf non è stato rimosso dalla lista di Unisci PDF dopo il click su "Rimuovi"');
    btnUnisci = q('[data-action="pdfu-unisci"]');
    assert(btnUnisci && !btnUnisci.disabled, 'con due file rimasti il pulsante Unisci deve restare attivo');

    richiestePdf.length = 0;
    click(btnUnisci);
    await wait(30);
    const richiestaUnisci = richiestePdf.find(r => r.url === '/api/pdf-unisci');
    assert(richiestaUnisci, 'click su "Unisci" non ha chiamato /api/pdf-unisci');
    const corpoUnisci = JSON.parse(richiestaUnisci.opts.body);
    assert(Array.isArray(corpoUnisci.file) && corpoUnisci.file.length === 2, '/api/pdf-unisci non ha ricevuto i due file rimasti nell\'ordine corretto');
    assert(window.document.body.textContent.includes('documenti-uniti.pdf'), 'dopo l\'unione riuscita non compare il nome del file risultante');
    assert(q('[data-action="pdfu-scarica"]'), 'manca il pulsante "Scarica" dopo un\'unione riuscita');
    assert(q('[data-action="pdfu-salva-cartella"]'), 'manca il pulsante "Salva nella cartella del file originario" dopo un\'unione riuscita (task #204)');
    console.log('=== Strumenti: Unisci PDF - selezione multipla, riordino, rimozione e unione via /api/pdf-unisci OK (task #204)');

    click(q('[data-action="pdfu-reset"]'));
    await wait(20);
    assert(!window.document.body.textContent.includes('documenti-uniti.pdf'), 'il reset di Unisci PDF non ha svuotato lista/risultato');

    // trascinamento di più file insieme sulla dropzone di Unisci (il reset sopra ha rifatto il
    // render, quindi il vecchio riferimento alla dropzone è "staccato" dal DOM - va ripreso)
    const fileD = new window.File(['%PDF-finto-D'], 'D.pdf', { type: 'application/pdf' });
    const fileE = new window.File(['%PDF-finto-E'], 'E.pdf', { type: 'application/pdf' });
    const dropUnisciFinto = new window.Event('drop', { bubbles: true, cancelable: true });
    dropUnisciFinto.dataTransfer = { files: [fileD, fileE] };
    q('[data-dropzone="unisci-pdf-file"]').dispatchEvent(dropUnisciFinto);
    await wait(30);
    assert(window.document.body.textContent.includes('D.pdf') && window.document.body.textContent.includes('E.pdf'), 'trascinare due file insieme sulla dropzone di Unisci non li ha caricati entrambi (task #204)');
    console.log('=== Strumenti: trascinare più file insieme sulla dropzone di Unisci PDF li carica tutti OK (task #204)');

    click(q('[data-action="pdfu-reset"]'));
    await wait(20);

    // --- Dividi: un file caricato, numero pagine letto da /api/pdf-info, intervallo modificato, divisione ---
    const filePdfDaDividere = new window.File(['%PDF-finto-dividi'], 'Fattura.pdf', { type: 'application/pdf' });
    window.selezionaFileDividiPdf({ files: [filePdfDaDividere] });
    await wait(30);
    const richiestaInfo = richiestePdf.find(r => r.url === '/api/pdf-info');
    assert(richiestaInfo, 'scegliere il file in Dividi PDF non ha chiamato /api/pdf-info per leggere il numero di pagine');
    assert(window.document.body.textContent.includes('6 pagine'), 'il numero di pagine letto da /api/pdf-info (6) non compare dopo la selezione');
    const campoDa = q('[data-action="pdfd-cambia-da"]');
    const campoA = q('[data-action="pdfd-cambia-a"]');
    assert(campoDa && campoA, 'mancano i campi "da pagina"/"a pagina" dopo aver letto il numero di pagine');
    assert(Number(campoDa.value) === 1 && Number(campoA.value) === 6, 'l\'intervallo pagine predefinito dovrebbe coprire tutto il documento (1-6) appena caricato');

    setVal(campoDa, '2');
    setVal(campoA, '4');
    await wait(20);

    richiestePdf.length = 0;
    click(q('[data-action="pdfd-dividi"]'));
    await wait(30);
    const richiestaDividi = richiestePdf.find(r => r.url === '/api/pdf-dividi');
    assert(richiestaDividi, 'click su "Estrai pagine" non ha chiamato /api/pdf-dividi');
    const corpoDividi = JSON.parse(richiestaDividi.opts.body);
    assert(corpoDividi.da === 2 && corpoDividi.a === 4 && corpoDividi.nomeFile === 'Fattura.pdf', '/api/pdf-dividi non ha ricevuto nomeFile/da/a corretti (attesi Fattura.pdf, 2, 4)');
    assert(window.document.body.textContent.includes('Fattura_pag2-4.pdf'), 'dopo la divisione riuscita non compare il nome del file estratto');
    assert(q('[data-action="pdfd-scarica"]'), 'manca il pulsante "Scarica" dopo una divisione riuscita');
    assert(q('[data-action="pdfd-salva-cartella"]'), 'manca il pulsante "Salva nella cartella del file originario" dopo una divisione riuscita (task #204)');
    console.log('=== Strumenti: Dividi PDF - numero pagine letto dal server, intervallo modificabile, divisione via /api/pdf-dividi OK (task #204)');

    click(q('[data-action="pdfd-reset"]'));
    await wait(20);

    // trascinamento di un file sulla dropzone di Dividi (dopo i vari reset/render sopra, la
    // dropzone va ripresa dal DOM corrente invece di usare il riferimento iniziale, ormai staccato)
    const fileTrascinatoDividi = new window.File(['%PDF-finto-trascinato'], 'Trascinato.pdf', { type: 'application/pdf' });
    const dropDividiFinto = new window.Event('drop', { bubbles: true, cancelable: true });
    dropDividiFinto.dataTransfer = { files: [fileTrascinatoDividi] };
    q('[data-dropzone="dividi-pdf-file"]').dispatchEvent(dropDividiFinto);
    await wait(30);
    assert(window.document.body.textContent.includes('Trascinato.pdf'), 'trascinare un file sulla dropzone di Dividi PDF non lo ha caricato (task #204)');
    console.log('=== Strumenti: trascinare un file sulla dropzone di Dividi PDF lo carica correttamente OK (task #204)');

    // un file non-PDF viene rifiutato subito, senza chiamare il server, in entrambi gli strumenti
    click(q('[data-action="pdfd-reset"]'));
    await wait(20);
    richiestePdf.length = 0;
    const fileNonPdf = new window.File(['x'], 'appunti.txt', { type: 'text/plain' });
    window.selezionaFileDividiPdf({ files: [fileNonPdf] });
    await wait(20);
    assert(window.document.body.textContent.includes('non è un PDF'), 'un file .txt scelto in Dividi PDF dovrebbe mostrare un errore chiaro');
    assert(richiestePdf.length === 0, 'un file non-PDF in Dividi PDF non dovrebbe chiamare alcun endpoint del server');
    console.log('=== Strumenti: file non-PDF rifiutato subito in Dividi PDF, senza chiamate al server OK (task #204)');

    window.fetch = fetchOriginalePdf;
    window.setHttpSyncAttivoTest(false);
    window.setView('dashboard');
    await wait(20);
  }

  // Task #202 (root cause del bug "il convertitore ci metto sempre almeno due volte prima di
  // riuscire a prendere il file"): mentre un dialog nativo del sistema (il selettore file, ma anche
  // stampa/salvataggio) è aperto, la finestra perde il focus del sistema operativo. Un polling in
  // background che chiamasse render() in quella finestra di tempo ricostruirebbe il DOM e
  // staccherebbe l'<input type="file"> dal dialog ancora in corso. staModificandoQualcosa() -
  // chiamata da tutto il polling in background prima di un render() - deve quindi considerare "sto
  // modificando qualcosa" anche la semplice assenza del focus di sistema, non solo campo
  // attivo/dettaglio aperto.
  {
    assert(window.staModificandoQualcosa() === false, 'con la finestra a fuoco e nessun campo/dettaglio aperto, staModificandoQualcosa deve restituire false');
    window.dispatchEvent(new window.Event('blur'));
    assert(window.staModificandoQualcosa() === true, 'senza il focus di sistema (dialog nativo potenzialmente aperto) staModificandoQualcosa deve restituire true, per non ricostruire il DOM sotto un selettore file in corso (task #202)');
    window.dispatchEvent(new window.Event('focus'));
    assert(window.staModificandoQualcosa() === false, 'tornato il focus di sistema, e senza altri blocchi, staModificandoQualcosa deve tornare false');
    console.log('=== Task #202: senza focus di sistema staModificandoQualcosa blocca i re-render in background (dialog "Scegli file" al sicuro) OK');
    await wait(20);
  }

  // ---------- Rubrica (task #135): elenco contatti clienti, ricerca, copia ----------
  {
    window.aggiungiCliente({
      ragioneSociale: 'Rubrica Test SRL',
      contatti: { email: 'info@rubricatest.it', emailAmministrazione: 'amm@rubricatest.it', pec: 'rubricatest@pec.it', telefono: '0444123456', localita: 'Vicenza' },
      responsabileStudio: 'Matteo',
    });
    const clienteRubrica = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Rubrica Test SRL');
    window.aggiungiCliente({ ragioneSociale: 'Altro Cliente Senza Contatti SRL' });

    window.setView('rubrica');
    await wait(20);
    assert(window.document.body.textContent.includes('Rubrica Test SRL'), 'il cliente con contatti non compare nella Rubrica');
    assert(window.document.body.textContent.includes('info@rubricatest.it'), 'email cliente non mostrata in Rubrica');
    assert(window.document.body.textContent.includes('rubricatest@pec.it'), 'PEC cliente non mostrata in Rubrica');
    assert(q('a[href="mailto:info@rubricatest.it"]'), 'email in Rubrica deve essere un link mailto: cliccabile');
    assert(q('a[href="tel:0444123456"]'), 'telefono in Rubrica deve essere un link tel: cliccabile');
    console.log('=== Rubrica: contatti cliente mostrati con link mailto/tel corretti OK');

    setVal(q('[data-action="rubrica-filtro-q"]'), 'rubricatest');
    await wait(20);
    assert(window.document.body.textContent.includes('Rubrica Test SRL'), 'ricerca Rubrica non trova il cliente per email');
    assert(!window.document.body.textContent.includes('Altro Cliente Senza Contatti'), 'ricerca Rubrica non filtra via i clienti che non corrispondono');
    console.log('=== Rubrica: ricerca per email filtra correttamente la lista OK');

    // Si stubba direttamente copiaTestoNegliAppunti (non l'API navigator.clipboard: jsdom non la
    // implementa in modo affidabile) per verificare CON CHE TESTO viene chiamata sul click. Il
    // filtro sopra resta attivo apposta: con decine di clienti demo già in STATE, un q() generico
    // su "[data-action=rubrica-copia]" prenderebbe il primo bottone in ordine alfabetico, quasi
    // certamente di un ALTRO cliente - filtrare per email di questo test isola la riga giusta.
    const copiatiRubrica = [];
    const copiaOriginaleRubrica = window.copiaTestoNegliAppunti;
    window.copiaTestoNegliAppunti = (t) => { copiatiRubrica.push(t); };
    click(q(`[data-action="rubrica-copia"][data-testo]`));
    await wait(20);
    assert(copiatiRubrica.length === 1 && copiatiRubrica[0].includes('info@rubricatest.it'), 'pulsante "Copia" in Rubrica non ha copiato il contatto atteso, trovato: ' + JSON.stringify(copiatiRubrica));
    window.copiaTestoNegliAppunti = copiaOriginaleRubrica;
    console.log('=== Rubrica: pulsante Copia contatto funzionante OK');

    // Modifica diretta dalla Rubrica (task #146): il pulsante "✎ Modifica" deve aprire lo stesso
    // modale cliente usato ovunque nell'app (modalCliente/modifica-cliente), senza dover prima
    // passare per la Scheda cliente - e il salvataggio deve aggiornare davvero STATE.
    click(q(`[data-action="modifica-cliente"][data-id="${clienteRubrica.id}"]`));
    await wait(20);
    assert(q('#formCliente'), 'il pulsante Modifica in Rubrica non apre il modale di modifica cliente');
    assert(q('#formCliente').dataset.id === clienteRubrica.id, 'il modale aperto da Rubrica non è quello del cliente giusto');
    assert(q('#fRagioneSociale').value === 'Rubrica Test SRL', 'il modale aperto da Rubrica non è precompilato con i dati del cliente corretto');
    setVal(q('#fRagioneSociale'), 'Rubrica Test SRL Modificata');
    click(q('[data-action="salva-cliente"]'));
    await wait(20);
    assert(window.clienteById(clienteRubrica.id).ragioneSociale === 'Rubrica Test SRL Modificata', 'la modifica fatta dal modale aperto da Rubrica non è stata salvata in STATE');
    assert(window.document.body.textContent.includes('Rubrica Test SRL Modificata'), 'la Rubrica non mostra il nome aggiornato dopo il salvataggio');
    console.log('=== Rubrica: pulsante Modifica apre il modale cliente corretto e il salvataggio aggiorna STATE OK');

    setVal(q('[data-action="rubrica-filtro-q"]'), '');
    await wait(20);

    window.eliminaCliente(clienteRubrica.id);
    window.setView('dashboard');
    await wait(20);
  }

  // ---------- Credenziali: vault password studio/clienti (task #134) ----------
  {
    window.aggiungiCliente({ ragioneSociale: 'Cliente Credenziali Test SRL' });
    const clienteCred = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Cliente Credenziali Test SRL');
    const nCredPrima = window.getSTATE().credenziali.length;

    window.setView('credenziali');
    await wait(20);
    assert(q('[data-action="nuova-credenziale"]'), 'manca il pulsante "Nuova credenziale"');

    // credenziale STUDIO (nessun cliente collegato) — task richiesto da Matteo: campi liberi con
    // nome personalizzato (Entratel: nome utente + password + PIN), non più solo username/password
    // fissi. Il modale apre già con 2 righe di default (idx 0 = non segreto, idx 1 = segreto);
    // questo test ne aggiunge una terza per il PIN.
    click(q('[data-action="nuova-credenziale"]'));
    await wait(20);
    assert(q('#formCredenziale'), 'form nuova credenziale non renderizzato');
    assertNoAutoSubmit(q('#formCredenziale'), 'formCredenziale');
    setVal(q('#credTitolo'), 'Entratel - Studio');
    setVal(q('#credCategoria'), 'Entratel');
    setVal(q('[data-action="cred-campo-input"][data-idx="0"][data-campo="etichetta"]'), 'Nome utente');
    setVal(q('[data-action="cred-campo-input"][data-idx="0"][data-campo="valore"]'), 'utente.entratel');
    setVal(q('[data-action="cred-campo-input"][data-idx="1"][data-campo="etichetta"]'), 'Password');
    setVal(q('[data-action="cred-campo-input"][data-idx="1"][data-campo="valore"]'), 'PasswordProva123!');
    click(q('[data-action="cred-campo-aggiungi"]'));
    await wait(20);
    setVal(q('[data-action="cred-campo-input"][data-idx="2"][data-campo="etichetta"]'), 'PIN');
    setVal(q('[data-action="cred-campo-input"][data-idx="2"][data-campo="valore"]'), '998877');
    // "+ Aggiungi campo" crea righe già segrete di default (nuovoCampoCredenzialeModal(true)),
    // giusto per un PIN — nessun toggle da cliccare qui.
    setVal(q('#credUrl'), 'https://telematici.agenziaentrate.gov.it');
    click(q('[data-action="salva-credenziale"]'));
    await wait(20);
    assert(window.getSTATE().credenziali.length === nCredPrima + 1, 'nuova credenziale studio non salvata');
    const credStudio = window.getSTATE().credenziali.find(c => c.titolo === 'Entratel - Studio');
    assert(credStudio && credStudio.clienteId === null, 'credenziale studio salvata con dati errati (clienteId dovrebbe essere null)');
    assert(credStudio.campi.length === 3, `attesi 3 campi sulla credenziale Entratel, trovati ${credStudio.campi.length}`);
    const campoUtente = credStudio.campi.find(c => c.etichetta === 'Nome utente');
    const campoPassword = credStudio.campi.find(c => c.etichetta === 'Password');
    const campoPin = credStudio.campi.find(c => c.etichetta === 'PIN');
    assert(campoUtente && campoUtente.valore === 'utente.entratel' && campoUtente.segreto === false, 'campo "Nome utente" salvato con dati errati');
    assert(campoPassword && campoPassword.valore === 'PasswordProva123!' && campoPassword.segreto === true, 'campo "Password" salvato con dati errati');
    assert(campoPin && campoPin.valore === '998877' && campoPin.segreto === true, 'campo "PIN" aggiunto non salvato correttamente (nome personalizzato + segreto)');
    console.log('=== Credenziali: nuova credenziale studio con campi multipli personalizzati (utente/password/PIN) salvata correttamente OK');

    // credenziale legata a un CLIENTE
    click(q('[data-action="nuova-credenziale"]'));
    await wait(20);
    setVal(q('#credTitolo'), 'Home banking cliente');
    setVal(q('#credCliente'), clienteCred.id);
    setVal(q('[data-action="cred-campo-input"][data-idx="0"][data-campo="etichetta"]'), 'IBAN utente');
    setVal(q('[data-action="cred-campo-input"][data-idx="0"][data-campo="valore"]'), 'iban.user');
    setVal(q('[data-action="cred-campo-input"][data-idx="1"][data-campo="etichetta"]'), 'Password');
    setVal(q('[data-action="cred-campo-input"][data-idx="1"][data-campo="valore"]'), 'BancaSegreta1!');
    click(q('[data-action="salva-credenziale"]'));
    await wait(20);
    const credCliente = window.getSTATE().credenziali.find(c => c.titolo === 'Home banking cliente');
    assert(credCliente && credCliente.clienteId === clienteCred.id, 'credenziale legata al cliente non salvata con il clienteId corretto');
    assert(window.document.body.textContent.includes('Cliente Credenziali Test SRL'), 'nome cliente collegato non mostrato nell\'elenco credenziali');
    console.log('=== Credenziali: nuova credenziale legata a un cliente salvata correttamente OK');

    // il valore di un campo "segreto" è mascherato di default, mostra/nascondi funziona per singolo campo
    assert(!window.document.body.textContent.includes('PasswordProva123!'), 'il valore segreto non deve essere visibile in chiaro prima di premere "Mostra"');
    assert(window.document.body.textContent.includes('utente.entratel'), 'il valore di un campo NON segreto (Nome utente) deve essere sempre visibile in chiaro');
    click(q(`[data-action="cred-mostra-campo"][data-id="${credStudio.id}"][data-campo="${campoPassword.id}"]`));
    await wait(20);
    assert(window.document.body.textContent.includes('PasswordProva123!'), 'dopo "Mostra" il valore del campo segreto dovrebbe comparire in chiaro');
    click(q(`[data-action="cred-mostra-campo"][data-id="${credStudio.id}"][data-campo="${campoPassword.id}"]`));
    await wait(20);
    assert(!window.document.body.textContent.includes('PasswordProva123!'), 'dopo aver ricliccato "Mostra/Nascondi" il valore dovrebbe tornare mascherato');
    console.log('=== Credenziali: valore di un campo segreto mascherato di default, mostra/nascondi per singolo campo funzionante OK');

    // copia negli appunti (stub diretto della funzione, stesso motivo di Rubrica sopra)
    const copiatiCred = [];
    const copiaOriginaleCred = window.copiaTestoNegliAppunti;
    window.copiaTestoNegliAppunti = (t) => { copiatiCred.push(t); };
    click(q(`[data-action="cred-copia-campo"][data-id="${credStudio.id}"][data-campo="${campoPassword.id}"]`));
    await wait(20);
    assert(copiatiCred.length === 1 && copiatiCred[0] === 'PasswordProva123!', 'pulsante "Copia" del campo password non ha copiato il valore atteso');
    window.copiaTestoNegliAppunti = copiaOriginaleCred;
    console.log('=== Credenziali: copia valore campo negli appunti funzionante OK');

    // filtro per cliente: "solo studio" nasconde la credenziale legata al cliente
    setVal(q('[data-action="cred-filtro-cliente"]'), '__studio__');
    await wait(20);
    assert(window.document.body.textContent.includes('Entratel - Studio'), 'filtro "solo studio" deve mostrare la credenziale senza cliente');
    assert(!window.document.body.textContent.includes('Home banking cliente'), 'filtro "solo studio" non deve mostrare la credenziale legata a un cliente');
    setVal(q('[data-action="cred-filtro-cliente"]'), 'Tutti');
    await wait(20);
    console.log('=== Credenziali: filtro "solo studio" funzionante OK');

    // eliminazione
    click(q(`[data-action="elimina-credenziale"][data-id="${credStudio.id}"]`));
    await wait(20);
    click(q(`[data-action="elimina-credenziale"][data-id="${credCliente.id}"]`));
    await wait(20);
    assert(window.getSTATE().credenziali.length === nCredPrima, 'eliminazione credenziali non ha ripristinato il conteggio iniziale');
    console.log('=== Credenziali: eliminazione funzionante OK');

    window.eliminaCliente(clienteCred.id);
    window.setView('dashboard');
    await wait(20);
  }

  // ---------- Eliminazione cliente: cascata sui dati personali collegati (gap GDPR fix) ----------
  // Prima la funzione toglieva SOLO il cliente da STATE.clienti, lasciando orfani documenti,
  // comunicazioni, ritenute, task, F24 e contabilità collegati. Si crea un cliente "bersaglio" con
  // almeno una voce per ogni tipo di dato collegabile, un secondo cliente "di controllo" con dati
  // analoghi (per verificare che la cascata non tocchi nulla di altri clienti), e un socio condiviso
  // fra i due (per verificare che si scolleghi solo il legame col cliente eliminato, non la persona).
  // periodicitaIva: 'Trimestrale' garantisce almeno una scadenza IVA periodica generata (serve a
  // testare la ripulitura di scadenzeOverrides più sotto).
  window.aggiungiCliente({ ragioneSociale: 'Cascata Elimina Test SRL', periodicitaIva: 'Trimestrale' });
  const cascBersaglio = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Cascata Elimina Test SRL');
  window.aggiungiCliente({ ragioneSociale: 'Cascata Controllo Test SRL', periodicitaIva: 'Trimestrale' });
  const cascControllo = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Cascata Controllo Test SRL');

  window.aggiungiDocumento({ clienteId: cascBersaglio.id, nome: 'Doc bersaglio', categoria: 'Altro', dataCaricamento: window.oggiISO() });
  window.aggiungiDocumento({ clienteId: cascControllo.id, nome: 'Doc controllo', categoria: 'Altro', dataCaricamento: window.oggiISO() });
  window.aggiungiComunicazione({ clienteId: cascBersaglio.id, data: window.oggiISO(), categoria: 'Generale', stato: 'Inviata', oggetto: 'Com bersaglio', corpo: 'x', visibilePortale: true });
  window.aggiungiComunicazione({ clienteId: cascControllo.id, data: window.oggiISO(), categoria: 'Generale', stato: 'Inviata', oggetto: 'Com controllo', corpo: 'x', visibilePortale: true });
  window.aggiungiF24({ clienteId: cascBersaglio.id, tipo: 'Debito', data: window.oggiISO(), importo: 100, descrizione: 'F24 bersaglio' });
  window.aggiungiF24({ clienteId: cascControllo.id, tipo: 'Debito', data: window.oggiISO(), importo: 100, descrizione: 'F24 controllo' });
  window.getSTATE().ritenuteRighe.push({ id: window.uid('rit'), clienteId: cascBersaglio.id, percipiente: 'Percipiente bersaglio', dataFattura: window.oggiISO(), dataPagamento: window.oggiISO(), numeroFattura: '1', importo: 50, statoRit: 'Da pagare' });
  window.getSTATE().ritenuteRighe.push({ id: window.uid('rit'), clienteId: cascControllo.id, percipiente: 'Percipiente controllo', dataFattura: window.oggiISO(), dataPagamento: window.oggiISO(), numeroFattura: '1', importo: 50, statoRit: 'Da pagare' });
  window.aggiungiTaskTeam({ titolo: 'Task bersaglio', clienteId: cascBersaglio.id, stato: 'Da fare' });
  window.aggiungiTaskTeam({ titolo: 'Task controllo', clienteId: cascControllo.id, stato: 'Da fare' });
  window.aggiornaOnboarding(cascBersaglio.id, 'contrattoFirmato', true);
  window.aggiornaOnboarding(cascControllo.id, 'contrattoFirmato', true);
  window.aggiungiNotaAntiriciclaggio(cascBersaglio.id, 'nota bersaglio');
  window.aggiungiNotaAntiriciclaggio(cascControllo.id, 'nota controllo');
  window.salvaBilancioAnno(cascBersaglio.id, window.getSTATE().annoCorrente, { ricavi: 1000 });
  window.salvaBilancioAnno(cascControllo.id, window.getSTATE().annoCorrente, { ricavi: 1000 });
  window.creaContoCliente(cascBersaglio.id, 'Banca Bersaglio');
  window.creaContoCliente(cascControllo.id, 'Banca Controllo');
  window.registraDocumentoContabile(cascBersaglio.id, 'mastrino', window.oggiISO(), '', window.contiCliente(cascBersaglio.id)[0].id);
  window.registraDocumentoContabile(cascControllo.id, 'mastrino', window.oggiISO(), '', window.contiCliente(cascControllo.id)[0].id);
  window.aggiungiSocio({ nome: 'Socio Condiviso Test', ruolo: 'Socio', clienteIds: [cascBersaglio.id, cascControllo.id] });
  window.aggiungiPreventivo({ clienteId: cascBersaglio.id, tipo: 'Preventivo', oggetto: 'Preventivo bersaglio', servizi: 'x', importo: 100, dataEmissione: window.oggiISO(), stato: 'Bozza' });
  window.aggiungiPreventivo({ clienteId: cascControllo.id, tipo: 'Preventivo', oggetto: 'Preventivo controllo', servizi: 'x', importo: 100, dataEmissione: window.oggiISO(), stato: 'Bozza' });
  const socioCondiviso = window.getSTATE().soci.find(s => s.nome === 'Socio Condiviso Test');
  // Una scadenza periodica e un adempimento annuale del cliente bersaglio, con una nota storica
  // sopra, per verificare che anche scadenzeOverrides/annualiOverrides vengano ripulite.
  const scadBersaglio = window.derivati().tutteScadenze.find(s => s.clienteId === cascBersaglio.id);
  const annBersaglio = window.derivati().annuali.find(a => a.clienteId === cascBersaglio.id);
  assert(scadBersaglio, 'precondizione test cascata: il cliente bersaglio deve avere almeno una scadenza periodica (nessun flag attivo?)');
  window.aggiungiAnnotazioneScadenza(scadBersaglio.id, 'nota da cancellare con la cascata');
  if (annBersaglio) window.aggiornaSottoAdempimento(annBersaglio.id, annBersaglio.sotto[0].nome, { completato: true });

  window.eliminaCliente(cascBersaglio.id);
  const stCasc = window.getSTATE();
  assert(!stCasc.clienti.find(c => c.id === cascBersaglio.id), 'il cliente bersaglio non è stato rimosso');
  assert(!stCasc.documenti.some(d => d.clienteId === cascBersaglio.id), 'documenti del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.comunicazioni.some(c => c.clienteId === cascBersaglio.id), 'comunicazioni del cliente eliminato non ripulite dalla cascata');
  assert(!stCasc.f24.some(f => f.clienteId === cascBersaglio.id), 'F24 del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.ritenuteRighe.some(r => r.clienteId === cascBersaglio.id), 'righe ritenute del cliente eliminato non ripulite dalla cascata');
  assert(!stCasc.taskTeam.some(t => t.clienteId === cascBersaglio.id), 'task team del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.onboarding[cascBersaglio.id], 'onboarding del cliente eliminato non ripulito dalla cascata');
  assert(!stCasc.antiriciclaggio[cascBersaglio.id], 'fascicolo antiriciclaggio del cliente eliminato non ripulito dalla cascata');
  assert(!stCasc.bilanci[cascBersaglio.id], 'bilanci del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.contiCliente[cascBersaglio.id], 'conti del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.documentiContabili[cascBersaglio.id], 'documenti contabili del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.preventivi.some(p => p.clienteId === cascBersaglio.id), 'preventivi/mandati del cliente eliminato non ripuliti dalla cascata');
  assert(!stCasc.scadenzeOverrides[scadBersaglio.id], 'annotazioni/override sulla scadenza del cliente eliminato non ripuliti dalla cascata (chiave rimasta: ' + scadBersaglio.id + ')');
  if (annBersaglio) assert(!stCasc.annualiOverrides[annBersaglio.id], 'override sull\'adempimento annuale del cliente eliminato non ripulito dalla cascata');
  const socioDopo = stCasc.soci.find(s => s.id === socioCondiviso.id);
  assert(socioDopo, 'il socio condiviso è stato cancellato del tutto (doveva restare, solo scollegato dal cliente eliminato)');
  assert(!socioDopo.clienteIds.includes(cascBersaglio.id), 'il socio condiviso è rimasto collegato al cliente eliminato');
  assert(socioDopo.clienteIds.includes(cascControllo.id), 'il socio condiviso ha perso anche il collegamento col cliente di controllo (doveva restarci)');
  // Il cliente di controllo e i suoi dati devono essere del tutto intatti: la cascata non deve
  // "sbordare" su clienti diversi da quello eliminato.
  assert(stCasc.clienti.find(c => c.id === cascControllo.id), 'il cliente di controllo è stato rimosso per errore dalla cascata');
  assert(stCasc.documenti.some(d => d.clienteId === cascControllo.id), 'documenti del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.comunicazioni.some(c => c.clienteId === cascControllo.id), 'comunicazioni del cliente di controllo cancellate per errore dalla cascata');
  assert(stCasc.f24.some(f => f.clienteId === cascControllo.id), 'F24 del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.ritenuteRighe.some(r => r.clienteId === cascControllo.id), 'righe ritenute del cliente di controllo cancellate per errore dalla cascata');
  assert(stCasc.taskTeam.some(t => t.clienteId === cascControllo.id), 'task team del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.onboarding[cascControllo.id], 'onboarding del cliente di controllo cancellato per errore dalla cascata');
  assert(stCasc.antiriciclaggio[cascControllo.id], 'fascicolo antiriciclaggio del cliente di controllo cancellato per errore dalla cascata');
  assert(stCasc.bilanci[cascControllo.id], 'bilanci del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.contiCliente[cascControllo.id], 'conti del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.documentiContabili[cascControllo.id], 'documenti contabili del cliente di controllo cancellati per errore dalla cascata');
  assert(stCasc.preventivi.some(p => p.clienteId === cascControllo.id), 'preventivi/mandati del cliente di controllo cancellati per errore dalla cascata');
  console.log('=== eliminaCliente: cascata su documenti/comunicazioni/F24/ritenute/task/onboarding/antiriciclaggio/bilanci/contabilità/preventivi-mandati/note scadenze OK, socio condiviso solo scollegato, cliente di controllo intatto');

  // ---------- 11n) Tab "Azioni" (task #144): ricerca a parole chiave sulle funzioni dell'app ----------
  click(q('[data-nav="azioni"]'));
  await wait(20);
  assert(q('#azioniInput'), 'tab Azioni: campo di ricerca non trovato');
  assert(qa('#azioniResults .client-row').length > 0, 'tab Azioni: nessun risultato mostrato a registro vuoto (dovrebbe mostrare tutte le azioni)');

  // Cercando "creazione cliente" deve saltare fuori l'azione rapida "+ Nuovo cliente" e, cliccandola,
  // deve aprire ESATTAMENTE la vista Clienti col modale di creazione già aperto (stesso comportamento
  // richiesto esplicitamente da Matteo come esempio guida per questa funzione).
  setVal(q('#azioniInput'), 'creazione cliente');
  await wait(20);
  const risNuovoCliente = qa('#azioniResults .client-row .name').map(el => el.textContent);
  const idxNuovoCliente = risNuovoCliente.findIndex(t => t.includes('Nuovo cliente'));
  assert(idxNuovoCliente !== -1, `tab Azioni: "creazione cliente" non trova "+ Nuovo cliente" tra i risultati (trovati: ${risNuovoCliente.join(' | ')})`);
  click(qa('[data-action="azioni-apri"]')[idxNuovoCliente]);
  await wait(20);
  assert(window.getVIEW() === 'clienti', `tab Azioni: cliccando "+ Nuovo cliente" ci si aspettava la vista clienti, trovata "${window.getVIEW()}"`);
  assert(q('#formCliente'), 'tab Azioni: "+ Nuovo cliente" non ha aperto il modale di creazione cliente');
  window.document.getElementById('modalRoot').innerHTML = ''; // il prossimo giro di ricerca parte pulito
  window.setView('azioni');
  await wait(20);

  // Parola chiave su un'azione rapida diversa (credenziali), per verificare che il matching non
  // funzioni per caso su un solo esempio.
  setVal(q('#azioniInput'), 'password');
  await wait(20);
  const risPassword = qa('#azioniResults .client-row .name').map(el => el.textContent);
  const idxPassword = risPassword.findIndex(t => t.toLowerCase().includes('password'));
  assert(idxPassword !== -1, `tab Azioni: "password" non trova l'azione rapida credenziali (trovati: ${risPassword.join(' | ')})`);
  click(qa('[data-action="azioni-apri"]')[idxPassword]);
  await wait(20);
  assert(window.getVIEW() === 'credenziali', `tab Azioni: cliccando l'azione password ci si aspettava la vista credenziali, trovata "${window.getVIEW()}"`);
  assert(q('#formCredenziale'), 'tab Azioni: l\'azione password non ha aperto il modale nuova credenziale');
  window.document.getElementById('modalRoot').innerHTML = '';
  window.setView('azioni');
  await wait(20);

  // Scorciatoia di semplice navigazione (non creazione): "Vai a Rubrica".
  setVal(q('#azioniInput'), 'rubrica');
  await wait(20);
  const risRubrica = qa('#azioniResults .client-row .name').map(el => el.textContent);
  const idxRubrica = risRubrica.findIndex(t => t.includes('Rubrica'));
  assert(idxRubrica !== -1, `tab Azioni: "rubrica" non trova la voce di navigazione "Vai a Rubrica" (trovati: ${risRubrica.join(' | ')})`);
  click(qa('[data-action="azioni-apri"]')[idxRubrica]);
  await wait(20);
  assert(window.getVIEW() === 'rubrica', `tab Azioni: cliccando "Vai a Rubrica" ci si aspettava la vista rubrica, trovata "${window.getVIEW()}"`);
  window.setView('azioni');
  await wait(20);

  // Nessun risultato: messaggio chiaro, nessun errore.
  setVal(q('#azioniInput'), 'zqxwnonesisteproprio');
  await wait(20);
  assert(qa('#azioniResults .client-row').length === 0, 'tab Azioni: una query senza senso non dovrebbe restituire risultati');
  assert(q('#azioniResults').textContent.toLowerCase().includes('nessuna funzione trovata'), 'tab Azioni: manca il messaggio "nessuna funzione trovata" per una ricerca senza esito');
  console.log('=== Tab Azioni: ricerca a parole chiave su azioni rapide e su navigazione, apertura diretta della funzione corretta, nessun risultato gestito OK');

  // ---------- 11o) Catalogo adempimenti annuali: data predefinita editabile (task #149) ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="catalogo"]'));
  await wait(20);

  // Voce con scadenzaDefault statica (VIDIMAZIONE_LIBRI: 16/3 nel catalogo di default): deve
  // mostrare i controlli mese/giorno, e modificarli deve aggiornare STATE.catalogoAnnuale.
  click(q('[data-action="cat-ann-expand"][data-tipo="VIDIMAZIONE_LIBRI"]'));
  await wait(20);
  const selMeseVL = q('[data-action="cat-ann-mese"][data-tipo="VIDIMAZIONE_LIBRI"]');
  const inputGiornoVL = q('[data-action="cat-ann-giorno"][data-tipo="VIDIMAZIONE_LIBRI"]');
  assert(selMeseVL && inputGiornoVL, 'catalogo annuale: VIDIMAZIONE_LIBRI ha una scadenzaDefault ma non mostra i controlli mese/giorno');
  assert(Number(selMeseVL.value) === 3 && Number(inputGiornoVL.value) === 16, `catalogo annuale: data predefinita di VIDIMAZIONE_LIBRI attesa 16/3, trovata ${inputGiornoVL.value}/${selMeseVL.value}`);
  setVal(selMeseVL, '5');
  setVal(inputGiornoVL, '20');
  await wait(20);
  const vlDopo = window.catalogoAnnualeTutti().find(t => t.chiave === 'VIDIMAZIONE_LIBRI');
  assert(vlDopo.scadenzaDefault.m === 5 && vlDopo.scadenzaDefault.g === 20, `catalogo annuale: modifica data VIDIMAZIONE_LIBRI non salvata in STATE (trovato m=${vlDopo.scadenzaDefault.m} g=${vlDopo.scadenzaDefault.g})`);
  // Il cambiamento deve riflettersi anche nella scadenza generata per un cliente che ha questo
  // adempimento: cliente sintetico creato apposta, per non dipendere da come i dati demo sono
  // stati mutati dalle centinaia di test precedenti in questa stessa suite.
  window.aggiungiCliente({ ragioneSociale: 'Test Vidimazione Libri SRL', adempimentiAnnualiApplicabili: ['VIDIMAZIONE_LIBRI'] });
  await wait(20);
  const clienteVL = window.getSTATE().clienti.find(c => c.ragioneSociale === 'Test Vidimazione Libri SRL');
  assert(clienteVL, 'catalogo annuale: creazione del cliente sintetico per il test data-predefinita non riuscita');
  const annuVL = window.derivati().annuali.find(a => a.clienteId === clienteVL.id && a.tipoChiave === 'VIDIMAZIONE_LIBRI');
  assert(annuVL && annuVL.scadenza && annuVL.scadenza.endsWith('-05-20'), `catalogo annuale: la nuova data (5/20) non si riflette nella scadenza generata per il cliente (trovato ${annuVL && annuVL.scadenza})`);
  window.eliminaCliente(clienteVL.id); // pulizia: non deve restare nei dati per i test successivi
  await wait(20);

  // Voce con resolver dinamico (DIRITTO_CAMERALE): niente controlli data, solo la spiegazione corretta.
  click(q('[data-action="cat-ann-expand"][data-tipo="DIRITTO_CAMERALE"]'));
  await wait(20);
  assert(!q('[data-action="cat-ann-mese"][data-tipo="DIRITTO_CAMERALE"]'), 'catalogo annuale: DIRITTO_CAMERALE (data dinamica per cliente) mostra per errore i controlli mese/giorno');
  const cardDC = q('[data-action="cat-ann-nome"][data-tipo="DIRITTO_CAMERALE"]').closest('.cat-tipo');
  assert(cardDC.textContent.includes('si calcola dalla data scelta per singolo cliente'), 'catalogo annuale: DIRITTO_CAMERALE non mostra la spiegazione "data calcolata per cliente"');

  // Voce senza scadenzaDefault e senza resolver (BILANCIO): niente controlli data, spiegazione diversa (va impostata a mano).
  click(q('[data-action="cat-ann-expand"][data-tipo="BILANCIO"]'));
  await wait(20);
  assert(!q('[data-action="cat-ann-mese"][data-tipo="BILANCIO"]'), 'catalogo annuale: BILANCIO (nessuna scadenza fissa) mostra per errore i controlli mese/giorno');
  const cardBil = q('[data-action="cat-ann-nome"][data-tipo="BILANCIO"]').closest('.cat-tipo');
  assert(cardBil.textContent.includes('va impostata a mano'), 'catalogo annuale: BILANCIO non mostra la spiegazione "va impostata a mano"');
  console.log('=== Catalogo adempimenti annuali: data predefinita editabile per le voci con scadenzaDefault statica, spiegazione corretta per quelle dinamiche/manuali, modifica riflessa nelle scadenze generate OK');

  // ---------- 11p) Impostazioni > Team: flag "consulente" per responsabile (task #145) ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="team"]'));
  await wait(20);
  // Aggiunge un responsabile sintetico direttamente in STATE per non dipendere dal window.prompt().
  window.getSTATE().meta.responsabili.push('Responsabile Test Consulente');
  window.render();
  await wait(20);
  const idxRespTest = window.getSTATE().meta.responsabili.indexOf('Responsabile Test Consulente');
  const chkConsulente = q(`[data-action="toggle-consulente"][data-idx="${idxRespTest}"]`);
  assert(chkConsulente, 'Impostazioni Team: manca la checkbox "Consulente" per il responsabile appena aggiunto');
  assert(!chkConsulente.checked, 'Impostazioni Team: la checkbox "Consulente" di un nuovo responsabile non dovrebbe partire spuntata');
  chkConsulente.checked = true;
  click(chkConsulente);
  await wait(20);
  assert(window.getSTATE().meta.consulenti.includes('Responsabile Test Consulente'), 'Impostazioni Team: spuntare "Consulente" non aggiunge il nome a STATE.meta.consulenti');
  // Rinominare il responsabile deve aggiornare anche il nome dentro meta.consulenti.
  const inputRespTest = q(`[data-action="edit-responsabile"][data-idx="${idxRespTest}"]`);
  setVal(inputRespTest, 'Responsabile Test Consulente Rinominato');
  await wait(20);
  assert(window.getSTATE().meta.consulenti.includes('Responsabile Test Consulente Rinominato'), 'Impostazioni Team: rinominare un responsabile-consulente non aggiorna il nome in STATE.meta.consulenti');
  assert(!window.getSTATE().meta.consulenti.includes('Responsabile Test Consulente'), 'Impostazioni Team: dopo la rinomina resta il vecchio nome in STATE.meta.consulenti');
  // Eliminare il responsabile deve ripulire meta.consulenti (niente nomi fantasma).
  const btnEliminaRespTest = q(`[data-action="elimina-responsabile"][data-idx="${idxRespTest}"]`);
  click(btnEliminaRespTest);
  await wait(20);
  assert(!window.getSTATE().meta.consulenti.includes('Responsabile Test Consulente Rinominato'), 'Impostazioni Team: eliminare un responsabile-consulente lascia un nome fantasma in STATE.meta.consulenti');
  assert(!window.getSTATE().meta.responsabili.includes('Responsabile Test Consulente Rinominato'), 'Impostazioni Team: eliminazione responsabile di test non riuscita');
  console.log('=== Impostazioni Team: checkbox "Consulente" per responsabile, sincronizzata su rinomina ed eliminazione OK');

  // ---------- 11m) Accesso esterno (ngrok) - task #173/#199: pulsanti rimossi, badge tunnel reale
  // separato dalla porta locale, interruttore di avvio automatico, UNA SOLA porta per clienti e
  // collaboratori (task #199) ----------
  // Matteo (#173): "togli il pulsante 'copia comando grok' sia per i clienti che i collaboratori.
  // per i clienti tgli anche il pulsante copia link rete locale [...] vorrei che all'avvio di
  // prisma sia portale clienti che porta collaboratori si attivassero via ngrok [...] e che poi
  // siano correttamente gestibili dalle impostazioni".
  // Matteo (#199, dopo): "ngrok per i clienti non funziona più" / "anche per i collaboratori non
  // va" - causa reale: il piano ngrok gratuito assegna un solo dominio pubblico per account, due
  // tunnel simultanei (uno per porta, come prima) finivano sempre in conflitto. Clienti e
  // collaboratori condividono ora LA STESSA porta/lo stesso tunnel, distinti per percorso.
  {
    window.setHttpSyncAttivoTest(true); // cardAccessoEsterno mostra i dati reali solo con "server locale" simulato acceso
    const fetchOriginaleNgrok = window.fetch;
    const richiesteAutoavvio = [];
    let ngrokAutoavvioMock = false;
    window.fetch = (url, opts) => {
      if (url === '/api/accesso-esterno' && (!opts || !opts.method || opts.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => ({
          ok: true, porta: 8421,
          team: { utente: 'studio', password: 'segreta', attivo: true },
          ngrokAutoavvio: ngrokAutoavvioMock,
        }) });
      }
      if (url === '/api/ngrok-tunnels') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, tunnel: [{ publicUrl: 'https://abc123.ngrok-free.app', porta: 8421 }] }) });
      }
      if (url === '/api/ngrok-autoavvio' && opts && opts.method === 'POST') {
        const corpo = JSON.parse(opts.body);
        richiesteAutoavvio.push(corpo);
        ngrokAutoavvioMock = corpo.ngrokAutoavvio;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, ngrokAutoavvio: ngrokAutoavvioMock }) });
      }
      return fetchOriginaleNgrok(url, opts);
    };
    window.resetAccessoEsternoTest(); // forza un fetch fresco con i mock sopra invece della cache di un giro di test precedente
    window.render();
    await wait(40);

    // Nota: window.document.body.textContent include ANCHE il testo grezzo dentro i <script> (es.
    // il messaggio del toast di copiaLinkNgrok, che cita a parole il vecchio pulsante "📋 Copia
    // comando ngrok" solo come istruzione testuale d'errore) - per questo le verifiche sulla card
    // usano il DOM scoped alla card stessa (data-action reali), non una ricerca di testo sul body.
    const cardNgrok = Array.from(qa('.card')).find(c => (c.querySelector('.section-title') || {}).textContent === 'Accesso esterno (ngrok)');
    assert(cardNgrok, '#173: card "Accesso esterno (ngrok)" non trovata');
    const cardTxt = cardNgrok.textContent;
    assert(!cardTxt.includes('Copia comando ngrok'), '#173: il pulsante "Copia comando ngrok" doveva sparire dalla card');
    assert(!q('[data-action="copia-comando-ngrok"]'), '#173: il data-action "copia-comando-ngrok" non deve più comparire nel DOM');

    // Task #199: UNA sola porta/riga ora, non più una per clienti e una per collaboratori - un solo
    // set di pulsanti "Avvia ngrok"/"Copia link rete locale"/"Copia link ngrok", tutti sulla stessa porta 8421.
    const bottoniAvvia = qa('[data-action="avvia-ngrok"]');
    const bottoniLinkRete = qa('[data-action="copia-link-rete"]');
    const bottoniLinkNgrok = qa('[data-action="copia-link-ngrok"]');
    assert(bottoniAvvia.length === 1 && bottoniAvvia[0].dataset.porta === '8421', `#199: deve restare un solo pulsante "Avvia ngrok" (porta unica 8421), trovati: ${bottoniAvvia.map(b => b.dataset.porta).join(',')}`);
    assert(bottoniLinkRete.length === 1 && bottoniLinkRete[0].dataset.porta === '8421', `#199: deve restare un solo pulsante "Copia link rete locale" (porta unica 8421), trovati: ${bottoniLinkRete.map(b => b.dataset.porta).join(',')}`);
    assert(bottoniLinkNgrok.length === 1 && bottoniLinkNgrok[0].dataset.porta === '8421', `#199: deve restare un solo pulsante "Copia link ngrok" (porta unica 8421), trovati: ${bottoniLinkNgrok.map(b => b.dataset.porta).join(',')}`);

    // Badge: porta locale sempre attiva, tunnel ngrok reale attivo sulla porta 8421 (mock sopra).
    assert(cardTxt.includes('attiva su questo PC'), '#199: manca il badge di porta locale attiva');
    assert(cardTxt.includes('ngrok: raggiungibile da internet'), '#199: manca il badge di tunnel ngrok realmente attivo sulla porta unica (mockata come attiva)');
    assert(cardTxt.includes('Accesso collaboratori attivo'), '#199: manca il badge di accesso collaboratori attivo (mock: credenziali impostate)');
    console.log('=== #199: card Accesso esterno - una sola porta/riga condivisa per clienti e collaboratori, pulsanti e badge coerenti OK');

    // Interruttore di avvio automatico: ora un booleano unico (mock: false), cliccandolo chiama
    // /api/ngrok-autoavvio con {ngrokAutoavvio:true}, non più {team:true}/{clienti:true}.
    const toggleAutoavvio = q('[data-action="ngrok-autoavvio-toggle"]');
    assert(toggleAutoavvio && toggleAutoavvio.checked === false, '#199: interruttore auto-avvio dovrebbe partire NON spuntato (mock: false)');

    toggleAutoavvio.checked = true;
    fire(toggleAutoavvio, 'change');
    await wait(30);
    assert(richiesteAutoavvio.length === 1 && richiesteAutoavvio[0].ngrokAutoavvio === true, '#199: attivare l\'interruttore non ha chiamato /api/ngrok-autoavvio con {ngrokAutoavvio:true}');
    console.log('=== #199: interruttore "avvia ngrok automaticamente all\'avvio" (booleano unico) riflette lo stato dal server e salva il cambiamento OK');

    // Area riservata clienti: menù a tendina, copia link (attiva l'accesso al volo), password qui e non più nel tab Portale.
    const sezCli = q('#sezioneAreaRiservataCliente');
    assert(sezCli, 'manca la sezione "Area riservata clienti" sotto l\'accesso esterno');
    const selCli = sezCli.querySelector('select[data-action="acc-cliente-seleziona"]');
    assert(selCli && selCli.options.length >= 2, 'il menù a tendina deve elencare i clienti');
    const idCli = selCli.options[1].value;
    selCli.value = idCli; fire(selCli, 'change'); await wait(20);
    const cliSel = window.clienteById(idCli);
    cliSel.portaleToken = null;
    const copiati = [];
    window.copiaTestoNegliAppunti = (t) => copiati.push(t);
    click(q('#sezioneAreaRiservataCliente [data-action="copia-link-cliente"][data-modo="ngrok"]'));
    await wait(40);
    assert(/^https:\/\/abc123\.ngrok-free\.app\/portale\/[0-9a-f]{48}$/.test(copiati[0] || ''), `link ngrok cliente errato: ${JSON.stringify(copiati)}`);
    assert(q('#sezioneAreaRiservataCliente input[id^="portPassword_"]'), 'la gestione password deve stare nella sezione impostazioni');
    console.log('=== Impostazioni: area riservata clienti - tendina, copia link ngrok (attiva accesso) e password OK');

    window.fetch = fetchOriginaleNgrok;
    window.resetAccessoEsternoTest();
    window.setHttpSyncAttivoTest(false);
    window.render();
    await wait(20);
  }

  // ---------- 12) Gestione annualità (task #147): aggiungi/rimuovi anno + backup/pulizia dati ----------
  click(q('[data-nav="impostazioni"]'));
  await wait(20);
  click(q('[data-action="imp-sezione"][data-sezione="dati"]'));
  await wait(20);
  const annoDemo = window.getSTATE().annoCorrente;
  const annoFuturo = annoDemo + 7;

  setVal(q('#impNuovoAnno'), String(annoFuturo));
  click(q('[data-action="aggiungi-anno-gestito"]'));
  await wait(20);
  assert(window.getSTATE().meta.anniExtra.includes(annoFuturo), `anno ${annoFuturo} non aggiunto a meta.anniExtra`);
  assert(qa('#annoSelect option').some(o => Number(o.value) === annoFuturo), `anno ${annoFuturo} aggiunto a anniExtra ma non compare nel selettore anno in alto`);

  click(q(`[data-action="rimuovi-anno-gestito"][data-anno="${annoFuturo}"]`));
  await wait(20);
  assert(!window.getSTATE().meta.anniExtra.includes(annoFuturo), `anno ${annoFuturo} non rimosso da meta.anniExtra`);
  console.log(`=== Gestione annualità: anno ${annoFuturo} aggiunto (visibile nel selettore in alto) e poi rimosso OK`);

  // Semina due record sintetici su un'annualità passata isolata (i dati demo vivono tutti
  // sull'anno corrente generato, quindi un'annualità così lontana non ha nulla che possa
  // interferire), per testare rilevamento + export + eliminazione mirata senza toccare il resto.
  const annoTest = annoDemo - 6;
  const clienteTest = window.getSTATE().clienti.find(c => c.stato !== 'cessato');
  const stSeed = window.getSTATE();
  stSeed.comunicazioni.push({ id: 'com-annotest', clienteId: clienteTest.id, gruppoId: null, data: `${annoTest}-03-10`, categoria: 'Generale', stato: 'Pubblicata', visibilePortale: false, oggetto: 'Test annualità', corpo: 'x', note: '' });
  stSeed.f24.push({ id: 'f24-annotest', clienteId: clienteTest.id, tipo: 'Erario', data: `${annoTest}-06-16`, importo: 100, descrizione: 'Test annualità', chiaveAdempimento: null, creatoIl: window.oggiISO() });
  window.salvaStato();
  window.setView('impostazioni'); // forza un render così il selettore "Backup e pulizia" rilegge i nuovi dati
  await wait(20);

  const opzioniAnno = qa('#impAnnoTarget option').map(o => o.value);
  assert(opzioniAnno.includes(String(annoTest)), `annualità sintetica ${annoTest} non rilevata nel selettore "Backup e pulizia di un'annualità" (opzioni trovate: ${opzioniAnno.join(', ')})`);

  setVal(q('#impAnnoTarget'), String(annoTest));

  // Cattura il JSON che l'export scarica davvero (mock della capability "downloads", stesso
  // meccanismo già usato più sopra per salvaFileScaricabile) - serve per testare il reimport (#189)
  // con il file ESATTO che Matteo otterrebbe cliccando "Esporta dati di quest'anno" dal vivo,
  // invece di ricostruirlo a mano nel test (rischio di testare un payload diverso da quello reale).
  assert(typeof window.claude === 'undefined', 'assunzione del test non valida: window.claude non dovrebbe esistere prima del mock');
  let jsonEsportatoAnno = null;
  window.claude = { use: async (nome) => nome === 'downloads' ? { save: async (opts) => { jsonEsportatoAnno = opts.data; return { status: 'saved' }; } } : null };
  click(q('[data-action="esporta-dati-anno"]'));
  await wait(30);
  delete window.claude;
  assert(jsonEsportatoAnno, 'il click su "Esporta dati di quest\'anno" non ha prodotto alcun file');
  const payloadAnno = JSON.parse(jsonEsportatoAnno);
  assert(payloadAnno.annoEsportato === annoTest, 'il backup esportato non riporta l\'anno corretto in annoEsportato');
  assert(payloadAnno.comunicazioni.some(c => c.id === 'com-annotest') && payloadAnno.f24.some(f => f.id === 'f24-annotest'), 'il backup esportato non contiene i record sintetici attesi');

  // Task #189 (Matteo: "se cancello un'annualità vorrei che si disattivasse dalle annualità
  // selezionabili"): simula il caso reale - annualità aggiunta manualmente al selettore in alto
  // (es. per rivederla) e anche correntemente selezionata - dopo l'eliminazione deve sparire da
  // anniExtra E l'anno corrente deve tornare a quello reale, non restare "appeso" su un anno ormai
  // senza dati.
  window.aggiungiAnnoGestito(annoTest);
  assert(window.getSTATE().meta.anniExtra.includes(annoTest), 'setup test non riuscito: annoTest non aggiunto ad anniExtra');
  window.getSTATE().annoCorrente = annoTest;

  const nComPrimaAnno = window.getSTATE().comunicazioni.length;
  const nF24PrimaAnno = window.getSTATE().f24.length;
  const nClientiPrimaAnno = window.getSTATE().clienti.length;
  click(q('[data-action="elimina-dati-anno"]'));
  await wait(20);
  const stDopoElim = window.getSTATE();
  assert(!stDopoElim.comunicazioni.some(c => c.id === 'com-annotest'), `la comunicazione sintetica dell'annualità ${annoTest} non è stata eliminata`);
  assert(!stDopoElim.f24.some(f => f.id === 'f24-annotest'), `l'F24 sintetico dell'annualità ${annoTest} non è stato eliminato`);
  assert(stDopoElim.comunicazioni.length === nComPrimaAnno - 1, 'eliminaDatiAnno ha toccato più/meno comunicazioni del previsto');
  assert(stDopoElim.f24.length === nF24PrimaAnno - 1, 'eliminaDatiAnno ha toccato più/meno F24 del previsto');
  assert(stDopoElim.clienti.length === nClientiPrimaAnno, 'eliminaDatiAnno ha toccato erroneamente le anagrafiche clienti');
  assert(stDopoElim.clienti.some(c => c.id === clienteTest.id), 'eliminaDatiAnno ha rimosso per errore il cliente usato nel test');
  assert(!stDopoElim.meta.anniExtra.includes(annoTest), `#189: l'annualità ${annoTest} eliminata doveva disattivarsi (sparire da anniExtra/selettore in alto)`);
  assert(stDopoElim.annoCorrente === new Date().getFullYear(), '#189: eliminando l\'annualità correntemente selezionata, annoCorrente doveva tornare all\'anno reale');
  console.log(`=== Gestione annualità: rilevamento automatico + export + eliminazione mirata dell'annualità ${annoTest} OK (2 record rimossi, anagrafiche e resto dei dati intatti, annualità disattivata dal selettore)`);

  // Task #189 (Matteo: "aggiungiamo la possibilità di reimportare i dati e assicuriamoci che
  // funzioni correttamente"): reimporta esattamente il file appena esportato (prima della
  // cancellazione) e verifica che i record tornino, SENZA toccare anagrafica/altri dati, e che
  // l'annualità torni selezionabile. Il modal di conferma di importaDatiAnno usa confermaAzione()
  // = window.confirm, già mockato a "sempre OK" dal setup globale della suite (riga 27).
  window.setView('impostazioni');
  await wait(20);
  window.importaDatiAnno({ files: [new window.File([jsonEsportatoAnno], `prisma-backup-annualita-${annoTest}.json`, { type: 'application/json' })] });
  await wait(30);
  const stDopoReimport = window.getSTATE();
  assert(stDopoReimport.comunicazioni.some(c => c.id === 'com-annotest'), `#189: la comunicazione sintetica dell'annualità ${annoTest} non è tornata dopo il reimport`);
  assert(stDopoReimport.f24.some(f => f.id === 'f24-annotest'), `#189: l'F24 sintetico dell'annualità ${annoTest} non è tornato dopo il reimport`);
  assert(stDopoReimport.comunicazioni.length === nComPrimaAnno, '#189: il reimport ha riportato un numero di comunicazioni diverso da quello pre-eliminazione');
  assert(stDopoReimport.f24.length === nF24PrimaAnno, '#189: il reimport ha riportato un numero di F24 diverso da quello pre-eliminazione');
  assert(stDopoReimport.clienti.length === nClientiPrimaAnno, '#189: il reimport ha toccato per errore le anagrafiche clienti');
  assert(stDopoReimport.meta.anniExtra.includes(annoTest), `#189: dopo il reimport l'annualità ${annoTest} dovrebbe ricomparire come selezionabile (anniExtra)`);
  console.log(`=== #189: reimport dei dati dell'annualità ${annoTest} dal backup esportato - record tornati, anagrafiche intatte, annualità riattivata nel selettore OK`);

  // Reimportare di nuovo LO STESSO file non deve creare doppioni (stesso id = ignorato).
  window.importaDatiAnno({ files: [new window.File([jsonEsportatoAnno], `prisma-backup-annualita-${annoTest}.json`, { type: 'application/json' })] });
  await wait(30);
  const stDopoDoppioReimport = window.getSTATE();
  assert(stDopoDoppioReimport.comunicazioni.length === nComPrimaAnno, '#189: un secondo reimport dello stesso file ha duplicato le comunicazioni');
  assert(stDopoDoppioReimport.f24.length === nF24PrimaAnno, '#189: un secondo reimport dello stesso file ha duplicato gli F24');
  console.log('=== #189: un secondo reimport dello stesso file è un no-op sicuro, nessun doppione creato OK');

  // pulizia: rimuovi di nuovo l'annualità sintetica (ora ripristinata dal reimport) per non
  // lasciare residui ai test successivi - confermaAzione()/window.confirm resta mockato a "sempre
  // OK" dal setup globale, quindi l'avviso "nessun backup esportato in questa sessione" non blocca.
  setVal(q('#impAnnoTarget'), String(annoTest));
  click(q('[data-action="elimina-dati-anno"]'));
  await wait(20);

  // Task #188 (Matteo: "se clicco fuori perdo tutti i dati inseriti ed è snervante"): un click sul
  // fondo scuro del modal, o Esc, con dati già digitati deve chiedere conferma invece di chiudere
  // e buttare via tutto in silenzio. Si usa il modal F24 perché ha più campi testuali comodi da
  // sporcare (ricerca cliente + descrizione).
  // Task #203 (Matteo, dopo aver segnalato che su Nuovo cliente "non si riusciva più a scrivere"):
  // la conferma non usa più window.confirm() nativo (che ruba il focus di sistema e non lo
  // restituisce al campo) ma un overlay in stile Prisma (#confermaChiusuraOverlay, pulsanti
  // data-action="conferma-chiusura-annulla"/"conferma-chiusura-conferma") - i test qui sotto
  // cliccano quei pulsanti invece di mockare window.confirm.
  window.setView('f24');
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  assert(q('#fDescrizione'), 'modal F24 non aperto per il test #188');
  // Appena aperto, senza aver toccato nulla: un click sul backdrop deve chiudere subito, senza
  // alcuna conferma (altrimenti ogni apertura/chiusura al volo diventerebbe fastidiosa).
  click(q('.modal-backdrop'));
  await wait(20);
  assert(!q('#confermaChiusuraOverlay'), 'chiudere un modal F24 intonso (nessun dato digitato) non deve mostrare l\'overlay di conferma');
  assert(!q('#fDescrizione'), 'il modal F24 intonso non si è chiuso al click sul backdrop');
  console.log('=== #188: modal F24 intonso si chiude subito al click sul backdrop, senza conferma inutile OK');

  // Riapri, scrivi qualcosa, e verifica che stavolta un click sul backdrop mostri l'overlay di
  // conferma - cliccando "Continua a modificare" il modal deve restare aperto CON il testo intatto.
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  setVal(q('#fDescrizione'), 'Saldo IVA test #188');
  click(q('.modal-backdrop'));
  await wait(20);
  assert(q('#confermaChiusuraOverlay'), 'chiudere un modal F24 con dati digitati deve mostrare l\'overlay di conferma (task #203)');
  assert(q('.conferma-chiusura-testo').textContent.includes('chiudere comunque senza salvare'), 'testo dell\'overlay di conferma mancante o cambiato');
  click(q('[data-action="conferma-chiusura-annulla"]'));
  await wait(20);
  assert(!q('#confermaChiusuraOverlay'), '"Continua a modificare" non ha chiuso l\'overlay di conferma');
  assert(q('#fDescrizione'), 'il modal si è chiuso nonostante "Continua a modificare" (dati persi)');
  assert(q('#fDescrizione').value === 'Saldo IVA test #188', 'il testo digitato è andato perso nonostante "Continua a modificare"');
  console.log('=== #188/#203: click sul backdrop con dati digitati mostra l\'overlay di conferma in stile Prisma, e "Continua a modificare" lascia il modal aperto coi dati intatti OK');

  // Stavolta clicca "Chiudi senza salvare": il modal deve chiudersi normalmente.
  click(q('.modal-backdrop'));
  await wait(20);
  assert(q('#confermaChiusuraOverlay'), 'la seconda chiusura non ha mostrato l\'overlay di conferma (snapshot non riaggiornato?)');
  click(q('[data-action="conferma-chiusura-conferma"]'));
  await wait(20);
  assert(!q('#confermaChiusuraOverlay'), 'l\'overlay di conferma non si è chiuso dopo "Chiudi senza salvare"');
  assert(!q('#fDescrizione'), 'il modal non si è chiuso nonostante "Chiudi senza salvare"');
  console.log('=== #188: su "Chiudi senza salvare" il modal si chiude normalmente OK');

  // Stessa identica protezione deve valere per il tasto Esc, non solo per il click sul backdrop -
  // e un secondo Esc (con l'overlay già aperto) deve chiudere SOLO l'overlay (scelta sicura),
  // mai il modal sottostante.
  click(q('[data-action="nuovo-f24"]'));
  await wait(20);
  setVal(q('#fDescrizione'), 'Altro test Esc #188');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert(q('#confermaChiusuraOverlay'), 'Esc con dati digitati deve mostrare l\'overlay di conferma come il click sul backdrop');
  assert(q('#fDescrizione') && q('#fDescrizione').value === 'Altro test Esc #188', 'Esc ha già chiuso/perso i dati prima ancora della scelta sull\'overlay');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(20);
  assert(!q('#confermaChiusuraOverlay'), 'un secondo Esc deve chiudere l\'overlay di conferma (scelta sicura), non riaprirne un altro');
  assert(q('#fDescrizione') && q('#fDescrizione').value === 'Altro test Esc #188', 'il secondo Esc ha chiuso/svuotato il modal sottostante invece di limitarsi a chiudere l\'overlay');
  click(q('.modal-backdrop')); // riapre l'overlay di conferma, stavolta la si accetta
  await wait(20);
  click(q('[data-action="conferma-chiusura-conferma"]'));
  await wait(20);
  assert(!q('#fDescrizione'), 'conferma accettata dopo Esc non ha chiuso il modal');
  console.log('=== #188/#203: stessa protezione applicata anche al tasto Esc, incluso un secondo Esc che chiude solo l\'overlay OK');

  // Task #197 (regressione segnalata da Matteo: "quando ci sono delle finestre aggiuntive per
  // creare task, clienti, eventi ecc. se clicco fuori dalla finestra queste si chiudono ancora"):
  // il test #188 sopra copriva solo il modal F24. Qui si ripete la stessa identica protezione sui
  // tre modal che Matteo ha nominato esplicitamente, per bloccarla con un test anche lì.
  {
    // --- Cliente ---
    window.setView('clienti');
    await wait(20);
    click(q('[data-action="nuovo-cliente"]'));
    await wait(20);
    assert(q('#fRagioneSociale'), 'modal Nuovo cliente non aperto per il test #197');
    setVal(q('#fRagioneSociale'), 'Prova Regressione #197 SRL');
    click(q('.modal-backdrop'));
    await wait(20);
    assert(q('#confermaChiusuraOverlay'), 'Task #197: chiudere il modal Cliente con dati digitati deve mostrare l\'overlay di conferma (task #203)');
    assert(q('#fRagioneSociale') && q('#fRagioneSociale').value === 'Prova Regressione #197 SRL', 'Task #197: dati del modal Cliente persi appena mostrato l\'overlay');
    click(q('[data-action="conferma-chiusura-conferma"]'));
    await wait(20);
    assert(!q('#fRagioneSociale'), 'Task #197: il modal Cliente non si è chiuso dopo "Chiudi senza salvare"');
    console.log('=== #197/#203: modal "Nuovo cliente" mostra l\'overlay di conferma al click sul backdrop con dati digitati OK');

    // --- Task ---
    window.setView('taskteam');
    await wait(20);
    click(q('[data-action="nuovo-task-team"]'));
    await wait(20);
    assert(q('#tTitolo'), 'modal Nuovo task non aperto per il test #197');
    setVal(q('#tTitolo'), 'Prova regressione task #197');
    click(q('.modal-backdrop'));
    await wait(20);
    assert(q('#confermaChiusuraOverlay'), 'Task #197: chiudere il modal Task con dati digitati deve mostrare l\'overlay di conferma');
    assert(q('#tTitolo') && q('#tTitolo').value === 'Prova regressione task #197', 'Task #197: dati del modal Task persi appena mostrato l\'overlay');
    click(q('[data-action="conferma-chiusura-conferma"]'));
    await wait(20);
    assert(!q('#tTitolo'), 'Task #197: il modal Task non si è chiuso dopo "Chiudi senza salvare"');
    console.log('=== #197/#203: modal "Nuovo task" mostra l\'overlay di conferma al click sul backdrop con dati digitati OK');

    // --- Evento: appuntamento (default all'apertura) ---
    window.apriModalNuovoEvento(window.oggiISO ? window.oggiISO() : '2026-01-15');
    await wait(20);
    assert(q('#nevOggetto'), 'modal Nuovo evento (appuntamento) non aperto per il test #197');
    setVal(q('#nevOggetto'), 'Prova regressione evento #197');
    click(q('.modal-backdrop'));
    await wait(20);
    assert(q('#confermaChiusuraOverlay'), 'Task #197: chiudere il modal Evento (appuntamento) con dati digitati deve mostrare l\'overlay di conferma');
    assert(q('#nevOggetto') && q('#nevOggetto').value === 'Prova regressione evento #197', 'Task #197: dati del modal Evento persi appena mostrato l\'overlay');
    click(q('[data-action="conferma-chiusura-conferma"]'));
    await wait(20);
    assert(!q('#nevOggetto'), 'Task #197: il modal Evento (appuntamento) non si è chiuso dopo "Chiudi senza salvare"');
    console.log('=== #197/#203: modal "Nuovo evento" (appuntamento) mostra l\'overlay di conferma al click sul backdrop con dati digitati OK');

    // --- Evento: scadenza ricorrente, DOPO aver cambiato tipo dentro al modal (self-refresh del
    // sotto-form #nuovoEventoForm, non di #modalRoot - il caso più a rischio per MODAL_SNAPSHOT) ---
    window.apriModalNuovoEvento(window.oggiISO ? window.oggiISO() : '2026-01-15');
    await wait(20);
    click(q('[data-action="nuovo-evento-tipo"][data-tipo="scadenza"]'));
    await wait(20);
    assert(q('#nevScadNome'), 'modal Nuovo evento (scadenza) non aperto dopo il cambio tipo per il test #197');
    setVal(q('#nevScadNome'), 'Prova regressione scadenza #197');
    click(q('.modal-backdrop'));
    await wait(20);
    assert(q('#confermaChiusuraOverlay'), 'Task #197: chiudere il modal Evento (scadenza, dopo cambio tipo) con dati digitati deve mostrare l\'overlay di conferma');
    assert(q('#nevScadNome') && q('#nevScadNome').value === 'Prova regressione scadenza #197', 'Task #197: dati del modal Evento (scadenza) persi appena mostrato l\'overlay');
    click(q('[data-action="conferma-chiusura-conferma"]'));
    await wait(20);
    assert(!q('#nevScadNome'), 'Task #197: il modal Evento (scadenza) non si è chiuso dopo "Chiudi senza salvare"');
    console.log('=== #197/#203: modal "Nuovo evento" (scadenza, dopo cambio tipo a metà modulo) mostra l\'overlay di conferma correttamente OK');

    window.setView('dashboard');
    await wait(20);
  }

  console.log('\n✅ TUTTI I TEST END-TO-END PASSATI (' + errors.length + ' errori console catturati)');
  if (errors.length) {
    console.log('--- Dettaglio errori console/jsdom catturati durante il test ---');
    errors.forEach(e => console.log(' -', e));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST FALLITO:', err.message);
  console.error(err.stack);
  console.error('\n--- Errori console/jsdom catturati ---');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
});
