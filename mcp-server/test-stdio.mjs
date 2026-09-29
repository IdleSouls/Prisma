// Smoke test dell'entry point reale (server.js) lanciato come processo separato via stdio,
// esattamente come farebbe Claude Desktop/Cowork secondo la configurazione MCP.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

async function main() {
  const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
  const transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
  const client = new Client({ name: 'smoke-test-client', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  if (tools.tools.length !== 30) throw new Error(`attesi 30 tool (9 lettura + 21 scrittura), trovati ${tools.tools.length}`);

  const r = await client.callTool({ name: 'stato_generale', arguments: {} });
  const stato = JSON.parse(r.content[0].text);
  if (typeof stato.clientiAttivi !== 'number') throw new Error('stato_generale non ha restituito un conteggio clienti valido');

  console.log(`✅ Avvio reale via stdio OK — ${tools.tools.length} tool esposti, stato_generale: ${stato.clientiAttivi} clienti attivi.`);
  await client.close();
  process.exit(0);
}

main().catch(e => { console.error('❌ FAIL', e); process.exit(1); });
