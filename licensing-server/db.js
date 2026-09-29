/*
 * ============================================================================
 *  DB-LICENZE - registro delle licenze Prisma vendute online
 * ============================================================================
 *  File JSON con scrittura atomica (stesso schema di scriviDati() in server.js:
 *  scrivi su un .tmp, poi rinomina - mai un file "a metà" se il processo si
 *  interrompe nel momento sbagliato). Va bene per la scala di questo prodotto
 *  (decine/centinaia di studi clienti, non milioni) - se un giorno servirà
 *  concorrenza pesante o query complesse, si migra a un vero DB, ma oggi
 *  sarebbe complessità non necessaria (stessa filosofia "zero dipendenze
 *  esterne" del resto di Prisma).
 *
 *  Una riga "licenza" rappresenta UN acquisto/abbonamento:
 *    id                  - uuid interno
 *    codice              - il codice che il cliente inserisce al primo avvio
 *                          (PRISMA-XXXX-XXXX), unico, generato da noi
 *    studio              - nome dello studio (da custom_id PayPal o email)
 *    email               - email del cliente (da PayPal)
 *    fingerprintStudio   - null finché non attivata la prima volta; poi FISSA
 *                          (un codice = uno studio = un PC server, non si
 *                          sposta da solo - un trasferimento legittimo lo fa
 *                          Matteo a mano, azzerando questo campo)
 *    piano               - 'mensile' | 'annuale'
 *    paypalSubscriptionId- id dell'abbonamento PayPal collegato
 *    stato               - 'attiva' | 'sospesa' | 'cancellata'
 *    scadenza            - data (YYYY-MM-DD) fino a cui il piano corrente è
 *                          pagato; il margine di grazia si aggiunge solo nella
 *                          licenza FIRMATA emessa al cliente, non qui
 *    creataIl, attivataIl, ultimoRinnovoIl - date, per tenere traccia
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_DB = path.join(__dirname, 'db-licenze.json');
const FILE_DB_TMP = FILE_DB + '.tmp';

function leggiDb() {
  if (!fs.existsSync(FILE_DB)) return { licenze: [] };
  let dati;
  try {
    dati = JSON.parse(fs.readFileSync(FILE_DB, 'utf8'));
  } catch (err) {
    throw new Error('db-licenze.json illeggibile o corrotto: ' + err.message);
  }
  if (!Array.isArray(dati.licenze)) dati.licenze = [];
  return dati;
}

function scriviDb(dati) {
  fs.writeFileSync(FILE_DB_TMP, JSON.stringify(dati, null, 2), 'utf8');
  fs.renameSync(FILE_DB_TMP, FILE_DB);
}

// Formato leggibile/trascrivibile a voce o via email: PRISMA-XXXX-XXXX, esadecimale maiuscolo.
// Non è pensato come segreto crittografico (è la LICENZA firmata, verificata con Ed25519, a dare
// sicurezza vera) - qui basta che sia difficile da indovinare per tentativi casuali e comodo da
// scrivere/leggere per un cliente non tecnico.
function generaCodice() {
  const bytes = crypto.randomBytes(4);
  const hex = bytes.toString('hex').toUpperCase();
  return 'PRISMA-' + hex.slice(0, 4) + '-' + hex.slice(4, 8);
}

function trovaLicenzaPerCodice(codice) {
  const db = leggiDb();
  return db.licenze.find((l) => l.codice === codice) || null;
}

module.exports = { leggiDb, scriviDb, generaCodice, trovaLicenzaPerCodice, FILE_DB };
