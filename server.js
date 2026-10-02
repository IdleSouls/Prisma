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
const { exec, execFile, execFileSync, spawn } = require('child_process');

// Presenza operatori online (task Matteo: pallini online/offline in chat) - stato SOLO in memoria,
// mai persistito: ogni operatore manda un "sono qui" (heartbeat) periodico dal client
// (avviaHeartbeatOperatore in gestionale.htm), chi non lo manda da più di PRESENZA_TTL_MS viene
// considerato offline. Sufficiente per uno studio di poche persone sulla stessa rete locale, senza
// bisogno di WebSocket o altro.
const PRESENZA_TTL_MS = 20 * 1000; // Matteo: "il semaforo è molto lento" - ridotto da 30s, insieme a
// heartbeat 15s->8s e polling 8s->4s lato client (vedi avviaHeartbeatOperatore/avviaPollingPresenza
// in gestionale.htm): margine di sicurezza comunque ampio (TTL 2.5x l'intervallo di heartbeat,
// tollera un heartbeat perso senza far sparire nessuno online per errore).
const presenzaOperatori = new Map(); // nome operatore -> { ts: timestamp ultimo heartbeat, deviceId }
function presenzaOnlineElenco() {
  const ora = Date.now();
  const online = {};
  for (const [nome, voce] of presenzaOperatori) {
    if (ora - voce.ts <= PRESENZA_TTL_MS) online[nome] = { deviceId: voce.deviceId || null };
  }
  return online;
}
// Task Matteo #114: impedire che lo stesso nome venga usato da due postazioni/browser diversi
// insieme (attribuzioni di chat/comunicazioni sballate se "Matteo" risulta attivo in due posti).
// Non è un vero login (nessuna password, resta scelta di fiducia), quindi il controllo è "soft":
// un secondo dispositivo che tenta di scegliere un nome già occupato da un ALTRO deviceId, con
// heartbeat ancora fresco, riceve occupato:true e può comunque insistere (vedi endpoint sotto).
function presenzaOccupataDaAltroDispositivo(nome, deviceId) {
  const voce = presenzaOperatori.get(nome);
  if (!voce) return false;
  if (Date.now() - voce.ts > PRESENZA_TTL_MS) return false;
  return !!voce.deviceId && voce.deviceId !== deviceId;
}

// Task Matteo (accesso ai referenti individuale, non solo il login unico di studio sulla porta
// team): sopra questo file di presenza "soft" (nessuna password, solo un avviso aggirabile) si
// aggiunge qui un livello OPZIONALE per referente - se un responsabile ha una password impostata
// (vedi FILE_RESPONSABILI_PASSWORD più sotto, definito dopo CARTELLA), scegliere quel nome richiede
// quella password E la sessione diventa VERAMENTE esclusiva: un secondo dispositivo che prova a
// usare lo stesso nome mentre la sessione è ancora viva (heartbeat recente) viene RIFIUTATO, non
// solo avvisato - "due pc non possono accedere a Matteo insieme" (parole di Matteo). Un responsabile
// senza password impostata continua a funzionare esattamente come prima (invariato, retrocompatibile).
// nome -> { token, deviceId, ultimoHeartbeat }. Solo in memoria (come presenzaOperatori): un
// riavvio del server chiude tutte le sessioni esclusive, chi era collegato dovrà solo reinserire la
// password al prossimo heartbeat/scelta operatore, nessun dato perso.
const SESSIONE_ESCLUSIVA_TTL_MS = 45 * 1000; // un po' più largo dell'heartbeat (15s) per tollerare un giro perso
const sessioneAttivaPerNome = new Map();
function sessioneEsclusivaValida(nome, token, deviceId) {
  const sess = sessioneAttivaPerNome.get(nome);
  if (!sess) return false;
  if (Date.now() - sess.ultimoHeartbeat > SESSIONE_ESCLUSIVA_TTL_MS) return false;
  return sess.token === token && sess.deviceId === deviceId;
}

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
const È_SEA = (() => {
  try { const sea = require('node:sea'); return !!(sea && typeof sea.isSea === 'function' && sea.isSea()); }
  catch (err) { return false; }
})();
/* Task Matteo ("il riavvio del server non funziona, si chiude e basta"): prima il pulsante "Riavvia
   server" chiudeva SOLO il processo, per design - il riavvio vero e proprio andava fatto a mano
   (rilanciare "node server.js" o ririaprire l'eseguibile). Confuso per chi si aspetta un vero
   riavvio con un click. Ora, appena prima di chiudersi, il processo rilancia se stesso come
   processo FIGLIO staccato (detached, così sopravvive alla chiusura del genitore) e SOLO DOPO
   chiama process.exit(0): il nuovo processo riparte sulla stessa porta con lo stesso comando con
   cui è stato avviato questo (eseguibile pacchettizzato, o "node server.js" con gli stessi
   argomenti). Se il rilancio automatico fallisce per qualunque motivo (es. ambiente sandboxato che
   nega spawn di nuovi processi) logga l'errore ma non blocca comunque la chiusura - non peggio di
   come si comportava prima. */
function rilanciaProcesso() {
  try {
    const comando = process.execPath;
    const argomenti = È_SEA ? process.argv.slice(1) : [__filename, ...process.argv.slice(2)];
    const figlio = spawn(comando, argomenti, { cwd: CARTELLA, detached: true, stdio: 'ignore', windowsHide: false });
    figlio.unref();
    scriviLog(`Rilancio automatico del server avviato (nuovo processo PID ${figlio.pid}).`);
    return true;
  } catch (err) {
    scriviLog('Rilancio automatico del server FALLITO: ' + err.message + ' — va riavviato a mano.');
    return false;
  }
}
/* Richiesta di Matteo: non un pulsante "copia comando" da incollare a mano in un terminale, ma un
   pulsante che apre ngrok direttamente da Prisma. Stesso schema di rilanciaProcesso() qui sopra:
   processo FIGLIO STACCATO (detached), così il tunnel sopravvive anche a un riavvio del server.
   processiNgrok tiene traccia di cosa Prisma stesso ha lanciato (per porta), giusto per evitare di
   aprirne un secondo per la stessa porta con un doppio clic - non è né può essere un indicatore
   affidabile dello stato vero del tunnel (quello lo dà solo /api/ngrok-tunnels, che interroga ngrok
   stesso): ngrok potrebbe comunque essere stato avviato a mano da terminale, o essere caduto senza
   che questo processo se ne accorga. */
const processiNgrok = new Map(); // porta -> { pid, avviatoIl, terminato }
// Spostata qui (prima stava dentro gestisciRichiesta, usata solo da /api/ngrok-tunnels) perché ora
// serve anche ad avviaNgrok() per sapere se il tunnel è davvero partito - vedi commento lì sotto.
// Interroga ngrok sulla STESSA macchina, sulla sua API di ispezione locale (porta fissa 4040, non
// configurabile dall'esterno: è ngrok stesso a tenerla sempre lì quando è in esecuzione).
function interrogaNgrokLocale() {
  return new Promise((resolve, reject) => {
    const richiesta = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: 1500 }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (d) => pezzi.push(d));
      risposta.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(pezzi).toString('utf8'))); }
        catch (err) { reject(new Error('Risposta di ngrok non leggibile.')); }
      });
      risposta.on('error', reject);
    });
    richiesta.on('timeout', () => richiesta.destroy(new Error('ngrok non risponde (non è in esecuzione su questo PC?).')));
    richiesta.on('error', () => reject(new Error('ngrok non risulta in esecuzione su questo PC.')));
  });
}
function avviaNgrok(porta) {
  return new Promise((resolve) => {
    const esistente = processiNgrok.get(porta);
    if (esistente && !esistente.terminato) {
      resolve({ ok: true, giaAttivo: true, pid: esistente.pid });
      return;
    }
    // Bug trovato ANCORA dopo tre giri di fix precedenti (shell:true per l'ENOENT, la risoluzione
    // "exit" non risolveva mai la promise, poi la cattura di stdout+stderr con 'close' al posto di
    // 'exit'): Matteo continuava a vedere lo stesso messaggio generico ("si è chiuso subito dopo
    // l'avvio [...] senza scrivere nulla su schermo"), segno che il buffer restava vuoto SEMPRE,
    // non per un problema di ordine degli eventi ma perché il processo non arrivava proprio a
    // scrivere nulla prima di sparire. La causa vera: Prisma.exe è un'app Electron, e server.js
    // (quindi anche questa funzione) gira DENTRO lo stesso processo di Electron - vedi
    // electron-app/main.js, avviaServer() fa require(server.js) nello stesso processo, non lo
    // lancia come eseguibile separato. Su Windows, Electron assegna i propri processi (e di norma
    // anche i loro figli) a un "Job Object" di sistema con il limite KILL_ON_JOB_CLOSE: un
    // processo figlio nato da dentro Electron eredita quel job e Windows può terminarlo quasi
    // subito, PRIMA che faccia in tempo a scrivere alcunché - risultato tipico: nessun output e
    // codice di uscita 1, esattamente quello che si vedeva. "detached:true" su Windows prova a
    // uscire dal job solo se il job stesso lo permette esplicitamente (flag BREAKAWAY_OK), ed
    // Electron di norma non lo permette - ecco perché detached:true da solo non bastava. Prova
    // indiretta: ngrok lanciato A MANO da Matteo in un terminale normale (fuori da qualunque job
    // di Electron) ha sempre dato l'errore vero per esteso (ERR_NGROK_334) - mai questo silenzio.
    //
    // Fix: invece di tenere ngrok come figlio diretto (o figlio di un cmd.exe comunque dentro il
    // nostro stesso albero di processi), lo si lancia tramite il comando Windows "start": è il
    // sistema operativo stesso a occuparsi della creazione del processo finale, che così non
    // eredita il job di Electron - il rimedio più citato per questo preciso problema (processi
    // "a vita lunga" lanciati da dentro un'app Electron su Windows che muoiono subito). "/B" evita
    // che si apra una finestra di console (resta invisibile, coerente con windowsHide altrove).
    // Il rovescio della medaglia: con "start" il processo che TENIAMO D'OCCHIO (cmd.exe) termina
    // subito, con successo, non appena ha DATO IL VIA a ngrok - non quando ngrok stesso parte o
    // fallisce - quindi non si può più dedurre nulla dal suo codice di uscita, né leggere il suo
    // output in pipe come nei tentativi precedenti. Si usa invece l'opzione nativa "--log=<file>"
    // di ngrok per fargli scrivere il proprio log reale su disco indipendentemente da come viene
    // lanciato, e si interroga la sua API locale (la stessa di /api/ngrok-tunnels) per sapere con
    // certezza se il tunnel è davvero su: se non lo è entro pochi secondi, si legge quel file di
    // log per il motivo vero. Su macOS/Linux (dove questo problema di Job Object non esiste) si
    // mantiene il lancio diretto di sempre.
    const fileLogNgrok = path.join(CARTELLA_LOG, 'ngrok-' + porta + '.log');
    try { fs.mkdirSync(CARTELLA_LOG, { recursive: true }); fs.writeFileSync(fileLogNgrok, '', 'utf8'); } catch (err) { /* best-effort: se non si riesce a pulirlo si legge comunque quel che c'è */ }

    let comandoLanciatore, argomentiLanciatore;
    if (process.platform === 'win32') {
      const comandoNgrok = 'ngrok http ' + String(porta) + ' --log="' + fileLogNgrok + '"';
      comandoLanciatore = 'cmd.exe';
      argomentiLanciatore = ['/d', '/s', '/c', 'start', '""', '/B', comandoNgrok];
    } else {
      comandoLanciatore = 'ngrok';
      argomentiLanciatore = ['http', String(porta), '--log=' + fileLogNgrok];
    }

    let risolto = false;
    let figlio;
    try {
      figlio = spawn(comandoLanciatore, argomentiLanciatore, { cwd: CARTELLA, detached: true, stdio: 'ignore', windowsHide: true });
    } catch (err) {
      resolve({ ok: false, errore: 'Impossibile avviare ngrok: ' + err.message });
      return;
    }
    const voce = { pid: figlio.pid, avviatoIl: new Date().toISOString(), terminato: false };
    processiNgrok.set(porta, voce);
    figlio.once('error', (err) => {
      voce.terminato = true;
      if (risolto) return;
      risolto = true;
      const messaggio = err.code === 'ENOENT'
        ? 'ngrok non è installato o non è nel PATH di sistema su questo PC: scaricalo da ngrok.com e riprova.'
        : ('Impossibile avviare ngrok: ' + err.message);
      resolve({ ok: false, errore: messaggio });
    });
    figlio.unref();

    // Fino a ~5 secondi (10 tentativi ogni 500ms) per dare tempo a ngrok di aprire il tunnel e
    // comparire sulla sua API locale - stesso schema di tentativi già usato lato client su
    // /api/ngrok-tunnels, solo fatto anche qui lato server per poter dare un errore vero.
    let tentativi = 0;
    const MAX_TENTATIVI = 10;
    const controllaTunnelAttivo = () => {
      if (risolto) return;
      tentativi++;
      interrogaNgrokLocale().then((dati) => {
        if (risolto) return;
        const attivo = (dati.tunnels || []).some((t) => {
          const m = /:(\d+)\s*$/.exec(String((t.config && t.config.addr) || ''));
          return m && Number(m[1]) === porta;
        });
        if (attivo) {
          risolto = true;
          resolve({ ok: true, pid: figlio.pid });
          return;
        }
        riprovaOFallisci();
      }).catch(() => { riprovaOFallisci(); });
    };
    const riprovaOFallisci = () => {
      if (risolto) return;
      if (tentativi < MAX_TENTATIVI) { setTimeout(controllaTunnelAttivo, 500); return; }
      risolto = true;
      voce.terminato = true;
      let dettaglio = '';
      try { dettaglio = fs.readFileSync(fileLogNgrok, 'utf8').trim(); } catch (err) { /* ignora: nessun log leggibile */ }
      const messaggio = dettaglio
        ? 'ngrok non ha esposto il tunnel entro pochi secondi. Ultime righe del suo log: ' + dettaglio.split('\n').slice(-6).join(' / ')
        : 'ngrok non ha esposto il tunnel entro pochi secondi, e non ha scritto nulla nel suo log: controlla di avere configurato l\'authtoken con "ngrok config add-authtoken <token>" e che questa porta non sia già usata da un altro tunnel ngrok avviato a mano.';
      resolve({ ok: false, errore: messaggio });
    };
    setTimeout(controllaTunnelAttivo, 500);
  });
}
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
const FILE_PORTALE_SW = path.join(CARTELLA, 'portale-sw.js'); // task PWA: service worker statico del portale
const FILE_PUSH = path.join(CARTELLA, 'push-abbonamenti.json'); // task notifiche push: chiavi VAPID + sottoscrizioni
const FILE_PUSH_TMP = path.join(CARTELLA, 'push-abbonamenti.json.tmp');

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

// Confronta due stringhe di versione "x.y.z": vero solo se remota è STRETTAMENTE maggiore della
// locale - non semplicemente diversa. Task nato dall'incidente del 25/09/2026: un vecchio
// manifesto di test rimasto su GitHub con "versione":"1.0.0" (identica a VERSIONE_LOCALE) non
// avrebbe dovuto risultare "disponibile" in nessun caso, ma un controllo automatico scritto senza
// passare da QUESTA stessa funzione lo ha scaricato lo stesso. Ogni punto che decide se applicare
// un aggiornamento (manuale o automatico) deve passare da qui, un'unica fonte di verità.
function versioneENuova(remota, locale) {
  const norm = (v) => String(v || '0').trim().split('.').map((n) => parseInt(n, 10) || 0);
  const a = norm(remota), b = norm(locale);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false; // uguali: non è un aggiornamento
}

async function applicaAggiornamento(manifesto) {
  // Task Matteo (incidente 25/09/2026): MAI sovrascrivere i file di codice senza prima metterli in
  // sicurezza - senza questo, un manifesto sbagliato (vecchio, corrotto, o un domani un account
  // GitHub compromesso) cancella l'unica copia buona senza lasciare nulla da cui tornare indietro.
  eseguiBackup('prima di un aggiornamento verso la versione ' + manifesto.versione);
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
// ---------------------------------------------------------------------------
// Strumenti: unisci/dividi PDF (task #204, Matteo: "manca uno strumento per unire e dividere i
// file, possiamo implementarlo?"). Usa "pdf-lib" - libreria JavaScript pura, nessun programma
// esterno da installare sul PC (a differenza di LibreOffice per il convertitore Word/PDF qui
// sopra). Stessa filosofia di jsdom: dipendenza OPZIONALE, se non installata lo strumento resta
// visibile in Prisma ma spiega come attivarlo invece di fallire in modo oscuro. Per attivarlo:
// "npm install pdf-lib" in questa cartella, poi riavviare il server.
// ---------------------------------------------------------------------------
let PDFLib = null;
try { PDFLib = require('pdf-lib'); } catch (err) { PDFLib = null; }
async function unisciPdfBuffer(buffers) {
  const { PDFDocument } = PDFLib;
  const unito = await PDFDocument.create();
  for (const buf of buffers) {
    const sorgente = await PDFDocument.load(buf);
    const pagine = await unito.copyPages(sorgente, sorgente.getPageIndices());
    pagine.forEach(p => unito.addPage(p));
  }
  return Buffer.from(await unito.save());
}
async function numeroPaginePdfBuffer(buf) {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.load(buf);
  return doc.getPageCount();
}
// da/a sono 1-based e inclusivi (come li capisce chi non è programmatore): "da pagina 2 a pagina 5"
// prende le pagine 2,3,4,5. Vengono comunque ricondotti dentro i limiti reali del documento, così
// un intervallo scritto a mano un po' impreciso non fa fallire l'estrazione.
async function estraiPaginePdfBuffer(buf, daPagina, aPagina) {
  const { PDFDocument } = PDFLib;
  const sorgente = await PDFDocument.load(buf);
  const totale = sorgente.getPageCount();
  const da = Math.max(1, Math.min(daPagina, totale));
  const a = Math.max(da, Math.min(aPagina, totale));
  const indici = [];
  for (let i = da - 1; i <= a - 1; i++) indici.push(i);
  const nuovo = await PDFDocument.create();
  const pagine = await nuovo.copyPages(sorgente, indici);
  pagine.forEach(p => nuovo.addPage(p));
  return Buffer.from(await nuovo.save());
}
const LS_KEY_PORTALE = 'gestionaleStudioState_v1'; // deve combaciare ESATTAMENTE con LS_KEY in gestionale.htm

// Notifiche push (richiesta Matteo: avviso sul cellulare del cliente quando lo studio pubblica una
// nuova comunicazione). Come jsdom sopra: dipendenza OPZIONALE - senza "web-push" installato tutto
// il resto del server funziona come sempre, solo le notifiche restano disattivate con un messaggio
// chiaro invece di un crash. Per attivarle: "npm install web-push" in questa cartella.
let WEBPUSH = null;
try {
  WEBPUSH = require('web-push');
} catch (err) {
  WEBPUSH = null;
}

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

function vistaPortaleCliente(token, password) {
  const { win, errore } = motorePortale();
  if (!win) return { errore };
  try {
    ricaricaDatiMotorePortale(win);
    return { vista: win.costruisciVistaPortaleClienteEsterna(token, password) };
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
// Terza scrittura possibile da un cliente esterno (richiesta Matteo, campagna 770): "Ho pagato
// questa fattura" sul pannello ritenute del portale. Stesso identico schema delle due funzioni sopra.
function segnalazioneRitenutaPortaleCliente(token, ritenutaId, dataPagamento) {
  const { win, errore } = motorePortale();
  if (!win) return { errore };
  try {
    ricaricaDatiMotorePortale(win);
    const r = win.segnalaPagamentoRitenutaPortaleEsterno(token, ritenutaId, dataPagamento);
    if (!r) return { esito: null };
    scriviDati(win.getSTATE());
    notificaClientiSSE(null);
    return { esito: r };
  } catch (err) {
    console.error('[gestionale] Errore salvando una segnalazione di pagamento ritenuta dal portale cliente:', err.message);
    return { errore: 'Errore interno salvando la segnalazione.' };
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
    const argomenti = ['--headless', '--convert-to', argomentoFormato];
    // Bug (Matteo: "no export filter for ...docx found, aborting"): un .pdf, aperto da LibreOffice
    // senza indicazioni, viene importato come disegno (filtro draw_pdf_import, stesso motore di
    // Draw/Impress) - e Draw non ha NESSUN filtro di esportazione verso .docx, da cui l'errore.
    // Serve dire esplicitamente di importarlo come testo (Writer) quando la destinazione è Word.
    // Per pdfa invece va bene il comportamento di default: si esporta di nuovo in pdf (stesso motore
    // di importazione, nessuna conversione di "tipo" di documento) e filtroPdfExportPer sceglie già
    // il filtro Draw giusto per quel caso.
    if (estensioneOrigine === 'pdf' && formatoDestinazione === 'docx') argomenti.push('--infilter=writer_pdf_import');
    argomenti.push('--outdir', cartellaOutput, percorsoInput);
    execFile(SOFFICE_PATH, argomenti, { timeout: 120000 }, (err, stdout, stderr) => {
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
// Campi personalizzabili per credenziale (Entratel: utente+password+PIN, ecc. - vedi
// migraCampiCredenziali in gestionale.htm): ogni campo con segreto:true viene cifrato/decifrato
// individualmente, non solo un'unica "password" fissa. c.password resta gestito in parallelo per
// compatibilità con eventuali dati non ancora passati dalla migrazione lato client.
function cifraCredenzialiInDati(dati) {
  if (!dati || !Array.isArray(dati.credenziali)) return dati;
  return Object.assign({}, dati, { credenziali: dati.credenziali.map(c => Object.assign({}, c, {
    password: cifraCredenziale(c.password),
    campi: Array.isArray(c.campi) ? c.campi.map(campo => campo.segreto ? Object.assign({}, campo, { valore: cifraCredenziale(campo.valore) }) : campo) : c.campi,
  })) });
}
function decifraCredenzialiInDati(dati) {
  if (!dati || !Array.isArray(dati.credenziali)) return dati;
  return Object.assign({}, dati, { credenziali: dati.credenziali.map(c => Object.assign({}, c, {
    password: decifraCredenziale(c.password),
    campi: Array.isArray(c.campi) ? c.campi.map(campo => campo.segreto ? Object.assign({}, campo, { valore: decifraCredenziale(campo.valore) }) : campo) : c.campi,
  })) });
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
// Notifiche push del portale cliente (richiesta Matteo). File separato da dati-studio.json
// apposta: le sottoscrizioni push (endpoint del browser, chiavi di cifratura del dispositivo) sono
// infrastruttura del server, non un dato di business dello studio - non devono viaggiare dentro i
// backup/export di dati-studio.json né passare dal motore headless per ogni operazione banale.
// ---------------------------------------------------------------------------
function leggiPush() {
  const vuoto = { vapidPublicKey: null, vapidPrivateKey: null, abbonamenti: [] };
  try {
    if (!fs.existsSync(FILE_PUSH)) return vuoto;
    const raw = fs.readFileSync(FILE_PUSH, 'utf8');
    if (!raw.trim()) return vuoto;
    const dati = JSON.parse(raw);
    if (!Array.isArray(dati.abbonamenti)) dati.abbonamenti = [];
    return dati;
  } catch (err) {
    console.error('[gestionale] Errore leggendo push-abbonamenti.json:', err.message);
    return vuoto;
  }
}
function scriviPush(dati) {
  fs.writeFileSync(FILE_PUSH_TMP, JSON.stringify(dati), 'utf8');
  fs.renameSync(FILE_PUSH_TMP, FILE_PUSH);
}
// Genera le chiavi VAPID una sola volta (la prima volta che servono) e le riusa per sempre: sono
// l'identità del server verso i servizi push (Google/Apple/Mozilla ecc.), cambiarle invaliderebbe
// tutte le sottoscrizioni già raccolte, costringendo ogni cliente a riattivare le notifiche.
function chiaviVapid() {
  const dati = leggiPush();
  if (dati.vapidPublicKey && dati.vapidPrivateKey) return dati;
  if (!WEBPUSH) return dati;
  const coppia = WEBPUSH.generateVAPIDKeys();
  dati.vapidPublicKey = coppia.publicKey;
  dati.vapidPrivateKey = coppia.privateKey;
  scriviPush(dati);
  return dati;
}
// Manda un push a ogni sottoscrizione del cliente indicato. L'URL nel payload è SEMPRE il link
// proprio di quell'abbonamento (ab.token), mai uno "esemplare" condiviso: se un cliente ha più
// accessi/dispositivi iscritti (es. sia il legale rappresentante sia l'amministrazione, vedi
// accessi diversificati), ciascuno deve riaprire il PROPRIO link, non quello di un altro accesso.
// Le sottoscrizioni ormai scadute o revocate dal browser (il servizio push risponde 404/410)
// vengono rimosse subito: ritentare non avrebbe senso e lasciarle accumulare sporcherebbe il file.
function inviaPushAlCliente(clienteId, costruisciPayload) {
  if (!WEBPUSH) return;
  const dati = chiaviVapid();
  if (!dati.vapidPublicKey || !dati.vapidPrivateKey) return;
  const destinatari = dati.abbonamenti.filter((a) => a.clienteId === clienteId);
  if (!destinatari.length) return;
  WEBPUSH.setVapidDetails('mailto:notifiche@prisma-gestionale.local', dati.vapidPublicKey, dati.vapidPrivateKey);
  destinatari.forEach((ab) => {
    const testo = JSON.stringify(costruisciPayload(ab));
    WEBPUSH.sendNotification(ab.sub, testo).catch((err) => {
      const scaduta = err && (err.statusCode === 404 || err.statusCode === 410);
      if (scaduta) {
        const attuale = leggiPush();
        attuale.abbonamenti = attuale.abbonamenti.filter((x) => x.sub.endpoint !== ab.sub.endpoint);
        scriviPush(attuale);
      } else {
        console.error('[gestionale] Errore invio notifica push:', err && err.message);
      }
    });
  });
}
// Confronta lo stato PRIMA e DOPO un salvataggio di dati-studio.json per trovare comunicazioni
// nuove indirizzate a un cliente (non create dal cliente stesso) e mandare un push a chi si è
// iscritto - questo è l'UNICO punto in cui il server "osserva" i dati per reagire, dato che tutta
// la logica di business vive nel browser dello studio: qui ci si limita a diffare due snapshot.
function inviaPushNuoveComunicazioni(precedente, nuovo) {
  if (!WEBPUSH) return;
  try {
    const vecchiIds = new Set(((precedente && precedente.comunicazioni) || []).map((c) => c.id));
    const nuove = ((nuovo && nuovo.comunicazioni) || []).filter((c) => !vecchiIds.has(c.id) && c.direzione !== 'cliente' && c.visibilePortale !== false && c.clienteId);
    nuove.forEach((com) => {
      inviaPushAlCliente(com.clienteId, (ab) => ({
        titolo: com.oggetto || 'Nuova comunicazione dallo studio',
        corpo: (com.corpo || '').slice(0, 140),
        url: '/portale/' + ab.token,
      }));
    });
  } catch (err) {
    console.error('[gestionale] Errore controllando le nuove comunicazioni per le notifiche push:', err.message);
  }
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

// Elenco degli snapshot di codice (vedi eseguiBackupPiattaforma), raggruppati per timestamp così
// l'interfaccia può offrire "ripristina questo punto nel tempo" come un'unica azione invece di far
// scegliere file per file - il punto di tutto questo task è che un rollback come quello del
// 25/09/2026 si risolva con un clic, non con tre ripristini separati fatti a mano.
function elencoBackupPiattaforma() {
  try {
    if (!fs.existsSync(CARTELLA_BACKUP)) return [];
    const perTimestamp = {};
    const voci = fs.readdirSync(CARTELLA_BACKUP);
    FILE_PIATTAFORMA_BACKUP.forEach((nomeOriginale) => {
      const prefisso = 'piattaforma-' + nomeOriginale.replace(/\./g, '_') + '_';
      voci.filter((f) => f.startsWith(prefisso)).forEach((f) => {
        const resto = f.slice(prefisso.length); // 'YYYY-MM-DD_HH-MM-SS(_N)?.ext'
        const m = resto.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:_\d+)?\.(?:htm|js)$/);
        if (!m) return;
        const ts = m[1];
        if (!perTimestamp[ts]) perTimestamp[ts] = { timestamp: ts, file: [] };
        perTimestamp[ts].file.push({ nomeOriginale, nomeBackup: f });
      });
    });
    return Object.values(perTimestamp)
      .map((v) => {
        const stat = fs.statSync(path.join(CARTELLA_BACKUP, v.file[0].nomeBackup));
        return Object.assign({}, v, { data: stat.mtime.toISOString() });
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  } catch (err) {
    console.error('[gestionale] Errore leggendo l\'elenco backup piattaforma:', err.message);
    return [];
  }
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

// Task Matteo (dopo l'incidente del rollback aggiornamento del 25/09/2026 - un manifesto GitHub di
// test dimenticato ha sovrascritto gestionale.htm/server.js con una versione vecchissima, e non
// c'era NESSUNO snapshot del codice da cui recuperare, solo dei dati): "facciamo in modo che i
// backup contengano non solo i dati dei clienti ma di tutta la piattaforma così avremmo potuto
// risolvere questo problema con un clic". Da qui: ogni giro di backup salva anche un'istantanea dei
// file di codice della piattaforma (quelli che un aggiornamento può sovrascrivere), non solo
// dati-studio.json - stesso ritmo (8/12/16 + avvio), stessa rotazione 30 giorni, stessa dedup
// "non ricreare se identico all'ultimo". Un ripristino da qui riporta ANCHE il codice a un punto
// nel tempo preciso, non solo i dati.
const FILE_PIATTAFORMA_BACKUP = ['gestionale.htm', 'server.js', 'portale-cliente.htm'];

function pulisciBackupVecchi() {
  try {
    const soglia = Date.now() - GIORNI_DA_CONSERVARE_BACKUP * 24 * 60 * 60 * 1000;
    fs.readdirSync(CARTELLA_BACKUP)
      .filter((f) => /^(dati-studio|piattaforma-[a-zA-Z0-9_.-]+)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_\d+)?\.(json|htm|js)$/.test(f))
      .forEach((f) => {
        const percorso = path.join(CARTELLA_BACKUP, f);
        if (fs.statSync(percorso).mtimeMs < soglia) fs.unlinkSync(percorso);
      });
  } catch (err) { /* pulizia non riuscita: non blocca nulla, si ritenta al prossimo backup */ }
}

// Snapshot dei file di codice della piattaforma (non i dati) - vedi commento sopra FILE_PIATTAFORMA_BACKUP.
// Ogni file ha la propria dedup indipendente (es. server.js cambia raramente, gestionale.htm più
// spesso: non ha senso che l'uno blocchi/duplichi il backup dell'altro).
function eseguiBackupPiattaforma(motivo, suffisso) {
  const creati = [];
  for (const nomeFile of FILE_PIATTAFORMA_BACKUP) {
    try {
      const percorsoOrigine = path.join(CARTELLA, nomeFile);
      if (!fs.existsSync(percorsoOrigine)) continue; // es. portale-cliente.htm potrebbe non esistere in installazioni vecchie
      const contenuto = fs.readFileSync(percorsoOrigine, 'utf8');
      if (!contenuto.trim()) continue;
      const prefisso = 'piattaforma-' + nomeFile.replace(/\./g, '_') + '_';
      const estensione = path.extname(nomeFile); // '.htm' o '.js'
      const esistenti = fs.readdirSync(CARTELLA_BACKUP).filter((f) => f.startsWith(prefisso) && f.endsWith(estensione)).sort();
      const ultimo = esistenti[esistenti.length - 1];
      if (ultimo && fs.readFileSync(path.join(CARTELLA_BACKUP, ultimo), 'utf8') === contenuto) continue;
      const nome = nomeBackupLibero(prefisso + suffisso + estensione);
      fs.writeFileSync(path.join(CARTELLA_BACKUP, nome), contenuto, 'utf8');
      creati.push(nome);
    } catch (err) {
      console.error(`[gestionale] Errore creando il backup di "${nomeFile}":`, err.message);
    }
  }
  if (creati.length) console.log(`[gestionale] Backup piattaforma creato (${motivo}): ${creati.map(n => 'backup/' + n).join(', ')}`);
}

// motivo: solo per il log in console, non cambia il comportamento. Non crea un doppione se il
// contenuto è identico all'ultimo backup salvato (es. giornata senza nessuna modifica) - evita di
// riempire la cartella di copie inutili tenendo comunque uno storico reale quando qualcosa cambia.
function eseguiBackup(motivo) {
  try {
    fs.mkdirSync(CARTELLA_BACKUP, { recursive: true });
    const suffisso = formattaDataOraFileBackup(new Date());
    if (fs.existsSync(FILE_DATI)) {
      const contenuto = fs.readFileSync(FILE_DATI, 'utf8');
      if (contenuto.trim()) {
        const esistenti = fs.readdirSync(CARTELLA_BACKUP).filter((f) => f.startsWith('dati-studio_') && f.endsWith('.json')).sort();
        const ultimo = esistenti[esistenti.length - 1];
        if (!ultimo || fs.readFileSync(path.join(CARTELLA_BACKUP, ultimo), 'utf8') !== contenuto) {
          const nome = nomeBackupLibero('dati-studio_' + suffisso + '.json');
          fs.writeFileSync(path.join(CARTELLA_BACKUP, nome), contenuto, 'utf8');
          console.log(`[gestionale] Backup creato (${motivo}): backup/${nome}`);
        }
      }
    }
    eseguiBackupPiattaforma(motivo, suffisso);
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

// Avvisa tutti i browser collegati che il server sta per riavviarsi (pulsante "Riavvia server" in
// Impostazioni, es. dopo aver applicato un aggiornamento) - così chi ha una schermata aperta con
// dati non salvati (una modale, un campo in modifica) vede il conto alla rovescia invece di trovarsi
// la connessione interrotta senza preavviso.
function notificaRiavvioImminente(secondi) {
  const payload = 'data: ' + JSON.stringify({ tipo: 'riavvioImminente', secondi }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}
// Task Matteo (revisione del flusso: "se viene accettato da tutti avviene subito, se uno rifiuta si
// blocca"): chi ha già premuto "Ho visto, va bene" durante il conto alla rovescia attuale del
// riavvio - azzerato a ogni nuovo riavvio richiesto (vedi /api/server/riavvia). RIAVVIO_ONLINE_ATTESI
// è la lista di chi era online nel momento in cui il riavvio è stato richiesto: quando TUTTI quei
// nomi risultano in RIAVVIO_CONFERME, il riavvio parte subito invece di aspettare i 60 secondi
// interi. RIAVVIO_TIMER è il timeout in corso, così un rifiuto (vedi /api/server/riavvio-rifiuta)
// può annullarlo del tutto.
let RIAVVIO_CONFERME = [];
let RIAVVIO_ONLINE_ATTESI = [];
let RIAVVIO_TIMER = null;
function notificaRiavvioConferme() {
  const payload = 'data: ' + JSON.stringify({ tipo: 'riavvioConferme', conferme: RIAVVIO_CONFERME }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}
function notificaRiavvioAnnullato(daOperatore) {
  const payload = 'data: ' + JSON.stringify({ tipo: 'riavvioAnnullato', da: daOperatore || null }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}
// Riavvio anticipato (tutti hanno confermato prima dei 60s): avvisa anche chi NON ha ancora
// confermato/rifiutato che il conto alla rovescia si è interrotto perché si riavvia già, così il
// suo banner passa subito allo stato "sto ricaricando" invece di continuare a contare da solo fino
// al proprio timer locale (che tanto non corrisponderebbe più a quando il server si riavvia davvero).
function notificaRiavvioSubito() {
  const payload = 'data: ' + JSON.stringify({ tipo: 'riavvioSubito' }) + '\n\n';
  clientiSSE.forEach((res) => {
    try { res.write(payload); } catch (err) { /* client ormai disconnesso, ignorato */ }
  });
}
// Esegue davvero il riavvio (rilancio del processo + uscita) - richiamata sia dal timeout dei 60
// secondi sia, in anticipo, quando tutti gli online al momento della richiesta hanno confermato.
function eseguiRiavvioServerOra() {
  RIAVVIO_TIMER = null;
  rilanciaProcesso();
  process.exit(0);
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
function gestisciRichiesta(req, res) {
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
        // Snapshot PRIMA di sovrascrivere: è l'unico modo che ha server.js di accorgersi che è
        // comparsa una nuova comunicazione (non c'è un sistema eventi separato, solo questi sync
        // periodici dell'intero STATE dal browser dello studio) - serve per le notifiche push.
        const precedente = leggiDati();
        scriviDati(dati);
        inviaPushNuoveComunicazioni(precedente, dati);
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
        aggiornamentoDisponibile: versioneENuova(manifesto.versione, VERSIONE_LOCALE),
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
      .then((manifesto) => {
        // Difesa in profondità: anche se qualcosa chiama questo endpoint senza passare prima da
        // /api/aggiornamenti/verifica (es. un pulsante rimasto con dati vecchi in pagina), non si
        // applica MAI un manifesto che non sia realmente più nuovo della versione locale - stesso
        // motivo del commento su versioneENuova() più sopra.
        if (!versioneENuova(manifesto.versione, VERSIONE_LOCALE)) {
          throw new Error('Il manifesto remoto (versione ' + manifesto.versione + ') non è più recente della versione locale (' + VERSIONE_LOCALE + '): nessun aggiornamento da applicare.');
        }
        return applicaAggiornamento(manifesto);
      })
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

  if (url === '/api/presenza' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, online: presenzaOnlineElenco() }));
    return;
  }

  if (url === '/api/presenza' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const nome = String(dati.operatore || '').trim();
        const deviceId = String(dati.deviceId || '').trim() || null;
        if (nome) {
          const passwordCfg = leggiResponsabiliPassword();
          if (passwordCfg[nome]) {
            // Referente con sessione esclusiva vera: l'heartbeat DEVE portare il token ottenuto da
            // /api/operatore-login per questo stesso dispositivo, altrimenti la sessione non è (più)
            // valida - un altro dispositivo può averla presa nel frattempo, o è scaduta - e si
            // segnala sessioneScaduta così il client forza il logout invece di restare "online" in
            // modo silenziosamente sbagliato.
            const token = String(dati.token || '');
            if (!sessioneEsclusivaValida(nome, token, deviceId)) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true, sessioneScaduta: true, online: presenzaOnlineElenco() }));
              return;
            }
            sessioneAttivaPerNome.set(nome, { token, deviceId, ultimoHeartbeat: Date.now() });
            presenzaOperatori.set(nome, { ts: Date.now(), deviceId });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, occupato: false, online: presenzaOnlineElenco() }));
            return;
          }
          // Task #114 (nessuna password impostata per questo referente): comportamento invariato,
          // solo avviso "soft" aggirabile - un dispositivo diverso da quello già attivo su questo
          // nome NON sovrascrive silenziosamente la presenza (altrimenti i due dispositivi si
          // "strapperebbero" a vicenda il presidio ogni 15s) a meno che non forzi esplicitamente
          // (l'utente ha confermato l'avviso lato client di "nome già in uso altrove").
          const occupato = presenzaOccupataDaAltroDispositivo(nome, deviceId);
          if (occupato && !dati.forza) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, occupato: true, online: presenzaOnlineElenco() }));
            return;
          }
          presenzaOperatori.set(nome, { ts: Date.now(), deviceId });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, occupato: false, online: presenzaOnlineElenco() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // Stato "chi ha una password impostata" (mai la password stessa) - usato in Impostazioni per
  // mostrare il lucchetto giusto per ogni responsabile, e nel selettore operatore per sapere a chi
  // chiedere la password prima di attribuirsi quel nome.
  if (url === '/api/responsabili-password-stato' && req.method === 'GET') {
    const cfg = leggiResponsabiliPassword();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, nomiConPassword: Object.keys(cfg).filter(n => cfg[n]) }));
    return;
  }

  // Impostare/cambiare/rimuovere la password di un referente (lato amministrazione, in
  // Impostazioni) - password vuota = rimuove la protezione per quel nome, tornando al comportamento
  // "soft" di prima.
  if (url === '/api/responsabili-password' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const nome = String(dati.nome || '').trim();
        const password = String(dati.password || '');
        if (!nome) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, errore: 'Nome mancante.' })); return; }
        const cfg = leggiResponsabiliPassword();
        if (password) cfg[nome] = password; else delete cfg[nome];
        scriviResponsabiliPassword(cfg);
        // Rimuovendo la password si chiude anche un'eventuale sessione esclusiva ancora attesa per
        // quel nome: da questo momento è di nuovo un nome "libero" col solo avviso soft.
        if (!password) sessioneAttivaPerNome.delete(nome);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // Segue una rinomina/eliminazione del responsabile fatta in Impostazioni (STATE.meta.responsabili
  // vive solo lato client in dati-studio.json - il file delle password è keyed per nome esatto,
  // quindi senza questo la password resterebbe orfana sotto il vecchio nome). Nessun errore se il
  // vecchio nome non aveva una password: operazione no-op, non bloccante.
  if (url === '/api/responsabili-password-rinomina' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const vecchioNome = String(dati.vecchioNome || '').trim();
        const nuovoNome = String(dati.nuovoNome || '').trim();
        const cfg = leggiResponsabiliPassword();
        if (vecchioNome && nuovoNome && vecchioNome !== nuovoNome && cfg[vecchioNome]) {
          cfg[nuovoNome] = cfg[vecchioNome];
          delete cfg[vecchioNome];
          scriviResponsabiliPassword(cfg);
          const sess = sessioneAttivaPerNome.get(vecchioNome);
          if (sess) { sessioneAttivaPerNome.set(nuovoNome, sess); sessioneAttivaPerNome.delete(vecchioNome); }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // Login per un referente con password impostata: verifica la password e, se il nome non è già
  // occupato da un ALTRO dispositivo con sessione ancora viva, assegna un token di sessione
  // esclusiva. Se è occupato, la richiesta è RIFIUTATA (non un avviso aggirabile come per i
  // referenti senza password) - vera esclusività, come chiesto da Matteo.
  if (url === '/api/operatore-login' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const nome = String(dati.nome || '').trim();
        const password = String(dati.password || '');
        const deviceId = String(dati.deviceId || '').trim() || null;
        const cfg = leggiResponsabiliPassword();
        const passwordAttesa = cfg[nome];
        if (!passwordAttesa) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Questo referente non ha una password impostata.' }));
          return;
        }
        // confronto a tempo costante, stesso schema di autenticazioneBasicOk
        const a = Buffer.from(password);
        const b = Buffer.from(passwordAttesa);
        const passwordCorretta = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!passwordCorretta) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Password non corretta.' }));
          return;
        }
        const sessioneAttuale = sessioneAttivaPerNome.get(nome);
        const occupatoDaAltri = sessioneAttuale
          && sessioneAttuale.deviceId !== deviceId
          && (Date.now() - sessioneAttuale.ultimoHeartbeat <= SESSIONE_ESCLUSIVA_TTL_MS);
        if (occupatoDaAltri) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, occupato: true, errore: nome + ' è già collegato in questo momento da un altro dispositivo. Per usare questo nome qui, chi lo sta usando ora deve prima disconnettersi.' }));
          return;
        }
        const token = crypto.randomBytes(16).toString('hex');
        sessioneAttivaPerNome.set(nome, { token, deviceId, ultimoHeartbeat: Date.now() });
        presenzaOperatori.set(nome, { ts: Date.now(), deviceId });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, token, online: presenzaOnlineElenco() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }


  // Bug segnalato da Matteo: il pulsante "Copia link porta" copiava sempre http://localhost:<porta>
  // - un indirizzo che funziona SOLO sul PC dello studio (localhost è sempre "questo PC", per
  // chiunque altro lo apra). Serve l'IP reale in rete locale, non "localhost" (stessa funzione già
  // usata per il launcher di collegamento dei colleghi, vedi indirizziRete/scriviLauncherCollegamento).
  if (url === '/api/indirizzi-rete' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, indirizzi: indirizziRete(), hostname: os.hostname() }));
    return;
  }

  // Secondo pulsante richiesto da Matteo: il link ngrok VERO (pubblico, es. https://xxxx.ngrok-free.app),
  // non l'indirizzo di rete locale - ngrok non lo comunica a Prisma in automatico, ma lo espone lui
  // stesso in locale sulla sua API di ispezione (http://127.0.0.1:4040/api/tunnels) quando è in
  // esecuzione sullo STESSO PC del server. Interrogata qui su richiesta esplicita del pulsante (mai
  // in polling continuo: se ngrok non è aperto in quel momento fallisce in fretta - timeout corto -
  // e il client mostra un messaggio chiaro invece di un link sbagliato); interrogaNgrokLocale() ora
  // vive a livello di modulo (vedi sopra, vicino ad avviaNgrok) perché serve anche lì per sapere se
  // il tunnel è davvero partito, non solo qui.
  if (url === '/api/ngrok-tunnels' && req.method === 'GET') {
    interrogaNgrokLocale().then((dati) => {
      // Ogni tunnel espone config.addr come "http://localhost:<porta>" (o senza schema a seconda
      // della versione di ngrok): estraiamo solo il numero di porta per il confronto lato client.
      const tunnel = (dati.tunnels || []).map((t) => {
        const m = /:(\d+)\s*$/.exec(String((t.config && t.config.addr) || ''));
        return { publicUrl: t.public_url, porta: m ? Number(m[1]) : null };
      }).filter((t) => t.porta);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, tunnel }));
    }).catch((err) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errore: err.message }));
    });
    return;
  }

  if (url === '/api/avvia-ngrok' && req.method === 'POST') {
    // Task #199: una sola porta ormai, "porta" nel corpo non serve più davvero - resta accettata
    // (se presente deve combaciare) solo per non rompere eventuali chiamate già in volo da un
    // frontend non ancora aggiornato nello stesso identico momento di un redeploy.
    leggiCorpoRichiesta(req, (corpo) => {
      let richiesta;
      try { richiesta = JSON.parse(corpo || '{}'); } catch (err) { richiesta = {}; }
      if (richiesta.porta !== undefined && Number(richiesta.porta) !== PORTA_ESTERNA) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Porta non valida.' }));
        return;
      }
      avviaNgrok(PORTA_ESTERNA).then((risultato) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(risultato));
      });
    });
    return;
  }

  if (url === '/api/accesso-esterno' && req.method === 'GET') {
    const cfg = leggiConfigAccessoEsterno();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      porta: PORTA_ESTERNA,
      // "attivo" per il collaboratore significa "credenziali impostate" (vedi autenticazioneBasicOk
      // in creaServerEsterno) - non c'è più un listener separato da aprire/chiudere, vedi task #199.
      team: { utente: cfg.team.utente, password: cfg.team.password, attivo: !!(cfg.team.utente && cfg.team.password) },
      ngrokAutoavvio: cfg.ngrokAutoavvio,
    }));
    return;
  }

  // Task #173/#199: interruttore "avvia ngrok automaticamente all'avvio di Prisma" - un booleano
  // unico ora che la porta è una sola (prima era {clienti, team}, una voce a porta).
  if (url === '/api/ngrok-autoavvio' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo || '{}');
        const cfgAttuale = leggiConfigAccessoEsterno();
        const ngrokAutoavvio = dati.ngrokAutoavvio !== undefined ? !!dati.ngrokAutoavvio : cfgAttuale.ngrokAutoavvio;
        scriviConfigAccessoEsterno({ team: cfgAttuale.team, ngrokAutoavvio });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, ngrokAutoavvio }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  if (url === '/api/accesso-esterno' && req.method === 'POST') {
    // Task #199: non c'è più la porta clienti da configurare qui (non l'ha mai avuta, un login
    // condiviso) né un listener separato da aprire/chiudere per il collaboratore - "attivo" è solo
    // una funzione di utente/password non vuoti, controllata al volo da autenticazioneBasicOk.
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const utente = String(dati.utente || '').trim();
        const password = String(dati.password || '');
        const cfg = leggiConfigAccessoEsterno();
        cfg.team = { utente, password };
        scriviConfigAccessoEsterno(cfg);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, attivo: !!(utente && password) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  // Pulsante "Riavvia server" in Impostazioni: avvisa chi è collegato (con un conto alla rovescia,
  // non a sorpresa), fa un backup di sicurezza, POI rilancia se stesso come nuovo processo (vedi
  // rilanciaProcesso più sopra) e SOLO DOPO chiude quello attuale - un vero riavvio con un click,
  // non solo una chiusura (task Matteo: "il riavvio del server non funziona, si chiude e basta").
  // Task Matteo (revisione): 60 secondi di preavviso MASSIMO, ma se TUTTI gli operatori che erano
  // online nel momento della richiesta confermano ("Ho visto, va bene") prima che scadano, il
  // riavvio parte subito, senza aspettare oltre - vedi eseguiRiavvioServerOra e RIAVVIO_ONLINE_ATTESI.
  // Se invece anche un solo operatore rifiuta (/api/server/riavvio-rifiuta), il riavvio è annullato
  // del tutto: va richiesto di nuovo da Impostazioni quando si è pronti.
  if (url === '/api/server/riavvia' && req.method === 'POST') {
    const online = Object.keys(presenzaOnlineElenco());
    const secondiAttesa = 60;
    RIAVVIO_CONFERME = [];
    RIAVVIO_ONLINE_ATTESI = online.slice();
    if (RIAVVIO_TIMER) clearTimeout(RIAVVIO_TIMER);
    notificaRiavvioImminente(secondiAttesa);
    scriviLog('Riavvio manuale del server richiesto' + (online.length ? (' (utenti online: ' + online.join(', ') + ')') : '') + '.');
    eseguiBackup('prima di un riavvio manuale del server');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, secondi: secondiAttesa, online }));
    RIAVVIO_TIMER = setTimeout(eseguiRiavvioServerOra, secondiAttesa * 1000);
    return;
  }

  // Conferma di un operatore ("ho visto, va bene procedere") durante il conto alla rovescia del
  // riavvio. Se con questa conferma TUTTI quelli che erano online alla richiesta hanno ormai
  // confermato, il riavvio parte subito invece di aspettare lo scadere dei 60 secondi.
  if (url === '/api/server/riavvio-conferma' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let dati = {};
      try { dati = JSON.parse(corpo); } catch (err) { /* corpo vuoto o malformato: nessuna conferma valida */ }
      const operatore = dati && typeof dati.operatore === 'string' ? dati.operatore.trim() : '';
      if (operatore && !RIAVVIO_CONFERME.includes(operatore)) RIAVVIO_CONFERME.push(operatore);
      notificaRiavvioConferme();
      const tuttiConfermato = RIAVVIO_TIMER && RIAVVIO_ONLINE_ATTESI.length > 0
        && RIAVVIO_ONLINE_ATTESI.every((n) => RIAVVIO_CONFERME.includes(n));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, conferme: RIAVVIO_CONFERME, subito: !!tuttiConfermato }));
      if (tuttiConfermato) {
        scriviLog('Tutti gli operatori online (' + RIAVVIO_ONLINE_ATTESI.join(', ') + ') hanno confermato: riavvio anticipato.');
        clearTimeout(RIAVVIO_TIMER);
        notificaRiavvioSubito();
        // Piccolo ritardo per dare tempo a questa risposta di uscire sul socket prima che il
        // processo termini - altrimenti il fetch del client che ha appena confermato rischia di
        // vedersi la connessione interrotta invece della risposta ok:true. Il nuovo timer va
        // riassegnato a RIAVVIO_TIMER (non lasciato "libero"): altrimenti un rifiuto arrivato in
        // questa finestra di 300ms vedrebbe ancora l'id del VECCHIO timer (già scaduto/cancellato),
        // lo cancellerebbe inutilmente e notificherebbe "annullato" a tutti - ma il riavvio, non più
        // tracciato da nessuna variabile, avverrebbe comunque 300ms dopo: client convinti che sia
        // stato annullato, mentre il server si riavvia lo stesso.
        RIAVVIO_TIMER = setTimeout(eseguiRiavvioServerOra, 300);
      }
    });
    return;
  }

  // Rifiuto di un operatore ("non ora"): a differenza della conferma, questo BLOCCA davvero il
  // riavvio - viene annullato del tutto, non solo rimandato, e va richiesto di nuovo da Impostazioni
  // quando tutti sono pronti (task Matteo: "se uno rifiuta si blocca").
  if (url === '/api/server/riavvio-rifiuta' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let dati = {};
      try { dati = JSON.parse(corpo); } catch (err) { /* corpo vuoto o malformato */ }
      const operatore = dati && typeof dati.operatore === 'string' ? dati.operatore.trim() : '';
      const cEraUnRiavvioInCorso = !!RIAVVIO_TIMER;
      if (RIAVVIO_TIMER) { clearTimeout(RIAVVIO_TIMER); RIAVVIO_TIMER = null; }
      RIAVVIO_CONFERME = [];
      RIAVVIO_ONLINE_ATTESI = [];
      if (cEraUnRiavvioInCorso) {
        scriviLog('Riavvio manuale annullato' + (operatore ? (' da ' + operatore) : '') + '.');
        notificaRiavvioAnnullato(operatore);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, annullato: cEraUnRiavvioInCorso }));
    });
    return;
  }

  if (url === '/api/backup/elenco' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(elencoBackup()));
    return;
  }

  if (url === '/api/backup/elenco-piattaforma' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(elencoBackupPiattaforma()));
    return;
  }

  // Ripristina il CODICE (gestionale.htm/server.js/portale-cliente.htm) a un punto nel tempo preciso
  // - task nato dall'incidente del 25/09/2026. Prima di sovrascrivere, backup dello stato attuale
  // (anche il ripristino stesso resta reversibile). server.js viene aggiornato per l'AVVIO
  // SUCCESSIVO: il processo in corso continua a girare con il codice attuale finché non viene
  // riavviato esplicitamente (stesso principio del pulsante "Riavvia server"), non un riavvio
  // automatico e silenzioso a metà di una richiesta.
  if (url === '/api/backup/ripristina-piattaforma' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      try {
        const dati = JSON.parse(corpo);
        const timestamp = String(dati.timestamp || '');
        if (!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(timestamp)) throw new Error('Timestamp di backup non valido.');
        const voci = elencoBackupPiattaforma();
        const gruppo = voci.find((v) => v.timestamp === timestamp);
        if (!gruppo) throw new Error('Snapshot non trovato (potrebbe essere stato rimosso dalla pulizia automatica dei più vecchi di 30 giorni).');
        eseguiBackup('prima di un ripristino della piattaforma');
        const ripristinati = [];
        for (const voce of gruppo.file) {
          if (!FILE_PIATTAFORMA_BACKUP.includes(voce.nomeOriginale)) continue; // difesa in profondità, stessa whitelist degli aggiornamenti
          const percorsoBackup = path.join(CARTELLA_BACKUP, voce.nomeBackup);
          if (!fs.existsSync(percorsoBackup)) continue;
          const contenuto = fs.readFileSync(percorsoBackup, 'utf8');
          const destinazione = path.join(CARTELLA, voce.nomeOriginale);
          const temporaneo = destinazione + '.ripristino-tmp';
          fs.writeFileSync(temporaneo, contenuto, 'utf8');
          fs.renameSync(temporaneo, destinazione);
          ripristinati.push(voce.nomeOriginale);
        }
        scriviLog('Ripristino piattaforma allo snapshot ' + timestamp + ': ' + ripristinati.join(', ') + '. Serve un riavvio del server per usare questo codice.');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, file: ripristinati }));
      } catch (err) {
        console.error('[gestionale] Errore nel ripristino piattaforma da backup:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
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

  // Task #204: stesso ruolo di /api/conversione-stato sopra, ma per lo strumento Unisci/Dividi PDF.
  if (url === '/api/pdf-stato' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, disponibile: !!PDFLib }));
    return;
  }

  // Quante pagine ha il PDF appena caricato - serve all'interfaccia di "Dividi PDF" per proporre
  // un intervallo di default (1 - ultima pagina) e segnalare subito un numero fuori range.
  if (url === '/api/pdf-info' && req.method === 'POST') {
    leggiCorpoRichiesta(req, async (corpo) => {
      try {
        if (!PDFLib) throw new Error('Libreria PDF non disponibile su questo PC: vedi le istruzioni nello strumento "Dividi PDF".');
        const dati = JSON.parse(corpo);
        if (!dati.contenutoBase64) throw new Error('File mancante.');
        const buf = Buffer.from(dati.contenutoBase64, 'base64');
        const numeroPagine = await numeroPaginePdfBuffer(buf);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, numeroPagine }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'PDF non leggibile: ' + err.message }));
      }
    });
    return;
  }

  if (url === '/api/pdf-unisci' && req.method === 'POST') {
    leggiCorpoRichiesta(req, async (corpo) => {
      try {
        if (!PDFLib) throw new Error('Libreria PDF non disponibile su questo PC: installa "pdf-lib" (vedi le istruzioni nello strumento) e riavvia il server.');
        const dati = JSON.parse(corpo);
        const elenco = Array.isArray(dati.file) ? dati.file : [];
        if (elenco.length < 2) throw new Error('Servono almeno due file PDF da unire.');
        const buffers = elenco.map(f => Buffer.from(f.contenutoBase64, 'base64'));
        const unito = await unisciPdfBuffer(buffers);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, nomeFile: 'documenti-uniti.pdf', contenutoBase64: unito.toString('base64') }));
      } catch (err) {
        console.error('[gestionale] Errore unione PDF:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
      }
    });
    return;
  }

  if (url === '/api/pdf-dividi' && req.method === 'POST') {
    leggiCorpoRichiesta(req, async (corpo) => {
      try {
        if (!PDFLib) throw new Error('Libreria PDF non disponibile su questo PC: installa "pdf-lib" (vedi le istruzioni nello strumento) e riavvia il server.');
        const dati = JSON.parse(corpo);
        if (!dati.contenutoBase64) throw new Error('File mancante.');
        const da = Number(dati.da), a = Number(dati.a);
        if (!Number.isFinite(da) || !Number.isFinite(a) || da < 1 || a < da) throw new Error('Intervallo di pagine non valido.');
        const buf = Buffer.from(dati.contenutoBase64, 'base64');
        const estratto = await estraiPaginePdfBuffer(buf, da, a);
        const nomeVoluto = nomeFileSicuro(String(dati.nomeFile || 'documento'));
        const nomeBase = path.basename(nomeVoluto, path.extname(nomeVoluto));
        const nomeOutput = `${nomeBase}_pag${da}-${a}.pdf`;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, nomeFile: nomeOutput, contenutoBase64: estratto.toString('base64') }));
      } catch (err) {
        console.error('[gestionale] Errore divisione PDF:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: err.message }));
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

  // ---------------------------------------------------------------------------
  // PWA del portale cliente (richiesta Matteo: "l'app come alternativa al portale su pc"). Il
  // manifest è generato AL VOLO invece di essere un file statico perché start_url/scope devono
  // puntare al link del cliente specifico (?token=...), non a un generico "/" - un manifest
  // statico servito da un URL fisso non potrebbe farlo, vedi il commento nello script di
  // portale-cliente.htm che imposta questo href. Senza un token valido nella query, un fallback
  // neutro (start_url "/") evita comunque un errore.
  // ---------------------------------------------------------------------------
  if (url === '/portale-manifest.json' && req.method === 'GET') {
    const tokenQuery = (req.url.split('?')[1] || '').split('&').map((p) => p.split('=')).find((p) => p[0] === 'token');
    const token = tokenQuery && tokenQuery[1] ? decodeURIComponent(tokenQuery[1]) : '';
    const percorsoApp = token ? '/portale/' + encodeURIComponent(token) : '/';
    // Stessa icona già incorporata come favicon in portale-cliente.htm, riusata qui come data URI
    // (supportato per le icone del manifest dai browser Chromium/Android che contano per
    // l'installabilità) - piccola e sgranata se ingrandita, ma funzionale; un logo più curato può
    // sostituirla in futuro senza toccare altro.
    const iconaBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAE/0lEQVR42q1WTYscVRQ9576q6o/pmZ7JzBjzYSKDH0gU1ARFSYhBTYwSFYKuRBcBlQHJXheGCcF/IUHcutONCAoSAoYYRBNIJKBJJoTJV3dPpqqrq967Lqqqu3p6Embh21R19X333Hfuufc+olhiAi+YFL9GGjL7RkCh2SsxvFSVIAhAkT1UodamURq3nO31XQCAF0z4tWnSAAoolIBm/gcO2H8bbESBX4KmqkuiW2mvA8Bk3oOxjdTcMUgQILNfKHvHCMAAHNDMQgmaYFxd6mwsFN+vTUMdqCS1TwAUVBCa80Nk/2rfXYGkA6ziTwWcX5um+CaoThuvBlWQ0OIEAPIPg/gGoWYGHOaGWRQAgWwjDUFP/DrgSmxmyUIpyzkYAIhAhyxRJiw30ix9gIpfE9LkPJYoJoYQ++/shkkaltJJ9AnMXWtGZgZPelKyHtqWA7GQp/HSsN38aOHV3Qu9qE2agbEq7rMIyBrBjrBM46FzV/Ycch8eeeupI8888kbYa0mu6aES0cFhmalRBo50FD57CnoxZjbJ0a9cbNPUvffCiUZlQ+oSQIZrj4PDF+6kr2VdzVSRbIp2V2T+OLZulJ7GNt0yue3Qs593ex2hDMXVrxdV1VwCon2dlIWhiqzMjNHOHXn9fR58m50URoyYlTjZ++QHO7a+FvbaQm91DrQQLQGFcLjMwRxDARXRuMuHtsj8MfQcDft0kzy8c6Hij1mXjrapsl6GVZSdsUgwKeiG/PiYbp5l7JRZEUBEuklvbvaJ/TuORr2W0MNwLZdjFnBNdQHG0+W7svcdvvkullN4Bgo4dU5VIWJW4nT/jk8end3VTZaLQFkugqygZQgyy4wqSE16nJzh/DFaJQgHGGBM6hWPoHNqrat4lcM7F4ZKuix0VQDGr05htD8aD/fuyvwJ7tnDTgrPYIyMYH9qB2eubm42xyq+VXTTZNuG7a3w9qUbpyr+mK5SekaEX5ta1bZoPL3X5q598tlxRhYTPmLFLys82cbp5YuXz55fvEqahyea9SDoWbt95vlzV76Peh0j3mqqCeNXpoanBWEtxJgvv+b2GY2UpyKebMmvIXpgFdXw5koU/rl47eKNG57xZsbHN443RKZ+/+e7wG/kE7DUI41fnRrojIAYXVmWT7/ggYP4scVvO/w5ZKRaFxihc1xeNNTA89tR+MeVK5dvLgF8cW739fbFa3fO+151uPRyhfWnI2EdGjVWnubxLi84+EBDoYADWBSlqoP1jQRGrt5uf3Pz3Ll/bzUqj5M/FENQ8xarynpzrmhYqpp1T4euYX2nzB5g7SWYTYDChYClWu/6WbgE8IgK4BRLTv+6F/+mWAy8YFAQhThZb86VB0XRRxUuVOfob5b6y2zsZ+05mCnaFW/xDB0UHaeXUnfWur8Vy0IfCFarKOOk3pwrT8Vc1CQgAKExNAI8Bo+xsU/qr5ib52162uoFp0sAyApgSjWMVYdgrTnHta495ZkBKDSC60ImQKiGZBXwARTjdnTlAN4DvWfHtADAKrw61AIgx5Hn/YH7CFWIU4t1LcXA0o2OpzVPr2rFJWGO9b+ujH+XhJLELVWXyXSd+9ZhpCRVXRq3DNRBrRdMFEpgSUi47yR5AHimdZokXLJpZAA6G6tLjFeHrHFRWC8f2r9hiqom4VJ2+S2NHgm86qTxalzdFDFSImsrEqS61CZRGrecy6/v/wF6S16hbpzz/AAAAABJRU5ErkJggg==';
    let nomeStudio = 'Studio';
    try {
      const { win } = motorePortale();
      if (win) { ricaricaDatiMotorePortale(win); nomeStudio = (win.getSTATE().meta || {}).studioNome || 'Studio'; }
    } catch (e) { /* manifest deve funzionare comunque, con il nome generico */ }
    const manifest = {
      name: 'Portale Cliente - ' + nomeStudio,
      short_name: 'Portale',
      description: 'Il tuo spazio con lo studio: comunicazioni, scadenze e documenti.',
      start_url: percorsoApp,
      scope: percorsoApp,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#F3F5F9',
      theme_color: '#132A4C',
      lang: 'it',
      icons: [
        { src: 'data:image/png;base64,' + iconaBase64, sizes: '192x192', type: 'image/png' },
        { src: 'data:image/png;base64,' + iconaBase64, sizes: '512x512', type: 'image/png' },
      ],
    };
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
    res.end(JSON.stringify(manifest));
    return;
  }
  if (url === '/portale-sw.js' && req.method === 'GET') {
    fs.readFile(FILE_PORTALE_SW, (err, contenuto) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Service worker non trovato.'); return; }
      // Service-Worker-Allowed non serve qui (lo scope resta sotto /portale/<token>, coperto di
      // default dato che il file è servito dalla radice) - Content-Type javascript è l'unico
      // requisito perché il browser accetti di registrarlo.
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(contenuto);
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Notifiche push (richiesta Matteo). Tre endpoint: la chiave pubblica (serve al browser prima di
  // sottoscriversi), l'iscrizione e la cancellazione. Ogni iscrizione/cancellazione verifica il
  // token PASSANDO SEMPRE dal motore headless (trovaAccessoPortale, la stessa funzione che risolve
  // ogni altra richiesta del portale) - così un accesso disattivato, eliminato o senza permesso di
  // vedere le comunicazioni non può in alcun modo registrare una sottoscrizione.
  // ---------------------------------------------------------------------------
  if (url === '/portale-push-chiave' && req.method === 'GET') {
    if (!WEBPUSH) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errore: 'Notifiche non configurate su questo server.' }));
      return;
    }
    const dati = chiaviVapid();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(dati.vapidPublicKey ? { ok: true, chiave: dati.vapidPublicKey } : { ok: false, errore: 'Chiavi di notifica non disponibili.' }));
    return;
  }
  if (url === '/api/portale-push-abbonati' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      if (!WEBPUSH) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, errore: 'Notifiche non disponibili.' })); return; }
      let richiesta;
      try { richiesta = JSON.parse(corpo || '{}'); } catch (err) { richiesta = {}; }
      const token = typeof richiesta.token === 'string' ? richiesta.token : '';
      const sub = richiesta.subscription;
      if (!token || !sub || !sub.endpoint || !sub.keys) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Richiesta non valida.' }));
        return;
      }
      const { win, errore } = motorePortale();
      if (!win) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, errore: errore || 'Motore non disponibile.' })); return; }
      ricaricaDatiMotorePortale(win);
      const trovato = win.trovaAccessoPortale(token);
      // Come il resto del portale: risposta generica se il token non risolve (mai un dettaglio che
      // aiuti a distinguere "token sbagliato" da "esiste ma non ha il permesso").
      if (!trovato || !win.accessoPortalePuoVedere(trovato.accesso, 'comunicazioni')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Link non valido o senza permesso per le notifiche.' }));
        return;
      }
      const dati = chiaviVapid();
      dati.abbonamenti = dati.abbonamenti.filter((a) => a.sub.endpoint !== sub.endpoint); // niente doppioni sullo stesso dispositivo/browser
      dati.abbonamenti.push({ token, clienteId: trovato.cliente.id, sub, creatoIl: new Date().toISOString() });
      scriviPush(dati);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (url === '/api/portale-push-disabbonati' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let richiesta;
      try { richiesta = JSON.parse(corpo || '{}'); } catch (err) { richiesta = {}; }
      const endpoint = typeof richiesta.endpoint === 'string' ? richiesta.endpoint : '';
      if (endpoint) {
        const dati = leggiPush();
        dati.abbonamenti = dati.abbonamenti.filter((a) => a.sub.endpoint !== endpoint);
        scriviPush(dati);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Task (audit): la password del portale cliente viaggiava prima come query string
  // (?password=...), quindi finiva nei log di accesso del server e nella cronologia del browser -
  // canale non ideale per un segreto, anche se già correttamente urlencoded. Ora è POST con la
  // password nel body JSON, come già fatto per /api/operatore-login. Il token resta nel path
  // (identifica QUALE cliente, non è di per sé il segreto) e nella cronologia - è lo stesso link che
  // lo studio manda al cliente, non evitabile senza cambiare tutto lo schema dei link.
  if (url.indexOf('/api/portale-vista/') === 0 && req.method === 'POST') {
    const token = decodeURIComponent(url.slice('/api/portale-vista/'.length)).trim();
    leggiCorpoRichiesta(req, (corpo) => {
      let dati = {};
      try { dati = JSON.parse(corpo || '{}'); } catch (err) { /* corpo vuoto o malformato: nessuna password */ }
      const password = typeof dati.password === 'string' ? dati.password : '';
      const { vista, errore } = vistaPortaleCliente(token, password);
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
    });
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

  if (url === '/api/portale-ritenuta-pagamento' && req.method === 'POST') {
    leggiCorpoRichiesta(req, (corpo) => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Richiesta non valida.' }));
        return;
      }
      const token = (dati && typeof dati.token === 'string') ? dati.token.trim() : '';
      const ritenutaId = (dati && typeof dati.ritenutaId === 'string') ? dati.ritenutaId.trim() : '';
      const dataPagamento = (dati && typeof dati.dataPagamento === 'string') ? dati.dataPagamento.trim() : '';
      if (!token || !ritenutaId || !dataPagamento) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Indica la data in cui hai pagato la fattura.' }));
        return;
      }
      const { esito, errore } = segnalazioneRitenutaPortaleCliente(token, ritenutaId, dataPagamento);
      if (errore) {
        console.error('[gestionale] Segnalazione pagamento ritenuta dal portale non disponibile:', errore);
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Il servizio non è al momento disponibile. Riprova più tardi o contatta lo studio.' }));
        return;
      }
      if (!esito) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Questa fattura non è più disponibile, o la data indicata non è valida.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Non trovato');
}

const server = http.createServer(gestisciRichiesta);

// ---------------------------------------------------------------------------
// Accesso esterno (ngrok): UNA SOLA porta (8421) per sia il portale clienti (percorsi
// /portale/... e le API del portale, sempre aperti - un cliente non ha credenziali
// condivise, la protezione è per singolo cliente) sia l'accesso completo da collaboratore
// esterno (qualsiasi altro percorso, incluso "/": richiede Basic Auth con utente/password
// dello studio). Protetta anche da un limite di richieste per IP, perché a differenza
// della porta 8420 (solo rete locale dello studio) questa, una volta collegata a ngrok,
// è raggiungibile da tutto internet.
//
// FINO AL task #199 (Matteo: "ngrok per i clienti non funziona più" / "anche per i
// collaboratori non va") c'erano DUE porte separate (8421 clienti, 8422 collaboratori),
// ognuna col proprio tunnel ngrok. La causa reale del "non va" per entrambe: il piano
// gratuito di ngrok assegna UN SOLO dominio pubblico fisso per account (dal 2023 in poi,
// niente più sottodomini casuali diversi ad ogni avvio) - due tunnel ngrok simultanei,
// uno per porta, finiscono quindi SEMPRE in conflitto sullo stesso identico dominio
// (ERR_NGROK_334/6030), a prescindere da qualunque fix lato Prisma. Unendo le due porte
// in una sola serve UN SOLO tunnel ngrok, quindi un solo dominio: il limite del piano
// free non è più un problema. Chi ha già un piano ngrok a pagamento con più domini può
// comunque continuare a usare solo questa porta - ngrok la raggiunge lo stesso.
// ---------------------------------------------------------------------------
const PORTA_ESTERNA = 8421;
const FILE_ACCESSO_ESTERNO = path.join(CARTELLA, 'accesso-esterno.json');

// Password personale opzionale per referente (vedi commento su sessioneAttivaPerNome più sopra) -
// stesso schema di FILE_ACCESSO_ESTERNO: JSON in chiaro nella cartella dell'app, nome -> password.
const FILE_RESPONSABILI_PASSWORD = path.join(CARTELLA, 'responsabili-password.json');
function leggiResponsabiliPassword() {
  try {
    const raw = fs.readFileSync(FILE_RESPONSABILI_PASSWORD, 'utf8');
    const cfg = JSON.parse(raw);
    return (cfg && typeof cfg === 'object') ? cfg : {};
  } catch (err) {
    return {};
  }
}
function scriviResponsabiliPassword(cfg) {
  fs.writeFileSync(FILE_RESPONSABILI_PASSWORD, JSON.stringify(cfg, null, 2), 'utf8');
}

// Task #173 (Matteo: "vorrei che all'avvio di prisma sia portale clienti che porta collaboratori
// si attivassero via ngrok [...] non che siano sempre attivi ma che ad ogni avvio si avviino anche
// loro e che poi siano correttamente gestibili dalle impostazioni"): ngrokAutoavvio decide se
// avviaNgrokAutomaticoSeConfigurato() (vedi più sotto) lancia ngrok da solo ad ogni avvio del
// server. Default true quando il file non esiste ancora/non ha il campo (installazione esistente
// che si aggiorna a questa versione): è il comportamento che Matteo ha chiesto diventi lo
// standard, non un'opzione da accendere a mano.
//
// Task #199 (fix "ngrok non funziona"): fino a qui ngrokAutoavvio era un oggetto {clienti, team} -
// una porta/tunnel ciascuno. Con l'unione delle due porte in una sola (vedi commento sopra
// PORTA_ESTERNA) serve un solo interruttore. Il campo "clienti" nel file resta letto SOLO per
// MIGRARE in automatico le installazioni esistenti (come quella di Matteo) senza perdere la loro
// preferenza: se anche solo una delle due vecchie porte aveva l'auto-avvio attivo, lo resta
// anche nella versione unificata (comportamento più permissivo = quello che l'utente già aveva
// scelto per almeno una delle due). Il campo "clienti" sotto utente/password non serve più (la
// porta clienti non ha mai avuto credenziali proprie) ma resta ignorato senza errori se letto da
// un file vecchio, non viene più riscritto da scriviConfigAccessoEsterno in poi.
function leggiConfigAccessoEsterno() {
  try {
    const raw = fs.readFileSync(FILE_ACCESSO_ESTERNO, 'utf8');
    const cfg = JSON.parse(raw);
    const auto = cfg.ngrokAutoavvio;
    const ngrokAutoavvio = (auto && typeof auto === 'object')
      ? (auto.clienti !== false || auto.team !== false) // formato vecchio {clienti,team}: migra a true se almeno una era true
      : (auto !== false); // formato nuovo (booleano) o campo assente: default true
    return {
      team: { utente: (cfg.team && cfg.team.utente) || '', password: (cfg.team && cfg.team.password) || '' },
      ngrokAutoavvio,
    };
  } catch (err) {
    return { team: { utente: '', password: '' }, ngrokAutoavvio: true };
  }
}
function scriviConfigAccessoEsterno(cfg) {
  fs.writeFileSync(FILE_ACCESSO_ESTERNO, JSON.stringify(cfg, null, 2), 'utf8');
}

// Rate limiting semplice in memoria: finestra scorrevole di 60 secondi, per IP + per porta
// (così un IP che spam-a la porta clienti non blocca anche quella del team). Pensato per
// scoraggiare bot/scanner automatici su ngrok, non per un traffico legittimo dello studio.
const RATE_LIMIT_FINESTRA_MS = 60 * 1000;
const RATE_LIMIT_MAX_RICHIESTE = 120;
const rateLimitContatori = new Map(); // "porta:ip" -> [timestamps]
function rateLimitOk(porta, ip) {
  const chiave = porta + ':' + ip;
  const ora = Date.now();
  let lista = rateLimitContatori.get(chiave) || [];
  lista = lista.filter((t) => ora - t < RATE_LIMIT_FINESTRA_MS);
  if (lista.length >= RATE_LIMIT_MAX_RICHIESTE) {
    rateLimitContatori.set(chiave, lista);
    return false;
  }
  lista.push(ora);
  rateLimitContatori.set(chiave, lista);
  return true;
}
// pulizia periodica per non far crescere la Map all'infinito con IP che non tornano più
setInterval(() => {
  const ora = Date.now();
  for (const [chiave, lista] of rateLimitContatori) {
    const filtrata = lista.filter((t) => ora - t < RATE_LIMIT_FINESTRA_MS);
    if (filtrata.length === 0) rateLimitContatori.delete(chiave);
    else rateLimitContatori.set(chiave, filtrata);
  }
}, RATE_LIMIT_FINESTRA_MS).unref();
// Stessa pulizia periodica per le sessioni esclusive dei referenti (vedi sessioneAttivaPerNome più
// sopra): senza questa, una sessione scaduta (nessun heartbeat da più di SESSIONE_ESCLUSIVA_TTL_MS)
// resterebbe comunque in memoria finché non si sovrascrive lo stesso nome - non è un leak concreto
// (la mappa ha al più un numero di chiavi pari ai referenti configurati) ma è coerente con
// rateLimitContatori tenerla ripulita lo stesso.
setInterval(() => {
  const ora = Date.now();
  for (const [nome, sess] of sessioneAttivaPerNome) {
    if (ora - sess.ultimoHeartbeat > SESSIONE_ESCLUSIVA_TTL_MS) sessioneAttivaPerNome.delete(nome);
  }
}, SESSIONE_ESCLUSIVA_TTL_MS).unref();

function autenticazioneBasicOk(req, tipo) {
  const cfg = leggiConfigAccessoEsterno()[tipo];
  if (!cfg || !cfg.utente || !cfg.password) return false; // non configurato = accesso esterno disattivato di fatto
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return false;
    const utente = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);
    // confronto a tempo costante per evitare timing attack banali
    const a = Buffer.from(utente + ':' + password);
    const b = Buffer.from(cfg.utente + ':' + cfg.password);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

function chiediBasicAuth(res, realm) {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="' + realm + '"', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Accesso non autorizzato.');
}

// Task #199: le due porte/server separati sono diventati UNO solo (vedi commento sopra
// PORTA_ESTERNA per il perché). La distinzione clienti/collaboratori non è più per PORTA, ma per
// PERCORSO: i percorsi del portale clienti restano aperti senza login condiviso (protezione per
// singolo cliente, token nel link + eventuale password sua propria - vedi
// costruisciVistaPortaleClienteEsterna/portalePassword in gestionale.htm), QUALSIASI altro percorso
// (compreso "/") richiede il login Basic Auth dello studio per l'accesso completo da collaboratore.
function creaServerEsterno() {
  return http.createServer((req, res) => {
    const ip = (req.socket && req.socket.remoteAddress) || 'sconosciuto';
    if (!rateLimitOk(PORTA_ESTERNA, ip)) {
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' });
      res.end('Troppe richieste. Riprova tra un minuto.');
      return;
    }
    const url = req.url.split('?')[0];
    const percorsoPortale = url.indexOf('/portale/') === 0 || url.indexOf('/api/portale-') === 0 || url === '/portale-manifest.json' || url === '/portale-sw.js' || url === '/portale-push-chiave';
    if (percorsoPortale) {
      gestisciRichiesta(req, res); // portale cliente: sempre aperto, nessun login condiviso
      return;
    }
    // Qualsiasi altro percorso, "/" compreso: accesso completo come se si fosse in studio, serve il
    // login del collaboratore. Se non configurato (utente/password vuoti) autenticazioneBasicOk
    // restituisce sempre false: l'accesso resta di fatto disattivato, senza bisogno di un listener
    // separato da aprire/chiudere come prima.
    if (!autenticazioneBasicOk(req, 'team')) {
      chiediBasicAuth(res, 'Accesso Prisma');
      return;
    }
    gestisciRichiesta(req, res);
  });
}

const serverEsterno = creaServerEsterno();

function avviaServerEsterniSeConfigurati() {
  // Si avvia SEMPRE: il portale clienti non ha mai avuto bisogno di credenziali salvate per
  // essere raggiungibile, e ora che condivide la porta con l'accesso collaboratori non c'è più un
  // secondo listener da aprire solo se configurato - l'accesso completo resta comunque bloccato
  // dal login finché utente/password non sono impostati (vedi creaServerEsterno sopra).
  if (!serverEsterno.listening) {
    serverEsterno.listen(PORTA_ESTERNA, '0.0.0.0', () => {
      console.log('  Accesso esterno (portale clienti + collaboratori) attivo su porta ' + PORTA_ESTERNA + ' (collega ngrok a questa porta).');
    });
  }
}

/* Task #173 (Matteo: "vorrei che all'avvio di prisma [...] si attivasse via ngrok [...] non che
   sia sempre attiva ma che ad ogni avvio si avvii anche lei"): chiamata DOPO
   avviaServerEsterniSeConfigurati() qui sopra, così la porta locale è già in ascolto quando ngrok
   (che impiega comunque un paio di secondi a esporre il tunnel) comincia a collegarsi. Non blocca
   né rallenta l'avvio del server: ngrok parte come processo staccato (vedi avviaNgrok), qui si
   aspetta solo l'esito per loggarlo.

   Task #199 (fix "ngrok non funziona"): un solo tunnel ora, non più due - niente più rischio che
   i due finiscano in conflitto sull'unico dominio pubblico del piano ngrok gratuito (vedi
   commento sopra PORTA_ESTERNA). L'esito finisce anche in scriviLog(), non solo in console.log:
   Prisma.exe di norma gira senza finestra nera (vedi "Avvia Prisma (senza finestra nera).vbs"),
   quindi quel console.log non lo vede nessuno - prima un fallimento era completamente invisibile,
   ora resta sempre una traccia in logs/prisma.log da controllare. */
function avviaNgrokAutomaticoSeConfigurato() {
  const cfg = leggiConfigAccessoEsterno();
  if (!cfg.ngrokAutoavvio) return;
  avviaNgrok(PORTA_ESTERNA).then((r) => {
    const messaggio = r.ok ? 'ngrok (auto-avvio) avviato per la porta ' + PORTA_ESTERNA + '.' : 'ngrok (auto-avvio) NON avviato: ' + r.errore;
    console.log('  ' + messaggio);
    scriviLog(messaggio);
  });
}

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

  avviaServerEsterniSeConfigurati();
  avviaNgrokAutomaticoSeConfigurato();

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
