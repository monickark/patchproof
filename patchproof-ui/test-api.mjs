import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyDeployment } from './dist/classify-instance.mjs';
async function launch(args = []) {
  const child = spawn(process.execPath, ['server.mjs', '--port', '0', ...args], { stdio:['ignore','pipe','pipe'] });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server did not start')), 5000);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited: ${code}`)); });
  });
  return { child, url };
}
async function stop(child) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
const demo = await launch();
const post = async (url, path, data = {}) => {
  const response = await fetch(url + path, { method:'POST', headers:{ 'content-type':'application/json', origin:url }, body:JSON.stringify(data) });
  assert.equal(response.status, 200);
  return response.json();
};
let directory;
try {
  for (const path of ['/', '/app.mjs', '/styles.css', '/classify-instance.mjs']) assert.equal((await fetch(demo.url + path)).status, 200);
  const first = await post(demo.url, '/api/check');
  const result = classifyDeployment(first.config.approvedRelease, first.records, Date.now(), first.config.maxAgeMs);
  assert.deepEqual(result.instances.map(item => item.status), ['Match','Match','Mismatch','Mismatch','Match','Unknown']);
  const recovered = await post(demo.url, '/api/recover');
  assert.equal(classifyDeployment(recovered.config.approvedRelease, recovered.records, Date.now(), recovered.config.maxAgeMs).confirmed, true);
  const rejected = await fetch(demo.url + '/api/reset', { method:'POST', headers:{ origin:'https://untrusted.example', 'content-type':'application/json' }, body:'{}' });
  assert.equal(rejected.status, 403);
  await post(demo.url, '/api/settings', { approvedRelease:'v2.0.0', maxAgeMs:60000 });
  const settings = await (await fetch(demo.url + '/api/state')).json();
  assert.equal(settings.config.approvedRelease, 'v2.0.0');
  await post(demo.url, '/api/settings', { approvedRelease:'v1.4.0', maxAgeMs:60000 });
  await post(demo.url, '/api/reset');
  directory = await mkdtemp(join(tmpdir(), 'patchproof-ui-'));
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({ approvedRelease:'v1.4.0', maxAgeMs:60000, timeoutMs:1000, intervalMs:15000, instances:[{ id:'real-config-path', url:demo.url + '/demo/report/0' }] }));
  const configured = await launch(['--config', file]);
  try {
    const checked = await post(configured.url, '/api/check');
    assert.equal(checked.mode, 'configured');
    assert.equal(checked.records[0].report.release, 'v1.4.0');
    assert.equal((await fetch(configured.url + '/api/recover', { method:'POST', headers:{ 'content-type':'application/json' }, body:'{}' })).status, 403);
  } finally { await stop(configured.child); }
  console.log('PASS: static assets, HTTP reports, recovery, origin checks, settings, reset, configured mode, and disabled demo controls.');
} finally { await stop(demo.child); if (directory) await rm(directory, { recursive:true }); }
