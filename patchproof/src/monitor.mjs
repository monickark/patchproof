import { classifyDeployment } from './classify-instance.mjs';

// Validate configuration before attempting network requests.
export function validateConfig(config) {
  if (!config || typeof config.approvedRelease !== 'string' || !config.approvedRelease.trim()) throw Error('approvedRelease must be a nonempty string');
  for (const key of ['maxAgeMs', 'timeoutMs', 'intervalMs']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw Error(`${key} must be a positive integer`);
  }
  if (!Array.isArray(config.instances)) throw Error('instances must be an array');
  const ids = new Set();
  for (const instance of config.instances) {
    if (!instance || typeof instance.id !== 'string' || !instance.id.trim() || ids.has(instance.id)) throw Error('Instance IDs must be nonempty and unique');
    ids.add(instance.id);
    const url = new URL(instance.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use HTTP(S) instance URLs without embedded credentials');
  }
  return config;
}

// Fetch each instance directly, rather than a load balancer that may hide peers.
// The instance supplies checkedAtMs: stamping cached evidence with the current
// time here would incorrectly make old information look fresh.
export async function collectReport(instance, timeoutMs) {
  try {
    const response = await fetch(instance.url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      redirect: 'error',
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!body || typeof body.release !== 'string' || !body.release.trim() || !Number.isFinite(body.checkedAtMs)) {
      throw Error('Expected JSON containing release (string) and checkedAtMs (number)');
    }
    return { instanceId: instance.id, report: { release: body.release, checkedAtMs: body.checkedAtMs }, error: null };
  } catch (error) {
    return { instanceId: instance.id, report: null, error: error.name === 'TimeoutError' ? 'Check timed out' : error.message };
  }
}

export async function checkDeployment(config) {
  const reports = await Promise.all(config.instances.map(instance => collectReport(instance, config.timeoutMs)));
  const checkedAtMs = Date.now();
  const result = classifyDeployment(config.approvedRelease, reports, checkedAtMs, config.maxAgeMs);
  return {
    ...result,
    approvedRelease: config.approvedRelease,
    checkedAtMs,
    instances: result.instances.map((instance, index) => ({
      ...instance,
      release: reports[index].report?.release ?? null,
      error: reports[index].error ?? (instance.status === 'Unknown' ? 'Report is stale or dated in the future' : null),
    })),
    mismatchCount: result.instances.filter(instance => instance.status === 'Mismatch').length,
    unknownCount: result.instances.filter(instance => instance.status === 'Unknown').length,
  };
}

// Ignore timestamps when deciding whether to alert: repeated unchanged checks
// should not repeatedly notify. Failures remain visible in each check's summary.
export function stateKey(result) {
  return JSON.stringify([result.approvedRelease, result.confirmed, result.instances.map(({ instanceId, status, release }) => [instanceId, status, release])]);
}
