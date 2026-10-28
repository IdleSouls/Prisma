'use strict';
/* -------------------- CHAT INTERNA -------------------- */
/* Messaggistica diretta tra i responsabili dello studio (task Matteo, chat interna) - conversazioni
   1-a-1 tra nomi in STATE.meta.responsabili, niente gruppi. Ogni messaggio ha "da"/"a" (nomi),
   "testo", "data" (YYYY-MM-DD, per il raggruppamento stile WhatsApp) e "oraCreazione" (ISO completo,
   per l'ordinamento esatto e l'ora mostrata sul singolo messaggio). "letto" distingue i messaggi
   ricevuti non ancora aperti (badge nella nav e accanto al contatto). */
function aggiungiChatMessaggio(da, a, testo) {
  const t = String(testo || '').trim();
  if (!da || !a || !t) return null;
  const ora = new Date();
  const msg = { id: uid('chat'), da, a, testo: t, data: oggiISO(), oraCreazione: ora.toISOString(), letto: false };
  STATE.chatMessaggi.push(msg);
  salvaStato();
  return msg;
}
function segnaChatLetta(con) {
  const io = operatoreCorrente();
  if (!io) return;
  let cambiato = false;
  STATE.chatMessaggi.forEach(m => {
    if (m.da === con && m.a === io && !m.letto) { m.letto = true; cambiato = true; }
  });
  if (cambiato) salvaStato();
}
// Messaggi non letti indirizzati all'operatore corrente, raggruppati per mittente - usato sia per il
// pallino/numero nella nav sia per il badge accanto a ogni contatto nella lista chat.
function chatNonLettiPerContatto() {
  const io = operatoreCorrente();
  if (!io) return {};
  const conteggio = {};
  STATE.chatMessaggi.forEach(m => {
    if (m.a === io && !m.letto) conteggio[m.da] = (conteggio[m.da] || 0) + 1;
  });
  return conteggio;
}
function chatTotaleNonLetti() {
  return Object.values(chatNonLettiPerContatto()).reduce((s, n) => s + n, 0);
}
function eliminaF24(id) {
  const f = STATE.f24.find(x => x.id === id);
  if (f && f.filePercorso) {
    // Simmetrico a eliminaComunicazione: non cancellare il file se è ancora referenziato dalla
    // comunicazione che lo ha condiviso con questo F24.
    const condivisoConCom = STATE.comunicazioni.some(c => c.filePercorso === f.filePercorso);
    if (!condivisoConCom) eliminaFileReale(f.filePercorso);
  }
  STATE.f24 = STATE.f24.filter(x => x.id !== id);
  salvaStato();
}
/* Credenziali (task #134): un database libero di account/password dello studio o dei clienti -
   Entratel, Telemaco, home banking, software gestionali, portali vari. La password viaggia in
   chiaro qui e in STATE (serve poterla mostrare/copiare), ma quando gira il server locale viene
   cifrata prima di toccare il disco (vedi cifraCredenziale/decifraCredenziale in server.js) - se
   invece l'app è aperta come semplice file .html, resta solo in localStorage come tutto il resto. */
function aggiungiCredenziale(c) {
  const nuovo = Object.assign({ id: uid('cred'), creatoIl: oggiISO() }, c);
  STATE.credenziali.push(nuovo);
  salvaStato();
  return nuovo;
}
function aggiornaCredenziale(id, patch) {
  const c = STATE.credenziali.find(x => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  salvaStato();
}
function eliminaCredenziale(id) {
  STATE.credenziali = STATE.credenziali.filter(x => x.id !== id);
  salvaStato();
}
/* Catalogo attività dello studio (task #138), vedi catalogoAttivitaStudioDefault per il perché
   di richiedeMandato. CRUD semplice, stesso pattern di credenziali/regole importi statutari. */
function aggiungiAttivitaCatalogo(a) {
  const nuovo = Object.assign({ id: uid('att') }, a);
  STATE.catalogoAttivitaStudio.push(nuovo);
  salvaStato();
  return nuovo;
}
function aggiornaAttivitaCatalogo(id, patch) {
  const a = STATE.catalogoAttivitaStudio.find(x => x.id === id);
  if (!a) return;
  Object.assign(a, patch);
  salvaStato();
}
function eliminaAttivitaCatalogo(id) {
  STATE.catalogoAttivitaStudio = STATE.catalogoAttivitaStudio.filter(x => x.id !== id);
  salvaStato();
}
/* Soci/referenti: persone (soci, amministratori, collaboratori familiari, referenti) collegabili
   a uno o più clienti — una persona può comparire su più aziende (es. socio di due SRL diverse).
   Solo anagrafica/contatti: non pilota flag fiscali né scadenze, che restano sul cliente. */
function aggiungiSocio(s) {
  const nuovo = Object.assign({ id: uid('socio'), creatoIl: oggiISO() }, s);
  STATE.soci.push(nuovo);
  salvaStato();
  return nuovo;
}
/* Cariche (organi sociali): amministratori, organo di controllo, soci con quota. Una per persona e ruolo su un cliente. */
function aggiungiCarica(k) {
  if (!STATE.cariche) STATE.cariche = [];
  const nuova = Object.assign({ id: uid('carica'), creatoIl: oggiISO() }, k);
  STATE.cariche.push(nuova);
  const p = STATE.soci.find(x => x.id === nuova.socioId);
  if (p && !(p.clienteIds || []).includes(nuova.clienteId)) p.clienteIds = (p.clienteIds || []).concat(nuova.clienteId);
  salvaStato();
  return nuova;
}
function aggiornaCarica(id, patch) { const k = (STATE.cariche || []).find(x => x.id === id); if (!k) return; Object.assign(k, patch); salvaStato(); }
function eliminaCarica(id) { STATE.cariche = (STATE.cariche || []).filter(x => x.id !== id); salvaStato(); }
function aggiornaSocio(id, patch) {
  const s = STATE.soci.find(x => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  salvaStato();
}
function eliminaSocio(id) {
  STATE.soci = STATE.soci.filter(x => x.id !== id);
  STATE.cariche = (STATE.cariche || []).filter(k => k.socioId !== id);
  salvaStato();
}
function sociDiCliente(clienteId) {
  return (STATE.soci || []).filter(s => (s.clienteIds || []).includes(clienteId));
}

/* Clienti: a differenza delle entità sopra, creazione e modifica sono sempre passate solo dal
   form (leggiFormCliente, che legge dal DOM) — le tre funzioni sotto sono l'equivalente "puro",
   senza alcuna lettura DOM, stesso schema aggiungiX/aggiornaX/eliminaX di tutto il resto. Usate
   sia dal form (che ora ci passa i dati già letti) sia dal ponte comandi per l'MCP locale (vedi
   eseguiComandoMCP): un cliente creato/modificato da Claude passa esattamente di qui, non da una
   copia parallela della logica. I default ricalcano quelli di clienteDaRigaImport (import Excel),
   l'altro punto che crea clienti senza passare dal form.  */
function aggiungiCliente(dati) {
  const base = {
    tipo: 'ditta_individuale', codiceFiscale: '', partitaIva: '', atecoCodici: [], naturaGiuridica: '',
    settore: '', annoIngresso: null, canaleAcquisizione: '', mandatario: '', capitaleSociale: null, numeroSedi: 0,
    preventivoAnnuo: null, regimeFiscale: '',
    contatti: { email: '', emailAmministrazione: '', pec: '', telefono: '', indirizzo: '', cap: '', localita: '', provincia: '' },
    responsabileStudio: STATE.meta.responsabili[0] || '', stato: 'attivo', addebitoF24: 'NOI', pacchettoPortale: false,
    contabilita: 'ESTERNA', periodicitaIva: '', periodicitaIntrastat: 'N.A.', previdenza: 'No previdenza',
    flags: {}, dirittoCameraleScelta: null, versamentoImposteScelta: null, adempimentiAnnualiApplicabili: [], note: '',
  };
  const cliente = Object.assign(base, dati, { id: uid('cli'), creatoIl: oggiISO() });
  STATE.clienti.push(cliente);
  salvaStato();
  return cliente;
}
function aggiornaCliente(id, patch) {
  const c = clienteById(id);
  if (!c) return null;
  Object.assign(c, patch);
  salvaStato();
  return c;
}
/* Cancellazione cliente con cascata sui dati personali collegati (gap GDPR individuato dall'audit
   compliance: prima questa funzione toglieva SOLO il cliente da STATE.clienti, lasciando orfani
   documenti, comunicazioni, ritenute, task, F24, contabilità e le note storiche su scadenze/annuali
   — tutti dati che possono contenere informazioni personali su persone fisiche (titolare, soci,
   dipendenti nelle buste paga) e che un "cancella cliente" deve portare via con sé, non lasciare
   in giro senza più un'anagrafica a cui sono collegati). Non tocca STATE.soci: una persona lì può
   essere collegata anche ad altri clienti (clienteIds è un array), quindi si toglie solo il
   collegamento con QUESTO cliente, non l'intera scheda socio/referente. */
function eliminaCliente(id) {
  // File fisici (se server.js è attivo): stessa logica "non cancellare se condiviso" già usata da
  // eliminaComunicazione/eliminaF24 per non rompere link incrociati tra le due entità.
  STATE.documenti.filter(d => d.clienteId === id).forEach(d => { if (d.filePercorso) eliminaFileReale(d.filePercorso); });
  STATE.comunicazioni.filter(c => c.clienteId === id).forEach(c => {
    if (c.filePercorso && !STATE.f24.some(f => f.filePercorso === c.filePercorso && f.clienteId !== id)) eliminaFileReale(c.filePercorso);
  });
  STATE.f24.filter(f => f.clienteId === id).forEach(f => {
    if (f.filePercorso && !STATE.comunicazioni.some(c => c.filePercorso === f.filePercorso && c.clienteId !== id)) eliminaFileReale(f.filePercorso);
  });
  (STATE.documentiContabili[id] || []).forEach(d => { if (d.filePercorso) eliminaFileReale(d.filePercorso); });

  // Entità in array, filtrate via clienteId diretto sull'oggetto.
  STATE.documenti = STATE.documenti.filter(d => d.clienteId !== id);
  STATE.comunicazioni = STATE.comunicazioni.filter(c => c.clienteId !== id);
  STATE.f24 = STATE.f24.filter(f => f.clienteId !== id);
  STATE.ritenuteRighe = STATE.ritenuteRighe.filter(r => r.clienteId !== id);
  STATE.taskTeam = STATE.taskTeam.filter(t => t.clienteId !== id);
  STATE.preventivi = STATE.preventivi.filter(p => p.clienteId !== id);
  STATE.incassi = (STATE.incassi || []).filter(i => i.clienteId !== id);
  STATE.attivitaFatturabili = (STATE.attivitaFatturabili || []).filter(a => a.clienteId !== id);
  STATE.libriSociali = (STATE.libriSociali || []).filter(l => l.clienteId !== id);
  if (STATE.accettazioni) delete STATE.accettazioni[id];
  if (STATE.cpb) delete STATE.cpb[id];
  if (STATE.imposte) STATE.imposte = STATE.imposte.filter(r => r.clienteId !== id);

  // Entità tenute in oggetti indicizzati per clienteId: basta togliere la chiave.
  delete STATE.onboarding[id];
  delete STATE.antiriciclaggio[id];
  delete STATE.bilanci[id];
  delete STATE.contoMappings[id];
  delete STATE.movimentiContabili[id];
  delete STATE.fattureContabili[id];
  delete STATE.importProfili[id];
  delete STATE.documentiContabili[id];
  delete STATE.contiCliente[id];

  // scadenzeOverrides/annualiOverrides sono chiavi composite "campo1|clienteId|campo3" (vedi
  // chiaveScadenza e generaAdempimentiAnnuali): il clienteId è sempre il secondo segmento, quindi
  // si individuano senza dover ricostruire le scadenze/annuali derivate per ogni anno passato.
  Object.keys(STATE.scadenzeOverrides).forEach(k => { if (k.split('|')[1] === id) delete STATE.scadenzeOverrides[k]; });
  Object.keys(STATE.annualiOverrides).forEach(k => { if (k.split('|')[1] === id) delete STATE.annualiOverrides[k]; });

  // Soci/referenti: si scollega il cliente eliminato, non si tocca la persona (può essere
  // collegata ad altri clienti, o restare come contatto anche senza incarichi attivi).
  STATE.soci.forEach(s => { s.clienteIds = (s.clienteIds || []).filter(cid => cid !== id); });

  STATE.clienti = STATE.clienti.filter(c => c.id !== id);
  salvaStato();
}
/* Token di accesso al portale cliente reale (task #87): a differenza di uid() — pensato per id
   interni dove conta evitare collisioni, non l'imprevedibilità — questo è un vero token di
   sicurezza che finisce in un link mandato al cliente, quindi serve un generatore
   crittograficamente robusto (Math.random() NON lo è). 24 byte casuali = 192 bit, ampiamente
   sufficiente perché indovinarlo per tentativi sia impraticabile. */
function generaTokenPortale() {
  const cripto = (typeof window !== 'undefined' && window.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
  const bytes = new Uint8Array(24);
  if (cripto && cripto.getRandomValues) {
    cripto.getRandomValues(bytes);
  } else {
    // Ripiego solo per ambienti senza Web Crypto (non dovrebbe mai servire in un browser vero):
    // meglio di niente, ma va sostituito se questo ramo viene davvero eseguito.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
/* Attiva (o rigenera) l'accesso portale per un cliente: un nuovo token rende ISTANTANEAMENTE
   inutilizzabile qualunque link mandato in precedenza (il vecchio token non corrisponde più a
   nessun cliente), quindi "rigenera" è anche il modo per revocare un link che si teme sia finito
   nelle mani sbagliate senza disattivare del tutto l'accesso. */
function attivaPortaleCliente(id) {
  const c = clienteById(id);
  if (!c) return null;
  c.portaleToken = generaTokenPortale();
  if (!c.portaleAttivatoIl) c.portaleAttivatoIl = oggiISO();
  salvaStato();
  return c;
}
function disattivaPortaleCliente(id) {
  const c = clienteById(id);
  if (!c) return null;
  c.portaleToken = null;
  salvaStato();
  return c;
}

/* -------------------- ACCESSI PORTALE DIVERSIFICATI (richiesta Matteo) --------------------
   L'accesso "principale" sopra (c.portaleToken/c.portalePassword) resta invariato: è chi ha
   accesso completo (tipicamente il legale rappresentante), e tutto il comportamento esistente
   per lui non cambia di una virgola. Qui si aggiunge, in modo puramente ADDITIVO, la possibilità
   di dare allo stesso cliente uno o più accessi SECONDARI con un proprio link/password e visibili
   solo su un sottoinsieme di sezioni del portale (es. "amministrazione": solo comunicazioni,
   scadenze/F24 e documenti, non l'andamento economico) — c.accessiSecondari è un array, letto
   sempre difensivamente con `|| []` come già fatto altrove in questo file per campi opzionali, non
   serve una migrazione: un cliente esistente semplicemente non ne ha ancora nessuno. */
const SEZIONI_PORTALE_LIMITABILI = [
  { id: 'comunicazioni', label: 'Comunicazioni' },
  { id: 'scadenze', label: 'Scadenze e F24' },
  { id: 'documenti', label: 'Documenti' },
  { id: 'andamento', label: 'Andamento (bilanci e KPI)' },
];
function nuovoAccessoSecondarioPortale(clienteId, nome) {
  const c = clienteById(clienteId);
  if (!c) return null;
  if (!Array.isArray(c.accessiSecondari)) c.accessiSecondari = [];
  const accesso = {
    id: uid('accp'), nome: (nome || '').trim() || 'Accesso limitato',
    token: generaTokenPortale(), password: null,
    ruolo: 'limitato', tabConsentiti: ['comunicazioni', 'scadenze', 'documenti'],
    attivo: true, creatoIl: oggiISO(),
  };
  c.accessiSecondari.push(accesso);
  salvaStato();
  return accesso;
}
function aggiornaAccessoSecondarioPortale(clienteId, accessoId, patch) {
  const c = clienteById(clienteId);
  const a = c && (c.accessiSecondari || []).find(x => x.id === accessoId);
  if (!a) return null;
  Object.assign(a, patch);
  salvaStato();
  return a;
}
function rigeneraAccessoSecondarioPortale(clienteId, accessoId) {
  return aggiornaAccessoSecondarioPortale(clienteId, accessoId, { token: generaTokenPortale() });
}
function eliminaAccessoSecondarioPortale(clienteId, accessoId) {
  const c = clienteById(clienteId);
  if (!c) return;
  c.accessiSecondari = (c.accessiSecondari || []).filter(x => x.id !== accessoId);
  salvaStato();
}
/* Risolve un token del portale esterno in {cliente, accesso}, cercando prima nell'accesso
   principale (comportamento invariato) e poi negli accessi secondari attivi di ogni cliente. Per
   l'accesso principale costruisce un oggetto "accesso" sintetico con ruolo 'completo' — così tutto
   il resto del codice (costruisciVistaPortaleClienteEsterna, risolviDocumentoPortaleEsterno, ecc.)
   può trattare i due casi in modo identico invece di duplicare la logica. */
function trovaAccessoPortale(token) {
  if (!token || typeof token !== 'string') return null;
  for (const c of STATE.clienti) {
    if (c.portaleToken && c.portaleToken === token) {
      return { cliente: c, accesso: { id: null, nome: 'Accesso principale', ruolo: 'completo', tabConsentiti: [], password: c.portalePassword || null } };
    }
    const extra = (c.accessiSecondari || []).find(a => a.attivo !== false && a.token === token);
    if (extra) return { cliente: c, accesso: extra };
  }
  return null;
}
function accessoPortalePuoVedere(accesso, sezione) {
  if (!accesso) return false;
  if (accesso.ruolo === 'completo') return true;
  return (accesso.tabConsentiti || []).includes(sezione);
}

/* -------------------- 4) RENDER — shell + nav -------------------- */
const NAV = [
  { group: 'Oggi', items: [
    { id: 'oggi', label: 'Il mio lavoro', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9l1.8 1.8L13 7.6"/><path d="M8 15h8"/></svg>' },
    { id: 'dashboard', label: 'Dashboard', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' },
    { id: 'calendario', label: 'Calendario', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></svg>' },
  ]},
  { group: 'Clienti', items: [
    { id: 'clienti', label: 'Clienti', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>' },
    { id: 'rubrica', label: 'Rubrica', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="16" rx="2"/><circle cx="10" cy="10" r="2.3"/><path d="M6.5 16c0-2 1.6-3.4 3.5-3.4s3.5 1.4 3.5 3.4"/><line x1="19" y1="8" x2="21.5" y2="8"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="19" y1="16" x2="21.5" y2="16"/></svg>' },
    { id: 'schedacliente', label: 'Scheda cliente', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>' },
    { id: 'soci', label: 'Soci e referenti', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M14.8 14.3c2.6.3 4.7 2.3 4.7 5.2"/></svg>' },
  ]},
  { group: 'Adempimenti', items: [
    { id: 'scadenze', label: 'Scadenze periodiche', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>' },
    { id: 'annuali', label: 'Adempimenti annuali', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.5 2.5 5.5-6"/></svg>' },
    { id: 'ritenute', label: 'Ritenute d\'acconto', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/><line x1="18" y1="6" x2="6" y2="18"/></svg>' },
    { id: 'f24', label: 'F24', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z"/><path d="M14 2.5v5h5"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>' },
    { id: 'cpb', label: 'Concordato preventivo', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>' },
    { id: 'imposte', label: 'Imposte calcolate', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="12" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/><line x1="15" y1="12" x2="16" y2="12"/><line x1="15" y1="16" x2="16" y2="16"/></svg>' },
  ]},
  { group: 'Relazione cliente', items: [
    { id: 'onboarding', label: 'Onboarding', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>' },
    { id: 'antiriciclaggio', label: 'Antiriciclaggio', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3.2v5.3c0 4.6-3 8.8-7 10-4-1.2-7-5.4-7-10V6.2z"/><path d="M9.2 12l2 2 3.6-4.2"/></svg>' },
    { id: 'comunicazioni', label: 'Comunicazioni', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 6.5l9 6.5 9-6.5"/></svg>' },
    { id: 'documenti', label: 'Documenti', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/></svg>' },
    { id: 'libri', label: 'Libri sociali', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/></svg>' },
    { id: 'portale', label: 'Portale cliente', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2"/><line x1="3" y1="8.5" x2="21" y2="8.5"/><circle cx="6" cy="6.5" r=".6" fill="currentColor" stroke="none"/><circle cx="8.2" cy="6.5" r=".6" fill="currentColor" stroke="none"/></svg>' },
  ]},
  { group: 'Fatturazione', items: [
    { id: 'preventivi', label: 'Preventivi e mandati', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z"/><path d="M14 2.5v5h5"/><path d="M8 12.5l2.5 2.5 5.5-6"/></svg>' },
    { id: 'fatturazione', label: 'Da fatturare', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>' },
    { id: 'incassi', label: 'Incassi', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>' },
  ]},
  { group: 'Analisi', items: [
    { id: 'cruscotto', label: 'Cruscotto titolare', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' },
    { id: 'bilanci', label: 'Bilanci & KPI', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="13" width="3.5" height="7"/><rect x="10.2" y="8" width="3.5" height="12"/><rect x="15.4" y="4" width="3.5" height="16"/></svg>' },
    { id: 'contabilita', label: 'Contabilità', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2"/><line x1="7" y1="6.5" x2="17" y2="6.5"/><circle cx="7.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="7.5" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="7.5" cy="19" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="19" r=".9" fill="currentColor" stroke="none"/></svg>' },
  ]},
  { group: 'Squadra', items: [
    { id: 'taskteam', label: 'Task team', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.3"/><rect x="9.5" y="4" width="5" height="10" rx="1.3"/><rect x="16" y="4" width="5" height="13" rx="1.3"/></svg>' },
    { id: 'chat', label: 'Chat interna', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4.5 4v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/></svg>' },
    { id: 'procedure', label: 'Procedure interne', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5h6a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 9 3.5z"/><path d="M8.5 8.5h7"/><path d="M9.3 12.2l1.6 1.6 3-3.4"/></svg>' },
    { id: 'carico', label: 'Carico di lavoro', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/></svg>' },
  ]},
  { group: 'Sistema', items: [
    { id: 'modelli', label: 'Modelli documenti', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z"/><path d="M14 2.5v5h5"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="19" x2="12.5" y2="19"/></svg>' },
    { id: 'strumenti', label: 'Strumenti', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-2-.6-.6-2z"/></svg>' },
    { id: 'credenziali', label: 'Password', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/><circle cx="12" cy="15.3" r="1.3" fill="currentColor" stroke="none"/></svg>' },
    { id: 'impostazioni', label: 'Impostazioni e backup', ic:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="1.8"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="1.8"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="1.8"/></svg>' },
  ]},
];
const PAGE_TITLES = {
  oggi: ['Il mio lavoro', 'Le tue scadenze, i tuoi task e i messaggi da leggere: quello che tocca a te'],
  cruscotto: ['Cruscotto titolare', 'La situazione dello studio a colpo d\'occhio: clienti, preventivi, fatture e avanzamento di ogni adempimento'],
  dashboard: ['Dashboard', 'Il quadro di tutto lo studio: scadenze, adempimenti e onboarding di tutti'],
  calendario: ['Calendario', 'Vista mensile di tutte le scadenze'],
  clienti: ['Clienti', 'Anagrafica e flag fiscali'],
  rubrica: ['Rubrica', 'Tutti i contatti dei clienti in un unico elenco ricercabile'],
  schedacliente: ['Scheda cliente', 'Tutto quello che riguarda questo cliente, in un unico posto'],
  soci: ['Soci e referenti', 'Persone collegate ai clienti — soci, amministratori, referenti'],
  scadenze: ['Scadenze periodiche', 'IVA, INPS, ritenute, IMU, Intrastat e altro — generate automaticamente'],
  ritenute: ["Ritenute d'acconto", 'Registro fatture e cumulo versamenti F24 (soglia 100€/mese)'],
  annuali: ['Adempimenti annuali', 'Dichiarazioni e adempimenti con sotto-task'],
  f24: ['F24', 'Registro F24 versati o compensati per cliente'],
  taskteam: ['Task team', 'Cose da fare assegnate tra colleghi dello studio, per cliente o generali'],
  onboarding: ['Onboarding clienti', 'Checklist di attivazione nuovo cliente'],
  antiriciclaggio: ['Antiriciclaggio', 'Fascicolo per l\'adeguata verifica: profilo di rischio, checklist, storico verifiche'],
  comunicazioni: ['Comunicazioni', 'Messaggi pubblicati nel portale cliente — singoli, broadcast o ricorrenti'],
  documenti: ['Documenti', 'Documenti ricevuti o da tracciare per cliente'],
  preventivi: ['Preventivi e mandati', 'Preventivi, mandati professionali e lettere di incarico da modelli precompilati'],
  portale: ['Portale cliente', 'Anteprima di cosa vedrebbe il cliente (in sviluppo)'],
  bilanci: ['Bilanci & KPI', 'Carica situazioni economico-patrimoniali e ottieni indicatori e grafici automatici'],
  contabilita: ['Contabilità', 'Import periodico da Excel/CSV: nessuna doppia registrazione, nessuna data indovinata'],
  modelli: ['Modelli documenti', 'Testi precompilati per preventivi, mandati e documenti antiriciclaggio: i segnaposto {{così}} si trasformano in campi da compilare'],
  incassi: ['Incassi', 'Compensi da incassare, scadenze di pagamento e solleciti ai clienti'],
  carico: ['Carico di lavoro', 'Scadenze e adempimenti aperti per persona e per mese'],
  proroghe: ['Proroghe', 'Sposta in blocco una scadenza per tutti i clienti interessati (decreti di proroga)'],
  cpb: ['Concordato preventivo biennale', 'Stato di adesione per cliente'],
  imposte: ['Imposte calcolate', 'Imposte per cliente e anno, con storico di tutte le modifiche'],
  deontologia: ['Deontologia', 'Accettazione incarico, equo compenso, uso dell\'IA, formazione continua e riservatezza'],
  libri: ['Libri sociali', 'Quali libri ha ogni società, chi li detiene e quando sono stati stampati l\'ultima volta'],
  fatturazione: ['Da fatturare', 'Attività extra prestate ai clienti, da includere nella prossima fattura periodica'],
  procedure: ['Procedure interne', 'Indicazioni operative per lo staff, passo per passo, con la checklist dei documenti necessari'],
  strumenti: ['Strumenti', 'Convertitore file Word ↔ PDF ↔ PDF/A (serve LibreOffice installato sul PC del server locale)'],
  credenziali: ['Password', 'Credenziali e accessi dello studio e dei clienti — Entratel, Telemaco, home banking, software, ecc.'],
  impostazioni: ['Impostazioni e backup', 'Studio, responsabili, catalogo scadenze, esporta/importa dati'],
  chat: ['Chat interna', 'Messaggi diretti tra i responsabili dello studio'],
};

/* Task #156: ruoli e permessi (filtro di interfaccia — vedi commento su statoIniziale/meta).
   ruoloOperatore/tabConsentitiOperatore/operatorePuoVedere sono l'unico punto da cui il resto
   dell'app decide cosa un referente "limitato" può vedere: renderNav le nasconde dal menu,
   setView blocca l'apertura diretta di una vista non consentita (link/scorciatoie che puntano
   lì comunque), e la lista completa dei tab arriva da NAV stesso — non serve un secondo elenco
   da tenere sincronizzato a mano. */
function ruoloOperatore(nome) {
  if (!nome) return 'admin'; // nessun operatore selezionato = nessuna restrizione, vedi commento in operatorePuoVedere
  return (STATE.meta.ruoli && STATE.meta.ruoli[nome]) || 'admin';
}
function tabConsentitiOperatore(nome) {
  if (ruoloOperatore(nome) !== 'limitato') return null; // null = nessuna restrizione, vede tutto
  const consentiti = (STATE.meta.tabConsentiti && STATE.meta.tabConsentiti[nome]) || [];
  // Dashboard sempre inclusa: altrimenti un referente limitato senza nessuna sezione spuntata per
  // errore si troverebbe davanti a un menu vuoto senza nessuna via per orientarsi.
  return Array.from(new Set(['dashboard'].concat(consentiti)));
}
// Nessun operatore scelto (PC condiviso prima della selezione "Chi sta usando questo PC?") non
// applica restrizioni: l'identità dell'operatore qui è "best effort" come nel resto di Prisma
// (vedi impostaOperatore), non un vero login - restringere una sessione anonima non avrebbe senso
// e bloccherebbe l'uso normale prima che qualcuno scelga il proprio nome.
/* Task #214 (Matteo: "se ha troppe funzioni crea confusione, come Scadero"): moduli attivabili per
   studio. Ogni modulo raggruppa uno o più tab; un modulo spento nasconde i suoi tab a TUTTI (admin
   compreso) finché non lo si riattiva da Impostazioni > Moduli, esattamente come già fa il flag
   contabilitaAttiva. Si salva l'elenco dei SOLO moduli spenti (meta.moduliDisattivati): un salvataggio
   vecchio senza il campo, o un'installazione esistente, ha quindi tutto attivo come prima - nessuna
   migrazione. I dati dei moduli spenti restano intatti. Restano sempre attivi (non sono moduli):
   dashboard, azioni, clienti, scheda cliente, soci, scadenze, adempimenti annuali, documenti,
   modelli, impostazioni. */
const MODULI = [
  { id: 'calendario', label: 'Calendario e appuntamenti', desc: 'Calendario scadenze, prenotazione appuntamenti con i consulenti.', tabs: ['calendario'] },
  { id: 'portale', label: 'Portale clienti e comunicazioni', desc: 'Area riservata del cliente, messaggi, notifiche push e accesso esterno.', tabs: ['portale', 'comunicazioni'] },
  { id: 'team', label: 'Lavoro di squadra', desc: 'Task team e chat interna tra i collaboratori.', tabs: ['taskteam', 'chat'] },
  { id: 'procedure', label: 'Procedure interne', desc: 'Istruzioni operative passo per passo per lo staff.', tabs: ['procedure'] },
  { id: 'antiriciclaggio', label: 'Antiriciclaggio', desc: 'Adeguata verifica, profilo di rischio e storico verifiche.', tabs: ['antiriciclaggio'] },
  { id: 'preventivi', label: 'Preventivi e mandati', desc: 'Preventivi, mandati e lettere di incarico da modelli.', tabs: ['preventivi'] },
  { id: 'libri', label: 'Libri sociali', desc: 'Libri sociali dei clienti: detentore, ultima stampa e ultima pagina.', tabs: ['libri'] },
  { id: 'fatturazione', label: 'Attività da fatturare', desc: 'Pratiche extra da fatturare e periodicità di fatturazione di ogni cliente.', tabs: ['fatturazione'] },
  { id: 'incassi', label: 'Incassi e solleciti', desc: 'Compensi da incassare, scadenze di pagamento e solleciti ai clienti.', tabs: ['incassi'] },
  { id: 'onboarding', label: 'Onboarding clienti', desc: 'Checklist di attivazione per un nuovo cliente.', tabs: ['onboarding'] },
  { id: 'servizi', label: 'Portale avanzato: ritenute, F24, bilanci e KPI', desc: 'Pacchetto da attivare cliente per cliente (interruttore nella scheda Portale): registro ritenute e F24, bilanci/KPI e, nel portale del cliente, F24, ritenute, ravvedimento e Andamento.', tabs: ['ritenute', 'f24', 'bilanci'] },
  { id: 'rubrica', label: 'Rubrica contatti', desc: 'Elenco unico dei contatti dei clienti.', tabs: ['rubrica'] },
  { id: 'credenziali', label: 'Password dello studio', desc: 'Archivio credenziali (Entratel, Telemaco, home banking...).', tabs: ['credenziali'] },
  { id: 'cruscotto', label: 'Cruscotto titolare', desc: 'Vista d\'insieme dello studio: portafoglio clienti, nuovi e cessati, avanzamento adempimenti.', tabs: ['cruscotto'] },
  { id: 'carico', label: 'Carico di lavoro e proroghe', desc: 'Carico per responsabile e registro delle proroghe concesse.', tabs: ['carico', 'proroghe'] },
  { id: 'cpb', label: 'Concordato preventivo biennale', desc: 'Tracker delle proposte CPB e delle adesioni dei clienti.', tabs: ['cpb'] },
  { id: 'imposte', label: 'Imposte calcolate', desc: 'Imposte calcolate per cliente e anno, con storico delle modifiche.', tabs: ['imposte'] },
  { id: 'strumenti', label: 'Strumenti file', desc: 'Convertitore Word/PDF, unisci e dividi PDF.', tabs: ['strumenti'] },
];
function moduloAttivo(id) {
  return !((STATE.meta && STATE.meta.moduliDisattivati) || []).includes(id);
}
/* Pacchetto "portale avanzato" (ritenute + F24 + bilanci/KPI + parti avanzate del portale): modulo dello studio + interruttore
   per cliente (c.pacchettoPortale). Solo i clienti col pacchetto compaiono in Ritenute, F24 e Bilanci e hanno quelle sezioni nel portale. */
function clienteHaPacchetto(c) { return moduloAttivo('servizi') && !!(c && c.pacchettoPortale); }
function clientiPacchetto() { return (STATE.clienti || []).filter(clienteHaPacchetto); }
function tabAttivoPerModuli(tabId) {
  const m = MODULI.find(x => x.tabs.includes(tabId));
  return !m || moduloAttivo(m.id);
}
function operatorePuoVedere(tabId) {
  if (!tabAttivoPerModuli(tabId)) return false;
  // Task #176 (Matteo: "rimuovere/sospendere tab Contabilità"): controllo centrale, prima di quello
  // per ruolo - vale per TUTTI gli operatori, admin compreso, finché non si riattiva la sezione da
  // Impostazioni › Sviluppatore. Qui e non altrove perché operatorePuoVedere è già il punto unico usato
  // da renderNav, setView e render (vedi task #156) per decidere se una sezione è raggiungibile.
  if (tabId === 'contabilita' && !STATE.meta.contabilitaAttiva) return false;
  const consentiti = tabConsentitiOperatore(OPERATORE);
  return consentiti === null || consentiti.includes(tabId);
}
function badgeVoceNav(it) {
  if (it.id === 'chat') return chatTotaleNonLetti();
  if (it.id === 'taskteam') return taskTeamNonVistiConteggio();
  if (it.id === 'comunicazioni') return comunicazioniDaLeggereConteggio();
  if (it.id === 'calendario') return appuntamentiNonVistiConteggio();
  return 0;
}
/* Task #142: gruppi della sidebar collassabili (feedback di Federico — troppe voci tutte
   visibili spaesano chi non conosce già Prisma). Un gruppo è mostrato espanso se l'operatore lo
   ha aperto (NAV_GRUPPI_APERTI, per dispositivo — vedi caricaNavGruppiApertiLocale) OPPURE se
   contiene la pagina attualmente aperta, così non si perde mai "dove sono" arrivando da un link
   diretto verso una voce dentro un gruppo chiuso. Un gruppo chiuso con notifiche non lette al suo
   interno mostra comunque un pallino/numero sull'intestazione, così un badge non sparisce solo
   perché il gruppo è collassato. */
/* Preferiti del menu (richiesta Matteo): una stellina su ogni voce la fissa in un gruppo "Preferiti" in
   cima alla sidebar. Per dispositivo (localStorage), come i gruppi aperti: è una comodità di
   interfaccia, non un dato dello studio. */
const LS_KEY_NAV_PREFERITI = 'gestionaleNavPreferiti_v1';
let NAV_PREFERITI = null;
/* Preferiti e layout sono PERSONALI: la chiave include l'operatore, così Matteo e Sabrina sullo stesso
   PC (o con lo stesso browser) non si ritrovano i preferiti l'uno dell'altra. Senza operatore scelto
   si usa una chiave "ospite" a parte. */
let NAV_PREFERITI_DI = null;
function chiaveNavPersonale(base) { return base + '::' + (operatoreCorrente() || '_ospite'); }
function caricaNavPreferiti() {
  NAV_PREFERITI_DI = operatoreCorrente() || '_ospite';
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(chiaveNavPersonale(LS_KEY_NAV_PREFERITI));
    const arr = raw ? JSON.parse(raw) : [];
    NAV_PREFERITI = Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch (err) { NAV_PREFERITI = []; }
}
function toggleNavPreferito(id) {
  if (!NAV_PREFERITI || NAV_PREFERITI_DI !== (operatoreCorrente() || '_ospite')) caricaNavPreferiti();
  const i = NAV_PREFERITI.indexOf(id);
  if (i >= 0) NAV_PREFERITI.splice(i, 1); else NAV_PREFERITI.push(id);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(chiaveNavPersonale(LS_KEY_NAV_PREFERITI), JSON.stringify(NAV_PREFERITI)); } catch (err) { /* solo comodità */ }
}
/* Menu personalizzabile (richiesta Matteo): ognuno può cambiare l'ordine dei macrogruppi e dei singoli
   tab, e spostare un tab da un gruppo all'altro, con il drag & drop in modalità "Personalizza menu".
   Il layout è salvato per dispositivo (localStorage). NAV resta il layout di fabbrica: voci nuove
   introdotte da un aggiornamento compaiono da sole nel loro gruppo di default, quelle sparite si
   ignorano, e "Ripristina" torna al layout standard. */
const LS_KEY_NAV_LAYOUT = 'gestionaleNavLayout_v1';
let NAV_MODIFICA = false;
function navLayoutPersonale() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(chiaveNavPersonale(LS_KEY_NAV_LAYOUT));
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.every(g => g && typeof g.group === 'string' && Array.isArray(g.items))) return arr;
  } catch (err) { /* layout rovinato: si ignora */ }
  return null;
}
function navEffettivo() {
  const base = NAV.map(g => ({ group: g.group, items: g.items.slice() }));
  const mia = navLayoutPersonale();
  if (!mia) return base;
  const perId = {}; base.forEach(g => g.items.forEach(it => { perId[it.id] = it; }));
  const presenti = new Set();
  const out = mia.map(g => ({ group: g.group, items: g.items.map(id => perId[id]).filter(it => it && !presenti.has(it.id) && presenti.add(it.id)) }));
  // voci non presenti nel layout personale (es. aggiunte da un aggiornamento): nel gruppo di default, o in coda
  base.forEach(g => g.items.forEach(it => {
    if (presenti.has(it.id)) return;
    const dest = out.find(x => x.group === g.group) || out[out.length - 1] || (out.push({ group: g.group, items: [] }), out[out.length - 1]);
    dest.items.push(it); presenti.add(it.id);
  }));
  return out;
}
function salvaNavLayout(layout) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(chiaveNavPersonale(LS_KEY_NAV_LAYOUT), JSON.stringify(layout.map(g => ({ group: g.group, items: g.items.map(it => it.id) })))); } catch (err) { /* solo comodità */ }
}
/* Riordino con drag & drop in modalità "Personalizza menu". tipo/id = elemento trascinato ('gruppo' =
   nome del gruppo, 'voce' = id del tab); bTipo/bId = elemento su cui si rilascia; dopo = rilascio nella
   metà bassa del bersaglio. Una voce rilasciata su un'altra voce si inserisce prima/dopo di lei (anche in
   un altro gruppo); rilasciata sull'intestazione di un gruppo va in cima a quel gruppo. Un gruppo
   rilasciato su una voce si colloca prima/dopo il gruppo di quella voce. */
function riordinaNav(tipo, id, bTipo, bId, dopo) {
  if (!id || !bId || (tipo === bTipo && id === bId)) return false;
  const layout = navEffettivo();
  const gruppoDi = (voceId) => layout.findIndex(g => g.items.some(it => it.id === voceId));
  if (tipo === 'gruppo') {
    const da = layout.findIndex(g => g.group === id);
    const idxBers = bTipo === 'gruppo' ? layout.findIndex(g => g.group === bId) : gruppoDi(bId);
    if (da < 0 || idxBers < 0 || da === idxBers) return false;
    const nomeBers = layout[idxBers].group;
    const [g] = layout.splice(da, 1);
    const verso = layout.findIndex(x => x.group === nomeBers);
    layout.splice(dopo ? verso + 1 : verso, 0, g);
  } else {
    const da = gruppoDi(id);
    if (da < 0) return false;
    const k = layout[da].items.findIndex(it => it.id === id);
    const [voce] = layout[da].items.splice(k, 1);
    if (bTipo === 'gruppo') {
      const gi = layout.findIndex(g => g.group === bId);
      if (gi < 0) { layout[da].items.splice(k, 0, voce); return false; }
      layout[gi].items.unshift(voce);
    } else {
      const gi = gruppoDi(bId);
      if (gi < 0) { layout[da].items.splice(k, 0, voce); return false; }
      const idx = layout[gi].items.findIndex(it => it.id === bId);
      layout[gi].items.splice(dopo ? idx + 1 : idx, 0, voce);
    }
  }
  salvaNavLayout(layout);
  return true;
}
function ripristinaNavLayout() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(chiaveNavPersonale(LS_KEY_NAV_LAYOUT)); } catch (err) { /* nulla */ }
}
function renderNav() {
  if (!NAV_GRUPPI_APERTI) caricaNavGruppiApertiLocale();
  if (!NAV_PREFERITI || NAV_PREFERITI_DI !== (operatoreCorrente() || '_ospite')) caricaNavPreferiti(); // cambio operatore: ricarica i SUOI preferiti
  const nav = document.getElementById('navMenu');
  let html = '';
  const navCorrente = navEffettivo();
  const grip = '<span class="nav-grip" title="Trascina per spostare">⋮⋮</span>';
  if (NAV_MODIFICA) {
    html += `<div class="nav-edit-bar"><div style="font-weight:700;margin-bottom:6px;">Personalizza menu</div><div style="font-size:11.5px;opacity:.85;margin-bottom:8px;">Trascina gruppi e voci per spostarli. Rilascia una voce su un altro gruppo per cambiarle gruppo.</div><button type="button" class="btn small primary" data-navedit="fine">Fine</button> <button type="button" class="btn small" data-navedit="reset">Ripristina</button></div>`;
  }
  const voceNav = (it, conFrecce) => {
    const badge = badgeVoceNav(it);
    const fav = NAV_PREFERITI.includes(it.id);
    const destra = (NAV_MODIFICA && conFrecce) ? grip : `<span class="nav-star ${fav?'on':''}" data-star="${it.id}" title="${fav?'Togli dai preferiti':'Aggiungi ai preferiti'}">${fav?'★':'☆'}</span>`;
    return `<div class="navitem ${VIEW===it.id?'active':''}" data-nav="${it.id}" ${(NAV_MODIFICA && conFrecce) ? `draggable="true" data-drag="voce" data-id="${it.id}"` : ''}><span class="ic">${it.ic||''}</span>${escapeHtml(it.label)}${destra}${badge ? `<span class="nav-badge">${badge}</span>` : ''}</div>`;
  };
  const tutteLeVoci = navCorrente.reduce((acc, g) => acc.concat(g.items), []);
  const prefVisibili = NAV_PREFERITI.map(id => tutteLeVoci.find(it => it.id === id)).filter(it => it && operatorePuoVedere(it.id));
  if (prefVisibili.length) {
    html += `<div class="navgroup"><span style="flex:1;">★ Preferiti</span></div><div class="navgroup-items">${prefVisibili.map(it => voceNav(it, false)).join('')}</div>`;
  }
  for (const g of navCorrente) {
    // Task #156: un referente "limitato" non vede nemmeno la voce di menu delle sezioni non
    // consentite - un gruppo che finisce senza nessuna voce visibile non compare affatto (niente
    // intestazioni vuote da collassare).
    const itemsVisibili = g.items.filter(it => operatorePuoVedere(it.id));
    if (itemsVisibili.length === 0 && !NAV_MODIFICA) continue;
    const contieneViewCorrente = itemsVisibili.some(it => it.id === VIEW);
    const aperto = NAV_GRUPPI_APERTI.has(g.group) || contieneViewCorrente || NAV_MODIFICA;
    const badgeGruppo = itemsVisibili.reduce((s, it) => s + badgeVoceNav(it), 0);
    html += `<div class="navgroup collassabile" ${NAV_MODIFICA ? `draggable="true" data-drag="gruppo" data-id="${escapeHtml(g.group)}"` : `data-action="nav-toggle-gruppo" data-gruppo="${escapeHtml(g.group)}"`}>
      <span class="chev">${aperto ? '▾' : '▸'}</span>
      <span style="flex:1;">${escapeHtml(g.group)}</span>
      ${NAV_MODIFICA ? grip : ''}
      ${(!aperto && badgeGruppo) ? `<span class="nav-badge">${badgeGruppo}</span>` : ''}
    </div>`;
    // Le voci restano SEMPRE nel DOM (mai omesse), anche a gruppo chiuso: solo nascoste via CSS
    // (display:none su .navgroup-items.chiuso). Necessario perché in tutta l'app diversi bottoni
    // di scorciatoia (es. "Vai agli adempimenti annuali →" in dashboard/scheda cliente) e la
    // suite di test navigano chiamando data-nav="..." direttamente: se l'elemento non esistesse
    // affatto nel DOM a gruppo chiuso, quei link smetterebbero di funzionare invece di limitarsi
    // a espandere il gruppo. Un utente reale non può comunque cliccare qualcosa che non vede.
    html += `<div class="navgroup-items ${aperto ? '' : 'chiuso'}">`;
    for (const it of itemsVisibili) html += voceNav(it, true);
    html += `</div>`;
  }
  html += NAV_MODIFICA ? '' : `<div class="nav-personalizza" data-navedit="inizia">⚙ Personalizza menu</div>`;
  nav.innerHTML = html;
  document.getElementById('brandSub').textContent = STATE.meta.studioNome || 'Studio';
  document.getElementById('sidebarFoot').textContent = `${STATE.clienti.length} clienti · ${STATE.annoCorrente}`;
}

function renderAnnoSelect() {
  const sel = document.getElementById('annoSelect');
  const annoOggi = new Date().getFullYear();
  const anni = new Set([annoOggi-1, annoOggi, annoOggi+1, STATE.annoCorrente, ...(STATE.meta.anniExtra||[])]);
  sel.innerHTML = Array.from(anni).sort().map(a => `<option value="${a}" ${a===STATE.annoCorrente?'selected':''}>${a}</option>`).join('');
}

/* Cronologia di navigazione tipo browser (frecce indietro/avanti in alto a sinistra, Alt+←/→, tasti laterali del mouse):
   da Scadenze si apre la scheda di un cliente per controllare una cosa e con "indietro" si torna alle Scadenze, con gli stessi
   filtri e alla stessa altezza della pagina. Ogni voce ricorda sezione, cliente della scheda e scorrimento. */
let NAV_STORIA = [];
let NAV_STORIA_POS = -1;
const NAV_STORIA_MAX = 60;
function navVoceCorrente() { return { view: VIEW, scheda: SCHEDA_CLIENTE, scroll: 0 }; }
function navScrollAttuale() { try { return Math.round(window.scrollY || window.pageYOffset || 0); } catch (e) { return 0; } }
// Chiamata PRIMA di cambiare VIEW: registra la posizione di scorrimento della voce che si sta lasciando (e la crea se e la prima).
function navStoriaPrima() {
  if (NAV_STORIA_POS < 0) { NAV_STORIA = [navVoceCorrente()]; NAV_STORIA_POS = 0; }
  NAV_STORIA[NAV_STORIA_POS].scroll = navScrollAttuale();
}
// Chiamata DOPO aver impostato la nuova VIEW (e SCHEDA_CLIENTE da parte del chiamante): aggiunge la nuova voce se diversa.
function navStoriaDopo() {
  const cur = NAV_STORIA[NAV_STORIA_POS];
  if (cur && cur.view === VIEW && cur.scheda === SCHEDA_CLIENTE) return;
  NAV_STORIA = NAV_STORIA.slice(0, NAV_STORIA_POS + 1);
  NAV_STORIA.push(navVoceCorrente());
  if (NAV_STORIA.length > NAV_STORIA_MAX) NAV_STORIA.shift();
  NAV_STORIA_POS = NAV_STORIA.length - 1;
}
function navPuoIndietro() { return NAV_STORIA_POS > 0; }
function navPuoAvanti() { return NAV_STORIA_POS >= 0 && NAV_STORIA_POS < NAV_STORIA.length - 1; }
function navVaiA(posizione) {
  if (posizione < 0 || posizione >= NAV_STORIA.length) return;
  if (NAV_STORIA_POS >= 0 && NAV_STORIA[NAV_STORIA_POS]) NAV_STORIA[NAV_STORIA_POS].scroll = navScrollAttuale();
  const v = NAV_STORIA[posizione];
  if (!operatorePuoVedere(v.view)) { toast('Non hai accesso a questa sezione.', true); return; }
  NAV_STORIA_POS = posizione;
  chiudiModal();
  SCHEDA_CLIENTE = v.scheda;
  VIEW = v.view;
  VIEW_PARAMS = {};
  render();
  try { window.scrollTo(0, v.scroll || 0); } catch (e) {}
}
function navIndietro() { if (navPuoIndietro()) navVaiA(NAV_STORIA_POS - 1); }
function navAvanti() { if (navPuoAvanti()) navVaiA(NAV_STORIA_POS + 1); }
function aggiornaFrecceNav() {
  const i = typeof document !== 'undefined' && document.getElementById('navIndietro');
  const a = typeof document !== 'undefined' && document.getElementById('navAvanti');
  if (i) i.disabled = !navPuoIndietro();
  if (a) a.disabled = !navPuoAvanti();
}
function setView(view, params) {
  // Task #156: blocco centrale, non solo nascondere la voce di menu - copre anche i link/scorciatoie
  // sparsi per l'app (es. "Vai agli adempimenti annuali →", risultati di Azioni, link da un task/
  // scadenza) che potrebbero altrimenti aprire direttamente una sezione non consentita a un
  // referente "limitato" bypassando il menu filtrato in renderNav.
  if (!operatorePuoVedere(view)) {
    toast('Non hai accesso a questa sezione.', true);
    view = 'dashboard';
    params = {};
  }
  navStoriaPrima();
  VIEW = view;
  VIEW_PARAMS = params || {};
  navStoriaDopo();
  if ((view === 'scadenze' || view === 'annuali') && STATE && STATE.meta && !(STATE.meta.passiVisti && STATE.meta.passiVisti[view])) {
    STATE.meta.passiVisti = Object.assign({}, STATE.meta.passiVisti, { [view]: true });
    salvaStato();
  }
  render();
  try { window.scrollTo(0,0); } catch (e) {}
}

let ULTIMA_VIEW_RENDERIZZATA = null;
function render() {
  // Task #156: ricontrollato anche qui (non solo in setView) perché VIEW può restare quella di
  // prima anche quando cambia chi può vederla - tipicamente cambiando operatore da "Chi sta
  // usando questo PC?" (impostaOperatore chiama render() direttamente, non setView) mentre si è
  // fermi su una sezione che il nuovo operatore non può vedere.
  if (!operatorePuoVedere(VIEW)) { VIEW = 'dashboard'; VIEW_PARAMS = {}; }
  renderNav();
  renderAnnoSelect();
  aggiornaBadgeOperatore();
  aggiornaFrecceNav();
  const [title, sub] = PAGE_TITLES[VIEW] || ['', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent = sub;
  const btnGuida = document.getElementById('btnGuidaTab'); if (btnGuida) btnGuida.style.display = GUIDA_TAB[VIEW] ? '' : 'none';
  const content = document.getElementById('content');
  // Un re-render della STESSA sezione (aggiornamento dal server, presenza colleghi...) non deve far saltare la pagina: si ricorda
  // lo scorrimento e lo si rimette dopo aver ridisegnato.
  const scrollPrima = ULTIMA_VIEW_RENDERIZZATA === VIEW ? navScrollAttuale() : 0;
  // Task #196: ogni render() ricrea il DOM e la conversazione della chat ripartiva dal primo
  // messaggio. Si ricorda la posizione (e se si era in fondo) PRIMA di ridisegnare, poi si
  // ripristina: in fondo se si era in fondo o se è un'altra conversazione, altrimenti dov'eravamo.
  const corpoChatPrima = VIEW === 'chat' ? document.getElementById('chatThreadCorpo') : null;
  const statoScrollChat = corpoChatPrima ? {
    con: CHAT_CON, top: corpoChatPrima.scrollTop,
    inFondo: corpoChatPrima.scrollHeight - corpoChatPrima.scrollTop - corpoChatPrima.clientHeight < 40,
  } : null;
  switch (VIEW) {
    case 'oggi': content.innerHTML = renderOggi(); break;
    case 'dashboard': content.innerHTML = renderDashboard(); break;
    case 'cruscotto': content.innerHTML = renderCruscotto(); break;
    case 'calendario': content.innerHTML = renderCalendario(); break;
    case 'clienti': content.innerHTML = renderClienti(); break;
    case 'rubrica': content.innerHTML = renderRubrica(); break;
    case 'schedacliente': content.innerHTML = renderSchedaCliente(); break;
    case 'soci': content.innerHTML = renderSoci(); break;
    case 'scadenze': content.innerHTML = renderScadenze(); break;
    case 'ritenute': content.innerHTML = renderRitenute(); break;
    case 'annuali': content.innerHTML = renderAnnuali(); break;
    case 'f24': content.innerHTML = renderF24(); break;
    case 'taskteam': content.innerHTML = renderTaskTeam(); break;
    case 'onboarding': content.innerHTML = renderOnboarding(); break;
    case 'antiriciclaggio': content.innerHTML = renderAntiriciclaggio(); break;
    case 'comunicazioni': content.innerHTML = renderComunicazioni(); break;
    case 'documenti': content.innerHTML = renderDocumenti(); break;
    case 'preventivi': content.innerHTML = renderPreventivi(); break;
    case 'modelli': content.innerHTML = renderModelliDocumento(); break;
    case 'procedure': content.innerHTML = renderProcedureInterne(); break;
    case 'incassi': content.innerHTML = renderIncassi(); break;
    case 'fatturazione': content.innerHTML = renderFatturazione(); break;
    case 'libri': content.innerHTML = renderLibriSociali(); break;
    case 'deontologia': content.innerHTML = renderDeontologia(); break;
    case 'carico': content.innerHTML = renderCarico(); break;
    case 'proroghe': content.innerHTML = renderProroghe(); break;
    case 'cpb': content.innerHTML = renderCpb(); break;
    case 'imposte': content.innerHTML = renderImposte(); break;
    case 'strumenti': content.innerHTML = renderStrumenti(); break;
    case 'credenziali': content.innerHTML = renderCredenziali(); break;
    case 'portale': content.innerHTML = renderPortaleCliente(); break;
    case 'bilanci': content.innerHTML = renderBilanci(); break;
    case 'contabilita': content.innerHTML = renderContabilita(); break;
    case 'impostazioni': content.innerHTML = renderImpostazioni(); break;
    case 'chat': content.innerHTML = renderChat(); break;
    default: content.innerHTML = '<div class="empty">Vista non trovata.</div>';
  }
  ULTIMA_VIEW_RENDERIZZATA = VIEW;
  if (scrollPrima > 0) { try { window.scrollTo(0, scrollPrima); } catch (e) { /* ignora */ } }
  if (VIEW === 'chat') {
    const corpoChat = document.getElementById('chatThreadCorpo');
    if (corpoChat) {
      if (statoScrollChat && statoScrollChat.con === CHAT_CON && !statoScrollChat.inFondo) corpoChat.scrollTop = statoScrollChat.top;
      else corpoChat.scrollTop = corpoChat.scrollHeight;
    }
  }
}

/* -------------------- RENDER: DASHBOARD -------------------- */
let DASH_RESP = 'Tutti';
function renderDashboard() {
  if (STATE.clienti.length === 0) {
    return `<div class="card"><div class="empty">
      <div class="big">Nessun cliente in anagrafica</div>
      Inizia aggiungendo il primo cliente per vedere qui scadenze e statistiche.<br><br>
      <button class="btn primary" data-action="nuovo-cliente">+ Aggiungi cliente</button>
    </div></div>`;
  }
  const { tutteScadenze, annuali } = derivati();
  let filtrate = tutteScadenze;
  if (DASH_RESP !== 'Tutti') filtrate = filtrate.filter(s => s.responsabile === DASH_RESP);
  const { scaduti, inScadenza, futuri, completati } = classificaScadenze(filtrate, oggiISO());

  const respOptions = ['Tutti'].concat(STATE.meta.responsabili);
  const filtroHtml = `<div class="toolbar"><div class="field"><label>Filtra per responsabile</label>
    <select data-action="dash-resp">${respOptions.map(r=>`<option value="${escapeHtml(r)}" ${r===DASH_RESP?'selected':''}>${escapeHtml(r)}</option>`).join('')}</select>
    </div></div>`;

  const nClientiIncompleti = STATE.clienti.filter(c => campiMancantiCliente(c).length > 0).length;
  const nClientiGraviDash = nClientiGravi();
  const avvisoIncompleti = nClientiIncompleti ? `<div class="card" style="border-left:4px solid ${nClientiGraviDash?'var(--rosso)':'var(--giallo)'};padding:10px 14px;cursor:pointer;margin-bottom:16px;" data-action="goto-clienti-incompleti">${nClientiGraviDash?'⚠':'ℹ'} <strong>${nClientiIncompleti} client${nClientiIncompleti===1?'e':'i'} con anagrafica da completare</strong>${nClientiGraviDash ? ` — <strong>${nClientiGraviDash} con dati importanti mancanti</strong>` : ' — solo dati utili'}. Clicca per vederli.</div>` : '';
  const kpi = avvisoIncompleti + `<div class="kpi-grid">
    <div class="kpi scaduti" data-action="goto-scadenze" data-filtro="scaduti"><div class="n">${scaduti.length}</div><div class="l">SCADUTI</div></div>
    <div class="kpi inscadenza" data-action="goto-scadenze" data-filtro="inscadenza"><div class="n">${inScadenza.length}</div><div class="l">IN SCADENZA (30GG)</div></div>
    <div class="kpi futuri" data-action="goto-scadenze" data-filtro="futuri"><div class="n">${futuri.length}</div><div class="l">FUTURI</div></div>
    <div class="kpi completati" data-action="goto-scadenze" data-filtro="completati"><div class="n">${completati.length}</div><div class="l">COMPLETATI</div></div>
  </div>`;

  const rigaScadenza = (s) => {
    const d = deltaLabel(s.data);
    return `<tr style="cursor:pointer;" data-action="apri-dettaglio-scadenza" data-id="${s.id}" title="Apri il riepilogo della scadenza">
      <td>${fmtDataBreve(s.data)}</td>
      <td>${escapeHtml(nomeCliente(s.clienteId))}</td>
      <td>${escapeHtml(s.nome)}</td>
      <td><span class="pill-delta ${d.cls}">${d.txt}</span></td>
      <td><span class="badge ${statoBadgeClass(s.stato)}">${escapeHtml(s.stato)}</span></td>
      <td>${escapeHtml(s.responsabile||'—')}</td>
    </tr>`;
  };

  const sezioneScaduti = scaduti.length ? `<div class="card">
    <div class="section-title">🔴 Scadute <span class="cnt">${scaduti.length}</span></div>
    <table><thead><tr><th>Data</th><th>Cliente</th><th>Adempimento</th><th>Ritardo</th><th>Stato</th><th>Resp.</th></tr></thead>
    <tbody>${scaduti.slice(0,8).sort((a,b)=>a.data.localeCompare(b.data)).map(rigaScadenza).join('')}</tbody></table>
    ${scaduti.length>8?`<div style="margin-top:10px;"><button class="btn small" data-action="goto-scadenze" data-filtro="scaduti">Vedi tutte le ${scaduti.length} scadute →</button></div>`:''}
  </div>` : '';

  const sezioneInScadenza = `<div class="card">
    <div class="section-title">🟡 In scadenza nei prossimi 30 giorni <span class="cnt">${inScadenza.length}</span></div>
    ${inScadenza.length ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Adempimento</th><th>Tra</th><th>Stato</th><th>Resp.</th></tr></thead>
    <tbody>${inScadenza.slice(0,8).sort((a,b)=>a.data.localeCompare(b.data)).map(rigaScadenza).join('')}</tbody></table>
    ${inScadenza.length>8?`<div style="margin-top:10px;"><button class="btn small" data-action="goto-scadenze" data-filtro="inscadenza">Vedi tutte le ${inScadenza.length} →</button></div>`:''}`
    : '<div class="empty">Nessuna scadenza nei prossimi 30 giorni.</div>'}
  </div>`;

  const annualiIncompleti = annuali.filter(a => !a.completato).sort((a,b)=>b.percentuale-a.percentuale).slice(0,6);
  const sezioneAnnuali = `<div class="card">
    <div class="section-title">Adempimenti annuali in corso <span class="cnt">${annuali.filter(a=>!a.completato).length} da completare</span></div>
    ${annualiIncompleti.length ? annualiIncompleti.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="dash-apri-annuale" data-id="${a.id}" title="Apri questo adempimento negli Adempimenti annuali">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:13px;">${escapeHtml(a.tipoNome)} — ${escapeHtml(nomeCliente(a.clienteId))}</div>
          <div class="helptext">${escapeHtml(a.responsabile||'—')}</div>
        </div>
        <div style="width:120px;"><div class="progress"><div style="width:${a.percentuale}%"></div></div></div>
        <div style="width:38px;text-align:right;font-weight:700;font-size:12.5px;">${a.percentuale}%</div>
      </div>`).join('') : '<div class="empty">Tutto completato per quest\'anno.</div>'}
    ${annuali.length ? `<div style="margin-top:10px;"><button class="btn small" data-action="nav" data-nav="annuali">Vai agli adempimenti annuali →</button></div>` : ''}
  </div>`;

  const onboardingIncompleti = STATE.clienti
    .filter(c => clienteAttivo(c))
    .map(c => ({ c, pct: percentualeOnboarding(STATE.onboarding[c.id]) }))
    .filter(x => x.pct < 100)
    .sort((a,b)=>a.pct-b.pct).slice(0,6);
  const sezioneOnboarding = `<div class="card">
    <div class="section-title">Clienti con onboarding da completare <span class="cnt">${onboardingIncompleti.length}</span></div>
    ${onboardingIncompleti.length ? onboardingIncompleti.map(x => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="nav-onboarding-cliente" data-id="${x.c.id}">
        <div style="flex:1;font-weight:600;font-size:13px;">${escapeHtml(x.c.ragioneSociale)}</div>
        <div style="width:120px;"><div class="progress"><div style="width:${x.pct}%"></div></div></div>
        <div style="width:38px;text-align:right;font-weight:700;font-size:12.5px;">${x.pct}%</div>
      </div>`).join('') : '<div class="empty">Tutti i clienti attivi hanno l\'onboarding completo.</div>'}
  </div>`;

  return filtroHtml + kpi + sezioneScaduti + sezioneInScadenza + sezioneAnnuali + sezioneOnboarding;
}



/* -------------------- RENDER: OGGI (task #213) --------------------
   Matteo: "Scadero ti sbatte in faccia tutte le funzioni e non ci si capisce nulla" - Prisma deve
   guidare. Questa è la schermata di partenza: solo quello che serve a QUESTA persona adesso
   (scadenze sue scadute o entro 7 giorni, task suoi, messaggi da leggere, chat), con un bottone
   per ogni cosa, e un invito a configurare se è un'installazione ancora vuota. Il menu completo
   resta a sinistra ma è secondario. Rispetta moduli attivi e permessi tramite operatorePuoVedere:
   un blocco legato a una sezione che l'utente non può vedere semplicemente non compare. */
/* Task #215: checklist di avvio (primo setup guidato). Si vede in cima a "Oggi" finché non è tutta
   completata o l'utente la nasconde (meta.setupNascosto). I passi si spuntano DA SOLI guardando i dati
   (nome studio cambiato, primo cliente, prima comunicazione...) tranne "scegli i moduli", che è un
   flag esplicito (meta.moduliConfermati) perché non c'è un dato che dica "ci ho pensato". Ogni passo
   ha un bottone che porta dritto alla schermata giusta. I passi legati a un modulo spento non
   compaiono: non si chiede di configurare ciò che lo studio ha deciso di non usare. */
function passiSetupStudio() {
  const m = STATE.meta || {};
  const passi = [
    { id: 'studio', testo: 'Dai un nome al tuo studio', fatto: !!(m.studioNome && m.studioNome !== 'Studio'), nav: 'impostazioni', imp: 'studio', cta: 'Apri Studio' },
    { id: 'moduli', testo: 'Scegli i moduli che userete', fatto: !!m.moduliConfermati, nav: 'impostazioni', imp: 'moduli', cta: 'Scegli i moduli' },
    { id: 'team', testo: 'Aggiungi i collaboratori e i loro permessi', fatto: (m.responsabili || []).length > 1 && !!m.teamConfermato, nav: 'impostazioni', imp: 'team', cta: 'Team e accessi', manuale: 'team' },
    { id: 'clienti', testo: 'Aggiungi o importa i tuoi clienti', fatto: STATE.clienti.length > 0, nav: 'clienti', cta: 'Vai ai clienti' },
  ];
  if (STATE.clienti.length > 0) {
    const nGravi = nClientiGravi();
    passi.push({ id: 'completa', testo: nGravi ? `Completa le anagrafiche: ${nGravi} client${nGravi === 1 ? 'e ha' : 'i hanno'} dati importanti mancanti (caselle rosse)` : 'Completa le anagrafiche dei clienti (dati importanti)', fatto: nGravi === 0, nav: 'clienti', filtro: 'incompleti', cta: 'Mostra i da completare' });
    passi.push({ id: 'scadenze', testo: 'Dai un\'occhiata alle scadenze generate in automatico', fatto: !!(m.passiVisti && m.passiVisti.scadenze), nav: 'scadenze', cta: 'Vedi le scadenze' });
    passi.push({ id: 'annuali', testo: 'Controlla gli adempimenti annuali (770, bilanci, redditi…): nascono da tipo e regime del cliente', fatto: !!(m.passiVisti && m.passiVisti.annuali), nav: 'annuali', cta: 'Vedi gli adempimenti' });
    passi.push({ id: 'backup', testo: 'Fai il primo backup dei dati', fatto: !!m.backupFatto, nav: 'impostazioni', imp: 'dati', cta: 'Vai ai backup' });
  }
  if (moduloAttivo('portale')) passi.push({ id: 'portale', testo: 'Scrivi la prima comunicazione a un cliente', fatto: (STATE.comunicazioni || []).length > 0, nav: 'comunicazioni', cta: 'Vai alle comunicazioni' });
  if (moduloAttivo('bilanci')) passi.push({ id: 'bilanci', testo: 'Carica il primo bilancio di un cliente', fatto: Object.keys(STATE.bilanci || {}).some(k => Object.keys(STATE.bilanci[k] || {}).length > 0), nav: 'bilanci', cta: 'Vai a Bilanci' });
  return passi;
}
function renderChecklistSetup() {
  const m = STATE.meta || {};
  if (m.setupNascosto) return '';
  const passi = passiSetupStudio();
  const fatti = passi.filter(p => p.fatto).length;
  if (fatti === passi.length) return '';
  const pct = Math.round(fatti / passi.length * 100);
  const righe = passi.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border);">
      <span style="width:20px;height:20px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;${p.fatto ? 'background:var(--verde,#1a8a4c);color:#fff;' : 'border:2px solid var(--border);'}">${p.fatto ? '✓' : ''}</span>
      <span style="flex:1;font-size:13px;${p.fatto ? 'text-decoration:line-through;opacity:.6;' : 'font-weight:600;'}">${escapeHtml(p.testo)}</span>
      ${p.fatto ? '' : `<button class="btn small${fatti === passi.indexOf(p) ? ' primary' : ''}" data-action="setup-vai" data-nav="${p.nav}" ${p.imp ? `data-imp="${p.imp}"` : ''} ${p.manuale ? `data-manuale="${p.manuale}"` : ''} ${p.filtro ? `data-filtro="${p.filtro}"` : ''}>${escapeHtml(p.cta)}</button>`}
    </div>`).join('');
  return `<div class="card" style="border-left:4px solid var(--blu-mid,#2E63C7);margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div><div style="font-weight:800;font-size:14px;">Metti a punto Prisma · ${fatti} di ${passi.length}</div><div class="helptext">Pochi passi per partire col piede giusto. Si spuntano da soli man mano.</div></div>
      <button class="btn small" data-action="setup-nascondi" title="Nascondi questa guida (puoi sempre usare il menu)">Nascondi</button>
    </div>
    <div class="progress" style="margin:10px 0 4px;"><div style="width:${pct}%"></div></div>
    ${righe}
  </div>`;
}
function renderOggi() {
  const me = OPERATORE || null;
  const oggi = oggiISO();
  const saluto = (() => { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : (h < 18 ? 'Buon pomeriggio' : 'Buonasera'); })();
  const dataEstesa = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const intest = `<div style="margin-bottom:16px;">
    <div style="font-size:22px;font-weight:800;">${saluto}${me ? ', ' + escapeHtml(me) : ''}</div>
    <div class="helptext" style="text-transform:capitalize;">${escapeHtml(dataEstesa)}</div>
  </div>`;

  if (STATE.clienti.length === 0) {
    return intest + renderChecklistSetup() + `<div class="card"><div class="empty">
      <div class="big">Iniziamo da qui</div>
      Prisma è ancora vuoto. Aggiungi il primo cliente per vedere qui le scadenze e le cose da fare.<br><br>
      <button class="btn primary" data-action="nuovo-cliente">+ Aggiungi cliente</button>
      ${operatorePuoVedere('impostazioni') ? ' <button class="btn" data-action="nav" data-nav="impostazioni">Scegli i moduli da usare</button>' : ''}
    </div></div>`;
  }

  const { tutteScadenze } = derivati();
  const mie = me ? tutteScadenze.filter(s => s.responsabile === me) : tutteScadenze;
  const { scaduti, inScadenza } = classificaScadenze(mie, oggi);
  const entro7 = inScadenza.filter(s => giorniTra(oggi, s.data) <= 7);
  const urgenti = scaduti.slice().sort((a, b) => a.data.localeCompare(b.data)).concat(entro7.slice().sort((a, b) => a.data.localeCompare(b.data)));

  const taskMiei = (STATE.taskTeam || []).filter(t => t.stato !== 'Fatto' && (!me || t.assegnatoA === me))
    .sort((a, b) => (a.scadenza || '9999').localeCompare(b.scadenza || '9999'));
  const comDaLeggere = (moduloAttivo('portale') && operatorePuoVedere('comunicazioni')) ? comunicazioniDaLeggereConteggio() : 0;
  const chatNL = (moduloAttivo('team') && operatorePuoVedere('chat')) ? chatTotaleNonLetti() : 0;

  // Differenza voluta con la Dashboard (Matteo: "possono convivere ma vanno differenziate meglio"):
  // la Dashboard è il quadro NUMERICO di tutto lo studio (griglia di contatori, tabelle, avanzamenti);
  // "Il mio lavoro" è PERSONALE e a lista: una frase di riepilogo con pillole cliccabili, poi le cose da
  // fare, una per riga. Nessun contatore a riquadri qui, per non somigliare alla Dashboard.
  // Nuova home (richiesta Matteo: "non dà l'effetto che vorrei"): banner con l'immagine Prisma, numeri grandi cliccabili,
  // avanzamento della settimana con una frase, "oggi tocca a te" a schede, settimana a giorni, pratiche annuali con barra a fasi e novità.
  const oggiList = inScadenza.filter(s => s.data === oggi);
  const prossimi = inScadenza.filter(s => s.data !== oggi && giorniTra(oggi, s.data) <= 7).sort((a, b) => a.data.localeCompare(b.data));
  const dow = (new Date().getDay() + 6) % 7; // 0 = lunedì
  const lunISO = (() => { const d = new Date(); d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10); })();
  const domISO = (() => { const d = new Date(lunISO + 'T00:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
  const settimana = mie.filter(s => s.data >= lunISO && s.data <= domISO);
  const settChiuse = settimana.filter(s => STATI_SCADENZA_CHIUSI.includes(s.stato)).length;
  const settPct = settimana.length ? Math.round(settChiuse / settimana.length * 100) : 0;
  const frase = (() => {
    const giorno = Math.floor(Date.now() / 86400000);
    const neutre = ['Un passo alla volta: le scadenze si battono così.', 'Chi chiude oggi, dorme tranquillo domani.', 'Poche cose fatte bene valgono più di tante a metà.', 'Il lavoro di oggi è la serenità dei tuoi clienti.'];
    if (scaduti.length > 5) return 'Parti dalle scadute: una alla volta, e la settimana si rimette in carreggiata.';
    if (settimana.length && settPct === 100) return 'Settimana in pari: tutto chiuso. Ottimo lavoro! 🎉';
    if (settimana.length && settPct >= 60) return 'Sei a buon punto: ancora un piccolo sforzo per chiudere la settimana.';
    return neutre[giorno % neutre.length];
  })();
  const kpi = (n, label, azione, cls) => `<button class="hero-k ${cls}" ${azione}><span class="hero-n">${n}</span><span class="hero-l">${label}</span></button>`;
  const heroKpi = [
    kpi(scaduti.length, scaduti.length === 1 ? 'in ritardo' : 'in ritardo', 'data-action="goto-scadenze" data-filtro="scaduti"', scaduti.length ? 'k-rosso' : 'k-ok'),
    kpi(oggiList.length, 'oggi', 'data-action="goto-scadenze" data-filtro="inscadenza"', oggiList.length ? 'k-giallo' : 'k-ok'),
    kpi(prossimi.length, 'prossimi 7 giorni', 'data-action="goto-scadenze" data-filtro="inscadenza"', ''),
    operatorePuoVedere('taskteam') ? kpi(taskMiei.length, me ? 'tuoi task' : 'task aperti', 'data-action="nav" data-nav="taskteam"', '') : '',
    (operatorePuoVedere('comunicazioni') && moduloAttivo('portale')) ? kpi(comDaLeggere, comDaLeggere === 1 ? 'messaggio' : 'messaggi', 'data-action="nav" data-nav="comunicazioni"', comDaLeggere ? 'k-viola' : '') : '',
  ].join('');
  const hero = `<div class="hero-oggi">
    <div class="hero-testo"><div class="hero-saluto">${saluto}${me ? ', ' + escapeHtml(me) : ''}</div><div class="hero-data">${escapeHtml(dataEstesa)}</div><div class="hero-frase">${escapeHtml(frase)}</div></div>
    <div class="hero-kpi">${heroKpi}</div>
  </div>`;
  const tiles = settimana.length ? `<div class="card avanzamento-sett">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;"><div class="section-title" style="margin:0;">La tua settimana</div><div class="helptext"><strong>${settChiuse}</strong> chiuse su <strong>${settimana.length}</strong> scadenze (${settPct}%)</div></div>
    <div class="progress" style="margin:10px 0 0;"><div style="width:${settPct}%"></div></div>
  </div>` : '';

  const rigaScadenza = (s) => {
    const d = deltaLabel(s.data);
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="apri-dettaglio-scadenza" data-id="${s.id}" title="Apri il riepilogo della scadenza">
      <span class="pill-delta ${d.cls}" style="min-width:74px;text-align:center;">${d.txt}</span>
      <span style="flex:1;font-size:13px;"><strong>${escapeHtml(nomeCliente(s.clienteId))}</strong> — ${escapeHtml(s.nome)}</span>
      <span class="helptext">${fmtDataBreve(s.data)}</span>
    </div>`;
  };
  const daFareOra = scaduti.slice().sort((a, b) => a.data.localeCompare(b.data)).concat(oggiList);
  const schedaScad = (s) => {
    const d = deltaLabel(s.data);
    return `<div class="scheda-oggi ${d.cls}" data-action="apri-dettaglio-scadenza" data-id="${s.id}" title="Apri il riepilogo della scadenza">
      <span class="pill-delta ${d.cls}">${d.txt}</span>
      <div class="scheda-cliente">${escapeHtml(nomeCliente(s.clienteId))}</div>
      <div class="helptext">${escapeHtml(s.nome)}</div>
    </div>`;
  };
  const giorniSett = (() => {
    const per = {};
    prossimi.forEach(s => { (per[s.data] = per[s.data] || []).push(s); });
    return Object.keys(per).sort().map(dt => {
      const nome = new Date(dt + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
      return `<div class="giorno-sett"><div class="giorno-nome">${escapeHtml(nome)}</div>${per[dt].slice(0, 4).map(rigaScadenza).join('')}${per[dt].length > 4 ? `<div class="helptext">+ altre ${per[dt].length - 4}</div>` : ''}</div>`;
    }).join('');
  })();
  const sezUrgenti = `<div class="oggi-colonne">
    <div class="card">
      <div class="section-title">Oggi tocca a te <span class="cnt">${daFareOra.length}</span></div>
      ${daFareOra.length ? `<div class="schede-oggi">${daFareOra.slice(0, 8).map(schedaScad).join('')}</div>` + (daFareOra.length > 8 ? `<div style="margin-top:10px;"><button class="btn small" data-action="goto-scadenze" data-filtro="scaduti">Vedi tutte le ${daFareOra.length} →</button></div>` : '')
        : '<div class="empty">Niente di scaduto o in scadenza oggi' + (me ? ' a tuo nome' : '') + '. 🎉</div>'}
    </div>
    <div class="card">
      <div class="section-title">Prossimi giorni <span class="cnt">${prossimi.length}</span></div>
      ${giorniSett || '<div class="empty">Nessuna scadenza nei prossimi 7 giorni.</div>'}
    </div>
  </div>`;
  const notizie = (STATE.notizie || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 5);
  const sezNotizie = `<div class="card">
    <div class="section-title">Novità fiscali e di studio ${notizie.length ? `<span class="cnt">${notizie.length}</span>` : ''}</div>
    ${notizie.length ? notizie.map(n => `<div style="padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="font-weight:700;font-size:13px;">${n.url ? `<a href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.titolo)}</a>` : escapeHtml(n.titolo)}</div>
      <div class="helptext">${escapeHtml(n.fonte || '')}${n.fonte && n.data ? ' · ' : ''}${n.data ? fmtDataBreve(n.data) : ''}</div>
      ${n.sintesi ? `<div style="font-size:12.5px;margin-top:3px;">${escapeHtml(n.sintesi)}</div>` : ''}</div>`).join('')
      : '<div class="empty" style="padding:6px 0;">Nessuna novità ancora. Chiedi a Claude di aggiornarle (es. dalle news di SEAC): compariranno qui.</div>'}
  </div>`;

  const sezTask = (operatorePuoVedere('taskteam') && taskMiei.length) ? `<div class="card">
    <div class="section-title">${me ? 'I tuoi task' : 'Task aperti'} <span class="cnt">${taskMiei.length}</span></div>
    ${taskMiei.slice(0, 5).map(t => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="apri-dettaglio-task-team" data-id="${t.id}">
      <span style="flex:1;font-size:13px;">${escapeHtml(t.titolo)}</span>
      ${t.scadenza ? `<span class="helptext">${taskInRitardo(t) ? '⚠️ ' : ''}${fmtDataBreve(t.scadenza)}</span>` : ''}
    </div>`).join('')}
    ${taskMiei.length > 5 ? '<div style="margin-top:10px;"><button class="btn small" data-action="nav" data-nav="taskteam">Vedi tutti →</button></div>' : ''}
  </div>` : '';

  const annualiAperti = derivati().annuali.filter(a => !a.completato && a.faseCorrente);
  const fasiPronte = me ? annualiAperti.filter(a => a.faseCorrente.responsabile === me) : [];
  const fasiAttesa = me ? annualiAperti.filter(a => a.faseCorrente.responsabile && a.faseCorrente.responsabile !== me && a.sotto.some(x => !x.completato && x.responsabile === me)) : [];
  const rigaFase = (a, attesa) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-action="dash-apri-annuale" data-id="${a.id}">
      <span class="badge ${attesa ? 'info' : 'stato-da-fare'}">${attesa ? '⏳ Attesa' : '▶ Pronta'}</span>
      <span style="flex:1;font-size:13px;"><strong>${escapeHtml(nomeCliente(a.clienteId))}</strong> — ${escapeHtml(a.tipoNome)}: ${escapeHtml(a.faseCorrente.nome)}${attesa ? ` <span class="helptext">(${escapeHtml(a.faseCorrente.responsabile)})</span>` : ''}</span>
      ${a.scadenza ? `<span class="helptext">${fmtDataBreve(a.scadenza)}</span>` : ''}
    </div>`;
  const sezFasi = (operatorePuoVedere('annuali') && (fasiPronte.length || fasiAttesa.length)) ? `<div class="card">
    <div class="section-title">Adempimenti: fasi per te <span class="cnt">${fasiPronte.length}</span></div>
    ${fasiPronte.slice(0, 8).map(a => rigaFase(a, false)).join('') || '<div class="helptext">Nessuna fase pronta per te al momento.</div>'}
    ${fasiAttesa.length ? `<div class="helptext" style="margin:10px 0 2px;">In attesa di altri (${fasiAttesa.length})</div>` + fasiAttesa.slice(0, 6).map(a => rigaFase(a, true)).join('') : ''}
  </div>` : '';
  const aperteMie = me ? fasiPronte.concat(fasiAttesa) : annualiAperti;
  const sezAnnuali = (operatorePuoVedere('annuali') && aperteMie.length) ? `<div class="card">
    <div class="section-title">Pratiche in corso <span class="cnt">${aperteMie.length}</span></div>
    <div class="schede-annuali">${aperteMie.slice().sort((a, b) => (a.scadenza || '9999').localeCompare(b.scadenza || '9999')).slice(0, 6).map(a => `<div class="scheda-annuale" data-action="dash-apri-annuale" data-id="${a.id}">
      <div class="scheda-cliente">${escapeHtml(nomeCliente(a.clienteId))}</div>
      <div class="helptext">${escapeHtml(a.tipoNome)}${a.scadenza ? ' · entro il ' + fmtDataBreve(a.scadenza) : ''}</div>
      <div class="progress" style="margin:8px 0 4px;"><div style="width:${a.percentuale || 0}%"></div></div>
      <div class="helptext">${a.percentuale || 0}% · ${escapeHtml(a.faseCorrente ? a.faseCorrente.nome : '')}</div>
    </div>`).join('')}</div>
  </div>` : '';
  const chatRiga = chatNL ? `<div class="card" style="cursor:pointer;" data-action="nav" data-nav="chat"><strong>💬 ${chatNL}</strong> ${chatNL === 1 ? 'messaggio non letto' : 'messaggi non letti'} in chat <span class="badge" style="float:right;">Apri →</span></div>` : '';

  const altro = operatorePuoVedere('dashboard') ? `<div style="margin-top:6px;"><button class="btn small" data-action="nav" data-nav="dashboard">Vai alla Dashboard dello studio →</button></div>` : '';

  return hero + renderChecklistSetup() + tiles + sezUrgenti + sezAnnuali + sezTask + chatRiga + sezNotizie + altro;
}

/* -------------------- PAGINAZIONE LISTE --------------------
   Con 100-200 clienti attivi le viste a lista lunga (Scadenze, Annuali...) possono generare
   centinaia o migliaia di righe in un anno (misurato: ~1600 scadenze/anno per 150 clienti).
   Stampare tutto nel DOM in un colpo, come si faceva prima, blocca il rendering per diversi
   secondi ad ogni apertura della vista. Ogni renderer a lista lunga passa la propria lista già
   filtrata/ordinata a paginaLista(vista, lista) e stampa solo lista.pagina, poi aggiunge
   controlliPaginazione(...) in fondo. "vista" è una chiave stabile per tenere la pagina separata
   per ciascuna lista (es. 'scadenze', 'clienti', 'taskteam-Da fare'...). */
const RIGHE_PER_PAGINA = 50;
let PAGINE = {}; // { vista: numeroPaginaCorrente }

function resetPagina(vista) { PAGINE[vista] = 1; }

function paginaLista(vista, listaCompleta, perPagina) {
  perPagina = perPagina || RIGHE_PER_PAGINA;
  const totale = listaCompleta.length;
  const totalePagine = Math.max(1, Math.ceil(totale / perPagina));
  let pag = PAGINE[vista] || 1;
  if (pag > totalePagine) pag = totalePagine;
  if (pag < 1) pag = 1;
  PAGINE[vista] = pag;
  const start = (pag - 1) * perPagina;
  return { pagina: listaCompleta.slice(start, start + perPagina), numeroPagina: pag, totalePagine, totale, perPagina, vista };
}

function controlliPaginazione(info) {
  const { vista, numeroPagina, totalePagine, totale, perPagina } = info;
  if (totalePagine <= 1) return '';
  const daIdx = totale === 0 ? 0 : (numeroPagina - 1) * perPagina + 1;
  const aIdx = Math.min(numeroPagina * perPagina, totale);
  return `<div class="paginazione">
    <span class="helptext">${daIdx}–${aIdx} di ${totale}</span>
    <div style="display:flex;gap:8px;align-items:center;">
      <button class="btn small" data-action="pagina-prev" data-vista="${vista}" data-tot="${totalePagine}" ${numeroPagina<=1?'disabled':''}>← Precedente</button>
      <span class="helptext">Pagina ${numeroPagina} di ${totalePagine}</span>
      <button class="btn small" data-action="pagina-next" data-vista="${vista}" data-tot="${totalePagine}" ${numeroPagina>=totalePagine?'disabled':''}>Successiva →</button>
    </div>
  </div>`;
}

/* -------------------- RICERCA GLOBALE --------------------
   Con 100-200 clienti, "dov'è quel cliente/quella comunicazione/quel documento" diventa un
   problema reale se bisogna sapere in anticipo in quale vista e con quale filtro cercarlo.
   Ctrl/Cmd+K (o il pulsante in alto) apre una ricerca unica su clienti, scadenze, adempimenti
   annuali, comunicazioni, documenti, task team, soci e F24 — ogni risultato porta dritto al
   punto giusto, riusando la stessa navigazione già presente altrove (es. scheda cliente 360°).
   Nota di design: scadenze/annuali/comunicazioni/documenti/F24 vengono cercati SOLO sul proprio
   testo (adempimento, oggetto, nome, descrizione), non anche sul nome cliente — altrimenti
   digitare il nome di un cliente con 12 scadenze/anno produrrebbe 12 righe ridondanti in più
   categorie. Cercare un cliente per nome resta compito della categoria "Clienti", che porta
   comunque alla sua scheda 360° con tutto quanto sopra già in vista. */
let RICERCA_QUERY = '';
let RICERCA_RISULTATI = [];
let RICERCA_SEL = 0;

function risultatiRicercaGlobale(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  const push = (categoria, titolo, sottotitolo, azione) => out.push({ categoria, titolo, sottotitolo, azione });

  STATE.clienti.forEach(c => {
    const campi = [c.ragioneSociale, c.partitaIva, c.codiceFiscale, c.settore, (c.contatti||{}).email, (c.contatti||{}).telefono, (c.contatti||{}).pec];
    if (campi.filter(Boolean).some(v => String(v).toLowerCase().includes(q))) {
      push('Clienti', c.ragioneSociale, `${c.regimeFiscale||'—'}${c.stato==='cessato'?' · cessato':''}${c.partitaIva?' · P.IVA '+c.partitaIva:''}`,
        () => { SCHEDA_CLIENTE = c.id; chiudiModal(); setView('schedacliente'); });
    }
  });

  const { tutteScadenze, annuali } = derivati();
  tutteScadenze.forEach(s => {
    if (s.nome.toLowerCase().includes(q)) {
      const nomeCli = nomeCliente(s.clienteId);
      push('Scadenze', `${s.nome} — ${nomeCli}`, `${fmtDataBreve(s.data)} · ${s.stato}`,
        () => { SCAD_FILTRO = { bucket: 'Tutti', stato: 'Tutti', resp: 'Tutti', tipo: 'Tutti', q: nomeCli, dataDa: '', dataA: '' }; resetPagina('scadenze'); chiudiModal(); setView('scadenze'); });
    }
  });

  annuali.forEach(a => {
    if (a.tipoNome.toLowerCase().includes(q)) {
      const nomeCli = nomeCliente(a.clienteId);
      push('Adempimenti annuali', `${a.tipoNome} — ${nomeCli}`, `${a.percentuale}% completato${a.scadenza?' · scad. '+fmtDataBreve(a.scadenza):''}`,
        () => { ANN_FILTRO = { tipo: 'Tutti', resp: 'Tutti', stato: 'Tutti', q: nomeCli }; resetPagina('annuali'); chiudiModal(); setView('annuali'); });
    }
  });

  STATE.comunicazioni.forEach(c => {
    if ((c.oggetto||'').toLowerCase().includes(q)) {
      const nomeCli = nomeCliente(c.clienteId);
      push('Comunicazioni', c.oggetto, `${fmtDataBreve(c.data)} · ${nomeCli} · ${c.stato}`,
        () => { COM_FILTRO = { cliente: c.clienteId, stato: 'Tutti', categoria: 'Tutte', direzione: 'Tutte', chiusura: 'Tutte' }; resetPagina('comunicazioni'); chiudiModal(); setView('comunicazioni'); });
    }
  });

  STATE.documenti.forEach(d => {
    if ((d.nome||'').toLowerCase().includes(q)) {
      const nomeCli = nomeCliente(d.clienteId);
      push('Documenti', d.nome, `${nomeCli}${d.dataScadenza?' · scad. '+fmtDataBreve(d.dataScadenza):''}`,
        () => { DOC_FILTRO = { cliente: d.clienteId, categoria: 'Tutti' }; resetPagina('documenti'); chiudiModal(); setView('documenti'); });
    }
  });

  STATE.taskTeam.forEach(t => {
    if ((t.titolo||'').toLowerCase().includes(q)) {
      const nomeCli = t.clienteId ? nomeCliente(t.clienteId) : null;
      push('Task team', t.titolo, `${t.assegnatoA||'—'}${nomeCli?' · '+nomeCli:''} · ${t.stato}`,
        () => { chiudiModal(); setView('taskteam'); modalDettaglioTaskTeam(t.id); });
    }
  });

  (STATE.soci||[]).forEach(s => {
    if ((s.nome||'').toLowerCase().includes(q) || (s.ruolo||'').toLowerCase().includes(q)) {
      push('Soci e referenti', s.nome, `${s.ruolo||''}${(s.clienteIds||[]).length?' · '+s.clienteIds.map(nomeCliente).join(', '):''}`,
        () => { chiudiModal(); setView('soci'); modalSocio(s.id); });
    }
  });

  (STATE.f24||[]).forEach(f => {
    if ((f.descrizione||'').toLowerCase().includes(q)) {
      const nomeCli = nomeCliente(f.clienteId);
      push('F24', `${f.descrizione} — ${nomeCli}`, `${fmtDataBreve(f.data)} · ${fmtEuro(f.importo)}`,
        () => { F24_FILTRO = { cliente: f.clienteId, tipo: 'Tutti' }; resetPagina('f24'); chiudiModal(); setView('f24'); });
    }
  });

  (STATE.preventivi||[]).forEach(p => {
    if ([p.oggetto, p.nomeModello, p.categoria].filter(Boolean).some(v => String(v).toLowerCase().includes(q))) {
      push('Preventivi e mandati', `${p.categoria} — ${nomeCliente(p.clienteId)}`, `${p.oggetto||''} · ${p.stato}`,
        () => { chiudiModal(); setView('preventivi'); modalDettaglioPreventivo(p.id); });
    }
  });
  (STATE.incassi||[]).forEach(i => {
    if ([i.descrizione, i.numero].filter(Boolean).some(v => String(v).toLowerCase().includes(q))) {
      push('Incassi', `${i.descrizione||'Incasso'} — ${nomeCliente(i.clienteId)}`, `${fmtEuro(i.importo)} · ${statoIncasso(i)}`,
        () => { INC_FILTRO = { cliente: i.clienteId, stato: 'Tutti' }; chiudiModal(); setView('incassi'); });
    }
  });
  (STATE.attivitaFatturabili||[]).forEach(a => {
    if ((a.descrizione||'').toLowerCase().includes(q)) {
      push('Da fatturare', `${a.descrizione} — ${nomeCliente(a.clienteId)}`, `${a.stato}${a.importo != null ? ' · ' + fmtEuro(a.importo) : ''}`,
        () => { FATT_FILTRO = { cliente: a.clienteId, vista: a.stato === 'Fatturata' ? 'storico' : 'aperte' }; chiudiModal(); setView('fatturazione'); });
    }
  });
  (STATE.libriSociali||[]).forEach(l => {
    if ([l.tipo, l.detentoreNote, l.note].filter(Boolean).some(v => String(v).toLowerCase().includes(q))) {
      push('Libri sociali', `${l.tipo} — ${nomeCliente(l.clienteId)}`, `Detenuto da ${l.detenutoDa}`,
        () => { LIBRI_FILTRO = { cliente: l.clienteId, tipo: 'Tutti', detentore: 'Tutti' }; chiudiModal(); setView('libri'); });
    }
  });
  (STATE.procedureInterne||[]).forEach(p => {
    if ([p.nome, p.categoria].filter(Boolean).some(v => String(v).toLowerCase().includes(q))) {
      push('Procedure interne', p.nome, p.categoria || '', () => { chiudiModal(); setView('procedure'); });
    }
  });

  /* Sezioni (tab) dell'app e sezioni di Impostazioni: si cercano per nome ("concordato", "libri sociali", "responsabili"...)
     e si aprono dal risultato. Compaiono in testa. Solo quelle che l'operatore può vedere (moduli attivi, permessi). */
  const ALIAS_SEZIONI = { cpb: 'cpb concordato preventivo biennale', scadenze: 'iva inps intrastat imu lipe', annuali: 'dichiarazioni 770 cu redditi bilancio', ritenute: 'ritenuta acconto', antiriciclaggio: 'aml adeguata verifica',
    preventivi: 'mandati lettere incarico', deontologia: 'equo compenso fpc', fatturazione: 'fatturare fatture', credenziali: 'password entratel', oggi: 'mio lavoro', schedacliente: 'scheda cliente 360', strumenti: 'pdf word converti unisci dividi' };
  const sezioni = [];
  NAV.forEach(g => g.items.forEach(it => {
    if (!operatorePuoVedere(it.id)) return;
    const titolo = (PAGE_TITLES[it.id] || [it.label])[0];
    if ([it.label, titolo, ALIAS_SEZIONI[it.id] || ''].join(' ').toLowerCase().includes(q)) {
      sezioni.push({ categoria: 'Sezioni', titolo: it.label, sottotitolo: `Menu › ${g.group}`, azione: () => { chiudiModal(); setView(it.id); } });
    }
  }));
  if (operatorePuoVedere('impostazioni') && typeof impSezioniVisibili === 'function') {
    impSezioniVisibili().forEach(sz => {
      if (`impostazioni ${sz.label}`.toLowerCase().includes(q) || sz.label.toLowerCase().includes(q)) {
        sezioni.push({ categoria: 'Sezioni', titolo: `Impostazioni › ${sz.label}`, sottotitolo: 'Impostazioni', azione: () => { IMP_SEZIONE = sz.id; chiudiModal(); setView('impostazioni'); } });
      }
    });
  }

  return sezioni.concat(out);
}

function modalRicercaGlobale() {
  RICERCA_QUERY = '';
  RICERCA_SEL = 0;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:640px;padding-top:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <input id="ricercaInput" type="text" placeholder="Cerca clienti, scadenze, preventivi, incassi, documenti, task, libri sociali, F24..." style="flex:1;padding:11px 13px;border:1px solid var(--border);border-radius:8px;font-size:14.5px;" data-action="ricerca-input" autocomplete="off">
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div id="ricercaResults"></div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  const input = document.getElementById('ricercaInput');
  if (input) input.focus();
  aggiornaRisultatiRicerca();
}

/* Aggiorna SOLO il contenitore dei risultati, senza toccare l'input: se rifacessimo l'intero
   modale ad ogni tasto premuto (come fa render() per il resto dell'app) l'input perderebbe il
   focus mentre si scrive — stesso motivo per cui scad-cambia-nota/importo evitano render(). */
function aggiornaRisultatiRicerca() {
  const el = document.getElementById('ricercaResults');
  if (!el) return;
  if (RICERCA_QUERY.trim().length < 2) {
    RICERCA_RISULTATI = [];
    el.innerHTML = `<div class="empty" style="padding:24px 4px;">Digita almeno 2 caratteri per cercare.</div>`;
    return;
  }
  RICERCA_RISULTATI = risultatiRicercaGlobale(RICERCA_QUERY).slice(0, 40);
  if (RICERCA_SEL >= RICERCA_RISULTATI.length) RICERCA_SEL = Math.max(0, RICERCA_RISULTATI.length - 1);
  if (RICERCA_RISULTATI.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:24px 4px;">Nessun risultato per "${escapeHtml(RICERCA_QUERY)}".</div>`;
    return;
  }
  const perCategoria = new Map();
  RICERCA_RISULTATI.forEach((r, idx) => { r._idx = idx; if (!perCategoria.has(r.categoria)) perCategoria.set(r.categoria, []); perCategoria.get(r.categoria).push(r); });
  el.innerHTML = `<div style="max-height:60vh;overflow-y:auto;">` + Array.from(perCategoria.entries()).map(([cat, righe]) => `
    <div style="font-size:11px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.03em;margin:12px 2px 4px;">${escapeHtml(cat)} (${righe.length})</div>
    ${righe.map(r => `<div class="client-row" data-action="ricerca-apri" data-idx="${r._idx}" style="cursor:pointer;margin-bottom:4px;${r._idx===RICERCA_SEL?'border-color:var(--blu-mid);background:#f4f8fc;':''}">
      <div><div class="name">${escapeHtml(r.titolo)}</div><div class="meta">${escapeHtml(r.sottotitolo||'')}</div></div>
    </div>`).join('')}
  `).join('') + `</div>`;
}

