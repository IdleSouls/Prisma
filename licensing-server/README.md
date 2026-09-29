# Server licenze Prisma — setup

Questo è il backend online che gestisce vendita e rinnovo delle licenze Prisma via PayPal. Gira separato dalle installazioni dei clienti: loro lo contattano solo per attivare/rinnovare la licenza (poche chiamate, nessun dato dello studio — quello resta sempre in locale).

Prerequisito: la coppia di chiavi Ed25519 deve già esistere in `../licensing/` (`chiave-privata.pem` + `chiave-pubblica.pem`), generata con `node licensing/genera-chiavi.js`.

**Nota:** in questo momento nella cartella `licensing/` risulta presente solo `chiave-privata.pem` — manca `chiave-pubblica.pem`. Va ritrovata (probabilmente spostata altrove, es. in una cartella di staging per un cliente) o rigenerata prima di poter usare questo server e prima che `server.js` possa verificare le licenze. Rigenerare la coppia invaliderebbe tutte le licenze già emesse in passato con la chiave attuale, quindi meglio ritrovare il file originale se possibile.

## 1. Variabili d'ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `PAYPAL_CLIENT_ID` | sì | Dall'app REST creata nel Developer Dashboard PayPal |
| `PAYPAL_CLIENT_SECRET` | sì | Idem — **solo** come variabile d'ambiente sul server, mai in chat, mai in un file versionato |
| `PAYPAL_WEBHOOK_ID` | sì | Id del webhook configurato nel Dashboard (serve per verificare che un evento in arrivo sia autentico) |
| `PAYPAL_AMBIENTE` | no (default `sandbox`) | `sandbox` per testare, `live` per i pagamenti reali |
| `PAYPAL_PLAN_ANNUALE` | no | Id del piano annuale, per distinguerlo dal mensile quando arriva un evento `BILLING.SUBSCRIPTION.ACTIVATED` |
| `PORTA_LICENZE` | no (default `8421`) | Porta HTTP del servizio |
| `GIORNI_GRAZIA_LICENZA` | no (default `10`) | Giorni di margine oltre la scadenza reale, scritti nella licenza firmata (assorbe ritardi di rinnovo/rete) |
| `FILE_CHIAVE_PRIVATA_LICENZE` | no | Percorso alternativo a `chiave-privata.pem`, se non nella posizione di default |
| `RESEND_API_KEY` | no | Da resend.com/api-keys — senza questa, l'invio dell'email col codice licenza è disattivato (il codice resta comunque nel database/log, vedi §7) |
| `EMAIL_MITTENTE` | no (default dominio di test Resend) | Es. `Prisma <licenze@tuodominio.it>` — il dominio va prima verificato su Resend (DNS SPF/DKIM) |

## 2. Creare l'app REST PayPal

1. https://developer.paypal.com/dashboard/ → **Apps & Credentials**.
2. Per testare: resta su **Sandbox**. Per andare in produzione: passa a **Live**.
3. **Create App** → tipo *Merchant*. Copia **Client ID** e **Secret**: sono `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`.

## 3. Creare Product + Plan (abbonamenti mensile/annuale)

PayPal Subscriptions richiede un **Product** (Prisma) con uno o più **Plan** (i prezzi/cicli).

Più semplice da dashboard: **Apps & Credentials** → seleziona l'app → sezione *Subscriptions*, oppure via API con lo stesso Client ID/Secret (`POST /v1/catalogs/products`, poi `POST /v1/billing/plans`). Serve un Plan mensile e uno annuale, entrambi collegati allo stesso Product.

Dopo aver creato il Plan annuale, prendi il suo `plan_id` e impostalo come `PAYPAL_PLAN_ANNUALE` — è l'unico modo che questo server ha per distinguere "è stato attivato l'annuale" da "è stato attivato il mensile" quando arriva l'evento `BILLING.SUBSCRIPTION.ACTIVATED` (PayPal manda solo il `plan_id`, non un'etichetta "mensile"/"annuale").

Il pulsante di acquisto sul tuo sito (o una pagina PayPal.me/checkout) userà il `plan_id` del piano scelto dal cliente per creare l'abbonamento.

## 4. Configurare il webhook

1. Nella stessa app REST, sezione **Webhooks** → **Add Webhook**.
2. URL: `https://<il-tuo-dominio>/api/webhook-paypal` (deve essere raggiungibile pubblicamente via HTTPS — vedi sezione Deploy).
3. Eventi da abilitare (minimo indispensabile, quelli che questo server gestisce):
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `PAYMENT.SALE.COMPLETED`
   - `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED`
   - `BILLING.SUBSCRIPTION.RE-ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
4. Salva, poi copia il **Webhook ID** mostrato: è `PAYPAL_WEBHOOK_ID`.

## 5. Avvio

```bash
cd licensing-server
PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_WEBHOOK_ID=... PAYPAL_PLAN_ANNUALE=... PAYPAL_AMBIENTE=sandbox node server-licenze.js
```

In produzione va tenuto vivo con un process manager (es. `pm2`, o un servizio systemd) e dietro HTTPS — vedi sotto.

## 6. Deploy — cosa serve davvero

Questo è il **primo pezzo di infrastruttura online di Prisma**: finora tutto girava in locale nello studio (server.js) o come pagine statiche (l'update-check legge un manifest su GitHub). Questo server invece deve stare acceso 24/7 e raggiungibile da internet, perché i client dei tuoi clienti gli parlano per attivare/rinnovare. Serve quindi:

- Una VM o un servizio PaaS (es. una piccola VPS, Render, Railway, Fly.io...) — non serve niente di potente, il carico è minimo (poche richieste per studio, non per utente).
- Un dominio (anche un sottodominio) con HTTPS — PayPal richiede HTTPS per i webhook, e comunque non va esposta questa API in chiaro.
- Il file `db-licenze.json` (creato automaticamente al primo utilizzo, nella stessa cartella) deve stare su un disco persistente — se lo hosting usa filesystem effimero (es. molti PaaS "free tier"), va montato un volume persistente o va cambiata la strategia di storage.
- `chiave-privata.pem` deve arrivare su quella macchina in modo sicuro (mai committata in un repo pubblico) — è la stessa identica chiave usata finora per firmare le licenze manuali, quindi la sua compromissione avrebbe lo stesso impatto di oggi.

## 7. Invio del codice al cliente via email

Quando arriva `BILLING.SUBSCRIPTION.ACTIVATED`, il server genera il codice (`PRISMA-XXXX-XXXX`), lo scrive nel database/log, e prova a mandarlo via email al cliente (`email.js`, provider **Resend** — API HTTP semplice, coerente con lo stile "solo `https` nativo, zero SDK" già usato in `paypal.js`).

Per attivarlo davvero:

1. Crea un account su resend.com (piano gratuito sufficiente per questi volumi).
2. Verifica un tuo dominio (Resend → Domains → Add Domain, poi aggiungi i record DNS SPF/DKIM che mostra — richiede accesso al pannello DNS del dominio).
3. Crea una API key (resend.com/api-keys) → `RESEND_API_KEY`.
4. Imposta `EMAIL_MITTENTE`, es. `Prisma <licenze@tuodominio.it>` (deve usare il dominio verificato al punto 2).

Finché `RESEND_API_KEY` non è impostata, l'invio è un no-op silenzioso e il flusso resta esattamente come prima: il codice va recuperato a mano dal log o dal database e comunicato tu stesso al cliente — nessuna rottura, si attiva quando sei pronto.

**Nota:** questo stesso modulo (`email.js`) è pensato per essere riusabile anche per mandare comunicazioni ai clienti direttamente dall'app (oggi Prisma apre solo un `mailto:` precompilato — vedi task aperto "Integrazione email per invio comunicazioni ai clienti"), ma quella parte non è ancora collegata: per ora `inviaEmail()` è chiamata solo da qui.

## 8. Test

`db.js` e `paypal.js` non hanno dipendenze da rete per generare codici o firmare licenze di prova — si possono testare isolatamente con chiavi Ed25519 usa-e-getta (mai la chiave privata reale) tramite `generaChiavi()` in `../licensing/lib.js`. Il flusso completo (`/api/attiva`, `/api/webhook-paypal`) va invece testato contro l'ambiente **sandbox** di PayPal (account di test dal Developer Dashboard) prima di passare a `live`.
