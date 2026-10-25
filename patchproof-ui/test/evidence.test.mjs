import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VerificationStore, evaluateDeployment, filterInstances } from '../dist/verification.mjs';
const initial={approvedRelease:'v1.4.0',maxAgeMs:100,instances:[{id:'a'},{id:'b'}]};
const report=(id,release='v1.4.0',checkedAtMs=950)=>({instanceId:id,report:{release,checkedAtMs}});
function fixture(){let time=1000;const store=new VerificationStore(initial,{clock:()=>time});return {store,setTime:n=>time=n};}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
test('boundaries, invalid timestamps, failures, and deterministic reason precedence',async()=>{
 const {store}=fixture();
 for(const [outcome,reason] of [
  [{failure:'TIMEOUT'},'TIMEOUT'],[{failure:'ENDPOINT_ERROR',report:{release:''}},'ENDPOINT_ERROR'],
  [{report:null},'MISSING_REPORT'],[{report:{release:'',checkedAtMs:null}},'MALFORMED_REPORT'],
  ...[undefined,null,NaN,Infinity,'950',-1,950.5,8640000000000001].map(timestamp=>[{report:{release:'v1.4.0',checkedAtMs:timestamp}},'INVALID_TIMESTAMP']),
  [{report:{release:'v1.4.0',checkedAtMs:1001}},'FUTURE_TIMESTAMP'],
  [{report:{release:'v1.4.0',checkedAtMs:900}},'EXPIRED_EVIDENCE'],
  [{report:{release:'v1.4.0',checkedAtMs:899}},'EXPIRED_EVIDENCE'],
 ]){
  store.reset(initial); await store.check(async()=>[{instanceId:'a',...outcome}]);
  assert.equal(store.view().instances[0].reason.code,reason);assert.equal(store.view().confirmed,false);
 }
});
test('fresh exact match; older or newer release mismatch; expected inventory never disappears',async()=>{
 const {store}=fixture(); await store.check(async()=>[report('a')]);
 assert.equal(store.view().instances[0].status,'Match');assert.equal(store.view().instances[1].reason.code,'MISSING_REPORT');
 for(const release of ['v1.3.0','v1.5.0']){await store.check(async()=>[report('a',release,951)]); assert.equal(store.view().instances[0].status,'Mismatch'); store.reset(initial);}
 const empty=new VerificationStore({...initial,instances:[]});assert.equal(empty.view().confirmed,false);
});
test('failed latest check preserves historical evidence and separates attempt time',async()=>{
 const {store,setTime}=fixture();await store.check(async()=>[report('a'),report('b')]);
 setTime(1020);await store.check(async()=>[{instanceId:'a',failure:'ENDPOINT_ERROR',detail:'HTTP 503'},report('b')]);
 const a=store.view().instances[0];assert.equal(a.status,'Unknown');assert.equal(a.historical,true);assert.equal(a.evidence.checkedAtMs,950);assert.equal(a.latestAttempt.atMs,1020);assert.equal(a.reason.code,'ENDPOINT_ERROR');
 setTime(1200);assert.equal(store.view().instances[0].reason.code,'ENDPOINT_ERROR');
});
test('expiry and repeated cached reads never refresh the observation time',async()=>{
 const {store,setTime}=fixture();await store.check(async()=>[report('a'),report('b')]);assert.equal(store.view().confirmed,true);
 setTime(1050);store.tick();assert.equal(store.view().confirmed,false);assert.equal(store.view().instances[0].reason.code,'EXPIRED_EVIDENCE');
 await store.check(async()=>[report('a'),report('b')]);assert.equal(store.view().confirmed,false);assert.equal(store.view().instances[0].evidence.checkedAtMs,950);
});
test('older completion cannot overwrite a newer check or clear its loading state',async()=>{
 const {store}=fixture();const old=deferred(),fresh=deferred();const p1=store.check(()=>old.promise);const p2=store.check(()=>fresh.promise);
 old.resolve([report('a','v0',950)]);assert.equal(await p1,false);assert.equal(store.checking,true);
 fresh.resolve([report('a'),report('b')]);assert.equal(await p2,true);assert.equal(store.checking,false);assert.equal(store.view().confirmed,true);
 const slow=deferred();const p3=store.check(()=>slow.promise);await store.check(async()=>[report('a','v1.5.0',980),report('b','v1.5.0',980)]);
 slow.resolve([report('a','v0',960)]);assert.equal(await p3,false);assert.equal(store.view().instances[0].evidence.release,'v1.5.0');
});
test('reset and approval change invalidate in-flight results',async()=>{
 const {store}=fixture();const delayed=deferred();const p=store.check(()=>delayed.promise);store.reset(initial);delayed.resolve([report('a'),report('b')]);assert.equal(await p,false);assert.equal(store.view().instances[0].evidence,null);
 const old=deferred();const pending=store.check(()=>old.promise);store.setConfig({approvedRelease:'v1.5.0'});old.resolve([report('a'),report('b')]);assert.equal(await pending,false);assert.equal(store.config.approvedRelease,'v1.5.0');assert.equal(store.checking,false);
 await store.check(async()=>[report('a'),report('b')]);assert.equal(store.view().instances[0].status,'Mismatch');
});
test('older source observations and conflicting equal timestamps are rejected',async()=>{
 const {store}=fixture();await store.check(async()=>[report('a','v1.4.0',980)]);await store.check(async()=>[report('a','v0',970)]);
 assert.equal(store.view().instances[0].evidence.release,'v1.4.0');assert.equal(store.view().instances[0].reason.code,'OLDER_OBSERVATION');
 await store.check(async()=>[report('a','v0',980)]);assert.equal(store.view().instances[0].reason.code,'MALFORMED_REPORT');
});
test('failure and cancellation settle loading, preserve inventory, and reject late results',async()=>{
 const {store}=fixture();await store.check(async()=>{throw Error('network down')});assert.equal(store.checking,false);assert.equal(store.view().instances[0].reason.code,'ENDPOINT_ERROR');
 const d=deferred();const p=store.check(()=>d.promise);store.cancel();assert.equal(store.checking,false);d.resolve([report('a')]);assert.equal(await p,false);
});
test('views do not affect global results; unchanged polls and ticks do not add activity',async()=>{
 const {store}=fixture();await store.check(async()=>[report('a'),report('b')]);const count=store.activity.length;
 const view=store.view();assert.equal(filterInstances(view.instances,'Mismatch','').length,0);assert.equal(filterInstances(view.instances,'All','missing').length,0);assert.equal(store.view().confirmed,true);
 await store.check(async()=>[report('a'),report('b')]);store.tick();assert.equal(store.activity.length,count);
 store.setConfig({approvedRelease:'v1.5.0'});assert.equal(store.view().confirmed,false);assert.ok(store.activity.some(x=>x.title==='Approved release changed from v1.4.0 to v1.5.0.'));
});

test('changing simulated running state requires a fresh check, and cancellation is Unknown',async()=>{
 const {store}=fixture();await store.check(async()=>[report('a'),report('b')]);
 store.invalidate('Demo updates simulated','Fresh reports required');assert.equal(store.view().confirmed,false);assert.equal(store.view().instances[0].reason.code,'AWAITING_CHECK');
 await store.check(async()=>[report('a'),report('b')]);store.cancelLatest();assert.equal(store.view().instances[0].reason.code,'CANCELLED');assert.equal(store.view().instances[0].historical,true);
});

test('cancellation retains the real attempt start; simulation invalidation is not a check attempt',async()=>{
 const {store,setTime}=fixture();const d=deferred();const pending=store.check(()=>d.promise);setTime(1010);store.cancelLatest();assert.equal(store.records[0].latestAttempt.atMs,1000);assert.equal(store.records[0].latestAttempt.completedAtMs,1010);d.resolve([]);await pending;
 store.invalidate('Demo updates simulated','Await new reports');assert.equal(store.records[0].latestAttempt.atMs,null);
});
