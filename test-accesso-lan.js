/* Test del cancello di accesso per dispositivi sulla rete locale (server.js, porta di prova).
   Uso: node test-accesso-lan.js   - avvia un server temporaneo con cartelle dati temporanee. */
const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-lan-')); const PORTA = 18420 + Math.floor(Math.random() * 500);
const env = Object.assign({}, process.env, { PRISMA_PORTA: String(PORTA), PRISMA_DIR_DATI: dir, PRISMA_DIR_DOCUMENTI: path.join(dir, 'doc'), PRISMA_DIR_LOG: path.join(dir, 'log'), PRISMA_DIR_BACKUP: path.join(dir, 'bk'), PRISMA_SKIP_AUTOOPEN: '1' });
// Copia di server.js in una cartella temporanea SENZA licensing/: cosi' il controllo licenza non scatta.
for (const f of ['server.js', 'gestionale.htm', 'portale-cliente.htm', 'portale-sw.js', 'package.json'].concat(fs.readdirSync(__dirname).filter((x) => /^(gestionale\.css|gestionale-\d\d-[a-z0-9-]+\.js)$/.test(x)))) { try { fs.copyFileSync(path.join(__dirname, f), path.join(dir, f)); } catch (e) { /* facoltativo */ } }
env.NODE_PATH = path.join(__dirname, 'node_modules');
fs.writeFileSync(path.join(dir, 'responsabili-password.json'), JSON.stringify({ Matteo: 'segreta12' }));
// Dati minimi per provare le azioni del portale avanzato (F24, ravvedimento, conferma lettura) tramite il motore headless.
fs.writeFileSync(path.join(dir, 'dati-studio.json'), JSON.stringify({
  meta: { pacchettoPortaleMigrato: true, studioNome: 'Studio Test', responsabili: ['Matteo'] },
  clienti: [{ id: 'cliP', ragioneSociale: 'Cliente Pacchetto Srl', tipo: 'societa_capitali', stato: 'attivo', portaleToken: 'tokP', pacchettoPortale: true, contatti: {}, flags: {}, atecoCodici: [], adempimentiAnnualiApplicabili: [] },
             { id: 'cliN', ragioneSociale: 'Cliente Base Srl', tipo: 'societa_capitali', stato: 'attivo', portaleToken: 'tokN', pacchettoPortale: false, contatti: {}, flags: {}, atecoCodici: [], adempimentiAnnualiApplicabili: [] }],
  f24: [{ id: 'f24P', clienteId: 'cliP', tipo: 'Debito', data: '2026-01-16', importo: 300, stato: 'Da pagare', descrizione: 'IVA', righe: [{ id: 'r1', codiceTributo: '6012', descrizione: 'IVA', importo: 300, importoPagato: 0 }] }],
  comunicazioni: [{ id: 'comP', clienteId: 'cliP', data: '2026-10-01', categoria: 'Bilancio', oggetto: 'Bilancio', corpo: 'x', stato: 'Inviata', visibilePortale: true, richiedeConferma: true, risposte: [] }],
}));
// Aggiornamento "scaricato, in attesa di riavvio": all'avvio i file vanno al loro posto e il server riparte con il codice nuovo.
const crypto = require('crypto');
const stag = path.join(dir, 'aggiornamento-pronto'); fs.mkdirSync(stag);
const nuovoHtml = '<!-- AGGIORNATO-TEST -->' + fs.readFileSync(path.join(dir, 'gestionale.htm'), 'utf8');
const nuovoServer = fs.readFileSync(path.join(dir, 'server.js'), 'utf8').replace(/^const VERSIONE_LOCALE = '[^']+'/m, "const VERSIONE_LOCALE = '99.0.0'");
fs.writeFileSync(path.join(stag, 'gestionale.htm'), nuovoHtml); fs.writeFileSync(path.join(stag, 'server.js'), nuovoServer);
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
fs.writeFileSync(path.join(stag, 'manifesto-pronto.json'), JSON.stringify({ versione: '99.0.0', note: 'test', scaricatoIl: new Date().toISOString(), file: [{ nome: 'gestionale.htm', sha256: sha(nuovoHtml) }, { nome: 'server.js', sha256: sha(nuovoServer) }] }));
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
  { // portale avanzato via server (motore headless)
    const pst = async (p, c) => { const r = await chiedi('POST', p, { corpo: c }); let j = {}; try { j = JSON.parse(r.b); } catch (e) {} return { s: r.s, j }; };
    verifica((await pst('/api/portale-f24-modalita', { token: 'tokP', f24Id: 'f24P', modalita: 'autonomo' })).j.ok === true, 'portale avanzato: scelta modalità F24');
    verifica((await pst('/api/portale-f24-modalita', { token: 'tokN', f24Id: 'f24P', modalita: 'autonomo' })).s === 404, 'portale avanzato: senza pacchetto o F24 altrui = 404');
    verifica((await pst('/api/portale-f24-pagamento', { token: 'tokP', f24Id: 'f24P', pagamenti: [{ rigaId: 'r1', importo: 100 }] })).j.ok === true, 'portale avanzato: segnalazione pagamento');
    const sim = (await pst('/api/portale-ravvedimento-simula', { token: 'tokP', importo: 1000, dataScadenza: '2026-01-16', dataVersamento: '2026-01-26' })).j;
    verifica(sim.ok && sim.risultato && sim.risultato.giorniRitardo === 10, 'portale avanzato: simulazione ravvedimento');
    verifica((await pst('/api/portale-ravvedimento-simula', { token: 'tokN', importo: 1000, dataScadenza: '2026-01-16', dataVersamento: '2026-01-26' })).j.risultato === null, 'portale avanzato: simulazione negata senza pacchetto');
    verifica((await pst('/api/portale-conferma-lettura', { token: 'tokP', comunicazioneId: 'comP' })).j.ok === true, 'portale avanzato: conferma di lettura');
    const salvato = JSON.parse(fs.readFileSync(path.join(dir, 'dati-studio.json'), 'utf8'));
    verifica(salvato.f24[0].importoPagato === 100 && salvato.f24[0].modalitaPagamento === 'autonomo' && salvato.comunicazioni.find(c => c.id === 'comP').confermaLetturaData, 'portale avanzato: le azioni sono salvate nei dati dello studio');
  }
  verifica(fs.readFileSync(path.join(dir, 'gestionale.htm'), 'utf8').startsWith('<!-- AGGIORNATO-TEST -->') && !fs.existsSync(stag), 'aggiornamento scaricato: applicato all\'avvio e cartella di attesa svuotata');
  { const st = JSON.parse((await chiedi('GET', '/api/aggiornamenti/stato')).b); verifica(st.ok && st.versioneLocale === '99.0.0' && st.scaricata === null, 'dopo il riavvio gira il server.js nuovo (versione 99.0.0), nessun aggiornamento in attesa'); }
  { // pagina divisa in file: la pagina li referenzia, il server li serve, un nome inesistente da 404
    const pag = (await chiedi('GET', '/')).b; const riferiti = [...pag.matchAll(/<script src="(gestionale-\d\d-[a-z0-9-]+\.js)"><\/script>/g)].map(m => m[1]);
    verifica(riferiti.length >= 10 && /href="gestionale\.css"/.test(pag), 'la pagina referenzia gestionale.css e i file js divisi (' + riferiti.length + ')');
    let tuttiOk = true; for (const f of riferiti.concat(['gestionale.css'])) { const r = await chiedi('GET', '/' + f); if (r.s !== 200 || r.b.length < 100) { tuttiOk = false; console.log('  manca ' + f + ' -> ' + r.s); } }
    verifica(tuttiOk, 'il server serve tutti i file di codice divisi');
    verifica((await chiedi('GET', '/gestionale-99-inesistente.js')).s === 404, 'file di codice inesistente: 404');
    try { // la pagina vera, con gli script esterni caricati dal server come farebbe il browser: deve partire senza errori
      const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom'); const errori = [];
      class Caricatore extends ResourceLoader { fetch(url, o) { return /^http:\/\/127\.0\.0\.1/.test(url) ? super.fetch(url, o) : null; } }
      const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/Could not load|Not implemented/.test(e.message)) errori.push(e.message); }); vc.on('error', (...a) => errori.push(a.join(' ')));
      const dom = new JSDOM(pag, { url: 'http://127.0.0.1:' + PORTA + '/', runScripts: 'dangerously', resources: new Caricatore(), pretendToBeVisual: true, virtualConsole: vc });
      await new Promise(r => dom.window.addEventListener('load', r)); await new Promise(r => setTimeout(r, 1500));
      verifica(errori.length === 0 && dom.window.document.getElementById("pageTitle").textContent.trim().length > 2 && dom.window.document.getElementById('navMenu').children.length > 10, 'pagina caricata con script esterni: nessun errore, menu e titolo presenti' + (errori.length ? ' - ' + errori[0] : '') + ' [titolo="' + dom.window.document.getElementById('pageTitle').textContent + '" voci=' + dom.window.document.getElementById('navMenu').children.length + ']');
      dom.window.close();
    } catch (e) { verifica(false, 'caricamento pagina con script esterni: ' + e.message); }
    verifica((await chiedi('GET', '/gestionale-01-motore.js', { remoto: true })).s !== 200, 'da un altro dispositivo senza accesso i file di codice non si scaricano');
  }
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
  r = await chiedi('POST', '/api/documenti/cartella', { corpo: { clienteId: 'cli_abcdef123456', clienteNome: 'Rossi Srl', sottocartella: 'Pratiche/2026.13.10 - SCIA x' } });
  const cart2 = JSON.parse(r.b); const baseR = path.join(dir, 'doc', 'Rossi Srl [123456]');
  verifica(r.s === 200 && fs.existsSync(path.join(baseR, 'Pratiche', '2026.13.10 - SCIA x')), 'cartella pratica dentro Pratiche (' + cart2.percorso + ')');
  verifica(['_Contabilita', '_Fiscale', 'Documenti', 'Libri e registri', 'Pratiche'].every(a => fs.existsSync(path.join(baseR, a))), 'aree standard create nella cartella del cliente');
  r = await chiedi('POST', '/api/documenti/carica', { corpo: { clienteId: 'cli_abcdef123456', clienteNome: 'Rossi Srl', sottocartella: '_Fiscale/2026/Redditi', nomeFile: 'prova.txt', contenutoBase64: Buffer.from('ciao').toString('base64') } });
  verifica(r.s === 200 && fs.existsSync(path.join(baseR, '_Fiscale', '2026', 'Redditi', 'prova.txt')), 'upload dentro Area/Anno/Sottocartella');
  r = await chiedi('POST', '/api/documenti/carica', { corpo: { clienteId: 'cli_abcdef123456', clienteNome: 'Rossi Srl', sottocartella: '../../fuori', nomeFile: 'x.txt', contenutoBase64: Buffer.from('x').toString('base64') } });
  verifica(!fs.existsSync(path.join(dir, 'fuori')) && !fs.existsSync(path.join(dir, 'doc', 'fuori')), 'path traversal con .. neutralizzato');
  r = await chiedi('POST', '/api/documenti/struttura', { corpo: { clienti: [{ id: 'zzz_999999', nome: 'Bianchi Spa' }] } });
  verifica(r.s === 200 && fs.existsSync(path.join(dir, 'doc', 'Bianchi Spa [999999]', '_Fiscale', String(new Date().getFullYear()))), 'struttura standard per tutti i clienti (aree + anno corrente)');
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
  figlio.kill(); try { require('child_process').execSync('pkill -f ' + JSON.stringify(dir)); } catch (e) {}; fs.rmSync(dir, { recursive: true, force: true });
  console.log(falliti ? '\n❌ ' + falliti + ' controlli falliti' : '\n✅ TUTTI I CONTROLLI DI ACCESSO PASSATI'); process.exit(falliti ? 1 : 0);
})().catch(e => { console.log('❌ errore test', e.message); figlio.kill(); process.exit(1); });
