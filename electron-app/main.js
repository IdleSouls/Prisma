/*
 * ============================================================================
 *  PRISMA DESKTOP (Electron) - il lanciatore quotidiano "Prisma.exe"
 * ============================================================================
 *  Cosa fa: avvia il server (server.js, lo stesso di sempre) dentro il proprio
 *  processo, apre una finestra vera (niente barra indirizzi, niente schede -
 *  non e' un browser, e' una finestra come qualsiasi altro programma) e mette
 *  un'iconcina nella barra di sistema (vicino all'orologio, in basso a destra).
 *
 *  Comportamento:
 *    - Chiudendo la finestra (la X in alto a destra) la finestra si nasconde,
 *      ma il server resta acceso - l'app "vive" nella barra di sistema.
 *    - Click sull'iconcina: riapre/richiude la finestra.
 *    - Click destro sull'iconcina -> "Chiudi": questo SI' chiude tutto (server
 *      compreso), l'unico modo per spegnere davvero Prisma.
 *
 *  IMPORTANTE: questo file NON contiene l'app (gestionale.htm, server.js,
 *  licensing/, ecc.) - quei file restano dove sono sempre stati, nella
 *  cartella di installazione (di norma la cartella "Prisma" dentro la
 *  cartella utente di Windows, creata da installer.js quando si usa la
 *  chiavetta USB). Questo main.js si limita ad ANDARLI A PRENDERE lì e a
 *  farli partire - cosi' funziona anche quando Prisma.exe viene "portable"
 *  (si scompatta in una cartella temporanea a ogni avvio: non possiamo fare
 *  affidamento sul percorso di Prisma.exe stesso, solo su questo percorso
 *  fisso nella cartella utente).
 *
 *  Questo eseguibile AVVIA SEMPRE IL SERVER (uso di Matteo, sul PC dello
 *  studio). Per i colleghi che devono solo collegarsi da un altro PC, senza
 *  avviare nulla in proprio, c'e' un secondo eseguibile dedicato - vedi
 *  main-collegamento.js / "Prisma Rete.exe".
 * ============================================================================
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, clipboard } = require('electron');
const logica = require('./attivazione-logica.js');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

const PORTA = 8420;
const URL_APP = 'http://localhost:' + PORTA + '/';
// Dove sono gli altri file dell'app (server.js, gestionale.htm, licensing/...):
// SEMPRE la cartella dove si trova FISICAMENTE questo Prisma.exe, non quella in
// cui viene scompattato al volo (electron-builder "portable" lo scompatta in una
// cartella temporanea a ogni avvio, ma imposta questa variabile d'ambiente con
// la posizione vera del file .exe - e' pensata apposta per questo). PRISMA_INSTALL_DEST
// resta disponibile per test automatici o casi particolari.
// MODALITA' INSTALLATA (setup NSIS): i file dell'app sono incorporati nell'installer (cartella
// "payload" accanto all'eseguibile) e vengono copiati al primo avvio in C:\Users\<nome>\Prisma,
// dove vivono anche i dati dello studio. Senza "payload" (Prisma.exe portable di Matteo) il
// comportamento resta quello di sempre.
const PAYLOAD = process.resourcesPath ? path.join(process.resourcesPath, 'payload') : null;
const MODALITA_INSTALLATA = !!(PAYLOAD && fs.existsSync(path.join(PAYLOAD, 'server.js')));
const CARTELLA_INSTALLAZIONE = process.env.PRISMA_INSTALL_DEST
  || (MODALITA_INSTALLATA ? path.join(os.homedir(), 'Prisma') : null)
  || process.env.PORTABLE_EXECUTABLE_DIR
  || path.join(os.homedir(), 'Prisma');
const ICONA = path.join(__dirname, 'icona.ico');
// Chiave pubblica per verificare le licenze: nell'installer sta DENTRO l'app (app.asar), non nella
// cartella dati dove l'utente potrebbe sostituirla. Assente nel Prisma.exe portable di uso interno.
const CHIAVE_PUBBLICA = (() => { try { return fs.readFileSync(path.join(__dirname, 'chiave-pubblica.pem'), 'utf8'); } catch (e) { return null; } })();

// Stesso file di log di server.js (stessa cartella "logs" dentro l'installazione): un problema che
// impedisce persino di arrivare a require(server.js) - es. un bug in questo file, o un crash di
// Electron stesso - altrimenti sparirebbe nel nulla esattamente come e' successo con il controllo
// licenza prima che venisse aggiunto questo log (vedi commento in server.js). Best-effort: se anche
// il log fallisce, non deve mai essere la CAUSA di un crash.
function scriviLogCrash(riga) {
  try {
    const cartellaLog = path.join(CARTELLA_INSTALLAZIONE, 'logs');
    fs.mkdirSync(cartellaLog, { recursive: true });
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fs.appendFileSync(path.join(cartellaLog, 'prisma.log'), '[' + timestamp + '] [app] ' + riga + '\n', 'utf8');
  } catch (err) { /* best-effort */ }
}
process.on('uncaughtException', (err) => {
  scriviLogCrash('ERRORE NON GESTITO: ' + (err && err.stack ? err.stack : err));
  try { dialog.showErrorBox('Prisma - errore imprevisto', String(err && err.message ? err.message : err)); } catch (e2) { /* dialog non disponibile in questa fase */ }
  app.quit();
});

let finestraPrincipale = null;
let tray = null;
let staChiudendoDavvero = false;

// Bug segnalato da Matteo: cliccando l'icona di Prisma appuntata nella barra delle applicazioni
// (con Prisma già aperto) Windows apriva quella che SEMBRAVA una seconda istanza, invece di
// riportare in primo piano quella già attiva - come invece fa Claude desktop, la cui icona
// appuntata risulta "attiva" con un click. La causa non era il single-instance-lock qui sotto
// (quello funziona già: un secondo processo si chiude subito e richiama in primo piano quello
// vero) - il problema è che Prisma.exe è un eseguibile "portable" che si scompatta in una
// cartella TEMPORANEA DIVERSA a ogni avvio (vedi commento in cima al file). Senza un ID
// applicazione esplicito, Windows raggruppa le icone della barra in base al percorso del file
// in esecuzione: ogni lancio, avendo un percorso diverso, viene visto come un programma diverso
// dal punto di vista del taskbar, anche se sotto è davvero la stessa app con lo stesso lock.
// setAppUserModelId (stesso valore di "appId" in build-prisma.json) dice esplicitamente a
// Windows "questi lanci sono tutti la stessa applicazione", a prescindere dal percorso reale -
// va chiamato PRIMA di app.whenReady()/creaFinestra() perché è lì che Windows associa l'ID
// alle finestre create da questo processo.
app.setAppUserModelId('it.studioquadra.prisma');

// Impedisce di avere due Prisma aperti insieme (es. doppio click accidentale, o
// click di nuovo sull'icona mentre e' gia' in esecuzione): il secondo tentativo
// di avvio si chiude subito e fa solo riapparire la finestra di quello già
// acceso, invece di far partire un secondo server sulla stessa porta.
const puoProseguire = app.requestSingleInstanceLock();
if (!puoProseguire) app.quit();

function avviaServer() {
  // Impedisce a server.js di aprire un browser suo: ci pensa questa finestra Electron.
  process.env.PRISMA_SKIP_AUTOOPEN = '1';
  if (CHIAVE_PUBBLICA) process.env.PRISMA_CHIAVE_PUBBLICA = CHIAVE_PUBBLICA; // server.js la usa al posto del file in cartella
  if (MODALITA_INSTALLATA) {
    // jsdom, pdf-lib, web-push stanno nell'installer: li rendiamo visibili a server.js
    // (che vive nella cartella dati) senza doverli copiare.
    process.env.NODE_PATH = path.join(PAYLOAD, 'node_modules') + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
    require('module').Module._initPaths();
  }
  const percorsoServer = path.join(CARTELLA_INSTALLAZIONE, 'server.js');
  require(percorsoServer); // fa partire subito il server HTTP (stesso processo)
}

function attendiServerPronto(callback, tentativiRimasti) {
  if (tentativiRimasti === undefined) tentativiRimasti = 60; // ~15 secondi in tutto
  const richiesta = http.get(URL_APP, (risposta) => {
    risposta.resume(); // consuma la risposta, non ci serve il contenuto qui
    callback(null);
  });
  richiesta.on('error', () => {
    if (tentativiRimasti <= 0) return callback(new Error('Il server non ha risposto in tempo su ' + URL_APP));
    setTimeout(() => attendiServerPronto(callback, tentativiRimasti - 1), 250);
  });
}

function creaFinestra() {
  finestraPrincipale = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Prisma',
    icon: ICONA,
    autoHideMenuBar: true, // niente barra dei menu (File/Modifica/...) in stile browser
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  finestraPrincipale.once('ready-to-show', () => finestraPrincipale.show());
  finestraPrincipale.loadURL(URL_APP);

  // La X non chiude l'app: nasconde la finestra e basta. Il server resta attivo
  // in background - si chiude tutto solo dal menu dell'icona nella barra di sistema.
  finestraPrincipale.on('close', (evento) => {
    if (staChiudendoDavvero) return;
    evento.preventDefault();
    finestraPrincipale.hide();
  });
}

function creaTray() {
  const icona = nativeImage.createFromPath(ICONA);
  tray = new Tray(icona);
  tray.setToolTip('Prisma');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Apri Prisma', click: () => {
        finestraPrincipale.show();
        finestraPrincipale.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Chiudi', click: () => {
        staChiudendoDavvero = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', () => {
    if (finestraPrincipale.isVisible()) finestraPrincipale.hide();
    else { finestraPrincipale.show(); finestraPrincipale.focus(); }
  });
}

if (puoProseguire) {
  // Se Prisma viene rilanciato mentre e' gia' aperto (es. doppio click di nuovo,
  // o click sull'icona), invece di aprire una seconda finestra/server richiama
  // in primo piano quello gia' in esecuzione.
  app.on('second-instance', () => {
    if (!finestraPrincipale) return;
    if (finestraPrincipale.isMinimized()) finestraPrincipale.restore();
    finestraPrincipale.show();
    finestraPrincipale.focus();
  });

  function avviaTutto() {
    scriviLogCrash('Avvio server...');
    try {
      avviaServer();
    } catch (errore) {
      scriviLogCrash('avviaServer() ha lanciato un errore: ' + (errore && errore.stack ? errore.stack : errore));
      if (errore && errore.code === 'MODULE_NOT_FOUND') {
        dialog.showErrorBox('Prisma non si avvia',
          'Non trovo i file dell\'app nella cartella:\n\n' + CARTELLA_INSTALLAZIONE +
          '\n\nAssicurati che "Prisma.exe" si trovi nella stessa cartella di ' +
          '"server.js" e "gestionale.htm" (di norma la cartella "Prisma" dentro ' +
          'la tua cartella utente di Windows).');
      } else {
        dialog.showErrorBox('Prisma non si avvia', 'Si è verificato un problema all\'avvio:\n\n' + errore.message);
      }
      app.quit();
      return;
    }
    attendiServerPronto((errore) => {
      scriviLogCrash(errore ? ('Server non risponde: ' + errore.message) : 'Server pronto, apro la finestra.');
      creaFinestra();
      creaTray();
      if (errore) {
        dialog.showErrorBox('Prisma - avvio lento', 'Il server ci sta mettendo più del solito ad avviarsi.\nSe la finestra resta vuota, chiudi e riprova tra poco.');
      }
    });
  }

  // Schermata di attivazione: Prisma e' installato ma senza licenza valida. Mostra il codice
  // macchina e accetta il license.json (file o trascinamento); appena e' valido parte tutto.
  function mostraAttivazione(statoIniziale) {
    let stato = statoIniziale;
    let attivata = false;
    const finestra = new BrowserWindow({
      width: 620, height: 640, resizable: false, title: 'Prisma - Attivazione', icon: ICONA,
      autoHideMenuBar: true, show: false,
      webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload-attivazione.js') }
    });
    finestra.once('ready-to-show', () => finestra.show());
    finestra.loadFile(path.join(__dirname, 'attivazione.html'));
    finestra.on('closed', () => { if (!attivata) app.quit(); });

    function dopoLicenza(esito) {
      if (!esito.ok) return esito;
      scriviLogCrash('Licenza attivata per: ' + esito.studio);
      attivata = true;
      setTimeout(() => { try { finestra.close(); } catch (e) { /* gia' chiusa */ } avviaTutto(); }, 900);
      return esito;
    }
    ipcMain.handle('att:stato', () => stato);
    ipcMain.handle('att:copia', (ev, testo) => { clipboard.writeText(String(testo || '')); return true; });
    ipcMain.handle('att:invia', (ev, testo) => {
      try { return dopoLicenza(logica.installaLicenza(CARTELLA_INSTALLAZIONE, String(testo || ''), CHIAVE_PUBBLICA)); }
      catch (e) { return { ok: false, errore: 'Errore imprevisto: ' + e.message }; }
    });
    ipcMain.handle('att:scegli-file', async () => {
      const r = await dialog.showOpenDialog(finestra, {
        title: 'Scegli il file license.json', properties: ['openFile'],
        filters: [{ name: 'Licenza Prisma', extensions: ['json'] }, { name: 'Tutti i file', extensions: ['*'] }]
      });
      if (r.canceled || !r.filePaths.length) return { annullato: true };
      try { return dopoLicenza(logica.installaLicenza(CARTELLA_INSTALLAZIONE, fs.readFileSync(r.filePaths[0], 'utf8'), CHIAVE_PUBBLICA)); }
      catch (e) { return { ok: false, errore: 'Non riesco a leggere il file: ' + e.message }; }
    });
  }

  app.whenReady().then(() => {
    scriviLogCrash('Electron pronto (' + (MODALITA_INSTALLATA ? 'installato' : 'portable') + ').');
    if (MODALITA_INSTALLATA) {
      try {
        const e = logica.sincronizzaPayload(PAYLOAD, CARTELLA_INSTALLAZIONE);
        scriviLogCrash('File app: ' + (e.aggiornato ? ('copiati/aggiornati (v' + e.versionePayload + ')') : ('gia\' aggiornati (v' + e.versioneLocale + ')')));
      } catch (err) {
        scriviLogCrash('Copia file app fallita: ' + (err && err.stack ? err.stack : err));
        dialog.showErrorBox('Prisma - installazione incompleta', 'Non riesco a preparare i file in ' + CARTELLA_INSTALLAZIONE + ':\n\n' + err.message);
        app.quit();
        return;
      }
    }
    let stato = { richiesta: false, valida: true };
    try { stato = logica.statoLicenza(CARTELLA_INSTALLAZIONE, CHIAVE_PUBBLICA); } catch (err) { scriviLogCrash('Controllo licenza fallito: ' + err.message); }
    if (stato.richiesta && !stato.valida) {
      scriviLogCrash('Licenza non attiva: ' + stato.motivo + ' (codice ' + stato.fingerprint + ')');
      mostraAttivazione(stato);
    } else {
      avviaTutto();
    }
  });

  // Senza questo Electron si chiude da solo quando l'ultima finestra (es. quella di attivazione) si chiude,
  // prima che parta la finestra principale. La chiusura vera passa da tray / app.quit().
  app.on('window-all-closed', () => { /* resta in vita */ });
  app.on('before-quit', () => { staChiudendoDavvero = true; });
}
