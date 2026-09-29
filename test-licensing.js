/*
 * Test standalone (non jsdom - questa è logica Node pura, senza DOM) per il
 * sistema di licenze di Prisma: licensing/lib.js, genera-chiavi.js,
 * genera-licenza.js, installer.js, e il gate di verifica in server.js.
 *
 * Uso: node test-licensing.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

let errori = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  ASSERT FALLITO: ' + msg); errori++; }
  else console.log('  ok: ' + msg);
}

const CARTELLA_TEST = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-lic-test-'));
console.log('Cartella di lavoro test: ' + CARTELLA_TEST);

const LIB = require('./licensing/lib.js');

// ---------------------------------------------------------------------------
console.log('\n--- 1) calcolaFingerprint() ---');
const fp1 = LIB.calcolaFingerprint();
const fp2 = LIB.calcolaFingerprint();
assert(typeof fp1 === 'string' && fp1.length > 0, 'ritorna una stringa non vuota');
assert(fp1 === fp2, 'è deterministico (stesso valore a chiamate ripetute)');
assert(/^[0-9A-F]{4}(-[0-9A-F]{4}){5}$/.test(fp1), 'formato leggibile a gruppi di 4 (es. ' + fp1 + ')');

// ---------------------------------------------------------------------------
console.log('\n--- 2) generaChiavi() + firmaLicenza() + verificaLicenza() - percorso valido ---');
const { chiavePubblica, chiavePrivata } = LIB.generaChiavi();
assert(chiavePubblica.includes('PUBLIC KEY'), 'chiave pubblica in formato PEM');
assert(chiavePrivata.includes('PRIVATE KEY'), 'chiave privata in formato PEM');

const datiLicenza = { studio: 'Studio Di Prova SRL', fingerprint: fp1, emessaIl: '2026-09-17', id: 'test-1' };
const licenzaFirmata = LIB.firmaLicenza(datiLicenza, chiavePrivata);
assert(typeof licenzaFirmata.firma === 'string' && licenzaFirmata.firma.length > 0, 'la licenza firmata ha un campo "firma"');

const esitoOk = LIB.verificaLicenza(licenzaFirmata, chiavePubblica);
assert(esitoOk.valida === true, 'una licenza genuina, con fingerprint corrente, verifica valida');
assert(esitoOk.dati.studio === 'Studio Di Prova SRL', 'i dati verificati riportano lo studio corretto');

// Salva questa coppia (chiavePubblica/chiavePrivata) su file: la riuso più sotto per i test di
// installer.js e server.js, così firma e verifica usano SEMPRE la stessa coppia di chiavi.
const FILE_CHIAVE_PUBBLICA_TEST = path.join(CARTELLA_TEST, 'chiave-pubblica-condivisa.pem');
fs.writeFileSync(FILE_CHIAVE_PUBBLICA_TEST, chiavePubblica, 'utf8');

// ---------------------------------------------------------------------------
console.log('\n--- 3) verificaLicenza() rifiuta manomissioni ---');
const licenzaManomessa = { ...licenzaFirmata, studio: 'Studio Diverso SRL' }; // cambio un campo dopo la firma
const esitoManomessa = LIB.verificaLicenza(licenzaManomessa, chiavePubblica);
assert(esitoManomessa.valida === false, 'una licenza con un campo alterato dopo la firma viene rifiutata');
assert(/firma non valida/.test(esitoManomessa.motivo), 'motivo del rifiuto: firma non valida (' + esitoManomessa.motivo + ')');

const licenzaFingerprintErrato = LIB.firmaLicenza({ ...datiLicenza, fingerprint: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF' }, chiavePrivata);
const esitoFingerprintErrato = LIB.verificaLicenza(licenzaFingerprintErrato, chiavePubblica);
assert(esitoFingerprintErrato.valida === false, 'una licenza firmata correttamente ma per un\'altra macchina viene rifiutata');
assert(esitoFingerprintErrato.motivo === 'questa licenza è associata a un altro computer', 'motivo corretto: ' + esitoFingerprintErrato.motivo);

const licenzaScaduta = LIB.firmaLicenza({ ...datiLicenza, scadenza: '2020-01-01' }, chiavePrivata);
const esitoScaduta = LIB.verificaLicenza(licenzaScaduta, chiavePubblica);
assert(esitoScaduta.valida === false, 'una licenza con data di scadenza passata viene rifiutata');
assert(/scaduta/.test(esitoScaduta.motivo), 'motivo: ' + esitoScaduta.motivo);

const licenzaFutura = LIB.firmaLicenza({ ...datiLicenza, scadenza: '2099-01-01' }, chiavePrivata);
const esitoFutura = LIB.verificaLicenza(licenzaFutura, chiavePubblica);
assert(esitoFutura.valida === true, 'una licenza con scadenza futura resta valida');

const chiavePubblicaSbagliata = LIB.generaChiavi().chiavePubblica;
const esitoChiaveSbagliata = LIB.verificaLicenza(licenzaFirmata, chiavePubblicaSbagliata);
assert(esitoChiaveSbagliata.valida === false, 'una licenza verificata con la chiave pubblica SBAGLIATA viene rifiutata');

// ---------------------------------------------------------------------------
console.log('\n--- 4) genera-chiavi.js + genera-licenza.js (CLI reali) ---');
const cartellaLicensingTest = path.join(CARTELLA_TEST, 'licensing');
fs.mkdirSync(cartellaLicensingTest, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'licensing', 'lib.js'), path.join(cartellaLicensingTest, 'lib.js'));
fs.copyFileSync(path.join(__dirname, 'licensing', 'genera-chiavi.js'), path.join(cartellaLicensingTest, 'genera-chiavi.js'));
fs.copyFileSync(path.join(__dirname, 'licensing', 'genera-licenza.js'), path.join(cartellaLicensingTest, 'genera-licenza.js'));

execFileSync('node', ['genera-chiavi.js'], { cwd: cartellaLicensingTest });
assert(fs.existsSync(path.join(cartellaLicensingTest, 'chiave-privata.pem')), 'genera-chiavi.js crea chiave-privata.pem');
assert(fs.existsSync(path.join(cartellaLicensingTest, 'chiave-pubblica.pem')), 'genera-chiavi.js crea chiave-pubblica.pem');

let erroreSuSecondaEsecuzione = null;
try {
  execFileSync('node', ['genera-chiavi.js'], { cwd: cartellaLicensingTest, stdio: 'pipe' });
} catch (err) { erroreSuSecondaEsecuzione = err; }
assert(erroreSuSecondaEsecuzione !== null, 'genera-chiavi.js si rifiuta di sovrascrivere chiavi esistenti senza --forza');

execFileSync('node', ['genera-licenza.js', '--studio', 'Studio CLI Test', '--fingerprint', fp1, '--scadenza', '2099-12-31'], { cwd: cartellaLicensingTest });
const fileLicenzaCli = path.join(cartellaLicensingTest, 'emesse', 'studio-cli-test', 'license.json');
assert(fs.existsSync(fileLicenzaCli), 'genera-licenza.js scrive license.json nella cartella emesse/<slug>/');
const licenzaCli = JSON.parse(fs.readFileSync(fileLicenzaCli, 'utf8'));
const chiavePubblicaCli = fs.readFileSync(path.join(cartellaLicensingTest, 'chiave-pubblica.pem'), 'utf8');
const esitoCli = LIB.verificaLicenza(licenzaCli, chiavePubblicaCli);
assert(esitoCli.valida === true, 'la licenza generata dalla CLI verifica valida con la libreria condivisa');
const registro = JSON.parse(fs.readFileSync(path.join(cartellaLicensingTest, 'emesse', 'registro-licenze.json'), 'utf8'));
assert(Array.isArray(registro) && registro.length === 1 && registro[0].studio === 'Studio CLI Test', 'il registro locale delle licenze emesse viene aggiornato');

// ---------------------------------------------------------------------------
console.log('\n--- 5) installer.js - chiavetta USB simulata ---');
const USB_SIM = path.join(CARTELLA_TEST, 'usb-simulata');
const DEST_SIM = path.join(CARTELLA_TEST, 'destinazione-pc-cliente');
fs.mkdirSync(USB_SIM, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'licensing', 'lib.js'), path.join(USB_SIM, 'lib.js'));
fs.copyFileSync(path.join(cartellaLicensingTest, 'chiave-pubblica.pem'), path.join(USB_SIM, 'chiave-pubblica.pem'));
fs.writeFileSync(path.join(USB_SIM, 'gestionale.htm'), '<html>gestionale finto per il test</html>');
fs.writeFileSync(path.join(USB_SIM, 'server.js'), '// server finto per il test');

function eseguiInstaller(env) {
  return execFileSync('node', [path.join(__dirname, 'licensing', 'installer.js')], {
    cwd: USB_SIM,
    env: { ...process.env, PRISMA_INSTALLER_ROOT: USB_SIM, PRISMA_INSTALL_DEST: DEST_SIM, PRISMA_INSTALLER_TEST: '1' }
  }).toString();
}

// 5a) Primo avvio: nessuna licenza precaricata -> copia i file, mostra il fingerprint, marca come usata
let out1 = eseguiInstaller();
assert(fs.existsSync(path.join(DEST_SIM, 'gestionale.htm')), 'installer copia gestionale.htm nella cartella di destinazione');
assert(fs.existsSync(path.join(DEST_SIM, 'licensing', 'lib.js')), 'installer copia licensing/lib.js nella destinazione');
assert(!fs.existsSync(path.join(DEST_SIM, 'licensing', 'chiave-privata.pem')), 'installer NON copia mai chiave-privata.pem (non esiste nemmeno sulla USB simulata, ma verifichiamo la cartella dest comunque)');
assert(fs.existsSync(path.join(USB_SIM, 'attivazione.json')), 'installer marca la chiavetta come usata (attivazione.json)');
assert(fs.existsSync(path.join(USB_SIM, 'CERTIFICATO.txt')), 'installer scrive il certificato sulla chiavetta');
assert(fs.existsSync(path.join(USB_SIM, 'il-tuo-codice-macchina.txt')), 'installer scrive il fingerprint su file (nessuna licenza precaricata)');
const attivazione1 = JSON.parse(fs.readFileSync(path.join(USB_SIM, 'attivazione.json'), 'utf8'));
assert(attivazione1.usata === true, 'attivazione.json riporta usata:true');
assert(attivazione1.studio === null, 'nessuno studio attivato automaticamente (nessuna licenza precaricata)');

// 5b) Riuso della stessa chiavetta -> deve rifiutarsi, senza toccare una NUOVA destinazione
const DEST_SIM_2 = path.join(CARTELLA_TEST, 'destinazione-pc-cliente-2');
const out2 = execFileSync('node', [path.join(__dirname, 'licensing', 'installer.js')], {
  cwd: USB_SIM,
  env: { ...process.env, PRISMA_INSTALLER_ROOT: USB_SIM, PRISMA_INSTALL_DEST: DEST_SIM_2, PRISMA_INSTALLER_TEST: '1' }
}).toString();
assert(/già stata attivata/.test(out2), 'installer rifiuta di reinstallare da una chiavetta già usata (messaggio corretto)');
assert(!fs.existsSync(DEST_SIM_2), 'installer NON crea una seconda installazione da una chiavetta già usata');

// 5c) Chiavetta con licenza precaricata per il fingerprint corretto -> attivazione automatica
const USB_SIM_B = path.join(CARTELLA_TEST, 'usb-simulata-b');
const DEST_SIM_B = path.join(CARTELLA_TEST, 'destinazione-b');
fs.mkdirSync(USB_SIM_B, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'licensing', 'lib.js'), path.join(USB_SIM_B, 'lib.js'));
fs.copyFileSync(FILE_CHIAVE_PUBBLICA_TEST, path.join(USB_SIM_B, 'chiave-pubblica.pem'));
fs.writeFileSync(path.join(USB_SIM_B, 'gestionale.htm'), '<html>gestionale finto</html>');
const licenzaPrecaricata = LIB.firmaLicenza({ studio: 'Studio Precaricato SRL', fingerprint: fp1, emessaIl: '2026-09-17', id: 'pre-1' }, chiavePrivata);
fs.writeFileSync(path.join(USB_SIM_B, 'license.json'), JSON.stringify(licenzaPrecaricata, null, 2));
const out3 = execFileSync('node', [path.join(__dirname, 'licensing', 'installer.js')], {
  cwd: USB_SIM_B,
  env: { ...process.env, PRISMA_INSTALLER_ROOT: USB_SIM_B, PRISMA_INSTALL_DEST: DEST_SIM_B, PRISMA_INSTALLER_TEST: '1' }
}).toString();
assert(/attivata automaticamente per "Studio Precaricato SRL"/.test(out3), 'installer attiva in automatico una licenza precaricata valida (output: verificato)');
assert(fs.existsSync(path.join(DEST_SIM_B, 'license.json')), 'installer copia license.json nella destinazione');
const attivazioneB = JSON.parse(fs.readFileSync(path.join(USB_SIM_B, 'attivazione.json'), 'utf8'));
assert(attivazioneB.studio === 'Studio Precaricato SRL', 'attivazione.json riporta lo studio attivato automaticamente');

// ---------------------------------------------------------------------------
console.log('\n--- 6) Gate di verifica in server.js (sottoprocesso reale) ---');
function preparaCartellaServer(nome, { conLicensing, licenzaValida }) {
  const cartella = path.join(CARTELLA_TEST, nome);
  fs.mkdirSync(cartella, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(cartella, 'server.js'));
  fs.copyFileSync(path.join(__dirname, 'email.js'), path.join(cartella, 'email.js')); // server.js lo richiede da task #13 - senza, il sottoprocesso non parte affatto (MODULE_NOT_FOUND)
  fs.writeFileSync(path.join(cartella, 'gestionale.htm'), '<html><body>finto</body></html>');
  if (conLicensing) {
    const cLic = path.join(cartella, 'licensing');
    fs.mkdirSync(cLic, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'licensing', 'lib.js'), path.join(cLic, 'lib.js'));
    fs.copyFileSync(FILE_CHIAVE_PUBBLICA_TEST, path.join(cLic, 'chiave-pubblica.pem'));
    if (licenzaValida === true) {
      const lic = LIB.firmaLicenza({ studio: 'Studio Server Test', fingerprint: fp1, emessaIl: '2026-09-17', id: 'srv-1' }, chiavePrivata);
      fs.writeFileSync(path.join(cartella, 'license.json'), JSON.stringify(lic, null, 2));
    } else if (licenzaValida === 'scaduta') {
      const lic = LIB.firmaLicenza({ studio: 'Studio Server Test', fingerprint: fp1, emessaIl: '2020-01-01', scadenza: '2020-06-01', id: 'srv-2' }, chiavePrivata);
      fs.writeFileSync(path.join(cartella, 'license.json'), JSON.stringify(lic, null, 2));
    } // licenzaValida === false -> nessun license.json
  }
  return cartella;
}

function avviaServerBreve(cartella) {
  return new Promise((resolve) => {
    const proc = spawn('node', ['server.js'], { cwd: cartella });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => out += d.toString());
    proc.on('exit', (code) => resolve({ out, code, uscitoDaSolo: true }));
    setTimeout(() => {
      if (!proc.killed) { proc.kill(); resolve({ out, code: null, uscitoDaSolo: false }); }
    }, 2500);
  });
}

// AGGIORNATO (task licensing online): il gate di server.js NON blocca più l'avvio in nessun caso -
// una licenza mancante/scaduta/non valida porta a "sola lettura" (STATO_LICENZA.soleLettura), MAI
// a process.exit(1). Questo è un cambio di comportamento DELIBERATO, chiesto esplicitamente da
// Matteo ("se la licenza scade si passa solo in lettura del passato"), non una regressione - le
// asserzioni qui sotto sono state riscritte per riflettere il comportamento attuale invece del
// vecchio blocco rigido. Il server logga lo stato ma continua sempre a rispondere.
(async () => {
  const cSenzaLicensing = preparaCartellaServer('server-senza-licensing', { conLicensing: false });
  const rSenzaLicensing = await avviaServerBreve(cSenzaLicensing);
  assert(!rSenzaLicensing.uscitoDaSolo || rSenzaLicensing.code !== 1, 'senza cartella licensing/ (uso interno Matteo): nessun controllo licenza, server parte normalmente e non si ferma');

  const cSenzaFile = preparaCartellaServer('server-senza-license-json', { conLicensing: true, licenzaValida: false });
  const rSenzaFile = await avviaServerBreve(cSenzaFile);
  assert(!rSenzaFile.uscitoDaSolo, 'con licensing/ attivo ma senza license.json: il server NON si ferma, parte in sola lettura');
  // scriviLog() scrive su logs/prisma.log, non su stdout (a differenza del console.log per il caso
  // "licenza valida" più sotto) - va letto dal file, non cercato nell'output catturato del processo.
  const logSenzaFile = fs.existsSync(path.join(cSenzaFile, 'logs', 'prisma.log')) ? fs.readFileSync(path.join(cSenzaFile, 'logs', 'prisma.log'), 'utf8') : '';
  assert(/non ancora attivata/.test(logSenzaFile), 'il log (logs/prisma.log) segnala "non ancora attivata" (mai attivata su questo computer)');

  const cScaduta = preparaCartellaServer('server-licenza-scaduta', { conLicensing: true, licenzaValida: 'scaduta' });
  const rScaduta = await avviaServerBreve(cScaduta);
  assert(!rScaduta.uscitoDaSolo, 'con licenza scaduta: il server NON si ferma, parte in sola lettura');
  assert(/scaduta/.test(rScaduta.out), 'il log menziona la scadenza');

  const cValida = preparaCartellaServer('server-licenza-valida', { conLicensing: true, licenzaValida: true });
  const rValida = await avviaServerBreve(cValida);
  assert(/Licenza Prisma attiva per: Studio Server Test/.test(rValida.out), 'con licenza valida: il server stampa conferma e prosegue normalmente');

  console.log('\n' + (errori === 0 ? ('TUTTI I TEST LICENSING PASSATI') : (errori + ' TEST FALLITI')));
  process.exit(errori === 0 ? 0 : 1);
})();
