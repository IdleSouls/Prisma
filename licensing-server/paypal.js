/*
 * ============================================================================
 *  PAYPAL - client minimale per le API REST di PayPal (Subscriptions)
 * ============================================================================
 *  Zero dipendenze npm - solo "https" nativo, stesso stile del resto di
 *  Prisma. Le credenziali arrivano SEMPRE da variabili d'ambiente, mai scritte
 *  nel codice:
 *
 *    PAYPAL_CLIENT_ID       - dall'app REST creata nel Developer Dashboard
 *    PAYPAL_CLIENT_SECRET   - idem (tenerlo SOLO come variabile d'ambiente sul
 *                              server, mai in chat, mai in un file versionato)
 *    PAYPAL_WEBHOOK_ID      - id del webhook configurato nel Dashboard, serve
 *                              per verificare che un webhook in arrivo sia
 *                              autentico
 *    PAYPAL_AMBIENTE        - 'sandbox' (default, per testare) o 'live'
 *    PAYPAL_PLAN_ANNUALE    - id del piano annuale (per distinguerlo dal
 *                              mensile quando arriva un evento - vedi
 *                              server-licenze.js)
 *
 *  Vedi README.md in questa cartella per come crearle passo per passo.
 * ============================================================================
 */

const https = require('https');

const AMBIENTE = process.env.PAYPAL_AMBIENTE || 'sandbox';
const BASE_URL = AMBIENTE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

function richiestaJSON(metodo, percorso, corpo, headerExtra) {
  return new Promise((resolve, reject) => {
    const dati = corpo ? Buffer.from(JSON.stringify(corpo), 'utf8') : null;
    const u = new URL(BASE_URL + percorso);
    const opzioni = {
      method: metodo,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        headerExtra || {},
        dati ? { 'Content-Length': dati.length } : {}
      ),
      timeout: 15000,
    };
    const req = https.request(u, opzioni, (res) => {
      const pezzi = [];
      res.on('data', (d) => pezzi.push(d));
      res.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let parsed = {};
        try { parsed = testo ? JSON.parse(testo) : {}; } catch (err) { /* alcune risposte PayPal sono vuote (es. 204) */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error('PayPal ha risposto ' + res.statusCode + ': ' + testo.slice(0, 300)));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo scaduto contattando PayPal')));
    req.on('error', reject);
    if (dati) req.write(dati);
    req.end();
  });
}

function richiestaFormUrlEncoded(percorso, corpoForm, headerExtra) {
  return new Promise((resolve, reject) => {
    const dati = Buffer.from(corpoForm, 'utf8');
    const u = new URL(BASE_URL + percorso);
    const opzioni = {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': dati.length },
        headerExtra || {}
      ),
      timeout: 15000,
    };
    const req = https.request(u, opzioni, (res) => {
      const pezzi = [];
      res.on('data', (d) => pezzi.push(d));
      res.on('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(testo); } catch (err) { return reject(new Error('Risposta OAuth PayPal non valida.')); }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error('OAuth PayPal ha risposto ' + res.statusCode));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo scaduto contattando PayPal (OAuth)')));
    req.on('error', reject);
    req.write(dati);
    req.end();
  });
}

// Token OAuth con piccola cache in memoria (dura tipicamente ~9h lato PayPal) - evita di
// richiederne uno nuovo ad ogni singola chiamata.
let tokenCache = null; // { accessToken, scadenza: epoch ms }
async function ottieniAccessToken() {
  if (tokenCache && tokenCache.scadenza > Date.now() + 30000) return tokenCache.accessToken;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET non configurate (variabili d\'ambiente).');
  const basic = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const risposta = await richiestaFormUrlEncoded('/v1/oauth2/token', 'grant_type=client_credentials', { Authorization: 'Basic ' + basic });
  tokenCache = { accessToken: risposta.access_token, scadenza: Date.now() + (risposta.expires_in || 300) * 1000 };
  return tokenCache.accessToken;
}

async function dettagliAbbonamento(subscriptionId) {
  const token = await ottieniAccessToken();
  return richiestaJSON('GET', '/v1/billing/subscriptions/' + encodeURIComponent(subscriptionId), null, { Authorization: 'Bearer ' + token });
}

// Verifica l'autenticità di un webhook in arrivo chiedendolo a PayPal stesso (più semplice e
// robusto che riverificare la firma localmente) - vedi
// https://developer.paypal.com/api/rest/webhooks/rest/#link-verifywebhooksignature
// headers deve essere l'oggetto req.headers della richiesta webhook in arrivo (case-insensitive,
// Node li normalizza già in minuscolo).
async function verificaFirmaWebhook(headers, corpoEvento) {
  const token = await ottieniAccessToken();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID non configurato (variabile d\'ambiente).');
  const payload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: corpoEvento,
  };
  const risposta = await richiestaJSON('POST', '/v1/notifications/verify-webhook-signature', payload, { Authorization: 'Bearer ' + token });
  return !!risposta && risposta.verification_status === 'SUCCESS';
}

module.exports = { dettagliAbbonamento, verificaFirmaWebhook, ottieniAccessToken, AMBIENTE };
