# Prisma — scopo, posizionamento e disciplina del perimetro (ottobre 2026)

## 1. Una frase che deve reggere tutto

> **Prisma è il cruscotto operativo dello studio commercialista: dice a chi lavora e a chi dirige *cosa va fatto, da chi, entro quando e a che punto siamo* — per ogni cliente e per ogni adempimento.**

Non tiene la contabilità, non emette fatture, non sostituisce il giudizio del professionista, non è un CRM né uno strumento di consulenza al cliente. Si affianca al gestionale contabile (Teamsystem, Zucchetti, Passepartout, ecc.) e al software di fatturazione che lo studio già usa.

Il test per ogni funzione, presente o futura: **«aiuta a non dimenticare, a coordinarsi o a vedere lo stato di una cosa che lo studio *deve* fare?»** Se la risposta è no, non entra.

## 2. A chi serve e quale problema risolve

| Chi | Problema oggi | Cosa fa Prisma |
|---|---|---|
| Collaboratore / consulente | Troppe scadenze su fogli e testa; non sa se può partire su una fase | "Il mio lavoro": scadenze urgenti, fasi pronte per me, task |
| Segreteria | Fatture extra dimenticate, preventivi/onboarding a mano, solleciti | Da fatturare, preventivi→cliente, incassi e solleciti |
| Titolare | Nessuna vista d'insieme: portafoglio, nuovi/cessati, avanzamento bilanci | Cruscotto titolare, carico di lavoro, proroghe |
| Studio come impresa | Obblighi deontologici/privacy sparsi | Check-list incarico, registro IA, FPC, riservatezza |
| Cliente | Chiede "a che punto siamo?" | Portale con scadenze, documenti, comunicazioni |

**Valore dichiarabile in una riga:** meno dimenticanze, meno passaggi di consegne persi, titolare che vede tutto senza chiedere.

## 3. Mappa delle funzioni per "distanza dal nucleo"

**Nucleo (è Prisma — qui si investe):** clienti (con cessazione, contabilità da terzi, tipo rapporto), scadenze periodiche e adempimenti annuali a fasi con responsabile (SAL), proroghe, carico di lavoro, task team, "Il mio lavoro", Cruscotto titolare, Onboarding, Documenti.

**Supporto diretto al nucleo (utile se resta leggero):** preventivi→accettazione→cliente, attività da fatturare, incassi/solleciti, comunicazioni e portale cliente, antiriciclaggio, F24 e ritenute, calendario/appuntamenti, modelli documenti, procedure interne.

**Compliance dello studio (differenziante, ma da tenere sobria):** deontologia (check-list incarico, registro IA, FPC, riservatezza), privacy/sicurezza, libri sociali, tracker CPB.

**Periferia (la prima da potare o nascondere):** Chat interna (se lo studio ha già WhatsApp/Teams), Strumenti file (convertitore/unisci PDF: non c'entra con l'organizzazione), Bilanci & KPI (consulenza al cliente: unica area "analitica" rimasta), Contabilità (già sospesa), Rubrica (duplica Clienti/Soci).

Voci di menu oggi: 36 in 7 gruppi. Per un nuovo utente sono troppe: è il sintomo di perimetro che cresce.

## 4. Dove Prisma si posiziona (e dove no)

- **Contro i gestionali di studio** (modulo "studio" dei grandi software: mandati, timesheet, fatturazione a forfait, agenda): fanno più cose ma sono pesanti, richiedono inserimento costante e spesso non dicono *a che punto è la pratica*. Prisma vince su **leggerezza e visibilità sullo stato**, perde su integrazione con contabilità/fatturazione. *(Valutazione basata sulla ricerca di ottobre; non ho verificato i listini aggiornati.)*
- **Contro i tool di sole scadenze:** Prisma aggiunge fasi, responsabili, passaggio di consegne e cruscotto titolare.
- **Contro fogli Excel + calendario:** è il vero concorrente. Prisma deve essere *meno faticoso* di Excel: zero doppio inserimento.
- **Non compete su:** contabilità, fatturazione elettronica, dichiarativi, paghe, firma digitale, consulenza finanziaria/budget.

**Messaggio di vendita ad altri studi:** *"Sai sempre cosa scade, chi ci lavora e a che punto è — senza timesheet e senza cambiare gestionale. Installato in locale, i tuoi dati restano tuoi."*

Punti di forza reali: installazione locale per studio (privacy come argomento di vendita), MCP/Claude come assistente operativo con registro e conferma, aderenza ai processi italiani (adempimenti, cessazione a metà anno, contabilità da terzi, CPB).

## 5. Rischi di perimetro (onestà)

1. **Deriva da "suite per studi":** ogni idea sembra ragionevole, ma 36 voci + 64 tool MCP fanno uno strumento che nessuno padroneggia. Il budget/previsione di cassa che hai scartato è stato un buon esempio di disciplina.
2. **Doppio inserimento:** oggi preventivi, incassi e attività da fatturare vivono accanto al software di fatturazione dello studio. Se diventano un secondo gestionale, nessuno li aggiorna. Vanno tenuti come *promemoria*, non come contabilità.
3. **Dati che invecchiano:** CPB, FPC, equo compenso, soglie dipendono da norme che cambiano. Qualunque soglia codificata va marcata "da verificare" (già fatto) o resa configurabile.
4. **Portale cliente + IA:** sono i punti di maggiore responsabilità (privacy, deontologia). Meglio pochi comportamenti ben fatti.
5. **Test solo simulati:** tutto è verificato con test automatici, ma poco con persone reali. La prossima fase di valore è l'uso quotidiano, non altre funzioni.

## 6. Regole proposte per non perdersi

1. **Congelare le nuove funzioni** per 2-3 mesi: solo bug, semplificazioni e feedback d'uso reale (tuo, di Federico, della segreteria).
2. **Ogni funzione nuova deve** (a) rispondere al test della sezione 1, (b) non richiedere inserimenti ricorrenti manuali, (c) sostituire qualcosa o stare in un modulo disattivabile.
3. **Regola del "tre studi":** una funzione resta solo se almeno tre studi diversi la userebbero ogni mese. Altrimenti è una personalizzazione, non prodotto.
4. **Menu a livelli:** il nuovo utente vede ~10 voci (Il mio lavoro, Cruscotto, Clienti, Scadenze, Adempimenti, Task, Documenti, Comunicazioni, Preventivi, Impostazioni); il resto si attiva dai moduli. Preset per tipo di studio (piccolo / medio con segreteria).
5. **Potatura candidata:** Chat interna (opzionale), Strumenti file (fuori scopo), Rubrica (assorbita da Clienti), Bilanci & KPI (modulo facoltativo, lontano dal nucleo), voce "Azioni" (la ricerca Ctrl+K basta). Nulla va cancellato subito: prima disattivato di default.
6. **Metriche d'uso reale** (anche solo manuali): scadenze chiuse in Prisma vs. fuori; adempimenti con fasi usate; task creati/chiusi; accessi per utente a settimana. Se una sezione non viene aperta in un mese, è candidata alla potatura.

## 7. Prossimi passi consigliati (nell'ordine)

1. **Usarlo davvero per 4 settimane** nel tuo studio con dati reali di 20-30 clienti; annotare attriti.
2. **Preset di menu semplificato** + disattivazione di default delle sezioni periferiche.
3. **Una pagina di onboarding per studio nuovo:** import clienti, scelta adempimenti, responsabili, moduli — in meno di un'ora.
4. **Stabilità e vendita:** aggiornamenti sicuri, backup verificato, documento privacy per i clienti (già avviato), prezzo e modello di assistenza.
5. Riprendere le funzioni nuove solo dalla lista di richieste *ripetute* dagli utenti.
