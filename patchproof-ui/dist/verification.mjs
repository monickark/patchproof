// Shared by the hosted demo and the loopback Node dashboard. No DOM or I/O.
export const validTimestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const copy = value => structuredClone(value);
const reason = (code, message, nextAction) => ({code,message,nextAction});
export function reportProblem(report, nowMs) {
  if (report === null || report === undefined) return 'MISSING_REPORT';
  if (typeof report !== 'object' || Array.isArray(report) || typeof report.release !== 'string' || !report.release.trim()) return 'MALFORMED_REPORT';
  if (!validTimestamp(report.checkedAtMs)) return 'INVALID_TIMESTAMP';
  if (report.checkedAtMs > nowMs) return 'FUTURE_TIMESTAMP';
  return null;
}
export function explain(code, record, config, nowMs) {
  const age = record.evidence ? Math.max(0, (nowMs-record.evidence.checkedAtMs)/1000) : null;
  const limit = config.maxAgeMs/1000;
  const explanations = {
    MISSING_REPORT:['No report was received for this expected instance.','Restore reporting and check again.'],
    EXPIRED_EVIDENCE:[`Last evidence is ${Number(age?.toFixed(1))} seconds old. The freshness limit is ${limit} seconds.`,'Restore fresh reporting and check again.'],
    INVALID_TIMESTAMP:['The latest report has a missing, nonnumeric, nonfinite, or invalid observation timestamp.','Return checkedAtMs as a valid Unix timestamp in milliseconds, then check again.'],
    FUTURE_TIMESTAMP:['The latest observation timestamp is in the future relative to the monitor clock.','Synchronize the instance and monitor clocks, then check again.'],
    TIMEOUT:['The latest check timed out before a complete report was received.','Investigate endpoint reachability and response time, then check again.'],
    ENDPOINT_ERROR:[record.latestAttempt?.detail || 'The instance endpoint could not be checked.','Investigate the endpoint or HTTP error, restore reporting, and check again.'],
    MALFORMED_REPORT:[record.latestAttempt?.detail || 'The latest response is not a valid report with a nonempty release.','Return valid JSON with release and checkedAtMs, then check again.'],
    OLDER_OBSERVATION:['The endpoint returned an observation older than the last accepted evidence. It was not accepted.','Investigate stale caches or reporting order, then collect a newer observation.'],
    AWAITING_CHECK:['Simulated running state changed; fresh evidence has not yet been collected.','Check now to observe the instances.'],
    CANCELLED:['The latest check was cancelled before it completed.','Check again to collect fresh evidence.'],
    RELEASE_MISMATCH:['The fresh reported release differs from the approved release. Newer unapproved releases are mismatches too.','Update this instance to the approved release, then check again.'],
    MATCH:['Fresh evidence reports the exact approved release.','No release mismatch detected. Continue monitoring evidence freshness.'],
  };
  return reason(code,...(explanations[code] ?? explanations.ENDPOINT_ERROR));
}
export function evaluateDeployment(config, records, nowMs) {
  // Inventory comes from configuration, never from whichever endpoints replied.
  const instances = config.instances.map(expected => {
    const record = records.find(item=>item.instanceId===expected.id) ?? {instanceId:expected.id,description:expected.description,evidence:null,latestAttempt:null};
    // Precedence: latest attempt failure > no report > invalid/future timestamp >
    // expired evidence > release mismatch > match. Age never hides a known 503.
    let code = record.latestAttempt?.failure ?? reportProblem(record.evidence,nowMs);
    if (!code && nowMs-record.evidence.checkedAtMs >= config.maxAgeMs) code='EXPIRED_EVIDENCE';
    if (!code) code=record.evidence.release===config.approvedRelease ? 'MATCH' : 'RELEASE_MISMATCH';
    const status=code==='MATCH' ? 'Match' : code==='RELEASE_MISMATCH' ? 'Mismatch' : 'Unknown';
    return {...copy(record),status,reason:explain(code,record,config,nowMs),historical:!!record.evidence && status==='Unknown',ageMs:record.evidence ? nowMs-record.evidence.checkedAtMs : null};
  });
  return {instances,totalInstances:instances.length,confirmed:instances.length>0 && instances.every(item=>item.status==='Match'),mismatchCount:instances.filter(item=>item.status==='Mismatch').length,unknownCount:instances.filter(item=>item.status==='Unknown').length};
}
export function filterInstances(instances, filter='All', query='') {
  const search=query.trim().toLowerCase();
  return instances.filter(item=>(filter==='All'||item.status===filter)&&`${item.instanceId} ${item.description ?? ''} ${item.evidence?.release ?? ''}`.toLowerCase().includes(search));
}
export class VerificationStore {
  constructor(config,{clock=Date.now,mode='browser-demo'}={}) {
    this.clock=clock;this.mode=mode;this.config=copy(config);this.epoch=0;this.sequence=0;this.revision=0;this.checking=false;this.activity=[];this.checkedAtMs=null;
    this.records=this.emptyRecords();this.previous=this.view();
  }
  emptyRecords() { return this.config.instances.map(item=>({instanceId:item.id,description:item.description ?? 'Configured instance',evidence:null,latestAttempt:null})); }
  view() { return evaluateDeployment(this.config,this.records,this.clock()); }
  event(title,detail,good=false,changes=[]) {this.activity.unshift({id:++this.revision,time:this.clock(),title,detail,good,changes});this.activity=this.activity.slice(0,40);}
  tick() {
    const next=this.view();
    // A tick is one check, action, or expiry batch. Never merge separate ticks.
    const groups=new Map();
    for(const item of next.instances){
      const old=this.previous.instances.find(x=>x.instanceId===item.instanceId);
      if(!old || old.status!==item.status || old.reason.code!==item.reason.code || old.evidence?.release!==item.evidence?.release || (old.latestAttempt?.detail??null)!==(item.latestAttempt?.detail??null)){
        const key=JSON.stringify([old?.status,old?.reason.code,item.status,item.reason.code]);
        const changes=groups.get(key)??[];
        changes.push({instanceId:item.instanceId,previous:copy(old??null),current:copy(item),approvedRelease:this.config.approvedRelease});
        groups.set(key,changes);
      }
    }
    for(const changes of groups.values()){
      const first=changes[0], item=first.current;
      const subject=changes.length===1?first.instanceId:`${changes.length} instances`;
      const code=item.reason.code;
      const titles={
        MATCH:`${subject} now ${changes.length===1?'matches':'match'} ${this.config.approvedRelease}.`,
        RELEASE_MISMATCH:`${subject} ${changes.length===1?'does':'do'} not match ${this.config.approvedRelease}.`,
        EXPIRED_EVIDENCE:`Evidence expired for ${subject}.`,
        CANCELLED:`Check cancelled for ${subject}.`,
        AWAITING_CHECK:`Fresh check needed for ${subject}.`,
        MISSING_REPORT:`Report missing for ${subject}.`,
        ENDPOINT_ERROR:`Endpoint check failed for ${subject}.`,
        TIMEOUT:`Check timed out for ${subject}.`,
        INVALID_TIMESTAMP:`Invalid evidence timestamp for ${subject}.`,
        FUTURE_TIMESTAMP:`Future evidence timestamp for ${subject}.`,
        MALFORMED_REPORT:`Invalid report for ${subject}.`,
        OLDER_OBSERVATION:`Older observation rejected for ${subject}.`
      };
      const detail=changes.map(({instanceId,previous,current})=>`${instanceId}: ${previous?.reason.code??'MISSING_REPORT'} → ${current.reason.code}; reported ${previous?.evidence?.release??'unavailable'} → ${current.evidence?.release??'unavailable'}; endpoint detail: ${previous?.latestAttempt?.detail??'none'} → ${current.latestAttempt?.detail??'none'}`).join('\n');
      this.event(titles[code]??`Evidence changed for ${subject}.`,detail,item.status==='Match',changes);
    }
    if(this.previous.confirmed!==next.confirmed)this.event(next.confirmed?'Deployment confirmed':'Deployment became unconfirmed',`${next.totalInstances} expected instances; ${next.mismatchCount} mismatched, ${next.unknownCount} unknown.`,next.confirmed);
    this.previous=next;
    return next;
  }
  cancel() {
    this.abort?.abort();this.epoch++;this.sequence++;this.revision++;this.checking=false;
  }
  cancelLatest() {
    this.cancel();
    for(const item of this.records)item.latestAttempt={atMs:this.attemptStartedAtMs??this.clock(),completedAtMs:this.clock(),outcome:'cancelled',failure:'CANCELLED'};
    this.event('Check cancelled','In-flight evidence was discarded; prior observations are historical.');this.tick();
  }
  setConfig(changes) {
    if(typeof changes.approvedRelease==='string'&&!changes.approvedRelease.trim())throw Error('Approved release is required');
    if(changes.maxAgeMs!==undefined&&(!Number.isSafeInteger(changes.maxAgeMs)||changes.maxAgeMs<=0))throw Error('Freshness limit must be positive');
    this.cancel();const old=this.config;this.config={...this.config,...copy(changes)};
    if(old.approvedRelease!==this.config.approvedRelease)this.event(`Approved release changed from ${old.approvedRelease} to ${this.config.approvedRelease}.`,`${old.approvedRelease} → ${this.config.approvedRelease}. Running releases were not changed.`);
    if(old.maxAgeMs!==this.config.maxAgeMs)this.event('Freshness limit changed',`${old.maxAgeMs/1000}s → ${this.config.maxAgeMs/1000}s.`);
    this.tick();
  }
  invalidate(title,detail,{clearEvidence=false}={}) {
    this.cancel();this.event(title,detail);
    for(const item of this.records){if(clearEvidence)item.evidence=null;item.latestAttempt={atMs:null,completedAtMs:null,outcome:'not checked',failure:'AWAITING_CHECK'};}
    this.tick();
  }
  reset(config=this.config) {
    this.cancel();this.config=copy(config);this.records=this.emptyRecords();this.checkedAtMs=null;this.activity=[];this.previous=this.view();this.event('Demo reset','Initial approval, freshness limit, running releases, availability, and source timestamps restored.');
  }
  begin() {
    this.abort?.abort();this.abort=new AbortController();this.checking=true;this.revision++;this.attemptStartedAtMs=this.clock();
    return {epoch:this.epoch,sequence:++this.sequence,atMs:this.attemptStartedAtMs,signal:this.abort.signal};
  }
  current(token) {return token.epoch===this.epoch&&token.sequence===this.sequence;}
  complete(token,outcomes) {
    if(!this.current(token))return false;
    const now=this.clock();
    for(const record of this.records){
      const outcome=outcomes.find(item=>item.instanceId===record.instanceId) ?? {failure:'MISSING_REPORT'};
      let failure=outcome.failure ?? reportProblem(outcome.report,now);
      let detail=outcome.detail;
      if(!failure&&record.evidence&&outcome.report.checkedAtMs<record.evidence.checkedAtMs)failure='OLDER_OBSERVATION';
      if(!failure&&record.evidence&&outcome.report.checkedAtMs===record.evidence.checkedAtMs&&outcome.report.release!==record.evidence.release){failure='MALFORMED_REPORT';detail='The same observation timestamp was reused with a conflicting release.';}
      record.latestAttempt={atMs:token.atMs,completedAtMs:now,outcome:failure?'failed':'report received',failure:failure ?? null,detail:detail ?? null,
        reportedRelease:typeof outcome.report?.release==='string'?outcome.report.release:null,
        reportedTimestamp:validTimestamp(outcome.report?.checkedAtMs)?outcome.report.checkedAtMs:null};
      if(!failure)record.evidence={release:outcome.report.release,checkedAtMs:outcome.report.checkedAtMs};
    }
    this.checkedAtMs=now;this.checking=false;this.revision++;this.tick();return true;
  }
  async check(collect) {
    const token=this.begin();
    try {const outcomes=await collect(copy(this.config.instances),token);return this.complete(token,Array.isArray(outcomes)?outcomes:[]);}
    catch(error){return this.complete(token,this.config.instances.map(item=>({instanceId:item.id,failure:token.signal.aborted?'CANCELLED':'ENDPOINT_ERROR',detail:error.message})));}
    finally {if(this.current(token))this.checking=false;}
  }
  snapshot() {
    this.tick();
    const config={...copy(this.config),instances:this.config.instances.map(({id,description})=>({id,description}))};
    return {config,mode:this.mode,records:this.records.map(item=>({...copy(item),report:item.latestAttempt?.failure?null:copy(item.evidence)})),checking:this.checking,checkedAtMs:this.checkedAtMs,epoch:this.epoch,sequence:this.sequence,revision:this.revision,activity:copy(this.activity)};
  }
}
