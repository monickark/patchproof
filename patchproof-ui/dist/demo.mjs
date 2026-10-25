// Expected configuration and simulated running processes are separate objects.
export function demoConfig() {
  return { approvedRelease:'v1.4.0', maxAgeMs:60000, timeoutMs:3000, intervalMs:15000,
    application:'PatchProof sample app', environment:'Demo · ap-south-1',
    instances:createDemo().instances.map(({ instanceId, description }) => ({ id:instanceId, description })) };
}
export function createDemo() {
  return { frozenAtMs:null, instances:[
    ['api-prod-01','API server · ap-south-1','v1.4.0',true],
    ['api-prod-02','API server · ap-south-1','v1.4.0',true],
    ['worker-prod-01','Background worker · ap-south-1','v1.3.9',true],
    ['worker-prod-02','Background worker · ap-south-1','v1.3.9',true],
    ['web-prod-01','Web container · ap-south-1','v1.4.0',true],
    ['web-prod-02','Web container · ap-south-1',null,false],
  ].map(([instanceId,description,runningRelease,available]) => ({instanceId,description,runningRelease,available})) };
}
export function updateDemo(demo, approvedRelease) {
  for (const instance of demo.instances) { instance.runningRelease=approvedRelease; instance.available=true; }
  demo.frozenAtMs=null;
}
export function staleDemo(demo, nowMs, maxAgeMs) {
  // Freeze the source, not the monitor clock. Polling keeps seeing cached data.
  demo.frozenAtMs=nowMs-maxAgeMs-15000;
}
export function observeDemo(demo, nowMs) {
  return demo.instances.map(instance => instance.available
    ? { instanceId:instance.instanceId, report:{release:instance.runningRelease,checkedAtMs:demo.frozenAtMs ?? nowMs} }
    : { instanceId:instance.instanceId, failure:'ENDPOINT_ERROR', detail:'HTTP 503: simulated endpoint unavailable' });
}
