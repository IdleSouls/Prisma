/*
 * Definizioni della configurazione iniziale: DEVONO restare identiche a quelle di gestionale.htm
 * (MODULI, SETUP_DOMANDE, SETUP_PROFILI). Un test in jsdom-test.js confronta gli id: se cambi
 * i moduli nel gestionale, aggiorna anche questo file (o rigeneralo).
 */
const MODULI = [
  {
    "id": "calendario",
    "label": "Calendario e appuntamenti",
    "desc": "Calendario scadenze, prenotazione appuntamenti con i consulenti."
  },
  {
    "id": "portale",
    "label": "Portale clienti e comunicazioni",
    "desc": "Area riservata del cliente, messaggi, notifiche push e accesso esterno."
  },
  {
    "id": "team",
    "label": "Lavoro di squadra",
    "desc": "Task team e chat interna tra i collaboratori."
  },
  {
    "id": "procedure",
    "label": "Procedure interne",
    "desc": "Istruzioni operative passo per passo per lo staff."
  },
  {
    "id": "antiriciclaggio",
    "label": "Antiriciclaggio",
    "desc": "Adeguata verifica, profilo di rischio e storico verifiche."
  },
  {
    "id": "preventivi",
    "label": "Preventivi e mandati",
    "desc": "Preventivi, mandati e lettere di incarico da modelli."
  },
  {
    "id": "libri",
    "label": "Libri sociali",
    "desc": "Libri sociali dei clienti: detentore, ultima stampa e ultima pagina."
  },
  {
    "id": "fatturazione",
    "label": "Attività da fatturare",
    "desc": "Pratiche extra da fatturare e periodicità di fatturazione di ogni cliente."
  },
  {
    "id": "incassi",
    "label": "Incassi e solleciti",
    "desc": "Compensi da incassare, scadenze di pagamento e solleciti ai clienti."
  },
  {
    "id": "onboarding",
    "label": "Onboarding clienti",
    "desc": "Checklist di attivazione per un nuovo cliente."
  },
  {
    "id": "servizi",
    "label": "Portale avanzato: ritenute, F24, bilanci e KPI",
    "desc": "Pacchetto da attivare cliente per cliente (interruttore nella scheda Portale): registro ritenute e F24, bilanci/KPI e, nel portale del cliente, F24, ritenute, ravvedimento e Andamento."
  },
  {
    "id": "rubrica",
    "label": "Rubrica contatti",
    "desc": "Elenco unico dei contatti dei clienti."
  },
  {
    "id": "credenziali",
    "label": "Password dello studio",
    "desc": "Archivio credenziali (Entratel, Telemaco, home banking...)."
  },
  {
    "id": "cruscotto",
    "label": "Cruscotto titolare",
    "desc": "Vista d'insieme dello studio: portafoglio clienti, nuovi e cessati, avanzamento adempimenti."
  },
  {
    "id": "carico",
    "label": "Carico di lavoro e proroghe",
    "desc": "Carico per responsabile e registro delle proroghe concesse."
  },
  {
    "id": "cpb",
    "label": "Concordato preventivo biennale",
    "desc": "Tracker delle proposte CPB e delle adesioni dei clienti."
  },
  {
    "id": "imposte",
    "label": "Imposte calcolate",
    "desc": "Imposte calcolate per cliente e anno, con storico delle modifiche."
  },
  {
    "id": "strumenti",
    "label": "Strumenti file",
    "desc": "Convertitore Word/PDF, unisci e dividi PDF."
  }
];
const DOMANDE = [
  {
    "id": "squadra",
    "q": "Lavorate in più persone e vi passate il lavoro (task, chat)?",
    "moduli": [
      "team"
    ]
  },
  {
    "id": "cal",
    "q": "Volete gestire appuntamenti e prenotazioni dei consulenti?",
    "moduli": [
      "calendario"
    ]
  },
  {
    "id": "portale",
    "q": "Volete dare ai clienti un portale (documenti, scadenze, messaggi)?",
    "moduli": [
      "portale"
    ]
  },
  {
    "id": "prev",
    "q": "Fate preventivi, mandati e lettere d'incarico e l'onboarding dei nuovi clienti?",
    "moduli": [
      "preventivi",
      "onboarding"
    ]
  },
  {
    "id": "fatt",
    "q": "Volete tenere traccia di cosa fatturare e degli incassi dei compensi?",
    "moduli": [
      "fatturazione",
      "incassi"
    ]
  },
  {
    "id": "compl",
    "q": "Volete gestire l'antiriciclaggio (adeguata verifica e profilo di rischio)?",
    "moduli": [
      "antiriciclaggio"
    ]
  },
  {
    "id": "serv",
    "q": "Offrite ad alcuni clienti ritenute, F24 e bilanci/KPI nel portale (pacchetto avanzato, attivabile cliente per cliente)?",
    "moduli": [
      "servizi"
    ]
  },
  {
    "id": "libri",
    "q": "Tenete i libri sociali dei clienti?",
    "moduli": [
      "libri"
    ]
  },
  {
    "id": "tit",
    "q": "Il titolare vuole una vista d'insieme (cruscotto, carico di lavoro, proroghe, CPB)?",
    "moduli": [
      "cruscotto",
      "carico",
      "cpb"
    ]
  },
  {
    "id": "proc",
    "q": "Volete procedure interne e un archivio password dello studio?",
    "moduli": [
      "procedure",
      "credenziali"
    ]
  }
];
const PROFILI = [
  {
    "id": "essenziale",
    "nome": "Essenziale",
    "desc": "Solo il nucleo: scadenze, adempimenti annuali, clienti e documenti. Ideale per partire.",
    "risposte": []
  },
  {
    "id": "strutturato",
    "nome": "Studio strutturato",
    "desc": "Più collaboratori, calendario e appuntamenti, preventivi e mandati, antiriciclaggio, incassi, ritenute e F24.",
    "risposte": [
      "squadra",
      "cal",
      "prev",
      "fatt",
      "compl",
      "serv"
    ]
  },
  {
    "id": "completo",
    "nome": "Completo",
    "desc": "Tutti i moduli attivi: potrai spegnere in seguito quelli che non servono.",
    "risposte": [
      "squadra",
      "cal",
      "portale",
      "prev",
      "fatt",
      "compl",
      "serv",
      "libri",
      "tit",
      "proc"
    ]
  }
];
module.exports = { MODULI, DOMANDE, PROFILI };
