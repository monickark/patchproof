// Read-only HTTP collection. The source produces checkedAtMs; receipt time is
// recorded separately by VerificationStore and never substituted for source time.
export async function fetchObservation(instance,{timeoutMs,signal,fetchImpl=fetch}) {
  const timeout=AbortSignal.timeout(timeoutMs);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try {
    const response=await fetchImpl(instance.url,{signal:combined,redirect:'error',headers:{accept:'application/json','cache-control':'no-cache'}});
    if(!response.ok)return {instanceId:instance.id,failure:'ENDPOINT_ERROR',detail:`HTTP ${response.status}`};
    try {return {instanceId:instance.id,report:await response.json()};}
    catch(error){return {instanceId:instance.id,failure:timeout.aborted?'TIMEOUT':signal?.aborted?'CANCELLED':'MALFORMED_REPORT',detail:timeout.aborted?'Report timed out':`Report could not be read as JSON: ${error.message}`};}
  } catch(error){return {instanceId:instance.id,failure:timeout.aborted||error.name==='TimeoutError'?'TIMEOUT':signal?.aborted?'CANCELLED':'ENDPOINT_ERROR',detail:error.message};}
}
