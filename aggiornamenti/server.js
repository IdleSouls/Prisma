/*
 * ============================================================================
 *  SERVER LOCALE - Gestionale Studio
 * ============================================================================
 *  Cosa fa: fa girare il gestionale come pagina web sulla rete del tuo studio,
 *  cosi' tu e Sabrina potete aprirlo da PC diversi e vedere gli stessi dati,
 *  aggiornati quasi in tempo reale.
 *
 *  Come si usa (nessuna installazione di librerie richiesta per lo studio):
 *    1) Serve Node.js installato sul PC che fa da server (il tuo). Se non ce
 *       l'hai: vai su https://nodejs.org, scarica la versione "LTS" e installala
 *       (Avanti, Avanti, Fine - le impostazioni di default vanno bene).
 *    2) Metti questo file (server.js) nella STESSA cartella di gestionale.htm.
 *    3) Apri un terminale in quella cartella e lancia:
 *           node server.js
 *       (su Windows: tasto destro nella cartella > "Apri nel terminale", poi
 *       scrivi il comando e premi Invio)
 *    4) Il terminale mostrera' uno o piu' indirizzi. Tu apri quello con
 *       "localhost". Sabrina, dal suo PC (sulla stessa rete WiFi/LAN dello
 *       studio), apre quello con l'indirizzo di rete (es. 192.168.x.x).
 *    5) IMPORTANTE: finche' il terminale resta aperto, il server e' acceso e
 *       i dati restano condivisi. Se lo chiudi, i dati restano salvati (nel
 *       file dati-studio.json) ma nessuno puo' piu' sincronizzarsi finche' non
 *       lo riavvii.
 *
 *  Portale cliente (accesso esterno reale, non solo l'anteprima interna): per attivarlo serve UNA
 *  libreria in piu', "jsdom" (usata per calcolare in modo sicuro solo i dati del singolo cliente,
 *  mai l'intero archivio - vedi i commenti piu' sotto). Se non ti interessa il portale cliente non
 *  serve installarla: tutto il resto (sync studio, backup, documenti) funziona lo stesso. Per
 *  attivarlo, in questa cartella:
 *           npm install jsdom
 *  poi riavvia il server: il terminale dira' chiaramente se il portale cliente e' attivo o no.
 *
 *  Dove sono salvati i dati: in un file "dati-studio.json" che questo script
 *  crea nella stessa cartella, alla prima scrittura. E' il tuo backup reale:
 *  copialo ogni tanto altrove se vuoi un'ulteriore sicurezza.
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execFile, execFileSync } = require('child_process');

const PORTA = 8420;
// CARTELLA: normalmente __dirname. Se questo file viene eseguito pacchettizzato come eseguibile
// singolo (Node.js Single Executable Applications - vedi licensing/installer.js per i dettagli e
// le istruzioni di build), __dirname non punta più a un percorso reale su disco: in quel caso si usa
// la cartella dell'eseguibile stesso, che è dove stanno gestionale.htm e tutti i file dell'app.
function rilevaCartella() {
  try {
    const sea = require('node:sea');
    if (sea && typeof sea.isSea === 'function' && sea.isSea()) return path.dirname(process.execPath);
  } catch (err) { /* non pacchettizzato come SEA - esecuzione normale via "node server.js" */ }
  return __dirname;
}
const CARTELLA = rilevaCartella();
const FILE_PAGINA = path.join(CARTELLA, 'gestionale.htm');
const FILE_DATI = path.join(CARTELLA, 'dati-studio.json');
const FILE_DATI_TMP = path.join(CARTELLA, 'dati-studio.json.tmp');
// Vista per l'MCP locale (Claude): quando il gestionale gira via questo server (HTTP_SYNC_ATTIVO),
// ad ogni salvataggio il browser manda anche la vista già calcolata da esportaVistaMCP() (unica
// fonte della logica di classificazione, resta sempre e solo in gestionale.htm - vedi commento lì)
// e questo server la scrive nello STESSO file che "Esporta per MCP" scarica a mano. Così il tool
// MCP legge sempre l'ultima disponibile, live quando il server è acceso, da export manuale quando
// non lo è: nessuna modifica serve al server MCP stesso, punta già a questo file.
const CARTELLA_MCP_SERVER = path.join(CARTELLA, 'mcp-server');
const FILE_MCP_VISTA = path.join(CARTELLA_MCP_SERVER, 'gestionale-mcp.json');
const FILE_MCP_VISTA_TMP = path.join(CARTELLA_MCP_SERVER, 'gestionale-mcp.json.tmp');
const FILE_LAUNCHER_COLLEGA = path.join(CARTELLA, 'Apri Gestionale (rete studio).html');
const CARTELLA_DOCUMENTI = path.join(CARTELLA, 'documenti-clienti');
const FILE_PORTALE_CLIENTE = path.join(CARTELLA, 'portale-cliente.htm');

// ---------------------------------------------------------------------------
// Log su file (task #158): senza questo, un problema all'avvio (es. licenza non valida) capitato
// con Prisma lanciato come app desktop (Prisma.exe, senza nessuna finestra di console) è invisibile
// del tutto - né errore a schermo né riga di terminale, il processo semplicemente sparisce. Ogni
// riga importante finisce anche qui, cosi' c'e' sempre qualcosa da guardare (o da mandare a chi
// assiste) anche quando non c'e' nessun terminale aperto. Scrittura "best effort": se fallisce (es.
// cartella non scrivibile) non deve mai far crashare l'app per colpa del log stesso.
const CARTELLA_LOG = path.join(CARTELLA, 'logs');
const FILE_LOG = path.join(CARTELLA_LOG, 'prisma.log');
const MAX_RIGHE_LOG = 5000; // oltre questa soglia si accorcia da solo, tenendo le più recenti
function scriviLog(riga) {
  try {
    fs.mkdirSync(CARTELLA_LOG, { recursive: true });
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fs.appendFileSync(FILE_LOG, '[' + timestamp + '] ' + riga + '\n', 'utf8');
    // Accorcia ogni tanto (non a ogni riga: sarebbe uno spreco) invece di lasciarlo crescere per sempre.
    if (Math.random() < 0.02) {
      const righe = fs.readFileSync(FILE_LOG, 'utf8').split('\n');
      if (righe.length > MAX_RIGHE_LOG) {
        fs.writeFileSync(FILE_LOG, righe.slice(righe.length - MAX_RIGHE_LOG).join('\n'), 'utf8');
      }
    }
  } catch (err) { /* log best-effort: un problema qui non deve mai bloccare l'app */ }
}
// Cattura anche i crash non previsti (bug non gestiti altrove) invece di lasciarli sparire nel nulla
// come e' successo con il controllo licenza prima di questo fix - vedi commento sopra fermaConErrore.
process.on('uncaughtException', (err) => {
  scriviLog('ERRORE NON GESTITO: ' + (err && err.stack ? err.stack : err));
  console.error('Errore non gestito:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  scriviLog('PROMISE NON GESTITA: ' + (err && err.stack ? err.stack : err));
  console.error('Promise non gestita:', err);
});
scriviLog('Avvio di Prisma...');

// ---------------------------------------------------------------------------
// Licenza (task #139): questo controllo è ATTIVO SOLO nelle installazioni vendute a un cliente,
// cioè quelle che hanno "licensing/chiave-pubblica.pem" accanto a server.js (ce la mette
// l'installer sulla chiavetta USB - vedi licensing/installer.js). Se quel file non c'è - il caso
// di Matteo che sviluppa/usa Prisma per Studio Quadra, o di chiunque lavori su questo codice - il
// controllo è completamente saltato: nessuna licenza richiesta, comportamento identico a prima.
// Il file di licenza stesso ("license.json", generato da licensing/genera-licenza.js) è legato
// all'hardware di UNA macchina tramite fingerprint: copiare l'intera installazione su un altro PC
// non basta a farla funzionare lì, perché il fingerprint calcolato non corrisponderà più.
(function verificaLicenzaAllAvvio() {
  const FILE_CHIAVE_PUBBLICA = path.join(CARTELLA, 'licensing', 'chiave-pubblica.pem');
  if (!fs.existsSync(FILE_CHIAVE_PUBBLICA)) return; // installazione non licenziata (sviluppo/uso interno) - nessun controllo

  const FILE_LICENZA = path.join(CARTELLA, 'license.json');
  const licensingLib = require(path.join(CARTELLA, 'licensing', 'lib.js'));
  const chiavePubblica = fs.readFileSync(FILE_CHIAVE_PUBBLICA, 'utf8');

  function fermaConErrore(messaggio) {
    console.log('');
    console.log('============================================================');
    console.log('  PRISMA - LICENZA NON VALIDA');
    console.log('============================================================');
    console.log('');
    console.log('  ' + messaggio);
    console.log('');
    console.log('  Il codice macchina di questo computer è:');
    console.log('    ' + licensingLib.calcolaFingerprint());
    console.log('');
    console.log('  Comunicalo a chi ti ha fornito Prisma per ricevere un file');
    console.log('  "license.json" valido da mettere in questa stessa cartella.');
    console.log('');
    scriviLog('AVVIO BLOCCATO - licenza non valida: ' + messaggio + ' (codice macchina: ' + licensingLib.calcolaFingerprint() + ')');
    process.exit(1);
  }

  if (!fs.existsSync(FILE_LICENZA)) {
    fermaConErrore('Manca il file "license.json" in questa cartella.');
  }
  let licenzaGrezza;
  try {
    licenzaGrezza = JSON.parse(fs.readFileSync(FILE_LICENZA, 'utf8'));
  } catch (err) {
    return fermaConErrore('Il file "license.json" è illeggibile o corrotto.');
  }
  const esito = licensingLib.verificaLicenza(licenzaGrezza, chiavePubblica);
  if (!esito.valida) {
    return fermaConErrore('Licenza non valida: ' + esito.motivo + '.');
  }
  console.log('Licenza Prisma attiva per: ' + esito.dati.studio + (esito.dati.scadenza ? (' (scade il ' + esito.dati.scadenza + ')') : ''));
  scriviLog('Licenza attiva per: ' + esito.dati.studio);
})();

// ---------------------------------------------------------------------------
// Aggiornamenti (task #158): Prisma controlla, solo su richiesta esplicita dell'utente (mai da
// solo/in background), se sul repository GitHub di Matteo c'è una versione più recente di
// gestionale.htm/server.js/portale-cliente.htm - e se l'utente conferma, la scarica e la applica.
// L'URL sotto va sostituito con quello reale del repository di Matteo (una volta creato) - finché
// resta questo placeholder il controllo fallisce con un messaggio chiaro invece di un errore
// tecnico, non c'è nessun crash.
const URL_MANIFESTO_AGGIORNAMENTI = 'https://raw.githubusercontent.com/IdleSouls/Prisma/main/aggiornamenti/versione.json';
// Cambiala qui a ogni nuova versione pubblicata (deve combaciare con quella scritta nel
// "versione.json" caricato su GitHub, altrimenti il confronto non ha senso).
const VERSIONE_LOCALE = '1.0.0';
// Solo questi file possono essere sovrascritti da un aggiornamento - mai un nome libero/a piacere
// del manifesto, per non correre il rischio (anche solo teorico, es. account GitHub compromesso)
// di far scrivere un file arbitrario altrove sul PC del cliente.
const FILE_AGGIORNABILI = ['gestionale.htm', 'server.js', 'portale-cliente.htm'];
// Anche l'host da cui si scaricano i file va verificato, non solo il nome: evita che un manifesto
// alterato reindirizzi il download altrove.
const HOST_CONSENTITO_AGGIORNAMENTI = 'raw.githubusercontent.com';

function scaricaTesto(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (err) { return reject(new Error('URL non valido: ' + url)); }
    if (u.protocol !== 'https:') return reject(new Error('Consentito solo https:// (' + url + ')'));
    const richiesta = https.get(url, { timeout: timeoutMs || 10000 }, (risposta) => {
      if (risposta.statusCode >= 300 && risposta.statusCode < 400 && risposta.headers.location) {
        risposta.resume();
        return scaricaTesto(risposta.headers.location, timeoutMs).then(resolve, reject);
      }
      if (risposta.statusCode !== 200) {
        risposta.resume();
        return reject(new Error('Il server ha risposto ' + risposta.statusCode + ' per ' + url));
      }
      const pezzi = [];
      risposta.on('data', (d) => pezzi.push(d));
      risposta.on('end', () => resolve(Buffer.concat(pezzi)));
      risposta.on('error', reject);
    });
    richiesta.on('timeout', () => richiesta.destroy(new Error('Tempo scaduto contattando ' + url)));
    richiesta.on('error', reject);
  });
}

async function verificaAggiornamentoDisponibile() {
  const grezzo = await scaricaTesto(URL_MANIFESTO_AGGIORNAMENTI, 10000);
  let manifesto;
  try { manifesto = JSON.parse(grezzo.toString('utf8')); } catch (err) { throw new Error('Il manifesto degli aggiornamenti non è un JSON valido.'); }
  if (!manifesto || typeof manifesto.versione !== 'string' || !Array.isArray(manifesto.file)) {
    throw new Error('Il manifesto degli aggiornamenti non ha il formato atteso.');
  }
  return manifesto;
}

async function applicaAggiornamento(manifesto) {
  scriviLog('Aggiornamento in corso verso la versione ' + manifesto.versione + '...');
  const risultati = [];
  for (const voce of manifesto.file) {
    if (!voce || typeof voce.nome !== 'string' || typeof voce.url !== 'string') continue;
    if (!FILE_AGGIORNABILI.includes(voce.nome)) {
      scriviLog('Aggiornamento: ignorato file non in whitelist "' + voce.nome + '".');
      continue;
    }
    let u;
    try { u = new URL(voce.url); } catch (err) { continue; }
    if (u.hostname !== HOST_CONSENTITO_AGGIORNAMENTI) {
      scriviLog('Aggiornamento: ignorato "' + voce.nome + '", host non consentito (' + u.hostname + ').');
      continue;
    }
    const contenuto = await scaricaTesto(voce.url, 20000);
    if (!contenuto || contenuto.length === 0) { throw new Error('Download vuoto per ' + voce.nome + '.'); }
    // Scrive prima su file temporaneo e sostituisce solo dopo: se il download si interrompe a metà,
    // il file live non viene mai lasciato a metà scritto (stesso principio del salvataggio dati).
    const destinazione = path.join(CARTELLA, voce.nome);
    const temporaneo = destinazione + '.aggiornamento-tmp';
    fs.writeFileSync(temporaneo, contenuto);
    fs.renameSync(temporaneo, destinazione);
    risultati.push(voce.nome);
    scriviLog('Aggiornamento: scritto "' + voce.nome + '" (' + contenuto.length + ' byte).');
  }
  scriviLog('Aggiornamento completato: ' + risultati.join(', ') + '.');
  return risultati;
}

// ---------------------------------------------------------------------------
// Portale cliente esterno (task #87): un cliente che apre /portale/<token> non deve MAI ricevere
// gestionale.htm né l'intero dati-studio.json (tutti i clienti dello studio) - solo la vista già
// filtrata di se stesso. Per calcolarla senza duplicare la logica di business (classificazione
// scadenze, aggregazione comunicazioni/documenti per cliente...) che vive SOLO in gestionale.htm,
// questo server carica quello stesso file in un motore headless (jsdom) esattamente come farebbe
// un browser, e chiama la funzione già scritta lì (costruisciVistaPortaleClienteEsterna) - vedi il
// commento sopra quella funzione in gestionale.htm per il perché di questa scelta architetturale.
//
// jsdom è una dipendenza OPZIONALE, a differenza del resto di questo server (che non ne richiede
// nessuna): se non è installata, tutto il resto continua a funzionare normalmente (sync studio,
// backup, documenti) - solo il portale cliente esterno resta disattivato, con un errore chiaro
// nelle risposte invece di un crash del server. Per attivarlo: "npm install jsdom" in questa
// cartella, poi riavviare il server.
// ---------------------------------------------------------------------------
let JSDOM = null;
let JSDOM_VirtualConsole = null;
try {
  const jsdomLib = require('jsdom');
  JSDOM = jsdomLib.JSDOM;
  JSDOM_VirtualConsole = jsdomLib.VirtualConsole;
} catch (err) {
  JSDOM = null;
}
const LS_KEY_PORTALE = 'gestionaleStudioState_v1'; // deve combaciare ESATTAMENTE con LS_KEY in gestionale.htm

let motorePortaleWindow = null; // istanza jsdom riusata per tutte le richieste (costruirla è l'unica parte "lenta")

// Costruisce (una sola volta, poi la riusa) il motore headless. I dati vengono iniettati ad OGNI
// richiesta separatamente (vedi vistaPortaleCliente/documentoPortaleCliente sotto) rileggendo
// dati-studio.json fresco da disco, quindi qui non serve ricreare la finestra ogni volta - solo
// le funzioni JS definite dentro gestionale.htm, che non cambiano tra una richiesta e l'altra.
function motorePortale() {
  if (!JSDOM) return { win: null, errore: 'Il modulo "jsdom" non è installato in questa cartella. Per attivare il portale clienti esegui "npm install jsdom" qui dentro e riavvia il server (le altre funzioni del gestionale non ne hanno bisogno).' };
  if (motorePortaleWindow) return { win: motorePortaleWindow, errore: null };
  try {
    const html = fs.readFileSync(FILE_PAGINA, 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      // NIENT'AFFATTO 'usable': lo script di gestionale.htm è tutto inline (gira comunque con
      // runScripts:'dangerously'), e non vogliamo che questo motore provi a scaricare davvero
      // font/script esterni dal web ogni volta che viene costruito.
      url: 'http://localhost/gestionale.htm',
      pretendToBeVisual: true,
      virtualConsole: JSDOM_VirtualConsole ? new JSDOM_VirtualConsole() : undefined, // silenzioso: qui non ci interessano i log della UI
    });
    motorePortaleWindow = dom.window;
    return { win: motorePortaleWindow, errore: null };
  } catch (err) {
    console.error('[gestionale] Errore avviando il motore del portale cliente:', err.message);
    return { win: null, errore: 'Errore interno avviando il motore del portale cliente.' };
  }
}

// Rilegge dati-studio.json (SEMPRE fresco: mai una copia potenzialmente vecchia in memoria) e lo
// carica nel motore tramite la STESSA funzione di caricamento/normalizzazione/migrazione che usa
// il browser vero (caricaStato, via localStorage) - zero logica duplicata qui dentro.
function ricaricaDatiMotorePortale(win) {
  const dati = leggiDati();
  win.localStorage.setItem(LS_KEY_PORTALE, JSON.stringify(dati || {}));
  win.caricaStato();
}

function vistaPortaleCliente(token) {
  const { win, errore } = motorePortale();
  if (!win) return { errore };
  try {
    ricaricaDatiMotorePortale(win);
    return { vista: win.costruisciVistaPortaleClienteEsterna(token) };
  } catch (err) {
    console.error('[gestionale] Errore calcolando la vista del portale cliente:', err.message);
    return { errore: 'Errore interno calcolando la vista del portale.' };
  }
}

function documentoPortaleCliente(token, documentoToken) {
  const { win } = motorePortale();
  if (!win) return null;
  try {
    ricaricaDatiMotorePortale(win);
    return win.risolviDocumentoPortaleEsterno(token, documentoToken);
  } catch (err) {
    console.error('[gestionale] Errore risolvendo un documento del portale cliente:', err.message);
    return null;
  }
}

// Le due funzioni sotto (task #88) sono le uniche scritture che un cliente esterno può fare: un
// messaggio nuovo (eventualmente legato a una scadenza) o una risposta a un thread esistente.
// Stesso motore headless della lettura (vistaPortaleCliente sopra), non il ponte SSE/browser usato
// dall'MCP - un cliente deve poter scrivere anche quando in studio nessuno ha il gestionale aperto.
// La mutazione vera resta SEMPRE dentro gestionale.htm (aggiungiMessaggioPortaleClienteEsterno /
// aggiungiRispostaPortaleClienteEsterno): qui ci limitiamo a richiamarla e a persistere il risultato
// su dati-studio.json con la stessa scrittura atomica usata da /api/stato, notificando poi via SSE
// un eventuale browser dello studio già aperto così si aggiorna da solo.
function messaggioPortaleCliente(token, testo, scadenzaIdRif, fileInfo) {
  const { win, errore } = motorePortale();
  if (!win) return { errore };
  try {
    ricaricaDatiMotorePortale(win);
    const msg = win.aggiungiMessaggioPortaleClienteEsterno(token, testo, scadenzaIdRif || null, fileInfo || null);
    if (!msg) return { esito: null };
    scriviDati(win.getSTATE());
    notificaClientiSSE(null);
    return { esito: msg };
  } catch (err) {
    console.error('[gestionale] Errore salvando un messaggio dal portale cliente:', err.message);
    return { errore: 'Errore interno salvando il messaggio.' };
  }
}
function rispostaPortaleCliente(token, comunicazioneId, testo, fileInfo) {
  const { win, errore } = motorePortale();
  if (!win) return { errore };
  try {
    ricaricaDatiMotorePortale(win);
    const c = win.aggiungiRispostaPortaleClienteEsterno(token, comunicazioneId, testo, fileInfo || null);
    if (!c) return { esito: null };
    scriviDati(win.getSTATE());
    notificaClientiSSE(null);
    return { esito: c };
  } catch (err) {
    console.error('[gestionale] Errore salvando una risposta dal portale cliente:', err.message);
    return { errore: 'Errore interno salvando la risposta.' };
  }
}
// Risolve un token di accesso portale nel cliente corrispondente leggendo dati-studio.json
// direttamente (senza svegliare il motore headless jsdom: qui serve solo id/nome per intestare
// la cartella dell'allegato, non la logica di business) - usato da /api/portale-messaggio e
// /api/portale-risposta quando il cliente allega un file (task #108).
function risolviClienteDaTokenPortale(token) {
  if (!token) return null;
  const dati = leggiDati();
  const cliente = dati && Array.isArray(dati.clienti) ? dati.clienti.find((c) => c.portaleToken && c.portaleToken === token) : null;
  return cliente ? { id: cliente.id, ragioneSociale: cliente.ragioneSociale || 'Cliente' } : null;
}

// Elenco dei browser attualmente collegati per ricevere aggiornamenti in tempo reale (Server-Sent Events)
let clientiSSE = [];

// ---------------------------------------------------------------------------
// Ponte comandi di scrittura per l'MCP locale (Claude): l'MCP non scrive MAI direttamente sui
// dati, non conosce la logica di creazione/validazione dei clienti/task/ecc. - quella resta SOLO
// in gestionale.htm. Questo server fa da postino: riceve un comando dall'MCP, lo inoltra via SSE
// al browser con il gestionale aperto, e resta in attesa che il browser gli riporti l'esito prima
// di rispondere all'MCP. Se nessun browser è collegato (nessuno ha il gestionale aperto via questo
// server in questo momento) risponde subito con un errore chiaro, senza inventare nulla.
let comandiInAttesa = new Map(); // id -> { res, timer }
let prossimoComandoId = 1;
const TIMEOUT_COMANDO_MS = 20000;

function risolviComando(id, esito) {
  const voce = comandiInAttesa.get(id);
  if (!voce) return; // già risolto (timeout scattato nel frattempo) o id sconosciuto: nessun problema
  clearTimeout(voce.timer);
  comandiInAttesa.delete(id);
  try {
    voce.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    voce.res.end(JSON.stringify(esito));
  } catch (err) { /* connessione dell'MCP già chiusa (es. ha smesso di aspettare): non è un problema */ }
}

// ---------------------------------------------------------------------------
// Documenti clienti: ogni cliente ha una sua cartella dentro "documenti-clienti", creata la prima
// volta che si carica un documento per lui dal gestionale. Nessun database, sono file veri sul
// disco di questo PC (o del server dello studio), così restano leggibili/apribili anche fuori
// dal gestionale e sono compresi nei backup di cartella che fate già.
// ---------------------------------------------------------------------------
function nomeCartellaSicuro(nome) {
  const pulito = (nome || 'Cliente').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return (pulito || 'Cliente').slice(0, 120);
}
function nomeFileSicuro(nome) {
  const pulito = (nome || 'documento').replace(/[\\/:*?"<>|]/g, '_').trim();
  return pulito || 'documento';
}
// Evita di sovrascrivere un file esistente con lo stesso nome: aggiunge " (2)", " (3)", ecc.
// prima dell'estensione finché non trova un nome libero nella cartella di destinazione.
function nomeFileLibero(cartella, nomeOriginale) {
  const ext = path.extname(nomeOriginale);
  const base = path.basename(nomeOriginale, ext);
  let candidato = nomeOriginale;
  let n = 1;
  while (fs.existsSync(path.join(cartella, candidato))) {
    n++;
    candidato = `${base} (${n})${ext}`;
  }
  return candidato;
}
// Risolve un percorso relativo (così come restituito da /api/documenti/carica) in un percorso
// assoluto, rifiutando qualunque tentativo di uscire dalla cartella documenti-clienti (es. "..").
// Torna null se il percorso non è valido o non ricade dentro CARTELLA_DOCUMENTI.
function risolviPercorsoDocumento(percorsoRelativo) {
  if (!percorsoRelativo || typeof percorsoRelativo !== 'string') return null;
  const assoluto = path.normalize(path.join(CARTELLA_DOCUMENTI, percorsoRelativo));
  if (!assoluto.startsWith(CARTELLA_DOCUMENTI + path.sep) && assoluto !== CARTELLA_DOCUMENTI) return null;
  return assoluto;
}
const TIPI_MIME = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
  doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv:'text/csv', txt:'text/plain', zip:'application/zip', p7m:'application/pkcs7-mime' };
function mimeDaEstensione(nomeFile) {
  const ext = path.extname(nomeFile).slice(1).toLowerCase();
  return TIPI_MIME[ext] || 'application/octet-stream';
}

// Scrittura vera e propria di un file caricato dentro la cartella del cliente - stessa logica
// usata da /api/documenti/carica (upload dal gestionale, task #73) e ora anche da
// /api/portale-messaggio / /api/portale-risposta quando un CLIENTE allega un file dal proprio
// portale esterno (task #108): un'unica implementazione, non una copiata e leggermente diversa,
// così le due scritture restano garantite identiche (stessa cartella, stessa deduplica nomi, ecc).
// Lancia un errore se i dati sono insufficienti; altrimenti torna {percorso, nomeFile, dimensione}.
function scriviFileClienteCaricato({ clienteId, clienteNome, sottocartella, nomeFile, contenutoBase64 }) {
  const idPulito = String(clienteId || '').trim();
  const nomePulito = String(clienteNome || idPulito || 'Cliente').trim();
  const sottocartellaPulita = sottocartella ? nomeCartellaSicuro(String(sottocartella)) : '';
  const nomeFileVoluto = nomeFileSicuro(String(nomeFile || 'documento'));
  if (!idPulito || !contenutoBase64) throw new Error('Dati mancanti (clienteId o contenuto file)');
  const cartellaCliente = path.join(CARTELLA_DOCUMENTI, nomeCartellaSicuro(nomePulito) + ' [' + idPulito.slice(-6) + ']');
  const cartellaFinale = sottocartellaPulita ? path.join(cartellaCliente, sottocartellaPulita) : cartellaCliente;
  fs.mkdirSync(cartellaFinale, { recursive: true });
  const nomeLibero = nomeFileLibero(cartellaFinale, nomeFileVoluto);
  const buffer = Buffer.from(contenutoBase64, 'base64');
  fs.writeFileSync(path.join(cartellaFinale, nomeLibero), buffer);
  const percorsoRelativo = path.relative(CARTELLA_DOCUMENTI, path.join(cartellaFinale, nomeLibero));
  return { percorso: percorsoRelativo, nomeFile: nomeLibero, dimensione: buffer.length };
}

// ---------------------------------------------------------------------------
// Strumenti: convertitore Word <-> PDF (task #133). Usa LibreOffice in modalità headless -
// conversione locale sul PC dello studio, nessun documento del cliente esce verso servizi online.
// Richiede LibreOffice installato (gratuito): se non lo trova all'avvio, lo strumento resta
// visibile in Prisma ma spiega chiaramente perché non è disponibile invece di fallire in modo
// oscuro a ogni tentativo di conversione.
// ---------------------------------------------------------------------------
let SOFFICE_PATH = null;
function trovaSoffice() {
  // Percorsi assoluti: basta verificare che il file esista, MAI eseguirlo per il controllo - su
  // Windows si è visto "soffice.exe --version" aprire una finestra di terminale interattiva che
  // resta in attesa di un tasto ("Press Enter to continue...") invece di uscire subito, facendo
  // scadere il timeout ed essere considerato (erroneamente) "non installato".
  const candidatiFile = [];
  if (process.platform === 'win32') {
    candidatiFile.push('C:\\Program Files\\LibreOffice\\program\\soffice.exe');
    candidatiFile.push('C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe');
  } else if (process.platform === 'darwin') {
    candidatiFile.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  } else {
    candidatiFile.push('/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice');
  }
  for (const candidato of candidatiFile) {
    try { if (fs.existsSync(candidato)) return candidato; } catch (err) { /* percorso non leggibile: provo il prossimo */ }
  }
  // Fallback: proviamo "soffice" nel PATH di sistema (installazioni non standard/altri OS) - qui
  // va per forza eseguito per sapere se esiste, quindi usiamo --headless che evita la console
  // interattiva vista sopra.
  try {
    execFileSync('soffice', ['--headless', '--version'], { timeout: 8000, stdio: 'ignore' });
    return 'soffice';
  } catch (err) { /* non nel PATH: LibreOffice non è disponibile */ }
  return null;
}
// Coppie di conversione supportate: chiave = estensione di partenza, valore = elenco di formati di
// arrivo ammessi. Un .pdf ne ha due: 'docx' (torna modificabile in Word) e 'pdfa' (PDF/A, formato
// di archiviazione a norma per la conservazione digitale - task #136).
const CONVERSIONI_SUPPORTATE = { docx: ['pdf'], doc: ['pdf'], odt: ['pdf'], pdf: ['docx', 'pdfa'] };
// PDF/A si ottiene riesportando in PDF con il filtro giusto e l'opzione SelectPdfVersion=1 (=
// PDF/A-1b, lo standard ISO 19005-1 più compatibile). Il NOME del filtro di export dipende dal
// tipo di documento aperto da LibreOffice: un .pdf viene aperto in Draw (draw_pdf_Export), un
// documento di scrittura (.docx/.doc/.odt) in Writer (writer_pdf_Export) - usare il filtro
// sbagliato fa fallire silenziosamente l'opzione PDF/A.
function filtroPdfExportPer(estensioneOrigine) {
  return estensioneOrigine === 'pdf' ? 'draw_pdf_Export' : 'writer_pdf_Export';
}
function convertiFileConSoffice(percorsoInput, formatoDestinazione, cartellaOutput, estensioneOrigine) {
  return new Promise((resolve, reject) => {
    if (!SOFFICE_PATH) { reject(new Error('Convertitore non disponibile su questo PC: installa LibreOffice (gratuito, libreoffice.org) e riavvia il server.')); return; }
    const argomentoFormato = formatoDestinazione === 'pdfa'
      ? `pdf:${filtroPdfExportPer(estensioneOrigine)}:SelectPdfVersion=1`
      : formatoDestinazione;
    execFile(SOFFICE_PATH, ['--headless', '--convert-to', argomentoFormato, '--outdir', cartellaOutput, percorsoInput], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) { reject(new Error('Conversione non riuscita: ' + (String(stderr || err.message).split('\n')[0]))); return; }
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Cifratura credenziali (task #134): il vault password (STATE.credenziali) viaggia in chiaro nel
// browser (serve poterlo mostrare/copiare), ma sul disco del PC server no - una chiave locale
// generata al primo avvio (mai spedita al browser, mai in localStorage) cifra/decifra SOLO il
// campo password di ogni credenziale, appena prima di scrivere dati-studio.json e appena dopo
// averlo letto. Se la cartella con la chiave si perde le password cifrate non sono più
// recuperabili: è un compromesso accettato per non dover gestire una password-maestra lato utente.
const FILE_CHIAVE_CREDENZIALI = path.join(CARTELLA, 'credenziali.key');
function chiaveCredenziali() {
  try {
    if (fs.existsSync(FILE_CHIAVE_CREDENZIALI)) {
      return Buffer.from(fs.readFileSync(FILE_CHIAVE_CREDENZIALI, 'utf8').trim(), 'hex');
    }
    const chiave = crypto.randomBytes(32);
    fs.writeFileSync(FILE_CHIAVE_CREDENZIALI, chiave.toString('hex'), 'utf8');
    return chiave;
  } catch (err) {
    console.error('[gestionale] Impossibile leggere/creare la chiave di cifratura credenziali:', err.message);
    return null;
  }
}
function cifraCredenziale(testoChiaro) {
  if (!testoChiaro) return testoChiaro;
  const chiave = chiaveCredenziali();
  if (!chiave) return testoChiaro; // meglio salvare in chiaro che perdere il dato
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', chiave, iv);
    const cifrato = Buffer.concat([cipher.update(String(testoChiaro), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'ENC1:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + cifrato.toString('base64');
  } catch (err) {
    console.error('[gestionale] Cifratura credenziale fallita:', err.message);
    return testoChiaro;
  }
}
function decifraCredenziale(valore) {
  if (typeof valore !== 'string' || !valore.startsWith('ENC1:')) return valore; // non cifrato (o già in chiaro): passa così com'è
  try {
    const [, ivB64, tagB64, datiB64] = valore.split(':');
    const chiave = chiaveCredenziali();
    const decipher = crypto.createDecipheriv('aes-256-gcm', chiave, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const testo = Buffer.concat([decipher.update(Buffer.from(datiB64, 'base64')), decipher.final()]);
    return testo.toString('utf8');
  } catch (err) {
    console.error('[gestionale] Decifratura credenziale fallita (chiave persa/cambiata?):', err.message);
    return '';
  }
}
// Applicate al confine con il disco (leggiDati/scriviDati sotto), così il resto del server e il
// browser lavorano sempre e solo con STATE in chiaro - nessun altro endpoint deve saperne nulla.
function cifraCredenzialiInDati(dati) {
  if (!dati || !Array.isArray(dati.credenziali)) return dati;
  return Object.assign({}, dati, { credenziali: dati.credenziali.map(c => Object.assign({}, c, { password: cifraCredenziale(c.password) })) });
}
function decifraCredenzialiInDati(dati) {
  if (!dati || !Array.isArray(dati.credenziali)) return dati;
  return Object.assign({}, dati, { credenziali: dati.credenziali.map(c => Object.assign({}, c, { password: decifraCredenziale(c.password) })) });
}

// ---------------------------------------------------------------------------
// Lettura/scrittura dati condivisi (scrittura "atomica": scrive su un file
// temporaneo e poi lo rinomina, cosi' non si rischia mai di lasciare il file
// dati-studio.json a meta' scritto se il processo si interrompe nel momento
// sbagliato)
// ---------------------------------------------------------------------------
function leggiDati() {
  try {
    if (!fs.existsSync(FILE_DATI)) return null;
    const raw = fs.readFileSync(FILE_DATI, 'utf8');
    if (!raw.trim()) return null;
    return decifraCredenzialiInDati(JSON.parse(raw));
  } catch (err) {
    console.error('[gestionale] Errore leggendo dati-studio.json:', err.message);
    return null;
  }
}

function scriviDati(dati) {
  const testo = JSON.stringify(cifraCredenzialiInDati(dati));
  fs.writeFileSync(FILE_DATI_TMP, testo, 'utf8');
  fs.renameSync(FILE_DATI_TMP, FILE_DATI);
}

// ---------------------------------------------------------------------------
// Backup a più strati di dati-studio.json. La scrittura atomica sopra protegge solo dal file "a
// metà" se il processo si interrompe nel momento sbagliato - non è uno storico, è solo l'ultimo
// stato. Qui invece si tiene una copia distinta ogni volta che scatta uno snapshot, così c'è un
// punto nel tempo a cui tornare se un dato viene cancellato per sbaglio, un import va storto, o il
// file si corrompe. Due "strati": più momenti fissi durante la giornata (8:00/12:00/16:00) e più
// giorni di storico (rotazione automatica, si tengono gli ultimi 30 giorni). Dato che questo server
// NON resta sempre acceso (si avvia "ogni tanto"), c'è anche uno snapshot di sicurezza a ogni
// avvio: se il PC si accende più tardi delle 8/12/16 di oggi, quell'orario non scatterebbe mai da
// solo senza questo.
const CARTELLA_BACKUP = path.join(CARTELLA, 'backup');
const ORARI_BACKUP = [8, 12, 16]; // ore locali del giorno in cui si tenta uno snapshot fisso
const GIORNI_DA_CONSERVARE_BACKUP = 30;
let ultimaFasciaBackupFatta = null; // 'YYYY-MM-DD-<ora>' dell'ultima fascia oraria già tentata oggi

function formattaDataOraFileBackup(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Come nomeFileLibero() per i documenti: evita di sovrascrivere in silenzio un backup esistente se
// per qualunque motivo scattano due snapshot nello stesso secondo (es. avvio del server + subito
// dopo un ripristino manuale) - senza questo, il secondo backup avrebbe lo stesso nome del primo e
// lo cancellerebbe per davvero, vanificando lo scopo di avere uno storico.
function nomeBackupLibero(base) {
  let candidato = base;
  let n = 2;
  while (fs.existsSync(path.join(CARTELLA_BACKUP, candidato))) {
    candidato = base.replace(/\.json$/, `_${n}.json`);
    n++;
  }
  return candidato;
}

function elencoBackup() {
  try {
    if (!fs.existsSync(CARTELLA_BACKUP)) return [];
    return fs.readdirSync(CARTELLA_BACKUP)
      .filter((f) => f.startsWith('dati-studio_') && f.endsWith('.json'))
      .map((f) => {
        const stat = fs.statSync(path.join(CARTELLA_BACKUP, f));
        return { file: f, data: stat.mtime.toISOString(), dimensione: stat.size };
      })
      .sort((a, b) => b.data.localeCompare(a.data)); // più recente per primo
  } catch (err) {
    console.error('[gestionale] Errore leggendo l\'elenco backup:', err.message);
    return [];
  }
}

function pulisciBackupVecchi() {
  try {
    const soglia = Date.now() - GIORNI_DA_CONSERVARE_BACKUP * 24 * 60 * 60 * 1000;
    fs.readdirSync(CARTELLA_BACKUP)
      .filter((f) => f.startsWith('dati-studio_') && f.endsWith('.json'))
      .forEach((f) => {
        const percorso = path.join(CARTELLA_BACKUP, f);
        if (fs.statSync(percorso).mtimeMs < soglia) fs.unlinkSync(percorso);
      });
  } catch (err) { /* pulizia non riuscita: non blocca nulla, si ritenta al prossimo backup */ }
}

// motivo: solo per il log in console, non cambia il comportamento. Non crea un doppione se il
// contenuto è identico all'ultimo backup salvato (es. giornata senza nessuna modifica) - evita di
// riempire la cartella di copie inutili tenendo comunque uno storico reale quando qualcosa cambia.
function eseguiBackup(motivo) {
  try {
    if (!fs.existsSync(FILE_DATI)) return; // nessun dato ancora salvato: niente da mettere in sicurezza
    const contenuto = fs.readFileSync(FILE_DATI, 'utf8');
    if (!contenuto.trim()) return;
    fs.mkdirSync(CARTELLA_BACKUP, { recursive: true });
    const esistenti = fs.readdirSync(CARTELLA_BACKUP).filter((f) => f.startsWith('dati-studio_') && f.endsWith('.json')).sort();
    const ultimo = esistenti[esistenti.length - 1];
    if (ultimo && fs.readFileSync(path.join(CARTELLA_BACKUP, ultimo), 'utf8') === contenuto) return;
    const nome = nomeBackupLibero('dati-studio_' + formattaDataOraFileBackup(new Date()) + '.json');
    fs.writeFileSync(path.join(CARTELLA_BACKUP, nome), contenuto, 'utf8');
    console.log(`[gestionale] Backup creato (${motivo}): backup/${nome}`);
    pulisciBackupVecchi();
  } catch (err) {
    console.error('[gestionale] Errore creando il backup:', err.message);
  }
}

// Controllo ogni minuto se è scattato uno degli orari fissi: una sola volta al giorno per fascia
// (la chiave include la data, quindi si "resetta" da sola il giorno dopo).
setInterval(() => {
  const ora = new Date();
  const oraCorrente = ora.getHours();
  if (!ORARI_BACKUP.includes(oraCorrente)) return;
  const chiave = ora.toISOString().slice(0, 10) + '-' + oraCorrente;
  if (chiave === ultimaFasciaBackupFatta) return;
  ultimaFasciaBackupFatta = chiave;
  eseguiBackup(`orario fisso ${oraCorrente}:00`);
}, 60 * 1000);

// ---------------------------------------------------------------------------
// Notifica in tempo reale a tutti i browser collegati (tranne, volendo, quello
// che ha appena scritto: gestito lato client confrontando l'"origine")
// ---------------------------------------------------------------------------
function notificaClientiSSE(origine) {
  const payload = 'data: ' + JSON.stringify({ tipo: 'statoAggiornato', origine: origine || null, ts: Date.now() }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}

// Manda un comando dell'MCP a TUTTI i browser collegati (di norma ce n'è uno solo, quello dello
// studio): se più di uno è aperto verrebbe eseguito più volte, ma è uno scenario raro (più
// postazioni aperte contemporaneamente) e comunque innocuo per operazioni idempotenti come
// creare un cliente - non lo gestiamo in modo speciale per ora.
function notificaComandoSSE(comando) {
  const payload = 'data: ' + JSON.stringify({ tipo: 'comandoMcp', comando }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}

// ---------------------------------------------------------------------------
// Piccolo helper per servire file statici (solo gestionale.htm ci interessa)
// ---------------------------------------------------------------------------
function serviGestionale(res) {
  fs.readFile(FILE_PAGINA, (err, contenuto) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Non trovo gestionale.htm nella cartella: ' + FILE_PAGINA + '\nMetti server.js nella stessa cartella del file gestionale.htm e riavvia.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(contenuto);
  });
}

function leggiCorpoRichiesta(req, callback) {
  let corpo = '';
  req.on('data', (chunk) => {
    corpo += chunk;
    if (corpo.length > 50 * 1024 * 1024) { // 50 MB, limite di sicurezza generoso
      req.destroy();
    }
  });
  req.on('end', () => callback(corpo));
}

// ---------------------------------------------------------------------------
// Server HTTP
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // Consenti l'uso anche da un indirizzo diverso da quello con cui si e' aperta la pagina
  // (utile se in futuro si vuole aprire da un dominio diverso sulla stessa rete)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url === '/' || url === '/gestionale.htm') {
    serviGestionale(res);
    return;
  }

  if (url === '/api/stato' && req.method === 'GET') {
    const dati = leggiDati();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(dati ? JSON.stringify(dati) : '{}');
    return;
  }

  if (url === '/api/stato' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        scriviDati(dati);
        const origine = req.headers['x-client-id'] || null;
        notificaClientiSSE(origine);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (err) {
        console.error('[gestionale] Errore salvando i dati ricevuti:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":false,"errore":"JSON non valido"}');
      }
    });
    return;
  }

  if (url === '/api/comando' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let comando;
      try {
        const dati = JSON.parse(corpo);
        if (!dati || typeof dati.azione !== 'string' || !dati.azione) throw new Error('azione mancante');
        comando = { id: 'cmd' + (prossimoComandoId++), azione: dati.azione, parametri: dati.parametri || {} };
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Richiesta non valida: ' + err.message }));
        return;
      }
      if (clientiSSE.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Nessun browser con il gestionale aperto è collegato a questo server in questo momento: apri il gestionale dall\'indirizzo del server (es. http://localhost:' + PORTA + ') prima di chiedere a Claude di scrivere qualcosa.' }));
        return;
      }
      const timer = setTimeout(() => {
        risolviComando(comando.id, { ok: false, errore: 'Timeout: il gestionale non ha risposto al comando entro ' + (TIMEOUT_COMANDO_MS / 1000) + ' secondi (tab in background con throttling del browser? errore non gestito lato browser?).' });
      }, TIMEOUT_COMANDO_MS);
      comandiInAttesa.set(comando.id, { res, timer });
      notificaComandoSSE(comando);
    });
    return;
  }

  if (url === '/api/comando-risultato' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        risolviComando(dati.id, { ok: !!dati.ok, risultato: dati.risultato != null ? dati.risultato : null, errore: dati.errore || null });
      } catch (err) { /* corpo malformato: nulla da risolvere, ignorato */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (url === '/api/mcp-vista' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const vista = JSON.parse(corpo);
        // Controllo minimo di sanità: non riscrivere il file con qualcosa che non è una vista
        // valida (es. richiesta troncata o corpo vuoto) - meglio tenere l'ultima buona.
        if (!vista || typeof vista !== 'object' || !Array.isArray(vista.clienti) || !Array.isArray(vista.scadenze)) {
          throw new Error('Vista MCP non valida (mancano clienti/scadenze)');
        }
        fs.mkdirSync(CARTELLA_MCP_SERVER, { recursive: true });
        fs.writeFileSync(FILE_MCP_VISTA_TMP, JSON.stringify(vista, null, 2), 'utf8');
        fs.renameSync(FILE_MCP_VISTA_TMP, FILE_MCP_VISTA);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (err) {
        // Non bloccante: il salvataggio principale dei dati (/api/stato) non dipende da questo.
        // Se fallisce, il tool MCP userà semplicemente l'ultima vista buona già su disco.
        console.error('[gestionale] Errore aggiornando la vista MCP:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  if (url === '/api/eventi' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    clientiSSE.push(res);
    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (err) { clearInterval(keepalive); }
    }, 25000);
    req.on('close', () => {
      clearInterval(keepalive);
      clientiSSE = clientiSSE.filter((r) => r !== res);
    });
    return;
  }

  if (url === '/api/stato-info' && req.method === 'GET') {
    const dati = leggiDati();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      fileEsiste: fs.existsSync(FILE_DATI),
      numeroClienti: dati && Array.isArray(dati.clienti) ? dati.clienti.length : null,
      browserCollegati: clientiSSE.length,
      cartella: CARTELLA,
    }));
    return;
  }

  // Indirizzi con cui i colleghi in studio possono raggiungere QUESTO server dalla stessa rete
  // WiFi/LAN (hostname + IP), da mostrare/copiare direttamente nella scheda "Responsabili dello
  // studio" di Impostazioni - stessa lista usata per generare il launcher qui sotto, ricalcolata a
  // ogni chiamata (l'indirizzo di rete di questo PC può cambiare cambiando WiFi senza riavviare).
  if (url === '/api/indirizzi-rete' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, hostname: os.hostname(), porta: PORTA, indirizzi: indirizziRete() }));
    return;
  }

  // Scarica il file "Apri Gestionale (rete studio).html" (rigenerato al volo con gli indirizzi di
  // rete più aggiornati) da mandare una volta ai colleghi via email/chat: a ogni doppio click
  // provano a collegarsi da soli a questo PC, senza dover ricordare o digitare nessun indirizzo.
  if (url === '/api/link-colleghi' && req.method === 'GET') {
    scriviLauncherCollegamento(os.hostname(), indirizziRete());
    fs.readFile(FILE_LAUNCHER_COLLEGA, (err, contenuto) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Non sono riuscito a generare il file di collegamento.' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Apri Gestionale (rete studio).html"',
      });
      res.end(contenuto);
    });
    return;
  }

  // Scarica il file di log (task #158) - da mandare a chi presta assistenza quando qualcosa non
  // funziona, soprattutto ora che Prisma gira come app desktop senza nessuna finestra di console da
  // guardare. Se il log non esiste ancora (nessun problema si è mai verificato) risponde comunque
  // con un file vuoto invece di un errore, per non complicare l'esperienza di chi lo scarica.
  if (url === '/api/log' && req.method === 'GET') {
    let contenuto = '';
    try { contenuto = fs.readFileSync(FILE_LOG, 'utf8'); } catch (err) { /* nessun log ancora: file vuoto va bene */ }
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="prisma-log.txt"',
    });
    res.end(contenuto);
    return;
  }

  if (url === '/api/versione' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, versione: VERSIONE_LOCALE }));
    return;
  }

  // Verifica se c'è una versione più recente pubblicata - SOLO su richiesta esplicita dall'interfaccia
  // (mai automatico/in background): scarica solo il piccolo manifesto JSON, non i file veri.
  if (url === '/api/aggiornamenti/verifica' && req.method === 'GET') {
    verificaAggiornamentoDisponibile().then((manifesto) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        versioneLocale: VERSIONE_LOCALE,
        versioneRemota: manifesto.versione,
        aggiornamentoDisponibile: manifesto.versione !== VERSIONE_LOCALE,
        note: manifesto.note || '',
      }));
    }).catch((err) => {
      scriviLog('Verifica aggiornamenti non riuscita: ' + err.message);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errore: err.message }));
    });
    return;
  }

  // Applica l'aggiornamento: ri-scarica il manifesto (non si fida di uno passato dal client) e poi
  // i file - solo quelli in whitelist, solo da GitHub, vedi applicaAggiornamento() più sopra.
  if (url === '/api/aggiornamenti/applica' && req.method === 'POST') {
    verificaAggiornamentoDisponibile()
      .then((manifesto) => applicaAggiornamento(manifesto))
      .then((fileAggiornati) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, file: fileAggiornati }));
      }).catch((err) => {
        scriviLog('Applicazione aggiornamento non riuscita: ' + err.message);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      });
    return;
  }

  if (url === '/api/backup/elenco' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(elencoBackup()));
    return;
  }

  // Ripristina dati-studio.json da uno degli snapshot automatici. Prima di sovrascrivere, mette
  // comunque in sicurezza lo stato ATTUALE con un backup (così anche il ripristino stesso è
  // reversibile), poi notifica tutti i browser collegati via SSE: si riallineano da soli con lo
  // stesso meccanismo già usato per la sincronizzazione multi-dispositivo, nessun ricaricamento
  // manuale della pagina richiesto (nemmeno per chi ha lanciato il ripristino).
  if (url === '/api/backup/ripristina' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const nomeFile = String(dati.file || '');
        if (!/^dati-studio_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_\d+)?\.json$/.test(nomeFile)) {
          throw new Error('Nome del file di backup non valido.');
        }
        const percorsoBackup = path.join(CARTELLA_BACKUP, nomeFile);
        if (!fs.existsSync(percorsoBackup)) throw new Error('Backup non trovato (potrebbe essere stato rimosso dalla pulizia automatica dei più vecchi di 30 giorni).');
        const contenutoBackup = fs.readFileSync(percorsoBackup, 'utf8');
        JSON.parse(contenutoBackup); // valida che sia JSON leggibile prima di usarlo per sovrascrivere
        eseguiBackup('prima di un ripristino');
        fs.writeFileSync(FILE_DATI_TMP, contenutoBackup, 'utf8');
        fs.renameSync(FILE_DATI_TMP, FILE_DATI);
        notificaClientiSSE(null);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (err) {
        console.error('[gestionale] Errore nel ripristino da backup:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  if (url === '/api/documenti/carica' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const esito = scriviFileClienteCaricato(dati);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, percorso: esito.percorso, nomeFile: esito.nomeFile, dimensione: esito.dimensione }));
      } catch (err) {
        console.error('[gestionale] Errore caricando documento:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  if (url === '/api/documenti/scarica' && req.method === 'GET') {
    const percorsoRel = decodeURIComponent((req.url.split('?')[1] || '').replace(/^percorso=/, ''));
    const assoluto = risolviPercorsoDocumento(percorsoRel);
    if (!assoluto || !fs.existsSync(assoluto) || !fs.statSync(assoluto).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Documento non trovato.');
      return;
    }
    const nomeFile = path.basename(assoluto);
    res.writeHead(200, {
      'Content-Type': mimeDaEstensione(nomeFile),
      'Content-Disposition': `inline; filename="${encodeURIComponent(nomeFile)}"`,
    });
    fs.createReadStream(assoluto).pipe(res);
    return;
  }

  if (url === '/api/documenti/apri-cartella' && req.method === 'POST') {
    // Apre in Esplora risorse (o Finder/gestore file) la cartella che contiene il documento, con
    // il file selezionato quando il sistema lo supporta - risposta a Matteo: "che il gestionale
    // porti direttamente al collegamento dentro la cartella" invece di aprire solo il file.
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const assoluto = risolviPercorsoDocumento(dati.percorso);
        if (!assoluto || !fs.existsSync(assoluto)) throw new Error('File non trovato sul disco (percorso non valido o file spostato/eliminato).');
        const comando = process.platform === 'win32' ? `explorer /select,"${assoluto}"`
          : process.platform === 'darwin' ? `open -R "${assoluto}"`
          : `xdg-open "${path.dirname(assoluto)}"`;
        // "explorer /select,..." su Windows spesso ritorna un codice di uscita diverso da 0 anche
        // quando l'esplora risorse si apre correttamente: non trattarlo come un errore da riportare.
        exec(comando, () => {});
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // Lo strumento "Convertitore Word/PDF" (task #133) chiede prima questo per sapere se mostrare il
  // form di conversione o il messaggio "installa LibreOffice" - evita un tentativo di conversione
  // che fallirebbe comunque.
  if (url === '/api/conversione-stato' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, disponibile: !!SOFFICE_PATH }));
    return;
  }

  if (url === '/api/converti' && req.method === 'POST') {
    leggiCorpoRichiesta(req, async (corpo) => {
      let cartellaTemp = null;
      try {
        const dati = JSON.parse(corpo);
        if (!dati.contenutoBase64) throw new Error('File mancante.');
        const nomeFileVoluto = nomeFileSicuro(String(dati.nomeFile || 'documento'));
        const estOrigine = path.extname(nomeFileVoluto).slice(1).toLowerCase();
        const formatoDestinazione = String(dati.formatoDestinazione || '').toLowerCase();
        if (!(CONVERSIONI_SUPPORTATE[estOrigine] || []).includes(formatoDestinazione)) {
          throw new Error('Conversione non supportata: da .' + (estOrigine || '?') + ' a .' + (formatoDestinazione || '?') + '.');
        }
        // Cartelle input/output SEPARATE: per "pdfa" l'estensione di output resta .pdf, uguale a
        // quella di un input già .pdf - nella stessa cartella LibreOffice scriverebbe l'output sopra
        // (o accanto, a seconda della versione) al file di input, e un controllo "esiste il file di
        // output" darebbe un falso positivo leggendo l'originale non convertito invece del risultato.
        cartellaTemp = path.join(os.tmpdir(), 'prisma-conversione-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
        const cartellaInput = path.join(cartellaTemp, 'in');
        const cartellaOutput = path.join(cartellaTemp, 'out');
        fs.mkdirSync(cartellaInput, { recursive: true });
        fs.mkdirSync(cartellaOutput, { recursive: true });
        const percorsoInput = path.join(cartellaInput, nomeFileVoluto);
        fs.writeFileSync(percorsoInput, Buffer.from(dati.contenutoBase64, 'base64'));
        await convertiFileConSoffice(percorsoInput, formatoDestinazione, cartellaOutput, estOrigine);
        const estensioneOutputFile = formatoDestinazione === 'pdfa' ? 'pdf' : formatoDestinazione;
        const nomeBase = path.basename(nomeFileVoluto, path.extname(nomeFileVoluto));
        // LibreOffice nomina l'output <nomeBase>.<estensione> nella cartella di output: per pdfa lo
        // rinominiamo con un suffisso, così scaricando resta distinguibile da un pdf "normale".
        const percorsoOutputLibreOffice = path.join(cartellaOutput, nomeBase + '.' + estensioneOutputFile);
        const nomeOutput = formatoDestinazione === 'pdfa' ? (nomeBase + '_PDFA.pdf') : (nomeBase + '.' + estensioneOutputFile);
        let percorsoOutput = percorsoOutputLibreOffice;
        if (formatoDestinazione === 'pdfa' && fs.existsSync(percorsoOutputLibreOffice)) {
          percorsoOutput = path.join(cartellaOutput, nomeOutput);
          fs.renameSync(percorsoOutputLibreOffice, percorsoOutput);
        }
        if (!fs.existsSync(percorsoOutput)) throw new Error('Il convertitore non ha prodotto alcun file di output.');
        const bufferOutput = fs.readFileSync(percorsoOutput);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, nomeFile: nomeOutput, contenutoBase64: bufferOutput.toString('base64') }));
      } catch (err) {
        console.error('[gestionale] Errore conversione file:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      } finally {
        if (cartellaTemp) { try { fs.rmSync(cartellaTemp, { recursive: true, force: true }); } catch (e) { /* pulizia best-effort */ } }
      }
    });
    return;
  }

  if (url === '/api/documenti/elimina' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const assoluto = risolviPercorsoDocumento(dati.percorso);
        if (assoluto && fs.existsSync(assoluto) && fs.statSync(assoluto).isFile()) fs.unlinkSync(assoluto);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Portale cliente esterno (task #87): route con prefisso, non corrispondenza esatta come le
  // altre sopra, perché il token fa parte del percorso (/portale/<token>, non una query string) -
  // così un link copiato/incollato è un URL "pulito" da mandare al cliente.
  // ---------------------------------------------------------------------------
  if (url.indexOf('/portale/') === 0 && req.method === 'GET') {
    const token = decodeURIComponent(url.slice('/portale/'.length)).trim();
    if (!token) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Link non valido.'); return; }
    // Serve sempre la STESSA pagina (leggera, separata dal gestionale interno - non contiene
    // nessuna delle funzionalità/dati dello studio): il token viene letto ed elaborato lato client
    // dalla pagina stessa via /api/portale-vista/<token>, non qui - vedi portale-cliente.htm.
    fs.readFile(FILE_PORTALE_CLIENTE, (err, contenuto) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Non trovo portale-cliente.htm nella cartella: ' + FILE_PORTALE_CLIENTE + '\nDeve stare nella stessa cartella di server.js e gestionale.htm.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(contenuto);
    });
    return;
  }

  if (url.indexOf('/api/portale-vista/') === 0 && req.method === 'GET') {
    const token = decodeURIComponent(url.slice('/api/portale-vista/'.length)).trim();
    const { vista, errore } = vistaPortaleCliente(token);
    if (errore) {
      // Il dettaglio (es. "manca jsdom") resta SOLO nel log del server per chi amministra il
      // gestionale: a un visitatore esterno del link basta sapere che il portale non è al momento
      // disponibile, non i dettagli della configurazione interna del server.
      console.error('[gestionale] Portale cliente non disponibile:', errore);
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errore: 'Il portale cliente non è al momento disponibile. Riprova più tardi o contatta lo studio.' }));
      return;
    }
    if (!vista) {
      // Risposta VOLUTAMENTE generica (mai "token quasi giusto"/"cliente disattivato"/ecc.): un
      // token che non corrisponde a nessun accesso attivo è indistinguibile da uno mai esistito.
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errore: 'Link non valido o non più attivo.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, vista }));
    return;
  }

  // Download di un allegato/documento dal portale esterno: il "documentoToken" è un id opaco
  // restituito dentro la vista (mai il percorso reale sul disco), e documentoPortaleCliente
  // verifica che appartenga DAVVERO al cliente di quel token prima di risolverlo - vedi
  // risolviDocumentoPortaleEsterno in gestionale.htm.
  if (url.indexOf('/api/portale-documento/') === 0 && req.method === 'GET') {
    const resto = url.slice('/api/portale-documento/'.length);
    const sep = resto.indexOf('/');
    const token = sep === -1 ? '' : decodeURIComponent(resto.slice(0, sep)).trim();
    const documentoToken = sep === -1 ? '' : decodeURIComponent(resto.slice(sep + 1)).trim();
    const risolto = (token && documentoToken) ? documentoPortaleCliente(token, documentoToken) : null;
    const assoluto = risolto ? risolviPercorsoDocumento(risolto.filePercorso) : null;
    if (!assoluto || !fs.existsSync(assoluto) || !fs.statSync(assoluto).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Documento non trovato.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeDaEstensione(assoluto),
      'Content-Disposition': `inline; filename="${encodeURIComponent(risolto.nomeFile || path.basename(assoluto))}"`,
    });
    fs.createReadStream(assoluto).pipe(res);
    return;
  }

  // Un cliente esterno scrive un messaggio nuovo (task #88): corpo {token, testo, scadenzaId?}.
  // Validazione di base qui (seconda linea di difesa, non l'unica: aggiungiMessaggioPortaleClienteEsterno
  // dentro gestionale.htm rifiuta comunque testo vuoto/tronca la lunghezza) - qui basta scartare
  // presto le richieste ovviamente malformate senza nemmeno svegliare il motore headless.
  if (url === '/api/portale-messaggio' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Richiesta non valida.' }));
        return;
      }
      const token = (dati && typeof dati.token === 'string') ? dati.token.trim() : '';
      const testo = (dati && typeof dati.testo === 'string') ? dati.testo.trim() : '';
      const scadenzaId = (dati && typeof dati.scadenzaId === 'string' && dati.scadenzaId) ? dati.scadenzaId : null;
      if (!token || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Scrivi qualcosa prima di inviare.' }));
        return;
      }
      if (testo.length > 4000) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Messaggio troppo lungo.' }));
        return;
      }
      // Allegato opzionale (task #108): il cliente ha selezionato un file dal proprio portale.
      // Va scritto su disco PRIMA di chiamare messaggioPortaleCliente, nella cartella del cliente
      // risolto dal token (mai da un id/nome che il client potrebbe falsificare nella richiesta).
      let fileInfo = null;
      if (dati && typeof dati.nomeFile === 'string' && dati.nomeFile && typeof dati.contenutoBase64 === 'string' && dati.contenutoBase64) {
        const clienteToken = risolviClienteDaTokenPortale(token);
        if (!clienteToken) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Link non valido o non più attivo.' }));
          return;
        }
        try {
          const scritto = scriviFileClienteCaricato({
            clienteId: clienteToken.id, clienteNome: clienteToken.ragioneSociale,
            sottocartella: 'Dal cliente', nomeFile: dati.nomeFile, contenutoBase64: dati.contenutoBase64,
          });
          fileInfo = { percorso: scritto.percorso, nomeFile: scritto.nomeFile, dimensione: scritto.dimensione };
        } catch (err) {
          console.error('[gestionale] Errore caricando allegato dal portale cliente:', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Allegato non caricato: ' + err.message }));
          return;
        }
      }
      const { esito, errore } = messaggioPortaleCliente(token, testo, scadenzaId, fileInfo);
      if (errore) {
        console.error('[gestionale] Messaggio portale cliente non disponibile:', errore);
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Il servizio non è al momento disponibile. Riprova più tardi o contatta lo studio.' }));
        return;
      }
      if (!esito) {
        // Token non valido/non più attivo: stessa risposta generica usata per la vista.
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Link non valido o non più attivo.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Un cliente esterno risponde a un thread esistente (task #88): corpo {token, comunicazioneId, testo}.
  if (url === '/api/portale-risposta' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Richiesta non valida.' }));
        return;
      }
      const token = (dati && typeof dati.token === 'string') ? dati.token.trim() : '';
      const comunicazioneId = (dati && typeof dati.comunicazioneId === 'string') ? dati.comunicazioneId.trim() : '';
      const testo = (dati && typeof dati.testo === 'string') ? dati.testo.trim() : '';
      if (!token || !comunicazioneId || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Scrivi qualcosa prima di rispondere.' }));
        return;
      }
      if (testo.length > 4000) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Risposta troppo lunga.' }));
        return;
      }
      // Allegato opzionale (task #108), stessa logica del messaggio nuovo sopra.
      let fileInfo = null;
      if (dati && typeof dati.nomeFile === 'string' && dati.nomeFile && typeof dati.contenutoBase64 === 'string' && dati.contenutoBase64) {
        const clienteToken = risolviClienteDaTokenPortale(token);
        if (!clienteToken) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Link non valido o non più attivo.' }));
          return;
        }
        try {
          const scritto = scriviFileClienteCaricato({
            clienteId: clienteToken.id, clienteNome: clienteToken.ragioneSociale,
            sottocartella: 'Dal cliente', nomeFile: dati.nomeFile, contenutoBase64: dati.contenutoBase64,
          });
          fileInfo = { percorso: scritto.percorso, nomeFile: scritto.nomeFile, dimensione: scritto.dimensione };
        } catch (err) {
          console.error('[gestionale] Errore caricando allegato dal portale cliente:', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Allegato non caricato: ' + err.message }));
          return;
        }
      }
      const { esito, errore } = rispostaPortaleCliente(token, comunicazioneId, testo, fileInfo);
      if (errore) {
        console.error('[gestionale] Risposta portale cliente non disponibile:', errore);
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Il servizio non è al momento disponibile. Riprova più tardi o contatta lo studio.' }));
        return;
      }
      if (!esito) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Questo messaggio non è più disponibile.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Non trovato');
});

// ---------------------------------------------------------------------------
// Avvio + banner con gli indirizzi da comunicare allo studio
// ---------------------------------------------------------------------------
function indirizziRete() {
  const interfacce = os.networkInterfaces();
  const indirizzi = [];
  Object.values(interfacce).forEach((lista) => {
    (lista || []).forEach((info) => {
      if (info.family === 'IPv4' && !info.internal) indirizzi.push(info.address);
    });
  });
  return indirizzi;
}

// Apre il browser predefinito sul PC che fa da server, cosi' avviare il server "sembra" aprire
// un'applicazione vera e propria invece di lasciare solo una finestra di terminale nera.
// Su Windows prova prima ad aprire Edge in "modalita' app" (--app): niente barra degli
// indirizzi ne' schede, quindi la finestra sembra un programma vero (tipo Claude Desktop)
// invece di un tab di un browser qualsiasi. Se Edge non e' disponibile ripiega sul browser
// predefinito normale. Va in errore in silenzio se non e' possibile aprire nulla (es. server
// senza interfaccia grafica): non e' un problema bloccante, il server funziona comunque.
function apriBrowser(url) {
  function browserNormale() {
    const comando = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
    exec(comando, (err) => { if (err) console.log('  (non sono riuscito ad aprire il browser automaticamente: aprilo tu su ' + url + ')'); });
  }
  if (process.platform === 'win32') {
    exec(`start "" msedge --app="${url}" --window-size=1360,860`, (err) => { if (err) browserNormale(); });
    return;
  }
  browserNormale();
}

// Genera/aggiorna il file che Sabrina (o chiunque altro in studio) deve aprire per collegarsi:
// un doppio click apre il browser e prova a collegarsi da solo al server su questo PC. Se il
// server non e' acceso in quel momento, lo dice chiaramente invece di mostrare un errore tecnico.
// Va rigenerato/riinviato a chi lo usa ogni volta che cambia l'indirizzo di rete di questo PC
// (capita raramente, di solito solo cambiando rete WiFi).
function scriviLauncherCollegamento(hostname, indirizzi) {
  const candidati = [];
  if (hostname) candidati.push(`http://${hostname}:${PORTA}/`);
  indirizzi.forEach((ip) => candidati.push(`http://${ip}:${PORTA}/`));
  const listaJson = JSON.stringify(candidati);
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Apertura Gestionale Studio...</title>
<style>
  body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;background:#F3F5F9;color:#161B26;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
  .box{background:#fff;border-radius:14px;padding:32px 36px;max-width:440px;box-shadow:0 6px 20px rgba(19,42,76,.10);text-align:center;}
  h1{font-size:18px;margin:0 0 10px 0;color:#132A4C;}
  p{font-size:14px;line-height:1.5;color:#444;margin:0 0 6px 0;}
  .stato{font-size:13px;color:#6B7385;margin-top:14px;}
  .errore{background:#FBE2E1;color:#B3261E;border-radius:8px;padding:12px 14px;font-size:13.5px;margin-top:16px;text-align:left;line-height:1.5;}
  button{margin-top:16px;padding:9px 18px;border-radius:8px;border:1px solid #2E63C7;background:#2E63C7;color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;}
  button:hover{background:#132A4C;}
  .spinner{width:26px;height:26px;border:3px solid #E4E8F0;border-top-color:#2E63C7;border-radius:50%;margin:0 auto 14px auto;animation:sp .7s linear infinite;}
  @keyframes sp{to{transform:rotate(360deg);}}
</style>
</head>
<body>
<div class="box">
  <div class="spinner" id="spinner"></div>
  <h1 id="titolo">Apertura Gestionale Studio...</h1>
  <p id="sotto">Mi sto collegando al PC dello studio.</p>
  <div id="erroreBox"></div>
</div>
<script>
const candidati = ${listaJson};
const titolo = document.getElementById('titolo');
const sotto = document.getElementById('sotto');
const spinner = document.getElementById('spinner');
const erroreBox = document.getElementById('erroreBox');

async function provaCollegamento() {
  spinner.style.display = '';
  titolo.textContent = 'Apertura Gestionale Studio...';
  sotto.textContent = 'Mi sto collegando al PC dello studio.';
  erroreBox.innerHTML = '';
  for (const url of candidati) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const risp = await fetch(url + 'api/stato', { signal: controller.signal });
      clearTimeout(timer);
      if (risp.ok) { window.location.href = url; return; }
    } catch (e) { /* provo il prossimo indirizzo */ }
  }
  spinner.style.display = 'none';
  titolo.textContent = 'Gestionale non raggiungibile';
  sotto.textContent = '';
  erroreBox.innerHTML = '<div class="errore">Il gestionale non risulta avviato sul PC dello studio in questo momento.<br><br>Chiedi a chi lo gestisce di aprire "Avvia Gestionale" su quel PC, poi premi Riprova.</div><button onclick="provaCollegamento()">Riprova</button>';
}
provaCollegamento();
</script>
</body>
</html>
`;
  try {
    fs.writeFileSync(FILE_LAUNCHER_COLLEGA, html, 'utf8');
    return true;
  } catch (err) {
    console.log('  (non sono riuscito a creare il file di collegamento per gli altri PC: ' + err.message + ')');
    return false;
  }
}

server.listen(PORTA, '0.0.0.0', () => {
  const indirizzi = indirizziRete();
  const hostname = os.hostname();
  const launcherCreato = scriviLauncherCollegamento(hostname, indirizzi);
  SOFFICE_PATH = trovaSoffice();

  // Snapshot di sicurezza a ogni avvio: questo server non resta sempre acceso, quindi se il PC
  // si accende più tardi delle 8/12/16 di oggi quell'orario fisso non scatterebbe mai da solo.
  eseguiBackup('avvio del server');

  console.log('');
  console.log('============================================================');
  console.log('  GESTIONALE STUDIO - server locale avviato');
  console.log('============================================================');
  console.log('');
  console.log('  Su QUESTO PC si sta aprendo il browser automaticamente.');
  console.log('  Se non si apre da solo, vai su: http://localhost:' + PORTA);
  console.log('');
  if (indirizzi.length) {
    console.log('  Dagli ALTRI PC dello studio (stessa rete WiFi/LAN) si puo\' aprire:');
    console.log('    http://' + hostname + ':' + PORTA + '   (consigliato: piu\' stabile)');
    indirizzi.forEach((ip) => console.log('    http://' + ip + ':' + PORTA));
  } else {
    console.log('  Non ho trovato un indirizzo di rete locale: se sei collegato');
    console.log('  al WiFi/cavo di rete dello studio, controlla la connessione.');
  }
  console.log('');
  if (launcherCreato) {
    console.log('  Ho creato/aggiornato il file:');
    console.log('    "Apri Gestionale (rete studio).html"');
    console.log('  nella stessa cartella. Mandalo UNA VOLTA a chi deve collegarsi da un');
    console.log('  altro PC (email, chat, chiavetta): a ogni doppio click si collega da');
    console.log('  solo, e se il server non e\' acceso lo dice chiaramente.');
    console.log('  Se in futuro cambia la rete WiFi di questo PC, rimandaglielo aggiornato.');
    console.log('');
  }
  console.log('  Nota: la PRIMA volta Windows potrebbe chiedere il permesso al');
  console.log('  firewall per Node.js sulla rete privata: scegli "Consenti l\'accesso".');
  console.log('  Senza quel permesso gli altri PC non riescono a collegarsi.');
  console.log('');
  console.log('  Dati condivisi salvati in: ' + FILE_DATI);
  console.log('');
  console.log('  Backup automatici (8:00/12:00/16:00 + a ogni avvio, storico 30 giorni) in: ' + CARTELLA_BACKUP);
  console.log('');
  if (JSDOM) {
    console.log('  Portale cliente esterno: ATTIVO. Da "Scheda cliente" puoi attivare/copiare il');
    console.log('  link di accesso per ogni cliente (/portale/...).');
  } else {
    console.log('  Portale cliente esterno: NON attivo (manca la libreria "jsdom" - vedi le');
    console.log('  istruzioni in cima a questo file: "npm install jsdom" poi riavvia).');
  }
  console.log('');
  if (SOFFICE_PATH) {
    console.log('  Strumenti > Convertitore Word/PDF/PDF-A: ATTIVO (' + SOFFICE_PATH + ').');
  } else {
    console.log('  Strumenti > Convertitore Word/PDF: NON attivo (LibreOffice non trovato su');
    console.log('  questo PC). Installalo gratis da libreoffice.org poi riavvia il server.');
  }
  console.log('');
  console.log('  Lascia questa finestra APERTA: se la chiudi, il server si');
  console.log('  spegne e la condivisione tra postazioni si interrompe (i');
  console.log('  dati restano comunque salvati nel file sopra).');
  console.log('');
  console.log('  Per fermare il server: chiudi questa finestra, oppure premi');
  console.log('  Ctrl+C qui dentro.');
  console.log('============================================================');
  console.log('');
  scriviLog('Server avviato correttamente sulla porta ' + PORTA + '.');

  // L'app desktop Electron (Prisma.exe) apre già la sua finestra: imposta questa variabile
  // prima di avviare il server per evitare che se ne apra anche una seconda col browser.
  if (!process.env.PRISMA_SKIP_AUTOOPEN) apriBrowser('http://localhost:' + PORTA + '/');
});

server.on('error', (err) => {
  scriviLog('ERRORE AVVIO SERVER: ' + (err && err.stack ? err.stack : err));
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('ERRORE: la porta ' + PORTA + ' e\' gia\' occupata (forse il server e\' gia\' acceso in un\'altra finestra?).');
    console.error('Chiudi l\'altra finestra del server, oppure chiudi e riprova.');
    console.error('');
  } else {
    console.error('ERRORE avviando il server:', err.message);
  }
  process.exit(1);
});
