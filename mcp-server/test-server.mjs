// Test end-to-end del server MCP: importa il VERO server (tools.js, lo stesso usato da
// server.js) e vi si collega in-process via InMemoryTransport, chiamando ogni tool esposto per
// verificare che risponda in modo coerente con i dati di esempio in gestionale-mcp.json.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { creaServer } from './tools.js';

let assertions = 0, failures = 0;
function assert(cond, msg) {
  assertions++;
  if (!cond) { failures++; console.error('❌ FALLITO:', msg); }
}

async function main() {
  const filePath = fileURLToPath(new URL('./gestionale-mcp.json', import.meta.url));
  const vistaGrezza = JSON.parse(readFileSync(filePath, 'utf8'));

  const server = creaServer(filePath);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  assert(tools.tools.length === 41, `attesi 41 tool esposti (13 lettura + 28 scrittura), trovati ${tools.tools.length}`);
  console.log('=== listTools() OK:', tools.tools.map(t => t.name).join(', '));

  // stato_generale: coerente col file grezzo
  const r1 = await client.callTool({ name: 'stato_generale', arguments: {} });
  const stato = JSON.parse(r1.content[0].text);
  assert(stato.scadenze.scaduti === vistaGrezza.scadenzeRiepilogo.scaduti, 'stato_generale: scaduti non coerenti col file grezzo');
  assert(stato.clientiAttivi === vistaGrezza.clienti.filter(c => c.stato !== 'cessato').length, 'stato_generale: conteggio clienti attivi errato');
  assert(stato.taskApertiCount === vistaGrezza.taskApertiCount, 'stato_generale: conteggio task aperti errato');
  console.log('=== tool stato_generale OK');

  // elenco_clienti: filtro testuale case-insensitive
  const r2 = await client.callTool({ name: 'elenco_clienti', arguments: { query: 'rossi' } });
  const clientiRossi = JSON.parse(r2.content[0].text);
  assert(clientiRossi.length >= 1 && clientiRossi.every(c => c.ragioneSociale.toLowerCase().includes('rossi')), 'elenco_clienti: filtro testo non funziona correttamente');
  const r2b = await client.callTool({ name: 'elenco_clienti', arguments: { soloAttivi: false } });
  const tuttiClienti = JSON.parse(r2b.content[0].text);
  assert(tuttiClienti.length === vistaGrezza.clienti.length, 'elenco_clienti: con soloAttivi=false deve restituire tutti i clienti, inclusi i cessati');
  console.log('=== tool elenco_clienti (filtro testo + soloAttivi) OK, trovati per "rossi":', clientiRossi.map(c => c.ragioneSociale).join(', '));

  // scheda_cliente: ricerca per ragione sociale (parziale) e per id
  const clienteTest = vistaGrezza.clienti[0];
  const r3 = await client.callTool({ name: 'scheda_cliente', arguments: { cliente: clienteTest.ragioneSociale.slice(0, 8) } });
  const scheda = JSON.parse(r3.content[0].text);
  assert(scheda.cliente.id === clienteTest.id, 'scheda_cliente: ricerca per ragione sociale parziale non ha trovato il cliente giusto');
  assert(scheda.scadenzeAperte.every(s => s.categoria !== 'completato'), 'scheda_cliente: le scadenze aperte non devono includere quelle completate');
  assert(Array.isArray(scheda.cliente.contabilita), 'scheda_cliente: manca lo stato contabilità (desunto dai documenti) nella scheda');
  const r3id = await client.callTool({ name: 'scheda_cliente', arguments: { cliente: clienteTest.id } });
  assert(JSON.parse(r3id.content[0].text).cliente.id === clienteTest.id, 'scheda_cliente: ricerca per id non funziona');
  console.log('=== tool scheda_cliente (ricerca per ragione sociale parziale e per id) OK');

  // scheda_cliente: cliente inesistente non deve far crashare il tool
  const r3b = await client.callTool({ name: 'scheda_cliente', arguments: { cliente: 'Cliente Che Non Esiste Srl' } });
  const schedaVuota = JSON.parse(r3b.content[0].text);
  assert(!!schedaVuota.errore, 'scheda_cliente: un cliente inesistente deve restituire un errore leggibile, non un crash');
  console.log('=== tool scheda_cliente (cliente inesistente) restituisce errore leggibile OK');

  // scadenze: filtro per categoria, coerente col riepilogo del file grezzo
  const r4 = await client.callTool({ name: 'scadenze', arguments: { categoria: 'scaduto', limite: 500 } });
  const scadScadute = JSON.parse(r4.content[0].text);
  assert(scadScadute.length === vistaGrezza.scadenzeRiepilogo.scaduti, `scadenze (categoria=scaduto): attese ${vistaGrezza.scadenzeRiepilogo.scaduti}, trovate ${scadScadute.length}`);
  assert(scadScadute.every(s => s.categoria === 'scaduto'), 'scadenze: il filtro per categoria ha restituito righe di categoria diversa');
  const r4b = await client.callTool({ name: 'scadenze', arguments: { cliente: clienteTest.ragioneSociale, limite: 500 } });
  const scadCliente = JSON.parse(r4b.content[0].text);
  assert(scadCliente.every(s => s.clienteId === clienteTest.id), 'scadenze: il filtro per cliente ha restituito righe di clienti diversi');
  console.log('=== tool scadenze (filtro categoria + filtro cliente) OK');

  // scadenze: limite rispettato
  const r4c = await client.callTool({ name: 'scadenze', arguments: { limite: 3 } });
  assert(JSON.parse(r4c.content[0].text).length === 3, 'scadenze: il parametro limite non viene rispettato');
  console.log('=== tool scadenze (limite) OK');

  // scadenze: filtro per data esatta e per intervallo (task #143 - "che appuntamenti ho il giorno X")
  const primaData = vistaGrezza.scadenze.slice().sort((a, b) => a.data.localeCompare(b.data))[0].data;
  const r4d = await client.callTool({ name: 'scadenze', arguments: { data: primaData, limite: 500 } });
  const scadDataEsatta = JSON.parse(r4d.content[0].text);
  assert(scadDataEsatta.length === vistaGrezza.scadenze.filter(s => s.data === primaData).length, 'scadenze: filtro per data esatta non coerente col file grezzo');
  assert(scadDataEsatta.every(s => s.data === primaData), 'scadenze: il filtro per data esatta ha restituito righe di date diverse');
  const dateOrdinate = vistaGrezza.scadenze.map(s => s.data).sort();
  const dataDa = dateOrdinate[Math.floor(dateOrdinate.length / 2)];
  const r4e = await client.callTool({ name: 'scadenze', arguments: { dataDa, limite: 500 } });
  const scadDaData = JSON.parse(r4e.content[0].text);
  assert(scadDaData.every(s => s.data >= dataDa), 'scadenze: il filtro dataDa ha restituito righe precedenti alla soglia');
  console.log('=== tool scadenze (filtro data esatta + dataDa) OK');

  // adempimenti_annuali: filtro soloIncompleti
  const r5 = await client.callTool({ name: 'adempimenti_annuali', arguments: { soloIncompleti: true } });
  const annualiIncompleti = JSON.parse(r5.content[0].text);
  assert(annualiIncompleti.every(a => !a.completato), 'adempimenti_annuali: soloIncompleti ha restituito adempimenti già completati');
  console.log('=== tool adempimenti_annuali (soloIncompleti) OK');

  // task_aperti: coerente col conteggio del file grezzo, e filtro assegnatario
  const r6 = await client.callTool({ name: 'task_aperti', arguments: {} });
  const taskAperti = JSON.parse(r6.content[0].text);
  assert(taskAperti.length === vistaGrezza.taskApertiCount, 'task_aperti: conteggio non coerente col file grezzo');
  if (taskAperti.length > 0) {
    const assegnatario = taskAperti[0].assegnatoA;
    const r6b = await client.callTool({ name: 'task_aperti', arguments: { assegnatoA: assegnatario } });
    const filtratiPerAssegnatario = JSON.parse(r6b.content[0].text);
    assert(filtratiPerAssegnatario.every(t => t.assegnatoA === assegnatario), 'task_aperti: filtro per assegnatario non funziona correttamente');
  }
  console.log('=== tool task_aperti (conteggio + filtro assegnatario) OK');

  // comunicazioni_recenti: presenti e filtrabili per cliente
  const r7 = await client.callTool({ name: 'comunicazioni_recenti', arguments: {} });
  const comRecenti = JSON.parse(r7.content[0].text);
  assert(comRecenti.length === vistaGrezza.comunicazioniRecenti.length, 'comunicazioni_recenti: conteggio non coerente col file grezzo');
  console.log('=== tool comunicazioni_recenti OK');

  // elenco_preventivi: coerente col file grezzo, filtrabile per cliente e per stato. Il file grezzo
  // usato qui potrebbe essere una vecchia esportazione (prima del campo "preventivi", task #143) o
  // uno studio senza ancora nessun preventivo: i filtri si testano solo se c'è almeno una riga, così
  // il test resta valido anche contro un file non ancora riesportato invece di crashare.
  const r8 = await client.callTool({ name: 'elenco_preventivi', arguments: {} });
  const tuttiPreventivi = JSON.parse(r8.content[0].text);
  assert(tuttiPreventivi.length === (vistaGrezza.preventivi || []).length, 'elenco_preventivi: conteggio non coerente col file grezzo');
  assert(tuttiPreventivi.every(p => !('corpo' in p) && !('valoriCustom' in p)), 'elenco_preventivi: non deve esporre il testo integrale del documento (corpo/valoriCustom)');
  if (tuttiPreventivi.length > 0) {
    const clientePrevTest = vistaGrezza.preventivi[0];
    const r8b = await client.callTool({ name: 'elenco_preventivi', arguments: { cliente: clientePrevTest.clienteId } });
    const preventiviCliente = JSON.parse(r8b.content[0].text);
    assert(preventiviCliente.every(p => p.clienteId === clientePrevTest.clienteId), 'elenco_preventivi: filtro cliente ha restituito righe di clienti diversi');
    const r8c = await client.callTool({ name: 'elenco_preventivi', arguments: { stato: clientePrevTest.stato } });
    const preventiviStato = JSON.parse(r8c.content[0].text);
    assert(preventiviStato.every(p => p.stato === clientePrevTest.stato), 'elenco_preventivi: filtro stato ha restituito righe di stato diverso');
  }
  console.log('=== tool elenco_preventivi (conteggio + filtro cliente + filtro stato) OK');

  // catalogo_studio: espone attività a listino e modelli attivi, coerenti col file grezzo
  const r9 = await client.callTool({ name: 'catalogo_studio', arguments: {} });
  const catalogo = JSON.parse(r9.content[0].text);
  assert(catalogo.catalogoAttivitaStudio.length === (vistaGrezza.catalogoAttivitaStudio || []).length, 'catalogo_studio: conteggio attività non coerente col file grezzo');
  assert(catalogo.modelliDocumento.length === (vistaGrezza.modelliDocumento || []).length, 'catalogo_studio: conteggio modelli non coerente col file grezzo');
  assert(catalogo.catalogoAttivitaStudio.every(a => typeof a.id === 'string' && typeof a.nome === 'string'), 'catalogo_studio: voci attività malformate');
  console.log('=== tool catalogo_studio OK');

  await client.close();
  await server.close();

  // ---------- SCRITTURE ----------
  // Qui NON testiamo la logica di creazione/validazione (quella vive solo in gestionale.htm ed è
  // testata in jsdom-test.js) - testiamo solo il "postino": che ogni tool costruisca il comando
  // giusto e lo mandi a server.js, gestisca correttamente successo/fallimento riportati da
  // server.js, e che elimina_* rifiuti PRIMA di mandare qualunque richiesta se manca conferma:true.
  // Al posto del vero server.js usiamo un finto server HTTP che registra l'ultimo comando ricevuto.
  let ultimoComandoRicevuto = null;
  const fakeServerJs = createHttpServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      if (req.url === '/api/comando' && req.method === 'POST') {
        const dati = JSON.parse(corpo);
        ultimoComandoRicevuto = dati;
        if (dati.azione === 'creaCliente' && dati.parametri.ragioneSociale === 'FALLISCI') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, errore: 'ragione sociale rifiutata (finto errore di test)' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, risultato: Object.assign({ id: 'finto123' }, dati.parametri) }));
      } else {
        res.writeHead(404); res.end();
      }
    });
  });
  await new Promise((resolve) => fakeServerJs.listen(0, '127.0.0.1', resolve));
  const fakeUrl = `http://127.0.0.1:${fakeServerJs.address().port}`;

  const serverScrittura = creaServer(filePath, fakeUrl);
  const [ct2, st2] = InMemoryTransport.createLinkedPair();
  const clientScrittura = new Client({ name: 'test-client-scrittura', version: '1.0.0' });
  await Promise.all([serverScrittura.connect(st2), clientScrittura.connect(ct2)]);

  const rc1 = await clientScrittura.callTool({ name: 'crea_cliente', arguments: { ragioneSociale: 'Prova Scrittura SRL', tipo: 'societa_capitali' } });
  assert(ultimoComandoRicevuto && ultimoComandoRicevuto.azione === 'creaCliente', 'crea_cliente: azione inviata a server.js errata');
  assert(ultimoComandoRicevuto && ultimoComandoRicevuto.parametri.ragioneSociale === 'Prova Scrittura SRL', 'crea_cliente: parametri inviati a server.js errati');
  assert(!rc1.isError, 'crea_cliente: non doveva segnalare errore su una risposta ok da server.js');
  console.log('=== tool crea_cliente manda il comando corretto a server.js e legge la risposta OK');

  const rc1b = await clientScrittura.callTool({ name: 'crea_cliente', arguments: { ragioneSociale: 'FALLISCI' } });
  assert(rc1b.isError === true, 'crea_cliente: un esito ok:false riportato da server.js deve risultare isError');
  console.log('=== tool crea_cliente propaga correttamente un fallimento riportato da server.js OK');

  // Un input che non rispetta lo schema (qui: manca "conferma", che è z.literal(true) quindi
  // obbligatorio) viene rifiutato dall'SDK PRIMA di chiamare il nostro handler: torna un
  // CallToolResult con isError:true (non un'eccezione lato client) - il nostro codice non viene
  // proprio eseguito, quindi nessuna richiesta può essere partita verso server.js.
  ultimoComandoRicevuto = null;
  const rNoConferma = await clientScrittura.callTool({ name: 'elimina_cliente', arguments: { id: 'cli1' } }); // manca "conferma"
  assert(rNoConferma.isError === true, 'elimina_cliente: senza "conferma:true" la chiamata deve essere rifiutata dallo schema (isError)');
  assert(ultimoComandoRicevuto === null, 'elimina_cliente: senza conferma non deve MAI arrivare a mandare una richiesta a server.js');
  console.log('=== tool elimina_cliente rifiuta senza conferma:true, prima di qualunque richiesta di rete OK');

  const rc2 = await clientScrittura.callTool({ name: 'elimina_cliente', arguments: { id: 'cli1', conferma: true } });
  assert(ultimoComandoRicevuto && ultimoComandoRicevuto.azione === 'eliminaCliente' && ultimoComandoRicevuto.parametri.id === 'cli1', 'elimina_cliente: comando inviato a server.js errato');
  assert(!rc2.isError, 'elimina_cliente: con conferma:true e risposta ok non doveva segnalare errore');
  console.log('=== tool elimina_cliente con conferma:true manda il comando corretto OK');

  // modifica_*: verifica che "patch" arrivi intatto (merge, non sostituzione)
  const rc3 = await clientScrittura.callTool({ name: 'modifica_task', arguments: { id: 'task1', patch: { stato: 'Fatto' } } });
  assert(ultimoComandoRicevuto.azione === 'modificaTask' && ultimoComandoRicevuto.parametri.id === 'task1' && ultimoComandoRicevuto.parametri.patch.stato === 'Fatto', 'modifica_task: comando/patch inviati errati');
  assert(!rc3.isError, 'modifica_task: non doveva segnalare errore su risposta ok');
  console.log('=== tool modifica_task manda id+patch corretti OK');

  // crea_preventivo: verifica che tutti i campi (incluso attivitaIds) arrivino intatti a server.js
  const rc4 = await clientScrittura.callTool({ name: 'crea_preventivo', arguments: {
    clienteId: 'cli1', modelloId: 'mod1', oggetto: 'Preventivo di prova', importo: 500, attivitaIds: ['att1', 'att2'],
  } });
  assert(ultimoComandoRicevuto.azione === 'creaPreventivo', 'crea_preventivo: azione inviata a server.js errata');
  assert(ultimoComandoRicevuto.parametri.clienteId === 'cli1' && ultimoComandoRicevuto.parametri.modelloId === 'mod1' && ultimoComandoRicevuto.parametri.oggetto === 'Preventivo di prova', 'crea_preventivo: parametri base inviati errati');
  assert(Array.isArray(ultimoComandoRicevuto.parametri.attivitaIds) && ultimoComandoRicevuto.parametri.attivitaIds.length === 2, 'crea_preventivo: attivitaIds non inviati correttamente');
  assert(!rc4.isError, 'crea_preventivo: non doveva segnalare errore su risposta ok');
  console.log('=== tool crea_preventivo manda tutti i campi (incluso attivitaIds) a server.js OK');

  const rc5 = await clientScrittura.callTool({ name: 'modifica_preventivo', arguments: { id: 'doc1', patch: { stato: 'Accettato' } } });
  assert(ultimoComandoRicevuto.azione === 'modificaPreventivo' && ultimoComandoRicevuto.parametri.id === 'doc1' && ultimoComandoRicevuto.parametri.patch.stato === 'Accettato', 'modifica_preventivo: comando/patch inviati errati');
  assert(!rc5.isError, 'modifica_preventivo: non doveva segnalare errore su risposta ok');
  console.log('=== tool modifica_preventivo manda id+patch corretti OK');

  ultimoComandoRicevuto = null;
  const rNoConfPrev = await clientScrittura.callTool({ name: 'elimina_preventivo', arguments: { id: 'doc1' } }); // manca "conferma"
  assert(rNoConfPrev.isError === true, 'elimina_preventivo: senza "conferma:true" la chiamata deve essere rifiutata dallo schema (isError)');
  assert(ultimoComandoRicevuto === null, 'elimina_preventivo: senza conferma non deve MAI mandare una richiesta a server.js');
  const rc6 = await clientScrittura.callTool({ name: 'elimina_preventivo', arguments: { id: 'doc1', conferma: true } });
  assert(ultimoComandoRicevuto.azione === 'eliminaPreventivo' && ultimoComandoRicevuto.parametri.id === 'doc1', 'elimina_preventivo: comando inviato a server.js errato');
  assert(!rc6.isError, 'elimina_preventivo: con conferma:true e risposta ok non doveva segnalare errore');
  console.log('=== tool elimina_preventivo rifiuta senza conferma e manda il comando corretto con conferma:true OK');

  await clientScrittura.close();
  await serverScrittura.close();

  // server.js irraggiungibile (nessuno in ascolto su quell'indirizzo): errore leggibile, non un crash
  const serverOffline = creaServer(filePath, 'http://127.0.0.1:1');
  const [ct3, st3] = InMemoryTransport.createLinkedPair();
  const clientOffline = new Client({ name: 'test-client-offline', version: '1.0.0' });
  await Promise.all([serverOffline.connect(st3), clientOffline.connect(ct3)]);
  const rOffline = await clientOffline.callTool({ name: 'crea_task', arguments: { titolo: 'Test', assegnatoA: 'Matteo' } });
  assert(rOffline.isError === true, 'crea_task: con server.js irraggiungibile il tool deve risultare isError, non crashare');
  assert(/non è acceso|Impossibile raggiungere/i.test(rOffline.content[0].text), 'crea_task: il messaggio di errore deve spiegare che server.js non è raggiungibile');
  console.log('=== tool con server.js irraggiungibile restituisce un errore chiaro (non un crash) OK');
  await clientOffline.close();
  await serverOffline.close();

  fakeServerJs.close();

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${assertions - failures}/${assertions} assert passati`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FAIL', e); process.exit(1); });
