/* Genera versione.json (il manifesto letto da Prisma per gli aggiornamenti automatici).
   Uso:  node pubblica-aggiornamento.js "note della versione"
   1) cambia VERSIONE_LOCALE in server.js (e "version" in package.json)
   2) git add dei file modificati
   3) node pubblica-aggiornamento.js "cosa cambia"   <- calcola lo sha256 dei file COSÌ COME STANNO NELL'INDICE git
   4) git add versione.json && git commit && git push
   Se nel manifesto c'è un file con sha256 diverso da quello su GitHub, Prisma annulla l'aggiornamento. */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const FILE = ['gestionale.htm', 'server.js', 'portale-cliente.htm', 'portale-sw.js'];
const BASE = 'https://raw.githubusercontent.com/IdleSouls/Prisma/main/';
const versione = (fs.readFileSync('server.js', 'utf8').match(/const VERSIONE_LOCALE = '([^']+)'/) || [])[1];
if (!versione) { console.error('VERSIONE_LOCALE non trovata in server.js'); process.exit(1); }
const manifesto = {
  versione,
  note: process.argv[2] || '',
  richiedeNpmInstall: process.argv.includes('--npm'),
  file: FILE.map((nome) => ({
    nome,
    url: BASE + nome,
    sha256: crypto.createHash('sha256').update(execFileSync('git', ['show', ':' + nome], { maxBuffer: 64 * 1024 * 1024 })).digest('hex'),
  })),
};
fs.writeFileSync('versione.json', JSON.stringify(manifesto, null, 2) + '\n');
console.log('versione.json scritto per la versione ' + versione);
