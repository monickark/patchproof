import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { validateConfig, checkDeployment, stateKey } from './monitor.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node dist/cli.mjs <config.json> [--watch] [--json]\nDefault: run one check. --watch repeats until Ctrl+C.');
  process.exit(0);
}
const configPath = args.find(arg => !arg.startsWith('--'));
if (!configPath || args.some(arg => arg.startsWith('--') && !['--watch', '--json'].includes(arg))) {
  console.error('Usage: node dist/cli.mjs <config.json> [--watch] [--json]');
  process.exit(1);
}
const stopping = new AbortController();
process.on('SIGINT', () => stopping.abort());
process.on('SIGTERM', () => stopping.abort());
try {
  const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
  let previous;
  do {
    const result = await checkDeployment(config);
    const changed = stateKey(result) !== previous;
    if (args.includes('--json')) {
      console.log(JSON.stringify({ ...result, notification: changed ? (result.confirmed ? 'Confirmed' : 'Attention required') : null }));
    } else {
      console.log(`\n${new Date(result.checkedAtMs).toISOString()} | approved ${result.approvedRelease}`);
      console.table(result.instances.map(({ instanceId, status, release, error }) => ({ instanceId, status, release, detail: error ?? '' })));
      console.log(`Instances: ${result.totalInstances} | Mismatches: ${result.mismatchCount} | Unknown: ${result.unknownCount}`);
      if (changed) console.log(result.confirmed ? 'CONFIRMED: Every configured instance matches.' : 'ATTENTION: Deployment is unconfirmed. Check the instances above.');
    }
    previous = stateKey(result);
    if (!args.includes('--watch')) { process.exitCode = result.confirmed ? 0 : 2; break; }
    try { await sleep(config.intervalMs, undefined, { signal: stopping.signal }); } catch { break; }
  } while (!stopping.signal.aborted);
} catch (error) {
  console.error(`PatchProof: ${error.message}`);
  process.exitCode = 1;
}
