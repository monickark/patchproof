import {test} from 'node:test';import assert from 'node:assert/strict';
import {fetchObservation} from '../collector.mjs';import {RequestGate} from '../dist/request-gate.mjs';
const instance={id:'a',url:'http://fixture.invalid/release'};
test('collector classifies HTTP, malformed JSON, timeout, and network failures',async()=>{
 const results=[
  [async()=>({ok:false,status:503}),'ENDPOINT_ERROR'],
  [async()=>({ok:true,json:async()=>{throw SyntaxError('bad JSON')}}),'MALFORMED_REPORT'],
  [async()=>{throw Object.assign(Error('deadline'),{name:'TimeoutError'})},'TIMEOUT'],
  [async()=>{throw Error('unreachable')},'ENDPOINT_ERROR'],
 ];
 for(const [fetchImpl,reason] of results)assert.equal((await fetchObservation(instance,{timeoutMs:1000,fetchImpl})).failure,reason);
 const good=await fetchObservation(instance,{timeoutMs:1000,fetchImpl:async()=>({ok:true,json:async()=>({release:'v1',checkedAtMs:5})})});assert.equal(good.report.checkedAtMs,5);
});
test('browser request gate rejects late completions and settles cancellation and failure',async()=>{
 let resolveOld,resolveNew,accepted=[],errors=[];
 const gate=new RequestGate();
 const old=gate.run(()=>new Promise(r=>resolveOld=r),{accept:v=>accepted.push(v)});
 const fresh=gate.run(()=>new Promise(r=>resolveNew=r),{accept:v=>accepted.push(v)});
 resolveOld('old');await old;assert.equal(gate.pending,true);assert.deepEqual(accepted,[]);
 resolveNew('new');await fresh;assert.equal(gate.pending,false);assert.deepEqual(accepted,['new']);
 let resolveReset;const beforeReset=gate.run(()=>new Promise(r=>resolveReset=r),{accept:v=>accepted.push(v)});gate.cancel();resolveReset('pre-reset');await beforeReset;assert.deepEqual(accepted,['new']);
 await gate.run(async()=>{throw Error('failed')},{error:e=>errors.push(e.message)});assert.equal(gate.pending,false);assert.deepEqual(errors,['failed']);
});

test('collector real HTTP timeout and malformed JSON become structured failures',async t=>{
 const {default:http}=await import('node:http');
 const server=http.createServer((req,res)=>{if(req.url==='/hang')return;if(req.url==='/body'){res.writeHead(200,{'content-type':'application/json'});res.write('{');return;}if(req.url==='/bad'){res.end('not JSON');return;}res.writeHead(503).end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const url=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/hang','/body'])assert.equal((await fetchObservation({id:'a',url:url+path},{timeoutMs:100})).failure,'TIMEOUT');
 assert.equal((await fetchObservation({id:'a',url:url+'/bad'},{timeoutMs:1000})).failure,'MALFORMED_REPORT');
 assert.equal((await fetchObservation({id:'a',url:url+'/error'},{timeoutMs:1000})).detail,'HTTP 503');
});
