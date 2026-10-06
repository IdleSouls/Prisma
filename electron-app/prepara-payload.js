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
const escludi = (x) => !/[\\/]\.git([\\/]|$)/.test(x) && !/mcp-server[\\/]node_modules/.test(x) && !/mcp-server[\\/]gestionale-mcp\.json/.test(x) && !/mcp-server[\\/]test-/.test(x)
  && !/Documenti-Prisma[\\/](ANALISI|.*\.docx$)/.test(x);
let n = 0;
for (const f of file) { const s = path.join(RADICE, f); if (fs.existsSync(s)) { fs.cpSync(s, path.join(DEST, f)); n++; } else console.warn('  (manca) ' + f); }
for (const c of cartelle) { const s = path.join(RADICE, c); if (fs.existsSync(s)) { fs.cpSync(s, path.join(DEST, c), { recursive: true, filter: escludi }); n++; } else console.warn('  (manca) ' + c + '/'); }
fs.mkdirSync(path.join(DEST, 'licensing'), { recursive: true });
for (const f of ['lib.js', 'chiave-pubblica.pem']) {
  const s = path.join(RADICE, 'licensing', f);
  if (!fs.existsSync(s)) { console.error('ERRORE: manca licensing/' + f); process.exit(1); }
  fs.cpSync(s, path.join(DEST, 'licensing', f)); n++;
}
if (fs.existsSync(path.join(DEST, 'licensing', 'chiave-privata.pem'))) { console.error('ERRORE: chiave privata nel payload!'); process.exit(1); }
console.log('Payload pronto: ' + n + ' elementi in ' + DEST);
