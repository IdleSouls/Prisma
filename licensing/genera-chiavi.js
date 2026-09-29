#!/usr/bin/env node
/*
 * ============================================================================
 *  GENERA-CHIAVI - Prisma licensing (SETUP UNA TANTUM)
 * ============================================================================
 *  Da eseguire UNA SOLA VOLTA, solo da Matteo, sul proprio computer - MAI su
 *  una macchina cliente e MAI dentro una chiavetta che verrà distribuita.
 *
 *  Uso:
 *      node genera-chiavi.js
 *
 *  Crea due file in questa stessa cartella:
 *    - chiave-privata.pem   → SEGRETA. Serve solo a Matteo per firmare le
 *                             licenze (genera-licenza.js). NON va mai
 *                             copiata su una chiavetta USB, in un installer,
 *                             o inviata a nessuno. Conservala con lo stesso
 *                             cura di una password: se qualcuno la ottiene
 *                             può generare licenze valide per Prisma.
 *    - chiave-pubblica.pem  → questa sì va distribuita: va copiata dentro
 *                             ogni installazione di Prisma venduta (la legge
 *                             server.js all'avvio per verificare la licenza)
 *                             e dentro l'installer sulla chiavetta USB.
 *
 *  Se i file esistono già, il comando si rifiuta di sovrascriverli (si
 *  perderebbero le chiavi già usate per le licenze emesse finora) - per
 *  forzare comunque la rigenerazione, aggiungere --forza (da fare solo se
 *  si è consapevoli che ogni licenza emessa finora smetterà di funzionare).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { generaChiavi } = require('./lib.js');

const CARTELLA = __dirname;
const FILE_PRIVATA = path.join(CARTELLA, 'chiave-privata.pem');
const FILE_PUBBLICA = path.join(CARTELLA, 'chiave-pubblica.pem');
const FORZA = process.argv.includes('--forza');

if (!FORZA && (fs.existsSync(FILE_PRIVATA) || fs.existsSync(FILE_PUBBLICA))) {
  console.log('');
  console.log('Esistono già delle chiavi in questa cartella:');
  if (fs.existsSync(FILE_PRIVATA)) console.log('  - ' + FILE_PRIVATA);
  if (fs.existsSync(FILE_PUBBLICA)) console.log('  - ' + FILE_PUBBLICA);
  console.log('');
  console.log('Non le sovrascrivo: tutte le licenze già emesse smetterebbero di');
  console.log('funzionare. Se sei sicuro di voler rigenerare, esegui di nuovo con:');
  console.log('  node genera-chiavi.js --forza');
  console.log('');
  process.exit(1);
}

const { chiavePubblica, chiavePrivata } = generaChiavi();
fs.writeFileSync(FILE_PRIVATA, chiavePrivata, { mode: 0o600 });
fs.writeFileSync(FILE_PUBBLICA, chiavePubblica, { mode: 0o644 });

console.log('');
console.log('Coppia di chiavi generata con successo.');
console.log('');
console.log('  ' + FILE_PRIVATA + '  (SEGRETA - non condividere, non copiare su chiavette)');
console.log('  ' + FILE_PUBBLICA + '  (da distribuire con ogni installazione di Prisma)');
console.log('');
console.log('Prossimo passo: usa genera-licenza.js per emettere la prima licenza.');
console.log('');
