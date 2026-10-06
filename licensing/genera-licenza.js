#!/usr/bin/env node
/*
 * ============================================================================
 *  GENERA-LICENZA - Prisma licensing
 * ============================================================================
 *  Tool a riga di comando per Matteo: emette una licenza firmata per un
 *  cliente, legata a un fingerprint macchina specifico.
 *
 *  Uso base (il caso più comune - il cliente ti ha mandato il suo fingerprint,
 *  mostrato dall'installer al primo avvio sulla sua macchina):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-C3D4-E5F6-7890
 *
 *  Con scadenza (licenza annuale, per esempio):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-C3D4-E5F6-7890 --scadenza 2027-12-31
 *
 *  Con moduli abilitati (se in futuro Prisma avrà moduli opzionali):
 *      node genera-licenza.js --studio "Studio Rossi" --fingerprint A1B2-... --moduli base,portale,antiriciclaggio
 *
 *  Output: scrive un file "license.json" pronto per essere copiato nella
 *  cartella di installazione del cliente (o pre-caricato su una chiavetta
 *  USB prima di spedirla - vedi installer.js), dentro emesse/<slug>/. Tiene
 *  anche un registro di tutte le licenze emesse finora in
 *  emesse/registro-licenze.json - utile a Matteo come promemoria di chi ha
 *  già una licenza attiva, dato che non c'è un server centrale che lo tenga
 *  automaticamente (scelta di design - vedi il documento di progetto).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { firmaLicenza } = require('./lib.js');

const CARTELLA = __dirname;
const FILE_PRIVATA = path.join(CARTELLA, 'chiave-privata.pem');
const CARTELLA_EMESSE = path.join(CARTELLA, 'emesse');
const FILE_REGISTRO = path.join(CARTELLA_EMESSE, 'registro-licenze.json');

function leggiArgomento(nome) {
  const idx = process.argv.indexOf('--' + nome);
  if (idx === -1 || idx === process.argv.length - 1) return null;
  return process.argv[idx + 1];
}

function slug(testo) {
  return testo
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // toglie gli accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}


// ---- Excel (.xlsx) minimale senza dipendenze: elenco di tutte le licenze emesse ----
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zipSemplice(files) {
  const zlib = require('zlib');
  const locali = [], centrali = [];
  let offset = 0;
  for (const [nome, testo] of files) {
    const nomeB = Buffer.from(nome, 'utf8');
    const dati = Buffer.from(testo, 'utf8');
    const comp = zlib.deflateRawSync(dati);
    const crc = crc32(dati);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6);
    loc.writeUInt16LE(8, 8); loc.writeUInt32LE(0x21, 12); // data fissa 1980-01-01
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(dati.length, 22);
    loc.writeUInt16LE(nomeB.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10); cen.writeUInt32LE(0x21, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(dati.length, 24);
    cen.writeUInt16LE(nomeB.length, 28); cen.writeUInt32LE(offset, 42);
    locali.push(loc, nomeB, comp);
    centrali.push(cen, nomeB);
    offset += 30 + nomeB.length + comp.length;
  }
  const cd = Buffer.concat(centrali);
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(files.length, 8); fine.writeUInt16LE(files.length, 10);
  fine.writeUInt32LE(cd.length, 12); fine.writeUInt32LE(offset, 16);
  return Buffer.concat([...locali, cd, fine]);
}
function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function scriviExcel(registro, percorso) {
  const intest = ['Studio', 'Codice macchina', 'Emessa il', 'Scadenza', 'ID licenza'];
  const righe = [intest].concat(registro.map(r => [r.studio, r.fingerprint, r.emessaIl, r.scadenza || 'nessuna', r.id]));
  const col = i => String.fromCharCode(65 + i);
  const sheetData = righe.map((r, ri) =>
    '<row r="' + (ri + 1) + '">' + r.map((v, ci) =>
      '<c r="' + col(ci) + (ri + 1) + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') + '><is><t>' + esc(v) + '</t></is></c>').join('') + '</row>').join('');
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="4" width="14" customWidth="1"/><col min="5" max="5" width="40" customWidth="1"/></cols>' +
    '<sheetData>' + sheetData + '</sheetData></worksheet>';
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Licenze emesse" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheet]
  ];
  fs.writeFileSync(percorso, zipSemplice(files));
}

if (process.argv.includes('--solo-excel')) {
  let reg = [];
  try { reg = JSON.parse(fs.readFileSync(FILE_REGISTRO, 'utf8')); } catch (e) {}
  scriviExcel(reg, path.join(CARTELLA, 'Licenze-emesse.xlsx'));
  console.log('Licenze-emesse.xlsx rigenerato (' + reg.length + ' licenze).');
  process.exit(0);
}

const studio = leggiArgomento('studio');
const fingerprint = leggiArgomento('fingerprint');
const scadenza = leggiArgomento('scadenza'); // opzionale, formato YYYY-MM-DD
const moduliArg = leggiArgomento('moduli'); // opzionale, es. "base,portale"

if (!studio || !fingerprint) {
  console.log('');
  console.log('Uso: node genera-licenza.js --studio "Nome Studio" --fingerprint XXXX-XXXX-XXXX-XXXX [--scadenza YYYY-MM-DD] [--moduli base,portale]');
  console.log('');
  process.exit(1);
}

if (!fs.existsSync(FILE_PRIVATA)) {
  console.log('');
  console.log('Non trovo ' + FILE_PRIVATA);
  console.log('Esegui prima "node genera-chiavi.js" (una tantum) per creare la coppia di chiavi.');
  console.log('');
  process.exit(1);
}

const chiavePrivata = fs.readFileSync(FILE_PRIVATA, 'utf8');

const dati = {
  studio,
  fingerprint: fingerprint.toUpperCase(),
  emessaIl: new Date().toISOString().slice(0, 10),
  id: crypto.randomUUID()
};
if (scadenza) dati.scadenza = scadenza;
if (moduliArg) dati.moduli = moduliArg.split(',').map(m => m.trim()).filter(Boolean);

const licenzaFirmata = firmaLicenza(dati, chiavePrivata);

const cartellaCliente = path.join(CARTELLA_EMESSE, slug(studio));
fs.mkdirSync(cartellaCliente, { recursive: true });
const fileLicenza = path.join(cartellaCliente, 'license.json');
fs.writeFileSync(fileLicenza, JSON.stringify(licenzaFirmata, null, 2), 'utf8');

// Aggiorna il registro locale (append-only) - il "chi ha già una licenza" di Matteo
let registro = [];
if (fs.existsSync(FILE_REGISTRO)) {
  try { registro = JSON.parse(fs.readFileSync(FILE_REGISTRO, 'utf8')); } catch (err) { registro = []; }
}
registro.push({ studio, fingerprint: dati.fingerprint, emessaIl: dati.emessaIl, scadenza: scadenza || null, id: dati.id });
fs.writeFileSync(FILE_REGISTRO, JSON.stringify(registro, null, 2), 'utf8');

// Excel con tutte le licenze emesse (sempre in licensing\)
const FILE_EXCEL = path.join(CARTELLA, 'Licenze-emesse.xlsx');
let excelOk = true;
try { scriviExcel(registro, FILE_EXCEL); } catch (err) { excelOk = false; console.log('ATTENZIONE: non riesco a scrivere Licenze-emesse.xlsx (è aperto in Excel? Chiudilo e rilancia: la licenza è comunque stata emessa e registrata). ' + err.message); }

console.log('');
console.log('Licenza emessa per "' + studio + '".');
console.log('  File: ' + fileLicenza);
console.log('  Fingerprint: ' + dati.fingerprint);
if (excelOk) console.log('  Elenco licenze aggiornato: ' + FILE_EXCEL);
if (scadenza) console.log('  Scadenza: ' + scadenza);
console.log('');
console.log('Prossimo passo: copia questo file "license.json" nella cartella di');
console.log('installazione di Prisma sul PC del cliente (accanto a server.js), oppure');
console.log('precaricalo sulla chiavetta USB prima di prepararla per questo cliente.');
console.log('');
