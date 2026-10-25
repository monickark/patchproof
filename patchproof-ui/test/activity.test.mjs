import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VerificationStore} from '../dist/verification.mjs';
const config={approvedRelease:'v1',maxAgeMs:1000,instances:Array.from({length:6},(_,i)=>({id:`api-${i}`}))};
test('related transitions group without losing evidence; unchanged checks stay quiet',async()=>{
 let now=10000;const store=new VerificationStore(config,{clock:()=>now});
 const check=()=>store.check(async()=>config.instances.map(x=>({instanceId:x.id,report:{release:'v1',checkedAtMs:now}})));
 await check();const match=store.activity.find(x=>x.changes.length);assert.equal(match.title,'6 instances now match v1.');assert.equal(match.changes.length,6);
 const ids=store.activity.map(x=>x.id);now++;await check();assert.deepEqual(store.activity.map(x=>x.id),ids);
 now+=1000;store.tick();const expired=store.activity.find(x=>x.title==='Evidence expired for 6 instances.');assert.equal(expired.changes.length,6);
 for(const change of expired.changes){assert.equal(change.previous.status,'Match');assert.equal(change.current.reason.code,'EXPIRED_EVIDENCE');assert.equal(change.current.evidence.checkedAtMs,10001);assert.equal(change.current.latestAttempt.atMs,10001);}
 now++;await check();now+=1000;store.tick();assert.equal(store.activity.filter(x=>x.title==='Evidence expired for 6 instances.').length,2);
});
test('different transitions stay separate and history is bounded',async()=>{
 const store=new VerificationStore(config,{clock:()=>10000});
 await store.check(async()=>config.instances.map((x,i)=>({instanceId:x.id,failure:i%2?'TIMEOUT':'ENDPOINT_ERROR',detail:'HTTP 503'})));
 assert.equal(store.activity.length,2);assert.deepEqual(store.activity.map(x=>x.changes.length),[3,3]);
 for(let i=0;i<50;i++)store.event(`Action ${i}`,'Details');assert.equal(store.activity.length,40);
});
