# Struttura del codice (dalla 1.26)

La pagina non è più un file unico. `gestionale.htm` contiene solo l'HTML; stile e script stanno in file separati nella stessa cartella:

- `gestionale.css` — tutto lo stile.
- `gestionale-NN-nome.js` — lo script, diviso per area. Si caricano **in ordine** (NN) come script classici: condividono lo stesso ambito globale, quindi una funzione definita in un file è visibile negli altri. Un file non deve eseguire codice al caricamento che usi funzioni definite in un file successivo (le dichiarazioni sono sollevate solo dentro lo stesso file).

| File | Contenuto |
|---|---|
| 01-motore | motore scadenze, cataloghi, regole fiscali |
| 02-stato | STATE, salvataggio, sync condiviso, "chi sei", upload, ponte comandi MCP |
| 03-utilita | utilità, ricalcolo anno, mutazioni di base, AML/catalogo/comunicazioni |
| 04-modelli-documento | motore modelli, preventivi, incassi da preventivo, riconciliazione, valutazione AML, importi statutari |
| 05-interfaccia-base | chat, accessi portale, shell/nav, dashboard, Oggi, ricerca globale |
| 06-clienti | clienti, rubrica, scheda cliente, import clienti |
| 07-scadenze | scadenze periodiche, ritenute, 770, adempimenti annuali, onboarding, antiriciclaggio |
| 08-comunicazioni | comunicazioni, ricorrenti, documenti, modelli, procedure |
| 09-incassi-libri | incassi, da fatturare, libri sociali, cruscotto, deontologia, carico, report |
| 10-preventivi-task | preventivi/mandati, F24, chat, soci, task team |
| 11-bilanci | bilanci & KPI, contabilità |
| 12-portale-calendario | portale cliente (anteprima, esterno, area interattiva), calendario, appuntamenti |
| 13-impostazioni | catalogo, impostazioni, aggiornamenti, ngrok, strumenti PDF, credenziali, tariffario |
| 14-dati-esempio | dati demo |
| 15-eventi | gestori eventi (click, change, input...) |
| 16-avvio | export per MCP, annualità, guida, tema, Master, export su window, `init()` |

Server, aggiornamenti automatici, backup e installer trattano questi file come "file di codice" (whitelist `èFileCodice` in `server.js`). Nuovi file: nome `gestionale-NN-nome.js`, referenziati in `gestionale.htm`. I test (`jsdom-test.js`, `test-accesso-lan.js`) ricompongono la pagina da soli. Copia di sicurezza del codice a file unico: tag git `codice-unico-1.25.0` e cartella `6-Riservato-e-Backup/codice-unico-1.25.0`.
