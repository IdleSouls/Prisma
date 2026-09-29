/*
 * ============================================================================
 *  EMAIL - invio email transazionali (Resend) per lo studio
 * ============================================================================
 *  Zero dipendenze npm - solo "https" nativo, stesso stile del resto del
 *  progetto (vedi licensing-server/paypal.js e licensing-server/email.js, di
 *  cui questo è il gemello per il lato "un cliente Prisma", non per Matteo).
 *
 *  A differenza di licensing-server/email.js (che legge le credenziali da
 *  variabili d'ambiente, perché è UN server con UNA configurazione), qui le
 *  credenziali arrivano come parametro ad ogni chiamata: ogni studio che usa
 *  Prisma ha il proprio account Resend e il proprio dominio mittente,
 *  configurati da Impostazioni → Email (STATE.meta.emailMittente /
 *  emailResendApiKey) e salvati cifrati su disco da server.js (stessa
 *  meccanica del vault password - vedi cifraCredenzialiInDati). Questo modulo
 *  non sa nulla di STATE: riceve solo apiKey/mittente già pronti all'uso.
 * ============================================================================
 */

const https = require('https');

function richiestaJSON(apiKey, metodo, percorso, corpo) {
  return new Promise((resolve, reject) => {
    const dati = Buffer.from(JSON.stringify(corpo), 'utf8');
    const opzioni = {
      hostname: 'api.resend.com',
      path: percorso,
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': dati.length,
      },
      timeout: 15000,
    };
    const req = https.request(opzioni, (res) => {
      const pezzi = [];
      res.on('data', (d) => pezzi.push(d));
      res.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let parsed = {};
        try { parsed = testo ? JSON.parse(testo) : {}; } catch (err) { /* risposta non JSON: teniamo il testo grezzo sotto */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error('Resend ha risposto ' + res.statusCode + ': ' + (testo || parsed.message || '').toString().slice(0, 300)));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo scaduto contattando Resend')));
    req.on('error', reject);
    req.write(dati);
    req.end();
  });
}

// { apiKey, mittente, a, oggetto, corpo, corpoHtml? } - non lancia mai eccezioni: ritorna sempre
// { inviata: bool, errore?: string }, così chi la chiama (un endpoint HTTP di server.js) può
// rispondere con un messaggio chiaro invece di un 500 generico.
async function inviaEmail({ apiKey, mittente, a, oggetto, corpo, corpoHtml }) {
  if (!apiKey) return { inviata: false, errore: 'Email non configurata (manca la API key Resend in Impostazioni → Email).' };
  if (!mittente) return { inviata: false, errore: 'Email non configurata (manca il mittente in Impostazioni → Email).' };
  if (!a) return { inviata: false, errore: 'Destinatario mancante.' };
  try {
    await richiestaJSON(apiKey, 'POST', '/emails', {
      from: mittente,
      to: [a],
      subject: oggetto,
      text: corpo,
      html: corpoHtml || undefined,
    });
    return { inviata: true };
  } catch (err) {
    return { inviata: false, errore: err.message };
  }
}

module.exports = { inviaEmail };
