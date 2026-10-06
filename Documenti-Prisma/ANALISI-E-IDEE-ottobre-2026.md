# Prisma – analisi a freddo e idee (ottobre 2026)

Principio guida: Prisma è un software di **supporto al lavoro e all'organizzazione**, non un gestionale contabile né un sostituto del giudizio professionale. Quello che segue è ordinato per rapporto valore/fatica, non per fascinazione tecnica.

Nota sulle fonti: normativa e prassi citate qui sotto vengono da ricerche web fatte oggi (elenco in fondo). Dove un dato fiscale/normativo non l'ho potuto confermare da una fonte, è marcato **[da verificare]**: non va usato nei modelli o nelle scadenze senza un controllo tuo.

---

## 1. Cosa dice il Codice deontologico (2024, modificato nel 2025) e cosa implica per un software di studio

Fonte principale: Codice in vigore dal 1° aprile 2024; modifiche sull'IA applicate dal 21 novembre 2025.

1. **Uso dell'IA (novità 2025).** L'IA è ammessa come supporto (analisi di dati, attività ripetitive, ricerche) ma non può svolgere il nucleo valutativo dell'incarico (interpretazione norme, pareri, scelte strategiche, valutazioni di rischio). Il professionista deve verificare fonti e dati, garantire sicurezza e protezione dei dati, e **dichiarare al cliente l'uso dell'IA**, con indicazione dei sistemi impiegati. La responsabilità resta sua. → Prisma ha già l'MCP con registro e approvazione delle azioni di Claude: manca il pezzo "dichiarazione al cliente" e un registro leggibile per lo studio.
2. **Preventivo scritto/digitale** con complessità dell'incarico, oneri presumibili, compenso, spese e contributi. → Coperto dai modelli (preventivo strutturato).
3. **Estremi della polizza RC** da comunicare al cliente. → Coperto (campo in Impostazioni + segnaposto).
4. **Equo compenso e "clienti forti"**: banche, assicurazioni, imprese con più di 50 dipendenti o più di 10 milioni di ricavi nell'anno precedente. Pattuizioni non eque sono nulle. → Prisma non lo segnala.
5. **Conflitto di interessi e indipendenza**, anche solo apparente (parametro IESBA). Obbligo di astensione/rinuncia. → Non c'è un controllo all'accettazione dell'incarico.
6. **Rinuncia all'incarico per iscritto e in tempo utile**. → Non c'è una procedura/modello.
7. **Riservatezza e vigilanza su dipendenti, collaboratori, praticanti.** → Non c'è un registro degli impegni di riservatezza.
8. **Informare il cliente su diritti e doveri reciproci e sull'esistenza del Codice deontologico.** → Va inserito nelle lettere di incarico (oggi non c'è).
9. **Rifiuto di incarichi strumentali a operazioni illecite** (collega con antiriciclaggio). → In parte coperto dal fascicolo AML.
10. **Formazione professionale continua**: 90 crediti nel triennio, di cui almeno 9 in materie obbligatorie (ordinamento, deontologia, organizzazione dello studio, antiriciclaggio, mediazione). Fonte: leggioggi.it, **[da verificare sul regolamento CNDCEC vigente: ho trovato anche notizia dell'abolizione dei 20 crediti annui nel 2023]**. → Non c'è un tracker.

## 2. Come lavorano gli altri (software concorrenti/affini)

**TeamSystem Studio Manager** (leader italiano): gestione mandati e clienti, antiriciclaggio per ogni mandato, **timesheet sincronizzati con le agende**, pianificazione risorse, note spese, **fatturazione automatica a forfait/consuntivo/mista**, dashboard di controllo. Prisma copre mandati, clienti, AML, incassi; non fa timesheet (scelta tua, giusta: vedi sotto) né fatturazione.

**TaxDome / Canopy / Karbon** (area anglosassone): CRM + workflow con template di task, portale cliente con messaggistica e documenti, firma elettronica, pagamenti, **organizer di raccolta documenti** per cliente, reportistica sul carico di lavoro. Prisma ha già CRM/portale/messaggi; mancano **firma elettronica** e **workflow ricorrenti per tipo di cliente** (in parte coperti da catalogo adempimenti + procedure interne).

**Fathom / Spotlight Reporting / Pulse** (forecast e budget per PMI): forecast a tre vie (CE, SP, cassa), **budget vs consuntivo**, scenari, dashboard KPI da presentare al cliente. Prisma ha KPI e indici da bilancio ma **non ha budget né previsione di cassa**: è il buco più grande sul lato "consulenza".

Lezione ricorrente: i software vincono sulla **riduzione dei doppi inserimenti**, non sul numero di funzioni. Per Prisma vuol dire: non aggiungere moduli che chiedono lavoro manuale quotidiano (lo hai già verificato con i tempi).

## 3. Un anno fiscale in studio – dove Prisma aiuta e dove manca

Lo scorrere dell'anno (semplificato; le date esatte vanno sempre controllate sul calendario del momento):

- **Gennaio–febbraio**: chiusure contabili dell'anno prima, invio dati Tessera sanitaria, CU, liquidazioni IVA. *Pain*: raccolta documenti dai clienti, rinnovo/adeguamento dei compensi per l'anno. *Prisma*: scadenze, comunicazioni ricorrenti. *Manca*: rinnovo annuale mandati + adeguamento compensi come flusso.
- **Marzo–aprile**: LIPE, dichiarazione IVA annuale, approvazione bilanci. *Pain*: picco di lavoro su poche persone. *Manca*: **vista del carico di lavoro per persona e per mese** (derivabile dalle scadenze, senza timesheet).
- **Maggio–giugno**: deposito bilanci, saldo/acconti imposte, 730. *Pain*: F24 e promemoria ai clienti. *Prisma*: F24, ritenute, incassi, solleciti.
- **Luglio–agosto**: proroghe, ferie. *Pain*: chi copre chi; scadenze spostate da decreti. *Manca*: **spostamento massivo di scadenze** per proroga/decreto e **pianificazione ferie/sostituzioni**.
- **Settembre–novembre**: adesione al concordato preventivo biennale (nel 2025 il termine era il 30 settembre; per il 2026 **[da verificare]**), 730, acconti, LIPE. *Manca*: **tracker CPB per cliente** (proposta ricevuta / valutata / aderito / non aderito, con nota) – solo tracciamento, non calcolo.
- **Dicembre**: acconto IVA, chiusura anno, verifica periodica antiriciclaggio, budget del cliente per l'anno nuovo. *Manca*: **budget e previsione di cassa**; **revisione periodica AML** con promemoria sul profilo di rischio (c'è la data revisione nel fascicolo: va collegata a una scadenza automatica **[da verificare se già è così]**).

Trasversale: **crisi d'impresa e adeguati assetti (art. 2086 c.c.)**. Il CNDCEC ha pubblicato nel 2023 check-list operative per valutare gli assetti organizzativi, amministrativi e contabili; la riforma sposta il lavoro dal consuntivo alla **previsione** per intercettare in anticipo i segnali di crisi. Per un commercialista è sia un obbligo di vigilanza sia un'opportunità di servizio a pagamento.

## 4. Idee, in ordine di priorità

### A. Compliance dello studio (alto valore, basso rischio, coerente con "supporto all'organizzazione")
1. **Registro uso IA + dichiarazione al cliente.** Esporta in un registro leggibile le azioni di Claude già tracciate (chi, quando, su quale cliente, quale strumento) e aggiunge una clausola standard sull'uso dell'IA nelle lettere di incarico. Colma un obbligo nuovo e rende "vendibile" l'MCP.
2. **Check-list di accettazione incarico**: verifica indipendenza/conflitti, compatibilità con la legge, rischio di operazioni illecite, informativa su diritti/doveri e Codice, polizza comunicata, preventivo con complessità. Con **flag "cliente forte / equo compenso"** in scheda cliente (campi: dipendenti, ricavi, banca/assicurazione) e avviso quando ricorre.
3. **Rinuncia/recesso**: modello di lettera + task con termine utile, per non dimenticare di formalizzare per iscritto.
4. **Tracker FPC** per ogni collaboratore (crediti nel triennio, quota di materie obbligatorie, scadenza del triennio).
5. **Impegni di riservatezza e nomine privacy**: registro di chi ha firmato cosa (collaboratori, praticanti), con scadenze.

### B. Processo annuale
6. **Carico di lavoro per persona/mese**, calcolato dalle scadenze assegnate (pesate per tipo adempimento). Niente timesheet: risponde a "chi è sovraccarico in marzo?".
7. **Proroghe e decreti**: spostamento massivo di una scadenza per tutti i clienti interessati, con tracciamento di cosa è stato cambiato e comunicazione ai clienti.
8. **Rinnovo annuale mandati e adeguamento compensi**, con flusso: promemoria → bozza lettera → nuovo preventivo.
9. **Compensi ricorrenti**: l'incasso periodico (mensile/trimestrale) che si genera da solo da un accordo, così la dashboard Incassi ha anche il fatturato ricorrente atteso.
10. **Tracker CPB** (solo stato per cliente + promemoria alla scadenza di adesione).

### C. Consulenza al cliente (differenziante)
11. **Budget e previsione di cassa a 12 mesi** per cliente: input mensile semplice (ricavi, costi fissi/variabili, imposte note), confronto **budget vs consuntivo** con i dati dei bilanci già presenti, scenario base/prudente. Output nel portale cliente come grafico + spiegazione in parole semplici (come già fatto per gli indici).
12. **Check-list adeguati assetti / pre-allerta** (basata sulle check-list CNDCEC) con semaforo per cliente società: collega gli indici già calcolati (DSCR, liquidità, indebitamento) a un "stato di salute" con note di intervento. Include promemoria periodico.
13. **Report mensile al cliente "cosa abbiamo fatto e cosa scade"**, generato da dati già presenti e pubblicato nel portale.

### D. Operativo e usabilità
14. **Scadenze "non fiscali" del cliente**: firma digitale, PEC, certificati, polizze, DURC, contratti di locazione. È un dolore reale e semplice da coprire.
15. **Ricerca globale** (clienti, documenti, comunicazioni, procedure) con scorciatoia da tastiera.
16. **Firma elettronica** dei preventivi/mandati: dipende da un fornitore esterno, quindi è una decisione di scelta (costi, validità) prima che di sviluppo. Da valutare a parte.

### Cosa NON fare
- **Timesheet manuali** (lo hai già escluso: giusto).
- **Un modulo di contabilità** (esistono gestionali maturi e il tuo stesso vincolo di progetto è il supporto organizzativo).
- **Dare all'IA il giudizio** (interpretazione norme, pareri): oltre al limite deontologico, è il punto su cui si rischia di più. L'MCP resta operativo/organizzativo.

## 5. Cose a cui tenere occhio (rischi concreti emersi dall'analisi)

1. **Chiave di cifratura password non nel backup.** Le credenziali dello studio sono cifrate (AES-256-GCM) con un file `credenziali.key` accanto ai dati, ma l'elenco dei file di configurazione copiati dal backup non lo include. Se si ripristina su un PC nuovo, **le password cifrate non si decifrano più**. Va deciso come gestire la chiave (compromesso: nel backup locale sì, nella copia esterna/cloud no, oppure derivarla da una password-maestra). *Priorità alta: va sistemato prima di vendere il software ad altri studi.*
2. **Disaster recovery provato**: il ripristino è stato testato solo in sandbox; fai una prova su un secondo PC.
3. **Privacy (GDPR) per studi che comprano Prisma**: lo studio è titolare; Prisma è software in locale, ma serve una breve **scheda "misure di sicurezza"** (backup, accessi, cifratura, log) e un testo per l'informativa ai clienti. Il portale esposto via ngrok è il punto più delicato.
4. **Sicurezza del portale cliente**: link con token + password opzionale; valutare scadenza dei link e blocco tentativi.
5. **Aggiornamenti automatici**: controllo sha256 già in piedi; manca la **firma** del manifesto (oggi chi controlla il repository controlla gli aggiornamenti): da pensare prima di distribuire a più studi.
6. **Date fiscali nel catalogo adempimenti**: vanno riviste ogni anno (decreti, proroghe). Suggerito un task annuale "Revisione catalogo scadenze" con data fissa a novembre.

## 6. Proposta di ordine di lavoro

1. Sistemare la **chiave credenziali nel backup** (rischio reale, piccolo intervento).
2. **Registro IA + clausola IA nei mandati** + **check-list accettazione incarico** (con flag equo compenso). Insieme sono la "suite deontologia".
3. **Carico di lavoro per persona/mese** + **proroghe massive**.
4. **Budget e previsione di cassa** + **adeguati assetti**, come modulo consulenza attivabile.
5. Scadenze non fiscali, CPB tracker, ricerca globale.

---

## Fonti consultate
- Codice deontologico dei commercialisti 2024 e novità 2025 sull'IA – fiscal-focus.it (articolo del 5 dicembre 2025) e commercialisti.brescia.it (testo 2024)
- Lettera di incarico e preventivo: studiocataldi.it, ecnews.it, eutekne.info (facsimile ODCEC/CNDCEC), mandatoprofessionale.it
- Software di settore: teamsystem.com (TeamSystem Studio Manager), taxdome.com, getcanopy.com, karbonhq.com
- Budget e forecast: fathomhq.com, spotlight reporting (confronti su g2/trustradius)
- Formazione continua e equo compenso: leggioggi.it, fiscal-focus.it, quotidianopiu.it
- Adeguati assetti e crisi d'impresa: fiscal-focus.it, fiscoetasse.com, ecnews.it (documenti CNDCEC/FNC 2023)
- Calendario scadenze: informazionefiscale.it, optlyx.com, tuttocalcolato.it
