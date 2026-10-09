# Collegare ChatGPT, Gemini e altre IA a Prisma

Prisma parla il protocollo **MCP**, lo standard che le principali IA usano per collegarsi a strumenti esterni. Claude Desktop si collega con il file `Prisma.mcpb` (guida già esistente). Per **tutte le altre IA** c'è un endpoint HTTP, che espone **gli stessi 64 strumenti** di Claude: stesse regole, stesso registro delle azioni, stessa conferma dentro Prisma (Impostazioni → Avanzate → "Azioni di Claude").

## Come funziona (da leggere una volta)

- Prisma resta sul PC dello studio. Insieme a Prisma parte un secondo piccolo server (porta **8423**, solo su questo PC) che parla MCP via HTTP.
- È protetto da una **chiave segreta** (file `mcp-server/token-ia.txt`, creato da solo, mai nel repository). Senza chiave non risponde.
- Le IA **sul PC** (Gemini CLI, Cursor, VS Code…) si collegano direttamente a `http://127.0.0.1:8423/mcp`.
- Le IA **online** (ChatGPT, Gemini web, Mistral, Perplexity…) non possono raggiungere un PC di studio: serve un **indirizzo https pubblico**, che si ottiene con un tunnel (ngrok o Cloudflare Tunnel) verso la porta 8423.
- In Prisma: **Impostazioni → Avanzate → "Collega altre IA" → Mostra i dati di collegamento**. Mostra la chiave, l'indirizzo locale e, incollando l'indirizzo del tunnel, compone l'URL completo da incollare nell'IA.

Requisiti: Node.js 18+ sul PC e `npm install` fatto nella cartella `mcp-server` (stesso requisito dell'MCP di Claude). Se il server non parte, il pannello lo dice.

## Prima di collegare: sicurezza (importante)

1. **Chi ha la chiave vede i dati dello studio.** Trattala come una password: non incollarla in chat, mail, screenshot.
2. Con ChatGPT la chiave viaggia **dentro l'URL** (ChatGPT non permette intestazioni personalizzate): resta quindi anche nelle impostazioni del connettore e può comparire nei log di chi gestisce il tunnel. Se hai dubbi, **genera una nuova chiave** dal pannello (poi riavvia Prisma e aggiorna l'IA).
3. **Attiva "Chiedi la mia conferma prima di ogni azione"** (Impostazioni → Avanzate). Così nessuna IA modifica o cancella nulla senza il tuo OK. Le eliminazioni richiedono comunque conferma esplicita.
4. **Dati personali dei clienti:** quando colleghi un'IA online, i dati che legge passano dal fornitore di quell'IA. Verifica che il piano usato (aziendale/business) abbia le condizioni sui dati che il tuo studio richiede, e informa i clienti nell'informativa privacy dello studio. Questa è una valutazione GDPR dello studio, non un controllo tecnico di Prisma.
5. Il tunnel va tenuto **acceso solo quando serve**.

## Passo comune per le IA online: il tunnel

Con ngrok (già usato da Prisma per il portale clienti): in un terminale `ngrok http 8423`. Copia l'indirizzo `https://….ngrok-free.app` che compare e incollalo nel pannello di Prisma. Nota: il piano gratuito di ngrok limita tunnel e indirizzi contemporanei; se usi già ngrok per il portale clienti, verifica che il tuo piano permetta un secondo tunnel (alternativa: Cloudflare Tunnel, già in lista come evoluzione). L'indirizzo gratuito può cambiare a ogni riavvio: va risincronizzato.

## ChatGPT

Disponibile con i piani **Plus, Pro, Business, Enterprise, Education** (non con il piano Free), sul web, in "modalità sviluppatore" (beta: i nomi dei menu possono variare).

1. Avvia il tunnel come sopra e prepara l'URL dal pannello di Prisma: `https://…/mcp/<chiave>`.
2. ChatGPT → **Impostazioni → App e connettori** (Apps & Connectors) → **Impostazioni avanzate** → attiva **Modalità sviluppatore**.
3. **Crea** nuovo connettore: nome "Prisma", **URL del server MCP** = quello preparato, autenticazione **Nessuna** (la chiave è già nell'URL).
4. Conferma di fidarti del connettore. In una nuova chat, attiva Prisma dal menu degli strumenti e prova: "Quali scadenze ho nei prossimi 7 giorni?".

## Gemini

**Gemini CLI** (sul PC, il modo più solido): in `~/.gemini/settings.json` (su Windows `C:\Users\<nome>\.gemini\settings.json`):

```json
{
  "mcpServers": {
    "prisma": {
      "httpUrl": "http://127.0.0.1:8423/mcp",
      "headers": { "Authorization": "Bearer INCOLLA-QUI-LA-CHIAVE" }
    }
  }
}
```

Avvia Gemini CLI e digita `/mcp` per controllare che "prisma" risulti connesso. Nota: con una chiave `url` senza `httpUrl` il CLI legge il server come SSE e resta "Disconnected": usa `httpUrl`. Google sta evolvendo i suoi strumenti da riga di comando: se il comando cambia nome, la configurazione MCP resta analoga (cerca "MCP servers" nella documentazione del nuovo strumento).

**App web di Gemini** (gemini.google.com): risulta possibile aggiungere un'app personalizzata con URL MCP remoto da **Impostazioni → App collegate → Aggiungi app personalizzata**, incollando l'URL pubblico `https://…/mcp/<chiave>`. Questa funzione è recente e dipende da piano e Paese: **verificala sul tuo account** prima di promettere questo canale ai clienti.

## Altre IA

| IA | Dove | Cosa incollare |
|---|---|---|
| Mistral Le Chat | Connettori → Aggiungi connettore personalizzato (MCP) | nome senza spazi + URL pubblico `https://…/mcp/<chiave>` |
| Perplexity | Connettori → Aggiungi connettore remoto personalizzato (web e app Mac, non mobile) | nome, URL pubblico, autenticazione "Nessuna", trasporto **Streamable HTTP** |
| Cursor / VS Code / Claude Code e simili | file di configurazione MCP del programma | indirizzo `http://127.0.0.1:8423/mcp` con intestazione Bearer, come per Gemini CLI |
| Microsoft Copilot | Copilot Studio (agenti aziendali) → aggiungi server MCP | URL pubblico; funzione per ambienti aziendali, con quirk noti: non promettere questo canale come standard |

Le voci dei menu cambiano spesso: i nomi sopra sono quelli verificati a ottobre 2026.

## Cosa può fare l'IA collegata

Tutto ciò che fa Claude: leggere scadenze, clienti, adempimenti, incassi, bilanci/KPI, documenti; creare e modificare clienti, task, comunicazioni, appuntamenti, F24, preventivi, procedure; registrare tempi e incassi; eliminare (solo con conferma esplicita). Ogni azione compare nel registro di Prisma con data, azione ed esito.

## Se qualcosa non funziona

- **"Server IA non attivo"** nel pannello: manca Node.js o `npm install` in `mcp-server`; riavvia Prisma dopo averlo fatto.
- **401 / "Token non valido"**: la chiave nell'IA è diversa da quella in `mcp-server/token-ia.txt` (dopo "Genera nuova chiave" va aggiornata).
- **ChatGPT non raggiunge il server**: il tunnel è spento o l'indirizzo è cambiato; l'URL deve iniziare con `https://` e finire con `/mcp/<chiave>`.
- **L'IA legge dati vecchi**: i dati arrivano da Prisma aperto nel browser dall'indirizzo del server (`http://localhost:8420`); le scritture richiedono Prisma aperto.

## Fonti usate per la verifica (ottobre 2026)

- ChatGPT, modalità sviluppatore e connettori MCP remoti: https://designrevision.com/blog/add-mcp-server-to-chatgpt · https://peliqan.io/blog/chatgpt-mcp/
- Gemini CLI, `httpUrl` / `url` / `command`: https://geminicli.com/docs/tools/mcp-server/ · https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- Gemini web, app personalizzate: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server (Enterprise); per l'app consumer fonti secondarie, da verificare
- Mistral: https://docs.mistral.ai/le-chat/knowledge-integrations/connectors/mcp-connectors
- Perplexity: https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors
