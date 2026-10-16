'use strict';
/* ============================================================
   GESTIONALE STUDIO — file unico, offline, localStorage
   Sezioni:
   1) ENGINE (catalogo + generazione scadenze) — porta dello script Apps Script + La Tavola
   2) STATE (persistenza)
   3) UTILS
   4) RENDER (dashboard, clienti, scadenze, ritenute, annuali, onboarding, calendario, impostazioni)
   5) EVENTI + INIT
   ============================================================ */

/* -------------------- 1) ENGINE -------------------- */
const MESI_IT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const MESI_COMPLETI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI_IT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

/* "Cliente non può pagare": il cliente ha già detto/si sa che non riuscirà a versare l'importo (es.
   società in ritardo con più versamenti IVA). Resta una scadenza APERTA (va ancora gestita, es. con
   ravvedimento), ma con uno stato visibilmente diverso da "Da fare". */
const STATO_NON_PUO_PAGARE = 'Versamento in ritardo';
const STATO_NON_PUO_PAGARE_LEGACY = 'Cliente non può pagare'; // vecchio nome, migrato all'apertura (migraStatoVersamentoRitardo)
const STATI_SCADENZA = ['Da fare', 'Calcolato', 'Inviato telematicamente', 'Comunicato al cliente', 'Errore', STATO_NON_PUO_PAGARE, 'Non applicabile'];
/* Importi nelle scadenze: formato italiano (1.234,56) in visualizzazione, numero in memoria. */
function formatImportoIT(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '';
  // useGrouping:'always': l'italiano di default non mette il punto sulle migliaia a 4 cifre (1234 → "1234")
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
}
function parseImportoIT(testo) {
  let t = String(testo == null ? '' : testo).replace(/[€\s]/g, '');
  if (t === '') return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // 1.234 → 1234 (punto = migliaia)
  const n = Number(t);
  return isNaN(n) ? NaN : Math.round(n * 100) / 100;
}
/* 'Versamento in ritardo': il lavoro dello studio e finito (F24 predisposto), il cliente non ha ancora versato: la scadenza conta come completata e resta l'F24 'Da pagare' come promemoria. */
const STATI_SCADENZA_DEFINITIVI = ['Inviato telematicamente', 'Comunicato al cliente', 'Versamento in ritardo'];
const STATI_SCADENZA_CHIUSI = [...STATI_SCADENZA_DEFINITIVI, 'Non applicabile'];
const STATI_RITENUTA = ['In attesa di pagamento', 'Da pagare', 'Pagata', 'Inviata', 'Non pagata'];

/* Scadenze periodiche: niente sotto-passaggi, ma un solo "avanzamento" scelto da una lista breve di
   FASI specifica per ogni adempimento (richiesta Matteo, ottobre 2026): per le fatture estere
   "Registrate → Inviate", per l'IVA "Calcolata → F24 inviato al cliente → Addebitato dallo studio",
   e così via. L'ultima fase è quella che chiude la scadenza. I sotto-adempimenti con responsabile e
   data restano solo sugli adempimenti ANNUALI, dove hanno senso.
   Ogni voce del catalogo periodico ha inoltre "conImporto": per molte scadenze (fatture estere,
   LIPE, Intrastat) l'importo non interessa e il campo non compare.
   Per restare compatibile con tutta la logica esistente (chiuso/aperto, classifica, calendario,
   portale), la scadenza conserva anche il vecchio "stato" generico, derivato dalla fase:
   nessuna fase = 'Da fare', fase intermedia = 'Calcolato', ultima fase = 'Comunicato al cliente'. */
const FASI_F24 = ['Calcolata', 'F24 inviato al cliente', 'Addebitato dallo studio'];
const FASI_COMUNICAZIONE = ['Predisposta', 'Inviata'];
const FASI_DEFAULT_CUSTOM = ['Eseguita'];
const STATO_DA_FASE_INTERMEDIA = 'Calcolato';
const STATO_DA_FASE_FINALE = 'Comunicato al cliente';
/* Fasi che chiudono la scadenza anche se non sono l'ultima: per l'F24 "inviato al cliente" il lavoro dello studio e finito
   (l'eventuale addebito successivo resta selezionabile ma la scadenza conta gia come completata). */
const FASI_CHE_CHIUDONO = ['F24 inviato al cliente'];
/* Informazioni di fase per una scadenza periodica generata: { conImporto, fasi } */
function infoFasiPeriodico(def) {
  const seed = def && DEFAULT_CATALOGO_PERIODICO.find(d => d.id === def.id);
  const fasi = (def && Array.isArray(def.fasi) && def.fasi.length) ? def.fasi : ((seed && seed.fasi) || FASI_DEFAULT_CUSTOM);
  const conImporto = (def && def.conImporto !== undefined) ? !!def.conImporto : (seed && seed.conImporto !== undefined ? !!seed.conImporto : true);
  return { conImporto, fasi };
}
const INFO_FASI_SINTETIZZATE = { conImporto: true, fasi: FASI_F24 };
/* Applica a una scadenza periodica appena generata le fasi del suo tipo e la fase corrente. Una
   scadenza salvata prima di questa modifica non ha "fase": la si ricava dallo stato (chiusa =
   ultima fase; 'Calcolato' = prima fase se ce n'è più d'una). */
function applicaFasiScadenza(item, salvato, info) {
  item.conImporto = info.conImporto;
  item.fasi = info.fasi.slice();
  let fase = salvato && salvato.fase;
  if (!fase || !item.fasi.includes(fase)) {
    fase = null;
    /* 'Versamento in ritardo' è uno stato a sé (ha il suo alert e il suo F24): NON va tradotto nell'ultima fase, altrimenti
       l'etichetta resterebbe "Addebitato dallo studio" invece di mostrare il ritardo. */
    if (item.stato === STATO_NON_PUO_PAGARE) fase = null;
    else if (STATI_SCADENZA_DEFINITIVI.includes(item.stato)) fase = item.fasi[item.fasi.length - 1];
    else if (item.stato === 'Calcolato' && item.fasi.length > 1) fase = item.fasi[0];
  }
  item.fase = fase;
  // Scadenze salvate prima di questa regola: fase che chiude ma stato ancora "Calcolato" -> si allinea (conta come completata).
  if (fase && FASI_CHE_CHIUDONO.includes(fase) && !STATI_SCADENZA_DEFINITIVI.includes(item.stato) && item.stato !== 'Non applicabile') item.stato = STATO_DA_FASE_FINALE;
  return item;
}
/* Etichetta da mostrare al posto dello stato generico: la fase se c'è, altrimenti lo stato. */
function etichettaStatoScadenza(s) { return (s && s.fase) || (s && s.stato) || ''; }
/* Traduce la scelta fatta in un menu di avanzamento in { stato, fase } da salvare. */
function patchDaScelta(valore, fasi) {
  const idx = (fasi || []).indexOf(valore);
  if (idx >= 0) return { fase: valore, stato: (idx === fasi.length - 1 || FASI_CHE_CHIUDONO.includes(valore)) ? STATO_DA_FASE_FINALE : STATO_DA_FASE_INTERMEDIA };
  return { fase: null, stato: valore };
}
/* Opzioni del menu di avanzamento di una scadenza: Da fare, le sue fasi, poi Errore / Non applicabile. */
function opzioniAvanzamento(s) {
  return ['Da fare'].concat(s.fasi || [], ['Errore', STATO_NON_PUO_PAGARE, 'Non applicabile']);
}

const SOGLIA_CUMULO_RITENUTE = 100;

/* Le scadenze di versamento imposte sui redditi (saldo/I acconto), diritto camerale e INPS
   Artigiani/Commercianti "eccedente" sono legate per legge allo stesso termine (art. 17 DPR
   435/2001) — quando il termine "ordinario" slitta per decreto (proroga ISA/forfettari), slitta
   automaticamente anche per queste voci. Verificato a settembre 2026: proroga al 20/07 per i
   soggetti ISA/forfettari (DL 22/05/2026 n. 89), maggiorazioni 0,4%/0,8% raddoppiate rispetto al
   passato. Un'unica lista di scelte, selezionabile per singolo cliente, copre tutte e tre le voci. */
const SCELTE_VERSAMENTO_IMPOSTE = [
  '30/06 (ordinaria — non ISA)',
  '20/07 (proroga ISA/forfettari)',
  '30/07 (non ISA, con magg. 0,4%)',
  '20/08 (ISA/forfettari, con magg. 0,8%)',
];
const DATA_PER_SCELTA_VERSAMENTO = {
  [SCELTE_VERSAMENTO_IMPOSTE[0]]: { m: 6, g: 30 },
  [SCELTE_VERSAMENTO_IMPOSTE[1]]: { m: 7, g: 20 },
  [SCELTE_VERSAMENTO_IMPOSTE[2]]: { m: 7, g: 30 },
  [SCELTE_VERSAMENTO_IMPOSTE[3]]: { m: 8, g: 20 },
};
// alias mantenuto per compatibilità con anagrafiche già salvate che usano dirittoCameraleScelta
const SCELTE_DIRITTO_CAMERALE = SCELTE_VERSAMENTO_IMPOSTE;
const DATA_PER_SCELTA_DC = {
  [SCELTE_DIRITTO_CAMERALE[0]]: { m: 6, g: 30, nota: 'Diritto annuale Camera di Commercio — scadenza ordinaria' },
  [SCELTE_DIRITTO_CAMERALE[1]]: { m: 7, g: 20, nota: 'Diritto annuale Camera di Commercio — proroga ISA/forfettari' },
  [SCELTE_DIRITTO_CAMERALE[2]]: { m: 7, g: 30, nota: 'Diritto annuale Camera di Commercio — con maggiorazione 0,4%' },
  [SCELTE_DIRITTO_CAMERALE[3]]: { m: 8, g: 20, nota: 'Diritto annuale Camera di Commercio — con maggiorazione 0,8% (ISA/forfettari)' },
};

const REGIMI_FISCALI = ['Ordinario','Semplificato','Forfettario','Minimi','Ente non commerciale','Forfettario L.398/91','Altro'];
const TIPI_CLIENTE = [
  {v:'persona_fisica', l:'Persona fisica / professionista'},
  {v:'ditta_individuale', l:'Ditta individuale'},
  {v:'societa_persone', l:'Società di persone (SNC, SAS, studio associato)'},
  {v:'societa_capitali', l:'Società di capitali (SRL, SRLS, SPA, SAPA)'},
  {v:'cooperativa', l:'Cooperativa'},
  {v:'associazione', l:'Associazione'},
  {v:'impresa_sociale', l:'Impresa sociale'},
  {v:'altra_forma', l:'Altra forma societaria/ente'},
];
/* Un utente con dati salvati PRIMA di questa distinzione ha clienti con tipo:'società' (il vecchio
   valore unico che raggruppava SRL/SPA/SNC/SAS insieme). Non possiamo sapere automaticamente se
   fosse una società di capitali o di persone, quindi migriamo verso 'societa_capitali' (il caso più
   comune in uno studio) e lo segnaliamo: chi aveva effettivamente una società di persone può
   correggerlo in un secondo momento dalla scheda cliente. */
function labelTipoCliente(v) {
  const t = TIPI_CLIENTE.find(x => x.v === v);
  return t ? t.l : (v || '—');
}
function migraTipoClienteLegacy(stato) {
  let migrati = 0;
  (stato.clienti || []).forEach(c => {
    if (c.tipo === 'società') { c.tipo = 'societa_capitali'; migrati++; }
  });
  return migrati;
}

/* Uno stato salvato prima dell'introduzione dei codici ATECO multipli ha cliente.ateco come stringa
   singola. La convertiamo in cliente.atecoCodici (array), senza perdere il valore già inserito. */
function migraAtecoClienteLegacy(stato) {
  let migrati = 0;
  (stato.clienti || []).forEach(c => {
    if (!Array.isArray(c.atecoCodici)) {
      c.atecoCodici = (c.ateco && c.ateco.trim()) ? [c.ateco.trim()] : [];
      migrati++;
    }
  });
  return migrati;
}

/* Tre adempimenti erano presenti SIA nel catalogo periodico (un flag con scadenza fissa/per
   cliente) SIA in quello annuale (con avanzamento a sotto-task) — comparivano due volte in
   anagrafica cliente: Dichiarazione IVA, Vidimazione libri sociali, Diritto camerale. Ora vivono
   solo nel catalogo annuale, che calcola comunque la scadenza in automatico (fissa via
   scadenzaDefault per i primi due, dalla scelta per cliente via SCADENZA_DINAMICA_ANNUALE per
   il diritto camerale). Questa tabella pilota la migrazione, uguale per tutti e tre i casi: per
   ogni cliente col vecchio flag periodico attivo, sposta l'obbligo sull'equivalente annuale
   (nessuna perdita di dati) e rimuove il flag legacy e la voce di catalogo periodico legacy. */
const ADEMPIMENTI_DUPLICATI_LEGACY = [
  { idPeriodico: 'dichiarazioneIva', flagPeriodico: 'dichiarazioneIva', chiaveAnnuale: 'DICH_IVA_ANNUALE' },
  { idPeriodico: 'vidimazione', flagPeriodico: 'vidimazione', chiaveAnnuale: 'VIDIMAZIONE_LIBRI' },
  { idPeriodico: null, flagPeriodico: 'dirittoCamerale', chiaveAnnuale: 'DIRITTO_CAMERALE' },
];
function migraAdempimentiDuplicati(stato) {
  let migrati = 0;
  ADEMPIMENTI_DUPLICATI_LEGACY.forEach(({ idPeriodico, flagPeriodico, chiaveAnnuale }) => {
    (stato.clienti || []).forEach(c => {
      if (c.flags && c.flags[flagPeriodico]) {
        if (!Array.isArray(c.adempimentiAnnualiApplicabili)) c.adempimentiAnnualiApplicabili = [];
        if (!c.adempimentiAnnualiApplicabili.includes(chiaveAnnuale)) c.adempimentiAnnualiApplicabili.push(chiaveAnnuale);
        delete c.flags[flagPeriodico];
        migrati++;
      }
    });
    if (idPeriodico && Array.isArray(stato.catalogoPeriodico)) {
      const prima = stato.catalogoPeriodico.length;
      stato.catalogoPeriodico = stato.catalogoPeriodico.filter(def => def.id !== idPeriodico);
      if (stato.catalogoPeriodico.length !== prima) migrati++;
    }
  });
  return migrati;
}

const SCELTE_ADDEBITO_F24 = [
  {v:'NOI', l:'Noi (studio)'},
  {v:'CLIENTE', l:'Cliente'},
  {v:'NOI/CLIENTE', l:'Noi o cliente, a seconda dei casi'},
];
/* ATTENZIONE alle parole: nei dati il valore 'ESTERNA' significa che la contabilità la tiene LO STUDIO
   (esterna rispetto all'azienda); 'INTERNA' che la tiene l'azienda stessa o un altro professionista.
   Nel linguaggio dello studio si dice l'opposto ("contabilità interna" = la fa Sabrina in studio),
   quindi le etichette mostrate dicono sempre chi la tiene, senza usare "interna/esterna" da soli. */
const SCELTE_CONTABILITA = [
  {v:'ESTERNA', l:'Tenuta dallo studio'},
  {v:'INTERNA', l:'Tenuta da terzi / dal cliente (lo studio non la registra)'},
];
const MOTIVI_CESSAZIONE = ['Cessata attività dell\'azienda', 'Passato ad altro professionista', 'Revoca del mandato / insoluto', 'Pratica conclusa', 'Decisione dello studio', 'Altro'];
const TIPI_RAPPORTO = ['Contratto continuativo', 'Pratica una tantum'];
const PERIODICITA_FATTURAZIONE = ['Mensile', 'Trimestrale', 'Semestrale', 'Annuale', 'Alla prestazione'];
/* Cliente "operativo": genera scadenze, compare negli elenchi di lavoro. Esclusi i cessati e i
   potenziali clienti (hanno solo un preventivo, non ancora accettato). */
function clienteAttivo(c) { return !!c && c.stato !== 'cessato' && c.stato !== 'potenziale'; }
/* Dati specifici delle associazioni (cliente.associazione): compaiono solo se il tipo di cliente è "Associazione". */
const ASSOC_PERSONALITA = ['Non riconosciuta', 'Riconosciuta', 'Da verificare'];
const ASSOC_RUNTS = ['Iscritta', 'In lavorazione', 'Non iscritta', 'Da verificare'];
const ASSOC_DELEGA = ['Presente', 'Mancante', 'Da verificare', 'Non necessaria'];
const ASSOC_RASD = ['Iscritta', 'Non iscritta', 'Da verificare', 'Non applicabile'];
function datiAssociazione(c) { return Object.assign({ personalita: '', qualifica: '', runts: '', sezioneRunts: '', repertorioRunts: '', delegaRunts: '', rasd: '', daFare: '' }, (c && c.associazione) || {}); }
function contabilitaDaTerzi(c) { return !!c && c.contabilita === 'INTERNA'; }
/* Cosa cambia per i clienti la cui contabilità NON è tenuta dallo studio (task #235): quali scadenze
   periodiche lo studio non gestisce e quali fasi hanno gli adempimenti annuali (es. non c'è la
   "chiusura contabile": si aspettano i dati dal terzo). Impostazioni > Catalogo. */
const CONTAB_TERZI_DEFAULT = {
  periodiciEsclusi: [], /* l'IVA e gli adempimenti fiscali restano sempre a carico dello studio anche se la contabilità è di terzi */
  sotto: {
    BILANCIO: ['Richiesta contabilità/bilancio provvisorio al terzo', 'Ricezione contabilità chiusa', 'Verifica dati ricevuti', 'Calcolo imposte', 'Condivisione con il cliente', 'Predisposizione pratica', 'Deposito'],
    REDDITI_ORDINARI: ['Richiesta dati contabili al terzo', 'Ricezione e verifica dati', 'Calcolo imposte dovute', 'Predisposizione dichiarazione', 'Comunicazione importi dovuti al cliente', 'Predisposizione F24 di versamento', 'Invio telematico dichiarazione', 'Consegna copia al cliente'],
    REDDITI_SEMPLIFICATI: ['Richiesta dati contabili al terzo', 'Ricezione e verifica dati', 'Calcolo imposte dovute', 'Predisposizione dichiarazione', 'Comunicazione importi dovuti al cliente', 'Predisposizione F24 di versamento', 'Invio telematico dichiarazione', 'Consegna copia al cliente'],
    DICH_IVA_ANNUALE: ['Richiesta dati IVA al terzo', 'Ricezione e verifica dati', 'Predisposizione dichiarazione', 'Invio telematico', 'Consegna copia al cliente'],
  },
};
function configContabTerzi() {
  const c = STATE && STATE.meta && STATE.meta.contabTerzi;
  if (!c) return JSON.parse(JSON.stringify(CONTAB_TERZI_DEFAULT));
  /* Vecchio valore di partenza (escludeva tutta l'IVA): l'IVA la gestiamo comunque noi, quindi lo si considera non scelto */
  const VECCHIO = ['ivaMensile', 'ivaTrimestrale', 'accontoIva', 'lipe', 'intrastatMensile', 'intrastatTrimestrale', 'bolloFattElett', 'fattureEstere', 'oss', 'iva398'];
  let esclusi = c.periodiciEsclusi || [];
  if (c.v !== 2 && esclusi.length === VECCHIO.length && VECCHIO.every(k => esclusi.includes(k))) esclusi = [];
  return { v: 2, periodiciEsclusi: esclusi, sotto: c.sotto || {} };
}
function salvaConfigContabTerzi(cfg) { STATE.meta.contabTerzi = cfg; salvaStato(); }
// Unica lista di previdenze, condivisa dal form cliente e dall'import da Excel/CSV, così le due
// cose non possono mai andare fuori sincrono tra loro.
/* PMI / start-up innovative e organo di controllo (servono per il 770 e per gli adempimenti societari).
   '' = non ancora indicato -> il cliente resta "da completare". */
const OPZIONI_ORGANO_CONTROLLO = ['Nessuno','Sindaco unico','Collegio sindacale','Revisore legale','Società di revisione'];
const TIPI_CON_ORGANO_CONTROLLO = ['societa_capitali','cooperativa','impresa_sociale'];
/* DUE LIVELLI di "anagrafica da completare" per i clienti ATTIVI:
   - GRAVE (rosso): senza questi dati lo studio lavora male - le scadenze non si generano o non hanno
     un responsabile (regime, periodicità IVA, responsabile, tenuta contabilità, identificativo fiscale).
     Per i forfettari/enti non commerciali la periodicità IVA non conta (N.A. o vuota è ok).
   - LEGGERO (giallo): dati utili ma non bloccanti (addebito F24, previdenza di persone fisiche/ditte,
     PMI/start-up innovativa e organo di controllo delle società - servono per il 770 -, un recapito
     email/PEC, ATECO).
   Importare/creare un cliente con questi campi vuoti è permesso: l'avviso resta finché non sono compilati. */
function livelliMancantiCliente(c) {
  const out = { gravi: [], leggeri: [] };
  if (!c || (c.stato && c.stato !== 'attivo')) return out;
  const senzaIva = c.regimeFiscale === 'Forfettario' || c.regimeFiscale === 'Forfettario L.398/91' || c.regimeFiscale === 'Ente non commerciale';
  if (!c.regimeFiscale) out.gravi.push('Regime fiscale');
  if (!c.periodicitaIva && !senzaIva) out.gravi.push('Periodicità IVA');
  if (!c.responsabileStudio) out.gravi.push('Responsabile studio');
  if (!c.contabilita) out.gravi.push('Tenuta contabilità');
  if (!c.codiceFiscale && !c.partitaIva) out.gravi.push('Codice fiscale / P.IVA');
  if (!c.addebitoF24) out.leggeri.push('Addebito F24');
  if (c.tipo === 'ditta_individuale' && !c.iscrittoRegistroImprese) out.leggeri.push('Iscrizione Registro Imprese');
  if (['persona_fisica','ditta_individuale'].includes(c.tipo) && !c.previdenza) out.leggeri.push('Previdenza');
  if (TIPI_CON_ORGANO_CONTROLLO.includes(c.tipo)) {
    if (!c.pmiInnovativa) out.leggeri.push('PMI innovativa (sì/no)');
    if (!c.startupInnovativa) out.leggeri.push('Start-up innovativa (sì/no)');
    if (!c.organoControllo) out.leggeri.push('Organo di controllo');
  }
  const co = c.contatti || {};
  if (!co.email && !co.pec) out.leggeri.push('Email o PEC');
  if (!(c.atecoCodici || []).length) out.leggeri.push('Codice ATECO');
  return out;
}
function campiMancantiCliente(c) { const l = livelliMancantiCliente(c); return l.gravi.concat(l.leggeri); }
function nClientiGravi() { return STATE.clienti.filter(c => livelliMancantiCliente(c).gravi.length > 0).length; }
function badgeDatiMancanti(c) {
  const l = livelliMancantiCliente(c);
  if (!l.gravi.length && !l.leggeri.length) return '';
  const grave = l.gravi.length > 0;
  const tip = (grave ? 'MANCANO (importanti): ' + l.gravi.join(', ') : '') + (grave && l.leggeri.length ? ' — ' : '') + (l.leggeri.length ? 'Utili: ' + l.leggeri.join(', ') : '');
  return ` <span class="badge" title="${escapeHtml(tip)}" style="cursor:help;background:${grave ? 'var(--rosso)' : 'var(--giallo-bg)'};color:${grave ? '#fff' : 'var(--giallo)'};">${grave ? '⚠' : 'ℹ'} da completare (${l.gravi.length + l.leggeri.length})</span>`;
}
const PREVIDENZE = ['No previdenza','Artigiani/Commercianti','Gestione Separata','Cassa Privata','Agricoltura (CD/IAP)','Inarcassa','Dipendente','Cassa Forense','Cassa Geometri'];

function occorrenzeMensili(giorno, prefissoNota, giornoAgosto) {
  return [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
    const mRif = m === 1 ? 12 : m - 1;
    return { m, g: (giornoAgosto && m === 8) ? giornoAgosto : giorno, nota: `${prefissoNota} ${MESI_IT[mRif-1]}` };
  });
}

/* Tipologia degli adempimenti (imposte dirette/indirette, contabili, ecc.): usata per
   raggruppare in un'unica vista organizzata gli adempimenti periodici e annuali, sia in
   anagrafica cliente sia nel catalogo di Impostazioni. */
const TIPI_ADEMPIMENTO = [
  'Imposte dirette',
  'Imposte indirette',
  'Adempimenti contabili',
  'Adempimenti previdenziali',
  'Adempimenti del lavoro',
  'Adempimenti camerali/societari',
  'Altri tributi',
];
const TIPO_ADEMPIMENTO_DEFAULT = 'Altri tributi';

/* Catalogo predefinito delle scadenze periodiche. Modificabile dall'utente in
   Impostazioni → Catalogo scadenze (STATE.catalogoPeriodico); questo oggetto è
   solo il seed iniziale / il valore di "ripristina predefiniti".
   Nota: "Dichiarazione IVA" NON è più qui — vive solo nel catalogo annuale
   (DICH_IVA_ANNUALE), che ne segue anche l'avanzamento (raccolta dati, predisposizione,
   invio) e ne calcola comunque la scadenza del 30/4 in automatico. Averla in entrambi i
   catalogi la faceva comparire due volte in anagrafica cliente. */
const DEFAULT_CATALOGO_PERIODICO = [
  { id: 'ivaMensile', flag: 'ivaMensile', nome: 'Liquidazione IVA mensile', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: FASI_F24,
    occorrenze: occorrenzeMensili(16, 'IVA mensile', 20) },
  { id: 'ivaTrimestrale', flag: 'ivaTrimestrale', nome: 'Liquidazione IVA trimestrale', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:5,  g:16, nota: 'IVA trim I trim (gen-mar)' },
      { m:8,  g:20, nota: 'IVA trim II trim (apr-giu) - proroga' },
      { m:11, g:16, nota: 'IVA trim III trim (lug-set)' },
    ] },
  { id: 'inpsArtigCommMin', flag: 'inpsArtigComm', nome: 'INPS Artig/Comm - minimale', attivo: true, tipo: 'Adempimenti previdenziali',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:5,  g:16, nota: 'I rata contributi minimali' },
      { m:8,  g:20, nota: 'II rata contributi minimali' },
      { m:11, g:16, nota: 'III rata contributi minimali' },
      { m:2,  g:16, nota: 'IV rata contributi minimali' },
    ] },
  { id: 'inpsAgricoltura', flag: 'inpsAgricoltura', nome: 'INPS Agricoltura (CD/IAP)', attivo: true, tipo: 'Adempimenti previdenziali',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:5,  g:16, nota: 'I rata contributi agricoli' },
      { m:8,  g:20, nota: 'II rata contributi agricoli' },
      { m:11, g:16, nota: 'III rata contributi agricoli' },
      { m:2,  g:16, nota: 'IV rata contributi agricoli' },
    ] },
  // Nota: "INPS Artig/Comm - eccedente" e "INPS Gestione Separata" NON sono in questo elenco:
  // per legge seguono lo stesso termine del saldo/acconto imposte sui redditi (variabile per
  // proroghe ISA/forfettari), quindi vengono generate con data scelta per cliente — vedi blocco
  // "versamento imposte" più sotto in generaScadenzePeriodiche.
  { id: 'f24Paghe', flag: 'paghe', nome: 'F24 Paghe dipendenti', attivo: true, tipo: 'Adempimenti del lavoro',
    conImporto: true, fasi: FASI_F24,
    occorrenze: occorrenzeMensili(16, 'F24 paghe dipendenti', 20) },
  { id: 'enasarco', flag: 'enasarco', nome: 'Enasarco e FIRR (agenti di commercio)', attivo: true, tipo: 'Adempimenti previdenziali',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:2,  g:20, nota: 'Enasarco - contributi IV trim anno prec.' },
      { m:5,  g:20, nota: 'Enasarco - contributi I trim' },
      { m:8,  g:20, nota: 'Enasarco - contributi II trim' },
      { m:11, g:20, nota: 'Enasarco - contributi III trim' },
      { m:3,  g:31, nota: 'FIRR - versamento annuale' },
    ] },
  { id: 'lipe', flag: 'lipe', nome: 'LIPE', attivo: true, tipo: 'Imposte indirette',
    conImporto: false, fasi: FASI_COMUNICAZIONE,
    occorrenze: [
      { m:5,  g:31, nota: 'LIPE I trim' },
      { m:9,  g:30, nota: 'LIPE II trim' },
      { m:11, g:30, nota: 'LIPE III trim' },
    ] },
  { id: 'bolloFattElett', flag: 'bolloFattElett', nome: 'Bollo fatture elettroniche', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      // 4 finestre trimestrali; il versamento slitta cumulando i trimestri successivi finché il
      // dovuto resta sotto 5.000€ (art. 17 DL 119/2018) — verifica soglia ad ogni finestra.
      { m:5,  g:31, nota: 'Bollo FE - I trim (o cumulo se sotto 5.000€)' },
      { m:9,  g:30, nota: 'Bollo FE - II trim, o cumulo I+II se sotto 5.000€' },
      { m:11, g:30, nota: 'Bollo FE - III trim, o cumulo I+II+III se sotto 5.000€' },
      { m:2,  g:28, nota: 'Bollo FE - IV trim anno prec. (sempre dovuto a questa data)' },
    ] },
  { id: 'accontoIva', flag: 'accontoIva', nome: 'Acconto IVA', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [{ m:12, g:27, nota: 'Acconto IVA (metodo storico/previsionale/analitico)' }] },
  { id: 'inail', flag: 'inail', nome: 'INAIL autoliquidazione', attivo: true, tipo: 'Adempimenti previdenziali',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [{ m:2, g:16, nota: 'Autoliquidazione INAIL' }] },
  { id: 'fattureEstere', flag: 'fattureEstere', nome: 'Invio fatture estere', attivo: true, tipo: 'Imposte indirette',
    conImporto: false, fasi: ['Registrate', 'Inviate'],
    occorrenze: occorrenzeMensili(15, 'Fatture estere') },
  { id: 'oss', flag: 'oss', nome: 'Dichiarazione OSS', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: ['Dichiarazione inviata', 'Pagamento eseguito'],
    occorrenze: [
      { m:1,  g:31, nota: 'OSS IV trim anno prec.' },
      { m:4,  g:30, nota: 'OSS I trim'  },
      { m:7,  g:31, nota: 'OSS II trim' },
      { m:10, g:31, nota: 'OSS III trim'},
    ] },
  { id: 'imu', flag: 'imu', nome: 'IMU', attivo: true, tipo: 'Altri tributi',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:6,  g:16, nota: 'IMU - acconto' },
      { m:12, g:16, nota: 'IMU - saldo'   },
    ] },
  { id: 'intrastatMensile', flag: 'intrastatMensile', nome: 'Intrastat mensile', attivo: true, tipo: 'Imposte indirette',
    conImporto: false, fasi: ['Predisposto', 'Inviato'],
    occorrenze: occorrenzeMensili(25, 'Intrastat mensile') },
  { id: 'intrastatTrimestrale', flag: 'intrastatTrimestrale', nome: 'Intrastat trimestrale', attivo: true, tipo: 'Imposte indirette',
    conImporto: false, fasi: ['Predisposto', 'Inviato'],
    occorrenze: [
      { m:1,  g:25, nota: 'Intrastat trim IV trim anno prec. (ott-dic)' },
      { m:4,  g:25, nota: 'Intrastat trim I trim (gen-mar)' },
      { m:7,  g:25, nota: 'Intrastat trim II trim (apr-giu)' },
      { m:10, g:25, nota: 'Intrastat trim III trim (lug-set)' },
    ] },
  /* Enti associativi (associazioni, ASD/SSD, ecc.) che hanno optato per il regime forfettario
     L.398/1991: liquidano IVA e IRES forfettarie sui soli proventi commerciali con lo stesso
     calendario delle liquidazioni IVA trimestrali ordinarie (art. 74, co.6 DPR 633/72). */
  { id: 'iva398', flag: 'iva398', nome: 'Versamento IVA/IRES forfettaria L.398/91', attivo: true, tipo: 'Imposte indirette',
    conImporto: true, fasi: FASI_F24,
    occorrenze: [
      { m:5,  g:16, nota: 'IVA/IRES forfettaria L.398/91 - I trim' },
      { m:8,  g:20, nota: 'IVA/IRES forfettaria L.398/91 - II trim' },
      { m:11, g:16, nota: 'IVA/IRES forfettaria L.398/91 - III trim' },
      { m:2,  g:16, nota: 'IVA/IRES forfettaria L.398/91 - IV trim anno prec.' },
    ] },
];

/* Legge il catalogo periodico effettivo (quello salvato in STATE se presente,
   altrimenti il default) nel formato { flag, nome, dates:[{m,g,nota}] } atteso
   dal motore di generazione scadenze. */
function catalogoPeriodici() {
  const sorgente = (STATE && STATE.catalogoPeriodico) || DEFAULT_CATALOGO_PERIODICO;
  return sorgente.filter(def => def.attivo !== false).map(def => ({
    id: def.id, flag: def.flag, nome: def.nome, dates: def.occorrenze, info: infoFasiPeriodico(def),
  }));
}

const FLAG_SEMPLICI = ['lipe','bolloFattElett','inail','fattureEstere','oss','imu','paghe','enasarco','iva398'];

const FLAG_LABELS = {
  lipe:'LIPE', bolloFattElett:'Bollo fatture elettroniche',
  inail:'INAIL', fattureEstere:'Fatture estere',
  oss:'OSS (e-commerce/digitali UE)', imu:'IMU', paghe:'Paghe dipendenti',
  enasarco:'Enasarco / FIRR (agenti di commercio)',
  iva398:'IVA/IRES forfettaria L.398/91 (enti associativi)',
};
function tipoFlagPeriodico(flag) {
  const def = (STATE && STATE.catalogoPeriodico || DEFAULT_CATALOGO_PERIODICO).find(d => d.flag === flag);
  return (def && def.tipo) || TIPO_ADEMPIMENTO_DEFAULT;
}
/* Alcune scadenze periodiche non hanno una entry 1:1 nel catalogo perché sono generate "al
   volo" in generaScadenzePeriodiche/generaScadenzeRitenute (diritto camerale con data scelta
   per cliente, saldo/acconto imposte, INPS eccedente/gestione separata, ritenute autonomi) —
   qui il loro tipo per il raggruppamento in vista è fisso. */
const TIPO_SCADENZA_SINTETIZZATA = {
  'Diritto camerale': 'Adempimenti camerali/societari',
  'Saldo e acconto imposte sui redditi': 'Imposte dirette',
  'INPS Artig/Comm - eccedente': 'Adempimenti previdenziali',
  'INPS Gestione Separata': 'Adempimenti previdenziali',
  'Versamento ritenuta autonomi': 'Imposte dirette',
};
function tipoCategoriaScadenzaPeriodica(nomeTipo) {
  const def = (STATE && STATE.catalogoPeriodico || DEFAULT_CATALOGO_PERIODICO).find(d => d.nome === nomeTipo);
  if (def && def.tipo) return def.tipo;
  return TIPO_SCADENZA_SINTETIZZATA[nomeTipo] || TIPO_ADEMPIMENTO_DEFAULT;
}
/* Raggruppa un elenco di "tipo" (nomi) di scadenza periodica per categoria (imposte
   dirette/indirette/ecc.), nell'ordine di TIPI_ADEMPIMENTO, per i filtri <select> a optgroup. */
function raggruppaTipiPerCategoria(tipiValori) {
  const perCategoria = new Map();
  TIPI_ADEMPIMENTO.forEach(t => perCategoria.set(t, []));
  tipiValori.forEach(t => {
    const cat = tipoCategoriaScadenzaPeriodica(t);
    if (!perCategoria.has(cat)) perCategoria.set(cat, []);
    perCategoria.get(cat).push(t);
  });
  return Array.from(perCategoria.entries()).filter(([, vals]) => vals.length);
}

function flagsAttivi(cliente) {
  const f = {};
  f.ivaMensile = cliente.periodicitaIva === 'Mensile';
  f.ivaTrimestrale = cliente.periodicitaIva === 'Trimestrale';
  f.accontoIva = cliente.periodicitaIva === 'Mensile' || cliente.periodicitaIva === 'Trimestrale';
  f.intrastatMensile = cliente.periodicitaIntrastat === 'Mensile';
  f.intrastatTrimestrale = cliente.periodicitaIntrastat === 'Trimestrale';
  f.inpsArtigComm = cliente.previdenza === 'Artigiani/Commercianti';
  f.inpsGestSeparata = cliente.previdenza === 'Gestione Separata';
  f.inpsAgricoltura = cliente.previdenza === 'Agricoltura (CD/IAP)';
  for (const k of FLAG_SEMPLICI) f[k] = !!(cliente.flags && cliente.flags[k]);
  // eventuali flag personalizzati creati dall'utente (id custom_...) passano così come sono
  if (cliente.flags) for (const k of Object.keys(cliente.flags)) { if (!(k in f)) f[k] = !!cliente.flags[k]; }
  return f;
}

/* Catalogo predefinito degli adempimenti annuali con sotto-task. Modificabile
   in Impostazioni → Catalogo scadenze (STATE.catalogoAnnuale); questo oggetto
   è solo il seed iniziale / il valore di "ripristina predefiniti". */
/* Sotto-task standard di una dichiarazione fiscale: dalla raccolta dati fino alla consegna al
   cliente, passando per il calcolo dell'imposta, la comunicazione dell'importo dovuto al cliente
   e la predisposizione dell'F24 di versamento — così ogni passaggio ha un responsabile e una data
   propri (vedi aggiornaSottoAdempimento/ann-resp-sotto) e non si perde nulla lungo il percorso. */
const SOTTO_DICHIARAZIONE_STANDARD = [
  'Raccolta dati e documentazione',
  'Calcolo imposte dovute',
  'Predisposizione dichiarazione',
  'Comunicazione importi dovuti al cliente',
  'Predisposizione F24 di versamento',
  'Invio telematico dichiarazione',
  'Consegna copia al cliente',
];
const DEFAULT_CATALOGO_ANNUALE = [
  { chiave: 'DICH_IVA_ANNUALE', nome: 'Dichiarazione IVA', attivo: true, tipo: 'Imposte indirette',
    sotto: SOTTO_DICHIARAZIONE_STANDARD, scadenzaDefault: { m:4, g:30 } },
  { chiave: 'CU', nome: 'CU', attivo: true, tipo: 'Adempimenti del lavoro',
    sotto: ['Raccolta dati compensi e ritenute', 'Predisposizione CU', 'Verifica quadratura con 770', 'Invio telematico', 'Consegna al cliente/percipienti'] },
  { chiave: '770', nome: '770', attivo: true, tipo: 'Adempimenti del lavoro',
    sotto: ['Raccolta dati ritenute operate', 'Predisposizione dichiarazione', 'Verifica quadratura con CU', 'Invio telematico'] },
  { chiave: 'DIRITTO_CAMERALE', nome: 'Diritto camerale', attivo: true, tipo: 'Adempimenti camerali/societari', sotto: ['Predisposizione F24', 'Invio F24'] },
  { chiave: 'BILANCIO', nome: 'Bilancio/Verbale assemblea', attivo: true, tipo: 'Adempimenti camerali/societari',
    sotto: [
      'Raccolta documenti per chiusure contabili',
      'Chiusura contabile dell\'anno',
      'Calcolo imposte',
      'Condivisione con il cliente',
      'Predisposizione pratica',
      'Deposito',
    ] },
  { chiave: 'REDDITI_FORFETTARI', nome: 'Dichiarazione redditi forfettari', attivo: true, tipo: 'Imposte dirette', sotto: SOTTO_DICHIARAZIONE_STANDARD },
  { chiave: 'REDDITI_SEMPLIFICATI', nome: 'Dichiarazione redditi semplificati', attivo: true, tipo: 'Imposte dirette', sotto: SOTTO_DICHIARAZIONE_STANDARD },
  { chiave: 'REDDITI_ORDINARI', nome: 'Dichiarazione redditi ordinari', attivo: true, tipo: 'Imposte dirette', sotto: SOTTO_DICHIARAZIONE_STANDARD },
  { chiave: 'VIDIMAZIONE_LIBRI', nome: 'Tassa vidimazione libri sociali', attivo: true, tipo: 'Adempimenti contabili',
    sotto: ['Predisposizione F24', 'Invio F24'], scadenzaDefault: { m:3, g:16 } },
  /* -------- Enti associativi (associazioni, ASD/SSD, ETS, ecc.) -------- */
  { chiave: 'REDDITI_ENC', nome: 'Dichiarazione redditi Enti Non Commerciali (Modello REDDITI ENC)', attivo: true, tipo: 'Imposte dirette',
    sotto: SOTTO_DICHIARAZIONE_STANDARD },
  { chiave: 'MODELLO_EAS', nome: 'Modello EAS (Comunicazione enti associativi)', attivo: true, tipo: 'Adempimenti camerali/societari',
    sotto: ['Verifica variazioni dati rispetto all\'ultimo invio', 'Predisposizione comunicazione', 'Invio telematico'] },
  { chiave: 'RENDICONTO_ASSOCIAZIONE', nome: 'Rendiconto economico-finanziario annuale', attivo: true, tipo: 'Adempimenti contabili',
    sotto: ['Raccolta entrate e uscite', 'Predisposizione rendiconto', 'Condivisione con il consiglio direttivo', 'Approvazione assemblea dei soci', 'Conservazione con verbale'], scadenzaDefault: { m:4, g:30 } },
  { chiave: 'RENDICONTO_398', nome: 'Prospetto rendiconto L.398/1991', attivo: true, tipo: 'Adempimenti contabili',
    sotto: ['Raccolta proventi commerciali e IVA forfettaria versata', 'Predisposizione prospetto', 'Condivisione con il consiglio direttivo', 'Conservazione con verbale del consiglio direttivo'], scadenzaDefault: { m:4, g:30 } },
  { chiave: 'RUNTS_BILANCIO', nome: 'Deposito bilancio RUNTS (Enti del Terzo Settore)', attivo: true, tipo: 'Adempimenti camerali/societari',
    sotto: ['Predisposizione bilancio/rendiconto', 'Condivisione con il cliente', 'Approvazione assemblea', 'Deposito telematico sul RUNTS'], scadenzaDefault: { m:6, g:30 } },
  { chiave: 'CINQUE_PER_MILLE', nome: 'Rendicontazione 5 per mille', attivo: true, tipo: 'Adempimenti contabili',
    sotto: ['Verifica contributo ricevuto', 'Predisposizione rendiconto e relazione illustrativa', 'Invio/pubblicazione entro il termine ministeriale (variabile ogni anno)'] },
  { chiave: 'AFFILIAZIONE_SPORTIVA', nome: 'Affiliazione e tesseramento CONI/Federazione (ASD/SSD)', attivo: true, tipo: 'Adempimenti camerali/societari',
    sotto: ['Rinnovo affiliazione', 'Tesseramento soci/atleti', 'Versamento quote di affiliazione'], scadenzaDefault: { m:8, g:31 } },
  /* -------- Cooperative e imprese sociali -------- */
  { chiave: 'REVISIONE_COOPERATIVA', nome: 'Revisione cooperativa biennale', attivo: true, tipo: 'Adempimenti camerali/societari',
    sotto: ['Richiesta/rinnovo revisore o associazione di rappresentanza', 'Trasmissione documentazione', 'Verbale di revisione'] },
  { chiave: 'FONDI_MUTUALISTICI', nome: 'Versamento 3% utili ai fondi mutualistici', attivo: true, tipo: 'Altri tributi',
    sotto: ['Calcolo 3% utile netto d\'esercizio', 'Versamento al fondo mutualistico di categoria'] },
  { chiave: 'BILANCIO_SOCIALE', nome: 'Bilancio sociale', attivo: true, tipo: 'Adempimenti contabili',
    sotto: ['Raccolta dati di impatto sociale', 'Predisposizione bilancio sociale', 'Condivisione con il cliente', 'Approvazione e deposito (RUNTS/Registro Imprese)'], scadenzaDefault: { m:6, g:30 } },
];

/* Scadenze ordinarie degli adempimenti annuali che non ne avevano una (mese/giorno dell'anno gestito;
   modificabili in Impostazioni > Catalogo, e spostate in automatico dalle proroghe). Le dichiarazioni
   dei redditi (PF, società di persone e di capitali) e il 770 si inviano entro il 31/10, la CU entro il
   16/03, il bilancio va depositato entro 30 giorni dall'approvazione (che è entro il 30/04). */
const SCADENZE_ANNUALI_STANDARD = {
  'CU': { m: 3, g: 16 }, '770': { m: 10, g: 31 }, 'BILANCIO': { m: 5, g: 30 },
  'REDDITI_FORFETTARI': { m: 10, g: 31 }, 'REDDITI_SEMPLIFICATI': { m: 10, g: 31 }, 'REDDITI_ORDINARI': { m: 10, g: 31 },
  'REDDITI_ENC': { m: 10, g: 31 },
};
DEFAULT_CATALOGO_ANNUALE.forEach(d => { if (!d.scadenzaDefault && SCADENZE_ANNUALI_STANDARD[d.chiave]) d.scadenzaDefault = Object.assign({}, SCADENZE_ANNUALI_STANDARD[d.chiave]); });

/* Legge il catalogo annuale effettivo (STATE se presente, altrimenti default). */
function catalogoAnnualeTutti() {
  return (STATE && STATE.catalogoAnnuale) || DEFAULT_CATALOGO_ANNUALE;
}
function catalogoAnnualeAttivo() {
  return catalogoAnnualeTutti().filter(def => def.attivo !== false);
}

const ONBOARDING_DEF = [
  { categoria: 'Documenti contrattuali', chiave: 'mandato', nome: 'Mandato e preventivo firmati dal cliente' },
  { categoria: 'Documenti anagrafici', chiave: 'cartaIdentita', nome: "Carta d'identità ricevuta" },
  { categoria: 'Documenti anagrafici', chiave: 'codiceFiscale', nome: 'Codice fiscale ricevuto' },
  { categoria: 'Documenti anagrafici', chiave: 'visuraCamerale', nome: 'Visura camerale ricevuta (se disponibile)' },
  { categoria: 'Antiriciclaggio', chiave: 'questionarioAr', nome: 'Questionario antiriciclaggio predisposto' },
  { categoria: 'Scheda anagrafica', chiave: 'schedaCompleta', nome: 'Compilazione scheda anagrafica completa' },
  { categoria: 'Attivazione deleghe', chiave: 'delegaFatture', nome: 'Delega fatture e corrispettivi attivata' },
  { categoria: 'Attivazione deleghe', chiave: 'delegaCassettoFiscale', nome: 'Delega cassetto fiscale attivata' },
  { categoria: 'Attivazione deleghe', chiave: 'delegaCassettoPrev', nome: 'Delega cassetto previdenziale attivata' },
  { categoria: 'Mandato e antiriciclaggio', chiave: 'inviaMandatoAml', nome: 'Mandato e dichiarazione antiriciclaggio inviati al cliente da firmare' },
  { categoria: 'Mandato e antiriciclaggio', chiave: 'amlFirmata', nome: 'Dichiarazione antiriciclaggio firmata ricevuta' },
  { categoria: 'Procedura di studio', chiave: 'stampaPreventivo', nome: 'Stampa preventivo accettato' },
  { categoria: 'Procedura di studio', chiave: 'cartellinaAml', nome: 'Apertura cartellina antiriciclaggio' },
  { categoria: 'Procedura di studio', chiave: 'stampaA3', nome: 'Stampa A3' },
  { categoria: 'Procedura di studio', chiave: 'provaIb', nome: 'Attivazione prova gratuita IB' },
  { categoria: 'Procedura di studio', chiave: 'accountIbFt', nome: 'Abilitazione account IB per invio fatture elettroniche' },
  { categoria: 'Procedura di studio', chiave: 'anagraficaIb', nome: 'Inserimento cliente in anagrafica clienti IB (Quadra/Federico)' },
  { categoria: 'Procedura di studio', chiave: 'fileClienti', nome: 'Inserimento in file clienti (comunicare a Sabrina nome e data di presa in carico)' },
  { categoria: 'Procedura di studio', chiave: 'attivitaIb', nome: 'Clienti Quadra: inserire attività da fatturare in IB secondo rateizzazione' },
  { categoria: 'Procedura di studio', chiave: 'guidaDeleghe', nome: 'Invio guida per deleghe cassetto fiscale' },
];

/* Passi per aprire la posizione di un nuovo cliente, ricavati dalla scheda cliente (foglio guida dell'appuntamento):
   es. forfettario con INPS artigiani e INAIL -> apertura P.IVA, iscrizione Camera di Commercio, INPS artigiani, INAIL. */
function stepAperturaPosizione(c) {
  const out = [], add = (chiave, nome) => out.push({ chiave, nome });
  if (!c) return out;
  const tipo = c.tipo, prev = c.previdenza || '', flags = c.flags || {};
  const societa = ['societa_persone', 'societa_capitali', 'cooperativa', 'impresa_sociale'].includes(tipo);
  if (tipo === 'associazione') { add('assocCf', 'Registrazione atto costitutivo/statuto e attribuzione codice fiscale'); add('assocPiva', 'Apertura partita IVA (se attività commerciale)'); }
  else if (societa) { add('costituzione', 'Costituzione della società e attribuzione P.IVA'); add('registroImprese', 'Iscrizione al Registro Imprese (Camera di Commercio)'); }
  else { add('apriPiva', 'Apertura partita IVA'); if (tipo === 'ditta_individuale' || /Artigiani/.test(prev)) add('registroImprese', 'Iscrizione Camera di Commercio'); }
  if (c.regimeFiscale === 'Forfettario') add('forfettario', 'Verifica requisiti e opzione per il regime forfettario');
  if (/Artigiani/.test(prev)) add('inps', 'Iscrizione INPS artigiani/commercianti');
  else if (/Separata/.test(prev)) add('inps', 'Iscrizione INPS gestione separata');
  else if (/Cassa/.test(prev) || /Inarcassa|Forense|Geometri/.test(prev)) add('cassa', 'Iscrizione alla cassa previdenziale privata');
  if (flags.inail) add('inail', 'Apertura posizione INAIL');
  if (c.haDipendenti === 'SI') add('dipendenti', 'Apertura posizioni per il personale (INPS datore di lavoro, comunicazioni assunzione)');
  return out;
}
function nuovoOnboarding() {
  const voci = {};
  for (const v of ONBOARDING_DEF) voci[v.chiave] = false;
  return voci;
}
function percentualeOnboarding(voci) {
  if (!voci) return 0;
  const chiavi = ONBOARDING_DEF.map(v => v.chiave);
  const ap = Array.isArray(voci.apertura) ? voci.apertura : [];
  const fatte = chiavi.filter(k => voci[k]).length + ap.filter(x => x.fatto).length;
  const tot = chiavi.length + ap.length;
  return tot ? Math.round((fatte / tot) * 100) : 0;
}

/* Task #119: fascicolo Antiriciclaggio/AML per cliente — DISTINTO dall'onboarding (che ha solo la
   singola spunta "questionarioAr" tra le sue voci) perché l'adeguata verifica ha bisogno di un
   proprio profilo di rischio, date di verifica/revisione e uno storico delle verifiche svolte nel
   tempo — dati che non stanno in una checklist booleana. Non tocchiamo ONBOARDING_DEF (rischio di
   rompere codice/test che ne assumono la forma fissa): questo è un modulo a sé, stesso pattern
   "oggetto STATE indicizzato per clienteId" già usato da onboarding/bilanci/mastrini. */
const AML_CHECKLIST_DEF = [
  { categoria: 'Identificazione cliente', chiave: 'documentoIdentita', nome: "Documento d'identità valido acquisito" },
  { categoria: 'Identificazione cliente', chiave: 'codiceFiscalePiva', nome: 'Codice fiscale/P.IVA verificato su banche dati ufficiali' },
  { categoria: 'Identificazione cliente', chiave: 'titolareEffettivo', nome: 'Titolare effettivo identificato' },
  { categoria: 'Profilo di rischio', chiave: 'questionarioRischio', nome: 'Questionario di profilatura del rischio compilato' },
  { categoria: 'Profilo di rischio', chiave: 'origineFondi', nome: 'Origine dei fondi/del patrimonio verificata' },
  { categoria: 'Profilo di rischio', chiave: 'personaEsposta', nome: 'Verifica PEP (persona politicamente esposta) effettuata' },
  { categoria: 'Conservazione', chiave: 'fascicoloArchiviato', nome: 'Fascicolo cliente archiviato (conservazione decennale)' },
  { categoria: 'Conservazione', chiave: 'registroAntiriciclaggio', nome: 'Dati registrati in Archivio Unico Informatico' },
];
const PROFILI_RISCHIO_AML = ['Non valutato', 'Basso', 'Medio', 'Alto'];
/* Valutazione del rischio antiriciclaggio (scheda "Pre-analisi" + "Rischio effettivo" dello studio): rischio inerente della
   prestazione (30%) + rischio specifico di cliente e prestazione (70%) -> grado di rischio e tipo di adeguata verifica. */
const AML_PRESTAZIONI = [
  ['Amministrazione e liquidazione di aziende, patrimoni, singoli beni', 2], ['Amministrazione di società, enti, trust o strutture analoghe', 3],
  ['Assistenza, consulenza e rappresentanza in materia tributaria', 2], ['Assistenza per richiesta finanziamenti', 3],
  ['Assistenza e consulenza societaria continuativa e generica', 3], ["Attività di valutazione tecnica dell'iniziativa di impresa e di asseverazione dei business plan per l'accesso a finanziamenti pubblici", 3],
  ['Consulenza aziendale', 3], ['Consulenza contrattuale', 2], ['Consulenza economico-finanziaria', 3], ['Costituzione/liquidazione di società, enti, trust o strutture analoghe', 3],
  ['Custodia e conservazione di beni e aziende', 2], ['Consulenza in operazioni di finanza straordinaria', 4], ['Tenuta della contabilità', 3],
  ['Consulenza in materia di redazione del bilancio', 3], ['Revisione legale dei conti', 3], ["Valutazione di aziende, rami d'azienda, patrimoni, singoli beni e diritti", 2],
].map(([nome, punti]) => ({ nome, punti }));
const AML_FATTORI = [{"k": "A.1", "titolo": "Natura giuridica", "fattori": ["Non congruità della natura giuridica prescelta in relazione all’attività svolta e alle sue dimensioni", "Articolazione giuridica, complessità e opacità della struttura volte ad ostacolare l’identificazione del titolare effettivo o l’attività concretamente svolta", "Partecipazione di persone politicamente esposte (cliente, esecutore, titolare effettivo)", "Incarichi in società, associazioni, fondazioni, organizzazioni non lucrative, organizzazioni non governative soprattutto se aventi sede in paesi ad alto rischio o non collaborativi", "Processi penali o indagini in corso per circostanze attinenti al terrorismo, al riciclaggio o all’autoriciclaggio – Misure di prevenzione o provvedimenti di sequestro - Familiarità/stretti legami con soggetti sottoposti a indagini o a procedimenti penali o provvedimenti di sequestro o censiti nelle liste delle persone o degli enti attivi nel finanziamento del terrorismo[1]", "Altro"]}, {"k": "A.2", "titolo": "Prevalente attività svolta", "fattori": ["Attività esposte al rischio di infiltrazioni criminali e terroristiche secondo le periodiche pubblicazioni delle Autorità in materia, sia a livello sovranazionale (Relazione UE sulla valutazione del rischio sovranazionale), sia a livello nazionale (triennale: “Analisi nazionale dei rischi di riciclaggio e finanziamento del terrorismo” MEF/CSF e annuale: “Rapporto annuale dell’Unità di Informazione Finanziaria” UIF/Bankitalia nonché la Relazione annuale al Parlamento del MEF)", "Struttura organizzativa e dimensionale non coerente con l’attività svolta", "Non conformità dell’attività svolta rispetto a quella indicata nell’atto costitutivo", "Altro"]}, {"k": "A.3", "titolo": "Comportamento tenuto al momento del conferimento dell’incarico", "fattori": ["Cliente non presente fisicamente", "Presenza di soggetti terzi con ruolo non definito", "Comportamento non trasparente e collaborativo", "Difficoltà nell’individuazione del titolare effettivo", "Altro"]}, {"k": "A.4", "titolo": "Area geografica di residenza del cliente", "fattori": ["Residenza/localizzazione in : comune italiano a rischio a causa dell’utilizzo eccessivo di contante – Residenza in Paesi terzi ad alto rischio individuati dalle Autorità – Paesi terzi non dotati di efficaci sistemi di prevenzione del riciclaggio e del finanziamento del terrorismo coerenti con le raccomandazioni del GAFI – Paesi terzi caratterizzati da un elevato livello di corruzione o di permeabilità ad altre attività criminose – Aree di conflitto in cui sono presenti organizzazioni terroristiche o in zone limitrofe o di transito – Paese soggetto a sanzioni o embarghi o misure analoghe stabilite dall’O.N.U. o altri organismi internazionali - (vedasi le pubblicazioni periodiche delle Autorità in materia, sia a livello sovranazionale, sia a livello nazionale)", "Lontananza della residenza del cliente rispetto alla sede del professionista", "Altro"]}, {"k": "B.1", "titolo": "Tipologia", "fattori": ["Operazione ordinaria/straordinaria rispetto al profilo soggettivo del cliente", "Operazione che prevede schemi negoziali che possono agevolare l’opacità delle relazioni economiche e finanziarie intercorrenti tra il cliente e la controparte", "Articolazione contrattuale ingiustificata", "Altro"]}, {"k": "B.2", "titolo": "Modalità di svolgimento", "fattori": ["Utilizzo di mezzi di pagamento non tracciati - Utilizzo di valute virtuali", "Utilizzo di conti non propri per trasferire/ricevere fondi", "Ricorso reiterato a procure", "Ricorso a domiciliazioni di comodo", "Altro"]}, {"k": "B.3", "titolo": "Ammontare dell’operazione", "fattori": ["Incoerenza dell’ammontare rispetto al profilo economico e finanziario del cliente", "Presenza di frazionamenti artificiosi", "Altro"]}, {"k": "B.4", "titolo": "Frequenza e volume delle operazioni/durata della prestazione professionale", "fattori": ["Non congruità della frequenza dell’operazione rispetto all’attività esercitata – Operatività improvvisa e poco giustificata rispetto all’ordinaria attività – Operazioni di ammontare consistente, concentrate in un ristretto arco temporale", "Rapporto professionale continuativo o occasionale", "Altro"]}, {"k": "B.5", "titolo": "Ragionevolezza", "fattori": ["Irragionevolezza dell’operazione rispetto all’attività svolta dal cliente", "Irragionevolezza dell’operazione rispetto all’entità delle risorse economiche nella disponibilità del cliente", "Non congruità dell’operazione rispetto alle finalità dichiarate", "Altro"]}, {"k": "B.6", "titolo": "Area geografica di destinazione", "fattori": ["Destinazione in : comune italiano a rischio a causa dell’utilizzo eccessivo di contante – Paesi terzi ad alto rischio individuati dalle Autorità – Paesi terzi non dotati di efficaci sistemi di prevenzione del riciclaggio e del finanziamento del terrorismo coerenti con le raccomandazioni del GAFI – Paesi terzi caratterizzati da un elevato livello di corruzione o di permeabilità ad altre attività criminose – Aree di conflitto in cui sono presenti organizzazioni terroristiche o in zone limitrofe o di transito – Paese soggetto a sanzioni o embarghi o misure analoghe stabilite dall’O.N.U. o altri organismi internazionali - (vedasi le pubblicazioni periodiche delle Autorità in materia, sia a livello sovranazionale, sia a livello nazionale)", "Inesistenza di riferimenti tradizionali nell’area geografica di destinazione (ad es. assenza di organismi equivalenti alle Camere di Commercio che detengono registri pubblici)", "Irragionevolezza e non congruità della ricerca di interazione con altre aree geografiche (ad es. vendita di determinati prodotti in aree geografiche nelle quali notoriamente gli stessi non risultano utilizzati)", "Altro"]}];
const AML_GRADI = ['Non significativo', 'Poco significativo', 'Abbastanza significativo', 'Molto significativo'];
/* Ogni quanti mesi si rinnova la dichiarazione del cliente: piu alto il rischio, piu spesso. Modificabile in meta.validitaAml. */
const VALIDITA_AML_DEFAULT = { 'Non significativo': 36, 'Poco significativo': 36, 'Abbastanza significativo': 24, 'Molto significativo': 12 };
function validitaAmlMesi(grado) { return Number(((STATE.meta || {}).validitaAml || {})[grado]) || VALIDITA_AML_DEFAULT[grado] || 24; }
function calcolaValutazioneAml(v) {
  const pr = AML_PRESTAZIONI[v.prestazione];
  const inerente = pr ? pr.punti : 0;
  const lv = (k) => Number(((v.fattori || {})[k] || {}).livello) || 1;
  const totA = ['A.1', 'A.2', 'A.3', 'A.4'].reduce((x, k) => x + lv(k), 0);
  const totB = v.sezioneB === false ? 0 : ['B.1', 'B.2', 'B.3', 'B.4', 'B.5', 'B.6'].reduce((x, k) => x + lv(k), 0);
  const specifico = totB === 0 ? totA / 4 : (totA + totB) / 10;
  const effettivo = 0.3 * inerente + 0.7 * specifico;
  const grado = effettivo < 1.3 ? AML_GRADI[0] : effettivo < 2.6 ? AML_GRADI[1] : effettivo < 3.7 ? AML_GRADI[2] : AML_GRADI[3];
  const verifica = grado === AML_GRADI[3] ? 'RAFFORZATA' : grado === AML_GRADI[2] ? 'ORDINARIA' : 'SEMPLIFICATA';
  const profilo = grado === AML_GRADI[3] ? 'Alto' : grado === AML_GRADI[2] ? 'Medio' : 'Basso';
  return { inerente, totA, totB, specifico: Math.round(specifico * 100) / 100, effettivo: Math.round(effettivo * 100) / 100, grado, verifica, profilo };
}
function nuovoFascicoloAntiriciclaggio() {
  const checklist = {};
  for (const v of AML_CHECKLIST_DEF) checklist[v.chiave] = false;
  return { profiloRischio: 'Non valutato', dataAdeguataVerifica: null, scadenzaRevisione: null, checklist, storico: [] };
}
function percentualeAntiriciclaggio(fascicolo) {
  if (!fascicolo) return 0;
  const chiavi = AML_CHECKLIST_DEF.map(v => v.chiave);
  const fatte = chiavi.filter(k => fascicolo.checklist && fascicolo.checklist[k]).length;
  return chiavi.length ? Math.round((fatte / chiavi.length) * 100) : 0;
}

function chiaveScadenza(dataISO, clienteId, admNome) {
  return `${dataISO}|${clienteId}|${admNome.toLowerCase().trim()}`;
}
function toISO(anno, meseIdx1, giorno) {
  const m = String(meseIdx1).padStart(2, '0');
  const g = String(giorno).padStart(2, '0');
  return `${anno}-${m}-${g}`;
}
/* Le scadenze fiscali che cadono di sabato o domenica slittano per legge al primo giorno
   feriale successivo (di norma il lunedì). Non gestiamo il calendario delle festività
   infrasettimanali (troppo variabile/da aggiornare ogni anno), ma il weekend è la casistica
   più frequente ed è quella che vale sempre. Usare SOLO per date di scadenza, mai per il
   rendering della griglia calendario (lì i giorni devono restare quelli veri del mese). */
function spostaSeFestivo(dataISO) {
  const d = new Date(dataISO + 'T00:00:00');
  const gg = d.getDay(); // 0 = domenica, 6 = sabato
  if (gg === 6) d.setDate(d.getDate() + 2);
  else if (gg === 0) d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function dataScadenza(anno, meseIdx1, giorno) {
  return spostaSeFestivo(toISO(anno, meseIdx1, giorno));
}

/* Un cliente cessato a metà anno resta "in carico" fino alla data di cessazione: le scadenze fino a quel
   giorno le fa lo studio; gli adempimenti annuali li fa lo studio solo se non sono stati ceduti al nuovo
   commercialista (flag "ceduto" in annualiOverrides, vedi cessaCliente). Dopo l'anno di cessazione, niente. */
/* Proroghe massive (STATE.proroghe): { id, tipo (nome del tipo di scadenza), dataOriginale, dataNuova, motivo, clienteIds|null }.
   Si applicano alle scadenze generate con quel tipo e quella data originale: la chiave/override della scadenza
   resta legata alla data originale, quindi stati e note già inseriti non si perdono. */
function applicaProroga(dataISO, clienteId, tipoNome) {
  /* Più proroghe sulla stessa scadenza si sommano a catena (es. saldo e I acconto: 30/06 ordinaria,
     poi 20/07, poi 20/08): il cliente ha la data PIÙ AVANZATA tra le proroghe a cui aderisce. Chi non
     aderisce a nessuna resta sulla data ordinaria; chi aderisce solo alla prima resta al 20/07. */
  const pr = (typeof STATE !== 'undefined' && STATE.proroghe) || [];
  let migliore = dataISO;
  for (const p of pr) {
    if (p.tipo === tipoNome && p.dataOriginale === dataISO && (!p.clienteIds || p.clienteIds.includes(clienteId)) && p.dataNuova > migliore) migliore = p.dataNuova;
  }
  return migliore;
}
function clienteGeneraScadenze(c, anno) {
  if (!c) return false;
  if (clienteAttivo(c)) return true;
  if (c.stato !== 'cessato' || !c.dataCessazione) return false;
  return Number(anno) <= Number(String(c.dataCessazione).slice(0, 4));
}
function generaScadenzePeriodiche(clienti, anno, vecchie) {
  vecchie = vecchie || {};
  const out = [];
  const catalogo = catalogoPeriodici();
  for (const cliente of clienti) {
    if (!clienteGeneraScadenze(cliente, anno)) continue;
    const flags = flagsAttivi(cliente);
    const esclusiTerzi = contabilitaDaTerzi(cliente) ? new Set(configContabTerzi().periodiciEsclusi) : null;
    for (const def of catalogo) {
      if (!flags[def.flag]) continue;
      if (esclusiTerzi && esclusiTerzi.has(def.id)) continue;
      for (const d of def.dates) {
        const dataISO = dataScadenza(anno, d.m, d.g);
        const admNome = d.nota;
        const k = chiaveScadenza(dataISO, cliente.id, admNome);
        const salvato = vecchie[k];
        const dataEff = applicaProroga(dataISO, cliente.id, def.nome);
        out.push(applicaFasiScadenza({
          id: k, data: dataEff, dataOriginale: dataISO, prorogata: dataEff !== dataISO, clienteId: cliente.id, famiglia: 'periodico',
          tipo: def.nome, nome: admNome,
          responsabile: (salvato && salvato.responsabile) || cliente.responsabileStudio || '',
          stato: (salvato && salvato.stato) || 'Da fare',
          nota: (salvato && salvato.nota) || '',
          dataCompletamento: (salvato && salvato.dataCompletamento) || null,
          importo: (salvato && salvato.importo != null) ? salvato.importo : null,
          solleciti: (salvato && salvato.solleciti) || [],
          annotazioni: (salvato && salvato.annotazioni) || [],
        }, salvato, def.info));
      }
    }
    /* Nota: "Diritto camerale" NON genera più una scadenza periodica qui — vive solo
       nell'adempimento annuale DIRITTO_CAMERALE (con sotto-task Predisposizione/Invio F24),
       che calcola comunque la data in automatico da cliente.dirittoCameraleScelta tramite
       SCADENZA_DINAMICA_ANNUALE, esattamente come prima ma senza comparire due volte. */

    /* Saldo/I acconto imposte sui redditi (+ II acconto fisso 30/11) — e le voci INPS che per
       legge seguono lo stesso termine (Artig/Comm eccedente, Gestione Separata). La data del
       saldo/I acconto è scelta per singolo cliente (proroghe ISA/forfettari cambiano ogni anno). */
    const scelta = cliente.versamentoImposteScelta;
    if (scelta && DATA_PER_SCELTA_VERSAMENTO[scelta]) {
      const infoV = DATA_PER_SCELTA_VERSAMENTO[scelta];
      const dataSaldo = dataScadenza(anno, infoV.m, infoV.g);
      const dataIIAcc = dataScadenza(anno, 11, 30);
      const pushVersamento = (tipo, nomeSaldo, nomeIIAcc) => {
        [[dataSaldo, nomeSaldo], [dataIIAcc, nomeIIAcc]].forEach(([dataISO, nome]) => {
          const k = chiaveScadenza(dataISO, cliente.id, nome);
          const salvato = vecchie[k];
          out.push(applicaFasiScadenza({
            id: k, data: dataISO, clienteId: cliente.id, famiglia: 'periodico',
            tipo, nome,
            responsabile: (salvato && salvato.responsabile) || cliente.responsabileStudio || '',
            stato: (salvato && salvato.stato) || 'Da fare',
            nota: (salvato && salvato.nota) || '',
            dataCompletamento: (salvato && salvato.dataCompletamento) || null,
            importo: (salvato && salvato.importo != null) ? salvato.importo : null,
            solleciti: (salvato && salvato.solleciti) || [],
            annotazioni: (salvato && salvato.annotazioni) || [],
          }, salvato, INFO_FASI_SINTETIZZATE));
        });
      };
      pushVersamento('Saldo e acconto imposte sui redditi',
        `Saldo e I acconto imposte sui redditi (${scelta})`, 'II acconto imposte sui redditi');
      if (flags.inpsArtigComm) {
        pushVersamento('INPS Artig/Comm - eccedente',
          `Saldo e I acc. eccedente Artig/Comm (${scelta})`, 'II acc. eccedente Artig/Comm');
      }
      if (flags.inpsGestSeparata) {
        pushVersamento('INPS Gestione Separata',
          `Saldo e I acconto Gestione Separata (${scelta})`, 'II acconto Gestione Separata');
      }
    }
  }
  out.sort((a, b) => a.data.localeCompare(b.data) || a.clienteId.localeCompare(b.clienteId));
  return out;
}

function calcolaScadenzeRitenute(righe) {
  const perCliente = new Map();
  righe.forEach(r => {
    // Una riga senza data pagamento è un placeholder (fattura emessa, non ancora pagata dal
    // cliente): resta visibile in elenco come promemoria ma non entra nel calcolo del cumulo/
    // scadenza F24 finché non le si imposta una data pagamento (vedi azione "rit-imposta-pagamento").
    if (!r.dataPagamento) return;
    if (!perCliente.has(r.clienteId)) perCliente.set(r.clienteId, []);
    perCliente.get(r.clienteId).push(r);
  });
  const scadenzaPerRigaId = {};
  const inAttesaPerRigaId = {};
  perCliente.forEach(righeCliente => {
    const perMese = new Map();
    righeCliente.forEach(r => {
      const d = new Date(r.dataPagamento + 'T00:00:00');
      const key = d.getFullYear() * 12 + d.getMonth();
      if (!perMese.has(key)) perMese.set(key, []);
      perMese.get(key).push(r);
    });
    const mesiOrdinati = Array.from(perMese.keys()).sort((a, b) => a - b);
    const flush = (batch, meseChiave) => {
      const annoBase = Math.floor(meseChiave / 12);
      const meseBase = meseChiave % 12;
      const base = new Date(annoBase, meseBase + 1, 1);
      const giorno = base.getMonth() === 7 ? 20 : 16;
      const scad = dataScadenza(base.getFullYear(), base.getMonth() + 1, giorno);
      batch.forEach(r => { scadenzaPerRigaId[r.id] = scad; });
    };
    let batch = [], totBatch = 0;
    for (const key of mesiOrdinati) {
      const righeMese = perMese.get(key);
      batch = batch.concat(righeMese);
      totBatch += righeMese.reduce((s, r) => s + (Number(r.importo) || 0), 0);
      const isDicembre = (key % 12) === 11;
      if (totBatch >= SOGLIA_CUMULO_RITENUTE || isDicembre) { flush(batch, key); batch = []; totBatch = 0; }
    }
    batch.forEach(r => { inAttesaPerRigaId[r.id] = true; });
  });
  return { scadenzaPerRigaId, inAttesaPerRigaId };
}

function generaScadenzeRitenute(righe, vecchie) {
  vecchie = vecchie || {};
  const { scadenzaPerRigaId, inAttesaPerRigaId } = calcolaScadenzeRitenute(righe);
  const gruppi = new Map();
  righe.forEach(r => {
    const scad = scadenzaPerRigaId[r.id];
    if (!scad) return;
    const key = scad + '|' + r.clienteId;
    if (!gruppi.has(key)) gruppi.set(key, { data: scad, clienteId: r.clienteId, righe: [] });
    gruppi.get(key).righe.push(r);
  });
  const out = [];
  for (const { data, clienteId, righe: righeGruppo } of gruppi.values()) {
    const tutteChiuse = righeGruppo.every(r => ['Pagata','Inviata'].includes(r.statoRit));
    const nota = righeGruppo.map(r => `${r.percipiente} - ${(Number(r.importo)||0).toLocaleString('it-IT',{minimumFractionDigits:2})} EUR`).join('; ');
    const nomeAdm = 'Versamento ritenuta autonomi';
    const k = chiaveScadenza(data, clienteId, nomeAdm);
    const salvato = vecchie[k];
    out.push(applicaFasiScadenza({
      id: k, data, clienteId, famiglia: 'periodico', tipo: nomeAdm, nome: nomeAdm,
      responsabile: (salvato && salvato.responsabile) || '',
      stato: tutteChiuse ? 'Inviato telematicamente' : ((salvato && salvato.stato) || 'Da fare'),
      nota, dataCompletamento: (salvato && salvato.dataCompletamento) || null,
      importo: righeGruppo.reduce((s, r) => s + (Number(r.importo) || 0), 0),
      solleciti: (salvato && salvato.solleciti) || [],
    }, salvato, INFO_FASI_SINTETIZZATE));
  }
  return { scadenze: out, inAttesaPerRigaId };
}

/* Alcuni adempimenti annuali non hanno una scadenza fissa in catalogo (scadenzaDefault) ma una
   che dipende da una scelta specifica del cliente — es. il Diritto camerale segue la data scelta
   per il versamento imposte (cliente.dirittoCameraleScelta), proprio come faceva prima la
   scadenza periodica equivalente (ora rimossa per evitare la doppia comparsa). */
const SCADENZA_DINAMICA_ANNUALE = {
  DIRITTO_CAMERALE: (cliente, anno) => {
    const info = cliente.dirittoCameraleScelta && DATA_PER_SCELTA_DC[cliente.dirittoCameraleScelta];
    return info ? dataScadenza(anno, info.m, info.g) : null;
  },
};
/* ADEMPIMENTI ANNUALI AUTOMATICI: ogni adempimento del catalogo ha una regola (tipo di cliente + regime
   fiscale) che dice se il cliente ne ha l'obbligo. Un cliente senza tipo/regime compilato non ne riceve
   di basati su quel dato (resta "da completare"). Sono modificabili a mano cliente per cliente:
   - una voce spuntata a mano che la regola non prevede  -> cliente.adempimentiAnnualiApplicabili
   - una voce che la regola prevede ma è stata tolta     -> cliente.adempimentiAnnualiEsclusi
   Voci senza regola (5 per mille, RUNTS, affiliazione...) restano solo manuali. */
const REGIMI_FORFETTARI = ['Forfettario', 'Forfettario L.398/91'];
const TIPI_SOCIETA = ['societa_capitali', 'societa_persone', 'cooperativa', 'impresa_sociale'];
const TIPI_BILANCIO = ['societa_capitali', 'cooperativa', 'impresa_sociale'];
function eSostitutoImposta(c) {
  // 770 e CU: tutte le società, le associazioni (se operano ritenute: altrimenti si segna "non dovuto") e gli ordinari/semplificati; escluse persone fisiche e forfettari
  if (c.tipo === 'persona_fisica') return false;
  if (c.tipo === 'associazione') return true;
  if (REGIMI_FORFETTARI.includes(c.regimeFiscale)) return false;
  return TIPI_SOCIETA.includes(c.tipo) || c.regimeFiscale === 'Semplificato' || c.regimeFiscale === 'Ordinario';
}
const REGOLE_ANNUALI_AUTO = {
  '770': eSostitutoImposta,
  'CU': eSostitutoImposta,
  'DICH_IVA_ANNUALE': c => ['Ordinario', 'Semplificato'].includes(c.regimeFiscale),
  // iscritti al Registro delle Imprese: tutte le società; le ditte individuali solo se il cliente è indicato come iscritto
  'DIRITTO_CAMERALE': c => TIPI_SOCIETA.includes(c.tipo) || (c.tipo === 'ditta_individuale' && c.iscrittoRegistroImprese === 'SI'),
  'BILANCIO': c => TIPI_BILANCIO.includes(c.tipo),
  'VIDIMAZIONE_LIBRI': c => TIPI_BILANCIO.includes(c.tipo),
  'REDDITI_FORFETTARI': c => c.regimeFiscale === 'Forfettario',
  'REDDITI_SEMPLIFICATI': c => c.regimeFiscale === 'Semplificato',
  'REDDITI_ORDINARI': c => c.regimeFiscale === 'Ordinario',
  'REDDITI_ENC': c => c.tipo === 'associazione' || c.regimeFiscale === 'Ente non commerciale' || c.regimeFiscale === 'Forfettario L.398/91',
  'MODELLO_EAS': c => c.tipo === 'associazione',
  'RENDICONTO_ASSOCIAZIONE': c => c.tipo === 'associazione',
  'RENDICONTO_398': c => c.regimeFiscale === 'Forfettario L.398/91',
  'REVISIONE_COOPERATIVA': c => c.tipo === 'cooperativa',
  'FONDI_MUTUALISTICI': c => c.tipo === 'cooperativa',
  'BILANCIO_SOCIALE': c => c.tipo === 'impresa_sociale',
};
/* Adempimenti che possono risultare "non dovuti" in un dato anno: senza ritenute operate non c'è 770 né CU. */
const ADEMPIMENTI_NON_DOVUTO_POSSIBILE = ['770', 'CU'];
function annualeAutomatico(c, chiave) {
  const r = REGOLE_ANNUALI_AUTO[chiave];
  return !!(r && c && r(c));
}
function annualiEffettivi(c) {
  const set = new Set(c.adempimentiAnnualiApplicabili || []);
  catalogoAnnualeTutti().forEach(d => { if (annualeAutomatico(c, d.chiave)) set.add(d.chiave); });
  (c.adempimentiAnnualiEsclusi || []).forEach(k => set.delete(k));
  return Array.from(set);
}
function generaAdempimentiAnnuali(clienti, anno, vecchie) {
  vecchie = vecchie || {};
  const out = [];
  for (const cliente of clienti) {
    if (!clienteGeneraScadenze(cliente, anno)) continue;
    const applicabili = annualiEffettivi(cliente);
    for (const chiave of applicabili) {
      const def = catalogoAnnualeTutti().find(a => a.chiave === chiave);
      if (!def || def.attivo === false) continue;
      const k = `${anno}|${cliente.id}|${def.chiave}`;
      const salvato = vecchie[k];
      if (salvato && salvato.ceduto) continue; // passato al nuovo commercialista: non più in carico allo studio
      const sottoSalvati = (salvato && salvato.sotto) || {};
      const altFasi = contabilitaDaTerzi(cliente) ? (configContabTerzi().sotto[def.chiave] || []) : [];
      /* Responsabili a cascata: la ditta ha il suo responsabile (cliente.responsabileStudio); l'adempimento ha quello
         scelto sul singolo adempimento oppure quello predefinito del TIPO (Impostazioni > Responsabili), altrimenti
         quello della ditta; le fasi seguono l'adempimento, salvo che la singola fase abbia un responsabile suo. */
      const respAdemp = (salvato && salvato.responsabile) || def.responsabileDefault || cliente.responsabileStudio || '';
      const sotto = (altFasi.length ? altFasi : def.sotto).map(nomeSotto => ({
        nome: nomeSotto,
        completato: !!(sottoSalvati[nomeSotto] && sottoSalvati[nomeSotto].completato),
        data: (sottoSalvati[nomeSotto] && sottoSalvati[nomeSotto].data) || null,
        responsabile: (sottoSalvati[nomeSotto] && sottoSalvati[nomeSotto].responsabile) || respAdemp,
        completatoDa: (sottoSalvati[nomeSotto] && sottoSalvati[nomeSotto].completato && sottoSalvati[nomeSotto].completatoDa) || null,
      }));
      /* SAL a fasi sequenziali: una fase è "pronta" quando tutte le precedenti sono completate, "in attesa"
         finché ce n'è una precedente aperta. Serve a chi lavora a valle (es. predisposizione fascicolo di
         bilancio) per sapere quando può partire, e a chi sta a monte per sapere chi aspetta. */
      let primaAperta = -1;
      if (salvato && salvato.nonDovuto && ADEMPIMENTI_NON_DOVUTO_POSSIBILE.includes(def.chiave)) primaAperta = -2;
      sotto.forEach((x, i) => { if (!x.completato && primaAperta === -1) primaAperta = i; x.fase = x.completato ? 'completata' : (i === primaAperta ? 'pronta' : 'attesa'); });
      const nCompletati = sotto.filter(s => s.completato).length;
      /* "Non dovuto" (es. 770/CU senza ritenute operate nell'anno): l'adempimento resta in elenco come traccia
         della verifica fatta, ma conta come chiuso e non genera lavoro. */
      const nonDovuto = !!(salvato && salvato.nonDovuto) && ADEMPIMENTI_NON_DOVUTO_POSSIBILE.includes(def.chiave);
      const resolverDinamico = SCADENZA_DINAMICA_ANNUALE[def.chiave];
      const scadenzaOrig = def.scadenzaDefault ? dataScadenza(anno, def.scadenzaDefault.m, def.scadenzaDefault.g)
        : (resolverDinamico ? resolverDinamico(cliente, anno) : null);
      const scadenzaDefault = scadenzaOrig ? applicaProroga(scadenzaOrig, cliente.id, def.nome) : scadenzaOrig;
      out.push({
        id: k, anno, clienteId: cliente.id, tipoChiave: def.chiave, tipoNome: def.nome, tipo: def.tipo || TIPO_ADEMPIMENTO_DEFAULT,
        responsabile: respAdemp,
        scadenza: (salvato && salvato.scadenza) || scadenzaDefault,
        nota: (salvato && salvato.nota) || '',
        sotto,
        faseCorrente: primaAperta >= 0 ? { idx: primaAperta, nome: sotto[primaAperta].nome, responsabile: sotto[primaAperta].responsabile } : null,
        percentuale: nonDovuto ? 100 : (sotto.length ? Math.round((nCompletati / sotto.length) * 100) : 0),
        completato: nonDovuto || (sotto.length > 0 && nCompletati === sotto.length),
        nonDovuto, nonDovutoDa: nonDovuto ? (salvato.nonDovutoDa || null) : null, nonDovutoData: nonDovuto ? (salvato.nonDovutoData || null) : null,
      });
    }
  }
  return out;
}

function classificaScadenze(scadenze, oggiISO) {
  const scaduti = [], inScadenza = [], futuri = [], completati = [];
  for (const s of scadenze) {
    const chiuso = STATI_SCADENZA_CHIUSI.includes(s.stato);
    if (chiuso) { completati.push(s); continue; }
    const delta = giorniTra(oggiISO, s.data);
    if (delta < 0) scaduti.push(s);
    else if (delta <= 30) inScadenza.push(s);
    else futuri.push(s);
  }
  return { scaduti, inScadenza, futuri, completati };
}
function giorniTra(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

