import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { EngineWorker } from './worker-client.js';

const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

export async function scenarioCatalog() {
  const result = [];
  for (const [file, title] of [['aaa-position', 'Mold Breaker vs Levitate'], ['aaa-six', 'Six-member teams'], ['ability-hypotheses', 'Hidden ability examples']]) {
    const input = JSON.parse(await readFile(new URL(`../examples/${file}.json`, import.meta.url), 'utf8'));
    if (input.hypotheses) {
      for (const h of input.hypotheses) result.push({ id: h.id, name: `Hypothesis: ${h.id}`, description: 'One fully specified hypothesis from the existing ensemble example.', position: h.position });
    } else result.push({ id: file, name: title, description: 'Existing AAA engine example.', position: input });
  }
  try {
    const strategic = JSON.parse(await readFile(new URL('../examples/strategy/scenarios.json', import.meta.url), 'utf8'));
    result.push(...strategic.map(s => ({ ...s, description: s.expected?.why ?? s.description })));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return result;
}

export async function createSandboxServer() {
  const worker = new EngineWorker();
  const catalog = await scenarioCatalog();
  let revision = 0;
  let session;
  let initial;
  let history;
  let cancelling = false;
  const publicState = () => ({ revision, view: session?.view, teamText: session?.teamText });
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost && req.headers.host !== `localhost:${server.address().port}`) return send(403, { error: 'Use the local sandbox URL printed in the terminal.' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Cross-origin requests are not allowed.' });
      const path = new URL(req.url, `http://${expectedHost}`).pathname;
      if (req.method === 'GET' && files[path]) {
        const [file, mime] = files[path];
        const data = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff' });
        return res.end(data);
      }
      if (req.method === 'GET' && path === '/api/scenarios') return send(200, catalog);
      if (req.method === 'GET' && path === '/api/state') return send(200, publicState());
      if (req.method === 'GET' && path === '/api/export') {
        if (!session) throw new Error('Load a position first.');
        return send(200, { ...initial, history });
      }
      if (req.method !== 'POST' || !['/api/load', '/api/reset', '/api/advance', '/api/analyze', '/api/engine-turn', '/api/cancel'].includes(path)) return send(404, { error: 'Not found' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Send JSON.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024) return send(413, { error: 'Scenario exceeds the 1 MB limit.' });
      }
      const input = JSON.parse(body || '{}');
      if (path === '/api/cancel') {
        if (cancelling) return send(409, { error: 'Cancellation is already in progress.' });
        cancelling = true;
        try { await worker.cancel(); } finally { cancelling = false; }
        return send(200, publicState());
      }
      if (cancelling || worker.pending) return send(409, { error: 'Engine busy. Pause or wait before another operation.' });
      if (input.revision !== revision) return send(409, { error: 'Position changed in another request or tab. Refresh the page.' });
      if (path !== '/api/load' && !session) throw new Error('Load a scenario or create teams first.');
      const search = input.search ?? {};
      if ((search.timeMs ?? 5000) > 30000 || (search.maxNodes ?? 3000) > 100000) throw new Error('Sandbox limits: 30 seconds per analysis and 100,000 transitions.');
      let command;
      if (path === '/api/load' || path === '/api/reset') command = { kind: 'load', position: path === '/api/reset' ? initial : input.position };
      else command = { kind: { '/api/advance': 'advance', '/api/analyze': 'analyze', '/api/engine-turn': 'engineTurn' }[path], snapshot: session.snapshot, search, choices: input.choices };
      const result = await worker.run(command);
      if (result.snapshot) {
        session = { ...session, ...result };
        if (path === '/api/load') initial = structuredClone(input.position);
        if (path === '/api/load' || path === '/api/reset') history = structuredClone(initial.history ?? []);
        if (path === '/api/advance') history.push(input.choices);
        if (path === '/api/engine-turn') history.push(...result.decisions.map(d => d.choices));
        revision++;
      }
      send(200, { ...publicState(), analysis: result.analysis, decisions: result.decisions });
    } catch (error) { send(400, { error: error.message }); }
  });
  return { server, close: async () => { await worker.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createSandboxServer();
  const port = Number(process.env.PORT ?? 3000);
  app.server.on('error', error => { console.error(`Cannot start sandbox: ${error.message}. Try another port with $env:PORT=3001.`); app.close().finally(() => { process.exitCode = 1; }); });
  app.server.listen(port, '127.0.0.1', () => console.log(`AAA Battle Sandbox\nOpen http://127.0.0.1:${app.server.address().port}\nLocal simulations only. Press Ctrl+C to stop.`));
  process.on('SIGINT', () => app.close().then(() => process.exit(0)));
}
