#!/usr/bin/env node
/*
 * ============================================================================
 *  GENERA-LICENZA - Prisma licensing
 * ============================================================================
 *  Tool a riga di comando per Matteo: emette una licenza firmata per un
 *  cliente, legata a un fingerprint macchina specifico.
 *
 *  Uso base (il caso più comune - il cliente ti ha mandato il suo fingerprint,
 *  mostrato dall'installer al primo avvio sulla sua macchina):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-C3D4-E5F6-7890
 *
 *  Con scadenza (licenza annuale, per esempio):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-C3D4-E5F6-7890 --scadenza 2027-12-31
 *
 *  Con moduli abilitati (se in futuro Prisma avrà moduli opzionali):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-... --moduli base,portale,antiriciclaggio
 *
 *  Output: scrive un file "license.json" pronto per essere copiato nella
 *  cartella di installazione del cliente (o pre-caricato su una chiavetta
 *  USB prima di spedirla - vedi installer.js), dentro emesse/<slug>/. Tiene
 *  anche un registro di tutte le licenze emesse finora in
 *  emesse/registro-licenze.json - utile a Matteo come promemoria di chi ha
 *  già una licenza attiva, dato che non c'è un server centrale che lo tenga
 *  automaticamente (scelta di design - vedi il documento di progetto).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { firmaLicenza } = require('./lib.js');

const CARTELLA = __dirname;
const FILE_PRIVATA = path.join(CARTELLA, 'chiave-privata.pem');
const CARTELLA_EMESSE = path.join(CARTELLA, 'emesse');
const FILE_REGISTRO = path.join(CARTELLA_EMESSE, 'registro-licenze.json');

function leggiArgomento(nome) {
  const idx = process.argv.indexOf('--' + nome);
  if (idx === -1 || idx === process.argv.length - 1) return null;
  return process.argv[idx + 1];
}

function slug(testo) {
  return testo
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // toglie gli accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const studio = leggiArgomento('studio');
const fingerprint = leggiArgomento('fingerprint');
const scadenza = leggiArgomento('scadenza'); // opzionale, formato YYYY-MM-DD
const moduliArg = leggiArgomento('moduli'); // opzionale, es. "base,portale"

if (!studio || !fingerprint) {
  console.log('');
  console.log('Uso: node genera-licenza.js --studio "Nome Studio" --fingerprint XXXX-XXXX-XXXX-XXXX [--scadenza YYYY-MM-DD] [--moduli base,portale]');
  console.log('');
  process.exit(1);
}

if (!fs.existsSync(FILE_PRIVATA)) {
  console.log('');
  console.log('Non trovo ' + FILE_PRIVATA);
  console.log('Esegui prima "node genera-chiavi.js" (una tantum) per creare la coppia di chiavi.');
  console.log('');
  process.exit(1);
}

const chiavePrivata = fs.readFileSync(FILE_PRIVATA, 'utf8');

const dati = {
  studio,
  fingerprint: fingerprint.toUpperCase(),
  emessaIl: new Date().toISOString().slice(0, 10),
  id: crypto.randomUUID()
};
if (scadenza) dati.scadenza = scadenza;
if (moduliArg) dati.moduli = moduliArg.split(',').map(m => m.trim()).filter(Boolean);

const licenzaFirmata = firmaLicenza(dati, chiavePrivata);

const cartellaCliente = path.join(CARTELLA_EMESSE, slug(studio));
fs.mkdirSync(cartellaCliente, { recursive: true });
const fileLicenza = path.join(cartellaCliente, 'license.json');
fs.writeFileSync(fileLicenza, JSON.stringify(licenzaFirmata, null, 2), 'utf8');

// Aggiorna il registro locale (append-only) - il "chi ha già una licenza" di Matteo
let registro = [];
if (fs.existsSync(FILE_REGISTRO)) {
  try { registro = JSON.parse(fs.readFileSync(FILE_REGISTRO, 'utf8')); } catch (err) { registro = []; }
}
registro.push({ studio, fingerprint: dati.fingerprint, emessaIl: dati.emessaIl, scadenza: scadenza || null, id: dati.id });
fs.writeFileSync(FILE_REGISTRO, JSON.stringify(registro, null, 2), 'utf8');

console.log('');
console.log('Licenza emessa per "' + studio + '".');
console.log('  File: ' + fileLicenza);
console.log('  Fingerprint: ' + dati.fingerprint);
if (scadenza) console.log('  Scadenza: ' + scadenza);
console.log('');
console.log('Prossimo passo: copia questo file "license.json" nella cartella di');
console.log('installazione di Prisma sul PC del cliente (accanto a server.js), oppure');
console.log('precaricalo sulla chiavetta USB prima di prepararla per questo cliente.');
console.log('');
