'use strict';
/* -------------------- MOTORE MODELLI DOCUMENTO (task #122-128) --------------------
   Un "modello" è testo libero con segnaposto {{così}}. Quelli NOTI (dati cliente/studio/data,
   vedi PLACEHOLDER_AUTO_LEGENDA) si compilano da soli da STATE; qualunque altro segnaposto
   inventato nel testo del modello diventa automaticamente un campo da compilare quando si crea
   un documento da quel modello — nessuno schema fisso da mantenere, funziona identico per
   Preventivi/Mandati/Lettere di incarico e per i documenti Antiriciclaggio (categoria che inizia
   per "AML"). Il testo generato viene SALVATO come istantanea sul documento (non ricalcolato in
   automatico ogni volta): modificare il modello in seguito non altera i documenti già emessi,
   com'è corretto per un contratto o una dichiarazione già firmata. Un pulsante "Rigenera dal
   modello" nel dettaglio del documento permette di aggiornare volutamente una bozza non ancora
   inviata se il modello o i dati del cliente sono cambiati. */
const PLACEHOLDER_AUTO_LEGENDA = [
  { chiave: 'cliente.ragioneSociale', label: 'Ragione sociale / nome del cliente' },
  { chiave: 'cliente.indirizzo', label: 'Indirizzo completo del cliente' },
  { chiave: 'cliente.piva', label: 'Partita IVA del cliente' },
  { chiave: 'cliente.codiceFiscale', label: 'Codice fiscale del cliente' },
  { chiave: 'cliente.pec', label: 'PEC del cliente' },
  { chiave: 'cliente.email', label: 'Email del cliente' },
  { chiave: 'cliente.telefono', label: 'Telefono del cliente' },
  { chiave: 'studio.nome', label: 'Nome dello studio' },
  { chiave: 'studio.iscrizione', label: 'Iscrizione albo/ordine' },
  { chiave: 'studio.indirizzo', label: 'Indirizzo dello studio' },
  { chiave: 'studio.cf', label: 'Codice fiscale del professionista' },
  { chiave: 'studio.citta', label: 'Città dello studio (es. per il foro competente)' },
  { chiave: 'studio.pec', label: 'PEC dello studio' },
  { chiave: 'studio.email', label: 'Email dello studio' },
  { chiave: 'studio.telefono', label: 'Telefono dello studio' },
  { chiave: 'studio.polizza', label: 'Estremi polizza RC professionale' },
  { chiave: 'data.oggi', label: 'Data odierna (gg/mm/aaaa)' },
  { chiave: 'data.luogoOggi', label: 'Luogo e data odierna (es. "Vicenza, 14/09/2026")' },
  { chiave: 'data.luogoOggiEsteso', label: 'Luogo e data odierna per esteso (es. "Vicenza, 14 settembre 2026")' },
];
const MESI_ESTESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function dataEstesa(iso) { const [y, m, g] = String(iso).split('-').map(Number); return `${g} ${MESI_ESTESI[m - 1]} ${y}`; }
function valoriAutomaticiPlaceholder(clienteId) {
  const cliente = clienteId ? clienteById(clienteId) : null;
  const contatti = (cliente && cliente.contatti) || {};
  const rigaIndirizzo = [contatti.indirizzo, [contatti.cap, contatti.localita, contatti.provincia].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const oggi = oggiISO();
  return {
    'cliente.ragioneSociale': cliente ? cliente.ragioneSociale : '',
    'cliente.indirizzo': rigaIndirizzo,
    'cliente.piva': cliente ? (cliente.partitaIva || '') : '',
    'cliente.codiceFiscale': cliente ? (cliente.codiceFiscale || '') : '',
    'cliente.pec': contatti.pec || '',
    'cliente.email': contatti.email || '',
    'cliente.telefono': contatti.telefono || '',
    'studio.nome': STATE.meta.studioNome || '',
    'studio.iscrizione': STATE.meta.iscrizione || '',
    'studio.indirizzo': STATE.meta.indirizzoStudio || '',
    'studio.cf': STATE.meta.cfStudio || '',
    'studio.citta': STATE.meta.citta || 'Vicenza',
    'studio.pec': STATE.meta.pecStudio || '',
    'studio.email': STATE.meta.emailStudio || '',
    'studio.telefono': STATE.meta.telefonoStudio || '',
    'studio.polizza': STATE.meta.polizzaRc || '',
    'data.oggi': fmtData(oggi),
    'data.luogoOggi': `${STATE.meta.citta || 'Vicenza'}, ${fmtData(oggi)}`,
    'data.luogoOggiEsteso': `${STATE.meta.citta || 'Vicenza'}, ${dataEstesa(oggi)}`,
  };
}
/* Estrae, nell'ordine di prima comparsa, tutti i segnaposto {{chiave}} presenti in un testo. */
function estraiPlaceholder(corpo) {
  const trovati = [];
  const visti = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(corpo || '')) !== null) {
    if (!visti.has(m[1])) { visti.add(m[1]); trovati.push(m[1]); }
  }
  return trovati;
}
/* Segnaposto "riservati": corrispondono a campi dedicati del documento (Oggetto, Importo, Data
   emissione, Valido fino), inseriti tramite i loro input specifici nel form e NON come campo
   personalizzato — anche se il modello li referenzia con {{oggetto}} ecc. si risolvono da soli. */
const PLACEHOLDER_RISERVATI = ['oggetto', 'importo', 'dataEmissione', 'validoFino'];
/* Solo i segnaposto del modello che NON sono tra quelli automatici o riservati: sono questi a
   diventare campi del form quando si crea un documento da quel modello. */
function placeholderPersonalizzatiModello(corpo) {
  const auto = new Set(PLACEHOLDER_AUTO_LEGENDA.map(p => p.chiave));
  const riservati = new Set(PLACEHOLDER_RISERVATI);
  return estraiPlaceholder(corpo).filter(k => !auto.has(k) && !riservati.has(k));
}
/* Compilazione guidata dei campi personalizzati di un modello (Matteo, sullo screenshot del
   modale AML: "i campi... senza una direzione precisa", con etichette illeggibili tipo
   "ESECUTORENOME" — la chiave grezza del segnaposto {{esecutoreNome}} maiuscolata di peso dal
   CSS, senza spazi tra le parole). Due correzioni indipendenti, entrambe puramente di
   presentazione (la chiave salvata in valoriCustom/{{segnaposto}} resta sempre quella grezza,
   invariata — cambia solo come viene MOSTRATA nel form):
   1) etichettaCampoPersonalizzato spezza il camelCase/snake_case in parole leggibili
      ("esecutoreNome" -> "Esecutore Nome") invece di lasciarlo tutto attaccato.
   2) raggruppaCampiPersonalizzatiModello raccoglie sotto un'unica intestazione i campi che
      condividono lo stesso primo termine (esecutoreNome/esecutoreCf/esecutoreNascita/... ->
      sezione "Esecutore" con le sole etichette "Nome"/"Cf"/"Nascita"...), così un blocco di
      textarea uguali senza gerarchia diventa un mini-modulo con una direzione riconoscibile. Un
      prefisso condiviso da un solo campo non genera una sezione fittizia di una riga sola: resta
      un campo normale con l'etichetta completa. */
function separaParoleChiaveCampo(chiave) {
  return String(chiave || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim();
}
function capitalizzaParola(p) { return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p; }
function etichettaCampoPersonalizzato(chiave) {
  const parole = separaParoleChiaveCampo(chiave).split(/\s+/).filter(Boolean);
  return parole.map(capitalizzaParola).join(' ') || chiave;
}
function raggruppaCampiPersonalizzatiModello(chiavi) {
  const contaPrefisso = new Map();
  chiavi.forEach(chiave => {
    const parole = separaParoleChiaveCampo(chiave).split(/\s+/).filter(Boolean);
    if (parole.length > 1) contaPrefisso.set(parole[0].toLowerCase(), (contaPrefisso.get(parole[0].toLowerCase()) || 0) + 1);
  });
  const vistiGruppi = new Set();
  const risultato = [];
  chiavi.forEach(chiave => {
    const parole = separaParoleChiaveCampo(chiave).split(/\s+/).filter(Boolean);
    const prefisso = parole.length > 1 ? parole[0].toLowerCase() : null;
    if (prefisso && contaPrefisso.get(prefisso) >= 2) {
      if (vistiGruppi.has(prefisso)) return;
      vistiGruppi.add(prefisso);
      const campiGruppo = chiavi.filter(k => {
        const p = separaParoleChiaveCampo(k).split(/\s+/).filter(Boolean);
        return p.length > 1 && p[0].toLowerCase() === prefisso;
      }).map(k => {
        const p = separaParoleChiaveCampo(k).split(/\s+/).filter(Boolean);
        return { chiave: k, label: p.slice(1).map(capitalizzaParola).join(' ') || capitalizzaParola(p[0]) };
      });
      risultato.push({ tipo: 'gruppo', label: capitalizzaParola(parole[0]), campi: campiGruppo });
    } else {
      risultato.push({ tipo: 'campo', chiave, label: etichettaCampoPersonalizzato(chiave) });
    }
  });
  return risultato;
}
/* Sostituisce tutti i segnaposto: quelli noti con i valori automatici, quelli personalizzati con
   il valore fornito dall'utente; un segnaposto personalizzato non ancora compilato resta visibile
   tra parentesi quadre invece di sparire in silenzio — meglio un vuoto evidente in una bozza che
   un contratto con un buco invisibile. */
function risolviTemplateDocumento(corpo, clienteId, valoriCustom) {
  const auto = valoriAutomaticiPlaceholder(clienteId);
  const custom = valoriCustom || {};
  return (corpo || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, chiave) => {
    if (Object.prototype.hasOwnProperty.call(auto, chiave)) return auto[chiave];
    if (Object.prototype.hasOwnProperty.call(custom, chiave) && custom[chiave] !== '') return custom[chiave];
    return `[${chiave}]`;
  });
}
/* Una categoria che inizia per "AML" è trattata come documento antiriciclaggio: vocabolario di
   stato più semplice (Bozza/Firmato) e comparirà nella sezione Documenti del fascicolo
   Antiriciclaggio invece che nella vista Preventivi e mandati. Convenzione di naming, non un
   elenco fisso: basta far iniziare così anche una categoria personalizzata per ottenere lo stesso
   comportamento. */
/* Testo pronto per il campo personalizzato "dettaglioAttivita" del modello (task #138): i modelli
   Preventivo/Mandato di Matteo hanno già {{dettaglioAttivita}} nel punto giusto, quindi qui non
   serve inventare un nuovo tipo di segnaposto — basta compilare quel campo esistente con l'elenco
   delle attività scelte dal catalogo invece di farlo scrivere a mano ogni volta. */
function testoElencoAttivita(elenco) {
  const voci = (elenco || []).filter(a => a && a.nome);
  if (!voci.length) return '';
  const righe = voci.map(a => `- ${a.nome}${a.prezzo != null ? ' — ' + fmtEuro(a.prezzo) : ''}`).join('\n');
  const conPrezzo = voci.some(a => a.prezzo != null);
  if (!conPrezzo) return righe;
  const totale = voci.reduce((s, a) => s + (Number(a.prezzo) || 0), 0);
  return righe + `\nTotale: ${fmtEuro(totale)}`;
}
function categoriaEAml(categoria) { return /^AML/i.test((categoria || '').trim()); }
function statiPerCategoriaDocumento(categoria) {
  return categoriaEAml(categoria) ? ['Bozza', 'Firmato'] : ['Bozza', 'Inviato', 'Accettato', 'Rifiutato'];
}
function classeDocumentoStato(stato) {
  if (stato === 'Accettato' || stato === 'Firmato') return 'stato-inviato-telematicamente';
  if (stato === 'Rifiutato') return 'stato-errore';
  if (stato === 'Inviato') return 'stato-da-fare';
  return 'info'; // Bozza
}

/* -------------------- MUTAZIONI: modelli documento (task #122-128) -------------------- */
function aggiungiModelloDocumento(m) {
  const nuovo = Object.assign({ id: uid('mod'), attivo: true, predefinito: false, creatoIl: oggiISO() }, m);
  STATE.modelliDocumento.push(nuovo);
  salvaStato();
  return nuovo;
}
function aggiornaModelloDocumento(id, patch) {
  const m = STATE.modelliDocumento.find(x => x.id === id);
  if (!m) return;
  Object.assign(m, patch);
  salvaStato();
}
function eliminaModelloDocumento(id) {
  STATE.modelliDocumento = STATE.modelliDocumento.filter(x => x.id !== id);
  salvaStato();
}
function duplicaModelloDocumento(id) {
  const m = STATE.modelliDocumento.find(x => x.id === id);
  if (!m) return null;
  const copia = Object.assign({}, m, { id: uid('mod'), nome: m.nome + ' (copia)', predefinito: false, creatoIl: oggiISO() });
  STATE.modelliDocumento.push(copia);
  salvaStato();
  return copia;
}

/* -------------------- MUTAZIONI: procedure interne (task #146) -------------------- */
function aggiungiProceduraInterna(p) {
  const nuova = Object.assign({ id: uid('proc'), attivo: true, checklistDocumenti: [], motiviAppuntamento: [], creatoIl: oggiISO() }, p);
  STATE.procedureInterne.push(nuova);
  salvaStato();
  return nuova;
}
function aggiornaProceduraInterna(id, patch) {
  const p = STATE.procedureInterne.find(x => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  salvaStato();
}
function eliminaProceduraInterna(id) {
  STATE.procedureInterne = STATE.procedureInterne.filter(x => x.id !== id);
  salvaStato();
}
function duplicaProceduraInterna(id) {
  const p = STATE.procedureInterne.find(x => x.id === id);
  if (!p) return null;
  const copia = Object.assign({}, p, { id: uid('proc'), nome: p.nome + ' (copia)', checklistDocumenti: (p.checklistDocumenti || []).slice(), motiviAppuntamento: (p.motiviAppuntamento || []).slice(), creatoIl: oggiISO() });
  STATE.procedureInterne.push(copia);
  salvaStato();
  return copia;
}

/* -------------------- MUTAZIONI: documenti da modello — preventivi/mandati/AML (task #121-126) -------------------- */
function aggiungiPreventivo(p) {
  const nuovo = Object.assign({ id: uid('doc'), stato: 'Bozza', creatoIl: oggiISO() }, p);
  STATE.preventivi.push(nuovo);
  salvaStato();
  return nuovo;
}
function aggiornaPreventivo(id, patch) {
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  salvaStato();
}
function eliminaPreventivo(id) {
  STATE.preventivi = STATE.preventivi.filter(x => x.id !== id);
  salvaStato();
}

/* Accettazione di un preventivo (flusso di Matteo: il preventivo nasce in Prisma, la segreteria lo
   invia via mail, il cliente lo restituisce firmato via mail → si archivia in Documenti e si
   registra l'accettazione). Se il cliente era "potenziale" diventa attivo, parte l'onboarding
   (voce "mandato firmato" già spuntata) e si crea un task per l'avvio pratica. Gestione manuale:
   nessun invio automatico di mail. */
function accettaPreventivo(id, opz) {
  opz = opz || {};
  const p = STATE.preventivi.find(x => x.id === id);
  if (!p) return null;
  const data = opz.data || oggiISO();
  const cliente = clienteById(p.clienteId);
  let documentoId = null;
  if (opz.file && opz.file.percorso) {
    const doc = aggiungiDocumento({
      clienteId: p.clienteId, categoria: 'Contratto', nome: `${p.categoria} firmato — ${p.oggetto || ''}`.trim(),
      dataCaricamento: data, dataScadenza: null, filePercorso: opz.file.percorso, fileNome: opz.file.nomeFile, fileDimensione: opz.file.dimensione,
    });
    documentoId = doc.id;
  }
  aggiornaPreventivo(id, { stato: 'Accettato', dataAccettazione: data, documentoFirmatoId: documentoId || p.documentoFirmatoId || null, noteAccettazione: opz.nota || '' });
  let attivato = false;
  if (cliente && p.categoria === 'Preventivo') {
    const continuativo = (p.attivitaScelte || []).some(a => a.richiedeMandato);
    const patch = {};
    if (cliente.stato === 'potenziale') { patch.stato = 'attivo'; patch.dataIngresso = data; attivato = true; }
    if (attivato || !cliente.tipoRapporto) patch.tipoRapporto = continuativo ? 'Contratto continuativo' : 'Pratica una tantum';
    if (attivato && continuativo && cliente.preventivoAnnuo == null && p.importo != null) patch.preventivoAnnuo = p.importo;
    if (Object.keys(patch).length) aggiornaCliente(cliente.id, patch);
    if (attivato) {
      if (opz.responsabile) aggiornaCliente(cliente.id, { responsabileStudio: opz.responsabile });
      if (!STATE.onboarding[cliente.id]) STATE.onboarding[cliente.id] = nuovoOnboarding();
      STATE.onboarding[cliente.id].mandato = true;
      const steps = stepAperturaPosizione(clienteById(cliente.id));
      if (steps.length) STATE.onboarding[cliente.id].apertura = steps.map(x => ({ chiave: x.chiave, nome: x.nome.replace(/^./, ch => ch), fatto: false }));
      const d = new Date(); d.setDate(d.getDate() + 7);
      const testoTask = steps.length
        ? 'Da aprire: ' + steps.map(x => x.nome.charAt(0).toLowerCase() + x.nome.slice(1)).join(', ') + '. Spunta gli step completati in Onboarding.'
        : 'Preventivo accettato: completare scheda anagrafica, documenti, antiriciclaggio e deleghe (vedi Onboarding).';
      aggiungiTaskTeam({
        titolo: `Apertura posizione cliente ${cliente.ragioneSociale}`, assegnatoA: opz.assegnatarioApertura || opz.responsabile || cliente.responsabileStudio || null,
        clienteId: cliente.id, scadenza: d.toISOString().slice(0, 10), stato: STATI_TASK_TEAM[0],
        noteStorico: [{ id: uid('nota'), testo: testoTask, autore: operatoreCorrente() || null, data: oggiISO() }],
        creatoIl: oggiISO(),
      });
      const fa = fascicoloAntiriciclaggio(cliente.id);
      if (!fa.valutazione) {
        fa.valutazioneRichiesta = true;
        aggiungiTaskTeam({
          titolo: `Valutazione antiriciclaggio ${cliente.ragioneSociale}`, assegnatoA: operatoreCorrente() || opz.responsabile || cliente.responsabileStudio || null,
          clienteId: cliente.id, scadenza: d.toISOString().slice(0, 10), stato: STATI_TASK_TEAM[0],
          noteStorico: [{ id: uid('nota'), testo: 'Preventivo accettato: fare la valutazione del rischio (Antiriciclaggio). Alla conferma si generano mandato e dichiarazione da far firmare al cliente.', autore: operatoreCorrente() || null, data: oggiISO() }],
          creatoIl: oggiISO(),
        });
      }
      salvaStato();
    }
  }
  if (cliente && p.categoria === 'Preventivo') creaIncassiDaPreventivo(p.id, data);
  return { attivato, documentoId };
}

/* Incasso da riscuotere creato all'accettazione: una riga per rata (unica soluzione = 1; 50%+50% = 2). La fattura la emette lo studio
   col programma di fatturazione: qui si tiene solo traccia di cosa va incassato; il numero fattura si aggiunge a mano. Non duplica mai. */
function creaIncassiDaPreventivo(preventivoId, data) {
  const p = STATE.preventivi.find(x => x.id === preventivoId);
  if (!p || !(Number(p.importo) > 0)) return [];
  if ((STATE.incassi || []).some(i => i.preventivoId === preventivoId)) return [];
  const tot = Math.round(Number(p.importo) * 100) / 100, base = p.oggetto || 'Preventivo';
  const rate = p.pagamentoModo === '5050'
    ? [{ n: '1° acconto 50% (firma mandato)', imp: Math.round(tot * 50) / 100, scad: aggiungiGiorniISO(data, 15) }, { n: '2° saldo 50% (a completamento attività)', imp: Math.round((tot - Math.round(tot * 50) / 100) * 100) / 100, scad: '' }]
    : [{ n: p.pagamentoModo === 'unica' ? 'Unica soluzione (firma mandato)' : 'Compenso da preventivo', imp: tot, scad: aggiungiGiorniISO(data, 15) }];
  return rate.map((r, k) => aggiungiIncasso({ clienteId: p.clienteId, descrizione: `${base} — ${r.n}`, importo: r.imp, dataEmissione: data, dataScadenza: r.scad, preventivoId, rata: k + 1, note: 'Da fatturare/incassare (preventivo accettato). Importi al netto di C.P. e IVA.' }));
}

/* -------------------- RICONCILIAZIONE ESTRATTO CONTO (CSV/Excel) -------------------- */
function dataIsoDaCella(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const t = String(v == null ? '' : v).trim(); let m;
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
/* righe = array di array (CSV o foglio Excel). Restituisce solo i movimenti in ENTRATA: {data, importo, descrizione}. */
function parseEstrattoConto(righe) {
  const idx = { data: -1, desc: -1, avere: -1, importo: -1 };
  let inizio = 0;
  for (let r = 0; r < Math.min(righe.length, 25); r++) {
    const c = (righe[r] || []).map(x => String(x == null ? '' : x).toLowerCase());
    const d = c.findIndex(x => /^data/.test(x.trim())), a = c.findIndex(x => /avere|accredit|entrat/.test(x)), i = c.findIndex(x => /importo|ammontare/.test(x));
    const ds = c.findIndex(x => /descri|causale|operazione|dettagl|motivo/.test(x));
    if (d >= 0 && (a >= 0 || i >= 0)) { idx.data = d; idx.avere = a; idx.importo = i; idx.desc = ds; inizio = r + 1; break; }
  }
  const out = [];
  for (let r = inizio; r < righe.length; r++) {
    const riga = righe[r] || [];
    const data = dataIsoDaCella(idx.data >= 0 ? riga[idx.data] : riga.find(x => dataIsoDaCella(x)));
    if (!data) continue;
    let imp = null;
    if (idx.avere >= 0) { const n = parseNumeroIt(riga[idx.avere]); if (n && n > 0) imp = n; }
    else if (idx.importo >= 0) { const n = parseNumeroIt(riga[idx.importo]); if (n && n > 0) imp = n; }
    else { const nums = riga.map(parseNumeroIt).filter(n => n != null && !(Number.isInteger(n) && n > 1900 && n < 2100)); if (nums.length) { const n = nums[nums.length - 1]; if (n > 0) imp = n; } }
    if (!imp) continue;
    const descrizione = (idx.desc >= 0 ? [riga[idx.desc]] : riga.filter(x => typeof x === 'string' && isNaN(parseNumeroIt(x)) && !dataIsoDaCella(x))).join(' ').replace(/\s+/g, ' ').trim();
    out.push({ data, importo: Math.round(imp * 100) / 100, descrizione });
  }
  return out;
}
function tokenNomeCliente(c) {
  return String(c && c.ragioneSociale || '').toLowerCase().replace(/[^a-z0-9àèéìòù ]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !['srl', 'snc', 'sas', 'spa', 'sagl', 'ssd', 'aps', 'ets', 'societa', 'società', 'studio', 'the', 'di', 'del', 'dei'].includes(t));
}
/* Abbina ogni entrata a un incasso aperto: importo uguale al residuo (o all'importo) + origine (nome cliente o n. fattura nella causale). */
function abbinaMovimenti(movimenti) {
  const aperti = (STATE.incassi || []).filter(i => residuoIncasso(i) > 0.004);
  const usati = new Set();
  return movimenti.map(m => {
    const desc = m.descrizione.toLowerCase();
    const cand = aperti.filter(i => !usati.has(i.id) && (Math.abs(residuoIncasso(i) - m.importo) < 0.01 || Math.abs((Number(i.importo) || 0) - m.importo) < 0.01));
    const conOrigine = cand.filter(i => { const c = clienteById(i.clienteId); const tk = tokenNomeCliente(c); return (i.numero && desc.includes(String(i.numero).toLowerCase())) || (tk.length && tk.some(t => desc.includes(t))); });
    let sc = null, livello = 'nessuno';
    if (conOrigine.length === 1) { sc = conOrigine[0]; livello = 'sicuro'; }
    else if (conOrigine.length > 1) { conOrigine.sort((x, y) => (x.rata || 0) - (y.rata || 0) || String(x.dataEmissione).localeCompare(String(y.dataEmissione))); sc = conOrigine[0]; livello = conOrigine.every(i => i.clienteId === sc.clienteId) ? 'sicuro' : 'dubbio'; } // stesso cliente e stesso importo: si salda prima la rata più vecchia
    else if (cand.length === 1) { sc = cand[0]; livello = 'possibile'; }
    else if (cand.length > 1) { sc = cand[0]; livello = 'dubbio'; }
    if (sc) usati.add(sc.id);
    return Object.assign({}, m, { incassoId: sc ? sc.id : null, livello });
  });
}
let RICONC = null;
function importaEstrattoConto(inputEl) {
  const file = inputEl.files && inputEl.files[0]; if (!file) return;
  const nome = file.name.toLowerCase();
  const fine = (righe) => { const mov = parseEstrattoConto(righe); if (!mov.length) { toast('Nessuna entrata riconosciuta nel file. Servono colonne data, descrizione e importo/avere.', true); return; } RICONC = { file: file.name, mov: abbinaMovimenti(mov) }; modalRiconciliazione(); };
  if (nome.endsWith('.pdf')) { toast('Per gli estratti PDF chiedi a Claude (connessione IA): legge il PDF e registra gli incassi con lo stesso abbinamento. Qui CSV o Excel.', true); inputEl.value = ''; return; }
  if (nome.endsWith('.csv')) { const rd = new FileReader(); rd.onload = () => { try { fine(parseCSV(rd.result)); } catch (e) { toast('CSV non valido: ' + e.message, true); } }; rd.readAsText(file, 'UTF-8'); }
  else {
    if (typeof XLSX === 'undefined') { toast('Libreria Excel non disponibile (serve internet al primo caricamento). Usa il CSV.', true); inputEl.value = ''; return; }
    const rd = new FileReader(); rd.onload = () => { try { const wb = XLSX.read(rd.result, { type: 'array', cellDates: true }); fine(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })); } catch (e) { toast('Excel non valido: ' + e.message, true); } }; rd.readAsArrayBuffer(file);
  }
  inputEl.value = '';
}
function modalRiconciliazione() {
  const aperti = (STATE.incassi || []).filter(i => residuoIncasso(i) > 0.004);
  const etich = { sicuro: ['Importo + origine', 'var(--verde,#2a8f4a)'], possibile: ['Solo importo', 'var(--giallo)'], dubbio: ['Più candidati', 'var(--giallo)'], nessuno: ['Nessun abbinamento', 'var(--text-mut)'] };
  const righe = RICONC.mov.map((m, k) => `<tr>
    <td><input type="checkbox" data-action="riconc-spunta" data-k="${k}" ${m.incassoId && m.livello === 'sicuro' ? 'checked' : ''} ${m.incassoId ? '' : 'disabled'}></td>
    <td>${fmtData(m.data)}</td><td style="max-width:240px;font-size:12px;">${escapeHtml(m.descrizione)}</td><td style="text-align:right;white-space:nowrap;">${fmtEuro(m.importo)}</td>
    <td><select data-action="riconc-incasso" data-k="${k}"><option value="">— nessuno —</option>${aperti.map(i => `<option value="${i.id}" ${m.incassoId === i.id ? 'selected' : ''}>${escapeHtml(nomeCliente(i.clienteId))} · ${escapeHtml((i.descrizione || '').slice(0, 40))} · ${fmtEuro(residuoIncasso(i))}</option>`).join('')}</select>
      <div style="font-size:11px;color:${etich[m.livello][1]};">${etich[m.livello][0]}</div></td></tr>`).join('');
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:900px;">
    <div style="display:flex;justify-content:space-between;"><div><h2>Riconciliazione estratto conto</h2><div class="modal-sub">${escapeHtml(RICONC.file)} · ${RICONC.mov.length} entrate. Spuntati solo gli abbinamenti sicuri (importo + origine): controlla gli altri prima di confermare.</div></div><button class="icon-x" data-action="chiudi-modal">✕</button></div>
    <div style="overflow:auto;max-height:55vh;"><table class="tabella"><thead><tr><th></th><th>Data</th><th>Causale</th><th>Importo</th><th>Incasso abbinato</th></tr></thead><tbody>${righe}</tbody></table></div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="riconc-conferma">Registra incassi spuntati</button></div></div></div>`;
}
function confermaRiconciliazione() {
  let n = 0;
  RICONC.mov.forEach(m => { if (m.spunta && m.incassoId) { const i = (STATE.incassi || []).find(x => x.id === m.incassoId); if (!i) return; try { registraPagamentoIncasso(i.id, Math.min(m.importo, residuoIncasso(i)) || m.importo, m.data); n++; } catch (e) { /* saltato */ } } });
  if (!STATE.riconciliazioni) STATE.riconciliazioni = [];
  STATE.riconciliazioni.push({ id: uid('ric'), data: oggiISO(), file: RICONC.file, registrati: n, entrate: RICONC.mov.length }); salvaStato();
  RICONC = null; chiudiModal(); render(); toast(n ? `Registrati ${n} incassi dall'estratto conto.` : 'Nessun incasso registrato.');
}

/* -------------------- VALUTAZIONE RISCHIO ANTIRICICLAGGIO (modale + generazione documenti) -------------------- */
let AML_VAL_DRAFT = null;
function aggiungiMesiISO(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }
function testoRischioAml(e) {
  const mesi = validitaAmlMesi(e.grado);
  return `Il Professionista, sulla base della valutazione del rischio inerente e specifico (cliente + prestazione), classifica il rapporto come: ${e.grado} (rischio effettivo ${String(e.effettivo).replace('.', ',')}) – adeguata verifica ${e.verifica}. La presente dichiarazione ha validità di ${mesi} mesi dalla sottoscrizione e va rinnovata alla scadenza.`;
}
function esitoAmlHtml(v) {
  const e = calcolaValutazioneAml(v);
  const colore = e.grado === AML_GRADI[3] ? 'var(--rosso)' : e.grado === AML_GRADI[2] ? 'var(--giallo)' : 'var(--verde,#2a8f4a)';
  return `<div style="border:2px solid ${colore};border-radius:10px;padding:10px 14px;">
    <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;">
      <div>Rischio inerente <b>${e.inerente}</b></div><div>Specifico <b>${String(e.specifico).replace('.', ',')}</b></div><div>Effettivo <b>${String(e.effettivo).replace('.', ',')}</b> <span class="helptext" style="display:inline;">(30% inerente + 70% specifico)</span></div>
    </div>
    <div style="margin-top:6px;font-size:14px;font-weight:800;color:${colore};">${e.grado} · adeguata verifica ${e.verifica}</div>
    <div class="helptext" style="margin-top:4px;">Dichiarazione del cliente valida ${validitaAmlMesi(e.grado)} mesi${e.verifica === 'RAFFORZATA' ? '; con rischio molto significativo serve anche la nota di accettazione dell\'incarico' : ''}.</div>
  </div>`;
}
function modalValutazioneAml(cid) {
  const c = clienteById(cid); if (!c) return;
  const f = fascicoloAntiriciclaggio(cid);
  const sv = f.valutazione;
  const idxTenuta = AML_PRESTAZIONI.findIndex(x => x.nome === 'Tenuta della contabilità');
  const prestazione = sv ? sv.prestazione : idxTenuta;
  AML_VAL_DRAFT = { cid, prestazione, sezioneB: sv ? sv.sezioneB !== false : ![idxTenuta, AML_PRESTAZIONI.findIndex(x => x.nome === 'Revisione legale dei conti')].includes(prestazione), fattori: JSON.parse(JSON.stringify(sv ? sv.fattori : {})) };
  disegnaModalValutazioneAml();
}
function disegnaModalValutazioneAml() {
  const v = AML_VAL_DRAFT; const c = clienteById(v.cid); if (!c) return;
  const sezione = (cat) => {
    const d = (v.fattori[cat.k] = v.fattori[cat.k] || { checks: [], livello: 1 });
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;"><b style="font-size:12.5px;">${cat.k} · ${escapeHtml(cat.titolo)}</b>
        <label style="font-size:11.5px;">Livello <select data-action="aml-val-livello" data-k="${cat.k}">${[1, 2, 3, 4].map(n => `<option ${Number(d.livello) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      ${cat.fattori.map((t, i) => `<label class="checkline" style="font-size:12px;align-items:flex-start;"><input type="checkbox" data-action="aml-val-fattore" data-k="${cat.k}" data-i="${i}" ${d.checks[i] ? 'checked' : ''}> <span>${escapeHtml(t)}</span></label>`).join('')}
    </div>`;
  };
  const A = AML_FATTORI.filter(x => x.k[0] === 'A'), B = AML_FATTORI.filter(x => x.k[0] === 'B');
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop"><div class="modal" style="max-width:820px;max-height:92vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div><h2>Valutazione del rischio antiriciclaggio</h2><div class="modal-sub">${escapeHtml(c.ragioneSociale)} — D.Lgs. 231/2007, art. 17 c. 3</div></div>
      <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button></div>
    <div class="section-title" style="margin-top:8px;">I · Rischio inerente (prestazione)</div>
    <div class="field"><select data-action="aml-val-prestazione">${AML_PRESTAZIONI.map((x, i) => `<option value="${i}" ${v.prestazione === i ? 'selected' : ''}>${escapeHtml(x.nome)} (${x.punti})</option>`).join('')}</select></div>
    <div class="section-title" style="margin-top:12px;">II · Rischio specifico</div>
    <div class="helptext" style="margin-bottom:6px;">A. Aspetti connessi al cliente: spunta i fattori riscontrati e scegli il livello (1-4) per ogni gruppo.</div>
    ${A.map(sezione).join('')}
    <label class="checkline" style="margin:8px 0 4px;"><input type="checkbox" data-action="aml-val-sezioneb" ${v.sezioneB ? 'checked' : ''}> Compila anche la sezione B (aspetti connessi alla prestazione) <span class="helptext" style="display:inline;">— da non compilare per tenuta contabilità e revisione legale</span></label>
    ${v.sezioneB ? B.map(sezione).join('') : ''}
    <div class="section-title" style="margin-top:12px;">III-IV · Esito</div>
    <div id="amlEsito">${esitoAmlHtml(v)}</div>
    <div class="helptext" style="margin-top:8px;">Confermando: si aggiorna il fascicolo (profilo di rischio e prossima revisione) e si generano in bozza il mandato (se il preventivo lo richiede), la dichiarazione antiriciclaggio del cliente e, per rischio molto significativo, la nota di accettazione.</div>
    <div class="modal-actions"><button class="btn" data-action="chiudi-modal">Annulla</button><button class="btn primary" data-action="aml-val-conferma">Conferma e genera documenti</button></div>
  </div></div>`;
  const root = document.getElementById('modalRoot');
  const prec = root.querySelector('.modal'); const sc = prec ? prec.scrollTop : 0;
  root.innerHTML = html;
  const nuovo = root.querySelector('.modal'); if (nuovo) nuovo.scrollTop = sc;
}
function confermaValutazioneAml() {
  const v = AML_VAL_DRAFT; if (!v) return null;
  const cid = v.cid, c = clienteById(cid); if (!c) return null;
  const e = calcolaValutazioneAml(v);
  const f = fascicoloAntiriciclaggio(cid);
  const oggi = oggiISO(), mesi = validitaAmlMesi(e.grado);
  const scadenza = aggiungiMesiISO(oggi, mesi);
  const pr = AML_PRESTAZIONI[v.prestazione];
  const risultato = { mandatoId: null, dichiarazioneId: null, notaId: null };
  f.valutazione = { prestazione: v.prestazione, sezioneB: v.sezioneB, fattori: JSON.parse(JSON.stringify(v.fattori)), esito: e, data: oggi, valutatore: operatoreCorrente() || null, scadenza };
  f.profiloRischio = e.profilo; f.dataAdeguataVerifica = oggi; f.scadenzaRevisione = scadenza; f.valutazioneRichiesta = false;
  f.checklist.questionarioRischio = true;
  aggiungiNotaAntiriciclaggio(cid, `Valutazione del rischio: ${e.grado} (effettivo ${e.effettivo}), adeguata verifica ${e.verifica}. Dichiarazione valida ${mesi} mesi, revisione entro ${fmtData(scadenza)}.`);
  if (!STATE.onboarding[cid]) STATE.onboarding[cid] = nuovoOnboarding();
  STATE.onboarding[cid].questionarioAr = true;
  const prev = STATE.preventivi.filter(p => p.clienteId === cid && p.categoria === 'Preventivo' && p.stato === 'Accettato').sort((a, b) => (b.dataAccettazione || '').localeCompare(a.dataAccettazione || ''))[0];
  if (prev && (prev.attivitaScelte || []).some(a => a.richiedeMandato)) { const m = generaMandatoDaPreventivo(prev, true); if (m) risultato.mandatoId = m.id; }
  const modAml = (cat) => STATE.modelliDocumento.find(m => m.attivo && m.categoria === cat);
  const mDich = modAml('AML - Dichiarazione cliente');
  const attivita = [(c.atecoCodici || []).join(', '), c.settore].filter(Boolean).join(' – ');
  const scopo = (pr ? pr.nome : '') + (prev && prev.oggetto ? ' — ' + prev.oggetto : '');
  if (mDich) { try { const d = creaPreventivoDaModello({ clienteId: cid, modelloId: mDich.id, oggetto: 'Dichiarazione del cliente ai fini antiriciclaggio', importo: null, stato: 'Bozza', note: `Rischio ${e.grado}; validità ${mesi} mesi.`, valoriCustom: { scopoPrestazione: scopo, valutazioneRischio: testoRischioAml(e), attivitaCliente: attivita } }); risultato.dichiarazioneId = d.id; } catch (err) { console.error('Dichiarazione AML non generata:', err.message); } }
  if (e.verifica === 'RAFFORZATA') {
    const mNota = modAml('AML - Nota di accettazione incarico');
    const elementi = AML_FATTORI.map(cat => { const d = v.fattori[cat.k] || {}; return (d.checks || []).map((ch, i) => ch ? '- ' + cat.k + ' ' + cat.titolo + ': ' + cat.fattori[i] : null).filter(Boolean); }).reduce((x, y) => x.concat(y), []);
    if (mNota) { try { const n = creaPreventivoDaModello({ clienteId: cid, modelloId: mNota.id, oggetto: 'Nota di accettazione incarico (adeguata verifica rafforzata)', importo: null, stato: 'Bozza', note: '', valoriCustom: { valutazioneRischio: testoRischioAml(e), elementiRischio: elementi.join('\n') || 'Nessun fattore specifico spuntato; rischio determinato dal rischio inerente della prestazione.', misureAdottate: 'Adeguata verifica rafforzata (artt. 24-25 D.Lgs. 231/2007): acquisizione di informazioni aggiuntive su titolare effettivo, origine dei fondi e scopo del rapporto; controllo costante nel corso dell\'incarico.' } }); risultato.notaId = n.id; } catch (err) { console.error('Nota di accettazione non generata:', err.message); } }
  }
  Object.assign(f.valutazione, risultato);
  salvaStato();
  AML_VAL_DRAFT = null;
  return { esito: e, risultato };
}

/* Genera (una volta sola) il mandato professionale dal preventivo accettato; null se manca il modello. */
function generaMandatoDaPreventivo(p, silenzioso) {
  if (p.mandatoGeneratoId && STATE.preventivi.some(x => x.id === p.mandatoGeneratoId)) return STATE.preventivi.find(x => x.id === p.mandatoGeneratoId);
  const modelliMandato = STATE.modelliDocumento.filter(m => m.attivo && m.categoria === 'Mandato professionale');
  if (modelliMandato.length === 0) { if (!silenzioso) toast('Nessun modello "Mandato professionale" attivo: creane uno in Modelli documenti.'); return null; }
  const modello = modelliMandato.find(m => m.predefinito) || modelliMandato[0];
  const valoriRiservati = { oggetto: p.oggetto || '', importo: p.importo != null ? fmtNum2(p.importo) : '', dataEmissione: fmtData(oggiISO()), validoFino: '' };
  const valoriCustom = Object.assign({}, p.valoriCustom || {}, { dettaglioAttivita: testoElencoAttivita(p.attivitaScelte) || (p.valoriCustom && p.valoriCustom.dettaglioAttivita) || '' });
  const corpo = risolviTemplateDocumento(modello.corpo, p.clienteId, Object.assign({}, valoriRiservati, valoriCustom));
  const mandato = aggiungiPreventivo({
    clienteId: p.clienteId, categoria: modello.categoria, modelloId: modello.id, nomeModello: modello.nome,
    oggetto: p.oggetto, importo: p.importo, dataEmissione: oggiISO(), validoFino: null, stato: 'Bozza',
    note: `Generato automaticamente dal preventivo accettato "${p.oggetto}".`, valoriCustom, corpo,
    attivitaScelte: p.attivitaScelte || [], preventivoOrigineId: p.id,
  });
  aggiornaPreventivo(p.id, { mandatoGeneratoId: mandato.id });
  return mandato;
}
function creaClientePotenziale(dati) {
  return aggiungiCliente(Object.assign({}, dati, { stato: 'potenziale' }));
}
/* Crea un preventivo/mandato risolvendo il testo dal modello — stessa logica usata dal form di
   creazione (case 'salva-preventivo' in onClickDelegato), estratta qui perché sia riusabile anche
   dal ponte comandi MCP (AZIONI_MCP.creaPreventivo, task #143): così un'IA esterna crea documenti
   identici, con le stesse regole, a quelli fatti a mano dal form. "attivitaScelte" è già lo
   snapshot {id,nome,prezzo,richiedeMandato} (il chiamante lo prepara: dal DOM nel form, dal
   catalogo per id nel bridge MCP) — qui non si tocca il catalogo, solo risolviTemplateDocumento +
   aggiungiPreventivo, per restare l'unica fonte di verità sul risultato finale. */
function creaPreventivoDaModello(dati) {
  const { clienteId, modelloId, oggetto, importo, dataEmissione, validoFino, stato, note, valoriCustom, attivitaScelte } = dati || {};
  if (!clienteId) throw new Error('clienteId obbligatorio.');
  if (!clienteById(clienteId)) throw new Error('Cliente non trovato: ' + clienteId);
  if (!oggetto) throw new Error('oggetto obbligatorio.');
  const modello = STATE.modelliDocumento.find(m => m.id === modelloId);
  if (!modello) throw new Error('Modello non trovato: ' + modelloId);
  const dataEm = dataEmissione || oggiISO();
  const valoriRiservati = { oggetto, importo: importo != null ? fmtNum2(importo) : '', dataEmissione: fmtData(dataEm), validoFino: validoFino ? fmtData(validoFino) : '' };
  const corpo = risolviTemplateDocumento(modello.corpo, clienteId, Object.assign({}, valoriRiservati, valoriCustom || {}));
  return aggiungiPreventivo({
    clienteId, categoria: modello.categoria, modelloId, nomeModello: modello.nome,
    oggetto, importo: importo != null ? importo : null, dataEmissione: dataEm, validoFino: validoFino || null,
    stato: stato || 'Bozza', note: note || '', valoriCustom: valoriCustom || {}, corpo, attivitaScelte: attivitaScelte || [],
    stile: modello.stile || undefined, pagamentoModo: (dati && dati.pagamentoModo) || undefined,
  });
}
/* -------------------- PRECOMPILAZIONE IMPORTI STATUTARI --------------------
   Alcuni importi (diritto camerale, tassa vidimazione libri sociali...) sono fissati dalla legge
   e variano in modo prevedibile in base a dati anagrafici del cliente (capitale sociale, numero di
   sedi secondarie) — non c'è motivo di ridigitarli ogni volta a mano. A differenza di un semplice
   automatismo però questi importi CAMBIANO nel tempo (decreti, aggiornamenti normativi) ed è lo
   studio a doverli tenere aggiornati: qui c'è quindi un motore di REGOLE configurabili (in
   Impostazioni), non valori fissi nel codice. Ogni regola calcola un importo suggerito, mai
   applicato in automatico senza che l'utente lo veda e possa correggerlo. */
function clonaRegoleImportiStatutariDefault() {
  // Seed di partenza, NON dati di legge verificati per l'anno corrente: solo la struttura tipica
  // (soglia di capitale sociale per la tassa vidimazione libri, maggiorazione per sede secondaria
  // sul diritto camerale) da compilare/correggere in Impostazioni con gli importi in vigore.
  return [
    { id: uid('regstat'), chiave: 'VIDIMAZIONE_LIBRI', nome: 'Tassa vidimazione libri sociali',
      importoBase: 200.00, sogliaCapitaleSociale: 516456.90, importoSopraSoglia: 309.87, importoPerSedeAggiuntiva: 0,
      nota: 'Struttura a due scaglioni in base al capitale sociale (soglia storica € 516.456,90) — verifica sempre gli importi in vigore prima di affidarti al suggerimento.' },
    { id: uid('regstat'), chiave: 'DIRITTO_CAMERALE', nome: 'Diritto camerale',
      importoBase: 0, sogliaCapitaleSociale: null, importoSopraSoglia: null, importoPerSedeAggiuntiva: 0,
      nota: 'Varia per fascia di fatturato/tipo società (delibera annuale delle Camere di Commercio): compila importoBase e l\'eventuale maggiorazione per sede secondaria con i valori correnti.' },
  ];
}
/* Calcola l'importo suggerito per una chiave adempimento e un cliente, secondo la prima regola
   configurata che corrisponde. Torna null se non c'è nessuna regola per quella chiave, o se la
   regola esiste ma non ha ancora un importoBase compilato (evita di suggerire "€0,00" come se
   fosse un valore vero). */
function calcolaImportoStatutario(chiave, cliente) {
  if (!chiave || !cliente) return null;
  const regola = (STATE.regoleImportiStatutari || []).find(r => r.chiave === chiave);
  if (!regola) return null;
  const capitale = cliente.capitaleSociale;
  let importo = (regola.sogliaCapitaleSociale != null && capitale != null && capitale > regola.sogliaCapitaleSociale)
    ? regola.importoSopraSoglia
    : regola.importoBase;
  if (importo == null || (importo === 0 && !(regola.importoPerSedeAggiuntiva > 0))) return null;
  importo += (regola.importoPerSedeAggiuntiva || 0) * (cliente.numeroSedi || 0);
  return Math.round(importo * 100) / 100;
}
function aggiungiRegolaImportoStatutario(r) {
  if (!STATE.regoleImportiStatutari) STATE.regoleImportiStatutari = [];
  STATE.regoleImportiStatutari.push(Object.assign({ id: uid('regstat') }, r));
  salvaStato();
}
function aggiornaRegolaImportoStatutario(id, patch) {
  const r = (STATE.regoleImportiStatutari || []).find(x => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
  salvaStato();
}
function eliminaRegolaImportoStatutario(id) {
  STATE.regoleImportiStatutari = (STATE.regoleImportiStatutari || []).filter(x => x.id !== id);
  salvaStato();
}

/* F24 registrati per cliente (importo, debito/credito, data, descrizione) — un registro
   leggero, non collegato al motore scadenze: serve solo a tenere traccia di cosa è stato
   versato/compensato, ispirato a create_f24 di Scadero. Un F24 può opzionalmente portare con sé
   un allegato (filePercorso/fileNome/fileDimensione) e il riferimento alla comunicazione che lo
   ha generato (comunicazioneRif) — task #105: creando una comunicazione per UN cliente con un
   F24 da pagare, l'allegato caricato viene condiviso automaticamente sia con il portale del
   cliente sia con questo registro, senza dover ricaricare due volte lo stesso file. */
const TIPI_F24 = ['Debito', 'Credito'];
// Stato di pagamento (task richiesto da Matteo, cliente reale indietro con alcuni F24): un F24
// registrato può essere ancora da pagare (mostrato al cliente nel portale) oppure già pagato/
// compensato. Le righe create PRIMA che questo campo esistesse non hanno "stato" impostato: si
// leggono sempre come 'Pagato' (statoF24 sotto) per non far comparire di colpo nel portale di ogni
// cliente un mucchio di F24 in realtà già chiusi.
const STATI_F24 = ['Da pagare', 'Pagato parzialmente', 'Pagato'];
function statoF24(f) { return f.stato || 'Pagato'; }
// Righe F24 (task Matteo: pagamento misto - un cliente può pagare un tributo e lasciarne un altro,
// o pagare parzialmente un singolo tributo). Un F24 vero ha sempre più righe/codici tributo; prima
// Prisma trattava l'intero F24 come un importo unico. Retrocompatibilità totale con i vecchi F24
// senza .righe: si legge una riga sintetica dai campi legacy (importo/stato), MAI persistita finché
// nessuno tocca davvero quell'F24 - vedi assicuraRigheF24 per quando serve scriverci sopra.
function righeF24(f) {
  if (Array.isArray(f.righe) && f.righe.length) return f.righe;
  const importo = Number(f.importo) || 0;
  return [{
    id: 'legacy', codiceTributo: f.codiceTributo || '', descrizione: f.descrizione || f.tipo || '',
    importo, importoPagato: statoF24(f) === 'Pagato' ? importo : 0,
  }];
}
// Materializza le righe (sintetiche se serve) DENTRO l'oggetto F24, cosi le funzioni che registrano
// un pagamento hanno un array vero su cui scrivere invece della vista sintetica di sola lettura
// sopra. Chiamata solo nel momento in cui un pagamento tocca davvero l'F24 (mai in lettura).
function assicuraRigheF24(f) {
  if (!Array.isArray(f.righe)) {
    f.righe = righeF24(f).map(r => Object.assign({}, r, { id: r.id === 'legacy' ? uid('f24r') : r.id }));
  }
  return f.righe;
}
// Ricalcola importo/importoPagato/stato "in cima" all'F24 dalle righe, cosi restano coerenti i
// punti del codice (KPI, dashboard, portale) che leggono ancora f.importo/statoF24(f) direttamente
// senza dover conoscere le righe - additivo, non un refactor di tutti quei punti.
function ricalcolaTotaliF24(f) {
  const righe = righeF24(f);
  const importo = righe.reduce((s, r) => s + (Number(r.importo) || 0), 0);
  const importoPagato = righe.reduce((s, r) => s + (Number(r.importoPagato) || 0), 0);
  f.importo = importo;
  f.importoPagato = importoPagato;
  f.stato = importoPagato <= 0.004 ? 'Da pagare' : (importoPagato >= importo - 0.004 ? 'Pagato' : 'Pagato parzialmente');
  return f;
}
function aggiungiF24(f) {
  const nuovo = Object.assign({ id: uid('f24'), creatoIl: oggiISO() }, f);
  ricalcolaTotaliF24(nuovo);
  STATE.f24.push(nuovo);
  salvaStato();
  return nuovo;
}
function aggiornaF24(id, patch) {
  const f = STATE.f24.find(x => x.id === id);
  if (!f) return;
  Object.assign(f, patch);
  ricalcolaTotaliF24(f);
  salvaStato();
}
// Registra un pagamento (totale o parziale) su UNA riga specifica - usato sia dalle azioni rapide
// "Segna pagato"/"Segna da pagare" nell'elenco (tutte le righe insieme) sia da un domani pagamento
// riga per riga dal portale cliente. Non lascia mai importoPagato sopra l'importo della riga.
// Segna TUTTE le righe di un F24 come pagate/da pagare in un colpo solo - le azioni rapide
// "Segna pagato"/"Segna da pagare" nell'elenco (f24-cambia-stato è stato rimosso: lo stato ora è
// SEMPRE calcolato dalle righe, non impostabile a mano).
function segnaF24TutteRighe(f24Id, pagate) {
  const f = STATE.f24.find(x => x.id === f24Id);
  if (!f) return null;
  const righe = assicuraRigheF24(f);
  righe.forEach(r => { r.importoPagato = pagate ? (Number(r.importo) || 0) : 0; });
  ricalcolaTotaliF24(f);
  salvaStato();
  return f;
}

