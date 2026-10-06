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

const FILE_CODICE = ['gestionale.htm', 'server.js', 'portale-cliente.htm', 'portale-sw.js', 'package.json', 'versione.json', 'Prisma.mcpb'];
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
    for (const f of FILE_CODICE) {
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

function statoLicenza(cartella) {
  const filePub = path.join(cartella, 'licensing', 'chiave-pubblica.pem');
  const fileLib = path.join(cartella, 'licensing', 'lib.js');
  if (!fs.existsSync(filePub) || !fs.existsSync(fileLib)) return { richiesta: false, valida: true };
  const lib = require(fileLib);
  const fingerprint = lib.calcolaFingerprint();
  const fileLic = path.join(cartella, 'license.json');
  if (!fs.existsSync(fileLic)) return { richiesta: true, valida: false, motivo: 'Prisma non è ancora attivato su questo computer.', fingerprint };
  let grezza;
  try { grezza = JSON.parse(fs.readFileSync(fileLic, 'utf8')); } catch (e) {
    return { richiesta: true, valida: false, motivo: 'Il file di licenza presente è illeggibile.', fingerprint };
  }
  const esito = lib.verificaLicenza(grezza, fs.readFileSync(filePub, 'utf8'));
  if (!esito.valida) return { richiesta: true, valida: false, motivo: 'Licenza non valida: ' + esito.motivo + '.', fingerprint };
  return { richiesta: true, valida: true, studio: esito.dati.studio, scadenza: esito.dati.scadenza || null, fingerprint };
}

function installaLicenza(cartella, testo) {
  let grezza;
  try { grezza = JSON.parse(testo); } catch (e) { return { ok: false, errore: 'Il file scelto non è una licenza Prisma valida (non è leggibile).' }; }
  const filePub = path.join(cartella, 'licensing', 'chiave-pubblica.pem');
  const fileLib = path.join(cartella, 'licensing', 'lib.js');
  if (!fs.existsSync(filePub) || !fs.existsSync(fileLib)) return { ok: false, errore: 'Installazione incompleta: manca il modulo licenze. Reinstalla Prisma.' };
  const lib = require(fileLib);
  const esito = lib.verificaLicenza(grezza, fs.readFileSync(filePub, 'utf8'));
  if (!esito.valida) return { ok: false, errore: 'Licenza non valida: ' + esito.motivo + '.' };
  fs.writeFileSync(path.join(cartella, 'license.json'), JSON.stringify(grezza, null, 2), 'utf8');
  return { ok: true, studio: esito.dati.studio, scadenza: esito.dati.scadenza || null };
}

module.exports = { sincronizzaPayload, statoLicenza, installaLicenza, confrontaVersioni, leggiVersione };
