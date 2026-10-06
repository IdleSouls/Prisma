/*
 * ============================================================================
 *  INSTALLER - Prisma (chiavetta USB one-time-use)
 * ============================================================================
 *  Questo è il codice che gira quando il cliente fa doppio click sulla
 *  chiavetta USB brandizzata Prisma. In sviluppo/test si esegue con
 *  "node installer.js"; per la distribuzione reale va pacchettizzato in un
 *  .exe con Node.js Single Executable Applications - vedi le istruzioni in
 *  fondo a questo file (COME PACCHETTIZZARE), da eseguire su Windows.
 *
 *  Cosa si aspetta di trovare ACCANTO A SÉ sulla chiavetta (nella stessa
 *  cartella, che sia __dirname in modalità sviluppo o la cartella del .exe
 *  in modalità pacchettizzata):
 *    - lib.js                    (obbligatorio: fingerprint + verifica firma)
 *    - chiave-pubblica.pem       (obbligatorio: per verificare una eventuale
 *                                  licenza precaricata)
 *    - gestionale.htm, portale-cliente.htm, mcp-server/, logo/, asset/
 *                                 (l'app da copiare sul PC del cliente)
 *    - Prisma.exe                (facoltativo ma consigliato: l'app desktop
 *                                  già costruita con Electron - finestra +
 *                                  icona nella barra di sistema. Se assente,
 *                                  si copiano server.js + Avvia Gestionale.bat
 *                                  e si avvisa che serve Node.js installato)
 *    - license.json               (facoltativo: se Matteo ha già preparato
 *                                  questa chiavetta su misura per un cliente
 *                                  specifico, l'attivazione è automatica)
 *
 *  Cosa fa, in ordine:
 *    1) Controlla se la chiavetta è già stata usata (attivazione.json) - se
 *       sì, si ferma subito, non tocca il PC del cliente, mostra il
 *       certificato.
 *    2) Copia i file dell'app in una cartella locale sul PC del cliente.
 *    3) Calcola il fingerprint del PC del cliente.
 *    4) Se c'è già una licenza precaricata sulla chiavetta e il fingerprint
 *       combacia, la applica subito. Altrimenti mostra il fingerprint e le
 *       istruzioni per richiedere la licenza a Matteo (anche su file, sia
 *       sulla chiavetta che nella cartella installata, per non perderle).
 *    5) Marca la chiavetta come usata e scrive il certificato di attivazione
 *       - da questo momento la chiavetta non installa più nulla, resta solo
 *       come prova d'acquisto/garanzia.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Dove siamo: cartella della chiavetta (dev: accanto a questo script;
// pacchettizzato come SEA: accanto all'eseguibile) e cartella di
// destinazione sul PC del cliente.
// ---------------------------------------------------------------------------
function cartellaChiavetta() {
  try {
    const sea = require('node:sea');
    if (sea && typeof sea.isSea === 'function' && sea.isSea()) {
      return path.dirname(process.execPath);
    }
  } catch (err) {
    // "node:sea" non disponibile o non siamo in un eseguibile pacchettizzato:
    // siamo in esecuzione normale via "node installer.js" (sviluppo/test).
  }
  // Permette di sovrascrivere per i test automatici (vedi test-licensing.js)
  return process.env.PRISMA_INSTALLER_ROOT || __dirname;
}

function cartellaDestinazione() {
  return process.env.PRISMA_INSTALL_DEST || path.join(os.homedir(), 'Prisma');
}

const USB = cartellaChiavetta();
const DEST = cartellaDestinazione();
const FILE_ATTIVAZIONE = path.join(USB, 'attivazione.json');
const FILE_CERTIFICATO = path.join(USB, 'CERTIFICATO.txt');
const FILE_CODICE_MACCHINA = path.join(USB, 'il-tuo-codice-macchina.txt');

function stampa(...righe) {
  console.log('');
  for (const r of righe) console.log(r);
}

/* La finestra della console si chiude da sola appena il programma termina: chi fa doppio clic non
   riuscirebbe a leggere né il codice macchina né un eventuale errore. Per questo, prima di uscire,
   si aspetta sempre un Invio (solo se c'è davvero una console interattiva). */
function aspettaInvio() {
  if (process.env.PRISMA_INSTALLER_TEST) return;
  try {
    console.log('');
    console.log('Premi Invio per chiudere questa finestra...');
    const buf = Buffer.alloc(16);
    fs.readSync(0, buf, 0, 16, null);
  } catch (err) {
    // niente console interattiva (es. eseguito da script): si esce subito
  }
}
function esci(codice) {
  if (process.env.PRISMA_INSTALLER_TEST) return; // i test leggono lo stato invece di terminare il processo
  aspettaInvio();
  process.exit(codice);
}
function scriviLogInstaller(testo) {
  try { fs.appendFileSync(path.join(USB, 'installazione-log.txt'), new Date().toISOString() + ' ' + testo + '\n', 'utf8'); } catch (e) { /* best effort */ }
}

function principale() {
  // ---- Libreria di firma/fingerprint: deve stare accanto a noi sulla chiavetta ----
  const percorsoLib = path.join(USB, 'lib.js');
  if (!fs.existsSync(percorsoLib)) {
    stampa('ERRORE: non trovo "lib.js" sulla chiavetta (' + percorsoLib + ').',
      'La chiavetta sembra incompleta o danneggiata - contatta l\'assistenza.');
    return esci(1);
  }
  // Nell'eseguibile (SEA) "require" accetta solo moduli interni di Node: per caricare lib.js dal disco
  // serve createRequire, che costruisce un require "normale" ancorato a un percorso reale.
  const requireEsterno = require('node:module').createRequire(path.join(USB, 'installer-placeholder.js'));
  const { calcolaFingerprint, verificaLicenza } = requireEsterno(percorsoLib);

  // ---- 1) La chiavetta è già stata usata? ----
  if (fs.existsSync(FILE_ATTIVAZIONE)) {
    let info = {};
    try { info = JSON.parse(fs.readFileSync(FILE_ATTIVAZIONE, 'utf8')); } catch (err) { info = {}; }
    stampa('Questa chiavetta Prisma è già stata attivata' + (info.data ? (' il ' + info.data) : '') +
      (info.studio ? (' per "' + info.studio + '"') : '') + '.',
      'Non installa più nulla: resta come prova d\'acquisto e garanzia.',
      'Per assistenza o per reinstallare Prisma, contatta lo sviluppatore.');
    return esci(0);
  }

  // ---- Controllo preventivo: i file dell'app devono stare accanto a questo programma ----
  const indispensabili = ['gestionale.htm', 'server.js'];
  const mancanti = indispensabili.filter(n => !fs.existsSync(path.join(USB, n)));
  if (mancanti.length) {
    stampa('ERRORE: accanto a questo programma mancano i file dell\'app (' + mancanti.join(', ') + ').',
      'Cartella controllata: ' + USB,
      'Estrai TUTTO lo zip di Prisma in una cartella e avvia "Installa-Prisma.exe" da lì dentro,',
      'senza spostare o copiare il solo file .exe da un\'altra parte.');
    scriviLogInstaller('ERRORE file mancanti in ' + USB + ': ' + mancanti.join(', '));
    return esci(1);
  }

  stampa('Installazione di Prisma in corso... (può richiedere qualche minuto: attendi)');
  scriviLogInstaller('Avvio installazione da ' + USB + ' verso ' + DEST);

  // ---- 2) Copia i file dell'app nella cartella di destinazione ----
  fs.mkdirSync(DEST, { recursive: true });
  const fileDaCopiare = ['gestionale.htm', 'portale-cliente.htm', 'portale-sw.js', 'Prisma.exe', 'server.js', 'package.json', 'versione.json', 'Prisma.mcpb', 'Avvia Gestionale.bat'];
  const cartelleDaCopiare = ['mcp-server', 'logo', 'asset', 'node_modules', 'Documenti-Prisma'];
  let haCopiatoServerEseguibile = false;
  for (const nome of fileDaCopiare) {
    const src = path.join(USB, nome);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DEST, nome), { recursive: true });
      if (nome === 'Prisma.exe') haCopiatoServerEseguibile = true;
    }
  }
  for (const nome of cartelleDaCopiare) {
    const src = path.join(USB, nome);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(DEST, nome), { recursive: true });
  }
  // Libreria di licensing: SOLO i due file necessari a server.js per verificare la licenza
  // a ogni avvio - MAI chiave-privata.pem, genera-chiavi.js o genera-licenza.js, che devono
  // restare esclusivamente sul computer di Matteo.
  const cartellaLicensingDest = path.join(DEST, 'licensing');
  fs.mkdirSync(cartellaLicensingDest, { recursive: true });
  fs.cpSync(percorsoLib, path.join(cartellaLicensingDest, 'lib.js'));
  const percorsoChiavePubblica = path.join(USB, 'chiave-pubblica.pem');
  if (fs.existsSync(percorsoChiavePubblica)) {
    fs.cpSync(percorsoChiavePubblica, path.join(cartellaLicensingDest, 'chiave-pubblica.pem'));
  }

  // ---- 3) Fingerprint di questa macchina ----
  const fingerprint = calcolaFingerprint();

  // ---- 4) Licenza precaricata sulla chiavetta (attivazione automatica) o da richiedere ----
  let studioAttivato = null;
  const percorsoLicenzaUsb = path.join(USB, 'license.json');
  if (fs.existsSync(percorsoChiavePubblica) && fs.existsSync(percorsoLicenzaUsb)) {
    let licenzaGrezza = null;
    try { licenzaGrezza = JSON.parse(fs.readFileSync(percorsoLicenzaUsb, 'utf8')); } catch (err) { licenzaGrezza = null; }
    const chiavePubblica = fs.readFileSync(percorsoChiavePubblica, 'utf8');
    const esito = licenzaGrezza ? verificaLicenza(licenzaGrezza, chiavePubblica) : { valida: false, motivo: 'file license.json illeggibile' };
    if (esito.valida) {
      fs.cpSync(percorsoLicenzaUsb, path.join(DEST, 'license.json'));
      studioAttivato = esito.dati.studio;
      stampa('Licenza attivata automaticamente per "' + studioAttivato + '".');
    } else if (esito.motivo === 'questa licenza è associata a un altro computer') {
      stampa('ATTENZIONE: la licenza precaricata su questa chiavetta è associata a un\'altra macchina.',
        'Non è stata applicata. Il tuo codice macchina è qui sotto: invialo a chi ti ha fornito Prisma',
        'per ricevere una licenza valida per QUESTO computer.');
    } else {
      stampa('ATTENZIONE: la licenza precaricata su questa chiavetta non è valida (' + esito.motivo + ').',
        'Il tuo codice macchina è qui sotto: invialo a chi ti ha fornito Prisma per una nuova licenza.');
    }
  }
  if (!studioAttivato) {
    const istruzioni = [
      'Il tuo codice macchina (da comunicare per attivare Prisma):',
      '',
      '    ' + fingerprint,
      '',
      'Invialo a chi ti ha venduto Prisma: riceverai un file "license.json" da',
      'mettere nella cartella "' + DEST + '", accanto a server.js/Prisma.exe.'
    ];
    stampa(...istruzioni);
    fs.writeFileSync(FILE_CODICE_MACCHINA, istruzioni.join('\n') + '\n', 'utf8');
    fs.writeFileSync(path.join(DEST, 'COME-ATTIVARE.txt'), istruzioni.join('\n') + '\n', 'utf8');
  }

  // ---- 5) Marca la chiavetta come usata + certificato ----
  const adesso = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FILE_ATTIVAZIONE, JSON.stringify({
    usata: true, data: adesso, computer: os.hostname(), studio: studioAttivato, fingerprint
  }, null, 2), 'utf8');
  fs.writeFileSync(FILE_CERTIFICATO, [
    'CERTIFICATO DI ATTIVAZIONE - PRISMA',
    '',
    'Studio: ' + (studioAttivato || '(in attesa di attivazione licenza)'),
    'Data di attivazione: ' + adesso,
    '',
    'Questa chiavetta ha installato Prisma su un computer e non può essere',
    'usata per installarlo su altri computer. Conservala come prova',
    'd\'acquisto e garanzia.',
    '',
    'Per assistenza, contatta chi ti ha venduto Prisma.'
  ].join('\n') + '\n', 'utf8');

  stampa('Fatto. Prisma è stato installato in: ' + DEST,
    haCopiatoServerEseguibile
      ? 'Per usarlo ogni giorno, apri quella cartella e fai doppio click su "Prisma.exe".'
      : 'Per usarlo ogni giorno, apri quella cartella e fai doppio click su "Avvia Gestionale.bat"\n(richiede Node.js installato - il file stesso ti guida se manca).');
  return esci(0);
}

if (require.main === module || (function () { try { return require('node:sea').isSea(); } catch (e) { return false; } })()) {
  try {
    principale();
  } catch (err) {
    stampa('ERRORE durante l\'installazione: ' + (err && err.message ? err.message : err),
      'Nessuna chiavetta è stata marcata come usata: puoi riprovare.',
      'Se il problema persiste, manda il file "installazione-log.txt" (accanto a questo programma) a chi ti ha dato Prisma.');
    scriviLogInstaller('ERRORE: ' + (err && err.stack ? err.stack : err));
    esci(1);
  }
}

module.exports = { principale, cartellaChiavetta, cartellaDestinazione };

/*
 * ============================================================================
 *  COME PACCHETTIZZARE QUESTO FILE IN .exe (Installa-Prisma.exe)
 * ============================================================================
 *  Il modo più semplice: esegui "licensing\Costruisci-Eseguibili.bat" (doppio
 *  click) su un PC Windows con Node.js installato. Usa il comando integrato
 *  di Node, "node --build-sea" (richiede Node.js 25.5+, uscito gennaio 2026:
 *  lo script stesso controlla la versione e ti avvisa se serve aggiornare).
 *  Le versioni precedenti di Node usavano uno strumento esterno, "postject",
 *  che ha un bug noto e MAI risolto ("Multiple occurences of sentinel") su
 *  diverse installazioni Windows - per questo conviene aggiornare Node
 *  piuttosto che inseguirlo.
 *
 *  Procedura manuale, se preferisci farlo a mano invece di usare lo script:
 *    1) Crea licensing/build-sea-installer.json:
 *         { "main": "installer.js", "output": "Installa-Prisma.exe",
 *           "disableExperimentalSEAWarning": true }
 *    2) node --build-sea build-sea-installer.json
 *    3) (facoltativo) Icona personalizzata con un tool come rcedit; firma
 *       con "signtool sign" se hai un certificato - non obbligatorio,
 *       funziona anche senza (la SDK Windows lo segnala solo come "non
 *       firmato", non lo blocca).
 *
 *  NOTA: "Prisma.exe" (il lanciatore quotidiano, con finestra e icona nella
 *  barra di sistema) è un programma diverso, costruito con Electron - vedi
 *  electron-app/Costruisci-Prisma-Desktop.bat.
 * ============================================================================
 */
