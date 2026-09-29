#!/usr/bin/env node
/*
 * ============================================================================
 *  SERVER-LICENZE - backend online di licensing per Prisma
 * ============================================================================
 *  Questo è il servizio che TU (Matteo) fai girare online, separato dalle
 *  installazioni dei singoli studi clienti - loro parlano con questo server
 *  solo per attivare/rinnovare la licenza (poche chiamate, dati minimi),
 *  MAI per i loro dati (clienti, scadenze, ecc. restano sempre e solo dentro
 *  la loro installazione locale, come oggi).
 *
 *  Cosa fa:
 *    - POST /api/attiva      { codice, fingerprintStudio } → se il codice
 *      esiste ed è attivo, lega (la prima volta) il codice a quel
 *      fingerprint e ritorna una licenza FIRMATA (Ed25519, stessa chiave
 *      privata di sempre - vedi ../licensing/lib.js) pronta da salvare come
 *      license.json sul PC del cliente.
 *    - POST /api/rinnova     { codice, fingerprintStudio } → stessa idea, ma
 *      per un codice già attivato: riemette una licenza firmata fresca con
 *      la scadenza CORRENTE nel database (quella che i webhook PayPal
 *      aggiornano ad ogni pagamento riuscito).
 *    - POST /api/webhook-paypal → riceve gli eventi di PayPal Subscriptions
 *      (nuovo abbonamento, pagamento riuscito, cancellazione...) e aggiorna
 *      il database delle licenze di conseguenza. Vedi gestisciEventoPayPal
 *      più sotto per i singoli eventi gestiti.
 *
 *  Margine di grazia: la data di scadenza scritta nella licenza FIRMATA è
 *  quella del database + GIORNI_GRAZIA (default 10) - assorbe un rinnovo
 *  automatico che arriva con un giorno di ritardo, o un client che non
 *  riesce a contattare questo server per un po' (internet giù, questo
 *  servizio momentaneamente irraggiungibile...) senza mai bloccare
 *  bruscamente un cliente a metà di una giornata lavorativa.
 *
 *  Setup: vedi README.md in questa stessa cartella per come deployarlo,
 *  creare l'app PayPal REST, il Product/Plan degli abbonamenti e il webhook.
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { leggiDb, scriviDb, generaCodice, trovaLicenzaPerCodice } = require('./db.js');
const { firmaLicenza } = require('../licensing/lib.js');
const paypal = require('./paypal.js');
const { inviaEmail, testoEmailCodiceLicenza } = require('./email.js');

const PORTA = Number(process.env.PORTA_LICENZE) || 8421;
const FILE_CHIAVE_PRIVATA = process.env.FILE_CHIAVE_PRIVATA_LICENZE || path.join(__dirname, '..', 'licensing', 'chiave-privata.pem');

if (!fs.existsSync(FILE_CHIAVE_PRIVATA)) {
  console.error('');
  console.error('Manca ' + FILE_CHIAVE_PRIVATA);
  console.error('Esegui prima "node licensing/genera-chiavi.js" (una tantum) per creare la coppia di chiavi.');
  console.error('');
  process.exit(1);
}
const CHIAVE_PRIVATA = fs.readFileSync(FILE_CHIAVE_PRIVATA, 'utf8');

const GIORNI_GRAZIA = Number(process.env.GIORNI_GRAZIA_LICENZA) || 10;

// Tutta l'aritmetica sulle date è in UTC, mai in orario locale: "new Date(iso+'T00:00:00')" è
// mezzanotte nel fuso orario del SERVER, e toISOString() la riconverte in UTC - su un server con
// fuso avanti rispetto a UTC (es. l'Italia in ora legale) questo sposta la data indietro di un
// giorno (bug reale, trovato testando questa funzione prima di distribuirla). Costruendo la data
// direttamente in UTC il calcolo non dipende dal fuso orario di dove gira il server.
function scadenzaConGrazia(dataIso) {
  const [anno, mese, giorno] = dataIso.split('-').map(Number);
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  d.setUTCDate(d.getUTCDate() + GIORNI_GRAZIA);
  return d.toISOString().slice(0, 10);
}

function emettiLicenzaFirmata(record) {
  const dati = {
    id: crypto.randomUUID(),
    studio: record.studio,
    fingerprint: record.fingerprintStudio,
    codice: record.codice,
    scadenza: scadenzaConGrazia(record.scadenza),
    emessaIl: new Date().toISOString().slice(0, 10),
  };
  return firmaLicenza(dati, CHIAVE_PRIVATA);
}

function leggiCorpo(req, cb) {
  let corpo = '';
  req.on('data', (c) => { corpo += c; if (corpo.length > 1024 * 1024) req.destroy(); });
  req.on('end', () => cb(corpo));
  req.on('error', () => cb(''));
}

function rispondi(res, status, oggetto) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(oggetto));
}

// ---------------------------------------------------------------------------
// Gestione eventi PayPal Subscriptions (chiamata dal webhook, dopo verifica firma)
// ---------------------------------------------------------------------------
function prossimaScadenza(piano) {
  const oggi = new Date();
  const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()));
  if (piano === 'annuale') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

async function gestisciEventoPayPal(evento) {
  const tipo = evento.event_type;
  const risorsa = evento.resource || {};
  const subscriptionId = risorsa.id || risorsa.billing_agreement_id || null;
  if (!subscriptionId) return;

  // Nuovo abbonamento attivato per la prima volta: crea la riga licenza + genera il codice, poi
  // prova a mandarlo via email (vedi email.js - se RESEND_API_KEY non è configurata, non fa nulla
  // e il codice resta comunque recuperabile a mano dal database/log come prima, nessuna rottura).
  if (tipo === 'BILLING.SUBSCRIPTION.ACTIVATED') {
    const db = leggiDb();
    if (db.licenze.some((l) => l.paypalSubscriptionId === subscriptionId)) return; // già creata (webhook duplicato)
    const dettagli = await paypal.dettagliAbbonamento(subscriptionId).catch(() => null);
    const email = (dettagli && dettagli.subscriber && dettagli.subscriber.email_address) || null;
    const planId = risorsa.plan_id || (dettagli && dettagli.plan_id) || null;
    const piano = (process.env.PAYPAL_PLAN_ANNUALE && planId === process.env.PAYPAL_PLAN_ANNUALE) ? 'annuale' : 'mensile';
    const record = {
      id: crypto.randomUUID(),
      codice: generaCodice(),
      studio: (risorsa.custom_id || email || 'Nuovo studio').toString(),
      email,
      fingerprintStudio: null,
      piano,
      paypalSubscriptionId: subscriptionId,
      stato: 'attiva',
      scadenza: prossimaScadenza(piano),
      creataIl: new Date().toISOString().slice(0, 10),
      attivataIl: null,
      ultimoRinnovoIl: null,
    };
    db.licenze.push(record);
    scriviDb(db);
    console.log('[licenze] Nuova licenza creata: ' + record.codice + ' (' + record.studio + ', piano ' + piano + ').');
    if (email) {
      const { oggetto, corpo, corpoHtml } = testoEmailCodiceLicenza(record);
      inviaEmail({ a: email, oggetto, corpo, corpoHtml }).then((esito) => {
        console.log(esito.inviata ? ('[licenze] Codice inviato via email a ' + email) : ('[licenze] Email codice NON inviata (' + esito.errore + ') - da mandare a mano: ' + record.codice + ' → ' + email));
      });
    } else {
      console.log('[licenze] Nessuna email trovata per questo abbonamento - manda il codice a mano: ' + record.codice);
    }
    return;
  }

  // Pagamento (primo o rinnovo) andato a buon fine: sposta avanti la scadenza di un ciclo.
  if (tipo === 'PAYMENT.SALE.COMPLETED' || tipo === 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED' || tipo === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
    const db = leggiDb();
    const record = db.licenze.find((l) => l.paypalSubscriptionId === subscriptionId);
    if (!record) return; // pagamento su un abbonamento che non conosciamo ancora (arriverà ACTIVATED a breve)
    record.scadenza = prossimaScadenza(record.piano);
    record.stato = 'attiva';
    record.ultimoRinnovoIl = new Date().toISOString().slice(0, 10);
    scriviDb(db);
    console.log('[licenze] Rinnovata: ' + record.codice + ' → nuova scadenza ' + record.scadenza);
    return;
  }

  // Fine abbonamento, in un modo o nell'altro: la licenza smette di rinnovarsi. Non tocchiamo la
  // scadenza già emessa - la app del cliente andrà in sola lettura da sola quando quella data
  // (più il margine di grazia) passa, coerente col resto del sistema.
  if (tipo === 'BILLING.SUBSCRIPTION.CANCELLED' || tipo === 'BILLING.SUBSCRIPTION.SUSPENDED' || tipo === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const db = leggiDb();
    const record = db.licenze.find((l) => l.paypalSubscriptionId === subscriptionId);
    if (!record) return;
    record.stato = tipo.endsWith('CANCELLED') ? 'cancellata' : 'sospesa';
    scriviDb(db);
    console.log('[licenze] ' + record.codice + ' → stato "' + record.stato + '"');
    return;
  }
}

// ---------------------------------------------------------------------------
// Server HTTP
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/' && req.method === 'GET') return rispondi(res, 200, { ok: true, servizio: 'Prisma - server licenze', ambiente: paypal.AMBIENTE });

  if (url === '/api/attiva' && req.method === 'POST') {
    leggiCorpo(req, (corpo) => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (err) { return rispondi(res, 400, { ok: false, errore: 'Richiesta non valida.' }); }
      const codice = (dati && typeof dati.codice === 'string') ? dati.codice.trim().toUpperCase() : '';
      const fingerprint = (dati && typeof dati.fingerprintStudio === 'string') ? dati.fingerprintStudio.trim() : '';
      if (!codice || !fingerprint) return rispondi(res, 400, { ok: false, errore: 'Codice o codice macchina mancante.' });

      const record = trovaLicenzaPerCodice(codice);
      if (!record) return rispondi(res, 404, { ok: false, errore: 'Codice non riconosciuto. Controlla di averlo copiato correttamente, o contatta l\'assistenza.' });
      if (record.stato === 'cancellata') return rispondi(res, 403, { ok: false, errore: 'Questa licenza è stata cancellata.' });
      if (record.fingerprintStudio && record.fingerprintStudio !== fingerprint) {
        return rispondi(res, 403, { ok: false, errore: 'Questo codice è già attivo su un altro computer. Contatta l\'assistenza se devi trasferirlo su una nuova macchina.' });
      }
      if (!record.fingerprintStudio) {
        // Prima attivazione: lega il codice a questo studio (fingerprint del PC server) - da qui
        // in poi resta fisso, un eventuale trasferimento lo fa Matteo a mano nel database.
        const db = leggiDb();
        const rec = db.licenze.find((l) => l.codice === codice);
        rec.fingerprintStudio = fingerprint;
        rec.attivataIl = new Date().toISOString().slice(0, 10);
        scriviDb(db);
        record.fingerprintStudio = fingerprint;
      }
      try {
        const licenza = emettiLicenzaFirmata(record);
        rispondi(res, 200, { ok: true, licenza });
      } catch (err) {
        console.error('[licenze] Errore emettendo licenza:', err.message);
        rispondi(res, 500, { ok: false, errore: 'Errore interno emettendo la licenza.' });
      }
    });
    return;
  }

  if (url === '/api/rinnova' && req.method === 'POST') {
    leggiCorpo(req, (corpo) => {
      let dati;
      try { dati = JSON.parse(corpo); } catch (err) { return rispondi(res, 400, { ok: false, errore: 'Richiesta non valida.' }); }
      const codice = (dati && typeof dati.codice === 'string') ? dati.codice.trim().toUpperCase() : '';
      const fingerprint = (dati && typeof dati.fingerprintStudio === 'string') ? dati.fingerprintStudio.trim() : '';
      if (!codice || !fingerprint) return rispondi(res, 400, { ok: false, errore: 'Codice o codice macchina mancante.' });

      const record = trovaLicenzaPerCodice(codice);
      if (!record) return rispondi(res, 404, { ok: false, errore: 'Codice non riconosciuto.' });
      if (record.fingerprintStudio !== fingerprint) return rispondi(res, 403, { ok: false, errore: 'Codice macchina non corrispondente.' });
      if (record.stato === 'cancellata') return rispondi(res, 403, { ok: false, errore: 'Licenza cancellata.' });
      try {
        const licenza = emettiLicenzaFirmata(record);
        rispondi(res, 200, { ok: true, licenza });
      } catch (err) {
        console.error('[licenze] Errore rinnovando licenza:', err.message);
        rispondi(res, 500, { ok: false, errore: 'Errore interno rinnovando la licenza.' });
      }
    });
    return;
  }

  if (url === '/api/webhook-paypal' && req.method === 'POST') {
    leggiCorpo(req, async (corpo) => {
      let evento;
      try { evento = JSON.parse(corpo); } catch (err) { return rispondi(res, 400, { ok: false, errore: 'Corpo webhook non valido.' }); }
      let valido = false;
      try {
        valido = await paypal.verificaFirmaWebhook(req.headers, evento);
      } catch (err) {
        console.error('[licenze] Webhook PayPal: verifica firma fallita:', err.message);
        // 200 comunque: se il problema è nostro (es. credenziali momentaneamente sbagliate),
        // rispondere con errore farebbe ritentare PayPal all'infinito sullo stesso evento.
        return rispondi(res, 200, { ok: true });
      }
      if (!valido) {
        console.error('[licenze] Webhook PayPal: firma NON valida, evento ignorato.');
        return rispondi(res, 400, { ok: false });
      }
      try {
        await gestisciEventoPayPal(evento);
      } catch (err) {
        console.error('[licenze] Errore gestendo evento PayPal:', err.message);
      }
      rispondi(res, 200, { ok: true });
    });
    return;
  }

  rispondi(res, 404, { ok: false, errore: 'Non trovato.' });
});

server.listen(PORTA, () => {
  console.log('Server licenze Prisma in ascolto sulla porta ' + PORTA + ' (ambiente PayPal: ' + paypal.AMBIENTE + ')');
  if (paypal.AMBIENTE !== 'live') console.log('ATTENZIONE: ambiente sandbox - nessun pagamento reale viene elaborato. Imposta PAYPAL_AMBIENTE=live in produzione.');
});
