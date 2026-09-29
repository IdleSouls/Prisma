# Gestionale MCP server (locale, lettura + scrittura)

Server MCP che gira sul tuo PC e permette a Claude Desktop/Cowork di leggere e, quando il
gestionale è aperto nel browser, anche scrivere nei dati dello studio (scadenze, clienti,
contabilità, task) senza che tu debba copiare/incollare nulla.

**Come sono divisi lettura e scrittura**: la lettura passa sempre da un file JSON
(`gestionale-mcp.json`) che l'app HTML esporta/aggiorna già con tutti i calcoli fatti — il server
MCP non ricalcola mai nulla. La scrittura invece NON tocca mai quel file né duplica la logica di
creazione/validazione: manda il comando a `server.js` (il server di rete studio), che lo inoltra al
browser con il gestionale aperto in quel momento, ed è lì — e solo lì — che vive la funzione reale
che lo esegue con le stesse regole di un click sul form. Se il gestionale non è aperto, la
scrittura fallisce con un errore chiaro; la lettura resta comunque disponibile dall'ultimo dato
disponibile, a prescindere.

## Lettura: come tenere aggiornato `gestionale-mcp.json`

Due modi, possono convivere:

**In tempo reale (quando `server.js` è acceso):** se apri il gestionale dall'indirizzo del server
(es. `http://localhost:8420`, non con doppio click sul file), ad ogni salvataggio il browser manda
la vista aggiornata al server, che la scrive da solo qui dentro. Non devi fare nulla: basta
lavorare normalmente nel gestionale con quel server acceso.

**Export manuale (sempre disponibile, unico modo se non usi `server.js`):**

1. Nel gestionale: **Impostazioni → "Vista per MCP locale" → "Esporta per MCP (JSON)"**.
2. Sposta/sovrascrivi il file scaricato in questa cartella (`mcp-server/gestionale-mcp.json`).
3. Ripeti ogni volta che vuoi dati aggiornati.

Il server rilegge il file ad ogni domanda di lettura — non serve mai riavviarlo per questo. Lo
strumento `stato_generale` segnala se il file risulta vecchio di 3 giorni o più.

## Scrittura: cosa serve perché funzioni

1. `server.js` deve essere acceso (`node server.js` nella cartella principale, o il collegamento
   "Avvia Gestionale").
2. Il gestionale deve essere aperto in un browser dall'indirizzo del server (es.
   `http://localhost:8420`), non come file locale.
3. Solo allora i tool di scrittura funzionano — altrimenti tornano un errore che lo spiega, senza
   scrivere nulla alla cieca.

Ogni operazione di scrittura, se riesce, fa comparire un avviso nell'app ("🤖 Claude ha
eseguito: ...") così è sempre visibile cosa è stato fatto in automatico, esattamente come una
modifica fatta a mano. I tool che **eliminano** qualcosa richiedono un parametro `conferma: true`
esplicito nella stessa chiamata: prima di usarli, Claude mostra sempre a te in chat cosa sta per
cancellare e aspetta una tua conferma nella conversazione.

## Installazione

Serve Node.js 18 o superiore installato sul PC.

```bash
cd mcp-server
npm install
```

## Collegarlo a Claude Desktop / Cowork

Nel file di configurazione MCP di Claude Desktop, aggiungi:

```json
{
  "mcpServers": {
    "gestionale-studio": {
      "command": "node",
      "args": ["/percorso/completo/a/mcp-server/server.js"]
    }
  }
}
```

Sostituisci `/percorso/completo/a/` con il percorso reale sul tuo PC. Riavvia Claude Desktop dopo
aver modificato il file — e ogni volta che questi file (`tools.js`/`server.js`) vengono aggiornati,
perché il processo MCP li carica una sola volta all'avvio e non si aggiorna da solo.

Variabili d'ambiente opzionali (via `"env"` nella configurazione sopra):

- `GESTIONALE_MCP_FILE` — percorso diverso per `gestionale-mcp.json`, se non è in questa cartella.
- `GESTIONALE_SERVER_URL` — indirizzo di `server.js` per la scrittura, se diverso dal default
  `http://localhost:8420` (es. porta cambiata, o server su un altro PC della rete studio).

## Tool esposti

**Lettura** (sempre disponibile, dall'ultimo dato esportato/sincronizzato):

- **stato_generale** — riepilogo: clienti attivi/cessati, scadenze per stato, task aperti.
- **elenco_clienti** — elenco clienti, filtro per testo e per stato.
- **scheda_cliente** — dettaglio 360° di un cliente (id o ragione sociale, anche parziale).
- **scadenze** — elenco scadenze, filtri per categoria/cliente/responsabile e per data (data esatta,
  oppure dataDa/dataA per un intervallo) — es. "che scadenze ho il 30 settembre".
- **adempimenti_annuali** — elenco con percentuale di avanzamento, filtro cliente/incompleti.
- **task_aperti** — task team non completati, filtro assegnatario/cliente.
- **comunicazioni_recenti** — ultime comunicazioni inviate, filtro per cliente.
- **elenco_preventivi** — preventivi/mandati generati (senza il testo integrale), filtro per
  cliente/stato/categoria.
- **catalogo_studio** — tariffario attività (nome/prezzo/se richiede mandato) e modelli documento
  attivi disponibili: i dati necessari per creare un preventivo con crea_preventivo.

**Scrittura** (richiede server.js acceso + gestionale aperto dal browser, vedi sopra):

- **crea_cliente / modifica_cliente / elimina_cliente**
- **crea_task / modifica_task / elimina_task**
- **crea_comunicazione / modifica_comunicazione / elimina_comunicazione**
- **crea_socio / modifica_socio / elimina_socio**
- **crea_f24 / modifica_f24 / elimina_f24**
- **crea_preventivo / modifica_preventivo / elimina_preventivo** — crea_preventivo risolve il testo
  da un modello esistente (vedi catalogo_studio per modelloId) e può collegare attività a listino
  (attivitaIds), calcolando l'importo dalla somma dei prezzi se non indicato esplicitamente.
- **modifica_scadenza** — aggiorna stato/importo/responsabile/nota di una scadenza periodica
  esistente (le scadenze si generano da sole dal catalogo, qui si aggiornano soltanto).
- **aggiorna_step_controllo** — segna completato/da fare uno step (Calcolato/Comunicato al
  cliente/Versamento predisposto/Inviato) di una scadenza.
- **aggiorna_sotto_adempimento** — stato di avanzamento di un sotto-adempimento annuale.

I tool `modifica_*` accettano un parametro `patch`: un oggetto con SOLO i campi da cambiare (viene
fatto un merge, non una sostituzione del record intero).

## Test

```bash
npm install
node test-server.mjs   # tool di lettura contro gestionale-mcp.json di esempio; tool di scrittura
                        # contro un finto server.js in-process (verifica comando inviato, gestione
                        # errori, e che elimina_* rifiuti senza conferma:true prima di ogni rete)
node test-stdio.mjs    # avvia il vero server.js come processo separato e verifica che risponda
```

Il ponte di scrittura vero e proprio (server.js: coda comandi, invio via SSE, attesa risposta) e il
dispatcher lato browser (gestionale.htm: `eseguiComandoMCP`, che chiama le stesse funzioni del
form) hanno le loro verifiche nella suite principale (`jsdom-test.js`, cartella principale) e in
una verifica live manuale del bridge HTTP reale.

## Perché la scrittura funziona solo con server.js acceso

La logica di creazione/validazione (cosa rende valido un cliente, come si assegnano gli
adempimenti applicabili...) vive SOLO in `gestionale.htm`, per scelta esplicita: non va mai
duplicata altrove, altrimenti rischia di divergere dal comportamento reale dell'app. Senza un
browser con il gestionale aperto non c'è nessun posto sicuro dove eseguire una scrittura, quindi il
tool fallisce chiaramente invece di provare a scrivere direttamente sui dati con una logica
riscritta a parte in Node (che rischierebbe di creare clienti/scadenze incoerenti con quello che
l'app si aspetta).
