import { VerificationStore, evaluateDeployment, filterInstances, validTimestamp } from './verification.mjs';
import { createDemo, demoConfig, updateDemo, staleDemo, observeDemo } from './demo.mjs';
import { RequestGate } from './request-gate.mjs';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gate=new RequestGate();
let demo=createDemo(),store=new VerificationStore(demoConfig()),remote=null,ready=false;
let currentFilter='All',lastResult,rowsKey,activityKey,selectedInstanceId,toastTimer,lastPollAt=Date.now();
let remotePrevious,remoteEvents=[],uiEventId=0;
const labels={MISSING_REPORT:'Missing report',EXPIRED_EVIDENCE:'Expired evidence',INVALID_TIMESTAMP:'Invalid timestamp',FUTURE_TIMESTAMP:'Future timestamp',TIMEOUT:'Check timed out',ENDPOINT_ERROR:'Endpoint error',MALFORMED_REPORT:'Malformed report',OLDER_OBSERVATION:'Older observation rejected',AWAITING_CHECK:'Fresh check required',CANCELLED:'Check cancelled',RELEASE_MISMATCH:'Unapproved release',MATCH:'Fresh exact match'};
const snapshot=()=>remote??{...store.snapshot(),scenario:demo.frozenAtMs===null?'live':'stale'};
function relative(timestamp){if(!validTimestamp(timestamp))return 'No observation';const age=(Date.now()-timestamp)/1000;if(age<0)return 'Future timestamp';if(age<2)return 'Just now';if(age<60)return `${Math.floor(age)}s ago`;return `${Math.floor(age/60)}m ago`;}
const iso=timestamp=>validTimestamp(timestamp)?new Date(timestamp).toISOString():'Unavailable';
function badge(status){return `<span class="status-pill ${status==='Match'?'success':status==='Mismatch'?'warning':'unknown'}">${status==='Match'?'✓':status==='Mismatch'?'◌':'–'} ${status}</span>`;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function syncMode(state){
 const isDemo=state.mode!=='configured';
 $('#mode-label').textContent=isDemo?'Demo workspace':'Local instance monitor';
 $('#demo-description').innerHTML=state.mode==='browser-demo'
  ?'<strong>Interactive demo.</strong> Check now checks simulated instances in this hosted demo. No production servers are connected.'
  :isDemo?'<strong>Local demo.</strong> Check now checks simulated instances through local HTTP endpoints. No production servers are connected.'
  :'<strong>Local configured mode.</strong> Check now reads your configured instance endpoints. Simulation controls are disabled.';
 for(const id of ['reset-demo','demo-actions','recover'])$('#'+id).hidden=!isDemo;
 $('#scenario-banner').hidden=!isDemo||state.scenario!=='stale';
 $('#recover-description').textContent=isDemo?'Demo only · changes simulated running releases, then collects fresh reports':'Update your servers yourself, then Check now. This checker only reads reports.';
 $('#application-context').textContent=`Application: ${state.config.application??'Configured application'} · Environment: ${state.config.environment??'Local configuration'}. ${isDemo?'All listed demo components are assumed to share one approved release.':'This inventory is treated as one application/environment sharing one approved release.'}`;
 $('#help-mode').textContent=isDemo?'This is a simulated demonstration. The local setup guide below the activity feed explains how to check your own instances.':'Real checks are GET requests from the local Node process. Settings and activity are kept in process memory, not saved to the config file.';
 $('.auto-interval').textContent=`${state.config.intervalMs/1000}s`;
}
function detailMarkup(item,state){
 const attempt=item.latestAttempt;
 return `${badge(item.status)}<p class="evidence-message">${escape(item.reason.message)}</p><p class="evidence-action"><strong>Next action:</strong> ${escape(item.reason.nextAction)}</p>
 <dl><dt>Reason code</dt><dd>${escape(item.reason.code)}</dd><dt>Application / environment</dt><dd>${escape(state.config.application??'Configured application')} / ${escape(state.config.environment??'Local configuration')}</dd>
 <dt>Approved release</dt><dd>${escape(state.config.approvedRelease)}</dd><dt>Last observed release</dt><dd>${escape(item.evidence?.release??'No usable evidence')}${item.historical?' <strong>(historical; not a successful latest check)</strong>':''}</dd>
 <dt>Evidence observed at</dt><dd>${escape(iso(item.evidence?.checkedAtMs))}</dd><dt>Evidence age</dt><dd>${item.ageMs===null?'Unavailable':`${Math.max(0,item.ageMs/1000).toFixed(1)} seconds`}</dd><dt>Freshness limit</dt><dd>${state.config.maxAgeMs/1000} seconds</dd>
 <dt>Latest attempt started</dt><dd>${escape(iso(attempt?.atMs))}</dd><dt>Attempt completed</dt><dd>${escape(iso(attempt?.completedAtMs))}</dd><dt>Latest attempt outcome</dt><dd>${escape(attempt?.outcome??'Not attempted')}${attempt?.failure?' · '+escape(labels[attempt.failure]??attempt.failure):''}${attempt?.detail?' · '+escape(attempt.detail):''}</dd>
 ${attempt?.failure&&attempt.reportedRelease?`<dt>Rejected report release</dt><dd>${escape(attempt.reportedRelease)} (unverified)</dd><dt>Rejected report timestamp</dt><dd>${escape(iso(attempt.reportedTimestamp))}</dd>`:''}</dl>`;
}
function render(){
 const state=snapshot();const result=evaluateDeployment(state.config,state.records,Date.now());lastResult=result;
 syncMode(state);
 const counts={All:result.totalInstances,Match:result.instances.filter(x=>x.status==='Match').length,Mismatch:result.mismatchCount,Unknown:result.unknownCount};
 for(const [id,value] of Object.entries({total:counts.All,matching:counts.Match,mismatched:counts.Mismatch,unknown:counts.Unknown,'nav-count':counts.All,'instance-count':counts.All,'approved-release':state.config.approvedRelease}))$('#'+id).textContent=value;
 for(const [key,id] of Object.entries({All:'all',Match:'match',Mismatch:'mismatch',Unknown:'unknown'}))$('#tab-'+id).textContent=counts[key];
 $('#deployment-status').className=`status-pill ${result.confirmed?'success':'warning'}`;
 $('#deployment-status').textContent=result.confirmed?'✓ Deployment confirmed':'◌ Unconfirmed';
 $('#summary-detail').textContent=result.confirmed?'Every expected instance has fresh, matching evidence':counts.All?`${counts.Mismatch+counts.Unknown} of ${counts.All} instances need attention`:'No instances in the expected inventory';
 $('#last-checked').textContent=state.checkedAtMs?`Last attempt completed ${relative(state.checkedAtMs).toLowerCase()}`:'No completed check yet';
 $('#footer-check').textContent=state.checkedAtMs?`Last attempt ${new Date(state.checkedAtMs).toLocaleTimeString()}`:'Awaiting first check';
 const shown=filterInstances(result.instances,currentFilter,$('#search').value);
 const nextRowsKey=JSON.stringify(shown.map(item=>[item.instanceId,item.description,item.status,item.reason.code,item.historical,item.evidence?.release,item.latestAttempt?.outcome]));
 if(nextRowsKey!==rowsKey){
  const active=document.activeElement?.getAttribute('data-instance');rowsKey=nextRowsKey;
  $('#instance-rows').innerHTML=shown.length?shown.map(item=>`<tr><td><div class="instance-cell"><span class="server-icon" aria-hidden="true">▤</span><div><div class="instance-name">${escape(item.instanceId)}</div><div class="instance-meta">${escape(item.description)}</div></div></div></td>
  <td>${item.evidence?`<span class="release-code">${escape(item.evidence.release)}</span>${item.historical?'<span class="historical-label">Historical evidence</span>':''}`:'<span class="evidence">No usable evidence</span>'}</td>
  <td>${badge(item.status)}<span class="reason-label">${escape(labels[item.reason.code]??item.reason.code)}</span></td><td><span class="evidence" data-observed="${escape(item.instanceId)}"></span></td>
  <td><span class="attempt-time" data-attempt="${escape(item.instanceId)}"></span><span class="reason-label">${escape(item.latestAttempt?.outcome??'Not attempted')}</span></td><td><button class="detail-button" data-instance="${escape(item.instanceId)}" aria-label="View evidence for ${escape(item.instanceId)}">↗</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-row">No instances match this view.</td></tr>';
  if(active&&!document.querySelector('dialog[open]'))[...document.querySelectorAll('[data-instance]')].find(button=>button.dataset.instance===active)?.focus();
 }
 for(const element of document.querySelectorAll('[data-observed]')){const item=shown.find(x=>x.instanceId===element.dataset.observed);element.textContent=relative(item?.evidence?.checkedAtMs);element.title=iso(item?.evidence?.checkedAtMs);}
 for(const element of document.querySelectorAll('[data-attempt]')){const item=shown.find(x=>x.instanceId===element.dataset.attempt);element.textContent=validTimestamp(item?.latestAttempt?.atMs)?relative(item.latestAttempt.atMs):'Not attempted';element.title=iso(item?.latestAttempt?.atMs);}
 $('#shown-count').textContent=`Showing ${shown.length} of ${counts.All} expected instances`;
 for(const button of document.querySelectorAll('.tab')){button.classList.toggle('active',button.dataset.filter===currentFilter);button.setAttribute('aria-pressed',String(button.dataset.filter===currentFilter));}
 if(remote){
  if(remotePrevious&&remotePrevious.confirmed!==result.confirmed){remoteEvents.unshift({id:`view-${++uiEventId}`,time:Date.now(),title:result.confirmed?'Deployment confirmed in this view':result.instances.some(item=>item.reason.code==='EXPIRED_EVIDENCE')?'Evidence expired in this view':'Deployment became unconfirmed in this view',detail:`${counts.Match} matching, ${counts.Mismatch} mismatched, ${counts.Unknown} unknown.`,good:result.confirmed});remoteEvents=remoteEvents.slice(0,10);}
  remotePrevious=result;
 }
 const activities=[...(state.activity??[]),...remoteEvents].sort((a,b)=>b.time-a.time).slice(0,40);
 const nextActivityKey=JSON.stringify(activities.map(item=>item.id));
 if(nextActivityKey!==activityKey){
  const initial=activityKey===undefined;activityKey=nextActivityKey;
  const opened=new Set([...document.querySelectorAll('#activity-list details[open]')].map(item=>item.dataset.event));
  const focused=document.activeElement?.closest('#activity-list details')?.dataset.event;
  $('#activity-list').innerHTML=activities.length?activities.map(item=>`<div class="activity-item"><span class="activity-dot ${item.good?'good':''}" aria-hidden="true">${item.good?'✓':'!'}</span><details data-event="${escape(String(item.id))}" ${opened.has(String(item.id))?'open':''}><summary>${escape(item.title)}</summary><p>${escape(item.detail)}</p>${(item.changes??[]).map(change=>`<div class="activity-change"><strong>${escape(change.instanceId)}</strong><pre>${escape(JSON.stringify(change,null,2))}</pre></div>`).join('')}</details><time datetime="${iso(item.time)}">${escape(new Date(item.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time></div>`).join(''):'<p class="form-note">Run a check to start verification activity.</p>';
  if(focused) [...document.querySelectorAll('#activity-list details')].find(item=>item.dataset.event===focused)?.querySelector('summary')?.focus();
  if(!initial&&activities[0])$('#activity-announcement').textContent=activities[0].title;
 }
 if($('#details-dialog').open&&selectedInstanceId){const item=result.instances.find(x=>x.instanceId===selectedInstanceId);if(item){const html=detailMarkup(item,state);if($('#details-content').innerHTML!==html)$('#details-content').innerHTML=html;}}
 const pending=gate.pending;
 $('#check').disabled=!ready||pending;$('#check-label').textContent=pending?'Checking…':'Check now';$('#cancel-check').hidden=!pending;
 for(const id of ['recover','reset-demo','demo-update','simulate-stale'])$('#'+id).disabled=!ready||state.mode==='configured';
}
async function api(action,data,signal){
 const response=await fetch('/api/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data??{}),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 if(!response.ok)throw Error(`Monitor request failed (${response.status})`);return response.json();
}
function pause(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Cancelled','AbortError'));const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});});}
async function perform(action='check',data={}){
 if(!ready)return;
 lastPollAt=Date.now();
 if(action==='reset'){currentFilter='All';$('#search').value='';$('#auto-check').checked=true;remoteEvents=[];}
 const promise=gate.run(async signal=>{
  if(remote){
   if(['recover','stale','reset'].includes(action))remote={...remote,records:remote.records.map(item=>({...item,latestAttempt:{atMs:Date.now(),outcome:'not checked',failure:'AWAITING_CHECK'}}))};
   const result=await api(action,data,signal);
   // Save & check must collect reports too; saving approval alone is not a check.
   return action==='settings'?api('check',{},signal):result;
  }
  if(action==='settings')store.setConfig(data);
  if(action==='reset'){demo=createDemo();store.reset(demoConfig());}
  if(action==='recover'){updateDemo(demo,store.config.approvedRelease);store.invalidate('Demo updates simulated',`Simulated running releases set to ${store.config.approvedRelease}; fresh reports are required.`);}
  if(action==='stale'){staleDemo(demo,Date.now(),store.config.maxAgeMs);store.invalidate('Stale evidence simulated','Demo source timestamps are frozen beyond the freshness limit. Polling will keep reading expired evidence.',{clearEvidence:true});}
  if(action==='cancel'){store.cancelLatest();return null;}
  await store.check(async(_inventory,token)=>{await pause(450,AbortSignal.any([signal,token.signal]));return observeDemo(demo,Date.now());});
  return null;
 },{
  accept:value=>{if(remote&&value&&value.revision>=remote.revision){remote=value;remotePrevious=evaluateDeployment(value.config,value.records,Date.now());}},
  error:error=>{
   let changed=true;
   if(remote){const atMs=Date.now();changed=remote.records.some(item=>item.latestAttempt?.failure!=='ENDPOINT_ERROR'||item.latestAttempt?.detail!==error.message);remote={...remote,records:remote.records.map(item=>({...item,latestAttempt:{atMs,completedAtMs:atMs,outcome:'failed',failure:'ENDPOINT_ERROR',detail:error.message}}))};if(changed)remoteEvents.unshift({id:`view-${++uiEventId}`,time:atMs,title:'Monitor request failed',detail:'Latest checks are Unknown. Prior evidence is historical.',good:false});}
   if(changed){toast(error.message);$('#activity-announcement').textContent=error.message;}
  },
  settled:()=>{render();if(['recover','stale','reset','cancel'].includes(action))toast(action==='stale'?'Stale scenario active. Polling reads frozen, expired evidence.':action==='recover'?'Simulated updates checked. Review the fresh evidence.':action==='reset'?'Demo restored to deterministic initial settings.':'Check cancelled. Fresh evidence is required.');}
 });
 render();await promise;
}
$('#check').addEventListener('click',()=>perform());
$('#cancel-check').addEventListener('click',()=>perform('cancel'));
$('#recover').addEventListener('click',()=>perform('recover'));
$('#demo-update').addEventListener('click',()=>perform('recover'));
$('#simulate-stale').addEventListener('click',()=>perform('stale'));
$('#reset-demo').addEventListener('click',()=>perform('reset'));
$('#search').addEventListener('input',render);
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{currentFilter=button.dataset.filter;render();if(button.classList.contains('metric'))$('#instances-section').scrollIntoView({behavior:'smooth'});});
function showSettings(){const config=snapshot().config;$('#release-input').value=config.approvedRelease;$('#age-input').value=config.maxAgeMs/1000;$('#settings-dialog').showModal();}
$('#edit-release').addEventListener('click',showSettings);$('#settings-nav').addEventListener('click',showSettings);
$('#settings-form').addEventListener('submit',event=>{event.preventDefault();const approvedRelease=$('#release-input').value.trim(),maxAgeMs=Number($('#age-input').value)*1000;if(!approvedRelease||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0||maxAgeMs>86400000)return;$('#settings-dialog').close();perform('settings',{approvedRelease,maxAgeMs});});
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>button.closest('dialog').close());
for(const dialog of document.querySelectorAll('dialog')){
 let opener;
 dialog.addEventListener('beforetoggle',event=>{if(event.newState==='open')opener=document.activeElement;});
 dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();else $('#check').focus();});
 dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(control=>control.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
}
$('#instance-rows').addEventListener('click',event=>{const button=event.target.closest('[data-instance]');if(!button)return;selectedInstanceId=button.dataset.instance;const item=lastResult.instances.find(x=>x.instanceId===selectedInstanceId);$('#details-title').textContent=selectedInstanceId;$('#details-content').innerHTML=detailMarkup(item,snapshot());$('#details-dialog').showModal();});
for(const [id,target] of [['nav-overview',null],['nav-instances','instances-section'],['nav-activity','activity-section']])$('#'+id).addEventListener('click',()=>{for(const button of document.querySelectorAll('.nav-item'))button.classList.toggle('active',button.id===id);if(target)$('#'+target).scrollIntoView({behavior:'smooth'});else window.scrollTo({top:0,behavior:'smooth'});});
$('.brand').addEventListener('click',event=>{event.preventDefault();$('#nav-overview').click();});
render();
try{
 const response=await fetch('/api/state',{signal:AbortSignal.timeout(3000)});
 if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
  const state=await response.json();if(!Array.isArray(state.config?.instances))throw Error('Restart your local dashboard to load the updated evidence model.');remote=state;
 }
 ready=true;render();await perform();
}catch(error){toast(`Dashboard startup failed: ${error.message}`);$('#activity-announcement').textContent=error.message;}
setInterval(()=>{render();const state=snapshot();if(ready&&!gate.pending&&$('#auto-check').checked&&!document.hidden&&Date.now()-lastPollAt>=state.config.intervalMs)perform();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
