/*
 * Prepara la cartella/chiavetta da consegnare a uno studio (modello "installazione per studio").
 * Uso:  node licensing/prepara-chiavetta.js <cartella-destinazione> [cartella-licenza-cliente]
 *   - copia l'app (senza dati di alcuno studio, senza chiave privata, senza backup)
 *   - copia Installa-Prisma.exe, lib.js e chiave-pubblica.pem accanto agli altri file
 *   - se indichi una cartella con license.json (da licensing/emesse/<studio>), la include: attivazione automatica
 * Poi: su Windows esegui licensing\Costruisci-Eseguibili.bat (una tantum) per avere Installa-Prisma.exe.
 */
const fs = require('fs'); const path = require('path');
const RADICE = path.join(__dirname, '..');
const dest = process.argv[2]; const licenza = process.argv[3];
if (!dest) { console.error('Indica la cartella di destinazione.'); process.exit(1); }
fs.mkdirSync(dest, { recursive: true });
const file = ['gestionale.htm', 'portale-cliente.htm', 'portale-sw.js', 'server.js', 'package.json', 'versione.json', 'Prisma.exe', 'Prisma.mcpb', 'Avvia Gestionale.bat', 'Avvia Prisma (senza finestra nera).vbs'];
const cartelle = ['mcp-server', 'logo', 'asset', 'node_modules', 'Documenti-Prisma'];
let n = 0;
for (const f of file) { const s = path.join(RADICE, f); if (fs.existsSync(s)) { fs.cpSync(s, path.join(dest, f)); n++; } else console.warn('  (manca) ' + f); }
for (const c of cartelle) { const s = path.join(RADICE, c); if (fs.existsSync(s)) { fs.cpSync(s, path.join(dest, c), { recursive: true, filter: (x) => !/[\\/]\.git([\\/]|$)/.test(x) && !/mcp-server[\\/]node_modules/.test(x) }); n++; } else console.warn('  (manca) ' + c + '/'); }
for (const f of ['Installa-Prisma.exe', 'lib.js', 'chiave-pubblica.pem']) { const s = path.join(__dirname, f); if (fs.existsSync(s)) { fs.cpSync(s, path.join(dest, f)); n++; } else console.warn('  (manca) licensing/' + f); }
if (licenza) { const l = path.join(licenza, 'license.json'); if (fs.existsSync(l)) { fs.cpSync(l, path.join(dest, 'license.json')); console.log('Licenza precaricata inclusa.'); } else console.warn('license.json non trovato in ' + licenza); }
// Mai: dati-studio.json, backup/, documenti-clienti/, ACCESSI, *.txt con password, chiave-privata.pem
console.log('Pronto: ' + n + ' elementi copiati in ' + dest);
