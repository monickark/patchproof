import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../patchproof/dist/monitor.mjs';
import { VerificationStore } from './dist/verification.mjs';
import { createDemo, demoConfig, updateDemo, staleDemo, observeDemo } from './dist/demo.mjs';
import { fetchObservation } from './collector.mjs';

export function createDashboardServer({config=null,clock=Date.now,fetchImpl=fetch}={}) {
  const isDemo=config===null;
  if(!isDemo)validateConfig(config);
  let demo=createDemo();
  const store=new VerificationStore(isDemo?demoConfig():{application:'Configured application',environment:'Local configuration',...config},{clock,mode:isDemo?'local-demo':'configured'});
  const snapshot=()=>({...store.snapshot(),scenario:demo.frozenAtMs===null?'live':'stale'});
  const check=()=>store.check(async (inventory,token)=>Promise.all(inventory.map((instance,index)=>fetchObservation(
    {...instance,url:isDemo?`http://127.0.0.1:${server.address().port}/demo/report/${index}`:instance.url},
    {timeoutMs:store.config.timeoutMs,signal:token.signal,fetchImpl}
  ))));
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(isDemo&&path.startsWith('/demo/report/')){
        if(req.method!=='GET')return json(res,405,{error:'Use GET'});
        const index=Number(path.split('/').at(-1));const outcome=observeDemo(demo,clock())[index];
        if(!outcome)return json(res,404,{error:'No such demo instance'});
        return json(res,outcome.failure?503:200,outcome.report??{error:outcome.detail});
      }
      if(path.startsWith('/api/')){
        if(req.method==='GET'&&path==='/api/state')return json(res,200,snapshot());
        if(req.method!=='POST')return json(res,405,{error:'Use POST'});
        const origin=`http://127.0.0.1:${server.address().port}`;
        if((req.headers.origin&&req.headers.origin!==origin)||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'Same-origin JSON requests required'});
        let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return json(res,413,{error:'Request too large'});}
        const input=JSON.parse(body||'{}');
        if(path==='/api/cancel'){store.cancelLatest();return json(res,200,snapshot());}
        if(path==='/api/settings'){
          if(typeof input.approvedRelease!=='string'||!input.approvedRelease.trim()||input.approvedRelease.length>100||!Number.isSafeInteger(input.maxAgeMs)||input.maxAgeMs<=0||input.maxAgeMs>86400000)return json(res,400,{error:'Invalid settings'});
          store.setConfig({approvedRelease:input.approvedRelease.trim(),maxAgeMs:input.maxAgeMs});
          return json(res,200,snapshot());
        }
        if(['/api/recover','/api/reset','/api/stale'].includes(path)){
          if(!isDemo)return json(res,403,{error:'Simulation controls are disabled for configured endpoints'});
          if(path==='/api/reset'){demo=createDemo();store.reset(demoConfig());}
          if(path==='/api/recover'){updateDemo(demo,store.config.approvedRelease);store.invalidate('Demo updates simulated',`Simulated running releases set to ${store.config.approvedRelease}. Collecting new evidence.`);}
          if(path==='/api/stale'){staleDemo(demo,clock(),store.config.maxAgeMs);store.invalidate('Stale evidence simulated','Demo source timestamps frozen beyond the freshness limit. Polling cannot refresh them; simulate updates or reset to recover.',{clearEvidence:true});}
        } else if(path!=='/api/check')return json(res,404,{error:'Unknown action'});
        await check();return json(res,200,snapshot());
      }
      if(req.method!=='GET')return json(res,405,{error:'Use GET'});
      const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.mjs':'app.mjs','/classify-instance.mjs':'classify-instance.mjs','/verification.mjs':'verification.mjs','/demo.mjs':'demo.mjs','/request-gate.mjs':'request-gate.mjs'};
      const file=files[path];if(!file)return json(res,404,{error:'Not found'});
      const content=await readFile(new URL(`./dist/${file}`,import.meta.url));
      res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(content);
    }catch(error){if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
  });
  return {server,store,snapshot};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),ci=args.indexOf('--config'),pi=args.indexOf('--port');
  const port=pi<0?4173:Number(args[pi+1]);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid --port');
  const config=ci<0?null:JSON.parse(await readFile(args[ci+1],'utf8'));
  const {server}=createDashboardServer({config});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(`PatchProof dashboard: http://127.0.0.1:${server.address().port}`);
  console.log(config?'Read-only instance checks from local config':'Local demo · six simulated HTTP endpoints');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
