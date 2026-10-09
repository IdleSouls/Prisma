# Prisma — audit critico (9 ottobre 2026)

Fatto leggendo il codice (`gestionale.htm`, `server.js`, modelli documento), rilanciando i test e cercando qualche riscontro online. Dove non ho una prova lo scrivo. Non sono un avvocato né un revisore di sicurezza: le parti legali vanno fatte vedere a un professionista prima di vendere.

Verdetto in una riga: **come cruscotto scadenze e fasi per il tuo studio è solido; come prodotto da 50 €/mese per studi altrui oggi non lo è ancora**, per quattro motivi concreti: contratti con dati del tuo studio incisi dentro, dati che si sovrascrivono tra colleghi, rete senza login, e valore che dipende da un inserimento dati che nessuno vuole fare due volte.

---

## 1. Il critico di prodotto

**Scopo.** Il documento di posizionamento è chiaro («cosa va fatto, da chi, entro quando, a che punto siamo»). Il codice no: 36 voci di menu, ~64 strumenti MCP, chat, convertitore PDF, bilanci e KPI, libri sociali, CPB, portale cliente, push, ngrok. Ogni funzione ha una giustificazione, ma l'insieme è una suite che nessun collaboratore padroneggia. Il test che ti sei dato («aiuta a non dimenticare, coordinarsi, vedere lo stato?») viene superato dal 40% del menu.

**Cosa contesterei funzione per funzione**

| Funzione | Obiezione | Verdetto |
|---|---|---|
| Scadenze + adempimenti a fasi + responsabili | È il motivo per cui qualcuno paga. Ma solo se i dati cliente sono completi: oggi l'import lascia i campi vuoti e le scadenze non nascono (l'alert c'è, ma è lavoro per lo studio) | **Nucleo. Investire.** |
| Il mio lavoro / Cruscotto titolare | Utili solo se i collaboratori spuntano davvero le fasi. Ogni fase è un click in più rispetto a Excel | Nucleo, ma misurare l'uso |
| Preventivi → mandato → onboarding | Buona idea, ma i modelli sono il punto debole (§4) | Tenere, riscrivere i testi |
| Incassi, da fatturare, solleciti | Duplicano il gestionale/fatturazione dello studio. Se non sono aggiornati mentono | Solo come promemoria, mai come "verità" |
| Portale cliente + push + ngrok | È la parte più rischiosa: dati di clienti verso internet da un PC di studio con un tunnel gratuito | Opzionale, spento di default, con avvertenze |
| Chat interna | Lo studio ha già WhatsApp/Teams | Potare |
| Strumenti file (convertitore, unisci PDF) | Fuori scopo | Potare |
| Bilanci & KPI | Consulenza al cliente, lontano dal nucleo | Modulo facoltativo |
| Libri sociali, CPB, FPC, registro IA | Differenziante, ma norme che cambiano: ogni soglia codificata invecchia | Tenere solo se configurabile e datata |
| MCP / Claude | Bello da vedere, utile a pochi. Richiede che lo studio sappia cos'è | Marketing, non motivo d'acquisto |

**Il problema vero: il doppio inserimento.** Prisma non parla con TeamSystem, Zucchetti, Passepartout. Lo studio deve mantenere clienti, regimi, periodicità in due posti. Nel tuo caso hai appena importato 156 clienti da "la tavola" con 100+ campi da completare a mano. Un titolare che compra Prisma deve fare la stessa fatica, e la fa solo se ha già deciso di abbandonare il vecchio foglio. Il vero concorrente non è Scadero: è Excel + calendario, che costa zero e che tutti già usano.

---

## 2. Il fiscalista

Ho controllato il catalogo scadenze in `DEFAULT_CATALOGO_PERIODICO` e annuale. Il grosso è corretto (IVA 16/20 agosto, INPS minimali, Enasarco, OSS, acconto IVA 27/12, bollo FE, LIPE II trimestre al 30/9: verificato, dal 2022 non è più il 16/9, **avevo sbagliato io a ricordarlo** e per fortuna ho controllato).

**Errori e buchi trovati**

1. **LIPE IV trimestre assente.** Il catalogo ha solo I, II, III. Il IV scade a fine febbraio (a meno di inviarlo con la dichiarazione IVA annuale). Se un cliente trimestrale non ha dichiarazione anticipata, la scadenza non compare.
2. **Saldo IVA annuale (16 marzo) assente.** Per i trimestrali il IV trimestre si versa lì; per i mensili esiste solo la liquidazione di dicembre (16 gennaio). Nessuna voce "saldo IVA + maggiorazione 1% mensile fino al 30/6".
3. **Festività infrasettimanali non gestite.** `spostaSeFestivo` sposta solo sabato e domenica (il commento lo dichiara). Casi reali: **Intrastat trimestrale e mensile il 25 aprile** (festa) quando cade in giorno feriale, 1° maggio, 2 giugno, 8 dicembre, Natale e Santo Stefano, Pasquetta. Poche volte l'anno, ma è una scadenza sbagliata presentata come esatta, e il tuo software vive di fiducia nella data.
4. **Nessun controllo di coerenza tra tipo e regime.** Con l'import vuoto lasciato di proposito, un cliente "ditta individuale + Ordinario + nessuna periodicità IVA" è accettato senza avvisi di incoerenza (solo "dato mancante").
5. **Voci annuali con data fissa che in realtà variano:** Redditi/770 al 31/10 sono giusti per il 2026 ma cambiano con proroghe; il sistema ha le proroghe, ma **nessuna fonte che le aggiorni**. Ogni anno qualcuno (tu) deve rifare il catalogo per tutti i clienti. A 50 €/mese, chi aggiorna le norme per gli altri studi? Qui sta uno dei costi nascosti del prodotto.
6. **Mancano adempimenti che uno studio gestisce davvero:** ISA e CPB (adesione), dichiarazione IMU/IMU ENC, 730 (se lo studio lo fa), deposito bilancio con termine 30 giorni dall'approvazione, esterometro/ricezione estere, comunicazione titolare effettivo, versamenti rateizzati dal cliente (rottamazione/cartelle). Il catalogo è modificabile dall'utente, ma un catalogo vuoto di default non vende.
7. **Ritenute:** la logica del cumulo sotto 100 € e di dicembre è corretta e rara tra i concorrenti. Da tenere.
8. **770 per forfettari/persone fisiche:** la regola "tutte le società + semplificati/ordinari" è giusta; resta da gestire il sostituto d'imposta con ritenute versate nell'anno (una persona fisica professionista con collaboratori può essere sostituto). Oggi è un caso da inserire a mano.

**Cosa non ho verificato:** gli importi e le soglie legate a norme in vigore oggi (ritenute, bollo, soglie CPB). Vanno controllati da te o dal collega che usa il programma, non da me.

---

## 3. L'esperto di flussi di lavoro

- **Un solo documento condiviso, "ultimo vince".** Il codice lo dichiara (`salvaStato`, commento sul sync): lo stato intero viene riscritto a ogni modifica. Quando Sabrina e tu spuntate due fasi nello stesso intervallo di salvataggio, **una delle due modifiche può sparire senza avviso**. È esattamente il test che hai fatto sul 770. Per uno scadenzario, perdere "ho inviato" è peggio che non averlo: crea falsa sicurezza. Questo è, secondo me, il rischio tecnico n. 1 per un prodotto multi-utente. Soluzione: salvare per singolo oggetto (patch con versione) invece dell'intero STATE.
- **Test instabile non risolto:** «stato perso dopo cambio anno avanti e indietro» è fallito due volte su tre. Può essere solo timing del test, ma dato il punto sopra non lo considero rumore finché non lo spiego.
- **Flusso "fatto da".** Funziona, ma dipende dal fatto che ognuno scelga il proprio nome in alto a destra. Su un PC condiviso o senza login vero, il "chi" è dichiarato, non verificato. Per un audit interno va bene; per una responsabilità professionale no.
- **Onboarding del cliente nuovo:** 5 passi (anagrafica, documenti, AML, deleghe, mandato). Buon flusso. Manca il ritorno: quando il mandato è firmato e l'adeguata verifica completata, nulla blocca l'attivazione del cliente nel calendario. Un cliente può avere scadenze senza mandato.
- **Troppe notifiche potenziali, nessuna priorità.** Push, appuntamenti, task, scadenze, solleciti, comunicazioni ricorrenti. Senza una sola lista «oggi, in ordine di danno», tutto diventa rumore dopo due settimane.

---

## 4. L'avvocato per mandati e preventivi

Premessa: sono osservazioni da giurista che legge, non un parere. Prima di vendere ad altri studi falli rivedere da un legale.

**Il difetto più grave.** I modelli **«standard»**, quelli che ogni nuovo studio riceve al primo avvio (`modelliDocumentoDefault`), contengono testi scritti sul tuo studio:

- «Il professionista opera in regime forfettario ex L. 190/2014: non è applicata IVA»
- «contributo previdenziale del 4% dovuto alla Cassa Nazionale di Previdenza e Assistenza dei Ragionieri e Periti Commerciali (CNPR)»

Per uno studio con IVA ordinaria, in forma associata/STP o iscritto a un'altra cassa (dottori commercialisti = CNPADC) questi enunciati sono **falsi in un contratto**. Se un cliente firma e lo studio fattura IVA al 22%, nasce una contestazione sul compenso. I modelli «strutturati» (`modelliBaseStrutturati`) usano invece `{{regimeIva}}` e sono migliori: vanno resi gli unici di partenza.

**Altre criticità nei modelli standard**

1. **Polizza RC "disponibile su richiesta".** L'art. 5, co. 1, lett. e) DPR 137/2012 impone di rendere noti al cliente gli estremi della polizza e il massimale al momento dell'assunzione dell'incarico, non solo a richiesta. I modelli strutturati con `{{studio.polizza}}` sono giusti; gli standard no. Tra l'altro l'app ha già la voce di checklist deontologica «comunicata la polizza» che il suo stesso modello contraddice.
2. **Limitazione di responsabilità a «dolo o colpa grave» (art. 5 mandato).** Per clienti persone fisiche consumatori è presumibilmente vessatoria (artt. 33-36 Codice del consumo): la doppia firma ex artt. 1341-1342 c.c. non salva i contratti con consumatori. L'art. 2236 c.c. (colpa grave) vale per prestazioni di speciale difficoltà, non è una clausola generale. Rischio: clausola nulla che dà al cliente un'arma in giudizio.
3. **Art. 1456 c.c. citato per il «recesso».** La clausola risolutiva espressa è altra cosa dal recesso per giusta causa. Il testo («ritardo superiore a 30 giorni costituisce giusta causa di recesso ai sensi dell'art. 1456») mescola istituti e va riformulato.
4. **Recesso con effetto immediato del professionista per "venir meno del rapporto fiduciario".** L'art. 2237 c.c. richiede che il professionista receda in modo da evitare pregiudizio al cliente. Con una scadenza fiscale pendente, il recesso immediato può diventare responsabilità. Manca la regola su **chi presidia le scadenze in corso dopo il recesso** (nel modello di lettera di cessazione c'è, nel mandato no).
5. **Durata: «termine fisso, senza tacito rinnovo, fino al completamento delle attività».** Per un incarico continuativo di tenuta contabilità e dichiarativi è ambiguo: dopo il primo anno il mandato è scaduto? Se sì lo studio non ha incarico per le scadenze dell'anno dopo, ma il cliente si aspetta che le faccia. Serve una durata annuale con rinnovo espresso o a tempo indeterminato con preavviso.
6. **Foro esclusivo e mediazione.** Con un consumatore il foro esclusivo dello studio non regge (foro del consumatore). Per i contratti d'opera la mediazione può essere condizione di procedibilità dopo la riforma 2022: da verificare, ma oggi il testo la tratta come libera scelta.
7. **Interessi «D.Lgs. 231/2002».** Valgono tra imprese/professionisti. Con un consumatore si applicano gli interessi legali. Il testo non distingue.
8. **Preventivo con clausole ma una sola firma.** Il preventivo standard elenca le clausole da approvare ex 1341-1342 (c, d, f, g) ma **ha una sola firma**. Senza sottoscrizione specifica quelle clausole sono inefficaci. Nel mandato la doppia firma c'è; nel preventivo no.
9. **Il preventivo standard manca di «grado di complessità» e «oneri ipotizzabili»** richiesti dall'art. 9 co. 4 DL 1/2012 (il modello strutturato li ha).
10. **Equo compenso (L. 49/2023).** C'è la spunta "cliente forte" nella checklist, ma i modelli non hanno clausole adattate (pagamento a 60 giorni, niente rinuncia a rimborso spese, ecc.). Se lo studio ha clienti banche/assicurazioni/grandi imprese, i modelli standard sono sospetti.
11. **Privacy.** Una riga sul GDPR non è l'informativa dell'art. 13. Nel modello strutturato c'è un rimando; manca un allegato di informativa e un registro dei consensi (marketing, portale, IA). Se lo studio usa Claude su dati dei clienti, serve una base e un'informativa per questo.
12. **Prisma stesso come fornitore:** se fai assistenza con accesso ai dati, sei responsabile del trattamento (art. 28 GDPR) e serve un contratto. Il tuo documento «vendere ad altri studi» tocca il tema ma il contratto di licenza/assistenza non c'è: **limitazione di responsabilità per le scadenze sbagliate** è la prima cosa che un legale ti chiederebbe.

**Tutela tua.** Se il software mostra una scadenza sbagliata e lo studio paga la sanzione, chi risponde? Serve nel contratto: «il software è uno strumento di supporto, la verifica delle scadenze resta del professionista», massimale di responsabilità, esclusione dei danni indiretti. Senza, 50 €/mese non coprono nemmeno una sanzione.

---

## 5. Sicurezza e qualità del codice

| # | Problema | Gravità | Nota |
|---|---|---|---|
| 1 | **`/api/stato` (GET e POST) senza autenticazione su `0.0.0.0:8420`.** Chiunque sia sulla rete dello studio (Wi-Fi ospiti, un PC infetto, il portatile di un cliente) può leggere **tutti** i clienti e **riscrivere l'intero archivio** con una sola richiesta | Alta | I ruoli master/admin/limitato filtrano solo l'interfaccia. In un GDPR audit è un art. 32 evidente. Soluzione minima: token di sessione dopo login per le API, bind su 127.0.0.1 per chi usa un solo PC |
| 2 | Ultimo-vince sull'intero stato (§3) | Alta | Perdita silenziosa di lavoro |
| 3 | File JSON unico fino a 50 MB riscritto a ogni modifica | Media | Con 150+ clienti e documenti inline è già grande; lento e fragile in caso di crash |
| 4 | Test: `jsdom-test.js` esce con codice 1 anche se tutti i test passano (errori di rete jsdom). Quindi **non può girare in CI** | Media | Filtrare gli errori noti |
| 5 | `gestionale.htm` ~20.000 righe, funzioni esportate su `window` per i test | Media | Ingestibile da un secondo sviluppatore. Bus factor = 1 |
| 6 | Nessuno `schemaVersion` | Media | Le migrazioni sono funzioni sparse |
| 7 | Licenza legata a nome PC/scheda di rete | Media | Un cambio PC blocca lo studio il giorno della scadenza IVA. Serve un cambio-macchina in autoassistenza |
| 8 | Electron 33 | Media | Da aggiornare prima di vendere |
| 9 | Tunnel ngrok gratuito per portale | Media | Dati clienti su dominio di terzi; piano gratuito instabile |

Cosa è buono: backup prima di ogni aggiornamento, manifesto aggiornamenti firmato, CORS chiuso, blocco tentativi login, conferme multiple e registro azioni IA, dati in locale.

---

## 6. Il canone di 50 €/mese contro il valore reale

**Aritmetica.** 50 €/mese = 600 €/anno. Un'ora di lavoro dello studio vale 40-60 €: il canone si ripaga se il programma fa risparmiare **un'ora al mese a studio**, oppure evita **una sola sanzione o un ravvedimento all'anno** (la sola sanzione per omesso versamento è il 25% del dovuto; per un omesso invio di una LIPE 500 € e oltre). Detta così, 50 € non sono assurdi.

**Perché però oggi non regge**

1. **Il valore è condizionato all'adozione.** Il risparmio esiste solo se tutti i collaboratori spuntano le fasi e i dati cliente sono completi. Altrimenti il canone è un costo per un programma che mente per omissione.
2. **Concorrenti con più reputazione e integrazioni.** Scadero ha app clienti e notifiche; TeamSystem e Zucchetti sono già nello studio. Non ho trovato i listini di Scadero: la ricerca non li mostra (prezzi su richiesta), quindi **non posso dirti se 50 € sia sopra o sotto**. Chiedere un preventivo a due concorrenti costa mezz'ora ed è il dato che ti manca di più.
3. **Pagare 50 € per uno strumento che non si integra con il gestionale** è come pagare per un secondo calendario. Chi decide (il titolare) vuole sapere cosa gli evita, non cosa fa.
4. **Il rischio percepito è sbilanciato.** Il cliente affida le scadenze fiscali dei suoi clienti a un prodotto di un solo sviluppatore. Se domani non rispondi al telefono, lo studio ha un problema. Questo pesa più del prezzo.
5. **Assistenza.** Un prodotto installato in locale genera assistenza per PC, firewall, backup, aggiornamenti. 50 €/mese a 20 studi sono 1.000 €/mese: sufficienti per un'ora al giorno di tuo tempo, non per un lavoro a tempo pieno.

**Cosa farei con il prezzo**

- **Non partire da 50 € piatti.** Per i primi 3-5 studi: pilota gratuito o a 20-25 €/mese per 6 mesi, in cambio di feedback scritto e di una testimonianza. Il dato che ti serve non sono i ricavi, sono le metriche d'uso (§7).
- **Poi scaglioni:** piccolo (fino a 3 utenti, ~30-35 €), medio (4-10 utenti, ~60-80 €). Il prezzo piatto penalizza lo studio piccolo (il tuo cliente più probabile) e regala lo studio medio.
- **Annuale anticipato** con sconto, così gestisci un incasso e non dodici solleciti.
- **Non vendere "software", vendi "nessuna scadenza persa"**, con due garanzie vere: backup verificato e aggiornamento del catalogo scadenze a ogni legge di bilancio incluso nel canone. È questo che giustifica un canone ricorrente invece di una licenza una tantum.
- **Prima di tutto:** metti per iscritto nel contratto cosa copre e cosa no (responsabilità, assistenza, aggiornamenti normativi). Senza, 50 € sono troppo pochi per il rischio che ti prendi.

---

## 7. Cosa farei nell'ordine

**Prima di dare Prisma a un altro studio (bloccanti)**

1. Sostituire i modelli standard con quelli strutturati, togliere forfettario/CNPR dal testo, aggiungere cassa e regime IVA come impostazioni dello studio. Rivedere i modelli con un legale.
2. Login e token per le API del server; di default solo `127.0.0.1` per installazioni a un PC.
3. Salvataggio per oggetto (o almeno rilevamento del conflitto con avviso) al posto dell'ultimo-vince.
4. Contratto di licenza/assistenza con limiti di responsabilità e nomina a responsabile del trattamento.
5. Aggiungere LIPE IV trim, saldo IVA 16/3 e le festività nazionali alla funzione delle date.

**Entro un mese di uso reale nel tuo studio**

6. Misurare: scadenze chiuse in Prisma vs fuori, fasi spuntate per persona, accessi a settimana. Se una sezione non viene aperta, nasconderla.
7. Preset di menu a ~10 voci; nascondere di default chat, strumenti file, bilanci, rubrica.
8. Risolvere il test instabile «stato perso dopo cambio anno» o dimostrare che è solo timing.
9. Far uscire il test con codice 0 e metterlo in CI.

**Prima di fissare il prezzo**

10. Chiedere il preventivo a Scadero e a un gestionale di studio, con il tuo caso (156 clienti, 4 utenti).
11. Decidere cosa succede se tu sparisci: escrow del codice, manuale di costruzione, un secondo che sappia ricostruire l'installer.

---

## 8. Cosa non ho potuto fare

- Non ho provato Prisma su un PC Windows pulito né con più utenti reali.
- Non ho verificato i listini dei concorrenti (le pagine non mostrano prezzi).
- Non ho controllato ogni scadenza del catalogo contro le fonti ufficiali: solo LIPE (verificata online) e il resto per conoscenza.
- Le valutazioni legali sono letture di testo, non pareri.
