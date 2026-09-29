#!/usr/bin/env node
/*
 * Entry point stdio del server MCP locale del gestionale studio.
 * Tutta la logica dei tool vive in tools.js — qui ci si limita a collegarla al transport stdio,
 * come richiesto da Claude Desktop/Cowork per lanciare un MCP server locale.
 *
 * Configurazione: imposta GESTIONALE_MCP_FILE se vuoi leggere il JSON da un percorso diverso da
 * quello di default (la stessa cartella di questo file). Imposta GESTIONALE_SERVER_URL se
 * server.js (il server locale di rete studio, per le sole scritture) gira su un indirizzo/porta
 * diverso dal default http://localhost:8420. Vedi README.md per i dettagli.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { creaServer } from './tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(process.env.GESTIONALE_MCP_FILE || `${__dirname}/gestionale-mcp.json`);
const SERVER_URL = process.env.GESTIONALE_SERVER_URL || 'http://localhost:8420';

const server = creaServer(FILE_PATH, SERVER_URL);
const transport = new StdioServerTransport();
await server.connect(transport);
