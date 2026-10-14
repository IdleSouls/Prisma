/*
 * Logica di installazione/attivazione di Prisma (senza dipendenze da Electron: testabile da sola).
 *  - sincronizzaPayload(): copia i file dell'app (incorporati nell'installer) nella cartella di lavoro
 *    dell'utente (di norma C:\Users\<nome>\Prisma), SENZA mai toccare i dati (dati-studio.json, backup,
 *    documenti-clienti, license.json, ...). Non sovrascrive una versione piu' nuova scaricata dagli
 *    aggiornamenti automatici.
 *  - statoLicenza(): dice se serve una licenza e se quella presente e' valida.
 *  - installaLicenza(): verifica un license.json scelto dall'utente e lo salva.
 */
const fs = require('fs');
const path = require('path');

const RE_CODICE_DIVISO = /^(gestionale\.css|gestionale-\d\d-[a-z0-9-]+\.js)$/; // pagina divisa in file (dal 1.26)
const FILE_CODICE_BASE = ['gestionale.htm', 'server.js', 'portale-cliente.htm', 'portale-sw.js', 'package.json', 'versione.json', 'Prisma.mcpb'];
function elencoCodice(cartella) { let extra = []; try { extra = fs.readdirSync(cartella).filter((f) => RE_CODICE_DIVISO.test(f)); } catch (e) { /* ignorato */ } return FILE_CODICE_BASE.concat(extra); }
const CARTELLE_CODICE = ['asset', 'logo', 'Documenti-Prisma', 'mcp-server'];
const FILE_LICENSING = ['lib.js', 'chiave-pubblica.pem'];

function leggiVersione(cartella) {
  try { return JSON.parse(fs.readFileSync(path.join(cartella, 'versione.json'), 'utf8')).versione || '0.0.0'; } catch (e) { return null; }
}
function confrontaVersioni(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function sincronizzaPayload(payload, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const vPayload = leggiVersione(payload);
  const vLocale = leggiVersione(dest);
  // Copia il codice se: prima installazione, oppure l'installer e' piu' recente di quanto c'e' gia'.
  const aggiorna = vLocale === null || confrontaVersioni(vPayload, vLocale) > 0;
  const esito = { aggiornato: false, versionePayload: vPayload, versioneLocale: vLocale };
  if (aggiorna) {
    for (const f of elencoCodice(payload)) {
      const s = path.join(payload, f);
      if (fs.existsSync(s)) fs.cpSync(s, path.join(dest, f), { force: true });
    }
    for (const c of CARTELLE_CODICE) {
      const s = path.join(payload, c);
      if (fs.existsSync(s)) fs.cpSync(s, path.join(dest, c), { recursive: true, force: true });
    }
    esito.aggiornato = true;
  }
  // licensing/ (solo librerie e chiave PUBBLICA): sempre allineata, e' quella che fa da "cancello".
  const dLic = path.join(dest, 'licensing');
  fs.mkdirSync(dLic, { recursive: true });
  for (const f of FILE_LICENSING) {
    const s = path.join(payload, 'licensing', f);
    if (fs.existsSync(s)) fs.cpSync(s, path.join(dLic, f), { force: true });
  }
  return esito;
}

// chiavePem: chiave pubblica INCORPORATA nell'app (non modificabile dall'utente). Se assente (uso
// portable/interno) si usa il file nella cartella, come prima.
function chiavePubblicaDa(cartella, chiavePem) {
  if (chiavePem) return chiavePem;
  const filePub = path.join(cartella, 'licensing', 'chiave-pubblica.pem');
  return fs.existsSync(filePub) ? fs.readFileSync(filePub, 'utf8') : null;
}

function statoLicenza(cartella, chiavePem, cartellaDati) {
  cartellaDati = cartellaDati || cartella;
  const fileLib = path.join(cartella, 'licensing', 'lib.js');
  const pem = chiavePubblicaDa(cartella, chiavePem);
  if (!pem || !fs.existsSync(fileLib)) return { richiesta: false, valida: true };
  const lib = require(fileLib);
  const fingerprint = lib.calcolaFingerprint();
  const fileLic = path.join(cartellaDati, 'license.json');
  if (!fs.existsSync(fileLic)) return { richiesta: true, valida: false, motivo: 'Prisma non è ancora attivato su questo computer.', fingerprint };
  let grezza;
  try { grezza = JSON.parse(fs.readFileSync(fileLic, 'utf8')); } catch (e) {
    return { richiesta: true, valida: false, motivo: 'Il file di licenza presente è illeggibile.', fingerprint };
  }
  const esito = lib.verificaLicenza(grezza, pem);
  if (!esito.valida) return { richiesta: true, valida: false, motivo: 'Licenza non valida: ' + esito.motivo + '.', fingerprint };
  return { richiesta: true, valida: true, studio: esito.dati.studio, scadenza: esito.dati.scadenza || null, fingerprint };
}

function installaLicenza(cartella, testo, chiavePem, cartellaDati) {
  cartellaDati = cartellaDati || cartella;
  let grezza;
  try { grezza = JSON.parse(testo); } catch (e) { return { ok: false, errore: 'Il file scelto non è una licenza Prisma valida (non è leggibile).' }; }
  const fileLib = path.join(cartella, 'licensing', 'lib.js');
  const pem = chiavePubblicaDa(cartella, chiavePem);
  if (!pem || !fs.existsSync(fileLib)) return { ok: false, errore: 'Installazione incompleta: manca il modulo licenze. Reinstalla Prisma.' };
  const lib = require(fileLib);
  const esito = lib.verificaLicenza(grezza, pem);
  if (!esito.valida) return { ok: false, errore: 'Licenza non valida: ' + esito.motivo + '.' };
  fs.mkdirSync(cartellaDati, { recursive: true });
  fs.writeFileSync(path.join(cartellaDati, 'license.json'), JSON.stringify(grezza, null, 2), 'utf8');
  return { ok: true, studio: esito.dati.studio, scadenza: esito.dati.scadenza || null };
}

// ---------------------------------------------------------------------------------------------
// Installazione guidata: disposizione delle cartelle di lavoro
// ---------------------------------------------------------------------------------------------
//   <radice>/Applicazione        il programma (si aggiorna da solo: non toccare)
//   <radice>/Dati                dati dello studio, licenza e impostazioni
//   <radice>/Documenti clienti   i file dei clienti
//   <radice>/Backup              copie di sicurezza automatiche
//   <radice>/Log                 registro tecnico (utile in caso di assistenza)
function layoutDa(radice) {
  return {
    radice,
    codice: path.join(radice, 'Applicazione'),
    dati: path.join(radice, 'Dati'),
    documenti: path.join(radice, 'Documenti clienti'),
    backup: path.join(radice, 'Backup'),
    log: path.join(radice, 'Log')
  };
}
// Installazione "piatta" (come sempre): tutto nella stessa cartella.
function layoutPiatto(cartella) {
  return { radice: cartella, codice: cartella, dati: cartella, documenti: path.join(cartella, 'documenti-clienti'), backup: path.join(cartella, 'backup'), log: path.join(cartella, 'logs'), piatto: true };
}
const LEGGIMI_RADICE = [
  'PRISMA - la tua cartella di lavoro',
  '===================================',
  '',
  'Applicazione      Il programma. Si aggiorna da solo: non spostare né cancellare nulla qui dentro.',
  'Dati              I dati dello studio (clienti, scadenze...), la licenza e le impostazioni.',
  '                  E\' la cartella più preziosa: non va mai toccata a mano.',
  'Documenti clienti I file caricati per ogni cliente, una cartella per cliente.',
  'Backup            Copie di sicurezza automatiche (dati, documenti, impostazioni).',
  '                  Per sicurezza, imposta anche una copia su un secondo disco da Prisma > Impostazioni > Backup.',
  'Log               Registro tecnico: serve solo se devi chiedere assistenza.',
  ''
].join('\r\n');

function validaPreset(p, idModuliValidi) {
  const testo = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!p || typeof p !== 'object') return 'Dati di configurazione mancanti.';
  if (!testo(p.studio, 120)) return 'Inserisci il nome dello studio.';
  if (!testo(p.master, 80)) return 'Inserisci il tuo nome.';
  if (!Array.isArray(p.moduli) || p.moduli.some(m => !idModuliValidi.includes(m))) return 'Elenco moduli non valido.';
  const collab = Array.isArray(p.collab) ? p.collab : [];
  const nomi = [p.master.trim()];
  for (const c of collab) {
    if (!c || !testo(c.nome, 80)) continue;
    nomi.push(c.nome.trim());
    if (c.ruolo !== 'admin' && c.ruolo !== 'limitato') return 'Ruolo di un collaboratore non valido.';
    if (!Array.isArray(c.moduli) || c.moduli.some(m => !idModuliValidi.includes(m))) return 'Moduli di un collaboratore non validi.';
  }
  if (new Set(nomi.map(n => n.toLowerCase())).size !== nomi.length) return 'Ci sono due utenti con lo stesso nome.';
  return null;
}

// Fa tutto il lavoro dell'installazione guidata. Non lancia eccezioni "di programma" per input
// sbagliati: ritorna { ok:false, errore }. Se la cartella scelta contiene già un'installazione
// (dati-studio.json) la rifiuta: non si installa mai sopra dati esistenti.
function installaCompleta({ payload, radice, licenzaTesto, chiavePem }) {
  if (!radice || !path.isAbsolute(radice)) return { ok: false, errore: 'Scegli una cartella di lavoro valida.' };
  const L = layoutDa(radice);
  if (fs.existsSync(path.join(L.dati, 'dati-studio.json'))) return { ok: false, errore: 'In questa cartella c\'è già un\'installazione di Prisma con dei dati. Scegli un\'altra cartella.' };
  try {
    for (const d of [L.radice, L.codice, L.dati, L.documenti, L.backup, L.log]) fs.mkdirSync(d, { recursive: true });
    fs.accessSync(L.radice, fs.constants.W_OK);
  } catch (e) { return { ok: false, errore: 'Non riesco a creare le cartelle in "' + radice + '": ' + e.message }; }
  // Prima la licenza (verificata con la libreria dell'installer, scritta nella cartella Dati), poi i file.
  const lic = installaLicenza(payload, licenzaTesto, chiavePem, L.dati);
  if (!lic.ok) return lic;
  try {
    sincronizzaPayload(payload, L.codice);
    fs.writeFileSync(path.join(L.radice, 'LEGGIMI.txt'), LEGGIMI_RADICE, 'utf8');
  } catch (e) { return { ok: false, errore: 'Copia dei file di Prisma non riuscita: ' + e.message }; }
  return { ok: true, layout: L, studio: lic.studio, scadenza: lic.scadenza };
}

module.exports = { sincronizzaPayload, statoLicenza, installaLicenza, confrontaVersioni, leggiVersione, layoutDa, layoutPiatto, validaPreset, installaCompleta };
