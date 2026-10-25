import {test} from 'node:test';import assert from 'node:assert/strict';
import {VerificationStore} from '../dist/verification.mjs';import {createDemo,demoConfig,observeDemo,updateDemo,staleDemo} from '../dist/demo.mjs';
test('hosted-demo state/store complete regression with a controllable clock',async()=>{
 let now=100000;let demo=createDemo();const store=new VerificationStore(demoConfig(),{clock:()=>now});
 const check=()=>store.check(async()=>observeDemo(demo,now));
 await check();assert.deepEqual(store.view().instances.map(x=>x.status),['Match','Match','Mismatch','Mismatch','Match','Unknown']);
 updateDemo(demo,store.config.approvedRelease);store.invalidate('Demo updates simulated','Fresh observations required');assert.equal(store.view().confirmed,false);now++;await check();assert.equal(store.view().confirmed,true);
 store.setConfig({approvedRelease:'v1.5.0'});for(let i=0;i<3;i++){now++;await check();assert.ok(store.view().instances.every(x=>x.status==='Mismatch'&&x.evidence.release==='v1.4.0'));}
 updateDemo(demo,store.config.approvedRelease);store.invalidate('Demo updates simulated','Fresh observations required');assert.equal(store.view().confirmed,false);now++;await check();assert.equal(store.view().confirmed,true);
 staleDemo(demo,now,store.config.maxAgeMs);store.invalidate('Stale evidence simulated','Frozen source timestamp',{clearEvidence:true});await check();assert.equal(store.view().confirmed,false);assert.ok(store.view().instances.every(x=>x.reason.code==='EXPIRED_EVIDENCE'&&x.historical&&x.evidence.release==='v1.5.0'));
 const observed=store.records[0].evidence.checkedAtMs;const events=store.activity.map(x=>x.id);now+=1000;await check();assert.equal(store.records[0].evidence.checkedAtMs,observed);assert.deepEqual(store.activity.map(x=>x.id),events);
 updateDemo(demo,store.config.approvedRelease);store.invalidate('Demo updates simulated','Unfreeze');now++;await check();assert.equal(store.view().confirmed,true);const fresh=store.records[0].evidence.checkedAtMs;now+=60000;store.tick();assert.equal(store.view().confirmed,false);assert.equal(store.records[0].evidence.checkedAtMs,fresh);
 demo=createDemo();store.reset(demoConfig());await check();assert.equal(store.config.approvedRelease,'v1.4.0');assert.equal(store.config.maxAgeMs,60000);assert.deepEqual(store.view().instances.map(x=>x.status),['Match','Match','Mismatch','Mismatch','Match','Unknown']);
});
test('failure-reason changes are meaningful activity, while identical failures are quiet',async()=>{
 const store=new VerificationStore({approvedRelease:'v1',maxAgeMs:1000,instances:[{id:'a'}]},{clock:()=>10000});
 await store.check(async()=>[{instanceId:'a',failure:'ENDPOINT_ERROR',detail:'HTTP 503'}]);const count=store.activity.length;
 await store.check(async()=>[{instanceId:'a',failure:'ENDPOINT_ERROR',detail:'HTTP 503'}]);assert.equal(store.activity.length,count);
 await store.check(async()=>[{instanceId:'a',failure:'ENDPOINT_ERROR',detail:'HTTP 500'}]);assert.equal(store.activity.length,count+1);assert.match(store.activity[0].detail,/HTTP 503 → HTTP 500/);
});
