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
const BASE = process.env.PRISMA_BASE_URL || 'https://raw.githubusercontent.com/IdleSouls/Prisma/main/';
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
// Il manifesto viene FIRMATO con la chiave privata (stessa delle licenze): Prisma applica un
// aggiornamento solo se la firma e' valida, cosi' un repository manomesso non basta per far girare
// codice sui PC degli studi.
const FILE_PRIVATA = 'licensing/chiave-privata.pem';
if (!fs.existsSync(FILE_PRIVATA)) { console.error('ERRORE: manca ' + FILE_PRIVATA + ' - senza non posso firmare il manifesto (i clienti rifiuterebbero l\'aggiornamento).'); process.exit(1); }
const { firmaLicenza } = require('./licensing/lib.js');
const firmato = firmaLicenza(manifesto, fs.readFileSync(FILE_PRIVATA, 'utf8'));
fs.writeFileSync('versione.json', JSON.stringify(firmato, null, 2) + '\n');
console.log('versione.json scritto per la versione ' + versione);
