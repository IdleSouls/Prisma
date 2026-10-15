'use strict';
/* -------------------- BILANCI & KPI -------------------- */
/* Riclassificazione a valore aggiunto, il più diffuso schema di analisi di bilancio per PMI:
   dalle 17 voci grezze del template si ricavano i totali (attivo, passivo, EBITDA, EBIT...) e
   da questi gli indicatori di redditività/solidità/liquidità. Tutta la logica qui sotto è pura
   (nessun accesso a STATE, DOM, file) apposta per poterla testare senza bisogno di un vero file
   Excel o della libreria SheetJS — solo l'import/export file usano SheetJS/CSV, il calcolo no. */
/* Parser CSV minimale e senza dipendenze — gestisce sia "," che ";" come separatore (Excel in
   italiano esporta di default con ";") e i campi tra virgolette. Usato sia dai Bilanci sia,
   più avanti, dall'import di contabilità/prima nota. */
function parseCSV(text) {
  const testo = String(text || '').replace(/^﻿/, '');
  const righe = testo.split(/\r\n|\n|\r/).filter(r => r.trim() !== '');
  if (righe.length === 0) return [];
  const delim = (righe[0].split(';').length >= righe[0].split(',').length) ? ';' : ',';
  return righe.map(riga => {
    const campi = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < riga.length; i++) {
      const ch = riga[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delim && !inQuotes) { campi.push(cur); cur = ''; continue; }
      cur += ch;
    }
    campi.push(cur);
    return campi.map(c => c.trim());
  });
}

const CATALOGO_VOCI_BILANCIO = [
  { chiave:'immobImmateriali', label:'Immobilizzazioni immateriali' },
  { chiave:'immobMateriali', label:'Immobilizzazioni materiali' },
  { chiave:'immobFinanziarie', label:'Immobilizzazioni finanziarie' },
  { chiave:'rimanenze', label:'Rimanenze' },
  { chiave:'creditiClienti', label:'Crediti verso clienti' },
  { chiave:'liquidita', label:'Disponibilità liquide' },
  { chiave:'altreAttivita', label:'Altre attività' },
  { chiave:'patrimonioNetto', label:'Patrimonio netto' },
  { chiave:'debitiLungo', label:'Debiti a lungo termine' },
  { chiave:'debitiBreve', label:'Debiti a breve termine' },
  { chiave:'altrePassivita', label:'Altre passività' },
  { chiave:'ricavi', label:'Ricavi delle vendite' },
  { chiave:'costiEsterni', label:'Costi esterni (materie prime, servizi, godimento beni terzi)' },
  { chiave:'costoPersonale', label:'Costo del personale' },
  { chiave:'ammortamenti', label:'Ammortamenti e svalutazioni' },
  { chiave:'oneriFinanziari', label:'Oneri finanziari netti' },
  { chiave:'imposte', label:'Imposte sul reddito' },
  // Task #157 (Matteo, da PDF didattico su business plan/cash flow): campo facoltativo, serve SOLO
  // per calcolare il DSCR (copertura del servizio del debito) — quota capitale + interessi in
  // scadenza nell'esercizio sui finanziamenti. Se non compilato il DSCR resta "n/d", tutto il resto
  // degli indici funziona comunque senza questo dato.
  { chiave:'rataDebitiFinanziari', label:'Rata annua debiti finanziari (quota capitale + interessi, facoltativo per DSCR)' },
];
const GRUPPO_VOCE_BILANCIO = {
  immobImmateriali:'Attivo', immobMateriali:'Attivo', immobFinanziarie:'Attivo', rimanenze:'Attivo', creditiClienti:'Attivo', liquidita:'Attivo', altreAttivita:'Attivo',
  patrimonioNetto:'Passivo', debitiLungo:'Passivo', debitiBreve:'Passivo', altrePassivita:'Passivo',
  ricavi:'Conto economico', costiEsterni:'Conto economico', costoPersonale:'Conto economico', ammortamenti:'Conto economico', oneriFinanziari:'Conto economico', imposte:'Conto economico',
  rataDebitiFinanziari:'Dati aggiuntivi',
};
/* Riconosce una voce di una stampa "grezza" dalla contabilità (bilancio di verifica, situazione
   contabile...) e la raggruppa in una delle 17 voci semplificate sopra, per parole chiave — stessa
   logica di suggerisciCategoriaConto per la Contabilità, qui applicata al bilancio. Non decide da
   sola: il risultato è sempre mostrato a Matteo per conferma/correzione prima di essere importato
   (vedi pianificaImportBilancio + apriModalRiclassificaBilancio), non c'è mai un valore aggregato
   senza che sia stato scelto o confermato a video. L'ordine dei controlli conta: le voci più
   specifiche vanno controllate prima di quelle generiche che potrebbero fare match per sbaglio. */
function suggerisciVoceBilancioDaTesto(testo) {
  const t = normalizzaLabel(testo);
  if (!t) return null;
  if (/immobilizzazion.{0,15}immaterial|avviament|brevett|marchi|software|licenz/.test(t)) return 'immobImmateriali';
  if (/immobilizzazion.{0,15}material|impiant|macchinar|attrezzatur|fabbricat|terreni|automezz|mobili e arredi/.test(t)) return 'immobMateriali';
  if (/immobilizzazion.{0,15}finanziar|partecipazion|titoli immobilizzat/.test(t)) return 'immobFinanziarie';
  if (/rimanenz|magazzino|materie prime|prodotti finiti|semilavorat|merci c\/|merci in rimanenza/.test(t)) return 'rimanenze';
  if (/credit.{0,15}client|fatture da emettere/.test(t)) return 'creditiClienti';
  if (/disponibilit.{0,10}liquid|banca|c\/c bancari|cassa|depositi bancari|assegni/.test(t)) return 'liquidita';
  if (/patrimonio netto|capitale sociale|riserv|utile.{0,15}esercizio|perdita.{0,15}esercizio|utili portati a nuovo/.test(t)) return 'patrimonioNetto';
  if (/tfr|trattamento di fine rapporto|mutu|finanziament.{0,15}lungo|debit.{0,15}lungo/.test(t)) return 'debitiLungo';
  if (/debit.{0,15}fornitor|debit.{0,15}brev|debiti tributari|debiti previdenziali|iva a debito|erario c\/iva/.test(t)) return 'debitiBreve';
  if (/ricav.{0,15}vendit|fatturato|ricavi delle prestazioni/.test(t)) return 'ricavi';
  if (/materie prime.{0,15}consum|acquist|costi.{0,15}servizi|godimento.{0,15}beni.{0,15}terzi|utenze|affitt|canon[ie]|consulenz/.test(t)) return 'costiEsterni';
  if (/salari|stipend|costo.{0,15}personale|oneri sociali|inps.{0,15}dipendent/.test(t)) return 'costoPersonale';
  if (/ammortament|svalutazion/.test(t)) return 'ammortamenti';
  if (/interess.{0,15}passiv|oneri finanziari|commissioni bancarie/.test(t)) return 'oneriFinanziari';
  if (/^ires\b|^irap\b|imposte.{0,15}reddito|imposte correnti|imposte differite/.test(t)) return 'imposte';
  if (/credit.{0,15}divers|crediti tributari|risconti attivi|ratei attivi/.test(t)) return 'altreAttivita';
  if (/fondo rischi|risconti passivi|ratei passivi|debiti diversi/.test(t)) return 'altrePassivita';
  return null;
}

function normalizzaLabel(s) { return (s||'').toString().trim().toLowerCase().replace(/\s+/g,' '); }

function parseNumeroIt(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  let s = String(v).trim();
  if (s === '') return null;
  s = s.replace(/[€\s]/g, '');
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* Legge una tabella grezza (array di array — prima riga: "Voce" + una colonna per anno) e
   restituisce i dati riconosciuti per anno. Non riconosce una riga -> la segnala invece di
   inventare un valore, così chi importa sa cosa non è stato letto. */
/* Riconosce l'intestazione di una colonna di bilancio: un anno intero ("2026"), un mese/anno
   ISO ("2026-06"), oppure una data italiana (che indica dove chiude il periodo infra-annuale:
   "30/06/2026" o "06/2026") — tutte normalizzate nella stessa forma periodo usata da STATE.bilanci
   (vedi dataFinePeriodoBilancio/etichettaEstesaBilancio). Restituisce null se non riconosciuta. */
function parsePeriodoHeaderBilancio(cella) {
  const s = String(cella == null ? '' : cella).trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) { const a = Number(s); return (a > 1990 && a < 2100) ? s : null; }
  if (/^\d{4}-\d{2}$/.test(s)) { const [a, m] = s.split('-').map(Number); return (a > 1990 && a < 2100 && m >= 1 && m <= 12) ? s : null; }
  const mSlashYM = /^(\d{1,2})\/(\d{4})$/.exec(s); // MM/YYYY
  if (mSlashYM) { const m = Number(mSlashYM[1]), a = Number(mSlashYM[2]); return (m>=1&&m<=12&&a>1990&&a<2100) ? `${a}-${String(m).padStart(2,'0')}` : null; }
  const mSlashDMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // DD/MM/YYYY -> prendiamo solo mese/anno (granularità mensile)
  if (mSlashDMY) { const m = Number(mSlashDMY[2]), a = Number(mSlashDMY[3]); return (m>=1&&m<=12&&a>1990&&a<2100) ? `${a}-${String(m).padStart(2,'0')}` : null; }
  return null;
}
function parseRigheBilancio(righe) {
  if (!righe || righe.length < 2) return { anni: [], datiPerAnno: {}, vociNonRiconosciute: [] };
  const header = righe[0] || [];
  const periodi = [];
  for (let j = 1; j < header.length; j++) {
    const periodo = parsePeriodoHeaderBilancio(header[j]);
    if (periodo) periodi.push({ idx: j, periodo });
  }
  const datiPerAnno = {};
  periodi.forEach(p => { datiPerAnno[p.periodo] = {}; });
  const mappaLabel = {};
  CATALOGO_VOCI_BILANCIO.forEach(v => { mappaLabel[normalizzaLabel(v.label)] = v.chiave; });
  const vociNonRiconosciute = [];
  for (let i = 1; i < righe.length; i++) {
    const riga = righe[i];
    if (!riga || riga[0] === undefined || riga[0] === '') continue;
    const chiave = mappaLabel[normalizzaLabel(riga[0])];
    if (!chiave) { vociNonRiconosciute.push(riga[0]); continue; }
    periodi.forEach(p => {
      const val = parseNumeroIt(riga[p.idx]);
      if (val !== null) datiPerAnno[p.periodo][chiave] = val;
    });
  }
  return { anni: periodi.map(p => p.periodo), datiPerAnno, vociNonRiconosciute };
}

/* Catalogo degli indici di bilancio mostrati in Bilanci&KPI, raggruppati per categoria (redesign
   task #91, richiesto da Matteo: "gli indici messi tutti insieme senza distinzione non si capisce
   niente" - un .kpi-grid per categoria invece di un'unica griglia fissa da 4). Le chiavi
   corrispondono ai campi calcolati da calcolaDerivatiBilancio(). */
/* Task #118 (Matteo, dopo aver visto CloudFinance: "fai una ricerca su altri software che fanno
   questo... poi aggiungi anche la spiegazione di ogni indice... vorrei anche dei semafori... e
   anche una spiegazione su cosa fare per migliorare quell'indice"): ogni indice ora porta con sé
   spiegazione, direzione (se un valore più alto o più basso è meglio) e due soglie che definiscono
   il semaforo verde/giallo/rosso, più un consiglio pratico per chi è in giallo/rosso. Le soglie sono
   quelle generiche da manuale di analisi di bilancio per PMI italiane (non settoriali: uno studio
   può sempre valutare caso per caso, il semaforo è un punto di partenza per la conversazione col
   cliente, non un giudizio automatico) - per questo compare sempre un avviso in tal senso nella vista. */
const CATALOGO_INDICI_BILANCIO = [
  { chiave: 'roe', nome: 'ROE', categoria: 'Redditività', formato: 'pct', direzione: 'max', sogliaVerde: 0.10, sogliaGiallo: 0.05,
    spiegazione: 'Return on Equity: quanto rende il capitale che i soci hanno investito nell\'azienda (utile netto / patrimonio netto). È il primo numero che guarda chi ha messo i soldi.',
    consiglio: 'Per alzarlo: migliorare i margini (vedi ROS/EBITDA margin) o l\'efficienza operativa, oppure — con cautela e solo se la struttura finanziaria lo regge — usare più debito a leva sul capitale proprio invece di nuovi conferimenti.' },
  { chiave: 'roi', nome: 'ROI', categoria: 'Redditività', formato: 'pct', direzione: 'max', sogliaVerde: 0.08, sogliaGiallo: 0.03,
    spiegazione: 'Return on Investment: redditività del capitale investito in azienda (EBIT / totale attivo), prima degli effetti della gestione finanziaria e fiscale. Misura quanto rende l\'attività operativa a prescindere da come è finanziata.',
    consiglio: 'Per alzarlo: aumentare il margine operativo (prezzi, mix, controllo costi) oppure far "girare" meglio l\'attivo — ridurre magazzino e crediti fermi, dismettere immobilizzazioni poco produttive.' },
  { chiave: 'ros', nome: 'ROS', categoria: 'Redditività', formato: 'pct', direzione: 'max', sogliaVerde: 0.08, sogliaGiallo: 0.03,
    spiegazione: 'Return on Sales: margine operativo sulle vendite (EBIT / ricavi). Quanto resta, in percentuale, di ogni euro fatturato dopo i costi operativi.',
    consiglio: 'Per alzarlo: rivedere il listino prezzi, il mix di prodotti/servizi venduti (spingere quelli a marginalità più alta) e i costi diretti di produzione/erogazione.' },
  { chiave: 'ebitdaMargin', nome: 'EBITDA margin', categoria: 'Redditività', formato: 'pct', direzione: 'max', sogliaVerde: 0.12, sogliaGiallo: 0.06,
    spiegazione: 'Marginalità operativa lorda (EBITDA / ricavi), prima di ammortamenti, interessi e imposte — il numero più usato per confrontare aziende con strutture di costo diverse.',
    consiglio: 'Per alzarlo: agire sui costi operativi (fornitori, sprechi, produttività del personale) più che sul fatturato: è la leva più diretta su questo indice.' },
  { chiave: 'indiceIndebitamento', nome: 'Indice di indebitamento', categoria: 'Solidità', formato: 'num2', direzione: 'min', sogliaVerde: 1, sogliaGiallo: 2,
    spiegazione: 'Rapporto tra debiti totali e patrimonio netto (quante volte il debito "pesa" più del capitale proprio). Sopra 2 le banche iniziano a guardarlo con attenzione in fase di affidamento.',
    consiglio: 'Per abbassarlo: rafforzare il patrimonio netto (trattenere utili invece di distribuirli tutti, valutare conferimenti dei soci) o ridurre il debito non strettamente necessario, specie quello a breve.' },
  { chiave: 'gradoCapitalizzazione', nome: 'Grado di capitalizzazione', categoria: 'Solidità', formato: 'pct', direzione: 'max', sogliaVerde: 0.33, sogliaGiallo: 0.20,
    spiegazione: 'Quota del totale attivo finanziata con mezzi propri (patrimonio netto / totale attivo) invece che con debito. Più è alta, più l\'azienda è solida e meno dipende dalle banche.',
    consiglio: 'Per alzarlo: trattenere una quota maggiore di utili in azienda invece di distribuirli, o valutare nuovi conferimenti soci — è l\'altra faccia dell\'indice di indebitamento.' },
  { chiave: 'currentRatio', nome: 'Current ratio', categoria: 'Liquidità', formato: 'num2', direzione: 'max', sogliaVerde: 1.2, sogliaGiallo: 1.0,
    spiegazione: 'Capacità di coprire i debiti a breve termine con l\'attivo circolante (circolante / debiti a breve). Sotto 1 significa che, sulla carta, l\'azienda non avrebbe abbastanza per pagare tutto ciò che scade entro l\'anno.',
    consiglio: 'Per alzarlo: velocizzare l\'incasso crediti (solleciti, termini di pagamento più stretti), ridurre magazzino fermo, o rinegoziare parte dei debiti a breve spostandoli a medio/lungo termine.' },
  { chiave: 'incidenzaPersonale', nome: 'Incidenza costo personale', categoria: 'Efficienza', formato: 'pct', direzione: 'min', sogliaVerde: 0.30, sogliaGiallo: 0.45,
    spiegazione: 'Peso del costo del personale sui ricavi. Molto dipendente dal settore (un\'attività di servizi labour-intensive ha fisiologicamente un\'incidenza più alta di una commerciale) — va sempre letto nel contesto del cliente.',
    consiglio: 'Se è alto rispetto al settore del cliente: valutare la produttività per dipendente, l\'organizzazione dei turni/carichi di lavoro, eventuali margini di automazione — mai una lettura solo numerica, va discussa col cliente.' },
  // Task #157 (da PDF didattico su business plan/cash flow, Matteo: "usa questo file per potenziare
  // la parte di bilanci e kpi"): indici dedicati alla solidità finanziaria "dinamica" - non solo la
  // fotografia di un singolo bilancio ma la capacità di generare cassa e sostenere il debito nel
  // tempo, gli stessi numeri che guarda una banca in istruttoria di affidamento. Redesign Bilanci&KPI
  // (Matteo, ott. 2026: "dividiamo il tab in più sezioni per appartenenza, liquidità/redditività/
  // ecc."): quickRatio è liquidità a tutti gli effetti (sposato qui dalla vecchia categoria unica
  // "Solidità e liquidità"), pfnEbitda e dscr restano con indiceIndebitamento/gradoCapitalizzazione
  // sotto "Solidità" - ora sono 4 categorie pulite e mutuamente esclusive, non più 5 con una
  // "ibrida", più facili da presentare come sezioni separate del tab.
  { chiave: 'quickRatio', nome: 'Quick ratio (acid test)', categoria: 'Liquidità', formato: 'num2', direzione: 'max', sogliaVerde: 1, sogliaGiallo: 0.8,
    spiegazione: 'Come il current ratio ma senza contare le rimanenze ((circolante - rimanenze) / debiti a breve): il magazzino è l\'attivo circolante meno liquido da smobilizzare in fretta, qui è escluso per una misura più prudente della liquidità immediata.',
    consiglio: 'Per alzarlo: accelerare l\'incasso crediti o ridurre i debiti a breve — le stesse leve del current ratio, ma qui il magazzino non aiuta: se il problema è lì, va aggredito a parte (vedi rotazione/rimanenze).' },
  { chiave: 'pfnEbitda', nome: 'PFN / EBITDA', categoria: 'Solidità', formato: 'num2', direzione: 'min', sogliaVerde: 3, sogliaGiallo: 4.5,
    spiegazione: 'Posizione finanziaria netta (debiti finanziari - liquidità) rapportata all\'EBITDA: in quanti anni di EBITDA l\'azienda ripagherebbe tutto il debito residuo. È l\'indice più guardato dalle banche in fase di affidamento — n/d se l\'EBITDA non è positivo (il rapporto perderebbe di significato).',
    consiglio: 'Per abbassarlo: ridurre il debito finanziario non necessario, trattenere cassa invece di distribuirla tutta, o lavorare sulla marginalità (EBITDA) — sopra 4-5 le banche iniziano a chiedere garanzie aggiuntive o a stringere sui nuovi affidamenti.' },
  { chiave: 'dscr', nome: 'DSCR', categoria: 'Solidità', formato: 'num2', direzione: 'max', sogliaVerde: 1.2, sogliaGiallo: 1.0,
    spiegazione: 'Debt Service Coverage Ratio: quante volte il flusso di cassa operativo copre la rata annua (capitale + interessi) dei debiti finanziari. Sotto 1 la cassa generata dalla gestione non basta a pagare la rata. Serve sia il campo facoltativo "Rata annua debiti finanziari" sia almeno due periodi di bilancio caricati (per calcolare il flusso di cassa) — altrimenti resta "n/d".',
    consiglio: 'Per alzarlo: aumentare l\'EBITDA, liberare cassa dal capitale circolante (crediti/magazzino), o rinegoziare la rata (allungare la durata del finanziamento) — sotto 1 è un campanello d\'allarme da affrontare prima della prossima scadenza, non dopo.' },
  // Nuovo indice (redesign Bilanci&KPI, Matteo: "fai una ricerca e porta più grafici, più sezioni"):
  // giorni medi di incasso dei crediti (DSO, Days Sales Outstanding) - stessa formula già usata per
  // il payload del portale cliente esterno (task #178, costruisciVistaPortaleClienteEsterna), qui
  // promossa a indice vero e proprio del catalogo con soglie/semaforo, nella categoria Efficienza:
  // più giorni un cliente impiega a incassare, meno efficiente è il suo ciclo del circolante.
  { chiave: 'giorniIncassoCrediti', nome: 'Giorni medi incasso crediti (DSO)', categoria: 'Efficienza', formato: 'giorni', direzione: 'min', sogliaVerde: 60, sogliaGiallo: 90,
    spiegazione: 'Days Sales Outstanding: in media quanti giorni passano tra l\'emissione di una fattura e il suo incasso (crediti verso clienti / ricavi × 365). Più è basso, più velocemente l\'azienda trasforma le vendite in cassa vera.',
    consiglio: 'Per abbassarlo: termini di pagamento più stretti sui nuovi contratti, solleciti sistematici sui crediti scaduti, eventualmente factoring o anticipo fatture per i crediti più lenti.' },
];
// Semaforo verde/giallo/rosso per un indice, in base a direzione e soglie definite sopra. null se
// il valore non è calcolabile (dato mancante, es. debiti a breve a zero per il current ratio).
function semaforoIndice(def, valore) {
  if (valore === null || valore === undefined || isNaN(valore)) return null;
  if (def.direzione === 'max') {
    if (valore >= def.sogliaVerde) return 'verde';
    if (valore >= def.sogliaGiallo) return 'giallo';
    return 'rosso';
  }
  if (valore <= def.sogliaVerde) return 'verde';
  if (valore <= def.sogliaGiallo) return 'giallo';
  return 'rosso';
}
const SEMAFORO_INFO = {
  verde: { colore: 'var(--verde,#1a8a4c)', sfondo: 'var(--verde-bg,#e3f7ea)', etichetta: 'Nella norma' },
  giallo: { colore: 'var(--giallo,#c0790c)', sfondo: 'var(--giallo-bg,#fdf3e3)', etichetta: 'Da monitorare' },
  rosso: { colore: 'var(--rosso,#d33)', sfondo: 'var(--rosso-bg,#fdeceb)', etichetta: 'Attenzione' },
};
function calcolaDerivatiBilancio(v) {
  v = v || {};
  const g = (k) => (typeof v[k] === 'number' ? v[k] : 0);
  const totImmobilizzazioni = g('immobImmateriali') + g('immobMateriali') + g('immobFinanziarie');
  const totCircolante = g('rimanenze') + g('creditiClienti') + g('liquidita') + g('altreAttivita');
  const totAttivo = totImmobilizzazioni + totCircolante;
  const totDebiti = g('debitiLungo') + g('debitiBreve') + g('altrePassivita');
  const totPassivo = g('patrimonioNetto') + totDebiti;
  const valoreAggiunto = g('ricavi') - g('costiEsterni');
  const ebitda = valoreAggiunto - g('costoPersonale');
  const ebit = ebitda - g('ammortamenti');
  const risultatoAnteImposte = ebit - g('oneriFinanziari');
  const utileNetto = risultatoAnteImposte - g('imposte');
  const div = (n, d) => (d ? n / d : null);
  // Task #157: PFN e CCN si ricavano dagli stessi 17 dati già caricati, nessun campo nuovo.
  // PFN (posizione finanziaria netta) = debiti finanziari - liquidità: quanto debito "netto" resta
  // dopo aver usato tutta la cassa disponibile per ripagarlo. CCN (capitale circolante netto) =
  // circolante - debiti a breve: stessa differenza già usata per il current ratio, qui espressa
  // in euro invece che come rapporto.
  const pfn = g('debitiLungo') + g('debitiBreve') - g('liquidita');
  const ccn = totCircolante - g('debitiBreve');
  return Object.assign({}, v, {
    totImmobilizzazioni, totCircolante, totAttivo, totDebiti, totPassivo,
    valoreAggiunto, ebitda, ebit, risultatoAnteImposte, utileNetto, pfn, ccn,
    roe: div(utileNetto, g('patrimonioNetto')),
    roi: div(ebit, totAttivo),
    ros: div(ebit, g('ricavi')),
    ebitdaMargin: div(ebitda, g('ricavi')),
    indiceIndebitamento: div(totDebiti, g('patrimonioNetto')),
    gradoCapitalizzazione: div(g('patrimonioNetto'), totAttivo),
    currentRatio: div(totCircolante, g('debitiBreve')),
    quickRatio: div(totCircolante - g('rimanenze'), g('debitiBreve')),
    // PFN/EBITDA ha senso solo con EBITDA positivo (altrimenti il segno del rapporto inganna più
    // che informare, es. debito basso ma EBITDA negativo darebbe un rapporto negativo "buono" a leggersi).
    pfnEbitda: ebitda > 0 ? div(pfn, ebitda) : null,
    incidenzaPersonale: div(g('costoPersonale'), g('ricavi')),
    // Redesign Bilanci&KPI: DSO (giorni medi di incasso crediti), stessa formula già usata in
    // costruisciVistaPortaleClienteEsterna (task #178) - qui calcolata una volta sola dentro
    // calcolaDerivatiBilancio così la vista interna e il payload del portale restano coerenti tra
    // loro invece di avere due implementazioni separate della stessa formula.
    giorniIncassoCrediti: g('ricavi') > 0 ? (g('creditiClienti') / g('ricavi')) * 365 : null,
  });
}
/* Task #157: CFO (flusso di cassa operativo, metodo indiretto) e DSCR richiedono un confronto col
   periodo precedente (serve la variazione del CCN) - per questo sono calcolati da una funzione a
   parte invece che dentro calcolaDerivatiBilancio, che lavora su un solo periodo alla volta.
   Se non c'è un periodo precedente disponibile (primo bilancio caricato per il cliente) restituisce
   null per tutti e tre: mai un numero inventato o un confronto con un anno che non c'è. */
function calcolaDerivatiBilancioConPrecedente(v, vPrec) {
  const d = calcolaDerivatiBilancio(v);
  if (!vPrec) return Object.assign({}, d, { deltaCcn: null, cfo: null, dscr: null });
  const dPrec = calcolaDerivatiBilancio(vPrec);
  const deltaCcn = d.ccn - dPrec.ccn;
  // Metodo indiretto semplificato: utile netto + ammortamenti (costi non monetari) - variazione CCN
  // (un CCN che cresce assorbe cassa, uno che si riduce ne libera).
  const cfo = d.utileNetto + (d.ammortamenti || 0) - deltaCcn;
  const rata = typeof d.rataDebitiFinanziari === 'number' ? d.rataDebitiFinanziari : null;
  const dscr = rata ? div2(cfo, rata) : null;
  return Object.assign({}, d, { deltaCcn, cfo, dscr });
}
function div2(n, d) { return d ? n / d : null; }

function fmtEuro(n) { return (n===null||n===undefined||isNaN(n)) ? 'n/d' : n.toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}); }
function fmtPct(n) { return (n===null||n===undefined||isNaN(n)) ? 'n/d' : (n*100).toLocaleString('it-IT',{maximumFractionDigits:1}) + '%'; }
function fmtNum2(n) { return (n===null||n===undefined||isNaN(n)) ? 'n/d' : n.toLocaleString('it-IT',{maximumFractionDigits:2}); }
// Redesign Bilanci&KPI: formattatore per l'indice DSO (giorni medi incasso crediti) - stesso schema
// difensivo degli altri fmt* (mai un NaN/undefined mostrato a schermo).
function fmtGiorni(n) { return (n===null||n===undefined||isNaN(n)) ? 'n/d' : Math.round(n).toLocaleString('it-IT') + ' gg'; }

/* Un "periodo" di bilancio è una stringa: "2026" per l'anno intero (chiusura al 31/12), oppure
   "2026-06" per una situazione infra-annuale (chiusura di periodo, es. al 30/06) — stesso sistema
   di STATE.bilanci per entrambi i casi, distinti solo dall'etichetta mostrata e dalla data di
   riferimento usata per ordinarli cronologicamente insieme (un 30/06/2026 viene prima del bilancio
   2026 ma dopo quello 2025). */
function dataFinePeriodoBilancio(periodo) {
  const pStr = String(periodo);
  if (/^\d{4}$/.test(pStr)) return `${pStr}-12-31`;
  const m = /^(\d{4})-(\d{2})$/.exec(pStr);
  if (m) {
    const anno = Number(m[1]), mese = Number(m[2]);
    const ultimoGiorno = new Date(anno, mese, 0).getDate();
    return `${m[1]}-${m[2]}-${String(ultimoGiorno).padStart(2,'0')}`;
  }
  return `${pStr}-12-31`;
}
function periodoBilancioInfraAnnuale(periodo) { return /^\d{4}-\d{2}$/.test(String(periodo)); }
/* Etichetta breve (per assi dei grafici) ed etichetta estesa (per tabelle/titoli). */
function etichettaBreveBilancio(periodo) {
  if (!periodoBilancioInfraAnnuale(periodo)) return String(periodo);
  const d = dataFinePeriodoBilancio(periodo);
  const [anno, mese, giorno] = d.split('-');
  return `${giorno}/${mese}/${anno.slice(2)}`;
}
function etichettaEstesaBilancio(periodo) {
  if (!periodoBilancioInfraAnnuale(periodo)) return `${periodo} (anno intero)`;
  return `Situazione al ${fmtData(dataFinePeriodoBilancio(periodo))} (infra-annuale)`;
}
function anniBilancioCliente(clienteId) {
  return Object.keys((STATE.bilanci && STATE.bilanci[clienteId]) || {})
    .sort((a,b) => dataFinePeriodoBilancio(a).localeCompare(dataFinePeriodoBilancio(b)));
}
function salvaBilancioAnno(clienteId, anno, voci) {
  if (!STATE.bilanci) STATE.bilanci = {};
  if (!STATE.bilanci[clienteId]) STATE.bilanci[clienteId] = {};
  STATE.bilanci[clienteId][anno] = Object.assign({}, STATE.bilanci[clienteId][anno]||{}, voci, { caricatoIl: oggiISO() });
  salvaStato();
}
function eliminaBilancioAnno(clienteId, anno) {
  if (STATE.bilanci && STATE.bilanci[clienteId]) { delete STATE.bilanci[clienteId][anno]; salvaStato(); }
}

/* Piccolo grafico a barre inline in SVG — niente librerie esterne, funziona sempre. */
// Formato compatto per le etichette valore sopra/sotto le barre (es. "€ 1,2 Mln", "€ 85k") - fmtEuro
// per intero ("€ 1.234.567") sarebbe troppo lungo per stare sopra una barra stretta.
function fmtEuroCompattoGrafico(n) {
  if (n === null || n === undefined || isNaN(n)) return 'n/d';
  const abs = Math.abs(n);
  const segno = n < 0 ? '-' : '';
  if (abs >= 1000000) return segno + (abs/1000000).toLocaleString('it-IT',{maximumFractionDigits:1}) + ' Mln';
  if (abs >= 1000) return segno + Math.round(abs/1000).toLocaleString('it-IT') + 'k';
  return segno + Math.round(abs).toLocaleString('it-IT');
}
/* Redesign (Matteo: "i grafici a barre sono poveri e non dicono nulla" + bug "la barra rossa in
   negativo va sopra il testo dell'anno"). Il vecchio grafico aveva due problemi: 1) le barre
   negative crescevano verso il basso SENZA alcun limite/spazio riservato, finendo dentro (o sopra)
   la riga delle etichette anno; 2) nessun valore numerico sulle barre, solo colore e altezza
   relativa - poco leggibile senza passare il mouse. Qui: striscia etichette anno riservata e MAI
   invasa dalle barre (altezza massima delle barre calcolata apposta per lasciarle fuori), area
   positiva/negativa proporzionata ai valori reali (non simmetrica fissa, così se non ci sono mai
   stati anni negativi le barre positive usano tutto lo spazio), etichetta del valore sopra ogni
   barra positiva e sotto ogni barra negativa, linea dello zero più marcata, e un title nativo SVG
   per il valore esatto al passaggio del mouse. */
// Task #177 (Matteo: "Bilanci&KPI - più grafici, meno indici buttati lì"): formatoBarra/formatoTooltip
// opzionali, per riusare lo stesso grafico anche per gli indici percentuali/a rapporto (ROE, EBITDA
// margin, current ratio...) e non solo per i valori assoluti in euro - default invariato (fmtEuro
// compatto sulla barra, fmtEuro completo nel tooltip) per non toccare le chiamate già esistenti.
function graficoBarreSvg(punti, formatoBarra, formatoTooltip) {
  formatoBarra = formatoBarra || fmtEuroCompattoGrafico;
  formatoTooltip = formatoTooltip || fmtEuro;
  const w = 260, hTot = 118, stripLabel = 16, padTop = 6, padValLabel = 14;
  const plotH = hTot - stripLabel - padTop;
  const valori = punti.map(p => p.valore || 0);
  const posMax = Math.max(0, ...valori);
  const negMax = Math.max(0, ...valori.map(v => -v));
  let posH, negH;
  if (posMax > 0 && negMax > 0) {
    posH = Math.max(30, plotH * posMax / (posMax + negMax));
    negH = plotH - posH;
    if (negH < 30) { negH = 30; posH = plotH - negH; }
  } else if (posMax > 0) { posH = plotH; negH = 0; }
  else { posH = 0; negH = plotH; }
  const zeroY = padTop + posH;
  const nBar = punti.length || 1;
  const bw = w / nBar;
  const barre = punti.map((p, i) => {
    const val = p.valore || 0;
    const x = i*bw + bw*0.18;
    const larghezza = bw*0.64;
    const xTesto = x + larghezza/2;
    const colore = val >= 0 ? 'var(--blu-mid)' : 'var(--rosso)';
    let bh, y, yValore;
    if (val >= 0) {
      const usabile = Math.max(0, posH - padValLabel);
      bh = posMax > 0 ? Math.max(val === 0 ? 0 : 2, (val/posMax) * usabile) : 0;
      y = zeroY - bh;
      yValore = Math.max(padTop + 8, y - 4);
    } else {
      const usabile = Math.max(0, negH - padValLabel);
      bh = negMax > 0 ? Math.max(2, (Math.abs(val)/negMax) * usabile) : 0;
      y = zeroY;
      yValore = zeroY + bh + 10;
    }
    const titolo = `${escapeHtml(String(p.label))}: ${escapeHtml(formatoTooltip(val))}`;
    return `<g><title>${titolo}</title>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larghezza.toFixed(1)}" height="${bh.toFixed(1)}" style="fill:${colore}" rx="2"></rect>
      <text x="${xTesto.toFixed(1)}" y="${yValore.toFixed(1)}" font-size="8.5" font-weight="700" text-anchor="middle" style="fill:${val>=0?'var(--blu-scuro,#1d4ed8)':'var(--rosso)'}">${escapeHtml(formatoBarra(val))}</text>
      <text x="${xTesto.toFixed(1)}" y="${hTot-4}" font-size="9" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(String(p.label))}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${hTot}" width="100%" height="${hTot}">
    <line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" style="stroke:var(--border);stroke-width:1.5"></line>
    ${barre}
  </svg>`;
}

/* ==================== Redesign Bilanci&KPI (ott. 2026) ====================
   Matteo: "qui non ci capisci nulla, vedi numeri... non c'è impatto visivo... voglio molti più
   grafici, non solo a colonna... vibe quasi futuristica... l'imprenditore deve poter con una
   occhiata capire come sta andando la società anche se non ha una laurea in economia". Nuova
   libreria di mini-grafici SVG inline (stesso principio di graficoBarreSvg sopra: niente librerie
   esterne, funziona sempre offline) pensati per leggersi "a forma" prima ancora che "a numero":
   gauge a semicerchio con soglie colorate, donut di composizione, area chart con gradiente,
   radar di sintesi, cascata (waterfall) del conto economico. Tavolozza invariata (blu/verde/
   giallo/rosso già in uso in tutta l'app), solo più "densa" visivamente con gradienti/glow. */

/* Gauge a semicerchio (tipo contachilometri) per un singolo indice, con le stesse soglie verde/
   giallo/rosso di CATALOGO_INDICI_BILANCIO/semaforoIndice. Il numero formattato va scritto DENTRO
   l'SVG stesso (parametro opzioni.testoValore), non più sotto in HTML con un trucco di margine
   negativo: quel trucco (versione precedente) presumeva uno spazio vuoto sotto l'arco che in
   realtà non c'era nel viewBox, facendo sovrapporre il numero al perno della lancetta - bug
   segnalato da Matteo nell'audit grafico della vista Bilanci. Disegnare il numero come <text> SVG
   con coordinate note elimina il problema alla radice: un solo sistema di coordinate, mai due
   tecnologie (SVG + margine CSS) che devono restare d'accordo "a occhio".
   opzioni: { scalaMaxForzata, testoValore, coloreValore }. scalaMaxForzata serve per un'eventuale
   scala fissa (es. un punteggio 0-100) invece di quella auto-calcolata sulle soglie dell'indice. */
function graficoGaugeSvg(valore, def, opzioni) {
  opzioni = opzioni || {};
  const cx = 100, cy = 100, r = 78, spessore = 16;
  const sogliaAlta = Math.max(def.sogliaVerde, def.sogliaGiallo);
  const haValore = !(valore === null || valore === undefined || isNaN(valore));
  const vAssoluto = haValore ? Math.abs(valore) : 0;
  const scalaMax = opzioni.scalaMaxForzata || Math.max(sogliaAlta * 1.6, vAssoluto * 1.15, sogliaAlta + 0.0001);
  const punto = (t) => {
    const ang = Math.PI - t * Math.PI; // 180°(sinistra, min) → 0°(destra, max), sopra il semicerchio
    return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
  };
  const arco = (t0, t1) => {
    const [x0, y0] = punto(t0), [x1, y1] = punto(t1);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const tVerde = Math.min(1, def.sogliaVerde / scalaMax);
  const tGiallo = Math.min(1, def.sogliaGiallo / scalaMax);
  const bande = def.direzione === 'max'
    ? [{ t0: 0, t1: tGiallo, colore: 'var(--rosso)' }, { t0: tGiallo, t1: tVerde, colore: 'var(--giallo)' }, { t0: tVerde, t1: 1, colore: 'var(--verde)' }]
    : [{ t0: 0, t1: tVerde, colore: 'var(--verde)' }, { t0: tVerde, t1: tGiallo, colore: 'var(--giallo)' }, { t0: tGiallo, t1: 1, colore: 'var(--rosso)' }];
  const bandeSvg = bande.filter(b => b.t1 > b.t0).map(b =>
    `<path d="${arco(b.t0, b.t1)}" fill="none" stroke="${b.colore}" stroke-width="${spessore}" opacity=".85"></path>`
  ).join('');
  const tValore = haValore ? Math.max(0, Math.min(1, valore / scalaMax)) : 0;
  const angLancetta = Math.PI - tValore * Math.PI;
  const lx = cx + (r - spessore/2 - 6) * Math.cos(angLancetta);
  const ly = cy - (r - spessore/2 - 6) * Math.sin(angLancetta);
  const testoValore = opzioni.testoValore !== undefined ? opzioni.testoValore : (haValore ? String(valore) : 'n/d');
  const coloreValore = opzioni.coloreValore || 'var(--text)';
  // viewBox esteso in basso (da "0 8 200 104" a "0 8 200 150") per dare al numero uno spazio VERO
  // e misurato sotto l'arco, invece di "rubarlo" all'arco stesso con un margine negativo indovinato.
  return `<svg viewBox="0 8 200 150" width="100%" height="106">
    <path d="${arco(0,1)}" fill="none" stroke="var(--border)" stroke-width="${spessore}" opacity=".3"></path>
    ${bandeSvg}
    ${haValore ? `<line x1="${cx}" y1="${cy}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="var(--blu-scuro)" stroke-width="3" stroke-linecap="round"></line><circle cx="${cx}" cy="${cy}" r="6" fill="var(--blu-scuro)"></circle>` : ''}
    <text x="${cx}" y="140" text-anchor="middle" font-size="26" font-weight="800" style="fill:${coloreValore}">${escapeHtml(testoValore)}</text>
  </svg>`;
}

/* Donut di composizione (es. attivo circolante, fonti di finanziamento) - niente dipendenze: ogni
   fetta è un <circle> con stroke-dasharray/offset sullo stesso anello, ruotato di -90° via CSS così
   la prima fetta parte dalle "ore 12" invece che dalle 3, come ci si aspetta da un grafico a torta.
   punti: [{label, valore, colore}]. formatoValore è opzionale (default fmtEuroCompattoGrafico, per
   i tooltip in euro); per le fette fuori scala (valore<=0) non viene disegnato nulla. */
function graficoDonutSvg(punti, formatoValore) {
  formatoValore = formatoValore || fmtEuroCompattoGrafico;
  const cx = 60, cy = 60, r = 46, spessore = 18;
  const circ = 2 * Math.PI * r;
  const validi = punti.filter(p => (p.valore||0) > 0);
  const totale = validi.reduce((s,p) => s + p.valore, 0);
  let acc = 0;
  const segmenti = totale > 0 ? validi.map(p => {
    const frac = p.valore / totale;
    const len = frac * circ;
    const offset = -acc;
    acc += len;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.colore}" stroke-width="${spessore}" stroke-dasharray="${len.toFixed(1)} ${(circ-len).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"><title>${escapeHtml(String(p.label))}: ${escapeHtml(formatoValore(p.valore))} (${(frac*100).toFixed(0)}%)</title></circle>`;
  }).join('') : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${spessore}"></circle>`;
  const legenda = validi.map(p => {
    const pct = totale > 0 ? (p.valore/totale*100) : 0;
    return `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-bottom:4px;">
      <span style="width:9px;height:9px;border-radius:3px;background:${p.colore};flex:none;"></span>
      <span style="flex:1;color:var(--text-mut);">${escapeHtml(String(p.label))}</span>
      <span style="font-weight:700;">${pct.toFixed(0)}%</span>
    </div>`;
  }).join('') || `<div class="helptext">Nessun dato disponibile per il periodo.</div>`;
  return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
    <svg viewBox="0 0 120 120" width="104" height="104" style="transform:rotate(-90deg);flex:none;">${segmenti}</svg>
    <div style="flex:1;min-width:120px;">${legenda}</div>
  </div>`;
}

/* Area chart con riempimento a gradiente (stesso ingombro 260x118 di graficoBarreSvg, così stanno
   nella stessa griglia) - linea + pallini con tooltip nativo, etichetta del valore solo su primo e
   ultimo punto (il trend si legge dalla forma, non serve un numero su ogni singolo punto). */
function graficoAreaSvg(punti, formatoValore, formatoTooltip, coloreLinea) {
  formatoValore = formatoValore || fmtEuroCompattoGrafico;
  formatoTooltip = formatoTooltip || fmtEuro;
  coloreLinea = coloreLinea || 'var(--blu-mid)';
  const w = 260, hTot = 118, stripLabel = 16, padTop = 16, padBottom = 6;
  const plotH = hTot - stripLabel - padTop - padBottom;
  const valori = punti.map(p => (typeof p.valore === 'number' && !isNaN(p.valore)) ? p.valore : 0);
  const vMin = Math.min(0, ...valori);
  const vMax = Math.max(0, ...valori, vMin + 0.0001);
  const n = punti.length || 1;
  const stepX = n > 1 ? w/(n-1) : 0;
  const yFor = (v) => padTop + plotH - ((v - vMin)/(vMax - vMin)) * plotH;
  const pts = valori.map((v,i) => [n>1 ? i*stepX : w/2, yFor(v)]);
  const linea = pts.map(([x,y],i) => `${i===0?'M':'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const yZero = yFor(vMin);
  const area = `M ${pts[0][0].toFixed(1)} ${yZero.toFixed(1)} ` + pts.map(([x,y])=>`L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L ${pts[pts.length-1][0].toFixed(1)} ${yZero.toFixed(1)} Z`;
  const gid = 'areaGrad' + Math.random().toString(36).slice(2,9);
  const pallini = pts.map(([x,y],i) => `<g><title>${escapeHtml(String(punti[i].label))}: ${escapeHtml(formatoTooltip(valori[i]))}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${coloreLinea}"></circle></g>`).join('');
  const etichette = punti.map((p,i) => `<text x="${(n>1?i*stepX:w/2).toFixed(1)}" y="${hTot-4}" font-size="9" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(String(p.label))}</text>`).join('');
  const estremiIdx = Array.from(new Set([0, pts.length-1]));
  const etichetteValore = estremiIdx.map(i => `<text x="${pts[i][0].toFixed(1)}" y="${Math.max(10,(pts[i][1]-8)).toFixed(1)}" font-size="8.5" font-weight="700" text-anchor="${i===0?'start':'end'}" style="fill:var(--blu-scuro)">${escapeHtml(formatoValore(valori[i]))}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${hTot}" width="100%" height="${hTot}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${coloreLinea}" stop-opacity=".45"></stop>
      <stop offset="100%" stop-color="${coloreLinea}" stop-opacity="0"></stop>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"></path>
    <path d="${linea}" fill="none" stroke="${coloreLinea}" stroke-width="2"></path>
    ${pallini}${etichetteValore}${etichette}
  </svg>`;
}

/* Radar/spider a N assi (qui sempre 4: Liquidità/Redditività/Solidità/Efficienza) per il punteggio
   di sintesi del cruscotto - un'unica "forma" che l'imprenditore può imparare a riconoscere a
   colpo d'occhio nel tempo (più la forma è ampia e regolare, più l'azienda è in salute su tutti i
   fronti), senza dover interpretare 12 numeri diversi. assi: [{nome, punteggio}] con punteggio
   0-100 o null se non calcolabile per il periodo corrente. */
function graficoRadarSvg(assi) {
  // Fix (Matteo, audit grafico: "cose che si sovrappongono e grafici non centrati"): con cx=110 in
  // un viewBox largo solo 220, le etichette dei due assi orizzontali (testo ancorato a sinistra o a
  // destra del punto, non centrato) uscivano dal viewBox ed erano tagliate dal clipping SVG - una
  // parola come "Redditività" o "Efficienza" è più larga del margine che restava. Qui il viewBox è
  // molto più largo (350 invece di 220) apposta per lasciare spazio vero a entrambi i lati.
  const cx = 175, cy = 115, r = 55;
  const n = assi.length || 1;
  const angFor = (i) => -Math.PI/2 + i*(2*Math.PI/n);
  const puntoAnello = (i, frac) => [cx + r*frac*Math.cos(angFor(i)), cy + r*frac*Math.sin(angFor(i))];
  const anelli = [0.25,0.5,0.75,1].map(frac => {
    const pts = assi.map((_,i) => puntoAnello(i,frac).map(v=>v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"></polygon>`;
  }).join('');
  const assiSvg = assi.map((_,i) => {
    const [x,y] = puntoAnello(i,1);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.18)" stroke-width="1"></line>`;
  }).join('');
  const puntiPunteggio = assi.map((a,i) => puntoAnello(i, (a.punteggio===null||a.punteggio===undefined) ? 0 : Math.max(0,Math.min(100,a.punteggio))/100));
  const poligono = puntiPunteggio.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ');
  const gid = 'radarGrad' + Math.random().toString(36).slice(2,9);
  const coloreDot = (p) => (p===null||p===undefined) ? 'rgba(255,255,255,.5)' : p>=70 ? '#7CF2A0' : p>=45 ? '#FFD479' : '#FF9B9B';
  const puntiSvg = assi.map((a,i) => {
    const [x,y] = puntiPunteggio[i];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${coloreDot(a.punteggio)}"><title>${escapeHtml(a.nome)}: ${(a.punteggio===null||a.punteggio===undefined)?'n/d':Math.round(a.punteggio)+'/100'}</title></circle>`;
  }).join('');
  const etichette = assi.map((a,i) => {
    const [x,y] = puntoAnello(i, 1.25);
    const anchor = Math.abs(x-cx) < 4 ? 'middle' : (x > cx ? 'start' : 'end');
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11.5" font-weight="700" text-anchor="${anchor}" dominant-baseline="middle" style="fill:#fff;">${escapeHtml(a.nome)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 350 220" width="100%" height="200" style="max-width:340px;">
    <defs><radialGradient id="${gid}"><stop offset="0%" stop-color="#8ec8ff" stop-opacity=".6"></stop><stop offset="100%" stop-color="var(--blu-mid)" stop-opacity=".15"></stop></radialGradient></defs>
    ${anelli}${assiSvg}
    <polygon points="${poligono}" fill="url(#${gid})" stroke="#8ec8ff" stroke-width="2"></polygon>
    ${puntiSvg}${etichette}
  </svg>`;
}

/* Cascata (waterfall) del conto economico semplificato: dai ricavi all'utile netto, passo per
   passo, con le barre "fluttuanti" che mostrano visivamente quanto ogni voce di costo "morde" sul
   risultato - il grafico che spiega "dove sono finiti i miei ricavi" meglio di qualunque tabella,
   pensato apposta per un imprenditore senza formazione contabile. voci: [{label, valore, tipo}]
   con tipo 'totale' (barra piena da zero, es. Ricavi/EBITDA/Utile netto) o 'delta' (barra
   fluttuante che somma/sottrae dal totale corrente, es. i singoli costi, valore negativo). */
function graficoWaterfallSvg(voci) {
  const w = 460, hTot = 168, stripLabel = 34, padTop = 12;
  const plotH = hTot - stripLabel - padTop;
  let cursore = 0;
  const segmenti = voci.map(v => {
    const valore = v.valore || 0;
    let y0, y1;
    if (v.tipo === 'totale') { y0 = 0; y1 = valore; cursore = valore; }
    else { y0 = cursore; y1 = cursore + valore; cursore = y1; }
    return { label: v.label, valore, isTotale: v.tipo === 'totale', y0, y1 };
  });
  const tuttiY = segmenti.flatMap(s => [s.y0, s.y1]).concat([0]);
  const vMin = Math.min(...tuttiY), vMax = Math.max(...tuttiY, vMin + 0.0001);
  const scala = (val) => padTop + plotH - ((val - vMin)/((vMax - vMin) || 1)) * plotH;
  const zeroY = scala(0);
  const n = segmenti.length || 1;
  const bw = w / n;
  // etichetta su due righe se la voce ha più di una parola (es. "Costo del personale") - altrimenti
  // il testo esce dalla larghezza stretta di ogni barra.
  const etichettaDueRighe = (testo, xCentro, yBase) => {
    const parole = String(testo).split(' ');
    if (parole.length < 2) return `<text x="${xCentro}" y="${yBase.toFixed(1)}" font-size="7.8" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(testo)}</text>`;
    let riga1 = parole[0], i = 1;
    const metaCirca = Math.ceil(testo.length/2) + 2;
    while (i < parole.length && (riga1 + ' ' + parole[i]).length <= metaCirca) { riga1 += ' ' + parole[i]; i++; }
    const riga2 = parole.slice(i).join(' ');
    if (!riga2) return `<text x="${xCentro}" y="${yBase.toFixed(1)}" font-size="7.8" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(testo)}</text>`;
    return `<text x="${xCentro}" y="${yBase.toFixed(1)}" font-size="7.8" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(riga1)}</text><text x="${xCentro}" y="${(yBase+8).toFixed(1)}" font-size="7.8" text-anchor="middle" style="fill:var(--text-mut)">${escapeHtml(riga2)}</text>`;
  };
  const barre = segmenti.map((s,i) => {
    const x = i*bw + bw*0.12, larghezza = bw*0.76, xTesto = x + larghezza/2;
    const yAlto = scala(Math.max(s.y0,s.y1)), yBasso = scala(Math.min(s.y0,s.y1));
    const altezza = Math.max(1.5, yBasso - yAlto);
    const colore = s.isTotale ? (s.valore>=0?'var(--blu-mid)':'var(--rosso)') : (s.valore>=0?'var(--verde)':'var(--rosso)');
    const titolo = `${escapeHtml(s.label)}: ${escapeHtml(fmtEuro(s.valore))}`;
    const connettore = i < segmenti.length-1 ? `<line x1="${(x+larghezza).toFixed(1)}" y1="${yAlto.toFixed(1)}" x2="${(x+larghezza+bw*0.12).toFixed(1)}" y2="${yAlto.toFixed(1)}" stroke="var(--border)" stroke-dasharray="2,2"></line>` : '';
    return `<g><title>${titolo}</title>
      <rect x="${x.toFixed(1)}" y="${yAlto.toFixed(1)}" width="${larghezza.toFixed(1)}" height="${altezza.toFixed(1)}" fill="${colore}" rx="2"></rect>
      <text x="${xTesto.toFixed(1)}" y="${Math.max(9,yAlto-4).toFixed(1)}" font-size="8" font-weight="700" text-anchor="middle" style="fill:var(--text)">${escapeHtml(fmtEuroCompattoGrafico(s.valore))}</text>
      ${etichettaDueRighe(s.label, xTesto, hTot-22)}
      ${connettore}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${hTot}" width="100%" height="${hTot}">
    <line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" stroke="var(--border)" stroke-width="1.2"></line>
    ${barre}
  </svg>`;
}

/* Punteggio 0-100 di un singolo indice in base al suo semaforo - nessuna pretesa statistica, serve
   solo come sintesi visiva rapida per il cruscotto: i numeri veri restano nelle card sotto. */
function punteggioSemaforo(sem) {
  return sem === 'verde' ? 88 : sem === 'giallo' ? 55 : sem === 'rosso' ? 22 : null;
}
/* Punteggio medio 0-100 di una categoria (Liquidità/Redditività/Solidità/Efficienza): media dei
   punteggi dei suoi indici calcolabili per il periodo corrente; null se nessuno lo è (es. primo
   bilancio caricato, senza ancora i dati per gli indici che richiedono il periodo precedente). */
function punteggioCategoria(categoria, dati) {
  const punteggi = CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === categoria)
    .map(def => punteggioSemaforo(semaforoIndice(def, dati[def.chiave])))
    .filter(p => p !== null);
  if (punteggi.length === 0) return null;
  return punteggi.reduce((a,b) => a+b, 0) / punteggi.length;
}
function etichettaPunteggio(p) {
  if (p === null || p === undefined) return 'n/d';
  if (p >= 75) return 'Ottimo';
  if (p >= 55) return 'Buono';
  if (p >= 35) return 'Da monitorare';
  return 'Critico';
}

/* Scarica il template come vero file Excel (stessa libreria SheetJS già usata per leggere gli
   import, quindi nessuna dipendenza in più) quando è disponibile; altrimenti CSV, che funziona
   sempre anche offline — mai un errore muto, sempre un file scaricabile in un modo o nell'altro. */
function scaricaTemplateBilancio() {
  const annoBase = STATE.annoCorrente;
  // esempio con 2 anni interi + 1 colonna infra-annuale (situazione al 30/06 dell'anno corrente),
  // per mostrare subito il formato accettato senza dover spiegare a parole cosa scrivere in testata
  const colonne = [annoBase-2, annoBase-1, `30/06/${annoBase}`];
  const righe = [['Voce', ...colonne]];
  CATALOGO_VOCI_BILANCIO.forEach(v => righe.push([v.label, '', '', '']));
  if (typeof XLSX !== 'undefined') {
    try {
      const ws = XLSX.utils.aoa_to_sheet(righe);
      ws['!cols'] = [{ wch: 46 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bilancio');
      XLSX.writeFile(wb, 'template-bilancio.xlsx');
      toast('Template scaricato (Excel).');
      return;
    } catch (err) {
      console.error('Generazione template Excel non riuscita, uso il CSV come alternativa:', err);
    }
  }
  const csv = righe.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  try {
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template-bilancio.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Template scaricato (CSV — Excel non disponibile offline).');
  } catch (err) {
    console.error('Download template bilancio non riuscito', err);
    alert('Impossibile scaricare il file in questo browser.');
  }
}

/* Riga d'ingresso "diretta": nessuna riclassifica, richiede etichette già uguali (parola per
   parola) a quelle del template — usata quando Matteo ha già compilato il template ufficiale.
   Comune sia al CSV (nessuna dipendenza) sia all'Excel vero (via SheetJS, se disponibile). */
function elaboraImportBilancio(clienteId, righe) {
  const { anni, datiPerAnno, vociNonRiconosciute } = parseRigheBilancio(righe);
  if (anni.length === 0) { toast('Nessun periodo riconosciuto nell\'intestazione (anni tipo 2024, 2025... oppure una data di chiusura infra-annuale tipo 30/06/2026).'); return; }
  anni.forEach(anno => salvaBilancioAnno(clienteId, anno, datiPerAnno[anno]));
  render();
  toast(`Importati dati per ${anni.length} ${anni.length===1?'periodo':'periodi'}${vociNonRiconosciute.length ? ' (alcune righe non riconosciute, ignorate)' : ''}.`);
}

/* Pianifica l'import da una stampa "grezza" (bilancio di verifica, situazione contabile...) con
   voci più dettagliate delle 17 semplificate: per ogni riga cerca prima una corrispondenza esatta
   col template, poi un suggerimento per parole chiave (suggerisciVoceBilancioDaTesto). Non scrive
   nulla in STATE — restituisce solo il "piano" che poi Matteo conferma o corregge riga per riga
   nel modal di riclassifica, prima che qualunque numero venga davvero sommato e salvato. */
function pianificaImportBilancio(righe) {
  if (!righe || righe.length < 2) return { periodi: [], righe: [] };
  const header = righe[0] || [];
  const periodi = [];
  for (let j = 1; j < header.length; j++) {
    const periodo = parsePeriodoHeaderBilancio(header[j]);
    if (periodo) periodi.push({ idx: j, periodo });
  }
  const mappaLabel = {};
  CATALOGO_VOCI_BILANCIO.forEach(v => { mappaLabel[normalizzaLabel(v.label)] = v.chiave; });
  const righeMappa = [];
  for (let i = 1; i < righe.length; i++) {
    const riga = righe[i];
    if (!riga || riga[0] === undefined || riga[0] === '') continue;
    const testoRiga = String(riga[0]);
    const chiaveEsatta = mappaLabel[normalizzaLabel(testoRiga)];
    const chiaveSuggerita = chiaveEsatta || suggerisciVoceBilancioDaTesto(testoRiga);
    const valori = {};
    periodi.forEach(p => { const val = parseNumeroIt(riga[p.idx]); if (val !== null) valori[p.periodo] = val; });
    if (Object.keys(valori).length === 0) continue; // riga senza alcun valore numerico, niente da importare
    righeMappa.push({
      testoRiga, chiave: chiaveSuggerita || '',
      origine: chiaveEsatta ? 'esatta' : (chiaveSuggerita ? 'suggerita' : 'nessuna'),
      valori,
    });
  }
  return { periodi: periodi.map(p => p.periodo), righe: righeMappa };
}

let IMPORT_BILANCIO = null; // { clienteId, piano: { periodi, righe } }

function apriModalRiclassificaBilancio(clienteId, righeAoa) {
  const piano = pianificaImportBilancio(righeAoa);
  if (piano.periodi.length === 0) { toast('Nessun periodo riconosciuto nell\'intestazione (anni tipo 2024, 2025... oppure una data di chiusura infra-annuale tipo 30/06/2026).', true); return; }
  if (piano.righe.length === 0) { toast('Nessuna riga con valori numerici trovata nel file.', true); return; }
  IMPORT_BILANCIO = { clienteId, piano };
  const nEsatte = piano.righe.filter(r => r.origine === 'esatta').length;
  const nSuggerite = piano.righe.filter(r => r.origine === 'suggerita').length;
  const nNessuna = piano.righe.filter(r => r.origine === 'nessuna').length;
  const opzioniVoce = (selezionata) => ['Attivo','Passivo','Conto economico','Dati aggiuntivi'].map(g =>
    `<optgroup label="${g}">${CATALOGO_VOCI_BILANCIO.filter(v => GRUPPO_VOCE_BILANCIO[v.chiave] === g).map(v =>
      `<option value="${v.chiave}" ${selezionata===v.chiave?'selected':''}>${escapeHtml(v.label)}</option>`).join('')}</optgroup>`).join('');
  const badgeOrigine = { esatta: '<span class="badge attivo" style="font-size:9.5px;">Esatta</span>', suggerita: '<span class="badge info" style="font-size:9.5px;">Suggerita — verifica</span>', nessuna: '<span class="badge stato-errore" style="font-size:9.5px;">Non riconosciuta</span>' };
  const righeHtml = piano.righe.map((r, idx) => {
    const valoriTxt = piano.periodi.map(p => r.valori[p] != null ? `${etichettaBreveBilancio(p)}: ${fmtNum2(r.valori[p])}` : '').filter(Boolean).join(' · ');
    return `<tr>
      <td style="max-width:240px;">${escapeHtml(r.testoRiga)}<div class="helptext" style="margin-top:2px;">${escapeHtml(valoriTxt)}</div></td>
      <td style="white-space:nowrap;">${badgeOrigine[r.origine]}</td>
      <td><select data-ribil-voce data-idx="${idx}">
        <option value="">— Non importare —</option>
        ${opzioniVoce(r.chiave)}
      </select></td>
    </tr>`;
  }).join('');
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Verifica riclassifica bilancio</h2><div class="modal-sub">${escapeHtml(clienteById(clienteId).ragioneSociale)} — una stampa dalla contabilità ha voci più dettagliate delle ${CATALOGO_VOCI_BILANCIO.length} usate qui: controlla dove finisce ciascuna prima di importare, non viene sommato nulla senza la tua conferma.</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <div class="helptext" style="margin:8px 0;">${nEsatte} corrispondenza${nEsatte===1?'':'e'} esatta${nEsatte===1?'':'e'}, ${nSuggerite} suggerita${nSuggerite===1?'':'e'} da verificare, ${nNessuna} non riconosciuta${nNessuna===1?'':'e'} (restano su "Non importare" finché non scegli tu). Periodi: ${piano.periodi.map(p=>etichettaEstesaBilancio(p)).join(', ')}.</div>
      <div style="max-height:420px;overflow-y:auto;">
        <table class="compact"><thead><tr><th>Voce originale / valori</th><th>Corrispondenza</th><th>Voce di bilancio</th></tr></thead>
        <tbody>${righeHtml}</tbody></table>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-import-bilancio">Conferma e importa</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function importaBilancio(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const clienteId = inputEl.dataset.cliente;
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.csv')) {
    const reader = new FileReader();
    reader.onload = () => {
      try { apriModalRiclassificaBilancio(clienteId, parseCSV(reader.result)); }
      catch (err) { alert('File CSV non valido: ' + err.message); }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    if (typeof XLSX === 'undefined') { alert('Libreria di lettura Excel non disponibile (serve una connessione internet al primo caricamento della pagina). In alternativa scarica il template in CSV: funziona sempre, anche offline.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        const righe = XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: '' });
        apriModalRiclassificaBilancio(clienteId, righe);
      } catch (err) { alert('File Excel non valido: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }
}

let BILANCIO_CLIENTE = null;

function renderBilanci() {
  const attivi = clientiPacchetto().filter(c=>clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (attivi.length === 0) return `<div class="card"><div class="empty"><div class="big">Nessun cliente con il pacchetto portale avanzato</div>Attiva il pacchetto per un cliente dalla scheda Portale (interruttore "Portale avanzato"): solo quei clienti hanno bilanci, ritenute e F24.</div></div>`;
  if (!BILANCIO_CLIENTE || !attivi.find(c=>c.id===BILANCIO_CLIENTE)) BILANCIO_CLIENTE = attivi[0].id;
  const cliente = clienteById(BILANCIO_CLIENTE);
  const anni = anniBilancioCliente(cliente.id);

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cliente</label><select data-action="bilancio-seleziona-cliente">
      ${attivi.map(c=>`<option value="${c.id}" ${c.id===BILANCIO_CLIENTE?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>&nbsp;</label><button class="btn small" data-action="scarica-template-bilancio">⬇ Scarica template</button></div>
    <div class="field"><label>&nbsp;</label><label class="btn small primary" style="margin:0;">⬆ Importa file (CSV o Excel)<input type="file" accept=".csv,.xlsx,.xls" style="display:none;" data-action="importa-bilancio" data-cliente="${cliente.id}"></label></div>
  </div>`;
  const helptext = `<div class="helptext" style="margin-bottom:14px;">Scarica il template (Excel, o CSV se offline), compilalo — una colonna per periodo, valori in euro — e ricaricalo, anche più periodi insieme. In testata puoi usare un anno intero ("2026") oppure una data di chiusura per una situazione infra-annuale ("30/06/2026"). Puoi anche caricare direttamente una stampa dalla contabilità (bilancio di verifica): le voci più dettagliate vengono riclassificate in automatico nelle categorie qui sotto, sempre da confermare prima di importare.</div>`;

  if (anni.length === 0) {
    return `<div class="bilanci-dash">` + toolbar + helptext + `<div class="card"><div class="empty"><div class="big">Nessun dato di bilancio caricato per ${escapeHtml(cliente.ragioneSociale)}</div>Scarica il template, compilalo e ricaricalo per vedere KPI e grafici.</div></div></div>`;
  }

  const ultimoAnno = anni[anni.length-1];
  // Task #157: CFO/ΔCCN/DSCR hanno bisogno del periodo precedente (se c'è) - undefined per il primo
  // bilancio caricato, e calcolaDerivatiBilancioConPrecedente gestisce già quel caso restituendo null.
  const penultimoAnno = anni.length > 1 ? anni[anni.length-2] : null;
  const datiUltimo = calcolaDerivatiBilancioConPrecedente(STATE.bilanci[cliente.id][ultimoAnno], penultimoAnno ? STATE.bilanci[cliente.id][penultimoAnno] : null);
  const datiPenultimo = penultimoAnno ? calcolaDerivatiBilancio(STATE.bilanci[cliente.id][penultimoAnno]) : null;
  const FORMATTATORI_INDICE = { pct: fmtPct, num2: fmtNum2, euro: fmtEuro, giorni: fmtGiorni };
  // Task #118: card più ricca del semplice numero - semaforo colorato a sinistra, valore, e un
  // <details> con spiegazione + consiglio (chiuso di default per non affollare la vista: chi sa già
  // cosa significa un ROE non deve leggerselo ogni volta, ma è lì con un click per chi ne ha
  // bisogno, incluso durante una chiamata col cliente).
  const indiceCard = (def) => {
    const valore = datiUltimo[def.chiave];
    const fmt = FORMATTATORI_INDICE[def.formato] || fmtNum2;
    const sem = semaforoIndice(def, valore);
    const info = sem ? SEMAFORO_INFO[sem] : null;
    return `<div class="kpi indice-card" style="border-left:3px solid ${info ? info.colore : 'var(--border)'};cursor:default;padding:9px 11px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">
        <div style="font-size:10.5px;font-weight:700;color:var(--text-mut);text-transform:uppercase;letter-spacing:.02em;">${escapeHtml(def.nome)}</div>
        ${info ? `<span class="badge" style="background:${info.sfondo};color:${info.colore};font-size:10px;padding:1px 6px;">${escapeHtml(info.etichetta)}</span>` : ''}
      </div>
      <div style="font-size:17px;font-weight:800;margin:3px 0 4px;">${fmt(valore)}</div>
      <details>
        <summary style="cursor:pointer;font-size:11px;color:var(--blu-mid,#2563eb);font-weight:600;">Cosa significa e come migliorarlo</summary>
        <div class="helptext" style="margin-top:6px;"><strong>Cosa misura:</strong> ${def.spiegazione}</div>
        <div class="helptext" style="margin-top:4px;">${sem === 'verde' ? '✅ Valore nella norma: nessuna azione richiesta.' : `<strong>Come migliorarlo:</strong> ${def.consiglio}`}</div>
      </details>
    </div>`;
  };
  // Redesign Bilanci&KPI (Matteo: "dividiamo il tab in più sezioni per appartenenza, liquidità/
  // redditività/ecc... l'imprenditore deve capire a colpo d'occhio anche senza laurea in economia"):
  // mini-gauge a semicerchio per un indice del catalogo - stesso principio di indiceCard ma "a
  // forma" invece che "a numero", pensato per le testate delle 4 sezioni sotto.
  const miniGauge = (chiave) => {
    const def = CATALOGO_INDICI_BILANCIO.find(i => i.chiave === chiave);
    const valore = datiUltimo[chiave];
    const fmt = FORMATTATORI_INDICE[def.formato] || fmtNum2;
    const sem = semaforoIndice(def, valore);
    const colore = sem ? SEMAFORO_INFO[sem].colore : 'var(--text-mut)';
    return `<div class="mini-gauge-wrap">${graficoGaugeSvg(valore, def, { testoValore: fmt(valore), coloreValore: colore })}<div class="nome-gauge">${escapeHtml(def.nome)}</div></div>`;
  };
  const sezioneHeader = (icona, titolo, intro) => `<div class="sezione-header"><span class="sezione-icona">${icona}</span><span class="sezione-titolo">${escapeHtml(titolo)}</span></div>${intro ? `<div class="helptext" style="margin-bottom:12px;">${intro}</div>` : ''}`;

  // -------- Cruscotto di sintesi: punteggio 0-100 per categoria + radar + trend vs anno prima --------
  // Matteo: "vibe quasi futuristica... una occhiata e capisci come sta andando la società". Il
  // punteggio è una sintesi VISIVA dei semafori già calcolati sotto (vedi punteggioSemaforo/
  // punteggioCategoria) - non un rating bancario reale, solo un modo per "ricordarsi" l'andamento
  // generale con un'unica forma/numero invece di dover tenere a mente 12 indici diversi.
  const punteggioLiquidita = punteggioCategoria('Liquidità', datiUltimo);
  const punteggioRedditivita = punteggioCategoria('Redditività', datiUltimo);
  const punteggioSolidita = punteggioCategoria('Solidità', datiUltimo);
  const punteggioEfficienza = punteggioCategoria('Efficienza', datiUltimo);
  const punteggiValidi = [punteggioLiquidita, punteggioRedditivita, punteggioSolidita, punteggioEfficienza].filter(p => p !== null);
  const punteggioGenerale = punteggiValidi.length ? punteggiValidi.reduce((a,b)=>a+b,0)/punteggiValidi.length : null;
  const radar = graficoRadarSvg([
    { nome: 'Liquidità', punteggio: punteggioLiquidita },
    { nome: 'Redditività', punteggio: punteggioRedditivita },
    { nome: 'Solidità', punteggio: punteggioSolidita },
    { nome: 'Efficienza', punteggio: punteggioEfficienza },
  ]);
  const badgeTrend = (nome, attuale, precedente) => {
    if (precedente === null || precedente === undefined || !precedente || attuale === null || attuale === undefined) return '';
    const delta = (attuale - precedente) / Math.abs(precedente);
    const su = delta >= 0;
    return `<div class="trend-badge"><span class="nome-badge">${escapeHtml(nome)}</span><span class="${su?'freccia-su':'freccia-giu'}">${su?'▲':'▼'}</span><span>${(Math.abs(delta)*100).toFixed(1)}%</span></div>`;
  };
  const trendBadgesHtml = datiPenultimo
    ? [badgeTrend('Ricavi', datiUltimo.ricavi, datiPenultimo.ricavi), badgeTrend('EBITDA', datiUltimo.ebitda, datiPenultimo.ebitda), badgeTrend('Utile netto', datiUltimo.utileNetto, datiPenultimo.utileNetto)].join('') || `<div class="helptext" style="color:rgba(255,255,255,.65);">Dati del periodo precedente non sufficienti per un confronto.</div>`
    : `<div class="helptext" style="color:rgba(255,255,255,.65);">Primo periodo caricato: nessun confronto con l'anno prima ancora disponibile.</div>`;
  const cruscotto = `<div class="card cruscotto">
    <div class="section-title">Cruscotto di sintesi — ${escapeHtml(cliente.ragioneSociale)}</div>
    <div class="helptext">Situazione al ${escapeHtml(etichettaEstesaBilancio(ultimoAnno))}. Il punteggio e il radar sono una lettura visiva rapida dei semafori delle 4 sezioni sotto — un punto di partenza per la conversazione con il cliente, non un rating bancario.</div>
    <div class="cruscotto-grid" style="margin-top:16px;">
      <div class="punteggio-blocco">
        <div class="punteggio-num">${punteggioGenerale === null ? 'n/d' : Math.round(punteggioGenerale)}</div>
        <div class="punteggio-label">${escapeHtml(etichettaPunteggio(punteggioGenerale))}</div>
      </div>
      <div class="radar-wrap">${radar}</div>
      <div class="trend-badges">${trendBadgesHtml}</div>
    </div>
  </div>`;

  // -------- Sezione Liquidità --------
  const puntiLiquidita = anni.map(a => ({ label: etichettaBreveBilancio(a), valore: STATE.bilanci[cliente.id][a].liquidita||0 }));
  const puntiCurrentRatio = anni.map(a => ({ label: etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).currentRatio }));
  const donutCircolante = graficoDonutSvg([
    { label: 'Rimanenze', valore: datiUltimo.rimanenze||0, colore: '#06b6d4' },
    { label: 'Crediti verso clienti', valore: datiUltimo.creditiClienti||0, colore: 'var(--blu-mid)' },
    { label: 'Liquidità', valore: datiUltimo.liquidita||0, colore: 'var(--verde)' },
    { label: 'Altre attività', valore: datiUltimo.altreAttivita||0, colore: '#8b93a7' },
  ]);
  const sezioneLiquidita = `<div class="card sezione-bilancio">
    ${sezioneHeader('💧', 'Liquidità', 'La capacità di far fronte agli impegni a breve termine con quello che l\'azienda ha già in cassa o può incassare rapidamente.')}
    <div class="mini-gauge-riga">${miniGauge('currentRatio')}${miniGauge('quickRatio')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px;">
      <div><div class="donut-card-titolo">Di cosa è fatto l'attivo circolante</div>${donutCircolante}</div>
      <div><div class="donut-card-titolo">Liquidità disponibile nel tempo</div>${graficoAreaSvg(puntiLiquidita, fmtEuroCompattoGrafico, fmtEuro, 'var(--verde)')}</div>
    </div>
    <div class="donut-card-titolo" style="margin-top:16px;">Current ratio nel tempo</div>
    ${graficoBarreSvg(puntiCurrentRatio, fmtNum2, fmtNum2)}
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:14px 0 0;">
      ${CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === 'Liquidità').map(indiceCard).join('')}
    </div>
  </div>`;

  // -------- Sezione Redditività --------
  const puntiRicavi = anni.map(a => ({ label:etichettaBreveBilancio(a), valore: (STATE.bilanci[cliente.id][a].ricavi)||0 }));
  const puntiEbitda = anni.map(a => ({ label:etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).ebitda }));
  const puntiUtile = anni.map(a => ({ label:etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).utileNetto }));
  const vociWaterfall = [
    { label: 'Ricavi', valore: datiUltimo.ricavi, tipo: 'totale' },
    { label: 'Costi esterni', valore: -(datiUltimo.costiEsterni||0), tipo: 'delta' },
    { label: 'Costo del personale', valore: -(datiUltimo.costoPersonale||0), tipo: 'delta' },
    { label: 'EBITDA', valore: datiUltimo.ebitda, tipo: 'totale' },
    { label: 'Ammortamenti', valore: -(datiUltimo.ammortamenti||0), tipo: 'delta' },
    { label: 'Oneri finanziari', valore: -(datiUltimo.oneriFinanziari||0), tipo: 'delta' },
    { label: 'Imposte', valore: -(datiUltimo.imposte||0), tipo: 'delta' },
    { label: 'Utile netto', valore: datiUltimo.utileNetto, tipo: 'totale' },
  ];
  const sezioneRedditivita = `<div class="card sezione-bilancio">
    ${sezioneHeader('📈', 'Redditività', 'Quanto rende l\'attività: il margine che resta dopo i costi, e quanto frutta il capitale investito o messo dai soci.')}
    <div class="mini-gauge-riga">${miniGauge('roe')}${miniGauge('ebitdaMargin')}</div>
    <div class="donut-card-titolo" style="margin-top:16px;">Dai ricavi all'utile netto, passo per passo (${escapeHtml(etichettaEstesaBilancio(ultimoAnno))})</div>
    ${graficoWaterfallSvg(vociWaterfall)}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;">
      <div><div class="helptext" style="margin-bottom:4px;">Ricavi</div>${graficoAreaSvg(puntiRicavi, fmtEuroCompattoGrafico, fmtEuro, 'var(--blu-mid)')}</div>
      <div><div class="helptext" style="margin-bottom:4px;">EBITDA</div>${graficoAreaSvg(puntiEbitda, fmtEuroCompattoGrafico, fmtEuro, 'var(--verde)')}</div>
      <div><div class="helptext" style="margin-bottom:4px;">Utile netto</div>${graficoAreaSvg(puntiUtile, fmtEuroCompattoGrafico, fmtEuro, '#06b6d4')}</div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:14px 0 0;">
      ${CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === 'Redditività').map(indiceCard).join('')}
    </div>
  </div>`;

  // -------- Sezione Solidità --------
  const puntiPfn = anni.map(a => ({ label:etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).pfn }));
  const donutFonti = graficoDonutSvg([
    { label: 'Patrimonio netto', valore: datiUltimo.patrimonioNetto||0, colore: 'var(--verde)' },
    { label: 'Debiti a lungo termine', valore: datiUltimo.debitiLungo||0, colore: 'var(--blu-mid)' },
    { label: 'Debiti a breve termine', valore: datiUltimo.debitiBreve||0, colore: 'var(--giallo)' },
    { label: 'Altre passività', valore: datiUltimo.altrePassivita||0, colore: '#8b93a7' },
  ]);
  const sezioneSolidita = `<div class="card sezione-bilancio">
    ${sezioneHeader('🛡️', 'Solidità', 'Quanto l\'azienda dipende dalle banche e dai debiti, e quanto regge nel tempo il peso di quei debiti con la cassa che genera.')}
    <div class="mini-gauge-riga">${miniGauge('indiceIndebitamento')}${miniGauge('pfnEbitda')}${miniGauge('dscr')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px;">
      <div><div class="donut-card-titolo">Chi finanzia l'azienda</div>${donutFonti}</div>
      <div><div class="donut-card-titolo">PFN (posizione finanziaria netta) nel tempo</div>${graficoAreaSvg(puntiPfn, fmtEuroCompattoGrafico, fmtEuro, 'var(--blu-scuro)')}</div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:14px 0 0;">
      ${CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === 'Solidità').map(indiceCard).join('')}
    </div>
  </div>`;

  // -------- Sezione Efficienza --------
  const puntiDso = anni.map(a => ({ label: etichettaBreveBilancio(a), valore: calcolaDerivatiBilancio(STATE.bilanci[cliente.id][a]).giorniIncassoCrediti }));
  const sezioneEfficienza = `<div class="card sezione-bilancio">
    ${sezioneHeader('⚙️', 'Efficienza', 'Quanto bene l\'azienda "gira": il peso del personale sui ricavi e la velocità con cui trasforma le vendite in cassa vera.')}
    <div class="mini-gauge-riga">${miniGauge('incidenzaPersonale')}${miniGauge('giorniIncassoCrediti')}</div>
    <div class="donut-card-titolo" style="margin-top:16px;">Giorni medi di incasso crediti (DSO) nel tempo</div>
    ${graficoAreaSvg(puntiDso, fmtGiorni, fmtGiorni, 'var(--giallo)')}
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:14px 0 0;">
      ${CATALOGO_INDICI_BILANCIO.filter(i => i.categoria === 'Efficienza').map(indiceCard).join('')}
    </div>
  </div>`;

  const anniOrdinati = anni; // già in ordine cronologico crescente (vedi anniBilancioCliente)
  const righeTabella = anni.slice().reverse().map(anno => {
    const idx = anniOrdinati.indexOf(anno);
    const annoPrec = idx > 0 ? anniOrdinati[idx-1] : null;
    const d = calcolaDerivatiBilancioConPrecedente(STATE.bilanci[cliente.id][anno], annoPrec ? STATE.bilanci[cliente.id][annoPrec] : null);
    return `<tr>
      <td style="font-weight:700;white-space:nowrap;">${escapeHtml(etichettaEstesaBilancio(anno))}</td>
      <td>${fmtEuro(d.ricavi)}</td>
      <td>${fmtEuro(d.ebitda)}</td>
      <td>${fmtEuro(d.utileNetto)}</td>
      <td>${fmtEuro(d.totAttivo)}</td>
      <td>${fmtEuro(d.patrimonioNetto)}</td>
      <td>${fmtPct(d.roe)}</td>
      <td>${fmtPct(d.roi)}</td>
      <td>${fmtEuro(d.pfn)}</td>
      <td>${d.pfnEbitda === null ? 'n/d' : fmtNum2(d.pfnEbitda)}</td>
      <td>${fmtEuro(d.ccn)}</td>
      <td>${d.cfo === null ? 'n/d' : fmtEuro(d.cfo)}</td>
      <td>${d.dscr === null ? 'n/d' : fmtNum2(d.dscr)}</td>
      <td><button class="btn small danger" data-action="elimina-bilancio-anno" data-cliente="${cliente.id}" data-anno="${anno}">Elimina</button></td>
    </tr>`;
  }).join('');
  const tabella = `<div class="card" style="padding:0;overflow-x:auto;margin-top:16px;">
    <div class="section-title" style="padding:16px 20px 0;">Dati completi per periodo</div>
    <table class="compact"><thead><tr><th>Periodo</th><th>Ricavi</th><th>EBITDA</th><th>Utile netto</th><th>Totale attivo</th><th>Patrimonio netto</th><th>ROE</th><th>ROI</th><th>PFN</th><th>PFN/EBITDA</th><th>CCN</th><th>CFO</th><th>DSCR</th><th></th></tr></thead>
    <tbody>${righeTabella}</tbody></table>
  </div>`;
  const notaCfoDscr = `<div class="helptext" style="margin-top:6px;">CFO e DSCR compaiono da n/d finché non è caricato almeno un secondo periodo (servono a calcolare la variazione del capitale circolante); il DSCR resta n/d anche senza il campo facoltativo "Rata annua debiti finanziari" nel bilancio importato. I semafori e il punteggio di sintesi usano soglie generiche da manuale di analisi di bilancio per PMI, non tarate sul settore specifico del cliente — un punto di partenza per la conversazione, non un giudizio automatico.</div>`;

  return `<div class="bilanci-dash">` + toolbar + helptext + cruscotto + sezioneLiquidita + sezioneRedditivita + sezioneSolidita + sezioneEfficienza + tabella + notaCfoDscr + `</div>`;
}

/* -------------------- CONTABILITÀ / PRIMA NOTA — import intelligente --------------------
   Il punto di partenza: NON vogliamo che chi registra fatture o prima nota nel gestionale
   contabile "vero" debba poi rifare a mano lo stesso lavoro qui. L'unico modo sensato è
   l'import periodico di quello che è già stato registrato altrove. Tre problemi concreti da
   risolvere (segnalati esplicitamente): 1) riconoscere in automatico quali conti sono banca,
   cassa, carte, personale — impossibile dedurlo da un export generico con certezza, quindi
   "impara una volta, ricorda per sempre" con un suggerimento per parole chiave come punto di
   partenza; 2) sapere fino a che data la contabilità è aggiornata — calcolato SEMPRE dal dato
   stesso (la data più recente importata), mai chiesto a mano; 3) data emissione (fatture
   attive) e data ricezione (fatture passive) spesso non sono nell'export generico — si mappano
   se ci sono, restano vuote se non ci sono, non si inventano mai. */

const CATEGORIE_CONTO = ['Banca', 'Cassa', 'Carta di credito', 'Personale', 'Erario', 'Fornitori', 'Clienti', 'Altro'];

/* Classificazione per codice conto (mastro del piano dei conti Profis in uso in studio — verificato
   sul PdC reale, sett. 2026): quando l'export riporta il codice numerico del conto (es. "31.03.03"),
   la fascia di mastro è molto più affidabile del solo testo libero, perché la codifica è stabile.
   Copre i mastri rilevanti per banca/cassa/personale/fornitori/clienti/erario; per tutti gli altri
   mastri (immobilizzazioni, patrimonio netto, costi/ricavi non di gestione corrente, conti d'ordine
   ecc.) non propone nulla — meglio chiedere all'utente che indovinare. */
function suggerisciCategoriaContoDaCodice(codiceConto) {
  const c = (codiceConto || '').toString().trim();
  if (!c) return null;
  const mastro = parseInt(c.split('.')[0], 10);
  if (isNaN(mastro)) return null;
  if (mastro === 31) {
    const sottoconto = c.split('.').slice(0, 2).join('.');
    if (sottoconto === '31.01') return 'Banca'; // banche e posta c/c
    if (sottoconto === '31.03') return 'Cassa'; // cassa contanti (carte/PayPal si riconoscono dal testo, vedi sopra)
    return 'Banca';
  }
  if (mastro === 23) return 'Clienti'; // crediti commerciali
  if (mastro === 57) return 'Fornitori'; // debiti commerciali
  if (mastro === 59) return 'Erario'; // conti erariali (IVA, imposte)
  if (mastro === 61) return 'Personale'; // enti previdenziali (INPS, INAIL, ecc.)
  if (mastro === 63 && c.indexOf('63.07') === 0) return 'Personale'; // debiti verso il personale
  if (mastro === 81) return 'Personale'; // costi personale dipendente
  return null;
}

function suggerisciCategoriaConto(testo, codiceConto) {
  const t = normalizzaLabel(testo);
  // le carte di credito e PayPal in Profis sono sottoconti del mastro Cassa (31.03), ma per lo
  // studio sono una categoria a sé: il testo ha sempre l'ultima parola su questo caso specifico
  if (/carta|carte|visa|mastercard|paypal|nexi/.test(t)) return 'Carta di credito';
  const daCodice = suggerisciCategoriaContoDaCodice(codiceConto);
  if (daCodice) return daCodice;
  if (!t) return null;
  if (/banca|c\/c|bancari|posta/.test(t)) return 'Banca';
  if (/cassa|contant/.test(t)) return 'Cassa';
  if (/personale|dipendent|stipend|retribuz|inps|inail|tfr|paghe|enasarco/.test(t)) return 'Personale';
  if (/erario|iva|irap|ires|irpef|imposte/.test(t)) return 'Erario';
  if (/fornitor/.test(t)) return 'Fornitori';
  if (/client/.test(t)) return 'Clienti';
  return null;
}

/* Campi attesi per ciascun tipo di import, con parole chiave per il suggerimento automatico
   della colonna corrispondente — l'utente conferma/corregge solo la prima volta per ogni
   "firma" di intestazioni (tracciato), non ad ogni import. */
const CAMPI_IMPORT = {
  movimenti: [
    { chiave:'data', label:'Data movimento', obbligatorio:true, parole:['data'] },
    { chiave:'conto', label:'Conto', obbligatorio:true, parole:['conto'] },
    { chiave:'codiceConto', label:'Codice conto (facoltativo, es. piano dei conti)', obbligatorio:false, parole:['codice conto','cod.conto','cod conto','codice contabile'] },
    { chiave:'descrizione', label:'Descrizione / causale', obbligatorio:false, parole:['descrizione','causale'] },
    { chiave:'importo', label:'Importo', obbligatorio:true, parole:['importo','totale','dare','avere'] },
  ],
  fattureAttive: [
    { chiave:'numero', label:'Numero fattura', obbligatorio:false, parole:['numero','num'] },
    { chiave:'controparte', label:'Cliente', obbligatorio:false, parole:['cliente','ragione sociale','controparte'] },
    { chiave:'dataEmissione', label:'Data emissione', obbligatorio:true, parole:['emissione','data documento','data'] },
    { chiave:'imponibile', label:'Imponibile', obbligatorio:false, parole:['imponibile'] },
    { chiave:'iva', label:'IVA', obbligatorio:false, parole:['iva'] },
    { chiave:'totale', label:'Totale', obbligatorio:true, parole:['totale'] },
  ],
  fatturePassive: [
    { chiave:'numero', label:'Numero fattura', obbligatorio:false, parole:['numero','num'] },
    { chiave:'controparte', label:'Fornitore', obbligatorio:false, parole:['fornitore','ragione sociale','controparte'] },
    { chiave:'dataRicezione', label:'Data ricezione', obbligatorio:true, parole:['ricezione','arrivo','data'] },
    { chiave:'imponibile', label:'Imponibile', obbligatorio:false, parole:['imponibile'] },
    { chiave:'iva', label:'IVA', obbligatorio:false, parole:['iva'] },
    { chiave:'totale', label:'Totale', obbligatorio:true, parole:['totale'] },
  ],
};
const TIPI_IMPORT_LABEL = { movimenti:'Movimenti (banca/cassa/carte/personale)', fattureAttive:'Fatture attive (vendita)', fatturePassive:'Fatture passive (acquisto)' };

function firmaColonne(header) { return (header||[]).map(normalizzaLabel).filter(Boolean).join('|'); }

/* Per ogni campo atteso, propone la colonna del file il cui nome contiene una delle parole
   chiave. Se non trova nulla di plausibile lascia il campo vuoto — meglio chiedere che
   indovinare. */
function suggerisciMappingColonne(header, tipo) {
  const campi = CAMPI_IMPORT[tipo] || [];
  const mapping = {};
  campi.forEach(campo => {
    const trovata = (header||[]).find(h => {
      const hn = normalizzaLabel(h);
      return campo.parole.some(p => hn.includes(p));
    });
    mapping[campo.chiave] = trovata || null;
  });
  return mapping;
}

/* Applica il mapping colonna->campo alle righe grezze (array di array, riga 0 = intestazioni)
   e restituisce un array di oggetti {chiave: valoreCella}. Le righe completamente vuote sono
   scartate. Un campo mappato su "nessuna colonna" resta undefined riga per riga (mai indovinato). */
function applicaMappingRighe(righeAoa, mapping) {
  if (!righeAoa || righeAoa.length === 0) return [];
  const header = righeAoa[0] || [];
  const idx = {};
  Object.keys(mapping).forEach(chiave => {
    const nomeCol = mapping[chiave];
    idx[chiave] = nomeCol ? header.findIndex(h => normalizzaLabel(h) === normalizzaLabel(nomeCol)) : -1;
  });
  const out = [];
  for (let i = 1; i < righeAoa.length; i++) {
    const riga = righeAoa[i];
    if (!riga || riga.every(c => c === '' || c === undefined || c === null)) continue;
    const obj = {};
    Object.keys(idx).forEach(chiave => { obj[chiave] = idx[chiave] >= 0 ? riga[idx[chiave]] : undefined; });
    out.push(obj);
  }
  return out;
}

/* Trova, tra le righe di movimenti già mappate, i conti che questo cliente non ha ancora mai
   classificato — con un suggerimento automatico per parole chiave dove possibile. */
function contiDaClassificare(clienteId, righeMovimenti) {
  const mappe = (STATE.contoMappings && STATE.contoMappings[clienteId]) || {};
  const visti = new Set();
  const out = [];
  righeMovimenti.forEach(r => {
    const conto = (r.conto || '').toString().trim();
    if (!conto) return;
    const chiave = normalizzaLabel(conto);
    if (visti.has(chiave) || mappe[chiave]) return;
    visti.add(chiave);
    const codiceConto = (r.codiceConto || '').toString().trim();
    out.push({ conto, chiave, categoria: suggerisciCategoriaConto(conto, codiceConto) || '' });
  });
  return out;
}

function idMovimentoContabile(clienteId, m) {
  return `${clienteId}|${m.data}|${normalizzaLabel(m.conto)}|${m.importo}|${normalizzaLabel(m.descrizione||'')}`;
}
function idFatturaContabile(clienteId, tipo, f) {
  return `${clienteId}|${tipo}|${(f.numero||'').trim()}|${f.data}|${f.totale}`;
}

/* Salva le classificazioni conto->categoria decise dall'utente (learn-once) e poi importa i
   movimenti applicando la categoria a ciascuna riga. Dedup: una riga già presente (stesso
   cliente/data/conto/importo/descrizione) non viene duplicata se il file viene reimportato. */
function elaboraImportMovimenti(clienteId, righeMappate, classificazioni) {
  if (!STATE.contoMappings) STATE.contoMappings = {};
  if (!STATE.contoMappings[clienteId]) STATE.contoMappings[clienteId] = {};
  Object.keys(classificazioni||{}).forEach(chiave => {
    if (classificazioni[chiave]) STATE.contoMappings[clienteId][chiave] = classificazioni[chiave];
  });
  if (!STATE.movimentiContabili) STATE.movimentiContabili = {};
  if (!STATE.movimentiContabili[clienteId]) STATE.movimentiContabili[clienteId] = [];
  const esistenti = new Set(STATE.movimentiContabili[clienteId].map(m => m.id));
  let aggiunti = 0, saltati = 0, senzaData = 0;
  righeMappate.forEach(r => {
    const data = (r.data||'').toString().trim();
    const conto = (r.conto||'').toString().trim();
    const importo = parseNumeroIt(r.importo);
    if (!data || !conto || importo === null) { senzaData++; return; }
    const categoria = STATE.contoMappings[clienteId][normalizzaLabel(conto)] || 'Altro';
    const m = { data, conto, descrizione: (r.descrizione||'').toString().trim(), importo, categoria };
    m.id = idMovimentoContabile(clienteId, m);
    if (esistenti.has(m.id)) { saltati++; return; }
    esistenti.add(m.id);
    STATE.movimentiContabili[clienteId].push(m);
    aggiunti++;
  });
  salvaStato();
  return { aggiunti, saltati, senzaData };
}
function elaboraImportFatture(clienteId, tipo, righeMappate) {
  if (!STATE.fattureContabili) STATE.fattureContabili = {};
  if (!STATE.fattureContabili[clienteId]) STATE.fattureContabili[clienteId] = [];
  const esistenti = new Set(STATE.fattureContabili[clienteId].map(f => f.id));
  let aggiunti = 0, saltati = 0, senzaData = 0;
  const campoData = tipo === 'fattureAttive' ? 'dataEmissione' : 'dataRicezione';
  righeMappate.forEach(r => {
    const data = (r[campoData]||'').toString().trim();
    const totale = parseNumeroIt(r.totale);
    if (!data || totale === null) { senzaData++; return; }
    const f = {
      tipo, data, numero: (r.numero||'').toString().trim(), controparte: (r.controparte||'').toString().trim(),
      imponibile: parseNumeroIt(r.imponibile), iva: parseNumeroIt(r.iva), totale,
    };
    f.id = idFatturaContabile(clienteId, tipo, f);
    if (esistenti.has(f.id)) { saltati++; return; }
    esistenti.add(f.id);
    STATE.fattureContabili[clienteId].push(f);
    aggiunti++;
  });
  salvaStato();
  return { aggiunti, saltati, senzaData };
}

/* "Fino a quando è aggiornata la contabilità": SEMPRE calcolato dal dato più recente
   effettivamente importato, per categoria — mai un valore che qualcuno deve ricordarsi di
   aggiornare a mano. Oltre 45 giorni dall'ultimo aggiornamento -> segnalato. */
const SOGLIA_GIORNI_CONTABILITA_STALE = 45;
function statoAggiornamentoContabile(clienteId) {
  const movimenti = (STATE.movimentiContabili && STATE.movimentiContabili[clienteId]) || [];
  const fatture = (STATE.fattureContabili && STATE.fattureContabili[clienteId]) || [];
  const righe = [];
  CATEGORIE_CONTO.forEach(cat => {
    const date = movimenti.filter(m => m.categoria === cat).map(m => m.data);
    if (date.length === 0) return;
    const ultima = date.sort().slice(-1)[0];
    righe.push({ etichetta: cat, data: ultima, giorniFa: giorniTra(ultima, oggiISO()) });
  });
  ['fattureAttive','fatturePassive'].forEach(tipo => {
    const date = fatture.filter(f => f.tipo === tipo).map(f => f.data);
    if (date.length === 0) return;
    const ultima = date.sort().slice(-1)[0];
    righe.push({ etichetta: tipo === 'fattureAttive' ? 'Fatture attive' : 'Fatture passive', data: ultima, giorniFa: giorniTra(ultima, oggiISO()) });
  });
  return righe.sort((a,b) => a.etichetta.localeCompare(b.etichetta));
}

/* -------------------- CONTABILITÀ: stato desunto da documenti caricati periodicamente --------------------
   Redesign (set. 2026): l'export analitico riga-per-riga di movimenti/fatture spesso non è disponibile.
   Quello che si ha davvero, periodicamente, sono report/stampe: registro IVA unico — vendite, acquisti
   e corrispettivi insieme, come si tiene realmente in studio — (attesta fino a quando le fatture/i
   corrispettivi sono registrati), bilancio a una certa data (attesta fino a quando è aggiornata la prima
   nota), più il mastrino dei conti in questione e il bilancino paghe come controllo di coerenza. Non si
   tenta di leggere il dettaglio riga per riga di questi documenti (poco affidabile da PDF): si registra
   solo IL FATTO che un documento è stato ricevuto e a quale data si riferisce — è quella data, sempre la
   più recente per tipo, a determinare "fino a quando è aggiornata la contabilità". Mai un valore inserito
   a mano a parte. */
const TIPI_DOCUMENTO_CONTABILE = [
  { v:'registroIva', l:'Registro IVA (vendite, acquisti, corrispettivi)', categoria:'Registro IVA' },
  { v:'bilancio', l:'Bilancio', categoria:'Prima nota' },
  { v:'mastrino', l:'Mastrino conti (controllo)', categoria:null },
];
function labelTipoDocumentoContabile(v) {
  const t = TIPI_DOCUMENTO_CONTABILE.find(x => x.v === v);
  return t ? t.l : (v || '—');
}

/* -------------------- CONTABILITÀ: registro conti per cliente --------------------
   Un cliente può avere più conti da monitorare via mastrino (banca, carte, cassa, PayPal, e anche
   il conto ponte usato per le retribuzioni — vedi sotto): invece di un'unica etichetta generica,
   ogni mastrino registrato è taggato con IL conto a cui si riferisce, creato al volo la prima volta
   e riselezionato le volte successive, così la freschezza si legge per singolo conto. */
function contiCliente(clienteId) {
  if (!STATE.contiCliente) STATE.contiCliente = {};
  return STATE.contiCliente[clienteId] || [];
}
function creaContoCliente(clienteId, nome) {
  const nomePulito = (nome || '').trim();
  if (!nomePulito) return null;
  if (!STATE.contiCliente) STATE.contiCliente = {};
  if (!STATE.contiCliente[clienteId]) STATE.contiCliente[clienteId] = [];
  const esistente = STATE.contiCliente[clienteId].find(c => c.nome.toLowerCase() === nomePulito.toLowerCase());
  if (esistente) return esistente;
  const conto = { id: uid('conto'), nome: nomePulito };
  STATE.contiCliente[clienteId].push(conto);
  salvaStato();
  return conto;
}
function nomeConto(clienteId, contoId) {
  const c = contiCliente(clienteId).find(x => x.id === contoId);
  return c ? c.nome : '—';
}

function registraDocumentoContabile(clienteId, tipo, dataRiferimento, note, contoId, fileInfo) {
  if (!STATE.documentiContabili) STATE.documentiContabili = {};
  if (!STATE.documentiContabili[clienteId]) STATE.documentiContabili[clienteId] = [];
  const doc = { id: uid('doccontab'), tipo, dataRiferimento, dataCaricamento: oggiISO(), note: (note||'').trim() };
  if (tipo === 'mastrino' && contoId) doc.contoId = contoId;
  if (fileInfo && fileInfo.percorso) { doc.filePercorso = fileInfo.percorso; doc.fileNome = fileInfo.nomeFile; doc.fileDimensione = fileInfo.dimensione; }
  STATE.documentiContabili[clienteId].push(doc);
  salvaStato();
  return doc;
}
function eliminaDocumentoContabile(clienteId, docId) {
  if (!STATE.documentiContabili || !STATE.documentiContabili[clienteId]) return;
  const doc = STATE.documentiContabili[clienteId].find(d => d.id === docId);
  if (doc && doc.filePercorso) eliminaFileReale(doc.filePercorso);
  STATE.documentiContabili[clienteId] = STATE.documentiContabili[clienteId].filter(d => d.id !== docId);
  salvaStato();
}

/* Per ogni categoria (fatture attive, fatture passive, prima nota) prende il documento più recente
   del tipo corrispondente e la SUA data di riferimento. */
function statoAggiornamentoDocumenti(clienteId) {
  const docs = (STATE.documentiContabili && STATE.documentiContabili[clienteId]) || [];
  const righe = [];
  TIPI_DOCUMENTO_CONTABILE.filter(t => t.categoria).forEach(t => {
    const diQuelTipo = docs.filter(d => d.tipo === t.v && d.dataRiferimento);
    if (diQuelTipo.length === 0) return;
    const ultimo = diQuelTipo.slice().sort((a,b) => a.dataRiferimento.localeCompare(b.dataRiferimento)).slice(-1)[0];
    righe.push({ etichetta: t.categoria, data: ultimo.dataRiferimento, giorniFa: giorniTra(ultimo.dataRiferimento, oggiISO()) });
  });
  return righe.sort((a,b) => a.etichetta.localeCompare(b.etichetta));
}

/* Per ogni conto del cliente (banca, carte, cassa, PayPal, conto ponte retribuzioni...) prende il
   mastrino più recente registrato su QUEL conto e la sua data di riferimento — freschezza per
   singolo conto, non un'unica etichetta generica: un conto rimasto indietro non viene mascherato
   da uno aggiornato. */
function statoContiCliente(clienteId) {
  const docs = (STATE.documentiContabili && STATE.documentiContabili[clienteId]) || [];
  const righe = [];
  contiCliente(clienteId).forEach(conto => {
    const diQuelConto = docs.filter(d => d.tipo === 'mastrino' && d.contoId === conto.id && d.dataRiferimento);
    if (diQuelConto.length === 0) return;
    const ultimo = diQuelConto.slice().sort((a,b) => a.dataRiferimento.localeCompare(b.dataRiferimento)).slice(-1)[0];
    righe.push({ contoId: conto.id, etichetta: conto.nome, data: ultimo.dataRiferimento, giorniFa: giorniTra(ultimo.dataRiferimento, oggiISO()) });
  });
  return righe.sort((a,b) => a.etichetta.localeCompare(b.etichetta));
}

/* Controllo di coerenza: se il mastrino di un conto (banca, cassa, conto ponte retribuzioni...) è
   più aggiornato del bilancio caricato, la prima nota potrebbe non essere davvero aggiornata come
   il bilancio dichiara. Un avviso per ciascun conto indietro, non uno generico. Segnala, non blocca. */
function verificaCoerenzaContabile(clienteId) {
  const docs = (STATE.documentiContabili && STATE.documentiContabili[clienteId]) || [];
  const bilanci = docs.filter(d => d.tipo === 'bilancio' && d.dataRiferimento).sort((a,b)=>a.dataRiferimento.localeCompare(b.dataRiferimento));
  if (bilanci.length === 0) return [];
  const ultimoBilancio = bilanci.slice(-1)[0];
  const avvisi = [];
  statoContiCliente(clienteId).forEach(riga => {
    if (riga.data > ultimoBilancio.dataRiferimento) {
      avvisi.push(`Mastrino "${riga.etichetta}" più recente (${fmtData(riga.data)}) del bilancio caricato (${fmtData(ultimoBilancio.dataRiferimento)}): verifica se il bilancio è da aggiornare.`);
    }
  });
  return avvisi;
}

function apriModalDocumentoContabile(clienteId, tipoSelezionato) {
  const tipo = tipoSelezionato || TIPI_DOCUMENTO_CONTABILE[0].v;
  const conti = contiCliente(clienteId);
  const sezioneConto = tipo !== 'mastrino' ? '' : `
          <div class="field full" style="grid-column:1/-1;"><label>Conto *</label>
            <select id="dcConto" data-action="dc-conto-change">
              ${conti.map(c=>`<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
              <option value="__nuovo__">+ Nuovo conto...</option>
            </select>
          </div>
          <div class="field full" id="dcContoNuovoWrap" style="grid-column:1/-1;${conti.length?'display:none;':''}">
            <label>Nome nuovo conto *</label>
            <input id="dcContoNuovo" placeholder="es. Unicredit c/c, Carta Visa Business, Cassa contanti, Conto ponte retribuzioni...">
          </div>`;
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop">
    <div class="modal" style="max-width:480px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Registra documento contabile</h2><div class="modal-sub">${escapeHtml(clienteById(clienteId).ragioneSociale)}</div></div>
        <button class="icon-x" data-action="chiudi-modal" title="Chiudi">✕</button>
      </div>
      <form id="formDocContab" onsubmit="return false;">
        <div class="grid2">
          <div class="field full" style="grid-column:1/-1;"><label>Tipo documento *</label>
            <select id="dcTipo" data-action="dc-tipo-change" data-cliente="${clienteId}">${TIPI_DOCUMENTO_CONTABILE.map(t=>`<option value="${t.v}" ${t.v===tipo?'selected':''}>${escapeHtml(t.l)}</option>`).join('')}</select>
          </div>
          ${sezioneConto}
          <div class="field"><label>Aggiornato al (data di riferimento) *</label><input type="date" id="dcData" value="${oggiISO()}"></div>
          <div class="field full" style="grid-column:1/-1;"><label>Note (facoltative)</label><input id="dcNote" placeholder="es. inviato da Profis il..."></div>
          ${HTTP_SYNC_ATTIVO
            ? `<div class="field full" style="grid-column:1/-1;"><label>File (opzionale)</label><input type="file" id="dcFile"><div class="helptext" style="margin-top:4px;">Salvato nella cartella del cliente, sottocartella Contabilità.</div></div>`
            : `<div class="field full" style="grid-column:1/-1;"><div class="helptext">Il caricamento del file richiede il server locale (server.js) attivo — qui puoi comunque registrare i dati.</div></div>`}
        </div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="chiudi-modal">Annulla</button>
        <button class="btn primary" data-action="salva-documento-contabile" data-cliente="${clienteId}">Salva</button>
      </div>
    </div>
  </div>`;
  h('modalRoot').innerHTML = html;
}

function leggiFileTabellare(file, cb) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.csv')) {
    const reader = new FileReader();
    reader.onload = () => { try { cb(parseCSV(reader.result)); } catch (e) { cb(null, e.message); } };
    reader.onerror = () => cb(null, 'errore di lettura del file');
    reader.readAsText(file, 'UTF-8');
  } else {
    if (typeof XLSX === 'undefined') { cb(null, 'Libreria di lettura Excel non disponibile (serve una connessione internet al primo caricamento della pagina). Usa un file .csv in alternativa: funziona sempre.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        cb(XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: '' }));
      } catch (e) { cb(null, e.message); }
    };
    reader.onerror = () => cb(null, 'errore di lettura del file');
    reader.readAsArrayBuffer(file);
  }
}

/* -------------------- CONTABILITÀ: wizard di import (modal multi-step) -------------------- */
let IMPORT_WIZARD = null; // { clienteId, tipo, righeAoa, mapping, firma, righeMappate, contiNuovi, step, esito }

function apriImportContabile(clienteId) {
  IMPORT_WIZARD = { clienteId, tipo: 'movimenti', righeAoa: null, mapping: null, firma: null, righeMappate: null, contiNuovi: null, step: 'scegli', esito: null };
  renderModalImportContabile();
}
function chiudiImportContabile() {
  IMPORT_WIZARD = null;
  chiudiModal();
  render();
}

function renderModalImportContabile() {
  const w = IMPORT_WIZARD;
  if (!w) return;
  const cliente = clienteById(w.clienteId);
  let corpo = '';
  if (w.step === 'scegli') {
    corpo = `
      <div class="field full" style="grid-column:1/-1;">
        <label>Cosa stai importando?</label>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 10px;">
          ${Object.keys(TIPI_IMPORT_LABEL).map(t => `<label class="checkline nowrap"><input type="radio" name="importContabTipo" value="${t}" data-action="import-contab-tipo" ${w.tipo===t?'checked':''}> ${escapeHtml(TIPI_IMPORT_LABEL[t])}</label>`).join('')}
        </div>
      </div>
      <div class="field full" style="grid-column:1/-1;">
        <label>File (CSV o Excel)</label>
        <input type="file" accept=".csv,.xlsx,.xls" data-action="import-contab-file">
        <div class="helptext" style="margin-top:6px;">Il formato conta poco: la prima volta ti chiedo io quale colonna è cosa, e me lo ricordo per i prossimi import con lo stesso tracciato.</div>
      </div>`;
  } else if (w.step === 'mappa') {
    const campi = CAMPI_IMPORT[w.tipo];
    const header = w.righeAoa[0] || [];
    corpo = `
      <div class="helptext" style="margin-bottom:10px;">Non ho riconosciuto questo tracciato: indica a quale colonna del file corrisponde ogni campo (una volta sola — me lo ricorderò). Lascia "— non presente —" se il file non ha quel dato.</div>
      ${campi.map(c => `<div class="field"><label>${escapeHtml(c.label)}${c.obbligatorio?' *':''}</label>
        <select data-action="import-contab-mappa-campo" data-campo="${c.chiave}">
          <option value="">— non presente —</option>
          ${header.map(h => `<option value="${escapeHtml(h)}" ${w.mapping[c.chiave]===h?'selected':''}>${escapeHtml(h)}</option>`).join('')}
        </select></div>`).join('')}
      <div class="helptext" style="margin-top:8px;grid-column:1/-1;">Anteprima prima riga dati: ${escapeHtml((w.righeAoa[1]||[]).join(' · '))}</div>`;
  } else if (w.step === 'classifica') {
    corpo = `
      <div class="helptext" style="margin-bottom:10px;grid-column:1/-1;">Questi conti non li ho ancora visti per ${escapeHtml(cliente.ragioneSociale)}: dimmi a quale categoria appartengono (li riconoscerò da soli la prossima volta).</div>
      ${w.contiNuovi.map((c,i) => `<div class="field full" style="grid-column:1/-1;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-weight:600;font-size:13px;">${escapeHtml(c.conto)}</div>
        <select data-action="import-contab-classifica-conto" data-idx="${i}">
          <option value="">— scegli categoria —</option>
          ${CATEGORIE_CONTO.map(cat => `<option ${c.categoria===cat?'selected':''}>${cat}</option>`).join('')}
        </select>
      </div>`).join('')}`;
  } else if (w.step === 'anteprima') {
    const nRighe = w.righeMappate.length;
    corpo = `<div class="field full" style="grid-column:1/-1;">
      <div class="ph-card"><div class="t">${nRighe} righe pronte per l'import</div><div class="s">Tipo: ${escapeHtml(TIPI_IMPORT_LABEL[w.tipo])} · Cliente: ${escapeHtml(cliente.ragioneSociale)}</div></div>
      <div class="helptext" style="margin-top:8px;">Le righe già importate in precedenza (stesso movimento/fattura) vengono riconosciute e non duplicate.</div>
    </div>`;
  } else if (w.step === 'fatto') {
    const e = w.esito;
    corpo = `<div class="field full" style="grid-column:1/-1;">
      <div class="ph-card"><div class="t">Import completato</div><div class="s">${e.aggiunti} righe nuove aggiunte, ${e.saltati} già presenti (saltate)${e.senzaData?`, ${e.senzaData} scartate perché mancava un campo obbligatorio`:''}.</div></div>
    </div>`;
  }
  const pulsanteAvanti = (() => {
    if (w.step === 'mappa') return `<button class="btn primary" data-action="import-contab-conferma-mapping">Continua</button>`;
    if (w.step === 'classifica') return `<button class="btn primary" data-action="import-contab-conferma-classificazione">Continua</button>`;
    if (w.step === 'anteprima') return `<button class="btn primary" data-action="import-contab-conferma-import">Importa</button>`;
    if (w.step === 'fatto') return `<button class="btn primary" data-action="import-contab-chiudi">Chiudi</button>`;
    return '';
  })();
  const html = `<div class="modal-backdrop" data-action="import-contab-chiudi-backdrop">
    <div class="modal" style="max-width:600px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><h2>Importa contabilità</h2><div class="modal-sub">${escapeHtml(cliente.ragioneSociale)}</div></div>
        <button class="icon-x" data-action="import-contab-chiudi" title="Chiudi">✕</button>
      </div>
      <form id="formImportContab" onsubmit="return false;">
        <div class="grid2">${corpo}</div>
      </form>
      <div class="modal-actions">
        <button class="btn" data-action="import-contab-chiudi">Annulla</button>
        ${pulsanteAvanti}
      </div>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function gestisciFileImportContabile(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file || !IMPORT_WIZARD) return;
  leggiFileTabellare(file, (righeAoa, errore) => {
    if (errore) { alert(errore); return; }
    if (!righeAoa || righeAoa.length < 2) { toast('File vuoto o senza righe di dati.'); return; }
    IMPORT_WIZARD.righeAoa = righeAoa;
    const firma = w_tipo => `${IMPORT_WIZARD.tipo}::${firmaColonne(righeAoa[0])}`;
    IMPORT_WIZARD.firma = firma();
    const profilo = (STATE.importProfili || {})[IMPORT_WIZARD.firma];
    if (profilo) {
      IMPORT_WIZARD.mapping = profilo.mappingColonne;
      procediDopoMapping();
    } else {
      IMPORT_WIZARD.mapping = suggerisciMappingColonne(righeAoa[0], IMPORT_WIZARD.tipo);
      IMPORT_WIZARD.step = 'mappa';
      renderModalImportContabile();
    }
  });
}
function procediDopoMapping() {
  const w = IMPORT_WIZARD;
  w.righeMappate = applicaMappingRighe(w.righeAoa, w.mapping);
  if (w.tipo === 'movimenti') {
    w.contiNuovi = contiDaClassificare(w.clienteId, w.righeMappate);
    w.step = w.contiNuovi.length > 0 ? 'classifica' : 'anteprima';
  } else {
    w.step = 'anteprima';
  }
  renderModalImportContabile();
}

let CONTAB_CLIENTE = null;

function pillFreschezza(giorniFa) {
  if (giorniFa == null) return '';
  if (giorniFa > SOGLIA_GIORNI_CONTABILITA_STALE) return 'scaduto';
  if (giorniFa > SOGLIA_GIORNI_CONTABILITA_STALE / 2) return 'vicino';
  return 'lontano';
}

function renderContabilita() {
  const attivi = STATE.clienti.filter(c=>clienteAttivo(c)).sort((a,b)=>a.ragioneSociale.localeCompare(b.ragioneSociale));
  if (attivi.length === 0) return `<div class="card"><div class="empty"><div class="big">Nessun cliente attivo</div>Aggiungi un cliente per iniziare a importare la sua contabilità.</div></div>`;
  if (!CONTAB_CLIENTE || !attivi.find(c=>c.id===CONTAB_CLIENTE)) CONTAB_CLIENTE = attivi[0].id;
  const cliente = clienteById(CONTAB_CLIENTE);

  const toolbar = `<div class="toolbar">
    <div class="field grow"><label>Cliente</label><select data-action="contabilita-seleziona-cliente">
      ${attivi.map(c=>`<option value="${c.id}" ${c.id===CONTAB_CLIENTE?'selected':''}>${escapeHtml(c.ragioneSociale)}</option>`).join('')}
    </select></div>
    <div class="field"><label>&nbsp;</label><button class="btn small primary" data-action="apri-documento-contabile" data-cliente="${cliente.id}">+ Registra documento</button></div>
  </div>`;
  const helptext = `<div class="helptext" style="margin-bottom:14px;">Registra periodicamente i documenti che ricevi (registro IVA, bilancio, mastrino di un conto): non serve caricare il dettaglio riga per riga, basta dire a quale data si riferisce ciascun documento. Per i mastrini, tagga il conto a cui si riferisce (banca, carte, cassa, PayPal, conto ponte retribuzioni...) così la freschezza si legge per singolo conto. "Fino a quando è aggiornata la contabilità" è sempre calcolato dalla data del documento più recente, mai inserito a mano.</div>`;

  const statoDoc = statoAggiornamentoDocumenti(cliente.id);
  const statoConti = statoContiCliente(cliente.id);
  const docs = ((STATE.documentiContabili && STATE.documentiContabili[cliente.id]) || []).slice().sort((a,b)=>b.dataRiferimento.localeCompare(a.dataRiferimento));
  const statoCards = statoDoc.length === 0
    ? `<div class="card"><div class="empty"><div class="big">Nessun documento ancora registrato</div>Usa "Registra documento" per il primo registro IVA o bilancio ricevuto.</div></div>`
    : `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill, minmax(190px,1fr));margin-bottom:16px;">
        ${statoDoc.map(s => `<div class="kpi completati"><div class="n" style="font-size:15px;">${escapeHtml(s.data)}</div><div class="l">${escapeHtml(s.etichetta)}</div><span class="pill-delta ${pillFreschezza(s.giorniFa)}" style="position:absolute;top:12px;right:12px;">${s.giorniFa}g fa</span></div>`).join('')}
      </div>`;

  const contiCards = statoConti.length === 0 ? '' : `<div class="section-title" style="margin-bottom:6px;">Conti monitorati</div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill, minmax(190px,1fr));margin-bottom:16px;">
      ${statoConti.map(s => `<div class="kpi completati"><div class="n" style="font-size:15px;">${escapeHtml(s.data)}</div><div class="l">${escapeHtml(s.etichetta)}</div><span class="pill-delta ${pillFreschezza(s.giorniFa)}" style="position:absolute;top:12px;right:12px;">${s.giorniFa}g fa</span></div>`).join('')}
    </div>`;

  const avvisiCoerenza = verificaCoerenzaContabile(cliente.id);
  const boxAvvisi = avvisiCoerenza.length === 0 ? '' : `<div class="card" style="border-color:#f0b429;margin-bottom:16px;">
    <div class="section-title">⚠ Verifica coerenza</div>
    ${avvisiCoerenza.map(a => `<div class="helptext" style="margin-top:4px;">${escapeHtml(a)}</div>`).join('')}
  </div>`;

  const tabellaDocumenti = docs.length === 0 ? '' : `<div class="card" style="padding:0;overflow-x:auto;margin-bottom:16px;">
    <div class="section-title" style="padding:14px 16px 0;">Documenti registrati</div>
    <table class="compact"><thead><tr><th>Tipo</th><th>Aggiornato al</th><th>Registrato il</th><th>Note</th><th></th></tr></thead>
    <tbody>${docs.map(d => `<tr><td>${escapeHtml(labelTipoDocumentoContabile(d.tipo))}${d.contoId ? ' — ' + escapeHtml(nomeConto(cliente.id, d.contoId)) : ''}${d.filePercorso ? ` <a href="${linkScaricaFileReale(d.filePercorso)}" target="_blank" title="Apri il file caricato">📎</a>` : ''}</td><td>${fmtData(d.dataRiferimento)}</td><td>${fmtData(d.dataCaricamento)}</td><td>${escapeHtml(d.note||'—')}</td><td><button class="btn small danger" data-action="elimina-documento-contabile" data-cliente="${cliente.id}" data-id="${d.id}">Elimina</button></td></tr>`).join('')}</tbody></table>
  </div>`;

  const sezioneAvanzata = `<details style="margin-top:8px;">
    <summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--muted, #666);">Import dettagliato (opzionale, se disponi di un export analitico riga per riga)</summary>
    <div style="margin-top:12px;">
      <div class="toolbar">
        <div class="field"><label>&nbsp;</label><button class="btn small" data-action="apri-import-contabile" data-cliente="${cliente.id}">⬆ Importa dati (CSV o Excel)</button></div>
      </div>
      ${(() => {
        const statoImport = statoAggiornamentoContabile(cliente.id);
        if (statoImport.length === 0) return '';
        return `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill, minmax(190px,1fr));margin-bottom:16px;">
          ${statoImport.map(s => `<div class="kpi completati"><div class="n" style="font-size:15px;">${escapeHtml(s.data)}</div><div class="l">${escapeHtml(s.etichetta)}</div><span class="pill-delta ${pillFreschezza(s.giorniFa)}" style="position:absolute;top:12px;right:12px;">${s.giorniFa}g fa</span></div>`).join('')}
        </div>`;
      })()}
      ${(() => {
        const movimenti = ((STATE.movimentiContabili && STATE.movimentiContabili[cliente.id]) || []).slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,25);
        if (movimenti.length === 0) return '';
        return `<div class="card" style="padding:0;overflow-x:auto;margin-top:4px;">
          <div class="section-title" style="padding:14px 16px 0;">Ultimi movimenti importati</div>
          <table class="compact"><thead><tr><th>Data</th><th>Conto</th><th>Categoria</th><th>Descrizione</th><th style="text-align:right;">Importo</th></tr></thead>
          <tbody>${movimenti.map(m => `<tr><td>${escapeHtml(m.data)}</td><td>${escapeHtml(m.conto)}</td><td>${escapeHtml(m.categoria)}</td><td>${escapeHtml(m.descrizione||'')}</td><td style="text-align:right;">${fmtEuro(m.importo)}</td></tr>`).join('')}</tbody></table>
        </div>`;
      })()}
      ${(() => {
        const fatture = ((STATE.fattureContabili && STATE.fattureContabili[cliente.id]) || []).slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,25);
        if (fatture.length === 0) return '';
        return `<div class="card" style="padding:0;overflow-x:auto;margin-top:16px;">
          <div class="section-title" style="padding:14px 16px 0;">Ultime fatture importate</div>
          <table class="compact"><thead><tr><th>Tipo</th><th>Numero</th><th>Controparte</th><th>Data</th><th style="text-align:right;">Totale</th></tr></thead>
          <tbody>${fatture.map(f => `<tr><td>${f.tipo==='fattureAttive'?'Attiva':'Passiva'}</td><td>${escapeHtml(f.numero||'—')}</td><td>${escapeHtml(f.controparte||'—')}</td><td>${escapeHtml(f.data)}</td><td style="text-align:right;">${fmtEuro(f.totale)}</td></tr>`).join('')}</tbody></table>
        </div>`;
      })()}
    </div>
  </details>`;

  return toolbar + helptext + boxAvvisi + `<div id="contabDocStato">${statoCards}</div>` + contiCards + tabellaDocumenti + sezioneAvanzata;
}

