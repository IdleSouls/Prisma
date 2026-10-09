#!/usr/bin/env node
/*
 * Entry point HTTP (Streamable HTTP) del server MCP di Prisma, per le IA che NON girano sul PC
 * dello studio: ChatGPT (connettori / modalità sviluppatore), Gemini (Gemini CLI e client MCP
 * remoti), Mistral Le Chat, Perplexity e qualunque client MCP via URL.
 * Usa esattamente gli stessi tool di Claude (tools.js): stesse regole, stesso registro azioni,
 * stessa approvazione in Prisma. Cambia solo il trasporto.
 *
 * Sicurezza: l'endpoint risponde SOLO con un token segreto, che si genera da solo al primo avvio
 * in token-ia.txt (mai in repository). Il token si accetta:
 *   - come intestazione  Authorization: Bearer <token>   (Gemini CLI, client che la supportano)
 *   - oppure nell'indirizzo  /mcp/<token>                (ChatGPT, che non permette intestazioni)
 * Per default ascolta solo su questo PC (127.0.0.1): per ChatGPT serve un indirizzo https
 * pubblico, che si ottiene con un tunnel (ngrok / Cloudflare) verso la porta 8423.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { creaServer } from './tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(process.env.GESTIONALE_MCP_FILE || `${__dirname}/gestionale-mcp.json`);
const SERVER_URL = process.env.GESTIONALE_SERVER_URL || 'http://localhost:8420';
const PORTA = parseInt(process.env.PRISMA_MCP_HTTP_PORT || '8423', 10);
const HOST = process.env.PRISMA_MCP_HTTP_HOST || '127.0.0.1';
const FILE_TOKEN = resolve(`${__dirname}/token-ia.txt`);

function leggiOCreaToken() {
  if (existsSync(FILE_TOKEN)) {
    const t = readFileSync(FILE_TOKEN, 'utf8').trim();
    if (t.length >= 24) return t;
  }
  const nuovo = randomBytes(24).toString('hex');
  writeFileSync(FILE_TOKEN, nuovo + '\n', 'utf8');
  return nuovo;
}

function uguali(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

function tokenDellaRichiesta(req) {
  const h = req.headers['authorization'] || '';
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  const m = /^\/mcp\/([A-Za-z0-9_-]+)\/?(\?.*)?$/.exec(req.url || '');
  return m ? m[1] : '';
}

function leggiCorpo(req) {
  return new Promise((ok, ko) => {
    const pezzi = []; let tot = 0;
    req.on('data', (c) => { tot += c.length; if (tot > 4_000_000) { ko(new Error('troppo grande')); req.destroy(); } else pezzi.push(c); });
    req.on('end', () => { try { const s = Buffer.concat(pezzi).toString('utf8'); ok(s ? JSON.parse(s) : undefined); } catch (e) { ko(e); } });
    req.on('error', ko);
  });
}

const server = http.createServer(async (req, res) => {
  const percorso = (req.url || '').split('?')[0];
  if (percorso === '/salute') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Prisma MCP ok'); return; }
  if (!(percorso === '/mcp' || percorso.startsWith('/mcp/'))) { res.writeHead(404); res.end(); return; }
  if (!uguali(tokenDellaRichiesta(req), leggiOCreaToken())) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
    res.end(JSON.stringify({ error: 'Token non valido.' }));
    return;
  }
  if (req.method !== 'POST') {
    // Modalità senza sessione (stateless): solo POST. GET/DELETE non servono.
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Metodo non consentito.' }, id: null }));
    return;
  }
  try {
    const corpo = await leggiCorpo(req);
    const mcp = creaServer(FILE_PATH, SERVER_URL);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, corpo);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Errore interno del server MCP.' }, id: null }));
    }
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error('Porta ' + PORTA + ' già in uso: il server MCP HTTP è probabilmente già attivo.'); process.exit(0); }
  console.error(e.message); process.exit(1);
});
server.listen(PORTA, HOST, () => {
  leggiOCreaToken();
  console.log(`Prisma MCP (HTTP) in ascolto su http://${HOST}:${PORTA}/mcp  (token in mcp-server/token-ia.txt)`);
});
