let routineQuery = '', routineCategory = '', purchaseQuery = '', purchaseScope = 'planned';
let routineGroupDate = '';
function recurring() {
  const categories = [...new Set(state.recurring.map(row => row.category).filter(Boolean))].sort();
  if (!categories.includes(routineCategory)) routineCategory = '';
  $('#body').innerHTML = `<div class="schedule-strip"><div>${icon('clock')}<b id="sydney-clock"></b><span>Sydney time</span></div><p id="routine-summary" role="status"></p></div><div class="workflow-toolbar"><div class="search-wrap">${icon('search')}<input id="routine-search" type="search" aria-label="Search recurring tasks" placeholder="Find a routine…" value="${esc(routineQuery)}"></div><select id="routine-category" aria-label="Recurring task category"><option value="">All categories</option>${categories.map(c=>`<option ${c===routineCategory?'selected':''}>${esc(c)}</option>`).join('')}</select><button class="secondary" id="routine-history">Completion history</button></div><p class="reminder-legend"><span class="routine-state soon">Due soon · 30 minutes</span><span class="routine-state now">Due now</span><span class="routine-state overdue">Overdue · 15 minutes</span><span class="routine-state done">Completed</span></p><div id="routine-groups"></div><p class="note">Color reminders update while this workspace is open. Daily tasks reset each Sydney day; weekly tasks reset on their scheduled day. Unfinished occurrences stay in that cycle until the next one. No email or background notifications are sent.</p>`;
  $('#routine-search').oninput = event => { routineQuery=event.target.value; routineGroups(); };
  $('#routine-category').onchange = event => { routineCategory=event.target.value; routineGroups(); };
  $('#routine-history').onclick = routineHistory;
  routineGroups();
}
function routineGroups() {
  routineGroupDate = Schedule.clock().date;
  const rows=state.recurring.filter(row=>(!routineCategory||row.category===routineCategory)&&`${row.title} ${row.category} ${row.notes}`.toLowerCase().includes(routineQuery.toLowerCase()));
  $('#routine-groups').innerHTML=`<div class="routine-groups">${['daily','weekly'].map(frequency=>{
    const tasks=rows.filter(row=>row.frequency===frequency).sort((a,b)=>Schedule.occurrence(a).localeCompare(Schedule.occurrence(b))||a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
    return `<div class="panel routine-group ${frequency}"><div class="panel-head"><div><h2>${frequency==='daily'?'Daily routines':'Weekly routines'}</h2><p>${frequency==='daily'?'A fresh checklist every day':'The responsibilities that repeat each week'}</p></div><span class="pill">${tasks.length} ${tasks.length===1?'task':'tasks'}</span></div><div class="routine-list">${tasks.map(row=>`<article class="routine-row" data-routine-row="${esc(row.id)}"><div class="routine-time"><b>${esc(Schedule.timeLabel(row.time))}</b><small>${frequency==='daily'?'Every day':Schedule.weekdays[row.weekday]}</small></div><div class="routine-details"><h3>${esc(row.title)}</h3>${row.category?`<span class="pill">${esc(row.category)}</span>`:''}${row.notes?`<p>${esc(row.notes)}</p>`:''}<small class="routine-occurrence"></small><span class="routine-state"></span></div><div class="routine-actions">${isAdmin()?`<button class="secondary" data-complete-routine="${esc(row.id)}"></button><button class="text-button" data-edit-routine="${esc(row.id)}" aria-label="Edit ${esc(row.title)}">Edit</button>`:''}</div></article>`).join('')||`<div class="empty">${state.recurring.length?'No matching '+frequency+' tasks.':'Add a '+frequency+' task with its scheduled time to start your checklist.'}</div>`}</div></div>`;
  }).join('')}</div>`;
  document.querySelectorAll('[data-edit-routine]').forEach(button=>button.onclick=()=>recurringEditor(button.dataset.editRoutine));
  document.querySelectorAll('[data-complete-routine]').forEach(button=>button.onclick=()=>completeRoutine(button.dataset.completeRoutine));
  updateRecurringClock();
}
function updateRecurringClock() {
  if (typeof state==='undefined'||!visitorName||!ready) return;
  const now=new Date(), clock=Schedule.clock(now);
  const statuses=state.recurring.map(row=>Schedule.status(row,state.completions,now));
  const count=key=>statuses.filter(s=>s.key===key).length;
  const attention=count('now')+count('overdue'), nav=$('#routine-nav-count');
  nav.hidden=!attention;nav.textContent=attention?String(attention):'';nav.setAttribute('aria-label',`${attention} recurring tasks due`);
  if(view!=='recurring'||!$('#routine-groups'))return;
  if (routineGroupDate!==clock.date && !$('#editor').open && !document.activeElement?.matches('input,select,textarea,button')) { routineGroups(); return; }
  $('#sydney-clock').textContent=Schedule.timeLabel(clock.time);
  $('#routine-summary').textContent=`${attention} ${attention===1?'needs':'need'} attention · ${count('done')} completed this cycle`;
  document.querySelectorAll('[data-routine-row]').forEach(element=>{
    const row=state.recurring.find(r=>r.id===element.dataset.routineRow); if(!row)return;
    const status=Schedule.status(row,state.completions,now);
    element.dataset.state=status.key;
    const badge=element.querySelector('.routine-state'); badge.className='routine-state '+status.key; badge.textContent=status.label;
    element.querySelector('.routine-occurrence').textContent=status.completion ? `Completed ${timestamp(status.completion.completed_at)} · Sydney` : `${dateLabel(status.date,true)} · Sydney`;
    const button=element.querySelector('[data-complete-routine]');
    if(button){button.textContent=status.completion?'Undo completion':'Mark done';button.disabled=busy||stale||(!status.completion&&!status.canComplete);button.setAttribute('aria-label',`${button.textContent}: ${row.title}`);}
  });
}
async function completeRoutine(id) {
  if(!canEdit())return;
  const row=state.recurring.find(r=>r.id===id); if(!row)return;
  const status=Schedule.status(row,state.completions);
  if(status.completion) state.completions=state.completions.filter(r=>r.id!==status.completion.id);
  else if(status.canComplete) state.completions.push({id:crypto.randomUUID(),recurring_id:id,occurrence:status.date,completed_at:new Date().toISOString()});
  else return;
  if(await save()){render();saved(status.completion?'Completion undone':'Routine completed');}
}
function routineHistory() {
  const rows=[...state.completions].sort((a,b)=>b.completed_at.localeCompare(a.completed_at));
  openDialog(`<h2 id="dialog-title">Completion history</h2><p class="subtitle">Completed occurrences · Sydney time</p><div class="activity-history">${rows.map(row=>`<article><b>${esc(state.recurring.find(r=>r.id===row.recurring_id)?.title||'Removed routine')}</b><p>Scheduled for ${esc(dateLabel(row.occurrence,true))}</p><time>${esc(timestamp(row.completed_at))} · Sydney</time></article>`).join('')||'<p class="note">Completed routines will appear here.</p>'}</div><div class="actions"><button class="secondary" id="cancel">Close</button></div>`);
}
function recurringEditor(id) {
  if(!canEdit())return;
  const original=state.recurring.find(r=>r.id===id); if(id&&!original)return;
  const draftId=id||crypto.randomUUID();
  openDialog(`<form id="routine-form"><h2 id="dialog-title">${original?'Edit recurring task':'Add a recurring task'}</h2><p class="subtitle">Set the rhythm once. Check it off each time.</p><label for="routine-title">Task name</label><input id="routine-title" name="title" required maxlength="120" value="${esc(original?.title||'')}" placeholder="e.g. Review the reception handover"><div class="form-row"><div><label for="routine-frequency">Repeats</label><select id="routine-frequency" name="frequency"><option value="daily">Daily</option><option value="weekly" ${original?.frequency==='weekly'?'selected':''}>Weekly</option></select></div><div id="weekday-field"><label for="routine-weekday">Day of the week</label><select id="routine-weekday" name="weekday">${Schedule.weekdays.map((d,i)=>`<option value="${i}" ${Number(original?.weekday??1)===i?'selected':''}>${d}</option>`).join('')}</select></div></div><div class="form-row"><div><label for="routine-time">Time · Sydney</label><input id="routine-time" name="time" type="time" required value="${esc(original?.time||'09:00')}"></div><div><label for="routine-start">Start date · Sydney</label><input id="routine-start" name="start_date" type="date" required value="${esc(original?.start_date||today())}"></div></div><label for="routine-category-input">Category</label><input id="routine-category-input" name="category" maxlength="70" value="${esc(original?.category||'')}" placeholder="e.g. Reception, housekeeping, finance"><label for="routine-notes">Instructions</label><textarea id="routine-notes" name="notes" maxlength="3000" placeholder="What needs checking each time?">${esc(original?.notes||'')}</textarea><label class="pause-choice"><input type="checkbox" name="paused" ${original?.paused?'checked':''}> Pause this routine</label><p class="note">Times follow Sydney daylight saving. A completion belongs to its scheduled date, even if you later edit the time.</p><div class="actions">${original?'<button class="danger" type="button" id="remove-routine">Remove</button>':''}<button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">Save recurring task</button></div></form>`);
  const toggle=()=>{$('#weekday-field').hidden=$('#routine-frequency').value==='daily';};toggle();$('#routine-frequency').onchange=toggle;
  $('#routine-title').oninput=()=>$('#routine-title').setCustomValidity('');
  $('#routine-form').onsubmit=async event=>{
    event.preventDefault();if(!canEdit())return;
    const data=Object.fromEntries(new FormData(event.target));data.title=data.title.trim();data.category=data.category.trim();data.notes=data.notes.trim();data.paused=Boolean(data.paused);data.weekday=data.frequency==='weekly'?Number(data.weekday):null;
    if(!data.title){$('#routine-title').setCustomValidity('Enter a task name.');$('#routine-title').reportValidity();return;}
    const row=state.recurring.find(r=>r.id===draftId); if(original&&!row)return;
    if(row)Object.assign(row,data);else state.recurring.push({id:draftId,...data});
    if(await save()){$('#editor').close();render();saved('Recurring task saved');}
  };
  $('#remove-routine')?.addEventListener('click',async()=>{
    if(!canEdit()||!confirm('Remove this recurring task and its completion history? Pause it instead to keep the history.'))return;
    state.recurring=state.recurring.filter(r=>r.id!==id);state.completions=state.completions.filter(r=>r.recurring_id!==id);
    if(await save()){$('#editor').close();render();saved('Recurring task removed');}
  });
}
function purchases() {
  $('#body').innerHTML=`<div class="purchase-summary"><div><span>To buy</span><strong>${state.purchases.filter(r=>r.status==='planned').length}</strong><small>Items waiting to be purchased</small></div><div><span>Purchased</span><strong>${state.purchases.filter(r=>r.status==='purchased').length}</strong><small>Kept here for your records</small></div></div><div class="workflow-toolbar"><div class="tabs" role="group" aria-label="Purchase status">${[['planned','To buy'],['purchased','Purchased'],['all','All items']].map(([k,v])=>`<button data-purchase-scope="${k}" class="${purchaseScope===k?'selected':''}" aria-pressed="${purchaseScope===k}">${v}</button>`).join('')}</div><div class="search-wrap">${icon('search')}<input id="purchase-search" type="search" aria-label="Search purchases" placeholder="Find an item or location…" value="${esc(purchaseQuery)}"></div></div><div id="purchase-items"></div>`;
  document.querySelectorAll('[data-purchase-scope]').forEach(b=>b.onclick=()=>{purchaseScope=b.dataset.purchaseScope;purchases();$(`[data-purchase-scope="${purchaseScope}"]`).focus();});
  $('#purchase-search').oninput=event=>{purchaseQuery=event.target.value;purchaseItems();};purchaseItems();
}
function purchaseItems() {
  const rows=state.purchases.filter(r=>(purchaseScope==='all'||r.status===purchaseScope)&&`${r.title} ${r.category} ${r.notes}`.toLowerCase().includes(purchaseQuery.toLowerCase())).sort((a,b)=>a.status.localeCompare(b.status)||(a.status==='purchased'?String(b.purchased_at).localeCompare(String(a.purchased_at)):(a.priority==='High'?-1:0)-(b.priority==='High'?-1:0))||a.title.localeCompare(b.title));
  $('#purchase-items').innerHTML=rows.length?`<div class="purchase-list">${rows.map(row=>`<article class="purchase-row ${row.status}"><span class="purchase-symbol">${icon(row.status==='purchased'?'check':'cart')}</span><div class="purchase-details"><h2>${esc(row.title)}</h2><div class="purchase-meta"><span class="pill">Qty: ${esc(row.quantity)}</span>${row.category?`<span class="pill">${esc(row.category)}</span>`:''}${priorityBadge(row.priority)}</div>${row.notes?`<p>${esc(row.notes)}</p>`:''}${row.purchased_at?`<small>Purchased ${esc(timestamp(row.purchased_at))} · Sydney</small>`:''}</div><div class="purchase-actions">${isAdmin()?`<button class="${row.status==='purchased'?'secondary':'primary'}" data-purchase-toggle="${esc(row.id)}">${row.status==='purchased'?'Move back to To buy':'Mark purchased'}</button><button class="text-button" data-edit-purchase="${esc(row.id)}" aria-label="Edit ${esc(row.title)}">Edit item</button>`:`<span class="pill">${row.status==='purchased'?'Purchased':'To buy'}</span>`}</div></article>`).join('')}</div>`:`<div class="empty-state">${icon('cart')}<h2>${purchaseScope==='purchased'?'Your purchased items will live here.':'Make room for what’s needed.'}</h2><p>${state.purchases.length?'No items match this view. Try another status or search.':'Add an item, quantity, and location. Mark it purchased when it’s bought.'}</p></div>`;
  document.querySelectorAll('[data-edit-purchase]').forEach(b=>b.onclick=()=>purchaseEditor(b.dataset.editPurchase));
  document.querySelectorAll('[data-purchase-toggle]').forEach(b=>b.onclick=async()=>{
    if(!canEdit())return;const row=state.purchases.find(r=>r.id===b.dataset.purchaseToggle);if(!row)return;
    row.status=row.status==='purchased'?'planned':'purchased';row.purchased_at=row.status==='purchased'?new Date().toISOString():null;
    const message=row.status==='purchased'?'Moved to Purchased':'Moved to To buy';
    if(await save()){render();saved(message);}
  });
}
function purchaseEditor(id) {
  if(!canEdit())return;const original=state.purchases.find(r=>r.id===id);if(id&&!original)return;const draftId=id||crypto.randomUUID();
  openDialog(`<form id="purchase-form"><h2 id="dialog-title">${original?'Edit purchase item':'Add a purchase item'}</h2><label for="purchase-title">Item name</label><input id="purchase-title" name="title" required maxlength="120" value="${esc(original?.title||'')}" placeholder="e.g. Reception stationery"><div class="form-row"><div><label for="purchase-quantity">Quantity / unit</label><input id="purchase-quantity" name="quantity" required maxlength="60" value="${esc(original?.quantity||'1')}" placeholder="e.g. 2 boxes"></div><div><label for="purchase-priority">Priority</label><select id="purchase-priority" name="priority">${priorities.map(p=>`<option ${original?.priority===p?'selected':''}>${p}</option>`).join('')}</select></div></div><label for="purchase-category">Location / category</label><input id="purchase-category" name="category" maxlength="70" value="${esc(original?.category||'')}" placeholder="e.g. Olympic · Housekeeping"><label for="purchase-notes">Details</label><textarea id="purchase-notes" name="notes" maxlength="3000" placeholder="Size, supplier, or anything the team should know">${esc(original?.notes||'')}</textarea><div class="actions">${original?'<button type="button" class="danger" id="remove-purchase">Remove</button>':''}<button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">Save item</button></div></form>`);
  ['purchase-title','purchase-quantity'].forEach(id=>$('#'+id).oninput=()=>$('#'+id).setCustomValidity(''));
  $('#purchase-form').onsubmit=async event=>{
    event.preventDefault();if(!canEdit())return;const data=Object.fromEntries(new FormData(event.target));for(const k of Object.keys(data))data[k]=data[k].trim();
    for(const key of ['title','quantity'])if(!data[key]){const input=$('#purchase-'+key);input.setCustomValidity('Enter '+key+'.');input.reportValidity();return;}
    const row=state.purchases.find(r=>r.id===draftId);if(original&&!row)return;
    if(row)Object.assign(row,data);else state.purchases.push({id:draftId,status:'planned',purchased_at:null,...data});
    if(await save()){$('#editor').close();render();saved('Purchase item saved');}
  };
  $('#remove-purchase')?.addEventListener('click',async()=>{
    if(!canEdit()||!confirm('Remove this item from the purchase list?'))return;state.purchases=state.purchases.filter(r=>r.id!==id);
    if(await save()){$('#editor').close();render();saved('Purchase item removed');}
  });
}
