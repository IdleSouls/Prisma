// Test della logica di installazione/attivazione (senza Electron). Uso: node electron-app/test-attivazione.js
const fs = require('fs'), os = require('os'), path = require('path');
const L = require('./attivazione-logica.js');
const lib = require('../licensing/lib.js');
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.log('FALLITO: ' + n); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-att-'));
const payload = path.join(tmp, 'payload'), dest = path.join(tmp, 'Prisma');
const chiavi = lib.generaChiavi();
fs.mkdirSync(path.join(payload, 'licensing'), { recursive: true });
fs.mkdirSync(path.join(payload, 'asset'));
fs.writeFileSync(path.join(payload, 'server.js'), '// s'); fs.writeFileSync(path.join(payload, 'gestionale.htm'), 'v1');
fs.writeFileSync(path.join(payload, 'versione.json'), JSON.stringify({ versione: '1.16.0' }));
fs.writeFileSync(path.join(payload, 'asset', 'a.txt'), 'a');
fs.copyFileSync(path.join(__dirname, '..', 'licensing', 'lib.js'), path.join(payload, 'licensing', 'lib.js'));
const PUB = chiavi.chiavePubblica || chiavi.publicKey; const PRIV = chiavi.chiavePrivata || chiavi.privateKey;

t('confronto versioni', L.confrontaVersioni('1.16.0', '1.15.9') === 1 && L.confrontaVersioni('1.2', '1.2.0') === 0 && L.confrontaVersioni('1.9.0', '1.10.0') === -1);
let e = L.sincronizzaPayload(payload, dest);
t('prima installazione copia', e.aggiornato && fs.existsSync(path.join(dest, 'gestionale.htm')) && fs.existsSync(path.join(dest, 'asset', 'a.txt')));
t('lib.js copiato, chiave pubblica NON nella cartella dati', fs.existsSync(path.join(dest, 'licensing', 'lib.js')) && !fs.existsSync(path.join(dest, 'licensing', 'chiave-pubblica.pem')));

// dati dell'utente e aggiornamento automatico piu' recente non vanno toccati
fs.writeFileSync(path.join(dest, 'dati-studio.json'), '{"x":1}');
fs.writeFileSync(path.join(dest, 'gestionale.htm'), 'v-aggiornata');
fs.writeFileSync(path.join(dest, 'versione.json'), JSON.stringify({ versione: '1.17.0' }));
e = L.sincronizzaPayload(payload, dest);
t('versione locale piu nuova: non sovrascrive', !e.aggiornato && fs.readFileSync(path.join(dest, 'gestionale.htm'), 'utf8') === 'v-aggiornata');
fs.writeFileSync(path.join(dest, 'versione.json'), JSON.stringify({ versione: '1.15.0' }));
e = L.sincronizzaPayload(payload, dest);
t('installer piu nuovo: aggiorna codice', e.aggiornato && fs.readFileSync(path.join(dest, 'gestionale.htm'), 'utf8') === 'v1');
t('dati mai toccati', fs.readFileSync(path.join(dest, 'dati-studio.json'), 'utf8') === '{"x":1}');

// licenza
let s = L.statoLicenza(dest, PUB);
t('senza licenza: richiesta, non valida, codice presente', s.richiesta && !s.valida && /^[0-9A-F-]+$/.test(s.fingerprint));
t('licenza non json rifiutata', !L.installaLicenza(dest, 'non json', PUB).ok);
const altra = lib.firmaLicenza({ studio: 'X', fingerprint: 'AAAA-BBBB', emessaIl: '2026-01-01', id: '1' }, PRIV);
t('licenza di altra macchina rifiutata', !L.installaLicenza(dest, JSON.stringify(altra), PUB).ok);
const buona = lib.firmaLicenza({ studio: 'Studio Amico', fingerprint: s.fingerprint, emessaIl: '2026-10-06', id: '2' }, PRIV);
const manomessa = Object.assign({}, buona, { studio: 'Altro' });
t('licenza manomessa rifiutata', !L.installaLicenza(dest, JSON.stringify(manomessa), PUB).ok);
const scaduta = lib.firmaLicenza({ studio: 'Studio Amico', fingerprint: s.fingerprint, emessaIl: '2025-01-01', scadenza: '2025-12-31', id: '3' }, PRIV);
t('licenza scaduta rifiutata', !L.installaLicenza(dest, JSON.stringify(scaduta), PUB).ok);
const r = L.installaLicenza(dest, JSON.stringify(buona), PUB);
t('licenza buona accettata', r.ok && r.studio === 'Studio Amico');
s = L.statoLicenza(dest, PUB);
t('dopo attivazione: valida', s.valida && s.studio === 'Studio Amico');

// Sostituire la chiave pubblica nella cartella dati NON deve servire: conta quella incorporata nell'app.
const attaccante = lib.generaChiavi();
fs.writeFileSync(path.join(dest, 'licensing', 'chiave-pubblica.pem'), attaccante.chiavePubblica || attaccante.publicKey);
const falsa = lib.firmaLicenza({ studio: 'Pirata', fingerprint: L.statoLicenza(dest, PUB).fingerprint, emessaIl: '2026-10-07', id: '9' }, attaccante.chiavePrivata || attaccante.privateKey);
t('licenza firmata con chiave altrui rifiutata anche se la chiave in cartella e\' stata sostituita', !L.installaLicenza(dest, JSON.stringify(falsa), PUB).ok);
// Manifesto aggiornamenti firmato
const man = lib.firmaLicenza({ versione: '9.9.9', file: [{ nome: 'server.js', sha256: 'a'.repeat(64) }] }, PRIV);
t('manifesto firmato: valido', lib.verificaFirmaOggetto(man, PUB) === true);
t('manifesto alterato: rifiutato', lib.verificaFirmaOggetto(Object.assign({}, man, { versione: '9.9.8' }), PUB) === false);
t('manifesto senza firma: rifiutato', lib.verificaFirmaOggetto({ versione: '9.9.9', file: [] }, PUB) === false);
t('manifesto firmato da altri: rifiutato', lib.verificaFirmaOggetto(lib.firmaLicenza({ versione: '9.9.9', file: [] }, attaccante.chiavePrivata || attaccante.privateKey), PUB) === false);
// senza licensing (uso di Matteo): nessun controllo
const libero = path.join(tmp, 'libero'); fs.mkdirSync(libero);
t('senza chiave pubblica: nessun controllo', L.statoLicenza(libero).valida === true && !L.statoLicenza(libero).richiesta);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' falliti'); process.exit(ko ? 1 : 0);
