import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { classifyInstance, classifyDeployment } from '../dist/classify-instance.mjs';
import { validateConfig, checkDeployment, stateKey } from '../dist/monitor.mjs';
const config = { approvedRelease: 'v1.4.0', maxAgeMs: 10000, timeoutMs: 100, intervalMs: 1000, instances: [] };
test('freshness boundary, missing evidence, and unexpected releases', () => {
  assert.equal(classifyInstance('v1.4.0', { release: 'v1.4.0', checkedAtMs: 901 }, 1000, 100), 'Match');
  for (const checkedAtMs of [900, 899, 1001]) assert.equal(classifyInstance('v1.4.0', { release: 'v1.4.0', checkedAtMs }, 1000, 100), 'Unknown');
  assert.equal(classifyInstance('v1.4.0', { release: 'v1.5.0', checkedAtMs: 950 }, 1000, 100), 'Mismatch');
  assert.equal(classifyInstance('v1.4.0', null, 1000, 100), 'Unknown');
});
test('empty deployment counts zero and remains unconfirmed', () => {
  assert.deepEqual(classifyDeployment('v1', [], 1000, 100), { instances: [], confirmed: false, totalInstances: 0 });
});
test('invalid configuration fails before requests', () => {
  assert.throws(() => validateConfig({ ...config, intervalMs: 0 }));
  assert.throws(() => validateConfig({ ...config, instances: [{ id: 'a', url: 'http://localhost' }, { id: 'a', url: 'http://localhost' }] }));
  assert.throws(() => validateConfig({ ...config, instances: [{ id: 'a', url: 'file:///tmp/report' }] }));
});
test('HTTP failures, malformed reports, stale evidence, timeout, and recovery', async () => {
  let recovered = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/timeout') return;
    if (req.url === '/error' && !recovered) { res.writeHead(503).end(); return; }
    if (req.url === '/invalid') { res.end('{'); return; }
    if (req.url === '/shape') { res.end(JSON.stringify({ release: 42 })); return; }
    res.end(JSON.stringify({ release: req.url === '/old' && !recovered ? 'v1.3.0' : 'v1.4.0', checkedAtMs: req.url === '/stale' ? Date.now() - 20000 : Date.now() }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const paths = ['/current', '/old', '/error', '/invalid', '/shape', '/stale', '/timeout'];
    const input = { ...config, instances: paths.map(id => ({ id, url: `${base}${id}` })) };
    const first = await checkDeployment(input);
    assert.deepEqual(first.instances.map(x => x.status), ['Match', 'Mismatch', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'Unknown']);
    assert.equal(first.totalInstances, 7);
    assert.equal(first.mismatchCount, 1);
    assert.equal(first.unknownCount, 5);
    assert.equal(first.confirmed, false);
    assert.equal(stateKey(first), stateKey({ ...first, checkedAtMs: 0 }));
    recovered = true;
    const after = await checkDeployment({ ...input, instances: input.instances.slice(0, 3) });
    assert.equal(after.confirmed, true);
    assert.notEqual(stateKey(first), stateKey(after));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('CLI JSON preserves totals and exits unconfirmed for an empty inventory', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'patchproof-'));
  try {
    const file = join(directory, 'config.json');
    writeFileSync(file, JSON.stringify(config));
    const run = spawnSync(process.execPath, ['dist/cli.mjs', file, '--json'], { encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.totalInstances, 0);
    assert.equal(output.confirmed, false);
    assert.equal(output.notification, 'Attention required');
  } finally { rmSync(directory, { recursive: true }); }
});
