/*
 * ============================================================================
 *  LICENSING - Prisma
 * ============================================================================
 *  Modulo condiviso per il sistema di licenze on-prem di Prisma (task #139).
 *  Zero dipendenze esterne, solo librerie native di Node ("crypto" e "os"),
 *  come il resto del progetto (vedi i commenti in cima a server.js).
 *
 *  Cosa fa, in breve:
 *    - calcolaFingerprint(): calcola un identificativo della macchina, stabile
 *      tra un riavvio e l'altro, da mostrare al cliente e da legare alla
 *      licenza.
 *    - generaChiavi(): genera una coppia di chiavi Ed25519 (una volta sola,
 *      da Matteo - vedi genera-chiavi.js).
 *    - firmaLicenza(): firma una licenza con la chiave privata (solo Matteo,
 *      mai distribuita - vedi genera-licenza.js).
 *    - verificaLicenza(): verifica una licenza con la chiave pubblica
 *      (distribuita con Prisma - la usa server.js a ogni avvio).
 *
 *  Perché Ed25519 e non RSA: chiavi e firme molto più corte (comode da
 *  maneggiare/incollare), verifica più veloce, standard moderno supportato
 *  nativamente da Node dalla versione 12 in poi - nessuna libreria esterna.
 * ============================================================================
 */

const crypto = require('crypto');
const os = require('os');

// ---------------------------------------------------------------------------
// Fingerprint della macchina
// ---------------------------------------------------------------------------
// Combina alcuni identificativi hardware/sistema che restano stabili tra un
// riavvio e l'altro (a differenza, per esempio, dell'indirizzo IP o
// dell'uptime): hostname, modello CPU, indirizzo MAC della prima interfaccia
// di rete non-interna (ordinata per nome, per determinismo), piattaforma e
// architettura. Non è un identificativo hardware "da laboratorio forense" -
// è pensato per riconoscere in modo affidabile la STESSA macchina nell'uso
// quotidiano di uno studio professionale, non per resistere a un attacco
// mirato (vedi "limite onesto" nel documento di progetto).
function calcolaFingerprint() {
  const hostname = os.hostname() || '';
  const cpus = os.cpus() || [];
  const modelloCpu = cpus.length ? cpus[0].model : '';
  const interfacce = os.networkInterfaces() || {};
  const nomiOrdinati = Object.keys(interfacce).sort();
  let mac = '';
  for (const nome of nomiOrdinati) {
    const voci = interfacce[nome] || [];
    const voceValida = voci.find(v => v.mac && v.mac !== '00:00:00:00:00:00' && !v.internal);
    if (voceValida) { mac = voceValida.mac; break; }
  }
  const grezzo = [hostname, modelloCpu, mac, os.platform(), os.arch()].join('|');
  const hash = crypto.createHash('sha256').update(grezzo, 'utf8').digest('hex').toUpperCase();
  // Formatta in gruppi di 4 per essere facile da leggere/trascrivere a voce o via email
  // (i primi 24 caratteri esadecimali del digest sono più che sufficienti per l'uso: non è
  // una chiave crittografica, è solo un identificativo da confrontare byte a byte).
  const corto = hash.slice(0, 24);
  return corto.match(/.{1,4}/g).join('-');
}

// ---------------------------------------------------------------------------
// Generazione chiavi (una tantum, la esegue solo Matteo - vedi genera-chiavi.js)
// ---------------------------------------------------------------------------
function generaChiavi() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    chiavePubblica: publicKey.export({ type: 'spki', format: 'pem' }),
    chiavePrivata: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}

// ---------------------------------------------------------------------------
// Firma e verifica licenza
// ---------------------------------------------------------------------------
// Una licenza è un oggetto JSON con campi arbitrari (studio, fingerprint,
// scadenza, moduli...) più un campo "firma": la firma copre una
// rappresentazione testuale CANONICA del resto dei campi (chiavi ordinate
// alfabeticamente, senza spazi) così la verifica è indipendente da come viene
// poi serializzato/riformattato il file .json nel tempo.
function testoCanonico(dati) {
  const chiaviOrdinate = Object.keys(dati).sort();
  const oggettoOrdinato = {};
  for (const k of chiaviOrdinate) oggettoOrdinato[k] = dati[k];
  return JSON.stringify(oggettoOrdinato);
}

function firmaLicenza(dati, chiavePrivataPem) {
  const chiavePrivata = crypto.createPrivateKey(chiavePrivataPem);
  const testo = testoCanonico(dati);
  const firma = crypto.sign(null, Buffer.from(testo, 'utf8'), chiavePrivata);
  return { ...dati, firma: firma.toString('base64') };
}

// Verifica una licenza contro la chiave pubblica e (a meno che si passi
// { ignoraFingerprint: true }, usato solo per diagnostica) contro il
// fingerprint della macchina corrente. Ritorna sempre { valida, motivo,
// dati }: non lancia mai eccezioni per una licenza malformata/scaduta/non
// combaciante, solo per errori di programmazione (parametri assenti).
function verificaLicenza(licenzaConFirma, chiavePubblicaPem, opzioni) {
  opzioni = opzioni || {};
  if (!licenzaConFirma || typeof licenzaConFirma !== 'object') {
    return { valida: false, motivo: 'file di licenza illeggibile o corrotto' };
  }
  const { firma, ...dati } = licenzaConFirma;
  if (!firma) return { valida: false, motivo: 'file di licenza privo di firma' };

  let chiavePubblica;
  try {
    chiavePubblica = crypto.createPublicKey(chiavePubblicaPem);
  } catch (err) {
    return { valida: false, motivo: 'chiave pubblica non valida (file corrotto?)' };
  }

  let firmaValida = false;
  try {
    const testo = testoCanonico(dati);
    firmaValida = crypto.verify(null, Buffer.from(testo, 'utf8'), chiavePubblica, Buffer.from(firma, 'base64'));
  } catch (err) {
    firmaValida = false;
  }
  if (!firmaValida) {
    return { valida: false, motivo: 'firma non valida - il file di licenza è stato modificato o non è autentico' };
  }

  if (dati.scadenza) {
    const scadenza = new Date(dati.scadenza + 'T23:59:59');
    if (!isNaN(scadenza.getTime()) && scadenza.getTime() < Date.now()) {
      return { valida: false, motivo: `licenza scaduta il ${dati.scadenza}`, dati };
    }
  }

  if (!opzioni.ignoraFingerprint) {
    const fingerprintAttuale = calcolaFingerprint();
    if (dati.fingerprint !== fingerprintAttuale) {
      return {
        valida: false,
        motivo: 'questa licenza è associata a un altro computer',
        dati,
        fingerprintAttuale
      };
    }
  }

  return { valida: true, motivo: null, dati };
}

// Verifica solo la firma di un oggetto {..., firma} (senza fingerprint/scadenza): serve per il
// manifesto degli aggiornamenti, firmato da Matteo con la stessa chiave delle licenze.
function verificaFirmaOggetto(oggettoConFirma, chiavePubblicaPem) {
  try {
    if (!oggettoConFirma || typeof oggettoConFirma !== 'object' || !oggettoConFirma.firma) return false;
    const { firma, ...dati } = oggettoConFirma;
    const chiave = crypto.createPublicKey(chiavePubblicaPem);
    return crypto.verify(null, Buffer.from(testoCanonico(dati), 'utf8'), chiave, Buffer.from(firma, 'base64'));
  } catch (err) { return false; }
}

module.exports = { calcolaFingerprint, generaChiavi, firmaLicenza, verificaLicenza, testoCanonico, verificaFirmaOggetto };
