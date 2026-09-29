/*
 * ============================================================================
 *  EMAIL - invio email transazionali (Resend) per il server licenze
 * ============================================================================
 *  Zero dipendenze npm - solo "https" nativo, stesso stile di paypal.js. Serve
 *  per UNA cosa sola per ora: mandare al cliente il codice PRISMA-XXXX-XXXX
 *  appena l'abbonamento PayPal si attiva (vedi server-licenze.js,
 *  gestisciEventoPayPal → BILLING.SUBSCRIPTION.ACTIVATED). Finché
 *  RESEND_API_KEY non è configurata, inviaEmail() non fa nulla (risolve senza
 *  errore) - il codice resta comunque nel database e nel log, recuperabile a
 *  mano: nessuna rottura per chi non ha ancora configurato l'invio.
 *
 *  Perché Resend: API HTTP semplice (un solo POST, niente SMTP da configurare,
 *  niente libreria), dominio mittente verificabile in pochi minuti, piano
 *  gratuito sufficiente per i volumi di Prisma (poche email per attivazione/
 *  rinnovo, non newsletter). Cambiare provider in futuro (Postmark, SendGrid)
 *  vuol dire riscrivere solo questo file: il resto del codice chiama sempre e
 *  solo inviaEmail(), mai l'API del provider direttamente.
 *
 *  Variabili d'ambiente:
 *    RESEND_API_KEY   - dalla dashboard Resend (resend.com/api-keys). Se
 *                        mancante, inviaEmail() è un no-op silenzioso.
 *    EMAIL_MITTENTE    - es. "Prisma <licenze@tuodominio.it>" - il dominio va
 *                        prima verificato su Resend (DNS: SPF/DKIM), altrimenti
 *                        Resend rifiuta l'invio. Default: onboarding@resend.dev
 *                        (dominio di test di Resend, utile SOLO per provare -
 *                        va sempre sostituito con un dominio proprio prima di
 *                        andare live, altrimenti le email finiscono spesso in
 *                        spam o Resend le rifiuta per volumi oltre il test).
 * ============================================================================
 */

const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_MITTENTE = process.env.EMAIL_MITTENTE || 'Prisma <onboarding@resend.dev>';

function richiestaJSON(metodo, percorso, corpo) {
  return new Promise((resolve, reject) => {
    const dati = Buffer.from(JSON.stringify(corpo), 'utf8');
    const opzioni = {
      hostname: 'api.resend.com',
      path: percorso,
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + RESEND_API_KEY,
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
        else reject(new Error('Resend ha risposto ' + res.statusCode + ': ' + (testo || '').slice(0, 300)));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo scaduto contattando Resend')));
    req.on('error', reject);
    req.write(dati);
    req.end();
  });
}

// { a, oggetto, corpo, corpoHtml? } - corpoHtml opzionale, se assente Resend usa corpo (testo
// semplice) anche come contenuto della mail. Ritorna sempre una Promise che si risolve (mai
// rifiutata) con { inviata: bool, errore?: string } - VOLUTAMENTE non-throwing: un'email non
// mandata non deve mai far fallire il flusso che la richiede (es. l'attivazione di una licenza
// resta valida anche se l'email di conferma non parte).
async function inviaEmail({ a, oggetto, corpo, corpoHtml }) {
  if (!RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY non configurata - email non inviata (destinatario: ' + a + ', oggetto: "' + oggetto + '").');
    return { inviata: false, errore: 'RESEND_API_KEY non configurata' };
  }
  if (!a) return { inviata: false, errore: 'Destinatario mancante' };
  try {
    await richiestaJSON('POST', '/emails', {
      from: EMAIL_MITTENTE,
      to: [a],
      subject: oggetto,
      text: corpo,
      html: corpoHtml || undefined,
    });
    return { inviata: true };
  } catch (err) {
    console.error('[email] Invio non riuscito (destinatario: ' + a + '):', err.message);
    return { inviata: false, errore: err.message };
  }
}

function testoEmailCodiceLicenza(record) {
  const pianoLabel = record.piano === 'annuale' ? 'annuale' : 'mensile';
  const oggetto = 'Il tuo codice di licenza Prisma';
  const corpo = `Ciao,

grazie per aver attivato l'abbonamento ${pianoLabel} a Prisma.

Il tuo codice di licenza è:

  ${record.codice}

Al primo avvio di Prisma sul computer dello studio, inseriscilo quando richiesto (o da Impostazioni → Licenza in qualsiasi momento). Va inserito una sola volta: i rinnovi successivi avvengono da soli, senza bisogno di reinserirlo.

Un saluto.`;
  const corpoHtml = `<p>Ciao,</p>
<p>grazie per aver attivato l'abbonamento ${escapeHtmlSemplice(pianoLabel)} a Prisma.</p>
<p>Il tuo codice di licenza è:</p>
<p style="font-size:18px;font-weight:700;letter-spacing:1px;">${escapeHtmlSemplice(record.codice)}</p>
<p>Al primo avvio di Prisma sul computer dello studio, inseriscilo quando richiesto (o da <b>Impostazioni → Licenza</b> in qualsiasi momento). Va inserito una sola volta: i rinnovi successivi avvengono da soli, senza bisogno di reinserirlo.</p>
<p>Un saluto.</p>`;
  return { oggetto, corpo, corpoHtml };
}
function escapeHtmlSemplice(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { inviaEmail, testoEmailCodiceLicenza };
