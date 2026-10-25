import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, updateDemo, observeDemo, staleDemo, demoConfig } from '../dist/demo.mjs';
test('approval and repeated observations never mutate simulated running releases', () => {
  const demo = createDemo();
  updateDemo(demo, 'v1.4.0');
  const config = demoConfig(); config.approvedRelease = 'v1.5.0';
  for (const now of [100000, 110000]) assert.deepEqual(observeDemo(demo, now).map(x => x.report.release), Array(6).fill('v1.4.0'));
  updateDemo(demo, config.approvedRelease);
  assert.deepEqual(observeDemo(demo, 120000).map(x => x.report.release), Array(6).fill('v1.5.0'));
});
test('stale scenario freezes source timestamps across polling; updates and reset recover', () => {
  const demo = createDemo(); updateDemo(demo, 'v1.4.0'); staleDemo(demo, 100000, 60000);
  const first = observeDemo(demo, 100000);
  assert.equal(first[0].report.checkedAtMs, 25000);
  assert.deepEqual(observeDemo(demo, 120000), first);
  updateDemo(demo, 'v1.5.0');
  assert.equal(observeDemo(demo, 120000)[0].report.checkedAtMs, 120000);
  assert.deepEqual(createDemo(), createDemo());
  assert.equal(observeDemo(createDemo(), 100000)[5].failure, 'ENDPOINT_ERROR');
  assert.equal(demoConfig().approvedRelease, 'v1.4.0');
});
