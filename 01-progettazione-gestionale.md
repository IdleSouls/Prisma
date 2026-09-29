# Gestionale Studio — Progettazione

Data: 02/09/2026
Fonti: script Apps Script "Adempimenti contabili 2026", analisi Scadero (trial), analisi La Tavola (uso reale, 152 clienti)

## 1. Obiettivo e scope

Due livelli, non confonderli:

- **v1 — prototipo HTML per lo studio**: un file `.htm` autonomo (come quello perso), uso interno, dati salvati in `localStorage` del browser. Sostituisce/affianca il foglio Google Sheets. Nessun backend, nessun multi-utente reale (il "responsabile" è solo un'etichetta sulle scadenze, non un login separato).
- **v2 — prodotto SaaS vendibile**: multi-tenant, multi-utente con permessi veri, portale/app cliente, integrazioni. Non è oggetto di questa fase, ma il modello dati sotto è pensato per non dover essere riscritto quando si passa a v2 (stesse entità, in v1 vivono in localStorage, in v2 in un DB vero dietro API).

Questo documento copre il modello dati e l'architettura del **v1**.

## 2. Cosa unisce, da dove

| Elemento | Fonte | Nota |
|---|---|---|
| Motore scadenze periodiche (IVA, INPS, ritenute con cumulo soglia, IMU, Intrastat, bollo FE) | Script Apps Script di Matteo | Il pezzo più maturo delle tre fonti, va portato quasi 1:1 |
| Adempimenti annuali con sotto-task (es. Vidimazione libri → Predisposizione F24 → Invio F24) | La Tavola | Pattern a checklist, mancava nello script |
| Checklist onboarding cliente (documenti, antiriciclaggio, deleghe AdE/INPS) | La Tavola | Assente sia nello script che in Scadero |
| Pannello di controllo (scaduti/in scadenza/futuri/completati) | Script Apps Script | Confermato buon pattern anche da Scadero (dashboard KPI simili) |
| Filtri per responsabile/stato/regime/cliente | Tutte e tre | Standard, da avere ovunque |
| Comunicazioni, documenti, app cliente, AI/MCP | Scadero | Fuori scope v1, note per v2 |

## 3. Modello dati (v1, entità JS / localStorage)

### 3.1 Studio
Un solo oggetto (v1 è mono-studio).
```
{
  nome: string,
  responsabili: string[]   // es. ["Matteo", "Sabrina"] — semplice elenco, non utenti veri
}
```

### 3.2 Cliente
Unisce "Anagrafica clienti" (script) + "Dati Ditta" (Scadero) + "Anagrafica" (La Tavola).
```
{
  id: uuid,
  tipo: "società" | "ditta_individuale" | "persona_fisica",
  ragioneSociale: string,
  codiceFiscale: string,
  partitaIva: string,
  ateco: string,
  naturaGiuridica: string,           // opzionale
  regimeFiscale: "Ordinario" | "Semplificato" | "Forfettario" | "Minimi" | "Ente non commerciale" | "Altro",
  contatti: { emailPrincipale, emailAmministrazione, telefono, indirizzo, cap, localita, provincia },
  responsabileStudio: string,        // FK verso studio.responsabili
  addebitoF24: "NOI" | "CLIENTE" | "NOI/CLIENTE",
  contabilita: "INTERNA" | "ESTERNA",
  stato: "attivo" | "cessato",

  // flag fiscali — pilotano la generazione delle scadenze periodiche (dal motore)
  flags: {
    periodicitaIva: "Mensile" | "Trimestrale" | "N.A.",
    periodicitaIntrastat: "Mensile" | "Trimestrale" | "N.A.",
    previdenza: "Artigiani/Commercianti" | "Gestione Separata" | "Cassa Privata" | "No previdenza",
    lipe: bool, bolloFattElett: bool, dichiarazioneIva: bool, inail: bool,
    fattureEstere: bool, vidimazione: bool, dirittoCamerale: bool, oss: bool, imu: bool, paghe: bool,
  },
  dirittoCameraleScelta: "30/06 (ordinaria)" | "20/07 (1ª proroga)" | "20/08 (2ª proroga)" | null,

  // adempimenti annuali applicabili (dalla Tavola) — quali dei tipi "grossi" si applicano
  adempimentiAnnualiApplicabili: string[],  // es. ["Dichiarazione IVA", "CU", "Bilancio/Verbale assemblea", ...]

  note: string,
  creatoIl: date
}
```

### 3.3 Socio (per società)
```
{
  id: uuid,
  clienteId: uuid,          // FK
  nome: string,
  codiceFiscale: string,
  ruolo: string,            // es. "Amministratore", "Socio"
  previdenza: string,       // stessa logica del cliente, per obblighi personali (INPS artigiani, gestione separata)
  contatti: {...}
}
```

### 3.4 TipoAdempimento (catalogo, statico/configurabile)
Due famiglie, stesso schema:
```
{
  chiave: string,           // es. "IVA_MENSILE", "DICHIARAZIONE_IVA"
  nome: string,
  famiglia: "periodico" | "annuale" | "personalizzato",
  flagAnagrafica: string | null,   // quale flag del cliente attiva questo adempimento (famiglia periodico)
  dateGenerazione: [{mese, giorno, notaTemplate}] | null,  // per i periodici, calendario fisso
  sottoAdempimenti: [{chiave, nome, ordine}] | []          // per gli annuali, checklist (es. Predisposizione F24, Invio F24)
}
```
Catalogo iniziale periodico: IVA mensile/trimestrale, INPS artigiani/commercianti (minimale+eccedente), INPS gestione separata, LIPE, Bollo FE, Dichiarazione IVA, INAIL, Fatture estere, Vidimazione, Diritto camerale (3 date alternative), OSS, IMU, Intrastat mensile/trimestrale, Ritenuta d'acconto (con cumulo soglia), Registrazione/rinnovo contratti affitto.
Catalogo iniziale annuale: Dichiarazione IVA annuale, CU, 770, Diritto camerale, Bilancio/Verbale assemblea, Dichiarazione redditi (forfettari/semplificati/ordinari), Tassa vidimazione libri sociali.

### 3.5 Scadenza (istanza generata)
```
{
  id: uuid,
  clienteId: uuid,
  tipoAdempimentoChiave: string,
  data: date,
  responsabile: string,
  stato: "Da fare" | "Calcolato" | "Inviato telematicamente" | "Comunicato al cliente" | "Errore" | "Non applicabile",
  nota: string,
  dataCompletamento: date | null,
  sottoScadenze: [{ chiave, nome, completato: bool, data: date|null, responsabile: string }]  // solo per annuali con sotto-adempimenti
}
```
Generazione: per i periodici, uguale allo script (incrocio flag cliente × calendario fisso). Per gli annuali, una riga per cliente per anno per ogni tipo in `adempimentiAnnualiApplicabili`, con le sotto-scadenze precompilate dal template.

Caso speciale **Ritenute autonomi**: tabella satellite separata (come nello script) — righe di fattura/pagamento che generano scadenze F24 aggregate per cliente con cumulo sotto soglia (100€/mese, mai oltre dicembre, proroga 20/08).

### 3.6 OnboardingChecklist (per cliente, da La Tavola)
```
{
  clienteId: uuid,
  voci: [
    { categoria: "Documenti contrattuali", nome: "Mandato e preventivo firmati", completato: bool },
    { categoria: "Documenti anagrafici", nome: "Carta d'identità ricevuta", completato: bool },
    { categoria: "Documenti anagrafici", nome: "Codice fiscale ricevuto", completato: bool },
    { categoria: "Documenti anagrafici", nome: "Visura camerale ricevuta", completato: bool },
    { categoria: "Antiriciclaggio", nome: "Questionario predisposto", completato: bool },
    { categoria: "Deleghe", nome: "Delega fatture e corrispettivi", completato: bool },
    { categoria: "Deleghe", nome: "Delega cassetto fiscale", completato: bool },
    { categoria: "Deleghe", nome: "Delega cassetto previdenziale", completato: bool }
  ]
}
```
Percentuale = voci completate / totale voci. Lista fissa in v1 (non personalizzabile per cliente).

## 4. Moduli funzionali v1 (in ordine di build)

1. **Anagrafica clienti** — CRUD, form con i flag fiscali, import/export JSON (no Excel bulk in v1).
2. **Motore scadenze periodiche** — porta la logica dello script (generazione, cumulo ritenute, diritto camerale a scelta, IMU, affitti).
3. **Adempimenti annuali con sotto-task** — vista per cliente e vista aggregata per tipo, checkbox sui sotto-adempimenti.
4. **Pannello di controllo** — KPI (scaduti/in scadenza 30gg/futuri/completati) + liste filtrabili per responsabile/stato/cliente/tipo.
5. **Onboarding cliente** — checklist con percentuale, per nuovi clienti.
6. **Calendario mensile** — vista alternativa alle liste, stile Scadero.

Fuori scope v1 (annotati per v2): comunicazioni ai clienti, documenti/upload, app/portale cliente, multi-utente con permessi reali, integrazione AI/MCP, fatturazione abbonamento.

## 5. Architettura tecnica v1

- **Un solo file HTML** (come richiesto), HTML+CSS+JS inline, nessuna dipendenza esterna che richieda internet (deve funzionare offline aprendo il file).
- **Persistenza**: `localStorage`, chiave unica con tutto lo stato serializzato JSON (clienti, soci, scadenze, onboarding, ritenute). Pulsante "Esporta backup JSON" / "Importa backup JSON" per non perdere tutto se si cambia browser o si cancella la cache — **lezione imparata da come abbiamo perso la chat precedente**.
- **Motore di generazione**: rieseguito a ogni apertura/modifica anagrafica (equivalente del bottone "Aggiorna tutto" dello script), ricalcola le scadenze periodiche mantenendo stato/note già inseriti (stessa logica di merge dello script: chiave data+cliente+adempimento).
- **Struttura file**: un unico HTML ma organizzato internamente in sezioni chiare (dati/catalogo, motore, rendering, UI) per restare leggibile anche a migliaia di righe.

## 6. Prossimo passo

Task #5: costruire l'HTML seguendo questo modello. Propongo di partire da Anagrafica + Motore scadenze periodiche + Pannello di controllo (il cuore, equivalente diretto del tuo script), poi aggiungere Adempimenti annuali e Onboarding.
