let availabilityData=null,availabilityFilter='all',availabilityScope='all',availabilityQuery='',availabilityLoading=false,availabilityError='';
async function loadAvailability(){
  if(availabilityLoading)return;availabilityLoading=true;
  try{
    const r=await fetch('availability-inventory.json');if(!r.ok)throw Error('The room inventory could not be loaded.');
    const catalog=await r.json();
    if(FormaStore.enabled)availabilityData={...await FormaStore.availabilityLoad(),gaps:catalog.gaps};
    else{
      availabilityData={assets:catalog.assets,reports:JSON.parse(storage.get('localStorage','azzurro-availability-preview')||'[]'),gaps:catalog.gaps};
    }
    availabilityError='';
  }catch(e){availabilityError=e.message;}
  finally{availabilityLoading=false;if(view==='availability')availability();}
}
setInterval(()=>{if(typeof view!=='undefined'&&view==='availability'&&!document.hidden&&!$('#editor').open)void loadAvailability();},60000);
function availabilityRows(){return AvailabilityModel.replay(availabilityData?.assets||[],availabilityData?.reports||[]).filter(a=>(availabilityFilter==='all'||a.property===availabilityFilter)&&(availabilityScope==='all'||availabilityScope==='blocked'&&a.current||availabilityScope==='watch'&&a.current?.age_hours>=48||availabilityScope===a.status)&&(!availabilityQuery||[a.label,a.property,a.floor,a.current?.reason,a.current?.action,a.current?.owner].some(s=>String(s||'').toLowerCase().includes(availabilityQuery))));}
function availability(){
  const target=$('#body');if(!target)return;
  if(!availabilityData&&!availabilityError){target.innerHTML='<p role="status">Loading room and bathroom register…</p>';void loadAvailability();return;}
  const all=AvailabilityModel.replay(availabilityData?.assets||[],availabilityData?.reports||[]),rows=availabilityRows();
  target.innerHTML=`${availabilityError?`<div class="overdue-banner" role="alert"><div><b>Room register is not connected.</b><p>${esc(availabilityError)} Existing workspace tasks are unaffected.</p></div><button class="secondary" id="availability-retry">Retry</button></div>`:''}<div class="availability-summary"><span><b>${all.filter(a=>a.current).length}</b> blocked</span><span><b>${all.filter(a=>a.current?.age_hours>=48).length}</b> over 2 days</span><span><b>${all.filter(a=>a.status==='unconfirmed').length}</b> unconfirmed</span><p>Reception checks at noon and 1:30 pm Sydney. Cases over 3 days are sent to Operation bot.</p></div><div class="toolbar availability-filters"><label>Property<select id="availability-property"><option value="all">All properties</option>${AvailabilityModel.properties.map(p=>`<option${availabilityFilter===p?' selected':''}>${esc(p)}</option>`).join('')}</select></label><label>Show<select id="availability-scope">${[['all','All spaces'],['blocked','Blocked'],['watch','Over 2 days'],['available','Available'],['unconfirmed','Unconfirmed']].map(([v,t])=>`<option value="${v}"${availabilityScope===v?' selected':''}>${t}</option>`).join('')}</select></label><label>Search<input id="availability-search" type="search" placeholder="Room, bathroom, action or owner" value="${esc(availabilityQuery)}"></label><button class="secondary" id="availability-refresh">Refresh register</button></div>${availabilityData?.gaps?.length?'<details class="availability-gaps"><summary>Inventory items to confirm</summary>'+availabilityData.gaps.map(g=>`<p><b>${esc(g.property)}</b>: ${esc(g.note)}</p>`).join('')+'</details>':''}<div class="availability-table-wrap"><table class="availability-table"><thead><tr><th>Property / space</th><th>Status</th><th>Closed since</th><th>Unresolved</th><th>Action / owner / ETA</th><th>History</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${esc(a.property)}</b><br>${esc(a.label)}<small>${esc([a.floor,a.location].filter(Boolean).join(' · '))}</small></td><td><span class="availability-state ${a.status}">${a.status==='blocked'?'Blocked':a.status==='available'?'Available':'Unconfirmed'}</span></td><td>${a.current?esc(a.current.closed_on||'Date not supplied'):'—'}${a.current?`<small>First reported ${esc(timestamp(a.current.first_reported_at))}</small>`:''}</td><td>${a.current?`${Math.floor(a.current.age_hours/24)}d ${Math.floor(a.current.age_hours%24)}h<small>${a.current.level==='escalate'?'Over 3 days':a.current.level==='watch'?'Over 2 days':'Open case'} · minimum known duration</small>`:'—'}</td><td>${a.current?`${esc(a.current.reason||'Issue not supplied')}<small>Action: ${esc(a.current.action||'not supplied')}<br>Owner: ${esc(a.current.owner||'not supplied')}<br>ETA: ${esc(a.current.eta||'not supplied')}</small>`:'No open closure recorded'}</td><td><button class="secondary" data-availability="${esc(a.id)}">${isAdmin()?'Update / history':'History'}</button></td></tr>`).join('')||'<tr><td colspan="6">No spaces match these filters.</td></tr>'}</tbody></table></div>`;
  $('#availability-property').onchange=e=>{availabilityFilter=e.target.value;availability();};$('#availability-scope').onchange=e=>{availabilityScope=e.target.value;availability();};
  $('#availability-search').oninput=e=>{availabilityQuery=e.target.value.toLowerCase();const start=e.target.selectionStart;availability();$('#availability-search').focus();$('#availability-search').setSelectionRange(start,start);};
  $('#availability-refresh').onclick=()=>void loadAvailability();$('#availability-retry')?.addEventListener('click',()=>void loadAvailability());
  document.querySelectorAll('[data-availability]').forEach(b=>b.onclick=()=>availabilityEditor(b.dataset.availability));
}
function availabilityCopyText(){return clipboardDocument('Rooms and bathrooms',availabilityRows().map(a=>a.current?AvailabilityModel.caseText(a):`${a.property} — ${a.label}: ${a.status}`));}
function availabilityEditor(id){
  const a=AvailabilityModel.replay(availabilityData.assets,availabilityData.reports).find(a=>a.id===id);if(!a)return;
  const reports=availabilityData.reports.filter(r=>r.asset_id===id).sort((a,b)=>Date.parse(b.reported_at)-Date.parse(a.reported_at));
  openDialog(`<form id="availability-form"><h2 id="dialog-title">${esc(a.property)} — ${esc(a.label)}</h2><p class="subtitle">Reopening closes this case and preserves its history. A later closure starts a new case.</p>${isAdmin()?`<label>Status<select id="availability-state"><option value="update">Add progress note</option><option value="blocked">Blocked / unavailable</option><option value="available">Reopened / available</option></select></label><label>Closed on<input type="date" id="availability-since" max="${today()}" value="${esc(a.current?.closed_on||'')}"></label><small>Leave blank if the date is unknown. The first report date is retained.</small><label>Issue<textarea id="availability-reason" maxlength="1000">${esc(a.current?.reason||'')}</textarea></label><label>Action needed<textarea id="availability-action" maxlength="1000">${esc(a.current?.action||'')}</textarea></label><div class="form-row"><label>Responsible person<input id="availability-owner" maxlength="1000" value="${esc(a.current?.owner||'')}"></label><label>Reopening ETA<input id="availability-eta" maxlength="1000" value="${esc(a.current?.eta||'')}"></label></div>`:''}<details open><summary>History (${reports.length} updates)</summary><div class="availability-history">${reports.map(r=>`<article><b>${esc(r.state)} · ${esc(timestamp(r.reported_at))}</b><p>${esc([r.reason,r.action,r.owner&&'Owner: '+r.owner,r.eta&&'ETA: '+r.eta].filter(Boolean).join(' · ')||'Status confirmed')}</p><small>${esc(r.actor||'Reception')} · ${esc(r.source)}</small></article>`).join('')||'<p>No status has been reported yet.</p>'}</div></details><div class="actions"><button type="button" class="secondary" id="cancel">Close</button>${isAdmin()?'<button class="primary" type="submit">Save update</button>':''}</div></form>`);
  const draftId=crypto.randomUUID();
  if(!isAdmin())return;
  $('#availability-form').onsubmit=async e=>{
    e.preventDefault();if(!canEdit())return;
    const state=$('#availability-state').value;
    if(state==='update'&&!a.current){toast('Choose Blocked or Available to confirm this space first.',true);return;}
    const row={id:draftId,asset_id:id,state,closed_on:state==='blocked'?$('#availability-since').value||null:null,reason:$('#availability-reason').value.trim(),action:$('#availability-action').value.trim(),owner:$('#availability-owner').value.trim(),eta:$('#availability-eta').value.trim(),actor:visitorName,source:'dashboard',source_id:draftId};
    if(row.closed_on&&row.closed_on>today()){toast('The closure date cannot be in the future.',true);return;}
    const button=e.submitter;button.disabled=true;
    try{
      if(FormaStore.enabled)await FormaStore.availabilityReport(row);
      else{availabilityData.reports.push({...row,reported_at:new Date().toISOString()});if(!storage.set('localStorage','azzurro-availability-preview',JSON.stringify(availabilityData.reports)))throw Error('Preview storage is unavailable.');}
      $('#editor').close();await loadAvailability();toast('Room register updated');
    }catch(error){button.disabled=false;toast(error.message,true);}
  };
}
