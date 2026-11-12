// Servidor local de la API (equivalente a la función de Vercel).
import http from 'node:http';
import { handle } from '../src/server/router.js';

const port = Number(process.env.API_PORT ?? 8787);
http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const r = await handle(request);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(port, '127.0.0.1', () => console.log(`API en http://127.0.0.1:${port}`));
