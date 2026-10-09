# Competitor e nuove funzioni per Prisma (ottobre 2026)

Basato su schede di prodotto e recensioni trovate online (fonti in fondo). Dove un sito non si è lasciato leggere (pagine caricate via JavaScript) mi sono basato su recensioni e comparatori: le funzioni elencate sono quelle dichiarate, non provate. Non è una verifica sul campo.

## 1. I 14 prodotti guardati

**Italia**
1. **Scadero**: scadenzario, notifiche push ai clienti, documenti, app clienti (brandizzabile nel piano alto), collaboratori e ruoli, scadenze personalizzate, collegamento a Claude/ChatGPT. Prova gratuita 3 mesi, prezzi su richiesta.
2. **TeamSystem Studio AI**: contabilità, bilanci, dichiarazioni, paghe, antiriciclaggio, "gestione dello studio", collaborazione con i clienti, AI conversazionale, analisi fatture elettroniche, flusso di cassa dei clienti, report scadenze per contribuente.
3. **TeamSystem ViaLibera**: adempimenti fiscali e contabili, modulare, Digital Box (condivisione con i clienti), formazione Euroconference.
4. **Passcom (Passepartout)**: cloud, contabilità/bilanci/dichiarazioni/fatturazione, sito dello studio come canale con i clienti, AI per ripetitività.
5. **Genya Studio (Wolters Kluwer)**: CRM con analisi automatica dei clienti, mandati, pianificazione fatturazione, controllo dei costi generali, **attività extra e redditività per prestazione**, gestione documentale, collaborazione con i clienti.
6. **Zucchetti Ago Infinity**: studio multi-cliente, portale clienti con documenti e accessi profilati, funzioni web per clienti semplici (prime note via web). Solo cloud.

**Estero**
7. **TaxDome**: portale clienti (carica documenti, firma, paga, messaggi), proposte accettabili/firmabili/pagabili in un passaggio, firme elettroniche, fatturazione e tempi, CRM, automazioni (richieste e solleciti), gestione progetti.
8. **Karbon**: email sincronizzata con Gmail/Outlook (un'email diventa un task, si assegna, ha promemoria), modelli di lavoro, bacheche Kanban, dipendenze tra task, lavori ricorrenti, pianificazione del carico.
9. **Financial Cents**: modelli di workflow che si ricreano da soli (lavori ricorrenti, scadenze che scorrono), CRM, portale, richieste documenti, tempi, fatturazione, proposte, capacità del team.
10. **Uku** (Scandinavia): CRM, task, scadenze, chiusura mensile, tempi, fatturazione, portale con marchio dello studio, antiriciclaggio; piano gratuito per singolo professionista, da circa 19 a 88 dollari al mese.
11. **Jetpack Workflow**: cruscotto lavori e scadenze, checklist, automazioni ricorrenti, budget ore/costi, integrazioni (QuickBooks, Gmail, Outlook, Zapier). Report limitati.
12. **Canopy**: portale clienti web e mobile, fatturazione e pagamenti, email integrata, firma elettronica, scansione da cellulare, "avvisi" dell'agenzia fiscale USA con passaggi guidati di risoluzione.
13. **Ignition**: proposte e lettere d'incarico con firma, fatturazione automatica da incarichi (retainer, ricorrenze, tappe), incasso pagamenti.
14. **Xero Practice Manager**: gestione pratiche, tempi e fatturazione, molto legato a Xero.

## 2. Dove Prisma è già alla pari o avanti
- Scadenzario generato dai dati del cliente, **adempimenti a fasi con responsabile** (la maggior parte dei concorrenti esteri ha liste di task generiche, non fasi nate dalla fiscalità italiana).
- Task di team, chat interna, procedure interne, calendario e prenotazione, carico di lavoro e proroghe in blocco, tempi e redditività.
- Portale clienti con documenti, comunicazioni, richieste, ritenute, ravvedimento, PWA con notifiche push.
- Preventivi, mandati, onboarding, antiriciclaggio, libri sociali, incassi e solleciti, cruscotto titolare, bilanci e KPI.
- Claude collegato con approvazione e registro azioni (come Scadero e TeamSystem, ma sui tuoi dati locali).
- Installazione locale e prezzo piatto.

## 3. Cosa manca rispetto ai concorrenti
Ordinate per **utilità per lo studio ÷ sforzo**, tenendo conto che Prisma è locale (niente cloud centrale).

| # | Funzione | Chi la offre | Sforzo | Giudizio |
|---|----------|--------------|--------|----------|
| 1 | **Avvisi e comunicazioni dell'Agenzia** (avvisi bonari, cartelle, comunicazioni di irregolarità): scheda con termini di risposta/pagamento, passaggi guidati e collegamento al ravvedimento | Canopy (versione USA), Passcom/TS in parte | Basso-medio | **Sì, subito.** Molto italiano, nessun concorrente cheap lo fa bene, usa dati e scadenze già presenti |
| 2 | **Modelli di lavoro ricorrenti personalizzati** (checklist che si rigenerano ogni mese/anno, con ruoli e dipendenze) | Financial Cents, Uku, Karbon, Jetpack | Medio | **Sì.** Rende Prisma adatto anche a consulenti del lavoro, CAF, studi associati: scadenze "tue" oltre a quelle fiscali |
| 3 | **Bacheca Kanban** per adempimenti e task | Karbon, Jetpack | Basso | **Sì.** È solo una vista in più e piace molto |
| 4 | **Calendario sincronizzato** (feed ICS verso Google/Outlook/telefono) | Quasi tutti | Basso | **Sì.** Facile con un link di sola lettura |
| 5 | **Tariffario/listino prestazioni e parcellazione** (da mandato e ore a bozza di parcella, controllo redditività) | Genya, TS (parcellazione, tariffa), Ignition | Medio | **Sì**, come "bozza parcella" da esportare: niente fattura elettronica |
| 6 | **Privacy/GDPR dello studio** (registro trattamenti, informative e nomine ai fornitori, registro violazioni) | TS (Privacy e GDPR) | Medio | **Sì.** Nello spirito "obblighi dello studio", utile anche a te per il discorso sul modello locale |
| 7 | **Firma elettronica** di mandati e preventivi nel portale | TaxDome, Canopy, Ignition, TS | Medio-alto | **Dopo.** Meglio integrare un provider che costruire: valutare firma semplice con OTP + traccia nel registro |
| 8 | **Email che diventa task/comunicazione** | Karbon | Alto | **Dopo.** Utile ma richiede collegamento a Gmail/Outlook (già in lista #59) |
| 9 | **Questionari/moduli per i clienti** (es. dati per 730, scheda aziendale annuale) | TaxDome (organizers) | Medio | **Valuta.** Estende la raccolta documenti già presente |
| 10 | **Pipeline commerciale** dei potenziali clienti (kanban: contatto, preventivo, accettato) | TaxDome, Genya (CRM) | Basso-medio | **Valuta.** Si appoggia ai preventivi già esistenti |
| 11 | **Portale con logo e colori dello studio** | Scadero (app brandizzata), Uku | Basso | **Sì, facile.** Il portale ha già icona e PWA |
| 12 | **Pagamenti online** (carta/bonifico dal portale) | TaxDome, Ignition, Canopy | Alto | **No per ora.** Richiede un intermediario e va contro il modello locale |
| 13 | **Analisi fatture elettroniche e cassa dei clienti** | TS Studio | Alto | **No, o molto più avanti.** Entra nel campo della contabilità |
| 14 | **Paghe e personale** | TS, Zucchetti | Molto alto | **No.** Altro mestiere. Si può servire il consulente del lavoro con scadenze e modelli (punto 2) |
| 15 | **Contenuti e formazione** (news, corsi) | Euroconference | Non applicabile | **No** (contenuti con licenza). Resta solo il registro formazione (FPC) se serve |

## 4. È una buona idea aggiungere funzioni? Sì, a tre condizioni
1. **Ogni funzione nasce come modulo spento di default.** Hai già i moduli attivabili e il questionario di primo avvio. Il rischio confusione che citi si risolve con **profili preimpostati**: "Studio piccolo", "Studio strutturato", "Consulente del lavoro / CAF" che accendono i moduli giusti. La guida "?" per ogni tab c'è già.
2. **Catalogo moduli visibile al master** (Impostazioni > Moduli): una riga per modulo con "cosa fa" e anteprima, così il cliente scopre cosa può accendere senza dover leggere manuali.
3. **Una funzione alla volta, con test, e con un solo sviluppatore che deve anche fare assistenza.** Ogni funzione in più è assistenza in più. Meglio 4 funzioni solide che 12 a metà: nelle recensioni i prodotti "completi" ma superficiali vengono criticati sui report e sul supporto.

## 5. Ordine di lavoro che propongo
**Fase 1 (settimane, pochi rischi):** bacheca Kanban, calendario ICS, portale con logo/colori, profili preimpostati e catalogo moduli.
**Fase 2:** avvisi e comunicazioni dell'Agenzia; modelli di lavoro ricorrenti personalizzati.
**Fase 3:** tariffario e bozza parcella; privacy/GDPR dello studio.
**Fase 4:** firma elettronica, email come task, questionari clienti, pipeline commerciale.
Lasciare fuori: pagamenti online, paghe, analisi fatture XML, contenuti formativi.

## Fonti
- Scadero: https://www.scadero.it/ , https://www.scadero.it/prezzi/
- TeamSystem Studio AI: https://www.teamsystem.com/commercialisti/teamsystem-studio/
- TeamSystem ViaLibera: https://www.teamsystem.com/commercialisti/teamsystem-vialibera/
- Passcom e Genya: https://www.lineaedp.it/featured/genya-studio-di-wolters-kluwer-gestisce-gli-studi-commercialisti , https://passepartout.net/Resources/Asset/Documenti/Prodotti/Brochure/brochure-passcom-2026.pdf
- Zucchetti Ago Infinity: https://www.01net.it/?p=139720
- TaxDome: https://thecfoclub.com/it/tools/recensione-taxdome/
- Karbon: https://karbonhq.com/lp/accounting-firm-management
- Financial Cents: https://getuku.com/articles/financial-cents-review/
- Uku: https://getuku.com/accounting-practice-management-software/
- Jetpack Workflow e Canopy: https://www.getapp.co.uk/compare/106437/110905/canopy-tax/vs/jetpack-workflow
- Ignition: https://www.ignitionapp.com/product/engagement-letters
- Canopy (avvisi IRS): https://www.cpapracticeadvisor.com/2020/12/10/new-features-in-canopy-notices-empower-quick-and-easy-irs-notice-resolution/41690/
