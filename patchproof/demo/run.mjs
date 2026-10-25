import http from 'node:http';
import { checkDeployment, stateKey } from '../dist/monitor.mjs';

// Local simulation only: the demo updates its own fake instances, never real servers.
let updated = false;
const server = http.createServer((request, response) => {
  if (request.url === '/unavailable' && !updated) { response.writeHead(503).end(); return; }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ release: request.url === '/old' && !updated ? 'v1.3.0' : 'v1.4.0', checkedAtMs: Date.now() }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const config = { approvedRelease: 'v1.4.0', maxAgeMs: 30000, timeoutMs: 1000, intervalMs: 1000,
  instances: [{ id: 'app-1', url: `${base}/current` }, { id: 'app-2', url: `${base}/old` }, { id: 'app-3', url: `${base}/unavailable` }] };
try {
  let previous;
  for (const phase of ['Before update', 'After simulated developer update']) {
    console.log(`\n${phase}`);
    const result = await checkDeployment(config);
    console.table(result.instances);
    console.log(`Confirmed: ${result.confirmed}; mismatches: ${result.mismatchCount}; unknown: ${result.unknownCount}`);
    if (stateKey(result) !== previous) console.log(result.confirmed ? 'NOTIFICATION: Deployment confirmed.' : 'NOTIFICATION: Team attention required.');
    previous = stateKey(result);
    updated = true;
  }
} finally { await new Promise(resolve => server.close(resolve)); }
