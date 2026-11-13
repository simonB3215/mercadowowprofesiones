// Servidor MCP por stdio (ver src/mcp/server.ts). Uso: npm run mcp
// stdout es el canal del protocolo: cualquier log del servidor se desvía a stderr.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

console.log = console.error;
console.info = console.error;
console.warn = console.error;

// Raíz del proyecto (las migraciones y los datos se buscan desde ahí) y variables de .env, si existe.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { createServer } = await import('../src/mcp/server.js');

const server = createServer();
await server.connect(new StdioServerTransport());
const stop = async () => {
  await server.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.stdin.on('end', stop);
