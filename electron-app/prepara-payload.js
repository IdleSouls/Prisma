/*
 * Prepara electron-app/payload: i file dell'app che finiscono DENTRO l'installer (Installa-Prisma.exe).
 * Mai inclusi: dati-studio.json, backup, documenti-clienti, password, chiave privata, license.json.
 */
const fs = require('fs'); const path = require('path');
const RADICE = path.join(__dirname, '..');
const DEST = path.join(__dirname, 'payload');
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
const file = ['gestionale.htm', 'portale-cliente.htm', 'portale-sw.js', 'server.js', 'package.json', 'versione.json', 'Prisma.mcpb'];
const cartelle = ['logo', 'asset', 'mcp-server', 'node_modules', 'Documenti-Prisma'];
const escludi = (x) => !/node_modules[\\/]\.bin([\\/]|$)/.test(x) && !/[\\/]\.git([\\/]|$)/.test(x) && !/mcp-server[\\/]node_modules/.test(x) && !/mcp-server[\\/]gestionale-mcp\.json/.test(x) && !/mcp-server[\\/]test-/.test(x)
  && !/Documenti-Prisma[\\/](ANALISI|.*\.docx$)/.test(x);
let n = 0;
for (const f of file) { const s = path.join(RADICE, f); if (fs.existsSync(s)) { fs.cpSync(s, path.join(DEST, f)); n++; } else console.warn('  (manca) ' + f); }
for (const c of cartelle) { const s = path.join(RADICE, c); if (fs.existsSync(s)) { fs.cpSync(s, path.join(DEST, c), { recursive: true, filter: escludi }); n++; } else console.warn('  (manca) ' + c + '/'); }
fs.mkdirSync(path.join(DEST, 'licensing'), { recursive: true });
// lib.js va nella cartella dati; la chiave PUBBLICA invece viene incorporata nell'app (electron-app/chiave-pubblica.pem,
// finisce in app.asar) e NON nel payload, cosi' l'utente non puo' sostituirla.
const libSrc = path.join(RADICE, 'licensing', 'lib.js');
const pubSrc = path.join(RADICE, 'licensing', 'chiave-pubblica.pem');
if (!fs.existsSync(libSrc) || !fs.existsSync(pubSrc)) { console.error('ERRORE: mancano licensing/lib.js o licensing/chiave-pubblica.pem'); process.exit(1); }
fs.cpSync(libSrc, path.join(DEST, 'licensing', 'lib.js')); n++;
fs.cpSync(pubSrc, path.join(__dirname, 'chiave-pubblica.pem')); n++;
if (fs.existsSync(path.join(DEST, 'licensing', 'chiave-privata.pem'))) { console.error('ERRORE: chiave privata nel payload!'); process.exit(1); }
console.log('Payload pronto: ' + n + ' elementi in ' + DEST);
