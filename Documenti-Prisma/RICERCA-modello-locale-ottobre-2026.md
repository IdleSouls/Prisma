# Il modello "Prisma installato in locale" regge? (ricerca ottobre 2026)

Non è un parere legale né una certificazione di sicurezza. Fonti in fondo.

## 1. Ha senso commerciale?
- **Sì, come nicchia.** I grandi (TeamSystem, Zucchetti, Passepartout) spingono il cloud con l'argomento "backup automatici, disaster recovery, accessi centralizzati". Ma le stesse fonti ammettono che il cloud *non è per forza più sicuro* di un sistema locale: dipende da come è fatto e gestito.
- **Il tuo punto di forza è reale**: nessun archivio centrale con i dati di migliaia di studi (un solo bersaglio per un attaccante), nessun dato in mano a un fornitore (meno obblighi da responsabile del trattamento per te), prezzo basso.
- **Il punto debole è altrettanto reale**: la sicurezza passa dal PC dello studio. Se il PC non ha backup o prende un ransomware, lo studio si ferma. Per questo i backup automatici e la copia esterna (già in Prisma) sono la parte più importante da spiegare ai clienti.
- **Scadero** (concorrente diretto) è cloud, dichiara server in UE, AES-256, GDPR, backup giornalieri e prova gratuita di 3 mesi. Il tuo messaggio "i dati restano da voi" è diverso e valido, ma va accompagnato da una guida sui backup.

## 2. GDPR (lato studio e lato te)
- Chi installa Prisma resta titolare dei dati e **deve dimostrare misure di sicurezza adeguate** (accountability). Prisma aiuta, ma non lo solleva dall'obbligo.
- Un fornitore cloud va nominato **responsabile del trattamento (art. 28)** con contratto. Con l'installazione locale questo passaggio non c'è, finché **non hai accesso ai dati**. Se un domani fai assistenza collegandoti al PC dello studio, o conservi loro dati, diventi responsabile: serve un contratto. Da chiarire con un consulente privacy prima di vendere.
- ngrok e Cloudflare, se usati per il portale clienti, vedono il traffico che passa. Sono sub-fornitori *dello studio*, ma conviene dirlo nell'informativa e nei termini.

## 3. Le porte aperte: il vero rischio
Il codice di Prisma è solido sui punti già controllati (login con blocco dopo 5 errori, controllo Origin e Host, limite di richieste sulla porta esterna, aggiornamenti firmati, licenza firmata). Restano rischi da gestire, in ordine di importanza:
1. **ngrok free non è pensato per produzione/clienti.** Fonti: 1 GB di traffico/mese, 20.000 richieste/mese, avviso mostrato ai visitatori, un solo dominio assegnato e non scelto da te; alcune fonti riportano anche sessioni a 2 ore dal 2026 (da verificare sul sito ngrok, non l'ho trovato in modo certo). Un cliente che trova una pagina di avviso si insospettisce, e con 30-50 clienti le richieste finiscono presto.
2. **Password deboli o riusate** (la porta collaboratori dà accesso a tutto lo studio). Rimedio: password lunga obbligatoria + autenticazione a due fattori (da fare in Prisma).
3. **Windows non aggiornato, antivirus assente, backup solo sul PC stesso.** Rimedio: checklist nella procedura guidata (da estendere).
4. **PC acceso e raggiungibile**: il portale clienti dipende da lui. Va detto chiaramente.

## 4. Alternative a ngrok (da valutare, non ancora implementato)
- **Cloudflare Tunnel**: gratuito, richiede un **dominio proprio** (circa 10 €/anno) con DNS su Cloudflare; si installa come servizio Windows; con **Cloudflare Access** (gratis fino a 50 utenti) si può proteggere l'accesso dei collaboratori con verifica a due fattori. Più solido di ngrok free, ma l'installazione è più tecnica.
- **ngrok a pagamento**: dominio fisso e senza avviso; costo per ogni studio, quindi non più "gratis per i clienti".
- **Tailscale**: ottimo per i **collaboratori** (rete privata, nessuna porta pubblica), ma il piano gratuito è per uso non commerciale (da verificare), e non risolve il portale **clienti**, che devono entrare da internet.
- **Consiglio**: collaboratori su rete privata o Cloudflare Access, portale clienti su Cloudflare Tunnel con dominio dello studio. È sviluppo e test da fare dopo i primi studi pilota.

## 5. Cosa c'è in Prisma ora
- **Procedura guidata** in Impostazioni > Accesso esterno ("Procedura guidata"): 5 passi, controlla se LibreOffice e ngrok sono installati, salva il token ngrok senza terminale, avvia il tunnel e mostra l'indirizzo. Funziona con ngrok perché è quello che Prisma usa oggi. Include l'avviso onesto sui limiti del piano gratuito.

## 6. Prima di vendere (in ordine)
1. Test con 1-2 studi amici (non a pagamento) per vedere dove si bloccano.
2. Decidere se passare a Cloudflare Tunnel prima di aprire il portale a molti clienti.
3. Autenticazione a due fattori per i collaboratori da remoto.
4. Informativa privacy, termini di licenza e (se fai assistenza) nomina a responsabile: da far rivedere a un professionista della privacy.
5. Guida breve "backup in 3 mosse" consegnata a ogni studio.

## Fonti
- ngrok, limiti piano gratuito: https://ngrok.com/docs/pricing-limits/free-plan-limits
- ngrok, licenze: https://ngrok.com/docs/guides/licensing/
- Confronto Cloudflare Tunnel / ngrok: https://themenonlab.blog/blog/ngrok-vs-nport-vs-cloudflare-tunnels-comparison
- Cloudflare Tunnel come servizio Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/tunnel-guide/local/as-a-service/windows
- Tailscale piani: https://tailscale.com/pricing/faq
- GDPR e studi commercialisti: https://optlyx.com/guida-gdpr-privacy-studio-commercialista
- Cloud vs locale per gli studi: https://www.teamsystem.com/magazine/gestione-dello-studio/software-cloud-tutti-vantaggi/
- Minacce informatiche agli studi: https://www.teamsystem.com/magazine/gestione-dello-studio/principali-minacce-informatiche-studi-commercialisti/
- Scadero (sito e prezzi): https://www.scadero.it/ , https://www.scadero.it/prezzi/
