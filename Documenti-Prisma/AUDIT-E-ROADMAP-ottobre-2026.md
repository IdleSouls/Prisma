# Prisma — audit di codice e processi, e roadmap sito + pubblicazione (7 ottobre 2026)

Audit fatto leggendo il codice e lanciando i test. Non è un penetration test: dove scrivo "da verificare" non ho una prova.

## Aggiornamento del 7 ottobre (sera): cosa è stato sistemato (v1.17.0)

| Problema | Stato |
|---|---|
| CORS aperto e nessun controllo sull'origine | **Risolto.** Tolto l'header; rifiutate le richieste che scrivono da un sito esterno; rifiutati gli indirizzi sospetti (anti "DNS rebinding"). Provato avviando il server: host sconosciuto 403, scrittura da origine esterna 403, uso normale 200. |
| Chiave delle licenze sostituibile | **Ridotto.** La chiave ora sta dentro l'app, non nella cartella dati. Cambiare un file non basta più. Chi sa smontare l'app o far girare `server.js` a mano può ancora provarci: è un deterrente, non una cassaforte. |
| Aggiornamenti non firmati | **Risolto.** Il manifesto è firmato con la tua chiave privata e Prisma lo rifiuta se la firma manca o non torna. Per pubblicare serve avere `chiave-privata.pem` sul PC. |
| Tentativi di password illimitati | **Risolto** per il login dei collaboratori (5 errori = 5 minuti di blocco). L'accesso da internet (porta ngrok) aveva già un limite di richieste per indirizzo: avevo sbagliato a dire che mancasse. |
| `chiave-privata.pem` in una sola copia | **Da fare tu:** copia il file in due posti (chiavetta + un altro PC), mai su cloud sincronizzato con il progetto. Senza quel file non puoi più emettere licenze né firmare aggiornamenti. |

## 1. Audit del codice

### Da sistemare prima di dare Prisma a studi diversi dal tuo (P0)

| # | Problema | Perché conta | Intervento |
|---|---|---|---|
| 1 | Il server principale (porta 8420) risponde con `Access-Control-Allow-Origin: *` e non ha login. | Qualsiasi sito aperto nel browser del PC dello studio può provare a leggere `/api/stato` (tutti i clienti). I browser recenti limitano le richieste verso reti private, ma non tutti e non sempre. | Togliere gli header CORS (i colleghi aprono la stessa origine, non servono) e controllare l'header `Host` contro il DNS rebinding. Mezz'ora di lavoro. |
| 2 | La chiave pubblica per verificare le licenze sta in `Prisma\licensing\`, cartella scrivibile dall'utente. | Chi sostituisce la chiave e si firma una licenza si attiva da solo. Con `server.js` modificabile si può anche togliere il controllo. | Mettere la chiave dentro l'app (resources, in sola lettura) e verificare in `main.js`. Resta un deterrente, non una protezione assoluta: il resto lo fa il contratto. |
| 3 | Aggiornamenti: `versione.json` e i file stanno nello stesso repository; lo sha256 protegge da file corrotti ma non da un repository compromesso. | Se qualcuno prende il tuo account GitHub può far eseguire codice su tutti i PC dei clienti. | Firmare `versione.json` con la chiave Ed25519 che hai già (lib.js sa firmare e verificare) e verificare prima di applicare. |
| 4 | Gli aggiornamenti oggi funzionano solo con il repository **pubblico**. | Se lo rendi privato, i clienti non si aggiornano più. | Pubblicare gli aggiornamenti sul sito (vedi §3), così il repository resta privato. |
| 5 | Nel repository c'era `Licenze-emesse.xlsx` (nomi studi e codici macchina): **corretto oggi**, tolto dalla cronologia locale prima di qualsiasi push e aggiunto a `.gitignore`. | Se fosse finito su un repository pubblico sarebbe stato un dato dei tuoi clienti. | Fatto. Controlla comunque che `licensing/emesse/` e `chiave-privata.pem` non compaiano mai in `git status`. |
| 6 | `chiave-privata.pem` esiste in una sola copia. | Se perdi il file non puoi più emettere licenze valide; se lo rigeneri, tutte le installazioni vanno ricostruite. | Backup cifrato in due posti diversi (non nel cloud sincronizzato con il progetto). |

### Importanti ma non bloccanti (P1)

- **Electron 33 è vecchio** (`electron-app/package.json`): prima di vendere vale passare a una versione ancora supportata (da verificare quale sia oggi). `npm audit` sulle dipendenze dell'app non segnala vulnerabilità; l'`audit` dell'ambiente di build ne segnala 19, ma sono strumenti di sviluppo, non finiscono nell'installer.
- **Nessun limite ai tentativi di password** (login operatore e password portale) trovato nel codice: aggiungere un blocco temporaneo dopo N errori. Da verificare meglio.
- **Cifratura credenziali:** la chiave `credenziali.key` sta accanto ai dati. Protegge dalla copia del solo file dati, non da chi ha accesso al PC. Per migliorare si può usare la protezione di Windows (safeStorage di Electron). Va detto chiaramente ai clienti, senza vendere "cifratura forte".
- **Test:** `jsdom-test.js` finisce sempre con codice 1 per errori innocui di jsdom (`scrollTo`, font e script esterni non caricati), quindi non si può usare in automatico. Filtrare gli errori noti e farlo girare a ogni commit (GitHub Actions gratuito).
- **Codice monolitico:** `gestionale.htm` è ~19.000 righe. Non serve riscriverlo ora; conviene dividerlo a pezzi solo quando una parte diventa difficile da toccare.
- **Migrazioni dei dati:** esistono funzioni sparse (`migraTipoClienteLegacy`…) ma non una versione dello schema dati. Aggiungere `schemaVersion` e un'unica routine di migrazione con backup automatico prima.
- **Concorrenza:** un solo file JSON, vince l'ultimo che salva. Va bene per pochi utenti; è un limite da dichiarare per studi grandi.
- **Ruoli:** master/admin/limitato filtrano l'interfaccia ma non proteggono i dati. È già scritto nei commenti: scriverlo anche nei documenti per i clienti.
- **Codice macchina:** dipende dal nome del PC e dalla scheda di rete. Rinominare il PC o installare una VPN può invalidare la licenza. Meglio basarlo su un identificativo di Windows più stabile e prevedere un cambio PC semplice.

### Cosa è già buono

Backup automatici con copia esterna, backup prima di ogni aggiornamento, sha256 sugli aggiornamenti, confronto password a tempo costante, password portale nel body, registro e conferma delle azioni dell'IA (MCP), nessuna dipendenza esterna vulnerabile nell'app (`npm audit` pulito), test end-to-end estesi.

## 2. Audit dei processi

| Processo | Oggi | Rischio | Proposta |
|---|---|---|---|
| Rilascio versione | A mano: bump con sed, `pubblica-aggiornamento.js`, push, build installer su Windows | Dimenticanze (es. versione non allineata tra file) | Un solo script/`bat` di rilascio: test → bump → manifesto firmato → build → carica. Un file `CHANGELOG`. |
| Emissione licenza | `Genera-Licenza.bat` + Excel | Ottimo per pochi clienti; nessun promemoria di scadenza | Colonna "scade tra" nell'Excel e rinnovo annuale con il tuo calendario. Nessuna revoca possibile offline: usa licenze con scadenza. |
| Installazione cliente | Installer unico + attivazione in-app | Mai provato su Windows pulito | Test di oggi a casa, poi su un secondo PC. Checklist di installazione. |
| Assistenza | Il cliente ti manda i log a mano | Tempo perso, dati sensibili nei messaggi | Pulsante "Esporta diagnostica" (versione, licenza, log, **senza dati clienti**) in Gestione studio. |
| Aggiornamenti ai clienti | Da GitHub (repo pubblico) | Vedi P0 #3 e #4 | Aggiornamenti dal sito, manifesto firmato. |
| Dati e privacy | On-premise: i dati non passano da te | È un punto di forza | Informativa e contratto chiari. Se fai assistenza con accesso ai dati o se lo studio usa l'IA, vale una nota sul trattamento: da far valutare a un legale. |
| Sviluppo | Un solo sviluppatore, sandbox + Windows | Se non ci sei tu, nessuno sa ricostruire | Documentare in un `COSTRUIRE.md` come si costruisce e si rilascia. Backup del progetto fuori dal PC. |

## 3. Il sito gratis: si può?

Sì. Il paragone con ngrok va corretto: ngrok espone il tuo PC su internet, il sito invece è una pagina **statica** che sta su un servizio di hosting. Non serve nessun server tuo acceso.

**Opzione consigliata: Cloudflare Pages.** Gratis, uso commerciale ammesso, banda per i file statici senza limite, indirizzo gratuito `nome.pages.dev`, collegamento di un dominio tuo quando vuoi. Limiti del piano gratuito: 20.000 file per sito, 25 MiB per file, 500 build al mese.

**GitHub Pages** è gratuito e semplice, ma i termini dicono che non è pensato per siti il cui scopo principale è facilitare transazioni commerciali o offrire software come servizio. Un sito che vende una licenza ci rientra a rischio. Lo userei solo per la documentazione.

**Netlify** da settembre 2025 usa un sistema a crediti (300 al mese, poi i siti si fermano): meno adatto.

Cose da sapere:
- **Il file di installazione pesa circa 200 MB**, oltre il limite di 25 MiB per file di Cloudflare Pages. Va ospitato altrove (release GitHub o un link a OneDrive/Drive con accesso su richiesta). Gli aggiornamenti di Prisma (pochi MB) possono stare sul sito.
- **Dominio proprio:** facoltativo, qualche euro all'anno. Un indirizzo `.pages.dev` va bene per i primi studi pilota, ma per vendere fa più professionale un dominio tuo.
- **Il nome "Prisma":** è molto diffuso (c'è un noto ORM e il suo "Prisma Studio"). Prima di comprare un dominio o stampare materiale, cerca conflitti di marchio e di ricerca su Google. Da verificare, e se serve scegliere un nome più distintivo (anche solo "Prisma per studi professionali").
- **Pagamenti:** per i primi studi basta bonifico + fattura elettronica. Le piattaforme "merchant of record" (Paddle, Lemon Squeezy/Stripe) gestiscono IVA estera e licenze, ma costano circa il 5% + 50 centesimi a transazione: hanno senso solo vendendo a molti clienti anche fuori dall'Italia.

## 4. Roadmap

**Fase 0 — questa settimana: provare e mettere in sicurezza**
1. Test dell'installer a casa (installazione, attivazione, questionario, aggiornamento).
2. P0 #1 (CORS + Host), #6 (backup della chiave privata).
3. Decidere il nome definitivo e controllare i conflitti.

**Fase 1 — 2 settimane: pilota con il tuo amico**
1. Installazione sul suo PC con licenza vera, raccolta feedback.
2. P0 #2 (chiave nell'app) e #3 (manifesto firmato).
3. Script di rilascio, `CHANGELOG`, `COSTRUIRE.md`, pulsante "Esporta diagnostica".

**Fase 2 — 1-2 settimane: sito (gratis)**
1. Pagine: home (promessa in una riga), funzioni con schermate, "I tuoi dati restano nel tuo studio", prezzi e licenza, guide (riuso delle guide già scritte), contatti, privacy e termini.
2. Hosting su Cloudflare Pages; statistiche senza cookie, così niente banner. Dominio proprio quando decidi il nome.
3. Aggiornamenti spostati sul sito e repository reso privato.

**Fase 3 — 1-2 mesi: 3-5 studi pilota**
1. Prezzo, contratto di licenza (EULA), informativa, condizioni di assistenza (da far rivedere a un legale).
2. Regola dei "tre studi": tieni solo le funzioni che userebbero almeno tre studi.
3. Misure d'uso reale, anche manuali.

**Fase 4 — vendita**
1. Firma dell'installer (a pagamento, da valutare) per togliere l'avviso "PC protetto".
2. Aggiornamento di Electron, limite ai tentativi di password, test automatici su ogni commit.
3. Pagamenti online solo se i volumi lo giustificano.

## 5. Questioni da chiarire (non tecniche)

- **Attività e fisco:** vendere licenze richiede un'attività con partita IVA. Vedi §6: prima la compatibilità con l'albo (se iscritto) e con il tuo contratto; poi regime fiscale e ATECO.
- **Proprietà e rapporto con la Tavola/Federico:** chi è titolare di cosa, soprattutto se Prisma nasce con dati, esperienza o strumenti dello studio. Meglio metterlo per iscritto prima di vendere.
- **IA e privacy:** se uno studio collega Claude a Prisma, i dati passano da un fornitore terzo: serve una nota chiara per i clienti.

## 6. Codice ATECO e compatibilità con la professione

**Codice.** Prisma è un software "a pacchetto" venduto in licenza a più studi: nella classificazione ATECO 2007 corrisponde all'**edizione di altri software, 58.29**. La produzione di software *su commissione* per un singolo cliente è invece 62.01. Dal 2025 è in vigore la nuova ATECO 2025: il sottocodice esatto va verificato sullo strumento ISTAT/Camera di Commercio prima di aprire la posizione.

**Compatibilità con il codice deontologico: non è un dettaglio, va chiarita prima di aprire la partita IVA.**
- L'**art. 4, comma 1, lett. c) del D.Lgs. 139/2005** dichiara incompatibile l'esercizio della professione di dottore commercialista ed esperto contabile con l'esercizio, *anche non prevalente né abituale*, dell'attività di impresa "di produzione di beni o servizi" svolta in nome proprio o altrui e per proprio conto.
- Sviluppare e vendere licenze software con partita IVA rientra, con ogni probabilità, in quella definizione. Per la giurisprudenza e i pareri del CNDCEC conta l'attività effettivamente svolta, non l'intestazione formale.
- **Se sei iscritto all'albo** (anche nella sezione degli esperti contabili), il rischio è reale: andrebbe chiesto un parere scritto all'Ordine (ODCEC) **prima** di aprire l'attività.
- **Se non sei iscritto** e lavori nello studio come dipendente o collaboratore, la norma dell'albo non ti riguarda; contano invece il tuo contratto (esclusiva, non concorrenza) e quanto detto sopra sulla proprietà del lavoro.
- Non sono in grado di stabilire quale sia il tuo caso né di dare un parere: ti segnalo il punto e le fonti. Se serve, il modo pulito di procedere è chiedere il parere all'Ordine e, a seconda della risposta, valutare con un legale la struttura giusta. Eviterei soluzioni di intestazione "di comodo": la norma guarda alla sostanza.

Fonti: [Fiscal Focus: situazioni di incompatibilità dei commercialisti](https://www.fiscal-focus.it/quotidiano/altre-tematiche/infoprofessioni/commercialisti-situazioni-di-incompatibilita,3,162591), [D.Lgs. 139/2005 (testo)](https://www.unitn.it/sites/default/files/2025-01/Dlsg_139_2005.pdf), [ATECO 2025: novità](https://www.partitaiva.it/codice-ateco-2025-nuova-classificazione/).

## Fonti

- [GitHub Pages: limiti e uso consentito](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Cloudflare Pages: limiti del piano gratuito](https://developers.cloudflare.com/pages/platform/limits/)
- [Netlify: piano gratuito a crediti, 2026](https://netli.fyi/blog/netlify-free-plan-limits-2026)
- [Merchant of record in 2026: Stripe, Paddle, Lemon Squeezy](https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/)
