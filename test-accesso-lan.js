/* Test del cancello di accesso per dispositivi sulla rete locale (server.js, porta di prova).
   Uso: node test-accesso-lan.js   - avvia un server temporaneo con cartelle dati temporanee. */
const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-lan-')); const PORTA = 18420 + Math.floor(Math.random() * 500);
const env = Object.assign({}, process.env, { PRISMA_PORTA: String(PORTA), PRISMA_DIR_DATI: dir, PRISMA_DIR_DOCUMENTI: path.join(dir, 'doc'), PRISMA_DIR_LOG: path.join(dir, 'log'), PRISMA_DIR_BACKUP: path.join(dir, 'bk'), PRISMA_SKIP_AUTOOPEN: '1' });
// Copia di server.js in una cartella temporanea SENZA licensing/: cosi' il controllo licenza non scatta.
for (const f of ['server.js', 'gestionale.htm', 'portale-cliente.htm', 'portale-sw.js', 'package.json']) { try { fs.copyFileSync(path.join(__dirname, f), path.join(dir, f)); } catch (e) { /* facoltativo */ } }
env.NODE_PATH = path.join(__dirname, 'node_modules');
fs.writeFileSync(path.join(dir, 'responsabili-password.json'), JSON.stringify({ Matteo: 'segreta12' }));
const figlio = spawn(process.execPath, [path.join(dir, 'server.js')], { env, stdio: 'ignore' });
function chiedi(metodo, p, { remoto, cookie, corpo } = {}) {
  return new Promise((ok, ko) => {
    const h = { Host: 'localhost:' + PORTA };
    if (remoto) h['X-Forwarded-For'] = '192.168.1.50';
    if (cookie) h.Cookie = cookie;
    if (corpo) h['Content-Type'] = 'application/json';
    const r = http.request({ host: '127.0.0.1', port: PORTA, method: metodo, path: p, headers: h }, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => ok({ s: res.statusCode, b, h: res.headers })); });
    r.on('error', ko); if (corpo) r.write(JSON.stringify(corpo)); r.end();
  });
}
let falliti = 0; const verifica = (c, m) => { if (!c) { falliti++; console.log('❌ ' + m); } else console.log('✅ ' + m); };
(async () => {
  for (let i = 0; i < 400; i++) { try { await chiedi('GET', '/api/presenza'); break; } catch (e) { await new Promise(r => setTimeout(r, 500)); } } // l'avvio di server.js puo richiedere oltre un minuto su macchine lente
  const pwd = fs.readFileSync(path.join(dir, 'password-accesso-rete-locale.txt'), 'utf8').split(/\r?\n/)[1].trim();
  verifica(pwd.length >= 12, 'password iniziale generata');
  verifica(!fs.readFileSync(path.join(dir, 'accesso-lan.json'), 'utf8').includes(pwd), 'la password non e nel file di configurazione (solo hash)');
  verifica((await chiedi('GET', '/api/stato')).s === 200, 'locale: /api/stato accessibile senza credenziali');
  let r = await chiedi('GET', '/api/stato', { remoto: true }); verifica(r.s === 401, 'remoto senza cookie: /api/stato rifiutato (401)');
  r = await chiedi('POST', '/api/stato', { remoto: true, corpo: { clienti: [] } }); verifica(r.s === 401, 'remoto senza cookie: scrittura stato rifiutata');
  r = await chiedi('GET', '/api/documenti/scarica?percorso=x', { remoto: true }); verifica(r.s === 401, 'remoto senza cookie: download documenti rifiutato');
  r = await chiedi('GET', '/', { remoto: true }); verifica(r.s === 401 && /Password dello studio/.test(r.b), 'remoto: la pagina / mostra l\'accesso, non i dati');
  r = await chiedi('GET', '/api/accesso-esterno', { remoto: true }); verifica(r.s === 401, 'remoto: password collaboratore esterno non leggibile');
  r = await chiedi('GET', '/portale-manifest.json', { remoto: true }); verifica(r.s !== 401, 'portale clienti resta raggiungibile senza cookie');
  r = await chiedi('POST', '/lan-login', { remoto: true, corpo: { password: 'sbagliata' } }); verifica(r.s === 401, 'password sbagliata rifiutata');
  r = await chiedi('POST', '/lan-login', { remoto: true, corpo: { password: pwd } }); verifica(r.s === 200 && /prisma_dev=/.test(String(r.h['set-cookie'])), 'password giusta: cookie di dispositivo rilasciato');
  const set = String(r.h['set-cookie']); verifica(/HttpOnly/.test(set) && /SameSite=Strict/.test(set), 'cookie HttpOnly + SameSite=Strict');
  const cookie = set.split(';')[0];
  r = await chiedi('GET', '/api/stato', { remoto: true, cookie }); verifica(r.s === 200, 'dispositivo autorizzato: /api/stato accessibile');
  r = await chiedi('GET', '/api/accesso-lan', { remoto: true, cookie }); verifica(r.s === 403, 'dispositivo autorizzato NON puo gestire i dispositivi');
  r = await chiedi('GET', '/api/accesso-lan'); verifica(JSON.parse(r.b).password === pwd, 'locale: la password si puo rivedere (conservata cifrata)'); verifica(!fs.readFileSync(path.join(dir, 'accesso-lan.json'), 'utf8').includes(pwd), 'password non in chiaro nel file di configurazione');
  r = await chiedi('GET', '/api/accesso-lan'); const lista = JSON.parse(r.b); verifica(r.s === 200 && lista.dispositivi.length === 1, 'locale: elenco dispositivi con 1 voce');
  r = await chiedi('POST', '/api/accesso-lan/revoca', { corpo: { id: lista.dispositivi[0].id } }); verifica(r.s === 200, 'revoca del dispositivo');
  r = await chiedi('GET', '/api/stato', { remoto: true, cookie }); verifica(r.s === 401, 'dispositivo revocato: di nuovo rifiutato');
  for (let i = 0; i < 6; i++) await chiedi('POST', '/lan-login', { remoto: true, corpo: { password: 'x' + i } });
  r = await chiedi('POST', '/lan-login', { remoto: true, corpo: { password: pwd } }); verifica(r.s === 429, 'dopo troppi errori il login si blocca (429)');
  r = await chiedi('GET', '/', {}); verifica(r.h['x-content-type-options'] === 'nosniff' && r.h['x-frame-options'] === 'SAMEORIGIN', 'header di sicurezza presenti');
  r = await chiedi('POST', '/api/accesso-lan/password', { corpo: { password: 'corta' } }); verifica(r.s === 400, 'password nuova troppo corta rifiutata');
  r = await chiedi('POST', '/api/documenti/cartella', { corpo: { clienteId: 'cli_abcdef123456', clienteNome: 'Rossi Srl', sottocartella: '2026.13.10 - Variazione sede' } });
  const cart = JSON.parse(r.b); verifica(r.s === 200 && cart.ok && fs.existsSync(path.join(dir, 'doc', cart.percorso)) && /2026\.13\.10 - Variazione sede$/.test(cart.percorso), 'cartella pratica creata nei documenti del cliente (' + cart.percorso + ')');
  r = await chiedi('POST', '/api/documenti/cartella', { remoto: true, corpo: { clienteId: 'x', clienteNome: 'y', sottocartella: 'z' } }); verifica(r.s === 401, 'remoto non autorizzato: cartella pratica rifiutata');
  // sessione operatore: resta valida finche il server e acceso (nessuna nuova password per inattivita)
  r = await chiedi('POST', '/api/operatore-login', { corpo: { nome: 'Matteo', password: 'segreta12', deviceId: 'dev-A' } });
  const login = JSON.parse(r.b); verifica(login.ok && login.token, 'login operatore con password');
  r = await chiedi('POST', '/api/presenza', { corpo: { operatore: 'Matteo', deviceId: 'dev-A', token: login.token } });
  verifica(!JSON.parse(r.b).sessioneScaduta, 'heartbeat con il token: sessione valida');
  r = await chiedi('POST', '/api/presenza', { corpo: { operatore: 'Matteo', deviceId: 'dev-B', token: login.token } });
  verifica(JSON.parse(r.b).sessioneScaduta === true, 'un altro dispositivo non puo usare il token altrui');
  r = await chiedi('POST', '/api/operatore-login', { corpo: { nome: 'Matteo', password: 'segreta12', deviceId: 'dev-B' } });
  verifica(JSON.parse(r.b).occupato === true, 'secondo dispositivo mentre il primo e attivo: nome occupato');
  figlio.kill(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(falliti ? '\n❌ ' + falliti + ' controlli falliti' : '\n✅ TUTTI I CONTROLLI DI ACCESSO PASSATI'); process.exit(falliti ? 1 : 0);
})().catch(e => { console.log('❌ errore test', e.message); figlio.kill(); process.exit(1); });
