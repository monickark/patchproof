import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInstance, classifyDeployment } from './dist/classify-instance.mjs';
const report = (release = 'v1.4.0', checkedAtMs = 950) => ({ release, checkedAtMs });
test('fresh approved release matches; older and newer unapproved releases mismatch', () => {
  assert.equal(classifyInstance('v1.4.0', report(), 1000, 100), 'Match');
  for (const release of ['v1.3.9', 'v1.5.0']) assert.equal(classifyInstance('v1.4.0', report(release), 1000, 100), 'Mismatch');
});
test('at and beyond the freshness limit, evidence is Unknown', () => {
  for (const timestamp of [900, 899]) assert.equal(classifyInstance('v1.4.0', report('v1.4.0', timestamp), 1000, 100), 'Unknown');
});
test('missing, invalid, and future timestamps are Unknown', () => {
  for (const timestamp of [undefined, null, '950', NaN, Infinity, 1001]) assert.equal(classifyInstance('v1.4.0', report('v1.4.0', timestamp === undefined ? NaN : timestamp), 1000, 100), 'Unknown');
  assert.equal(classifyInstance('v1.4.0', { release:'v1.4.0' }, 1000, 100), 'Unknown');
});
test('failed checks and empty expected inventory never confirm', () => {
  assert.equal(classifyInstance('v1.4.0', null, 1000, 100), 'Unknown');
  assert.equal(classifyDeployment('v1.4.0', [], 1000, 100).confirmed, false);
  assert.equal(classifyDeployment('v1.4.0', [{ instanceId:'a', report:null }], 1000, 100).confirmed, false);
});
test('advancing time expires confirmation without replacing or refreshing the report', () => {
  const instances = [{ instanceId:'a', report:report() }];
  assert.equal(classifyDeployment('v1.4.0', instances, 1000, 100).confirmed, true);
  assert.equal(classifyDeployment('v1.4.0', instances, 1050, 100).confirmed, false);
  assert.equal(instances[0].report.checkedAtMs, 950);
});
test('changing approval recomputes against the same evidence', () => {
  const instances = [{ instanceId:'a', report:report() }];
  assert.equal(classifyDeployment('v1.4.0', instances, 1000, 100).confirmed, true);
  assert.equal(classifyDeployment('v1.5.0', instances, 1000, 100).instances[0].status, 'Mismatch');
  assert.equal(classifyDeployment('v1.4.0', instances, 1000, 100).confirmed, true);
});

// The former TODO is covered by a real deferred-response regression.
import { VerificationStore } from './dist/verification.mjs';
test('a delayed older result cannot overwrite a newer accepted result', async () => {
  const store = new VerificationStore({ approvedRelease:'v1.4.0', maxAgeMs:100, instances:[{id:'a'}] }, {clock:()=>1000});
  let finish;
  const old = store.check(() => new Promise(resolve => finish = resolve));
  await store.check(async () => [{instanceId:'a',report:{release:'v1.4.0',checkedAtMs:990}}]);
  finish([{instanceId:'a',report:{release:'v0',checkedAtMs:980}}]);
  assert.equal(await old, false);
  assert.equal(store.view().confirmed, true);
});
