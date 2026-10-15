'use strict';
/* -------------------- 2) STATE -------------------- */
const LS_KEY = 'gestionaleStudioState_v1';

function clonaCatalogoDefault() {
  return {
    catalogoPeriodico: JSON.parse(JSON.stringify(DEFAULT_CATALOGO_PERIODICO)),
    catalogoAnnuale: JSON.parse(JSON.stringify(DEFAULT_CATALOGO_ANNUALE)),
  };
}

/* Quando l'app viene aggiornata con nuovi tipi di scadenza nel catalogo predefinito (es. F24
   Paghe, Enasarco...), gli utenti che hanno già uno stato salvato in localStorage NON li
   vedrebbero: lo stato salvato sovrascrive per intero catalogoPeriodico/catalogoAnnuale, quindi
   un catalogo "vecchio" resterebbe bloccato senza le voci aggiunte dopo il salvataggio. Questa
   funzione aggiunge in coda solo i tipi di default mancanti (per id/chiave), senza toccare le
   personalizzazioni già fatte dall'utente (rinomina, disattivazione, tipi custom, occorrenze
   modificate) sui tipi che già esistono. Va chiamata ad ogni caricamento di uno stato salvato. */
function sincronizzaCatalogoConDefault(stato) {
  if (!Array.isArray(stato.catalogoPeriodico)) stato.catalogoPeriodico = [];
  const idPresenti = new Set(stato.catalogoPeriodico.map(t => t.id));
  DEFAULT_CATALOGO_PERIODICO.forEach(def => {
    if (!idPresenti.has(def.id)) stato.catalogoPeriodico.push(JSON.parse(JSON.stringify(def)));
  });
  // Cataloghi salvati prima delle "fasi" e del flag "importo": si completano dai predefiniti (per i
  // tipi standard) o con valori neutri (tipi personalizzati), senza toccare ciò che l'utente ha già scelto.
  stato.catalogoPeriodico.forEach(t => {
    const seed = DEFAULT_CATALOGO_PERIODICO.find(d => d.id === t.id);
    if (!Array.isArray(t.fasi) || !t.fasi.length) t.fasi = (seed && seed.fasi) ? seed.fasi.slice() : FASI_DEFAULT_CUSTOM.slice();
    if (t.conImporto === undefined) t.conImporto = seed && seed.conImporto !== undefined ? seed.conImporto : true;
  });
  if (!Array.isArray(stato.catalogoAnnuale)) stato.catalogoAnnuale = [];
  const chiaviPresenti = new Set(stato.catalogoAnnuale.map(t => t.chiave));
  DEFAULT_CATALOGO_ANNUALE.forEach(def => {
    if (!chiaviPresenti.has(def.chiave)) stato.catalogoAnnuale.push(JSON.parse(JSON.stringify(def)));
  });
  // cataloghi salvati prima che questi adempimenti avessero una scadenza: la ricevono dal predefinito
  stato.catalogoAnnuale.forEach(t => {
    const seed = DEFAULT_CATALOGO_ANNUALE.find(d => d.chiave === t.chiave);
    if (!t.scadenzaDefault && seed && seed.scadenzaDefault) t.scadenzaDefault = Object.assign({}, seed.scadenzaDefault);
  });
  return stato;
}

/* Modelli di partenza (task #127), genericizzati dai documenti reali che Matteo usa nel suo
   studio (preventivo, mandato professionale, dichiarazione antiriciclaggio, nota di accettazione
   per clienti a rischio significativo) — un punto di partenza pronto da modificare in "Modelli
   documenti", non testo definitivo. Generati una sola volta: se l'utente ha già uno stato salvato
   (anche vuoto ma con la chiave modelliDocumento presente), normalizzaStatoCaricato/Object.assign
   preserva SEMPRE quello salvato — questi valgono solo per il primissimo avvio. */
/* Procedure interne di partenza (task #146): esempi realistici genericizzati, pensati come punto
   di partenza da modificare in "Procedure interne" — non testo definitivo. Stesso meccanismo dei
   modelli documento: generate una sola volta, un utente con stato già salvato mantiene sempre il
   proprio (vedi normalizzaStatoCaricato/Object.assign in statoIniziale). Il campo "motivoAppuntamento"
   collega la procedura a uno o più motivi dell'elenco MOTIVI_APPUNTAMENTO (task #147, "Prenota un
   appuntamento"): quando la segreteria prenota un appuntamento per quel motivo, la procedura
   corrispondente viene suggerita al consulente. */
function procedureInterneDefault() {
  const mk = (categoria, nome, contenuto, checklistDocumenti, motiviAppuntamento) => ({
    id: uid('proc'), categoria, nome, contenuto, checklistDocumenti: checklistDocumenti || [],
    motiviAppuntamento: motiviAppuntamento || [], attivo: true, creatoIl: oggiISO(),
  });
  return [
    mk('Apertura attività', 'Apertura Partita IVA - Ditta individuale',
`1. Colloquio iniziale: raccogliere attività svolta, codice ATECO presumibile, sede, eventuale regime forfettario o ordinario.
2. Verificare i requisiti per il regime forfettario (ricavi/compensi ultimo anno, cause di esclusione ex L.190/2014).
3. Compilare e trasmettere il modello AA9/12 (apertura P.IVA) tramite Entratel/Fisconline.
4. Iscrizione INPS gestione competente (artigiani/commercianti o gestione separata) entro 30 giorni.
5. Iscrizione Camera di Commercio (se richiesta dall'attività) e comunicazione unica se necessaria.
6. Valutare l'iscrizione INAIL se previsto dall'attività.
7. Consegnare al cliente: credenziali per il cassetto fiscale, calendario scadenze, informativa privacy.`,
      ['Documento d\'identità e tessera sanitaria', 'Visura camerale (se già iscritto)', 'Contratto di locazione/comodato sede attività (se presente)'],
      ['Apertura nuova attività']),
    mk('Apertura attività', 'Apertura Bar / Pubblico esercizio',
`1. Verificare i requisiti soggettivi (SCIA per somministrazione alimenti e bevande) e conformità dei locali.
2. Apertura Partita IVA con codice ATECO specifico (56.30.00 o simile) — vedi procedura "Apertura Partita IVA".
3. SCIA al Comune (Sportello Unico Attività Produttive) per somministrazione al pubblico.
4. Verifica requisiti professionali/morali del titolare (corso HACCP, eventuale corso SAB se richiesto dal Comune).
5. Iscrizione INPS commercianti e valutazione posizione INAIL per eventuali dipendenti.
6. Registratore telematico: attivazione e censimento all'Agenzia delle Entrate.
7. Licenza per pubblica sicurezza se prevista (es. musica, orari particolari).
8. Consegnare al cliente: calendario scadenze IVA/liquidazioni, promemoria corrispettivi telematici giornalieri.`,
      ['Documento d\'identità', 'SCIA/planimetria locale', 'Attestato corso HACCP', 'Contratto di locazione/affitto d\'azienda'],
      ['Apertura nuova attività']),
    mk('Consulenza società', 'Costituzione SRL',
`1. Colloquio con i soci: oggetto sociale, capitale sociale, quote, nomina amministratore/i.
2. Predisposizione bozza statuto e atto costitutivo (con il notaio incaricato).
3. Versamento capitale sociale (25% in conti correnti dedicati o intero importo per SRLS).
4. Atto notarile di costituzione, iscrizione al Registro Imprese.
5. Apertura Partita IVA e posizione INPS/INAIL amministratore (se dovuta).
6. Impostazione contabilità ordinaria e libri sociali obbligatori.
7. Consegnare ai soci: copia atto costitutivo, calendario adempimenti societari (bilancio, assemblee).`,
      ['Documenti d\'identità di tutti i soci', 'Codice fiscale soci', 'Bozza patti parasociali (se presenti)'],
      ['Consulenza per attività esistente']),
  ];
}
function modelliDocumentoDefault() {
  const mk = (categoria, nome, corpo) => ({ id: uid('mod'), categoria, nome, corpo, attivo: true, predefinito: true, creatoIl: oggiISO() });
  return [
    mk('Preventivo', 'Preventivo standard', `{{studio.nome}}
{{studio.iscrizione}}
{{studio.indirizzo}}
C.F. {{studio.cf}}

Spett.le {{cliente.ragioneSociale}}
{{cliente.indirizzo}}

{{data.luogoOggi}}

Oggetto: Proposta di consulenza professionale – {{oggetto}}

Egregio/Gentile Cliente,

con la presente formuliamo la proposta economica per le attività di seguito descritte, come concordato.

1. ATTIVITÀ OGGETTO DELL'INCARICO

{{dettaglioAttivita}}

Compenso complessivo: € {{importo}} (oltre contributo previdenziale di legge se dovuto).

2. CONDIZIONI DI PAGAMENTO

{{condizioniPagamento}}

In caso di mancato pagamento nei termini concordati matureranno interessi di mora ai sensi del D.Lgs. 231/2002 (tasso legale BCE + 8 punti percentuali). Il ritardo superiore a 30 giorni costituisce giusta causa di recesso ai sensi dell'art. 1456 c.c.

3. CONDIZIONI GENERALI

a) Regime fiscale. Il professionista opera in regime forfettario ex L. 190/2014: non è applicata IVA. I compensi si intendono al netto del contributo previdenziale del 4% dovuto alla Cassa Nazionale di Previdenza e Assistenza dei Ragionieri e Periti Commerciali (CNPR).
b) Perimetro dell'incarico. L'incarico è strettamente limitato alle attività di cui sopra e al cliente in indirizzo. Non include attività relative ad altre entità collegate o correlate, salvo diverso accordo scritto tra le parti.
c) Compensi integrativi. Qualora nel corso dello svolgimento emergano adempimenti straordinari non prevedibili alla data di sottoscrizione, il compenso integrativo sarà concordato preventivamente tra le parti in forma scritta.
d) Limitazione di responsabilità. La responsabilità del professionista è limitata ai danni direttamente imputabili a colpa grave o dolo nell'esecuzione del mandato. È in ogni caso esclusa la responsabilità per danni indiretti o consequenziali. Il professionista è coperto da polizza di assicurazione della responsabilità civile professionale; i dati della polizza sono disponibili su richiesta.
e) Obblighi del Cliente. Il Cliente si impegna a trasmettere tempestivamente tutta la documentazione necessaria e a collaborare attivamente. Il ritardo o la mancata consegna di documenti solleva il Professionista da responsabilità per la tardiva esecuzione degli adempimenti.
f) Recesso e normativa antiriciclaggio. Il Professionista si riserva di recedere dall'incarico qualora emergano circostanze che configurino gli obblighi di astensione e/o segnalazione previsti dalla normativa antiriciclaggio vigente (D.Lgs. 231/2007), ovvero qualora venga meno il rapporto fiduciario con il Cliente.
g) Foro competente. Per ogni controversia è competente in via esclusiva il Foro di {{studio.citta}}. Le parti concordano di esperire un tentativo di mediazione presso l'Organismo di Conciliazione competente prima di adire l'autorità giudiziaria.
h) Protezione dei dati personali. I dati del Cliente saranno trattati dal Professionista esclusivamente per le finalità connesse all'esecuzione del presente incarico, in conformità al Reg. UE 2016/679 (GDPR) e al D.Lgs. 231/2007.
i) Validità dell'offerta. La presente proposta ha validità di 15 giorni dalla data di emissione.

4. ACCETTAZIONE

Con la firma del presente documento il Cliente accetta integralmente le condizioni economiche e le modalità di esecuzione dell'incarico. Ai sensi e per gli effetti degli artt. 1341 e 1342 c.c., il Cliente approva specificamente le clausole: c) Compensi integrativi; d) Limitazione di responsabilità; f) Recesso; g) Foro competente.

Il Professionista						Per il Cliente
{{studio.nome}}						{{cliente.ragioneSociale}}


_______________________________			_______________________________

Luogo e data: {{studio.citta}}, ____________________`),

    mk('Mandato professionale', 'Mandato professionale standard', `{{studio.nome}}
{{studio.iscrizione}}
{{studio.indirizzo}}
C.F. {{studio.cf}}

MANDATO PROFESSIONALE
{{oggetto}}

Tra

{{studio.nome}}, {{studio.iscrizione}}, con domicilio professionale in {{studio.indirizzo}} – di seguito il "Professionista"

e

{{cliente.ragioneSociale}}, con sede/domicilio in {{cliente.indirizzo}}, C.F./P.IVA {{cliente.piva}} {{cliente.codiceFiscale}} – di seguito il "Cliente"

si stipula e si conviene quanto segue.

1. Oggetto dell'incarico
Il Cliente conferisce al Professionista, che accetta, l'incarico di svolgere le attività professionali descritte nell'allegato Preventivo, che costituisce parte integrante del presente mandato.

{{dettaglioAttivita}}

L'incarico è strettamente limitato alle attività di cui sopra e al Cliente in indirizzo.

2. Decorrenza e durata
Il presente mandato decorre dalla data di sottoscrizione e si intende conferito a termine fisso, senza tacito rinnovo, fino al completamento delle attività di cui all'art. 1. Al termine dell'incarico il Professionista restituisce al Cliente la documentazione ricevuta e non è tenuto ad alcuna ulteriore attività, salvo diverso accordo scritto tra le parti.

3. Compenso e modalità di pagamento
Il compenso per l'esecuzione del presente incarico è quello indicato nell'allegato Preventivo, al quale si fa integrale rinvio: € {{importo}}, al netto del contributo previdenziale del 4% dovuto alla Cassa Nazionale di Previdenza e Assistenza dei Ragionieri e Periti Commerciali (CNPR). Il Professionista opera in regime forfettario ex L. 190/2014: non è applicata IVA.

{{condizioniPagamento}}

In caso di mancato pagamento nei termini pattuiti matureranno interessi di mora ai sensi del D.Lgs. 231/2002 (tasso BCE + 8 punti percentuali). Il ritardo superiore a 30 giorni costituisce giusta causa di risoluzione del contratto ai sensi dell'art. 1456 c.c.

4. Obblighi del Cliente
Il Cliente si impegna a:
a) fornire tempestivamente tutta la documentazione contabile, fiscale e societaria necessaria all'esecuzione dell'incarico;
b) comunicare senza ritardo ogni variazione rilevante riguardante la propria situazione fiscale, societaria o patrimoniale;
c) collaborare attivamente con il Professionista e fornire riscontro tempestivo alle richieste di integrazione;
d) adempiere agli obblighi di cui alla normativa antiriciclaggio (D.Lgs. 231/2007), in particolare fornire le informazioni richieste ai fini dell'adeguata verifica della clientela.

Il ritardo o la mancata consegna di documenti solleva il Professionista da responsabilità per la tardiva esecuzione degli adempimenti.

5. Responsabilità del Professionista
Il Professionista esegue l'incarico con la diligenza richiesta dalla natura dell'attività professionale ex art. 2236 c.c. La responsabilità è limitata ai danni direttamente imputabili a colpa grave o dolo nell'esecuzione del mandato. Sono in ogni caso esclusi i danni indiretti o consequenziali, nonché quelli derivanti da informazioni incomplete, inesatte o tardivamente fornite dal Cliente.

Il Professionista è coperto da polizza di assicurazione della responsabilità civile professionale. I dati della polizza sono disponibili su richiesta.

6. Recesso e normativa antiriciclaggio
Ciascuna parte può recedere dal presente mandato con comunicazione scritta a mezzo PEC o raccomandata A/R, con preavviso di 15 giorni. Il Professionista ha diritto al compenso per le attività già svolte e al rimborso delle spese documentate.

Il Professionista si riserva di recedere con effetto immediato qualora:
a) emergano circostanze che configurino gli obblighi di astensione e/o segnalazione previsti dalla normativa antiriciclaggio vigente (D.Lgs. 231/2007, art. 42);
b) il Cliente non adempia agli obblighi informativi ai fini dell'adeguata verifica;
c) venga meno il rapporto fiduciario con il Cliente.

7. Protezione dei dati personali
I dati personali del Cliente e dei soggetti a questo collegati saranno trattati dal Professionista esclusivamente per le finalità connesse all'esecuzione del presente incarico e per l'adempimento degli obblighi previsti dalla normativa antiriciclaggio, in conformità al Reg. UE 2016/679 (GDPR) e al D.Lgs. 196/2003.

8. Foro competente e mediazione
Per ogni controversia derivante dal presente mandato è competente in via esclusiva il Foro di {{studio.citta}}. Le parti si impegnano a esperire un tentativo di mediazione presso un organismo accreditato prima di adire l'autorità giudiziaria.

Luogo e data: {{studio.citta}}, ____________________

Il Professionista					Per il Cliente
{{studio.nome}}					{{cliente.ragioneSociale}}


_______________________________			_______________________________

Doppia sottoscrizione ex artt. 1341-1342 c.c. – approvazione specifica delle clausole: art. 3 (interessi di mora e clausola risolutiva espressa); art. 5 (limitazione di responsabilità); art. 6 (recesso con effetto immediato); art. 8 (foro esclusivo).

Il Professionista					Per il Cliente
{{studio.nome}}					{{cliente.ragioneSociale}}


_______________________________			_______________________________`),

    mk('AML - Dichiarazione cliente', 'Dichiarazione cliente (adeguata verifica)', `DICHIARAZIONE DEL CLIENTE AI FINI ANTIRICICLAGGIO
D.Lgs. 21 novembre 2007, n. 231 e successive modificazioni

Professionista incaricato: {{studio.nome}}, {{studio.iscrizione}}
Domicilio professionale: {{studio.indirizzo}} · C.F. {{studio.cf}}

A) DATI IDENTIFICATIVI DEL CLIENTE E DELL'ESECUTORE
Ragione sociale / nome: {{cliente.ragioneSociale}}
Sede legale / residenza: {{cliente.indirizzo}}
P.IVA / C.F.: {{cliente.piva}} {{cliente.codiceFiscale}}
Iscrizione REA: {{clienteRea}}
PEC: {{cliente.pec}}
Legale rappresentante / Esecutore: {{esecutoreNome}}
C.F. esecutore: {{esecutoreCf}}
Nato/a a: {{esecutoreNascita}} · Cittadinanza: {{esecutoreCittadinanza}}
Residente in: {{esecutoreResidenza}}
Documento d'identità esecutore: {{esecutoreDocumento}}

B) SCOPO E NATURA DELLA PRESTAZIONE PROFESSIONALE (art. 18 co. 1 lett. c) D.Lgs. 231/2007)
{{scopoPrestazione}}

C) TITOLARE EFFETTIVO (art. 20 D.Lgs. 231/2007)
Il sottoscritto, consapevole delle sanzioni penali ex art. 55 D.Lgs. 231/2007 per falsa indicazione delle generalità, dichiara quanto segue in merito al/i titolare/i effettivo/i:

{{titolareEffettivo}}

D) PERSONE POLITICAMENTE ESPOSTE – PEP (art. 1 co. 2 lett. dd) D.Lgs. 231/2007)
{{pep}}

E) PROVENIENZA DEI FONDI E MEZZI DI PAGAMENTO (artt. 18 co. 1 lett. c)-d) e 19 co. 1 lett. d) D.Lgs. 231/2007)
Provenienza dei fondi: {{provenienzaFondi}}
Mezzi di pagamento verso il Professionista: {{mezziPagamento}}

I fondi utilizzati non provengono né sono destinati ad attività criminose o al finanziamento del terrorismo (art. 2 co. 6 D.Lgs. 231/2007).

F) ATTIVITÀ DEL CLIENTE
{{attivitaCliente}}

G) VALUTAZIONE DEL RISCHIO (art. 14 D.Lgs. 231/2007 – approccio basato sul rischio)
{{valutazioneRischio}}

H) DICHIARAZIONI FINALI
Il sottoscritto dichiara espressamente: i) di aver esaminato e compreso le definizioni di "riciclaggio", "persone politicamente esposte", "titolare effettivo" e "finanziamento del terrorismo" ex D.Lgs. 231/2007; ii) di essere consapevole delle sanzioni penali previste dall'art. 55 co. 3 D.Lgs. 231/2007 per chi fornisce dati falsi; iii) che il mancato rilascio delle informazioni pregiudica la possibilità del Professionista di eseguire la prestazione; iv) di impegnarsi a comunicare senza ritardo ogni variazione dei dati forniti.

Il sottoscritto prende atto che i propri dati saranno trattati esclusivamente per le finalità previste dal D.Lgs. 231/2007, in conformità al Reg. UE 2016/679 (GDPR).

Luogo e data: {{data.luogoOggi}}

Il Cliente / Legale Rappresentante			Il Professionista che esegue l'identificazione
{{esecutoreNome}}					{{studio.nome}}


_______________________________			_______________________________`),

    mk('AML - Nota di accettazione incarico', 'Nota di accettazione (rischio significativo)', `{{studio.nome}}
{{studio.iscrizione}} · {{studio.indirizzo}}

NOTA DI ACCETTAZIONE INCARICO
Ai sensi degli artt. 14, 24-25 D.Lgs. 21 novembre 2007, n. 231 e delle Regole Tecniche CNDCEC

DATI DEL PROFESSIONISTA E DEL CLIENTE
Professionista: {{studio.nome}}, C.F. {{studio.cf}}, {{studio.iscrizione}}
Cliente: {{cliente.ragioneSociale}} – P.IVA/C.F. {{cliente.piva}} {{cliente.codiceFiscale}}
Sede legale/domicilio cliente: {{cliente.indirizzo}}
Titolare effettivo: {{titolareEffettivo}}
Incarico conferito: {{oggetto}}
Data conferimento incarico: {{data.oggi}}

VALUTAZIONE DEL RISCHIO
Il sottoscritto, in qualità di professionista obbligato ai sensi del D.Lgs. 231/2007, attesta di aver effettuato la valutazione del rischio del cliente in conformità all'approccio basato sul rischio previsto dall'art. 14 D.Lgs. 231/2007 e dalle Regole Tecniche del CNDCEC, con i seguenti esiti:

{{valutazioneRischio}}

Elementi che determinano la classificazione del rischio:
{{elementiRischio}}

MISURE ADOTTATE – ADEGUATA VERIFICA
{{misureAdottate}}

DECISIONE DI ACCETTARE L'INCARICO
Il sottoscritto, valutato il profilo di rischio come sopra descritto e verificata l'insussistenza di cause di astensione ai sensi dell'art. 42 D.Lgs. 231/2007, decide consapevolmente di accettare l'incarico conferito da {{cliente.ragioneSociale}}, ritenendo che: non vi siano elementi concreti che configurino operazioni sospette ai sensi dell'art. 35 D.Lgs. 231/2007; le misure di adeguata verifica adottate consentano di gestire adeguatamente il rischio; l'incarico sia gestibile nell'ambito dell'organizzazione dello Studio.

Il sottoscritto si riserva di rivalutare la presente decisione e, ove necessario, di procedere all'astensione o alla segnalazione di operazione sospetta (SOS) all'UIF qualora nel corso dell'incarico emergano nuovi elementi che modifichino il quadro attuale.

Luogo e data: {{data.luogoOggi}}

Il Professionista
{{studio.nome}}


_______________________________

Allegati al presente documento: {{allegati}}`),
  ];
}

function statoIniziale() {
  const annoOggi = new Date().getFullYear();
  return Object.assign({
    /* iscrizione/indirizzoStudio/cfStudio/citta: usati come placeholder automatici {{studio.*}}
       nei modelli documento (task #122) — intestazione di preventivi, mandati e documenti
       antiriciclaggio generati dai modelli. (Task #174: rimosso "qualifica" da qui - Matteo:
       "la qualifica dello studio non ha senso, toglila come impostazione" - restava un campo
       libero senza un vero uso pratico per uno studio che non è un ordine professionale
       monotitolare.) */
    /* consulenti (task richiesto da Matteo): sottoinsieme di meta.responsabili abilitato a ricevere
       appuntamenti dal flusso "Prenota un appuntamento" della segreteria — non ogni responsabile
       dello studio prende appuntamenti con i clienti (es. Sabrina no, Matteo e Federico sì).
       Gestito solo dall'admin in Impostazioni > Team, vedi renderImpostazioniTeam. */
    // Task #156 (Matteo: "ruoli e permessi per utente... vorrei fossero strutturali ma alla fine
    // basterebbe nascondere la UI"): ruoli/tabConsentiti sono per nome responsabile, come consulenti.
    // Nessuna voce qui = ruolo "admin" di default (nessuna restrizione, nessun cambiamento per chi
    // già usa Prisma). "ruoli" mappa nome -> 'admin' | 'limitato'; "tabConsentiti" mappa nome -> array
    // di id sezione (vedi NAV) visibili SOLO per chi ha ruolo 'limitato'. È un filtro di interfaccia,
    // non un controllo di sicurezza lato server: chiunque abbia accesso al PC/porta condivide gli
    // stessi dati, vedi cardAccessoEsterno.
    // contabilitaAttiva (task #176, Matteo: "rimuovere/sospendere tab Contabilità"): di default
    // false per tutte le installazioni (nuove e già esistenti, visto che un salvataggio vecchio
    // senza questo campo legge undefined, falsy comunque) - il tab resta nel codice e i dati già
    // inseriti restano intatti, solo nascosto dal menu finché non lo si riattiva da Impostazioni >
    // Avanzate. Vedi operatorePuoVedere() e renderImpostazioniSviluppatore().
    meta: { versione: 2, studioNome: 'Studio', responsabili: ['Matteo', 'Sabrina'], consulenti: ['Matteo'], ruoli: {}, tabConsentiti: {}, iscrizione: '', indirizzoStudio: '', cfStudio: '', citta: 'Vicenza', anniExtra: [], logoStudio: '', logoPosizione: 'sinistra', contabilitaAttiva: false },
    annoCorrente: annoOggi,
    clienti: [],
    scadenzeOverrides: {},
    ritenuteRighe: [],
    annualiOverrides: {},
    onboarding: {},
    antiriciclaggio: {},
    preventivi: [],
    modelliDocumento: modelliDocumentoDefault(),
    comunicazioni: [],
    comunicazioniRicorrenti: [],
    documenti: [],
    taskTeam: [],
    bilanci: {},
    contoMappings: {},
    movimentiContabili: {},
    fattureContabili: {},
    importProfili: {},
    documentiContabili: {},
    contiCliente: {},
    regoleImportiStatutari: clonaRegoleImportiStatutariDefault(),
    f24: [],
    soci: [],
    credenziali: [],
    catalogoAttivitaStudio: catalogoAttivitaStudioDefault(),
    moduliPreventivo: moduliPreventivoDefault(),
    chatMessaggi: [],
    /* Appuntamenti con clienti creati dal calendario (task #140): eventi puntuali, distinti dalle
       scadenze fiscali/adempimenti che restano generate dal motore scadenze esistente. */
    appuntamenti: [],
    incassi: [],
    /* Attività extra da fatturare (pratiche prestate oltre il canone): le inserisce chi le svolge, la segreteria le vede e le include nella fattura periodica del cliente. */
    attivitaFatturabili: [],
    /* Libri sociali dei clienti: quali libri, chi li detiene, ultima stampa e ultima pagina. */
    libriSociali: [],
    /* Verbali/atti da stampare nei libri sociali: voci manuali (stampeLibri) + data di stampa delle voci automatiche (stampeLibriFatte[chiave]). */
    stampeLibri: [],
    stampeLibriFatte: {},
    /* Deontologia: check-list accettazione incarico per cliente, formazione continua, impegni di riservatezza. */
    accettazioni: {},
    /* Proroghe massive di scadenze (decreti), tracker concordato preventivo biennale per cliente. */
    proroghe: [],
    cpb: {},
    fpc: [],
    impegniRiservatezza: [],
    /* Procedure interne dello studio (task #146): raccolta di SOP/indicazioni operative per lo staff
       ("come si apre una nuova attività X", quali documenti servono ecc.), strutturate come i Modelli
       documenti (categoria/nome/contenuto) più una checklist di documenti necessari. Usate anche dal
       flusso "Prenota un appuntamento" (task #147) per suggerire la procedura giusta in base al motivo
       dell'appuntamento. */
    procedureInterne: procedureInterneDefault(),
    // Task #186 (Matteo: "notifiche su modifica/eliminazione di task o appuntamenti collegati"):
    // registro separato di notifiche di ELIMINAZIONE - a differenza delle notifiche di
    // creazione/modifica (taskTeam[].notificaVista, appuntamenti[].notificaVista), che vivono
    // attaccate all'oggetto stesso, un'eliminazione cancella l'oggetto su cui si aggancerebbero:
    // serve quindi un registro indipendente che sopravvive alla cancellazione. Vedi
    // notificaEliminazione()/notificheEliminazioniPerOperatore()/segnaNotificaEliminazioneVista().
    notificheEliminazioni: [],
  }, clonaCatalogoDefault());
}
/* Attività "a listino" dello studio (task #138): usate in Preventivi/Mandati per calcolare
   l'importo e generare l'elenco voci nel documento, invece di scrivere ogni volta a mano
   attività+prezzo. richiedeMandato distingue una gestione continuativa (contabilità, paghe: dopo
   l'accettazione del preventivo va firmato anche un mandato) da una pratica singola una tantum
   (basta il preventivo, come chiarito da Matteo — mai duplicare inutilmente il documento). Seed di
   partenza pensato per uno studio di commercialista: modificabile/ampliabile liberamente in
   Impostazioni, non è un elenco chiuso. */
/* MODULI DEI PREVENTIVI: il preventivo ha un solo modello (la lettera dello studio); le diverse tipologie di incarico
   sono "moduli" con le loro attività (titolo + descrizione) che si inseriscono nel testo scegliendoli alla creazione. */
function moduliPreventivoDefault() {
  return [{ id: uid('modp'), nome: 'Costituzione associazione', oggetto: "costituzione dell'Associazione", richiesta: "la costituzione dell'associazione", compenso: null, attivo: true, attivita: [
    { titolo: 'Assistenza per la redazione dello Statuto', descrizione: "consulenza e supporto nella redazione dello statuto dell'associazione, garantendo la conformità alla normativa vigente e la tutela degli interessi dell'associazione" },
    { titolo: 'Pratica di attribuzione del codice fiscale', descrizione: "predisposizione e presentazione della documentazione necessaria per l'attribuzione del codice fiscale all'associazione presso l'Agenzia delle Entrate" },
    { titolo: 'Registrazione dello Statuto', descrizione: "predisposizione e presentazione della documentazione necessaria per la registrazione dell'atto costitutivo e dello statuto presso l'Agenzia delle Entrate" },
    { titolo: 'Iscrizione al RUNTS', descrizione: "predisposizione e presentazione della documentazione necessaria per l'iscrizione dell'associazione al Registro Unico Nazionale del Terzo Settore (RUNTS)" },
  ] }];
}
/* Testo dei moduli scelti: elenco a) b) c) (le lettere continuano tra più moduli), oggetto e frase della richiesta. */
function testoModuliPreventivo(moduli) {
  const voci = [];
  moduli.forEach(m => (m.attivita || []).forEach(a => voci.push(a)));
  const elenco = voci.map((a, i) => `${String.fromCharCode(97 + i)}) **${a.titolo}:** ${a.descrizione || ''}${i === voci.length - 1 ? ';' : ';'}`.replace(/ ;$/, ';')).join('\n');
  const unisci = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
  const tot = moduli.reduce((s, m) => s + (Number(m.compenso) || 0), 0);
  return { elenco, oggetto: unisci(moduli.map(m => m.oggetto).filter(Boolean)), richiesta: unisci(moduli.map(m => m.richiesta).filter(Boolean)), compenso: moduli.some(m => m.compenso != null && m.compenso !== '') ? tot : null };
}
function catalogoAttivitaStudioDefault() {
  const mk = (nome, prezzo, richiedeMandato, descrizione) => ({ id: uid('att'), nome, prezzo, richiedeMandato, descrizione: descrizione || '' });
  return [
    mk('Tenuta contabilità ordinaria', 1800, true, 'Tenuta contabilità e adempimenti fiscali periodici (IVA, corrispettivi, F24) su base annua.'),
    mk('Tenuta contabilità semplificata/forfettaria', 1200, true, 'Tenuta contabilità semplificata o forfettaria e adempimenti fiscali periodici su base annua.'),
    mk('Elaborazione paghe e contributi', 900, true, 'Elaborazione cedolini, F24 e adempimenti previdenziali per dipendenti/collaboratori, su base annua.'),
    mk('Dichiarazione dei redditi (persona fisica)', 150, false, 'Predisposizione e invio telematico del modello Redditi PF o 730, una tantum.'),
    mk('Dichiarazione dei redditi (società)', 400, false, 'Predisposizione e invio telematico del modello Redditi società, una tantum.'),
    mk('Apertura partita IVA', 120, false, 'Apertura posizione fiscale/partita IVA, una tantum.'),
    mk('Pratica camerale (costituzione/variazione/cessazione)', 250, false, 'Pratica presso il Registro Imprese, una tantum.'),
    mk('Consulenza fiscale una tantum', null, false, 'Consulenza su una questione specifica, a preventivo su richiesta.'),
  ];
}

let STATE = null;
let VIEW = 'oggi'; // si parte da "Il mio lavoro" (task #213); 'dashboard' resta il ripiego dei blocchi di permesso/modulo
let VIEW_PARAMS = {};

/* Porta un oggetto stato "grezzo" (da localStorage o dal documento condiviso, vedi SYNC CONDIVISO
   più sotto) alla forma completa che il resto dell'app si aspetta: riempie i campi mancanti con i
   default, fonde il catalogo aggiornato, applica le migrazioni legacy. Isolata in una funzione a
   parte perché serve in due punti (caricamento da localStorage E applicazione di un aggiornamento
   arrivato dal backend condiviso) e deve comportarsi identicamente in entrambi i casi. */
/* Redesign contabilità (set. 2026): 'bilancinoPaghe' come tipo a sé è sparito, sostituito da un
   mastrino taggato su un conto ponte retribuzioni (stesso meccanismo degli altri conti). I mastrini
   vecchi senza contoId (creati prima dell'introduzione del registro conti) finiscono in un conto
   "Non specificato" così non si perde nessun dato già registrato. */
function migraDocumentiContabiliConti(stato) {
  if (!stato.documentiContabili) return 0;
  if (!stato.contiCliente) stato.contiCliente = {};
  let migrati = 0;
  const contoPerNome = (clienteId, nome) => {
    if (!stato.contiCliente[clienteId]) stato.contiCliente[clienteId] = [];
    let conto = stato.contiCliente[clienteId].find(c => c.nome.toLowerCase() === nome.toLowerCase());
    if (!conto) { conto = { id: uid('conto'), nome }; stato.contiCliente[clienteId].push(conto); }
    return conto;
  };
  Object.keys(stato.documentiContabili).forEach(clienteId => {
    (stato.documentiContabili[clienteId] || []).forEach(doc => {
      if (doc.tipo === 'bilancinoPaghe') {
        doc.tipo = 'mastrino';
        doc.contoId = contoPerNome(clienteId, 'Conto ponte retribuzioni').id;
        migrati++;
      } else if (doc.tipo === 'mastrino' && !doc.contoId) {
        doc.contoId = contoPerNome(clienteId, 'Non specificato').id;
        migrati++;
      }
    });
  });
  return migrati;
}

/* Task #114: i Task Team avevano un campo "note" a testo singolo, sovrascrivibile - diventato ora
   uno storico "noteStorico" (append-only, con autore e data per ogni voce). Un task già salvato da
   Matteo con la vecchia "note" non deve perdere quel testo: diventa la prima voce dello storico.
   L'autore esatto di quella nota vecchia non è mai stato registrato (il campo non lo prevedeva),
   quindi usiamo l'assegnatario del task come attribuzione più plausibile piuttosto che lasciarla
   vuota o inventare "Matteo" a prescindere. */
function migraNoteTaskTeam(stato) {
  // Task creati da fonti esterne (IA/MCP) senza data di inserimento: si ricava dalla prima nota o, in mancanza, da oggi.
  (stato.taskTeam || []).forEach(t => { if (!t.creatoIl) { const n = (t.noteStorico || []).map(x => x.data).filter(Boolean).sort()[0]; t.creatoIl = n ? String(n).slice(0, 10) : oggiISO(); } });
  if (!Array.isArray(stato.taskTeam)) return 0;
  let migrati = 0;
  stato.taskTeam.forEach(t => {
    if (!Array.isArray(t.noteStorico)) t.noteStorico = [];
    if (t.note && String(t.note).trim() && !t.noteStorico.length) {
      t.noteStorico.push({ id: uid('nota'), testo: String(t.note).trim(), autore: t.assegnatoA || null, data: t.creatoIl || oggiISO() });
      migrati++;
    }
    delete t.note;
    // "Note di completamento" è diventata la "Descrizione" generica del task (compare nell'elenco)
    if (t.noteCompletamento !== undefined) {
      if (t.noteCompletamento && !t.descrizione) { t.descrizione = t.noteCompletamento; migrati++; }
      delete t.noteCompletamento;
    }
  });
  return migrati;
}

/* Credenziali con campi personalizzabili (richiesto da Matteo: Entratel ha nome utente + password
   + PIN, il Desktop telematico ha ambiente di sicurezza + password — i due campi fissi
   username/password non bastavano più, servono N campi con nome scelto liberamente). Una
   credenziale già salvata con la vecchia forma (username/password fissi) non deve perdere quei
   dati: diventano le prime voci di un array "campi" — Nome utente (in chiaro) e Password
   (segreta) — la prima volta che lo stato viene caricato dopo l'aggiornamento. Da qui in avanti
   il modale di modifica lavora solo su "campi"; username/password restano sull'oggetto solo come
   residuo storico, ignorati dal resto dell'app. */
function migraCampiCredenziali(stato) {
  if (!Array.isArray(stato.credenziali)) return 0;
  let migrati = 0;
  stato.credenziali.forEach(c => {
    if (Array.isArray(c.campi)) return;
    c.campi = [];
    if (c.username) c.campi.push({ id: uid('campo'), etichetta: 'Nome utente', valore: c.username, segreto: false });
    if (c.password) c.campi.push({ id: uid('campo'), etichetta: 'Password', valore: c.password, segreto: true });
    if (c.campi.length === 0) c.campi.push({ id: uid('campo'), etichetta: 'Password', valore: '', segreto: true });
    migrati++;
  });
  return migrati;
}

function normalizzaStatoCaricato(parsed) {
  const stato = Object.assign(statoIniziale(), parsed);
  stato.meta = Object.assign(statoIniziale().meta, parsed.meta || {});
  sincronizzaCatalogoConDefault(stato);
  migraTipoClienteLegacy(stato);
  migraAtecoClienteLegacy(stato);
  migraAdempimentiDuplicati(stato);
  migraDocumentiContabiliConti(stato);
  migraNoteTaskTeam(stato);
  migraStatoVersamentoRitardo(stato);
  migraPacchettoPortale(stato);
  migraModelloPreventivoStudio(stato);
  migraCampiCredenziali(stato);
  unisciLibriSociali(stato);
  assicuraLibriSocieta(stato);
  if (!Array.isArray(stato.stampeLibri)) stato.stampeLibri = [];
  if (!stato.stampeLibriFatte || typeof stato.stampeLibriFatte !== 'object') stato.stampeLibriFatte = {};
  /* Una tantum: il modello "in stile lettera" (copia del Word dello studio) compare da solo tra i modelli. */
  if (stato.meta && !stato.meta.modelloLetteraV2 && Array.isArray(stato.modelliDocumento)) {
    stato.meta.modelloLetteraV2 = true;
    const nuovo = modelliBaseStrutturati().find(m => m.stile === 'lettera');
    const vecchio = stato.modelliDocumento.find(x => x.nome === 'Preventivo – Costituzione associazione (lettera)' || x.nome === nuovo.nome);
    if (vecchio) { vecchio.nome = nuovo.nome; vecchio.corpo = nuovo.corpo; vecchio.stile = 'lettera'; vecchio.predefinito = true; vecchio.attivo = true; }
    else stato.modelliDocumento.push(Object.assign(nuovo, { predefinito: true }));
    // Tutti i preventivi hanno lo stesso modello: i vecchi modelli di preventivo restano (per i documenti già emessi) ma non si propongono più.
    stato.modelliDocumento.forEach(m => { if (m.categoria === 'Preventivo' && m.nome !== nuovo.nome) { m.attivo = false; m.predefinito = false; } });
  }
  if (stato && !Array.isArray(stato.moduliPreventivo)) stato.moduliPreventivo = moduliPreventivoDefault();
  return stato;
}

function caricaStato() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { STATE = statoIniziale(); return; }
    const parsed = JSON.parse(raw);
    STATE = normalizzaStatoCaricato(parsed);
  } catch (e) {
    console.error('Errore caricamento stato: dati salvati non leggibili (probabile corruzione)', e);
    // NON si riparte silenziosamente da zero senza avvisare: i dati grezzi (JSON non valido, ma
    // potenzialmente ancora recuperabili a mano da chi sa cosa cercare) vengono preservati sotto
    // una chiave separata PRIMA di azzerare lo stato in memoria — altrimenti la primissima
    // salvaStato() lanciata da un qualsiasi click successivo sovrascriverebbe per sempre l'unica
    // copia esistente dei dati con uno stato vuoto, senza che l'utente se ne accorga mai (un
    // semplice toast qui non basterebbe: usiamo un alert bloccante apposta, perché è uno scenario
    // raro e grave che l'utente deve notare subito, non un'informazione di passaggio).
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) localStorage.setItem(LS_KEY + '_corrotto_' + Date.now(), raw);
    } catch (e2) { /* localStorage non disponibile: non c'è nulla da preservare, si prosegue comunque */ }
    STATE = statoIniziale();
    alert('Attenzione: i dati salvati risultano corrotti e non leggibili. È stata conservata una copia dei dati grezzi in localStorage (sotto una chiave che inizia con "' + LS_KEY + '_corrotto_"), ma l\'app riparte ora da uno stato vuoto. Non procedere con nuove registrazioni prima di aver verificato/recuperato quella copia.');
  }
}
function salvaStato() {
  // salvaStato() viene chiamata dopo QUALSIASI mutazione in tutta l'app: se localStorage
  // lancia un'eccezione (quota esaurita, storage disabilitato/bloccato dal browser, modalità
  // privata su alcuni browser) senza questo try/catch l'errore risalirebbe fino al gestore
  // click/change in corso, interrompendolo a metà (modale che non si chiude, render() mai
  // eseguita) — e soprattutto l'utente non saprebbe MAI che i suoi dati non si sono salvati,
  // rischiando di perdere silenziosamente il lavoro. Meglio avvisare chiaramente e lasciare
  // che il resto del gestore (chiudiModal/render/toast di successo) prosegua comunque.
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(STATE));
  } catch (e) {
    console.error('Salvataggio in localStorage fallito:', e);
    toast('⚠️ Salvataggio non riuscito (spazio esaurito o storage bloccato dal browser). Esporta subito un backup da Impostazioni per non perdere le modifiche.', true);
  }
  pianificaSalvataggioCondiviso();
}

/* -------------------- SYNC CONDIVISO (studio multi-postazione) --------------------
   Il localStorage sopra resta SEMPRE la persistenza di base, e continua a funzionare da solo
   quando questo file è aperto come semplice .html locale (window.location.protocol === 'file:':
   ogni funzione qui sotto se ne accorge e si disattiva in silenzio — nessuna differenza di
   comportamento per chi lo usa così). Quando invece la pagina è servita via http/https, lo stato
   viene anche letto/scritto su un backend condiviso, in uno di due modi alternativi (mai insieme):
     1) claude.ai — pagina pubblicata come Artifact con la capability "db": il documento condiviso
        vive sull'infrastruttura di Anthropic, raggiungibile da chi ha accesso al link.
     2) server locale — questa stessa pagina servita da server.js sulla rete dello studio (vedi
        quel file): il documento condiviso vive su un file JSON sul PC che fa da server, letto via
        fetch()/aggiornato via Server-Sent Events. Zero account esterni richiesti, dati che restano
        sull'hardware dello studio.
   La pagina capisce da sola quale dei due usare (o nessuno) in base a dove è aperta: non serve
   nessuna configurazione manuale, lo stesso identico file funziona in tutti e tre i contesti.
   Server locale: le modifiche di postazioni diverse vengono UNITE (revisione + unione a tre vie, vedi
   "UNIONE DELLE MODIFICHE" qui sotto): si perde un'azione solo se due persone cambiano esattamente lo
   stesso campo nello stesso momento. Modalità claude.ai (Artifact): resta "ultimo vince" sull'intero
   documento. Non è editing collaborativo in tempo reale campo per campo. */
const DB_DOC_PATH = 'studio/state';
let DB_REF = null;
let DB_SALVATAGGIO_TIMER = null;
let DB_STATO_REMOTO_PENDENTE = null;
let HTTP_SYNC_ATTIVO = false;

/* ---- UNIONE DELLE MODIFICHE TRA POSTAZIONI (tre vie: base / mia versione / versione del server) ----
   Prima ogni postazione riscriveva l'INTERO archivio e vinceva l'ultima: se Sabrina e Matteo spuntavano due
   passaggi diversi nello stesso istante, uno dei due spariva. Ora ogni postazione ricorda l'ultima versione
   condivisa che ha visto (BASE_STATE). Quando salva, il server controlla la "revisione": se un collega ha
   salvato nel frattempo risponde 409 con la sua versione, e qui si calcola cosa ho cambiato IO rispetto alla
   base (diffStato) e lo si riapplica sopra la versione del collega (applicaDiffStato). Si perde qualcosa
   solo se due persone cambiano ESATTAMENTE lo stesso campo (vince chi salva dopo). Gli elenchi di oggetti con
   "id" (clienti, task, scadenze, righe...) si uniscono per id; gli oggetti campo per campo. */
let HTTP_REV = null;          // revisione del server su cui si basa BASE_STATE
let BASE_STATE = null;        // ultima versione condivisa nota (oggetto)
let BASE_JSON = null;         // la stessa, come testo (confronto veloce "non ho cambiato nulla")
let SALVA_HTTP_IN_CORSO = false;
let SALVA_HTTP_RIPETI = false;
let HTTP_REV_PENDENTE = null;
let RENDER_DOPO_UNIONE = false;
const _eObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const _clona = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
function _elencoConId(a) { // elenco di oggetti con id testuale univoco (anche vuoto)
  if (!Array.isArray(a)) return false;
  const visti = new Set();
  for (const e of a) { if (!_eObj(e) || typeof e.id !== 'string' || visti.has(e.id)) return false; visti.add(e.id); }
  return true;
}
/* Cosa è cambiato per passare da a a b. Restituisce undefined se sono uguali. */
function diffStato(a, b) {
  if (a === b) return undefined;
  if (_eObj(a) && _eObj(b)) {
    const set = {}, sub = {}, del = [];
    let n = 0;
    for (const k of Object.keys(b)) {
      if (!(k in a)) { set[k] = b[k]; n++; }
      else { const d = diffStato(a[k], b[k]); if (d !== undefined) { sub[k] = d; n++; } }
    }
    for (const k of Object.keys(a)) if (!(k in b)) { del.push(k); n++; }
    return n ? { t: 'o', set, sub, del } : undefined;
  }
  if (_elencoConId(a) && _elencoConId(b) && (a.length || b.length)) {
    const ma = new Map(a.map(e => [e.id, e])), mb = new Map(b.map(e => [e.id, e]));
    const add = [], sub = {}, del = [];
    let n = 0;
    for (const e of b) {
      if (!ma.has(e.id)) { add.push(e); n++; }
      else { const d = diffStato(ma.get(e.id), e); if (d !== undefined) { sub[e.id] = d; n++; } }
    }
    for (const e of a) if (!mb.has(e.id)) { del.push(e.id); n++; }
    return n ? { t: 'a', add, sub, del } : undefined;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  return { t: 'v', v: b };
}
/* Applica a "dest" (la versione di un collega) le modifiche calcolate da diffStato. Restituisce il risultato. */
function applicaDiffStato(dest, p) {
  if (p === undefined) return dest;
  if (p.t === 'v') return _clona(p.v);
  if (p.t === 'o') {
    if (!_eObj(dest)) return dest; // il collega l'ha tolto o trasformato: la sua versione prevale
    for (const k of Object.keys(p.set)) dest[k] = _clona(p.set[k]);
    for (const k of p.del) delete dest[k];
    for (const k of Object.keys(p.sub)) if (k in dest) dest[k] = applicaDiffStato(dest[k], p.sub[k]);
    return dest;
  }
  if (p.t === 'a') {
    if (!Array.isArray(dest)) return dest;
    const idx = new Map(); dest.forEach((e, i) => { if (_eObj(e)) idx.set(e.id, i); });
    for (const id of Object.keys(p.sub)) if (idx.has(id)) dest[idx.get(id)] = applicaDiffStato(dest[idx.get(id)], p.sub[id]);
    let out = dest;
    if (p.del.length) { const del = new Set(p.del); out = out.filter(e => !(_eObj(e) && del.has(e.id))); }
    const presenti = new Set(out.filter(_eObj).map(e => e.id));
    for (const e of p.add) if (!presenti.has(e.id)) out.push(_clona(e));
    return out;
  }
  return dest;
}
function impostaBaseCondivisa(rev) {
  try { BASE_JSON = JSON.stringify(STATE); BASE_STATE = JSON.parse(BASE_JSON); } catch (e) { BASE_STATE = null; BASE_JSON = null; }
  if (rev) HTTP_REV = rev;
}
/* Ho modifiche non ancora salvate sul server? */
function haModificheNonCondivise() {
  if (!BASE_STATE) return false;
  if (JSON.stringify(STATE) === BASE_JSON) return false;
  return diffStato(BASE_STATE, STATE) !== undefined;
}
/* Mette insieme la versione del server (già normalizzata) con le mie modifiche non ancora salvate.
   Restituisce true se ci sono modifiche mie da (ri)salvare. */
function unisciRemotoConLocale(remotoNorm, rev) {
  let mie;
  if (BASE_STATE && JSON.stringify(STATE) !== BASE_JSON) mie = diffStato(BASE_STATE, STATE);
  let nuovo = remotoNorm;
  if (mie !== undefined) nuovo = applicaDiffStato(_clona(remotoNorm), mie);
  STATE = nuovo;
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { /* già segnalato da salvaStato in altre occasioni */ }
  BASE_JSON = JSON.stringify(remotoNorm); BASE_STATE = JSON.parse(BASE_JSON);
  if (rev) HTTP_REV = rev;
  return mie !== undefined;
}
const HTTP_CLIENT_ID = 'client_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/* -------------------- "Chi sei" (task #98): identità locale, NON un vero login --------------------
   Con il server locale acceso (server.js), tutti i colleghi sulla rete dello studio che aprono
   l'indirizzo del PC condividono gli stessi dati e hanno OGGI accesso pieno, senza restrizioni -
   questo resta così di proposito (studio piccolo, fiducia sulla rete interna). Quello che manca è
   sapere CHI ha fatto cosa: chi ha risposto a un cliente nel thread, chi ha creato una
   comunicazione. Questa sezione risolve solo quello: un nome scelto una volta per browser/PC
   (nessuna password), salvato in una chiave di localStorage SEPARATA da LS_KEY - deve restare
   locale a questo dispositivo, non sincronizzarsi mai via server.js/db condiviso, altrimenti "chi
   sono io" diventerebbe "chi era l'ultimo ad aver salvato da un altro PC". Se in Impostazioni c'è
   un solo responsabile configurato non ha senso chiedere nulla: si assume sia lui, senza friction. */
const LS_KEY_OPERATORE = 'gestionaleOperatoreLocale_v1';
let OPERATORE = null;
// Task #114: id anonimo per QUESTO browser/dispositivo (non per l'operatore - un PC condiviso da
// più persone ha un solo deviceId, ma persone diverse su PC diversi ne hanno uno a testa), usato
// solo per distinguere "stesso nome, stesso posto" da "stesso nome, due posti insieme". Non è mai
// sincronizzato via server.js/db condiviso, per lo stesso motivo di LS_KEY_OPERATORE sopra.
const LS_KEY_DEVICE_ID = 'gestionaleDeviceIdLocale_v1';
let DEVICE_ID = null;
function caricaDeviceIdLocale() {
  try {
    if (typeof localStorage === 'undefined') { DEVICE_ID = 'senza-storage'; return; }
    let id = localStorage.getItem(LS_KEY_DEVICE_ID);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('dev-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(LS_KEY_DEVICE_ID, id);
    }
    DEVICE_ID = id;
  } catch (err) { DEVICE_ID = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
}
function caricaOperatoreLocale() {
  try {
    const salvato = (typeof localStorage !== 'undefined') && localStorage.getItem(LS_KEY_OPERATORE);
    OPERATORE = salvato || null;
  } catch (err) { OPERATORE = null; }
}

// Sessione esclusiva vera per referenti con password (vedi /api/operatore-login in server.js):
// il token ottenuto al login si salva qui, per-dispositivo (stessa chiave di LS_KEY_DEVICE_ID),
// così un refresh di pagina su QUESTO stesso PC non richiede di reinserire la password ogni volta -
// ma un ALTRO dispositivo non ha questo token nel proprio localStorage, quindi non può ereditare
// silenziosamente la sessione. Se il nome cambia operatore (impostaOperatore con un nome diverso,
// o null), il token del nome precedente va scartato: non è più valido per il nuovo nome comunque.
const LS_KEY_SESSIONE_OPERATORE = 'gestionaleSessioneOperatoreLocale_v1';
let SESSIONE_OPERATORE_TOKEN = null; // { nome, token } oppure null
function caricaSessioneOperatoreLocale() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(LS_KEY_SESSIONE_OPERATORE);
    const parsed = raw ? JSON.parse(raw) : null;
    SESSIONE_OPERATORE_TOKEN = (parsed && parsed.nome && parsed.token) ? parsed : null;
  } catch (err) { SESSIONE_OPERATORE_TOKEN = null; }
}
function salvaSessioneOperatoreLocale(nome, token) {
  SESSIONE_OPERATORE_TOKEN = (nome && token) ? { nome, token } : null;
  try {
    if (typeof localStorage === 'undefined') return;
    if (SESSIONE_OPERATORE_TOKEN) localStorage.setItem(LS_KEY_SESSIONE_OPERATORE, JSON.stringify(SESSIONE_OPERATORE_TOKEN));
    else localStorage.removeItem(LS_KEY_SESSIONE_OPERATORE);
  } catch (err) { /* la sessione resta comunque valida in memoria per questa scheda */ }
}
// Token da mandare nell'heartbeat per l'operatore corrente - null se quel nome non ha (più) un
// token valido salvato per questo dispositivo (es. non è un referente con password, o la sessione
// è di un nome diverso da quello attuale).
function tokenSessioneOperatoreCorrente() {
  const nome = operatoreCorrente();
  return (SESSIONE_OPERATORE_TOKEN && SESSIONE_OPERATORE_TOKEN.nome === nome) ? SESSIONE_OPERATORE_TOKEN.token : null;
}

// Cache dei referenti che hanno una password impostata (mai la password stessa) - usata sia nel
// selettore operatore (per sapere a chi chiederla) sia in Impostazioni (per mostrare il lucchetto
// giusto). Stesso pattern delle altre cache HTTP_SYNC_ATTIVO-gated del file (ACCESSO_ESTERNO_CACHE
// ecc.): un fetch alla volta, invalidata esplicitamente dopo un salvataggio.
let RESPONSABILI_CON_PASSWORD_CACHE = null;
let RESPONSABILI_CON_PASSWORD_CARICAMENTO = false;
function caricaResponsabiliConPassword() {
  if (!HTTP_SYNC_ATTIVO || RESPONSABILI_CON_PASSWORD_CARICAMENTO || RESPONSABILI_CON_PASSWORD_CACHE !== null) return;
  RESPONSABILI_CON_PASSWORD_CARICAMENTO = true;
  fetch('/api/responsabili-password-stato')
    .then(r => r.json())
    .then(info => { RESPONSABILI_CON_PASSWORD_CACHE = (info && info.ok) ? info.nomiConPassword : []; })
    .catch(() => { RESPONSABILI_CON_PASSWORD_CACHE = []; })
    .finally(() => {
      RESPONSABILI_CON_PASSWORD_CARICAMENTO = false;
      render();
    });
}
function responsabileHaPassword(nome) {
  return Array.isArray(RESPONSABILI_CON_PASSWORD_CACHE) && RESPONSABILI_CON_PASSWORD_CACHE.includes(nome);
}
// Bozza (non salvata) delle password digitate in Impostazioni per ogni referente - stesso schema
// "draft buffer" di PORTALE_PASSWORD_DRAFT/ACCESSO_ESTERNO_DRAFT: sopravvive ai re-render in
// background finché non si preme "Salva".
let RESPONSABILE_PASSWORD_DRAFT = {};

/* Task #142 (feedback di Federico: troppe voci di menu tutte visibili per chi non conosce già
   Prisma): i gruppi della sidebar sono collassabili. Come OPERATORE/DEVICE_ID qui sopra, è una
   preferenza di INTERFACCIA per questo dispositivo/browser, non un dato dello studio — resta
   quindi in una chiave di localStorage separata, mai in STATE/sincronizzata via server, altrimenti
   un operatore che chiude un gruppo lo chiuderebbe per tutti. Di default solo "Panoramica" è
   aperto: è dove vivono dashboard/azioni/calendario, i punti d'ingresso più usati. Qualunque
   gruppo contenga la pagina attualmente aperta viene comunque mostrato espanso (vedi renderNav),
   quindi non si perde mai di vista "dove sono" navigando dai link diretti (es. "Vai alla scheda
   cliente"). */
const LS_KEY_NAV_APERTI = 'gestionaleNavGruppiAperti_v1';
let NAV_GRUPPI_APERTI = null;
function caricaNavGruppiApertiLocale() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(LS_KEY_NAV_APERTI);
    const arr = raw ? JSON.parse(raw) : null;
    NAV_GRUPPI_APERTI = new Set(Array.isArray(arr) ? arr : ['Oggi']);
  } catch (err) { NAV_GRUPPI_APERTI = new Set(['Oggi']); }
}
function salvaNavGruppiApertiLocale() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY_NAV_APERTI, JSON.stringify(Array.from(NAV_GRUPPI_APERTI)));
  } catch (err) { /* preferenza di UI, non blocca nulla se non si salva */ }
}
function toggleNavGruppo(nomeGruppo) {
  if (!NAV_GRUPPI_APERTI) caricaNavGruppiApertiLocale();
  if (NAV_GRUPPI_APERTI.has(nomeGruppo)) NAV_GRUPPI_APERTI.delete(nomeGruppo);
  else NAV_GRUPPI_APERTI.add(nomeGruppo);
  salvaNavGruppiApertiLocale();
}
// Si auto-corregge se il nome scelto non è (più) tra i responsabili configurati (es. rinominato o
// rimosso in Impostazioni) - meglio tornare a "nessuno" che continuare ad attribuire a un nome che
// nel frattempo è cambiato.
function operatoreCorrente() {
  if (OPERATORE && !STATE.meta.responsabili.includes(OPERATORE)) OPERATORE = null;
  return OPERATORE;
}
// Presenza operatori online (task Matteo: pallini online/offline nella chat - "sullutenza sabrina
// vedevo sia matteo che sabrina attivi, mentre su matteo vedevo solo matteo"): stato SOLO in
// memoria lato server (vedi /api/presenza in server.js), mai in dati-studio.json - non ha senso
// persistere "chi era online" tra un riavvio e l'altro. PRESENZA_ONLINE è una mappa nome->true dei
// responsabili visti negli ultimi 30 secondi.
let PRESENZA_ONLINE = {};
function operatoreOnline(nome) { return !!(nome && PRESENZA_ONLINE[nome]); }
// Task #202 (Matteo: convertitore file, "ci metto sempre almeno due volte prima di riuscire a
// prendere il file, la prima volta va a vuoto"): quando si apre un dialog nativo del sistema (il
// selettore file di "Scegli file...", ma anche un dialog di stampa o di salvataggio) la finestra
// dell'app perde il focus del sistema operativo - il browser non ha altro modo di saperlo. Se il
// polling presenza (ogni 4s, vedi avviaPollingPresenza) scatta in quella finestra di tempo e chiama
// render(), l'intero DOM viene ricostruito e l'<input type="file"> a cui il dialog è ancora agganciato
// resta orfano (staccato dall'albero): la scelta del file fa comunque scattare l'evento "change" sul
// nodo, ma un evento su un nodo non più attaccato a document.body non risale mai al listener
// delegato lì sopra, quindi sembra "non aver preso" il file. Il tentativo successivo funziona perché
// nel frattempo non c'è più nessun dialog in corso. Finestra senza focus del sistema = non toccare
// il DOM, qualunque sia il motivo (impostato in init() con window.addEventListener('blur'/'focus')).
let FINESTRA_HA_FOCUS = true;
/* Guardia condivisa contro i re-render "in background" (polling presenza, sync stato remoto): un
   render() ricostruisce tutto il DOM da zero, quindi qualunque stato che vive SOLO nel DOM invece
   che in una variabile JS sparisce silenziosamente. Oltre a "si sta scrivendo" (INPUT/TEXTAREA, già
   gestito prima) questo copre tre bug segnalati da Matteo:
   - un <select> con il menu a tendina aperto (focus sul <select> mentre il browser mostra le
     opzioni): ricostruire l'elemento sotto al dito lo chiude di scatto.
   - un <details> aperto a mano (es. la spiegazione di un indice in Bilanci&KPI, o "utente e
     password" in Accesso esterno): l'attributo "open" è nativo del browser, non tracciato in
     nessuna variabile, quindi un re-render lo richiude sempre, anche se l'utente lo sta ancora
     leggendo ("molti menù a tendina si chiudono da soli poco dopo averli aperti").
   - la finestra dell'app senza focus di sistema (dialog nativo "Scegli file" o di stampa in corso,
     task #202): vedi commento su FINESTRA_HA_FOCUS sopra.
   Non copre i casi con logica ad hoc più fine (es. applicaStatoRemotoSeLibero fa un'eccezione per
   #chatTesto): quei punti mantengono il proprio controllo aggiuntivo oltre a questo. */
/* Testo selezionato col mouse (es. un codice fiscale o un indirizzo da copiare): un re-render in
   background lo deselezionerebbe a metà. Finché c'è una selezione non vuota dentro la pagina gli
   aggiornamenti automatici (presenza, dati dei colleghi) aspettano. Tetto di 90 secondi dall'ultimo
   cambio di selezione, per non lasciare i dati fermi se qualcuno dimentica il testo selezionato. */
let ULTIMA_SELEZIONE_TS = 0;
function haSelezioneTestoAttiva() {
  try {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const n = sel.anchorNode;
    if (!n || !document.body.contains(n)) return false;
    return (Date.now() - ULTIMA_SELEZIONE_TS) < 90000;
  } catch (e) { return false; }
}
function staModificandoQualcosa() {
  if (!FINESTRA_HA_FOCUS) return true;
  if (haSelezioneTestoAttiva()) return true;
  const el = document.activeElement;
  const inCampo = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && document.body.contains(el);
  if (inCampo) return true;
  if (document.querySelector('#content details[open], #modalRoot details[open]')) return true;
  return false;
}
// Interroga il server ogni 8 secondi per sapere chi è online in questo momento - gira anche per chi
// non ha ancora scelto un operatore (basta vedere i pallini altrui), l'invio del PROPRIO heartbeat
// è avviaHeartbeatOperatore() sotto, separato apposta.
function avviaPollingPresenza() {
  if (!HTTP_SYNC_ATTIVO) return;
  const aggiorna = () => {
    if (!HTTP_SYNC_ATTIVO) return;
    fetch('/api/presenza').then(r => r.json()).then(d => {
      if (!d || !d.ok) return;
      const presenzaPrima = JSON.stringify(PRESENZA_ONLINE);
      PRESENZA_ONLINE = d.online || {};
      if (JSON.stringify(PRESENZA_ONLINE) === presenzaPrima) return; // niente di nuovo: nessun re-render (deselezionava il testo ogni 4 secondi)
      // BUG CRITICO (segnalato da Matteo: testo che si cancella da solo in comunicazioni/chat/
      // credenziali): questo giro passa ogni 8 secondi, sempre, in background. Un render() qui
      // senza controllo ricostruisce TUTTO il DOM incluso qualunque modulo aperto in quel momento -
      // e qualunque testo digitato ma non ancora salvato in STATE (es. i campi di "Nuova
      // comunicazione", che si leggono solo al salvataggio, non ad ogni tasto) va perso, anche se
      // l'utente non ha smesso di scrivere da 8 secondi interi: basta che il giro scatti a metà
      // frase. Stessa guardia di applicaStatoRemotoSeLibero() (vedi staModificandoQualcosa sopra):
      // se si sta scrivendo in un campo, c'è un menu a tendina aperto o un <details> espanso a
      // mano, i pallini online/offline aspettano il giro successivo (8s dopo) invece di rompere
      // quello che si sta guardando o scrivendo.
      if (staModificandoQualcosa()) return;
      render();
    }).catch(() => { /* un giro perso non è un problema, si ritenta al prossimo */ });
  };
  aggiorna();
  setInterval(aggiorna, 4000); // Matteo: "il semaforo è molto lento" - ridotto da 8s
}
// Manda "sono qui" ogni 15 secondi per l'operatore corrente - separata dal polling sopra perché
// senza un operatore scelto non c'è nessun nome da segnalare (STATE.meta.responsabili < 2, o
// nessuno ha ancora risposto al selettore "Chi sta usando questo PC?").
function avviaHeartbeatOperatore() {
  const invia = () => {
    if (!HTTP_SYNC_ATTIVO) return;
    const nome = operatoreCorrente();
    if (!nome) return;
    const token = tokenSessioneOperatoreCorrente();
    fetch('/api/presenza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatore: nome, deviceId: DEVICE_ID, token: token || undefined }) })
      .then(r => r.json()).then(d => {
        if (!d || !d.ok) return;
        PRESENZA_ONLINE = d.online || {};
        // Referente con sessione esclusiva vera (token scaduto o ripreso da un altro dispositivo):
        // logout VERO, non un avviso ignorabile - vedi forzaLogoutSessioneOperatore.
        if (d.sessioneScaduta) { forzaLogoutSessioneOperatore(nome); return; }
        // Task #114 (referenti senza password): se nel frattempo un ALTRO dispositivo ha preso
        // questo nome (es. lo hai scelto anche altrove dopo aver forzato qui), il server smette di
        // accettare i nostri heartbeat per questo nome finché non si sceglie di nuovo - avvisiamo
        // invece di restare "online" in modo silenzioso ma sbagliato (falso senso di presidio).
        if (d.occupato) mostraAvvisoOperatoreOccupatoAltrove(nome);
      }).catch(() => {});
  };
  invia();
  setInterval(invia, 8000); // Matteo: "il semaforo è molto lento" - ridotto da 15s (vedi anche
  // PRESENZA_TTL_MS in server.js, ridotto in proporzione per mantenere lo stesso margine)
}
function mostraAvvisoOperatoreOccupatoAltrove(nome) {
  if (OPERATORE_AVVISO_OCCUPATO_MOSTRATO === nome) return; // un avviso solo, non ad ogni giro di 15s
  OPERATORE_AVVISO_OCCUPATO_MOSTRATO = nome;
  toast(`⚠ ${nome} risulta ora attivo anche su un altro dispositivo: qui non stai più segnalando presenza come ${nome}.`);
}
let OPERATORE_AVVISO_OCCUPATO_MOSTRATO = null;
// Task #114 (revisione Matteo: "non deve proprio esistere la possibilità di accedere con due
// nomi" - il vecchio flusso con conferma "continua comunque?" tecnicamente funzionava ma era
// confuso: chi confermava vedeva l'altro dispositivo sparire silenziosamente dall'online senza
// un vero motivo visibile). Ora un nome già occupato da un altro dispositivo è un BLOCCO secco,
// niente conferma/subentro: si aspetta che l'altra postazione mandi un heartbeat (ogni 15s) o che
// la sua presenza scada (PRESENZA_TTL_MS, 30s) e riprovare. Stesso principio "hard" già usato per
// i referenti con password (vedi modalPasswordOperatore/eseguiLoginOperatore), solo senza
// autenticazione dato che qui non c'è una password con cui dimostrare di essere davvero io.
function tentaSceltaOperatore(nome) {
  if (!nome || !STATE.meta.responsabili.includes(nome)) return;
  if (nome === operatoreCorrente()) { chiudiModal(); return; }
  if (!HTTP_SYNC_ATTIVO) { impostaOperatore(nome); chiudiModal(); return; }
  // Referente con password impostata: sessione esclusiva VERA, si passa da /api/operatore-login
  // invece del controllo "soft" qui sotto - vedi modalPasswordOperatore.
  if (responsabileHaPassword(nome)) { modalPasswordOperatore(nome); return; }
  // BUG (segnalato da Matteo: "sono riuscito ad accedere due volte con lo stesso utente"): prima
  // qui si faceva un controllo di sola lettura (/api/presenza/verifica) e SOLO SE libero si
  // impostava l'operatore in locale - la vera "prenotazione" del nome sul server avveniva solo al
  // giro successivo di avviaHeartbeatOperatore, fino a 15s dopo. In quella finestra due dispositivi
  // potevano controllare entrambi "libero" e scegliere lo stesso nome insieme. Ora si chiama
  // DIRETTAMENTE POST /api/presenza (controllo+prenotazione nella STESSA richiesta, atomico lato
  // server - vedi il case in server.js, nessun'altra richiesta può inserirsi in mezzo) invece del
  // solo controllo: il nome viene occupato nello stesso istante in cui si verifica che sia libero.
  fetch('/api/presenza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatore: nome, deviceId: DEVICE_ID }) })
    .then(r => r.json())
    .then(d => {
      if (d && d.ok && d.occupato) {
        toast(`⚠ ${nome} è già collegato da un altro dispositivo in questo momento: riprova tra qualche secondo (si libera da solo se quella postazione resta inattiva).`, true);
      } else {
        if (d && d.ok) PRESENZA_ONLINE = d.online || {}; // niente da aspettare: già aggiornato dalla stessa risposta
        OPERATORE_AVVISO_OCCUPATO_MOSTRATO = null;
        impostaOperatore(nome);
        chiudiModal();
      }
    })
    .catch(() => { impostaOperatore(nome); chiudiModal(); }); // server irraggiungibile: non blocchiamo la scelta locale
}
function impostaOperatore(nome) {
  OPERATORE = (nome && STATE.meta.responsabili.includes(nome)) ? nome : null;
  try {
    if (typeof localStorage === 'undefined') { /* niente da fare, es. ambiente di test senza DOM */ }
    else if (OPERATORE) localStorage.setItem(LS_KEY_OPERATORE, OPERATORE);
    else localStorage.removeItem(LS_KEY_OPERATORE);
  } catch (err) { /* storage non disponibile: l'attribuzione resta solo per questa sessione */ }
  // Un token di sessione esclusiva vale solo per il nome per cui è stato ottenuto (vedi
  // tokenSessioneOperatoreCorrente): se si cambia operatore senza essere passati da
  // eseguiLoginOperatore (es. un referente senza password), un token residuo di un nome diverso
  // va scartato, non ha senso mandarlo nell'heartbeat del nuovo nome.
  if (!SESSIONE_OPERATORE_TOKEN || SESSIONE_OPERATORE_TOKEN.nome !== OPERATORE) salvaSessioneOperatoreLocale(null, null);
  render();
}
// Referente con password impostata (vedi tentaSceltaOperatore): piccola modale con un solo campo
// password, invece del prompt di conferma "soft" usato per i referenti senza password - qui non
// c'è modo di "continuare comunque", se il nome è già in uso il login viene rifiutato dal server.
function modalPasswordOperatore(nome, messaggioErrore) {
  const obbligatorio = operatoreObbligatorio();
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop" ${obbligatorio ? 'data-obbligatorio="1"' : ''}>
    <div class="modal" style="max-width:340px;">
      <h2>Password di ${escapeHtml(nome)}</h2>
      <div class="modal-sub">Questo referente è protetto da una password personale.</div>
      <form id="formLoginOperatore" data-nome="${escapeHtml(nome)}" onsubmit="return false;" style="margin-top:12px;">
        <input type="password" id="operatoreLoginPassword" autocomplete="current-password" onkeydown="if(event.key==='Enter'){event.preventDefault();var b=this.form&&this.form.querySelector('[data-action=login-operatore]');if(b)b.click();}" placeholder="Password" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:9px 11px;box-sizing:border-box;" autofocus>
        <div style="color:var(--rosso);font-size:12.5px;margin-top:8px;min-height:16px;">${escapeHtml(messaggioErrore || '')}</div>
        <div class="modal-actions" style="margin-top:6px;">
          <button type="button" class="btn" data-action="${obbligatorio ? 'operatore-annulla-password' : 'chiudi-modal'}">${obbligatorio ? 'Scegli un altro utente' : 'Annulla'}</button>
          <button type="button" class="btn primary" data-action="login-operatore" data-nome="${escapeHtml(nome)}">Entra</button>
        </div>
      </form>
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  requestAnimationFrame(() => { const c = h('operatoreLoginPassword'); if (c) c.focus(); });
}
function eseguiLoginOperatore(nome) {
  const password = (h('operatoreLoginPassword') || {}).value || '';
  if (!password) { modalPasswordOperatore(nome, 'Scrivi la password.'); return; }
  fetch('/api/operatore-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, password, deviceId: DEVICE_ID }) })
    .then(r => r.json())
    .then(d => {
      if (!d || !d.ok) { modalPasswordOperatore(nome, (d && d.errore) || 'Password non corretta.'); return; }
      salvaSessioneOperatoreLocale(nome, d.token);
      if (d.online) PRESENZA_ONLINE = d.online;
      OPERATORE_AVVISO_OCCUPATO_MOSTRATO = null;
      impostaOperatore(nome);
      chiudiModal();
      toast(`Bentornato, ${nome}.`);
    })
    .catch(() => modalPasswordOperatore(nome, 'Impossibile contattare il server. Riprova.'));
}
// Il server ha rifiutato l'ultimo heartbeat di sessione esclusiva (token scaduto, o un altro
// dispositivo ha preso questo nome nel frattempo): a differenza dell'avviso "soft" (che lascia
// l'utente libero di ignorarlo), qui il logout è VERO - non ha più senso restare attribuiti a un
// nome la cui sessione qui non è più valida, si torna al selettore per rientrare con la password.
function forzaLogoutSessioneOperatore(nome) {
  salvaSessioneOperatoreLocale(null, null);
  impostaOperatore(null);
  toast(`⚠ La tua sessione come ${nome} è terminata (probabilmente ripresa da un altro dispositivo). Rientra con la password.`);
  modalSelettoreOperatore();
}
function aggiornaBadgeOperatore() {
  const el = typeof document !== 'undefined' && document.getElementById('operatoreBadge');
  if (!el) return;
  if (STATE.meta.responsabili.length < 2) { el.style.display = 'none'; return; }
  el.style.display = '';
  const nome = operatoreCorrente();
  // Task Matteo: la notifica di chat non letta deve vedersi anche vicino al proprio nome (il
  // "mittente" con cui si sta usando il gestionale), non solo nel badge della voce di menu Chat -
  // così si nota anche stando su un'altra vista (es. Scadenze), senza dover aprire la sidebar.
  const nonLetti = nome ? chatTotaleNonLetti() : 0;
  el.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">' + (nome ? ('👤 ' + escapeHtml(nome) + ((esisteMaster() && ruoloOperatore(nome) === 'master') ? ' <span class="tag-maestro">Maestro</span>' : '')) : '👤 Chi sei?') + (nonLetti ? ` <span class="nav-badge" style="position:static;margin-left:4px;">${nonLetti}</span>` : '') + '</span>';
  el.title = nome
    ? (nonLetti ? `${nonLetti} messagg${nonLetti===1?'io':'i'} non lett${nonLetti===1?'o':'i'} in chat. Clicca sul tuo nome per cambiare operatore, o apri Chat interna dal menu.` : `Stai usando il gestionale come ${nome}. Clicca per cambiare.`)
    : 'Scegli chi sta usando questo PC (solo per sapere chi ha fatto cosa, nessuna restrizione).';
}
// Bug segnalato da Matteo ("manca l'indicatore per vedere quali responsabili sono online"): i
// pallini di presenza esistevano SOLO dentro Chat interna (lista contatti) - inizialmente erano
// stati mostrati ANCHE in un badge sempre visibile in topbar (un pallino per collega), ma Matteo
// ha poi chiesto di toglierli da lì ("non mi piacciono qui questi tre puntini... lasciamoli
// soltanto quando si clicca sul nome dell'utente"): il badge sempre-acceso è stato rimosso, i
// pallini di presenza restano visibili cliccando sul proprio nome (operatoreBadge, azione
// "apri-selettore-operatore"), che apre modalSelettoreOperatore qui sotto - quella mostra già un
// pallino online/offline per ogni responsabile, stessa fonte dati (operatoreOnline), senza bisogno
// di nessun secondo indicatore sempre acceso.
// Mostrato una volta per browser (finché non si scegli un nome, o se i responsabili passano da 1 a
// 2+): niente da fare se c'è un solo responsabile configurato, o se qui è già stato scelto un nome.
function eventualeSelettoreOperatore() {
  if (STATE.meta.responsabili.length < 2) return;
  if (operatoreCorrente()) return;
  modalSelettoreOperatore();
}
// Con 2+ responsabili e nessun nome scelto non si puo usare Prisma "senza utente": ogni azione verrebbe attribuita a nessuno.
function operatoreObbligatorio() { return STATE.meta.responsabili.length >= 2 && !operatoreCorrente(); }
function modalSelettoreOperatore() {
  caricaResponsabiliConPassword();
  const obbligatorio = operatoreObbligatorio();
  const html = `<div class="modal-backdrop" data-action="chiudi-modal-backdrop" ${obbligatorio ? 'data-obbligatorio="1"' : ''}>
    <div class="modal" style="max-width:380px;">
      <h2>Chi sta usando questo PC?</h2>
      <div class="modal-sub">Serve solo per sapere chi ha risposto a un cliente o creato una comunicazione — non è un vero login: chiunque sulla rete dello studio ha comunque accesso completo, come oggi. I referenti con 🔒 hanno una password personale (vedi Impostazioni).</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin:14px 0;">
        ${STATE.meta.responsabili.map(r => `<button class="btn" data-action="operatore-scegli" data-nome="${escapeHtml(r)}" style="text-align:left;display:flex;align-items:center;gap:8px;">
          <span class="chat-pallino ${operatoreOnline(r)?'online':'offline'}" style="position:static;flex:none;" title="${operatoreOnline(r)?'Online adesso':'Offline'}"></span>
          ${escapeHtml(r)}${(esisteMaster() && ruoloOperatore(r) === 'master') ? ' <span class="tag-maestro">Maestro</span>' : ''}${responsabileHaPassword(r) ? ' 🔒' : ''}
        </button>`).join('')}
      </div>
      ${obbligatorio ? '<div class="helptext">Per entrare devi scegliere un utente.</div>' : '<div class="modal-actions"><button class="btn" data-action="chiudi-modal">Non ora</button></div>'}
    </div>
  </div>`;
  document.getElementById('modalRoot').innerHTML = html;
}

function impostaBadgeSync(testo, titolo) {
  const el = typeof document !== 'undefined' && document.getElementById('syncBadge');
  if (!el) return;
  el.textContent = testo;
  el.title = titolo || '';
}

/* Applica l'ultimo stato remoto ricevuto, MA solo se in questo momento non si sta scrivendo in un
   campo di testo — altrimenti un aggiornamento in arrivo da un collega cancellerebbe a metà quello
   che si sta digitando. Se si sta scrivendo, resta in coda: un listener globale di blur (in
   init()) la riprova appena il campo perde il focus.
   ECCEZIONE (task #116, Matteo: "non si leggono gli ultimi messaggi se la chat è selezionata"): il
   campo #chatTesto NON blocca l'aggiornamento - restare col cursore lì (anche solo perché si sta
   leggendo la chat, non necessariamente scrivendo) è la situazione normale in cui un messaggio
   nuovo deve poter comparire subito, altrimenti non ci si accorge mai delle risposte mentre si sta
   rispondendo. Si preserva comunque quello che si stava scrivendo (bozza + cursore), che altrimenti
   andrebbe perso nel re-render. */
function applicaStatoRemotoSeLibero() {
  if (!DB_STATO_REMOTO_PENDENTE) return;
  if (HTTP_SYNC_ATTIVO && SALVA_HTTP_IN_CORSO) return; // si riprova a fine salvataggio
  const el = document.activeElement;
  const eraChatTesto = el && el.id === 'chatTesto';
  if (staModificandoQualcosa() && !eraChatTesto) return;
  const bozzaChat = eraChatTesto ? { valore: el.value, inizio: el.selectionStart, fine: el.selectionEnd } : null;
  const remoto = DB_STATO_REMOTO_PENDENTE;
  DB_STATO_REMOTO_PENDENTE = null;
  if (HTTP_SYNC_ATTIVO && BASE_STATE) {
    // le mie modifiche non ancora salvate non si perdono: si riapplicano sopra la versione del collega
    const daRisalvare = unisciRemotoConLocale(normalizzaStatoCaricato(remoto), HTTP_REV_PENDENTE);
    HTTP_REV_PENDENTE = null;
    if (daRisalvare) pianificaSalvataggioCondiviso();
  } else {
    STATE = normalizzaStatoCaricato(remoto);
  }
  render();
  if (bozzaChat) {
    const nuovoEl = document.getElementById('chatTesto');
    if (nuovoEl) {
      nuovoEl.value = bozzaChat.valore;
      nuovoEl.focus();
      if (nuovoEl.setSelectionRange) { try { nuovoEl.setSelectionRange(bozzaChat.inizio, bozzaChat.fine); } catch (err) { /* posizione non valida sul nuovo valore, non blocca */ } }
    }
    requestAnimationFrame(() => { const c = document.getElementById('chatThreadCorpo'); if (c) c.scrollTop = c.scrollHeight; });
  } else {
    toast('🔄 Dati aggiornati da un\'altra postazione.');
  }
}

/* Scrive lo stato condiviso (su claude.ai o sul server locale, quello dei due che è attivo)
   raggruppando le mutazioni ravvicinate in un solo invio (es. mentre si digita una nota, o durante
   un'azione bulk su decine di scadenze): scrivere ad ogni singolo tasto premuto sarebbe sia
   inutile sia a rischio di limiti di frequenza/carico sul backend. */
function pianificaSalvataggioCondiviso() {
  if (!DB_REF && !HTTP_SYNC_ATTIVO) return;
  clearTimeout(DB_SALVATAGGIO_TIMER);
  DB_SALVATAGGIO_TIMER = setTimeout(() => {
    if (DB_REF) {
      DB_REF.set(STATE).then(() => {
        impostaBadgeSync('🟢 Sincronizzato', 'Dati condivisi con lo studio, aggiornati.');
      }).catch(err => {
        console.error('Sync condiviso: scrittura non riuscita', err);
        impostaBadgeSync('🟠 Sync in errore', 'Scrittura sui dati condivisi non riuscita. I dati restano comunque salvati in locale su questo dispositivo.');
      });
    } else if (HTTP_SYNC_ATTIVO) {
      salvaHttpConUnione();
      aggiornaVistaMCPInTempoReale();
    }
  }, 800);
}

/* Salvataggio sul server locale con unione delle modifiche (vedi il blocco "UNIONE DELLE MODIFICHE" sopra).
   Un salvataggio alla volta; se il server dice che un collega ha salvato nel frattempo (409) si unisce e si riprova. */
async function salvaHttpConUnione() {
  if (SALVA_HTTP_IN_CORSO) { SALVA_HTTP_RIPETI = true; return; }
  SALVA_HTTP_IN_CORSO = true;
  let riuscito = false, ereditatoDaAltri = false;
  try {
    for (let tentativo = 0; tentativo < 6 && !riuscito; tentativo++) {
      const corpo = JSON.stringify(STATE);
      const intestazioni = { 'Content-Type': 'application/json', 'X-Client-Id': HTTP_CLIENT_ID };
      if (HTTP_REV) intestazioni['X-Stato-Rev'] = HTTP_REV;
      const r = await fetch('/api/stato', { method: 'POST', headers: intestazioni, body: corpo });
      if (r.status === 409) {
        const remoto = await r.json();
        if (remoto && Array.isArray(remoto.clienti)) { unisciRemotoConLocale(normalizzaStatoCaricato(remoto), r.headers.get('X-Stato-Rev')); ereditatoDaAltri = true; }
        else HTTP_REV = r.headers.get('X-Stato-Rev');
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      HTTP_REV = r.headers.get('X-Stato-Rev') || HTTP_REV;
      BASE_JSON = corpo; BASE_STATE = JSON.parse(corpo);
      riuscito = true;
    }
    if (!riuscito) throw new Error('troppi conflitti consecutivi');
    impostaBadgeSync('🟢 Sincronizzato (rete locale)', 'Dati condivisi con lo studio via server locale, aggiornati.');
    if (ereditatoDaAltri) {
      if (typeof staModificandoQualcosa === 'function' && !staModificandoQualcosa()) { render(); toast('🔄 Modifiche di un collega unite alle tue.'); }
      else RENDER_DOPO_UNIONE = true; // si sta scrivendo in un campo: il render arriva al blur
    }
  } catch (err) {
    console.error('Sync via server locale: scrittura non riuscita', err);
    impostaBadgeSync('🟠 Sync in errore', 'Scrittura sul server locale non riuscita. Verifica che il server (server.js) sia ancora acceso. I dati restano comunque salvati in locale su questo dispositivo.');
  } finally {
    SALVA_HTTP_IN_CORSO = false;
    if (SALVA_HTTP_RIPETI) { SALVA_HTTP_RIPETI = false; pianificaSalvataggioCondiviso(); }
    else if (DB_STATO_REMOTO_PENDENTE) setTimeout(applicaStatoRemotoSeLibero, 50);
  }
}

/* Tiene aggiornata "in tempo reale" (nei limiti del debounce di pianificaSalvataggioCondiviso, quindi
   entro ~800ms da ogni modifica) la vista che il server MCP locale legge, quando il gestionale gira
   via server.js (HTTP_SYNC_ATTIVO): ricalcola esportaVistaMCP() - l'UNICA fonte della logica di
   classificazione, resta sempre e solo qui - e la manda al server, che la scrive nello stesso file
   che "Esporta per MCP" scarica a mano. Volutamente "fire and forget": se fallisce (es. server.js
   di una versione precedente senza questo endpoint, o richiesta persa) non deve interrompere né
   segnalare nulla all'utente - il salvataggio vero dei dati (sopra) non dipende da questo, e la
   vista MCP resta comunque disponibile con l'ultimo export manuale o l'ultimo push riuscito. */
function aggiornaVistaMCPInTempoReale() {
  try {
    const vista = esportaVistaMCP();
    fetch('/api/mcp-vista', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vista) }).catch(() => {});
  } catch (err) { /* mai bloccante */ }
}

async function inizializzaSyncCondiviso() {
  try {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') return; // file locale: nessun backend condiviso possibile né necessario

    if (window.claude && typeof window.claude.use === 'function') {
      const db = await window.claude.use('db');
      if (db) { await inizializzaSyncViaClaudeDB(db); return; }
    }
    await inizializzaSyncViaServerLocale();
  } catch (err) {
    console.error('Sync condiviso: inizializzazione non riuscita', err);
    impostaBadgeSync('🟠 Sync non disponibile', 'Impossibile collegarsi ai dati condivisi dello studio in questo momento. I dati restano salvati in locale su questo dispositivo.');
  }
}

async function inizializzaSyncViaClaudeDB(db) {
  DB_REF = db.doc(DB_DOC_PATH);
  impostaBadgeSync('🔵 Connessione...', 'Connessione ai dati condivisi dello studio in corso.');

  const snap = await DB_REF.get();
  if (snap && snap.exists && typeof snap.data === 'function') {
    const remoto = snap.data();
    if (remoto && typeof remoto === 'object' && Array.isArray(remoto.clienti)) {
      STATE = normalizzaStatoCaricato(remoto);
      render();
      // Il popup "chi sei" a init() ha ragionato sui responsabili di default/locali, non ancora
      // su quelli veri appena arrivati dal sync - si ricontrolla ora che STATE è quello giusto
      // (es. un responsabile aggiunto da un collega non era ancora nell'elenco al primo avvio).
      eventualeSelettoreOperatore();
    }
  } else {
    // primo utilizzo di questo link condiviso: lo stato locale attuale diventa la base di partenza
    await DB_REF.set(STATE);
  }
  impostaBadgeSync('🟢 Sincronizzato', 'Dati condivisi con lo studio, aggiornati.');

  DB_REF.onSnapshot((snap) => {
    if (!snap || !snap.exists || typeof snap.data !== 'function') return;
    if (snap.metadata && snap.metadata.hasPendingWrites) return; // eco della propria scrittura in corso: si aspetta la conferma dal server
    DB_STATO_REMOTO_PENDENTE = snap.data();
    applicaStatoRemotoSeLibero();
  });
}

/* Sync via il piccolo server locale (server.js) che gira sulla rete dello studio: legge/scrive lo
   stato via HTTP invece che via window.claude.db, e usa Server-Sent Events (EventSource) per gli
   aggiornamenti in tempo reale — stesso ruolo di onSnapshot sopra, tecnologia diversa perché qui
   non c'è alcuna capability della piattaforma, solo un server scritto ad hoc. Se fetch('/api/stato')
   fallisce (nessun server in ascolto a questo indirizzo — es. il file è servito da un web server
   qualunque senza server.js dietro) si esce in silenzio: nessun badge, nessun errore per l'utente,
   esattamente come un file locale normale. */
async function inizializzaSyncViaServerLocale() {
  let risp;
  try {
    risp = await fetch('/api/stato', { method: 'GET' });
  } catch (err) {
    return; // nessun server raggiungibile a questo indirizzo
  }
  if (!risp || !risp.ok) return;
  const remoto = await risp.json().catch(() => null);
  const revIniziale = risp.headers.get('X-Stato-Rev');
  if (remoto && typeof remoto === 'object' && Array.isArray(remoto.clienti)) {
    STATE = normalizzaStatoCaricato(remoto);
    impostaBaseCondivisa(revIniziale);
    // BUG (nuovo dispositivo che apre il link ngrok): init() mostra il questionario di primo avvio PRIMA che
    // arrivi lo stato vero del server; se resta aperto e viene completato, applicaSetup() sovrascrive team,
    // moduli e permessi dello studio. Ora che lo stato vero e' arrivato, il questionario si chiude da solo.
    if (SETUP && ((STATE.clienti || []).length > 0 || (STATE.meta && (STATE.meta.setupCompletato || STATE.meta.moduliConfermati)))) { SETUP = null; renderSetup(); }
    render();
    // Il popup "chi sei" a init() ha ragionato sui responsabili di default/locali, non ancora su
    // quelli veri appena arrivati dal sync - si ricontrolla ora che STATE è quello giusto (es. un
    // responsabile aggiunto da un collega, o su un altro PC, non era ancora nell'elenco al primo
    // avvio: caso tipico con l'app Electron, che parte sempre con una finestra "vergine" senza
    // nulla ancora salvato in locale finché non arriva la prima sincronizzazione).
    eventualeSelettoreOperatore();
  } else {
    // primo avvio del server: lo stato locale attuale diventa la base di partenza condivisa
    const rPrimo = await fetch('/api/stato', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': HTTP_CLIENT_ID }, body: JSON.stringify(STATE) });
    impostaBaseCondivisa(rPrimo.headers.get('X-Stato-Rev') || revIniziale);
  }
  HTTP_SYNC_ATTIVO = true;
  impostaBadgeSync('🟢 Sincronizzato (rete locale)', 'Dati condivisi con lo studio via server locale, aggiornati.');
  // Presenza operatori (task Matteo: pallini online/offline in chat): vanno avviati QUI, appena il
  // flag HTTP_SYNC_ATTIVO diventa vero davvero (in init() sarebbe stato troppo presto, essendo
  // questa funzione asincrona - controllano da soli quel flag e uscirebbero subito senza mai
  // ripartire, lasciando i pallini sempre spenti).
  avviaPollingPresenza();
  // Avviato sempre (non solo se un operatore è già stato scelto): invia() dentro
  // avviaHeartbeatOperatore() controlla da sola operatoreCorrente() ad ogni giro, quindi
  // se l'operatore non è stato ancora scelto a questo punto (caso normale: si sceglie DOPO
  // che la sync è partita) il giro è un no-op silenzioso finché non lo si sceglie - ma se non
  // parte affatto qui, l'intervallo non esiste mai e nessun heartbeat verrà mai inviato.
  avviaHeartbeatOperatore();

  try {
    const es = new EventSource('/api/eventi');
    es.onmessage = (ev) => {
      let dati = null;
      try { dati = JSON.parse(ev.data); } catch (e) { return; }
      if (dati && dati.tipo === 'comandoMcp') { eseguiComandoMCP(dati.comando); return; }
      if (dati && dati.tipo === 'riavvioImminente') { mostraAvvisoRiavvioServer(dati.secondi); return; }
      if (dati && dati.tipo === 'riavvioConferme') { aggiornaConfermeRiavvioServer(dati.conferme || []); return; }
      if (dati && dati.tipo === 'riavvioSubito') { avviaFaseFinaleRiavvio(); return; }
      if (dati && dati.tipo === 'riavvioAnnullato') { gestisciRiavvioAnnullato(dati.da); return; }
      if (dati && dati.origine === HTTP_CLIENT_ID) return; // eco della propria scrittura: già applicata in locale
      fetch('/api/stato').then(r => { HTTP_REV_PENDENTE = r.headers.get('X-Stato-Rev'); return r.json(); }).then(remoto => {
        if (remoto && Array.isArray(remoto.clienti)) {
          DB_STATO_REMOTO_PENDENTE = remoto;
          applicaStatoRemotoSeLibero();
        }
      }).catch(() => {});
    };
    es.onerror = () => {
      impostaBadgeSync('🟠 Connessione persa', 'Connessione al server locale interrotta (verifica che sia ancora acceso). I dati restano salvati in questo browser; il collegamento riprova da solo.');
    };
  } catch (err) {
    console.error('Sync via server locale: impossibile aprire la connessione di aggiornamento in tempo reale', err);
  }
}

/* -------------------- UPLOAD FILE REALI (solo via server locale) --------------------
   Il file vero e proprio (non solo il nome/data che si registra come metadato) puo' essere
   salvato su disco SOLO quando la pagina gira via server.js (HTTP_SYNC_ATTIVO): e' l'unico dei
   tre contesti (file:// locale, Artifact claude.ai, server locale) in cui esiste un backend che
   puo' scrivere un file in una cartella vera. Negli altri due contesti l'upload resta disabilitato
   e si registra solo il metadato, esattamente come prima di questa funzione — nessuna perdita di
   dati, solo una funzionalita' in piu' quando disponibile. */
/* Struttura delle cartelle di ogni cliente, come in studio: aree tematiche (_Contabilita, _Fiscale, Documenti, Libri e registri,
   Pratiche); dentro ogni area le cartelle degli anni (e, se serve, una sottocartella: Redditi, 770, CU...); "Pratiche" contiene
   direttamente le cartelle delle pratiche. Qui si decide dove finisce ogni file nuovo. */
const AREE_CARTELLA = { contabilita: '_Contabilita', fiscale: '_Fiscale', documenti: 'Documenti', libri: 'Libri e registri', pratiche: 'Pratiche' };
const AREA_PER_CATEGORIA_DOCUMENTO = {
  'Anagrafica': 'documenti', 'Visura camerale': 'documenti', 'Atto costitutivo/Statuto': 'documenti', 'Contratto': 'documenti',
  'Corrispondenza Enti': 'documenti', 'Polizza assicurativa': 'documenti', 'Altro': 'documenti',
  'Bilancio': 'contabilita', 'Registro contabile': 'contabilita', 'Busta paga': 'contabilita',
  'Dichiarazione fiscale': 'fiscale', 'F24': 'fiscale', 'Certificazione': 'fiscale',
  'Verbale / decisione societaria': 'libri', 'Pratiche': 'pratiche',
};
function sottocartellaArea(area, anno, sotto) {
  const nomeArea = AREE_CARTELLA[area] || AREE_CARTELLA.documenti;
  if (area === 'pratiche') return [nomeArea, sotto].filter(Boolean).join('/');
  return [nomeArea, String(anno || new Date().getFullYear()), sotto].filter(Boolean).join('/');
}
function sottocartellaPerCategoria(categoria, dataISO) {
  const anno = String(dataISO || oggiISO()).slice(0, 4);
  return sottocartellaArea(AREA_PER_CATEGORIA_DOCUMENTO[categoria] || 'documenti', anno);
}
function uploadFileReale(file, clienteId, clienteNome, sottocartella) {
  return new Promise((resolve, reject) => {
    if (!HTTP_SYNC_ATTIVO) { reject(new Error('Upload file reale disponibile solo con il server locale (server.js) attivo.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Errore di lettura del file.'));
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] || '';
      fetch('/api/documenti/carica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, clienteNome, sottocartella: sottocartella || '', nomeFile: file.name, contenutoBase64: base64 }),
      })
        .then(r => r.json())
        .then(esito => { if (esito && esito.ok) resolve(esito); else reject(new Error((esito && esito.errore) || 'Upload non riuscito.')); })
        .catch(err => reject(err));
    };
    reader.readAsDataURL(file);
  });
}
function eliminaFileReale(percorso) {
  if (!HTTP_SYNC_ATTIVO || !percorso) return;
  fetch('/api/documenti/elimina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percorso }) }).catch(() => {});
}
function linkScaricaFileReale(percorso) {
  return '/api/documenti/scarica?percorso=' + encodeURIComponent(percorso);
}
/* Apre in Esplora risorse (o Finder) la cartella che contiene il file, con il file selezionato -
   così dal gestionale si arriva dritti al file vero sul disco, non solo alla sua anteprima nel
   browser. Disponibile solo con server.js attivo (stesso limite di uploadFileReale: solo lì esiste
   un file vero da poter mostrare). */
function apriCartellaDocumento(percorso) {
  if (!HTTP_SYNC_ATTIVO || !percorso) return;
  fetch('/api/documenti/apri-cartella', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percorso }) })
    .then(r => r.json()).then(esito => { if (esito && esito.ok === false) toast('⚠️ ' + (esito.errore || 'Impossibile aprire la cartella.'), true); })
    .catch(() => toast('⚠️ Impossibile contattare il server locale per aprire la cartella.', true));
}

/* -------------------- PONTE COMANDI PER L'MCP LOCALE (Claude) --------------------
   Quando l'MCP locale (server.js/mcp-server, vedi tools.js) riceve un tool "scrittura" (crea/
   modifica/elimina cliente, task, ecc.), manda un comando a server.js, che lo inoltra qui via SSE
   (vedi onmessage sopra). Ogni azione è mappata SULLA STESSA funzione che usa già il resto
   dell'app (aggiungiCliente, aggiornaTaskTeam, ecc.) - MAI una copia parallela della logica: se
   domani "creare un cliente" cambia (nuovo campo obbligatorio, nuova validazione...), cambia qui
   una volta sola, in gestionale.htm, e sia il form sia l'MCP la vedono aggiornata.
   Ogni voce riceve i "parametri" così come arrivano dal tool MCP (già validati lato Node con Zod
   per i campi obbligatori) e ritorna il valore che verrà rimandato a Claude come esito. */
const AZIONI_MCP = {
  creaCliente: (p) => aggiungiCliente(p),
  modificaCliente: (p) => { const c = aggiornaCliente(p.id, p.patch || {}); if (!c) throw new Error('Cliente non trovato: ' + p.id); return c; },
  eliminaCliente: (p) => { if (!clienteById(p.id)) throw new Error('Cliente non trovato: ' + p.id); eliminaCliente(p.id); return { eliminato: true }; },

  creaTask: (p) => { aggiungiTaskTeam(p); return { creato: true }; },
  modificaTask: (p) => {
    if (!STATE.taskTeam.find(t => t.id === p.id)) throw new Error('Task non trovato: ' + p.id);
    const patch = Object.assign({}, p.patch || {});
    // Le note NON si sostituiscono con una patch (perderebbero storico e autori): "note" accoda una nota operativa, "noteStorico" si ignora.
    const nuovaNota = typeof patch.note === 'string' ? patch.note : null;
    delete patch.note; delete patch.noteStorico; delete patch.noteEliminate;
    if (Object.keys(patch).length) aggiornaTaskTeam(p.id, patch);
    if (nuovaNota && nuovaNota.trim()) aggiungiNotaTaskTeam(p.id, nuovaNota);
    return { aggiornato: true };
  },
  aggiungiNotaTask: (p) => { const n = aggiungiNotaTaskTeam(p.id, p.testo); if (!n) throw new Error('Task non trovato o nota vuota: ' + p.id); return { notaId: n.id }; },
  modificaNotaTask: (p) => {
    const t = STATE.taskTeam.find(x => x.id === p.id); if (!t) throw new Error('Task non trovato: ' + p.id);
    const n = (t.noteStorico || []).find(x => x.id === p.notaId); if (!n) throw new Error('Nota non trovata: ' + p.notaId + ' (usa task_aperti per vedere gli id delle note)');
    const testo = String(p.testo || '').trim(); if (!testo) throw new Error('Testo della nota vuoto.');
    if (testo !== n.testo) { n.modifiche = (n.modifiche || []).concat([{ testo: n.testo, data: new Date().toISOString(), autore: 'Assistente IA (MCP)' }]); n.testo = testo; salvaStato(); }
    return { aggiornato: true };
  },
  eliminaTask: (p) => { if (!STATE.taskTeam.find(t => t.id === p.id)) throw new Error('Task non trovato: ' + p.id); eliminaTaskTeam(p.id); return { eliminato: true }; },

  creaComunicazione: (p) => { aggiungiComunicazione(p); return { creata: true }; },
  modificaComunicazione: (p) => { if (!STATE.comunicazioni.find(c => c.id === p.id)) throw new Error('Comunicazione non trovata: ' + p.id); aggiornaComunicazione(p.id, p.patch || {}); return { aggiornata: true }; },
  eliminaComunicazione: (p) => { if (!STATE.comunicazioni.find(c => c.id === p.id)) throw new Error('Comunicazione non trovata: ' + p.id); eliminaComunicazione(p.id); return { eliminata: true }; },

  creaSocio: (p) => { aggiungiSocio(p); return { creato: true }; },
  modificaSocio: (p) => { if (!STATE.soci.find(s => s.id === p.id)) throw new Error('Socio non trovato: ' + p.id); aggiornaSocio(p.id, p.patch || {}); return { aggiornato: true }; },
  eliminaSocio: (p) => { if (!STATE.soci.find(s => s.id === p.id)) throw new Error('Socio non trovato: ' + p.id); eliminaSocio(p.id); return { eliminato: true }; },

  creaF24: (p) => { aggiungiF24(p); return { creato: true }; },
  modificaF24: (p) => { if (!STATE.f24.find(f => f.id === p.id)) throw new Error('F24 non trovato: ' + p.id); aggiornaF24(p.id, p.patch || {}); return { aggiornato: true }; },
  eliminaF24: (p) => { if (!STATE.f24.find(f => f.id === p.id)) throw new Error('F24 non trovato: ' + p.id); eliminaF24(p.id); return { eliminato: true }; },

  /* Fasi (sotto-fasi) degli adempimenti: annuale = catalogo STATE.catalogoAnnuale[].sotto (o, con destinazione "terzi",
     le fasi per i clienti con contabilità di terzi); periodico = catalogo STATE.catalogoPeriodico[].fasi.
     La fase è riconosciuta dal NOME: in "rinomina" si migra anche l'avanzamento già registrato, così non si perde nulla. */
  fasiAdempimenti: (p) => {
    const tipo = p.tipo === 'periodico' ? 'periodico' : 'annuale';
    const terzi = tipo === 'annuale' && p.destinazione === 'terzi';
    if (!p.chiave) {
      const out = {
        annuali: catalogoAnnualeTutti().map(t => ({ chiave: t.chiave, nome: t.nome, attivo: t.attivo !== false, fasi: (t.sotto || []).slice(), fasiContabilitaDiTerzi: ((configContabTerzi().sotto || {})[t.chiave] || null) })),
        periodici: (STATE.catalogoPeriodico || []).map(t => ({ chiave: t.id, nome: t.nome, attivo: t.attivo !== false, fasi: (t.fasi || []).slice() })),
      };
      return out;
    }
    const voce = tipo === 'periodico' ? trovaTipoPeriodico(p.chiave) : trovaTipoAnnuale(p.chiave);
    if (!voce) throw new Error('Adempimento ' + tipo + ' non trovato: ' + p.chiave + ' (senza "chiave" elenco tutti)');
    const leggi = () => terzi ? ((configContabTerzi().sotto || {})[p.chiave] || (voce.sotto || []).slice()) : (tipo === 'periodico' ? (voce.fasi || []) : (voce.sotto || []));
    let fasi = leggi().slice();
    const nome = (x) => String(x == null ? '' : x).trim();
    const idxDi = (n) => { const i = fasi.indexOf(nome(n)); if (i < 0) throw new Error('Fase non trovata: "' + n + '". Fasi attuali: ' + fasi.join(' | ')); return i; };
    const op = p.operazione || 'elenca';
    if (op === 'imposta') {
      if (!Array.isArray(p.fasi) || !p.fasi.length) throw new Error('"fasi" deve essere una lista non vuota');
      fasi = p.fasi.map(nome).filter(Boolean);
    } else if (op === 'aggiungi') {
      if (!nome(p.fase)) throw new Error('Indica "fase"');
      if (fasi.includes(nome(p.fase))) throw new Error('Fase già presente: ' + nome(p.fase));
      const pos = p.posizione == null ? fasi.length : Math.max(0, Math.min(fasi.length, Number(p.posizione) - 1));
      fasi.splice(pos, 0, nome(p.fase));
    } else if (op === 'rimuovi') {
      if (fasi.length <= 1) throw new Error('Deve restare almeno una fase');
      fasi.splice(idxDi(p.fase), 1);
    } else if (op === 'rinomina') {
      const i = idxDi(p.fase); const nuovo = nome(p.nuovoNome);
      if (!nuovo) throw new Error('Indica "nuovoNome"');
      if (fasi.includes(nuovo)) throw new Error('Esiste già una fase "' + nuovo + '"');
      const vecchio = fasi[i]; fasi[i] = nuovo;
      if (tipo === 'annuale') {
        Object.keys(STATE.annualiOverrides || {}).forEach(k => { const o = STATE.annualiOverrides[k]; if (o && o.sotto && o.sotto[vecchio]) { o.sotto[nuovo] = o.sotto[vecchio]; delete o.sotto[vecchio]; } });
      } else {
        Object.keys(STATE.scadenzeOverrides || {}).forEach(k => { const o = STATE.scadenzeOverrides[k]; if (o && o.fase === vecchio) o.fase = nuovo; });
      }
    } else if (op === 'sposta') {
      const i = idxDi(p.fase); const [x] = fasi.splice(i, 1);
      fasi.splice(Math.max(0, Math.min(fasi.length, Number(p.posizione) - 1)), 0, x);
    } else if (op !== 'elenca') throw new Error('Operazione sconosciuta: ' + op);
    if (op !== 'elenca') {
      if (terzi) { const cfg = configContabTerzi(); cfg.sotto[p.chiave] = fasi; salvaConfigContabTerzi(cfg); }
      else if (tipo === 'periodico') { voce.fasi = fasi; salvaStato(); }
      else { voce.sotto = fasi; salvaStato(); }
    }
    return { tipo, chiave: p.chiave, nome: voce.nome, destinazione: terzi ? 'contabilità di terzi' : 'standard', fasi };
  },
  modificaScadenza: (p) => { aggiornaScadenza(p.id, p.patch || {}); return { aggiornata: true }; },
  aggiornaSottoAdempimento: (p) => { aggiornaSottoAdempimento(p.annualeId, p.nomeSotto, p.patch || {}); return { aggiornato: true }; },
  modificaAdempimentoAnnuale: (p) => {
    const pt = p.patch || {}; const ok = {};
    ['nota', 'scadenza', 'responsabile'].forEach(k => { if (pt[k] !== undefined) ok[k] = pt[k]; });
    /* "Nessuna ritenuta operata": come la casella nella scheda (solo 770 e CU). Registra chi e quando. */
    if (pt.nonDovuto !== undefined) {
      const a = derivati().annuali.find(x => x.id === p.annualeId);
      if (!a) throw new Error('Adempimento annuale non trovato: ' + p.annualeId);
      if (!ADEMPIMENTI_NON_DOVUTO_POSSIBILE.includes(a.tipoChiave)) throw new Error('"nonDovuto" è possibile solo per ' + ADEMPIMENTI_NON_DOVUTO_POSSIBILE.join(' e ') + ' (questo è ' + a.tipoNome + ')');
      if (pt.nonDovuto) Object.assign(ok, { nonDovuto: true, nonDovutoDa: operatoreCorrente() || null, nonDovutoData: oggiISO() });
      else Object.assign(ok, { nonDovuto: false, nonDovutoDa: null, nonDovutoData: null });
    }
    aggiornaAnnualeMeta(p.annualeId, ok); return { aggiornato: true };
  },

  // Preventivi/mandati (task #143): "attivitaIds" (facoltativo) sono id del catalogo attività dello
  // studio - qui si trasformano nello snapshot {id,nome,prezzo,richiedeMandato} come farebbe il
  // form, e se non viene passato un importo esplicito si somma quello delle attività scelte.
  creaPreventivo: (p) => {
    const attivitaScelte = Array.isArray(p.attivitaIds) ? p.attivitaIds.map(aid => {
      const a = STATE.catalogoAttivitaStudio.find(x => x.id === aid);
      if (!a) throw new Error('Attività a listino non trovata: ' + aid);
      return { id: a.id, nome: a.nome, prezzo: a.prezzo != null ? a.prezzo : null, richiedeMandato: !!a.richiedeMandato };
    }) : [];
    const importoFinale = p.importo != null ? p.importo : (attivitaScelte.length ? attivitaScelte.reduce((s, a) => s + (a.prezzo || 0), 0) : null);
    const valoriCustomFinale = Object.assign({}, p.valoriCustom || {});
    if (attivitaScelte.length && !valoriCustomFinale.dettaglioAttivita) valoriCustomFinale.dettaglioAttivita = testoElencoAttivita(attivitaScelte);
    return creaPreventivoDaModello({ clienteId: p.clienteId, modelloId: p.modelloId, oggetto: p.oggetto, importo: importoFinale, dataEmissione: p.dataEmissione, validoFino: p.validoFino, stato: p.stato, note: p.note, valoriCustom: valoriCustomFinale, attivitaScelte });
  },
  // Comunicazioni ricorrenti, antiriciclaggio, bilanci, moduli (audit copertura MCP, seconda parte)
  creaComunicazioneRicorrente: (p) => { if (!p.oggetto) throw new Error('Serve l\'oggetto.'); aggiungiComunicazioneRicorrente({ oggetto: p.oggetto, corpo: p.corpo || '', categoria: p.categoria || 'Altro', destinatari: p.destinatari || { modo: 'tutti', clienteIds: [] }, frequenza: p.frequenza || 'Mensile', giorno: Number(p.giorno) || 1, mese: Number(p.mese) || 1, attiva: p.attiva !== false }); return { creata: true }; },
  modificaComunicazioneRicorrente: (p) => { if (!(STATE.comunicazioniRicorrenti || []).find(x => x.id === p.id)) throw new Error('Comunicazione ricorrente non trovata: ' + p.id); aggiornaComunicazioneRicorrente(p.id, p.patch || {}); return { aggiornata: true }; },
  eliminaComunicazioneRicorrente: (p) => { if (!(STATE.comunicazioniRicorrenti || []).find(x => x.id === p.id)) throw new Error('Comunicazione ricorrente non trovata: ' + p.id); eliminaComunicazioneRicorrente(p.id); return { eliminata: true }; },
  aggiornaAntiriciclaggio: (p) => {
    if (!clienteById(p.clienteId)) throw new Error('Cliente non trovato: ' + p.clienteId);
    const patch = p.patch || {};
    ['profiloRischio', 'dataAdeguataVerifica', 'scadenzaRevisione'].forEach(k => { if (k in patch) aggiornaCampoAntiriciclaggio(p.clienteId, k, patch[k]); });
    Object.keys(patch.checklist || {}).forEach(k => aggiornaChecklistAntiriciclaggio(p.clienteId, k, !!patch.checklist[k]));
    return { aggiornato: true };
  },
  salvaBilancio: (p) => { if (!clienteById(p.clienteId)) throw new Error('Cliente non trovato: ' + p.clienteId); if (!p.periodo || !p.voci || typeof p.voci !== 'object') throw new Error('Servono periodo (es. "2025") e voci.'); salvaBilancioAnno(p.clienteId, String(p.periodo), p.voci); return { salvato: true }; },
  impostaModulo: (p) => {
    const m = MODULI.find(x => x.id === p.modulo);
    if (!m) throw new Error('Modulo sconosciuto: ' + p.modulo + ' (validi: ' + MODULI.map(x => x.id).join(', ') + ')');
    if (!Array.isArray(STATE.meta.moduliDisattivati)) STATE.meta.moduliDisattivati = [];
    const arr = STATE.meta.moduliDisattivati, i = arr.indexOf(p.modulo);
    if (p.attivo && i !== -1) arr.splice(i, 1); else if (!p.attivo && i === -1) arr.push(p.modulo);
    salvaStato();
    return { modulo: p.modulo, attivo: !!p.attivo };
  },
  creaLibroSociale: (p) => { if (!clienteById(p.clienteId)) throw new Error('Cliente non trovato: ' + p.clienteId); const l = aggiungiLibroSociale(p); return { creato: true, id: l.id }; },
  modificaLibroSociale: (p) => { if (!(STATE.libriSociali || []).find(x => x.id === p.id)) throw new Error('Libro non trovato: ' + p.id); aggiornaLibroSociale(p.id, p.patch || {}); return { aggiornato: true }; },
  creaAttivitaFatturabile: (p) => { if (!clienteById(p.clienteId)) throw new Error('Cliente non trovato: ' + p.clienteId); if (!p.descrizione) throw new Error('descrizione obbligatoria.'); const a = aggiungiAttivitaFatturabile(p); return { creato: true, id: a.id }; },
  segnaAttivitaFatturate: (p) => { const r = segnaAttivitaFatturate(p.ids || [], p); return { segnate: r.segnate }; },
  accettaPreventivo: (p) => { if (!STATE.preventivi.find(x => x.id === p.id)) throw new Error('Preventivo non trovato: ' + p.id); const r = accettaPreventivo(p.id, p); return { accettato: true, clienteAttivato: !!(r && r.attivato) }; },
  creaIncasso: (p) => { if (!clienteById(p.clienteId)) throw new Error('Cliente non trovato: ' + p.clienteId); if (!(Number(p.importo) > 0)) throw new Error('Importo non valido.'); const i = aggiungiIncasso(p); return { creato: true, id: i.id }; },
  modificaIncasso: (p) => { if (!(STATE.incassi || []).find(x => x.id === p.id)) throw new Error('Incasso non trovato: ' + p.id); aggiornaIncasso(p.id, p.patch || {}); return { aggiornato: true }; },
  registraIncasso: (p) => { const i = registraPagamentoIncasso(p.id, p.importo, p.data); return { stato: statoIncasso(i), residuo: residuoIncasso(i) }; },
  eliminaIncasso: (p) => { if (!(STATE.incassi || []).find(x => x.id === p.id)) throw new Error('Incasso non trovato: ' + p.id); eliminaIncasso(p.id); return { eliminato: true }; },
  // Appuntamenti, procedure interne e catalogo attività (audit copertura MCP)
  creaAppuntamento: (p) => { if (!p.data) throw new Error('Serve la data (YYYY-MM-DD).'); const a = aggiungiAppuntamento(p); return { creato: true, id: a.id }; },
  modificaAppuntamento: (p) => { if (!trovaAppuntamento(p.id)) throw new Error('Appuntamento non trovato: ' + p.id); aggiornaAppuntamento(p.id, p.patch || {}); return { aggiornato: true }; },
  eliminaAppuntamento: (p) => { if (!trovaAppuntamento(p.id)) throw new Error('Appuntamento non trovato: ' + p.id); rimuoviAppuntamento(p.id); return { eliminato: true }; },
  creaProcedura: (p) => { if (!p.nome || !p.contenuto) throw new Error('Servono nome e contenuto.'); const n = aggiungiProceduraInterna({ categoria: p.categoria || 'Amministrazione studio', nome: p.nome, contenuto: p.contenuto, checklistDocumenti: p.checklistDocumenti || [], motiviAppuntamento: p.motiviAppuntamento || [] }); return { creata: true, id: n.id }; },
  modificaProcedura: (p) => { if (!STATE.procedureInterne.find(x => x.id === p.id)) throw new Error('Procedura non trovata: ' + p.id); aggiornaProceduraInterna(p.id, p.patch || {}); return { aggiornata: true }; },
  eliminaProcedura: (p) => { if (!STATE.procedureInterne.find(x => x.id === p.id)) throw new Error('Procedura non trovata: ' + p.id); eliminaProceduraInterna(p.id); return { eliminata: true }; },
  creaAttivitaCatalogo: (p) => { if (!p.nome) throw new Error('Serve il nome.'); const n = aggiungiAttivitaCatalogo({ nome: p.nome, descrizione: p.descrizione || '', prezzo: p.prezzo != null ? Number(p.prezzo) : null, richiedeMandato: !!p.richiedeMandato }); return { creata: true, id: n && n.id }; },
  modificaPreventivo: (p) => { if (!STATE.preventivi.find(x => x.id === p.id)) throw new Error('Preventivo/mandato non trovato: ' + p.id); aggiornaPreventivo(p.id, p.patch || {}); return { aggiornato: true }; },
  eliminaPreventivo: (p) => { if (!STATE.preventivi.find(x => x.id === p.id)) throw new Error('Preventivo/mandato non trovato: ' + p.id); eliminaPreventivo(p.id); return { eliminato: true }; },
};

/* Registro delle azioni di Claude (task #210): ogni comando MCP ricevuto - eseguito, rifiutato o
   fallito - viene registrato (ultimi 300) e consultabile da Impostazioni › Intelligenza artificiale. In modalità
   "chiedi conferma" (STATE.meta.mcpChiediConferma) ogni azione richiede un OK esplicito. */
const ETICHETTE_AZIONE_MCP = { creaCliente: 'Crea cliente', modificaCliente: 'Modifica cliente', eliminaCliente: 'Elimina cliente', creaTask: 'Crea task', modificaTask: 'Modifica task', aggiungiNotaTask: 'Aggiungi nota a un task', modificaNotaTask: 'Modifica nota di un task', eliminaTask: 'Elimina task', creaComunicazione: 'Crea comunicazione', modificaComunicazione: 'Modifica comunicazione', eliminaComunicazione: 'Elimina comunicazione' };
function etichettaAzioneMCP(azione) {
  if (ETICHETTE_AZIONE_MCP[azione]) return ETICHETTE_AZIONE_MCP[azione];
  const t = String(azione || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function sintesiParametriMCP(parametri) {
  let t = '';
  try { t = JSON.stringify(parametri || {}); } catch (e) { t = String(parametri); }
  return t.length > 400 ? t.slice(0, 400) + '…' : t;
}
function registraAzioneMCP(comando, esito, errore) {
  if (!Array.isArray(STATE.auditMcp)) STATE.auditMcp = [];
  STATE.auditMcp.push({ id: uid('aud'), data: new Date().toISOString(), operatore: operatoreCorrente() || null, azione: comando.azione, parametri: sintesiParametriMCP(comando.parametri), esito, errore: errore || null });
  if (STATE.auditMcp.length > 300) STATE.auditMcp = STATE.auditMcp.slice(-300);
  salvaStato();
}
let CODA_APPROVAZIONI_MCP = Promise.resolve();
function chiediApprovazioneMCP(comando) {
  // una alla volta, in ordine di arrivo
  const attesa = CODA_APPROVAZIONI_MCP.then(() => new Promise((risolvi) => {
    const div = document.createElement('div');
    div.className = 'conferma-chiusura-overlay';
    div.innerHTML = `<div class="conferma-chiusura-box" style="max-width:520px;text-align:left;">
      <div class="conferma-chiusura-testo"><b>🤖 Claude vuole eseguire un'azione</b><br>${escapeHtml(etichettaAzioneMCP(comando.azione))}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:#F3F5FA;border-radius:8px;padding:8px 10px;max-height:200px;overflow:auto;margin:10px 0;">${escapeHtml(sintesiParametriMCP(comando.parametri))}</pre>
      <div class="conferma-chiusura-azioni"><button class="btn" data-mcp="no">Rifiuta</button><button class="btn primary" data-mcp="si">Approva</button></div>
    </div>`;
    div.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mcp]');
      if (!b) return;
      div.remove();
      risolvi(b.dataset.mcp === 'si');
    });
    document.body.appendChild(div);
  }));
  CODA_APPROVAZIONI_MCP = attesa.catch(() => {});
  return attesa;
}
async function eseguiComandoMCP(comando) {
  let ok = true, risultato = null, errore = null, rifiutato = false;
  try {
    const fn = comando && AZIONI_MCP[comando.azione];
    if (!fn) throw new Error('Azione MCP sconosciuta: ' + (comando && comando.azione));
    if (STATE.meta && STATE.meta.mcpChiediConferma && !(await chiediApprovazioneMCP(comando))) {
      rifiutato = true;
      throw new Error('Azione rifiutata dall\'utente in Prisma.');
    }
    risultato = fn(comando.parametri || {});
    render();
    toast('🤖 Claude ha eseguito: ' + etichettaAzioneMCP(comando.azione));
    registraAzioneMCP(comando, 'eseguita', null);
  } catch (err) {
    ok = false;
    errore = (err && err.message) ? err.message : String(err);
    if (!rifiutato) {
      console.error('Comando MCP fallito', comando, err);
      toast('⚠️ Comando da Claude fallito (' + (comando && comando.azione) + '): ' + errore, true);
    }
    if (comando && comando.azione) registraAzioneMCP(comando, rifiutato ? 'rifiutata' : 'fallita', errore);
  }
  if (comando && comando.id) {
    fetch('/api/comando-risultato', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: comando.id, ok, risultato, errore }),
    }).catch(() => {});
  }
}

