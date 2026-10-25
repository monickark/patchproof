import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDashboardServer} from '../server.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function start(t,options={}){
 const app=createDashboardServer(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{app.store.cancel();app.server.closeAllConnections();await new Promise(r=>app.server.close(r));});
 const post=async(action,data={})=>{const response=await fetch(url+'/api/'+action,{method:'POST',headers:{'content-type':'application/json',origin:url},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
 return {...app,url,post};
}
const config={approvedRelease:'v1.4.0',maxAgeMs:60000,timeoutMs:3000,intervalMs:15000,instances:[{id:'a',url:'http://fixture.invalid/a'}]};
const response=(release,checkedAtMs)=>({ok:true,json:async()=>({release,checkedAtMs})});
test('local demo complete approval/recovery/stale/reset regression over HTTP',async t=>{
 let now=100000;const app=await start(t,{clock:()=>now});
 await app.post('check');assert.deepEqual(app.store.view().instances.map(x=>x.status),['Match','Match','Mismatch','Mismatch','Match','Unknown']);
 now++;await app.post('recover');assert.equal(app.store.view().confirmed,true);
 await app.post('settings',{approvedRelease:'v1.5.0',maxAgeMs:60000});
 for(let i=0;i<2;i++){now++;await app.post('check');assert.ok(app.store.view().instances.every(x=>x.status==='Mismatch'&&x.evidence.release==='v1.4.0'));}
 now++;await app.post('recover');assert.ok(app.store.view().instances.every(x=>x.status==='Match'&&x.evidence.release==='v1.5.0'));
 now++;await app.post('stale');const frozen=app.store.records[0].evidence.checkedAtMs;
 assert.ok(app.store.view().instances.every(x=>x.reason.code==='EXPIRED_EVIDENCE'&&x.evidence.release==='v1.5.0'));
 now+=1000;await app.post('check');assert.equal(app.store.records[0].evidence.checkedAtMs,frozen);
 now++;await app.post('recover');assert.equal(app.store.view().confirmed,true);const observed=app.store.records[0].evidence.checkedAtMs;
 now+=60000;const cached=await (await fetch(app.url+'/api/state')).json();assert.equal(cached.records[0].evidence.checkedAtMs,observed);assert.equal(app.store.view().confirmed,false);
 now++;await app.post('reset');assert.equal(app.store.config.approvedRelease,'v1.4.0');assert.equal(app.store.config.maxAgeMs,60000);assert.deepEqual(app.store.view().instances.map(x=>x.status),['Match','Match','Mismatch','Mismatch','Match','Unknown']);
});
test('configured mode reads only, preserves history on failure, and disables every demo action',async t=>{
 let fail=false;const methods=[];
 const app=await start(t,{config,clock:()=>100000,fetchImpl:async(_url,options)=>{methods.push(options.method??'GET');return fail?{ok:false,status:503}:response('v1.4.0',99950);}});
 await app.post('check');assert.equal(app.store.view().confirmed,true);fail=true;await app.post('check');
 assert.equal(app.store.view().instances[0].reason.code,'ENDPOINT_ERROR');assert.equal(app.store.view().instances[0].historical,true);assert.equal(app.store.records[0].evidence.checkedAtMs,99950);
 for(const action of ['recover','stale','reset'])assert.equal((await app.post(action)).status,403);
 assert.ok(methods.every(x=>x==='GET'));
});
test('HTTP check responses cannot restore old approval or override a newer check',async t=>{
 let now=100000;let calls=0;const firstStarted=deferred(),secondStarted=deferred(),old=deferred(),fresh=deferred();
 const app=await start(t,{config,clock:()=>now,fetchImpl:async()=>{calls++;if(calls===1){firstStarted.resolve();return old.promise;}secondStarted.resolve();return fresh.promise;}});
 const p1=app.post('check');await firstStarted.promise;
 await app.post('settings',{approvedRelease:'v1.5.0',maxAgeMs:60000});
 const p2=app.post('check');await secondStarted.promise;now++;fresh.resolve(response('v1.4.0',100000));await p2;
 old.resolve(response('v0',99900));await p1;
 assert.equal(app.store.config.approvedRelease,'v1.5.0');assert.equal(app.store.records[0].evidence.release,'v1.4.0');assert.equal(app.store.view().instances[0].status,'Mismatch');assert.equal(app.store.checking,false);
});
test('a response started before HTTP reset cannot repopulate the reset inventory',async t=>{
 const started=deferred(),old=deferred();let firstBatch=true;
 const app=await start(t,{clock:()=>100000,fetchImpl:async url=>{if(firstBatch){started.resolve();return old.promise;}const index=Number(url.split('/').at(-1));return index===5?{ok:false,status:503}:response(index===2||index===3?'v1.3.9':'v1.4.0',100000);}});
 const p=app.post('check');await started.promise;firstBatch=false;await app.post('reset');old.resolve(response('v9',100000));await p;
 assert.equal(app.store.config.approvedRelease,'v1.4.0');assert.equal(app.store.view().instances[0].evidence.release,'v1.4.0');assert.equal(app.store.view().instances[5].status,'Unknown');
});
