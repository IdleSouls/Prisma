/*
 * ============================================================================
 *  PRISMA RETE (Electron) - copia per i colleghi in studio (Sabrina/Federico)
 * ============================================================================
 *  Diverso da main.js/Prisma.exe: questo NON avvia mai un server locale, si
 *  collega e basta a quello che gira sul PC dello studio (quello di Matteo,
 *  con "Prisma.exe" normale). L'indirizzo e' scritto qui sotto, "cotto dentro"
 *  l'eseguibile in fase di build - NESSUN file a parte da portarsi dietro:
 *  l'exe si può spostare dove si vuole (Desktop, chiavetta, ecc.) e funziona
 *  comunque da solo.
 *
 *  Se l'indirizzo dello studio cambia (raro - es. cambio router), va
 *  aggiornata la riga URL_STUDIO qui sotto e ricostruito solo questo
 *  eseguibile (electron-app\Costruisci-Prisma-Desktop.bat).
 *
 *  Stessa finestra/icona nella barra di sistema di Prisma normale: chiudendo
 *  la finestra resta attivo li', si chiude tutto solo da "Chiudi" nel menu
 *  dell'icona.
 * ============================================================================
 */

// <<< L'UNICA RIGA DA CAMBIARE SE L'INDIRIZZO DELLO STUDIO CAMBIA >>>
const URL_STUDIO = 'http://192.168.178.112:8420/';

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, clipboard } = require('electron');
const path = require('path');

const ICONA = path.join(__dirname, 'icona.ico');
const URL_APP = URL_STUDIO;

let finestraPrincipale = null;
let tray = null;
let staChiudendoDavvero = false;

const puoProseguire = app.requestSingleInstanceLock();
if (!puoProseguire) app.quit();

function creaFinestra() {
  finestraPrincipale = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Prisma',
    icon: ICONA,
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  finestraPrincipale.once('ready-to-show', () => finestraPrincipale.show());
  // Menu del tasto destro (Electron non ne ha uno suo): taglia / copia / incolla / seleziona tutto.
  finestraPrincipale.webContents.on('context-menu', (ev, params) => {
    const f = params.editFlags || {};
    const voci = [];
    if (params.isEditable) voci.push({ label: 'Annulla', role: 'undo', enabled: !!f.canUndo }, { label: 'Ripeti', role: 'redo', enabled: !!f.canRedo }, { type: 'separator' }, { label: 'Taglia', role: 'cut', enabled: !!f.canCut });
    if (params.isEditable || params.selectionText) voci.push({ label: 'Copia', role: 'copy', enabled: !!f.canCopy });
    if (params.isEditable) voci.push({ label: 'Incolla', role: 'paste', enabled: !!f.canPaste });
    if (params.linkURL) voci.push({ type: 'separator' }, { label: 'Copia indirizzo del link', click: () => clipboard.writeText(params.linkURL) });
    voci.push({ type: 'separator' }, { label: 'Seleziona tutto', role: 'selectAll' });
    Menu.buildFromTemplate(voci).popup({ window: finestraPrincipale });
  });
  // Avviso di riavvio del server (la pagina cambia il titolo in "Riavvio server in arrivo"): l'icona lampeggia nella
  // barra delle applicazioni, anche se la finestra e' nascosta nell'icona di sistema. Si ferma da sola quando la finestra riceve il focus.
  finestraPrincipale.webContents.on('page-title-updated', (ev, titolo) => {
    if (/Riavvio server/i.test(titolo || '')) {
      if (!finestraPrincipale.isVisible()) finestraPrincipale.showInactive();
      if (!finestraPrincipale.isFocused()) finestraPrincipale.flashFrame(true);
    } else {
      finestraPrincipale.flashFrame(false);
    }
  });
  finestraPrincipale.loadURL(URL_APP);

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
  app.on('second-instance', () => {
    if (!finestraPrincipale) return;
    if (finestraPrincipale.isMinimized()) finestraPrincipale.restore();
    finestraPrincipale.show();
    finestraPrincipale.focus();
  });

  app.whenReady().then(() => {
    creaFinestra();
    creaTray();
  });

  app.on('before-quit', () => { staChiudendoDavvero = true; });
}
