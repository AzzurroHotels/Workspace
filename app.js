window.boardActorName=()=>visitorName;
let visitorName=sessionStorage.getItem('forma-visitor')||'';
const statuses=['New','In progress','For Review','Completed'];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const offset=n=>{const d=new Date(today()+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d)};
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const initials=n=>n.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const seed={members:[],tasks:[],activity:[]};
// Remove the retired demo dataset from this browser.
localStorage.removeItem('forma-board-v1');
let state;try{state=JSON.parse(localStorage.getItem('azzurro-board-v2'))||seed}catch{state=seed}
let view='dashboard',selected='all',month=new Date(today()+'T12:00:00'),query='',taskView=localStorage.getItem('forma-task-view')==='list'?'list':'kanban';
const member=id=>state.members.find(m=>m.id===id);
const admin=()=>true;
let baseline=structuredClone(state), busy=false, ready=!FormaStore.enabled;
async function save(){
 if(!visitorName)return false;
 if(busy||!ready){state=structuredClone(baseline);render();return false}
 if(!FormaStore.enabled){recordLocalChanges(baseline,state);localStorage.setItem('azzurro-board-v2',JSON.stringify(state));baseline=structuredClone(state);return true}
 busy=true;document.querySelector('main').inert=true;$('#editor').inert=true;
 try{await FormaStore.save(baseline,state);state=await FormaStore.load();baseline=structuredClone(state);return true}
 catch(error){try{state=await FormaStore.load();baseline=structuredClone(state)}catch{state=structuredClone(baseline)}render();toast('Not saved: '+error.message);return false}
 finally{busy=false;document.querySelector('main').inert=false;$('#editor').inert=false}
}
async function refresh(){
 if(!visitorName||!FormaStore.enabled||busy||document.querySelector('dialog[open]'))return;
 busy=true;
 try{state=await FormaStore.load();baseline=structuredClone(state);ready=true;render()}
 catch(error){if(!ready){document.querySelector('#content').innerHTML='<h1>Connection needed</h1><p>Unable to load the shared board. Check config.js and run supabase/schema.sql.</p><button class="secondary" id="retry">Retry connection</button>';document.querySelector('#retry').onclick=refresh}toast('Connection error: '+error.message)}
 finally{busy=false}
}
function toast(msg){$('#toast').textContent=msg;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',2500)}
function badge(s){return `<span class="status s${statuses.indexOf(s)}">${esc(s)}</span>`}
function render(){
 if(!visitorName){welcome();return}
 document.body.classList.remove('welcome-mode');
 $('#visitor-bar').innerHTML=`<span>${esc(visitorName)}</span> <button class="secondary" id="change-name">Change name</button>`;$('#change-name').onclick=()=>{visitorName='';sessionStorage.removeItem('forma-visitor');render()};
 if(FormaStore.enabled&&!ready){$('#content').innerHTML='<h1>Connecting to workspace…</h1><p class="subtitle">Loading shared tasks and team members.</p>';return}
 $('#date').textContent=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#breadcrumb').textContent={dashboard:'Dashboard',board:'Task boards',members:'Team members'}[view];
 const titles={dashboard:['Overview','A clear view of your team’s work and what’s coming next.'],board:['Task boards','Move work forward, one task at a time.'],members:['Team members','The people behind your projects.']};
 $('#content').innerHTML=`<div class="heading"><div><h1>${titles[view][0]}</h1><p class="subtitle">${titles[view][1]}</p></div>${view==='members'?admin()?'<button class="primary" id="add-member">＋ Add member</button>':'':'<button class="primary" id="add-task">＋ New task</button>'}</div><div id="body"></div>`;
 if(view==='dashboard')dashboard();if(view==='board')board();if(view==='members')members();
 $('#add-task')?.addEventListener('click',()=>taskEditor());$('#add-member')?.addEventListener('click',memberEditor);
 document.querySelectorAll('.task-row[data-task]').forEach(b=>b.addEventListener('click',()=>taskEditor(b.dataset.task)));
}
function dashboard(){const active=state.tasks.filter(t=>t.status!=='Completed');const due=active.filter(t=>t.due>=today()&&t.due<=offset(2)).sort((a,b)=>a.due.localeCompare(b.due));$('#body').innerHTML=`<div class="stats">${[['Active tasks',active.length,'Across the entire workspace','▥'],['Due in 3 days',due.length,'Today through the next two days','◷'],['For review',active.filter(t=>t.status==='For Review').length,'Ready for a second look','✓'],['Team members',state.members.length,'Admin · Dev · ProB','♧']].map(s=>`<div class="stat"><em>${s[3]}</em><p class="label">${s[0]}</p><strong>${s[1]}</strong><small>${s[2]}</small></div>`).join('')}</div><div class="dashboard-grid"><div class="panel"><div class="panel-head"><div><h2>Coming up next</h2><p>Your team’s upcoming deadlines</p></div><span class="pill">NEXT 3 DAYS</span></div>${due.map(t=>`<div class="task-row" tabindex="0" role="button" data-task="${t.id}"><span class="dot"></span><div class="details"><b>${esc(t.title)}</b><small>${esc(member(t.memberId)?.name||'Unassigned')} · ${t.due===today()?'Today':t.due===offset(1)?'Tomorrow':dateLabel(t.due)}</small></div>${badge(t.status)}</div>`).join('')||'<p class="empty">You’re all caught up. No tasks due in the next three days.</p>'}<div class="panel-head"><p>Dates follow Australia/Sydney time</p><button class="secondary" id="view-board">View board →</button></div></div><div class="panel"><div class="panel-head"><div><h2>Task calendar</h2><p>Every deadline, at a glance</p></div><span class="pill">MONTH VIEW</span></div><div id="calendar"></div></div></div>`;$('#view-board').onclick=()=>{view='board';render()};calendar()}
function dateLabel(d){return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
function calendar(){const y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1),start=new Date(y,m,1-(first.getDay()+6)%7);$('#calendar').innerHTML=`<div class="calendar"><div class="calendar-toolbar"><b>${month.toLocaleDateString('en-AU',{month:'long',year:'numeric'})}</b><div><button id="prev" aria-label="Previous month">‹</button> <button id="now">Today</button> <button id="next" aria-label="Next month">›</button></div></div><div class="calendar-grid">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d=>`<div class="dayname">${d}</div>`).join('')}${Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const key=localDate(d);return `<div class="day ${d.getMonth()!==m?'muted':''} ${key===today()?'today':''}">${d.getDate()}${state.tasks.filter(t=>t.due===key).map(t=>`<button class="calendar-task" data-calendar-task="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}</div>`}).join('')}</div></div>`;$('#prev').onclick=()=>{month=new Date(y,m-1,1);calendar()};$('#next').onclick=()=>{month=new Date(y,m+1,1);calendar()};$('#now').onclick=()=>{month=new Date(today()+'T12:00:00');calendar()};document.querySelectorAll('[data-calendar-task]').forEach(b=>b.onclick=()=>taskEditor(b.dataset.calendarTask))}
function board(){if(selected!=='all'&&!member(selected))selected='all';$('#body').innerHTML=`<div class="tabs"><button data-filter="all" class="${selected==='all'?'selected':''}">All tasks</button>${state.members.map(m=>`<button data-filter="${m.id}" class="${selected===m.id?'selected':''}">${esc(m.name)}</button>`).join('')}</div><div class="board-toolbar"><div class="view-switch" role="group" aria-label="Task view"><button data-layout="kanban" aria-pressed="${taskView==='kanban'}" class="${taskView==='kanban'?'selected':''}">▥ Kanban</button><button data-layout="list" aria-pressed="${taskView==='list'}" class="${taskView==='list'?'selected':''}">☰ List</button></div><button class="secondary" id="export-tasks" title="Export tasks in this tab, grouped by name">↓ Export text</button><input class="search" id="search" type="search" placeholder="Search tasks…" aria-label="Search tasks" value="${esc(query)}"></div><div id="columns"></div><p class="note">${selected==='all'?'All tasks shows active work. Completed tasks remain on each member’s board.':'This member’s board includes all tasks, including completed work.'} ${taskView==='kanban'?'Drag cards to change status, or open a task to choose a status.':'Click a status to change it, or Notes to add an update. Click a task title to edit details.'}</p>`;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{selected=b.dataset.filter;render()});document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{taskView=b.dataset.layout;localStorage.setItem('forma-task-view',taskView);render()});$('#export-tasks').onclick=exportTasks;$('#search').oninput=e=>{query=e.target.value;columns()};columns()}
function taskExportText(tasks){
 const groups=new Map();
 for(const task of tasks){const key=task.memberId||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(task)}
 const lines=['AZZURRO WORKSPACE — TASK EXPORT',`Exported by: ${visitorName}`,`Exported at: ${new Date().toLocaleString('en-AU',{timeZone:'Australia/Sydney'})} (Australia/Sydney)`,`Scope: ${selected==='all'?'All active tasks':member(selected)?.name||'Member tasks'}${query?' · Search: '+query:''}`,''];
 for(const [id,items] of [...groups].sort(([a],[b])=>(member(a)?.name||'Unassigned').localeCompare(member(b)?.name||'Unassigned'))){
  const person=member(id);lines.push('='.repeat(54),`NAME: ${person?.name||'Unassigned'}`,`ROLE: ${person?.role||'—'}`,`TASKS: ${items.length}`,'='.repeat(54),'');
  items.sort((a,b)=>a.due.localeCompare(b.due)||a.title.localeCompare(b.title)).forEach((task,index)=>{
   lines.push(`${index+1}. ${task.title}`,`Status: ${task.status}`,`Due date: ${task.due}`,`Priority: ${task.priority}`,`Description: ${task.description||'—'}`,`Latest note: ${task.latest_note||'No notes yet'}`);
   const latestNoteEntry=(state.activity||[]).filter(entry=>entry.entity==='tasks'&&entry.record_id===task.id&&entry.changes?.latest_note?.to===task.latest_note).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
   if(task.latest_note){
    lines.push(`Updated by: ${latestNoteEntry?.actor_name||'Not recorded'}`);
    const timestamp=latestNoteEntry?.created_at||task.note_updated_at;
    lines.push(`Updated at: ${timestamp?new Date(timestamp).toLocaleString('en-AU',{timeZone:'Australia/Sydney'})+' (Sydney)':'Not recorded'}`);
   }
   lines.push('');
  });
 }
 return lines.join('\r\n');
}
function exportTasks(){
 const tasks=state.tasks.filter(t=>(selected==='all'?t.status!=='Completed':t.memberId===selected)&&t.title.toLowerCase().includes(query.toLowerCase()));
 if(!tasks.length){toast('No tasks to export in this view');return}
 const blob=new Blob(['\ufeff'+taskExportText(tasks)],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 const name=selected==='all'?'all-members':member(selected)?.name||'member';
 const safeName=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,'-');
 link.href=url;link.download=`tasks-${safeName}-${today()}.txt`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Tasks exported by name');
}
function columns(){const tasks=state.tasks.filter(t=>(selected==='all'?t.status!=='Completed':t.memberId===selected)&&t.title.toLowerCase().includes(query.toLowerCase()));if(taskView==='list'){taskList(tasks);return}$('#columns').innerHTML=`<div class="board">${statuses.map((s,i)=>`<div class="column" data-status="${s}"><div class="column-title"><i class="dot" style="background:${['#a0b1a7','#73a0c7','#d7b974','#70a487'][i]}"></i>${s}<span>${tasks.filter(t=>t.status===s).length}</span></div>${tasks.filter(t=>t.status===s).map(t=>`<article class="card" draggable="true" tabindex="0" role="button" aria-label="Open ${esc(t.title)}" data-id="${t.id}"><span class="priority ${t.priority}">${t.priority} priority</span><h3>${esc(t.title)}</h3><p class="latest-note">${esc(t.latest_note||'No updates yet')}</p><div class="card-bottom"><span>◷ ${dateLabel(t.due)}</span><button data-task="${t.id}" aria-label="Edit ${esc(t.title)}">Edit ↗</button><span class="avatar" title="${esc(member(t.memberId)?.name||'Unassigned')}">${member(t.memberId)?esc(initials(member(t.memberId).name)):'—'}</span></div></article>`).join('')||'<div class="empty">Drop a task here</div>'}</div>`).join('')}</div>`;document.querySelectorAll('.card').forEach(c=>{
 let dragged=false;
 c.ondragstart=e=>{dragged=true;e.dataTransfer.setData('text/plain',c.dataset.id);e.dataTransfer.effectAllowed='move'};
 c.ondragend=()=>setTimeout(()=>dragged=false,0);
 c.onclick=e=>{if(dragged||e.target.closest('button'))return;taskEditor(c.dataset.id)};
 c.onkeydown=e=>{if(e.target!==c)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();taskEditor(c.dataset.id)}};
});document.querySelectorAll('.column').forEach(c=>{c.ondragover=e=>{e.preventDefault();c.classList.add('dragover')};c.ondragleave=()=>c.classList.remove('dragover');c.ondrop=async e=>{e.preventDefault();if(busy||!ready)return;const t=state.tasks.find(t=>t.id===e.dataTransfer.getData('text/plain'));if(t){t.status=c.dataset.status;if(!await save())return;render();toast('Task moved to '+t.status)}}});document.querySelectorAll('#columns [data-task]').forEach(b=>b.onclick=()=>taskEditor(b.dataset.task))}
function taskList(tasks){
 const sorted=[...tasks].sort((a,b)=>a.due.localeCompare(b.due)||a.title.localeCompare(b.title));
 $('#columns').innerHTML=`<div class="panel task-table-wrap"><table class="task-table"><caption class="table-caption">${sorted.length} ${sorted.length===1?'task':'tasks'} · ${selected==='all'?'Active work':esc(member(selected)?.name||'Team member')}</caption><thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Assignee</th><th scope="col">Due date</th><th scope="col">Priority</th><th scope="col">Notes</th></tr></thead><tbody>${sorted.map(t=>`<tr><td><button class="task-title" data-task="${t.id}">${esc(t.title)}</button><small class="task-description latest-note">${esc(t.latest_note||'No notes yet')}</small></td><td><select class="status status-picker s${statuses.indexOf(t.status)}" data-task-status="${t.id}" aria-label="Status for ${esc(t.title)}">${statuses.map(status=>`<option value="${status}" ${status===t.status?'selected':''}>${status}</option>`).join('')}</select></td><td>${esc(member(t.memberId)?.name||'Unassigned')}</td><td><time datetime="${esc(t.due)}">${esc(new Date(t.due+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}))}</time></td><td><span class="priority ${t.priority}">${esc(t.priority)}</span></td><td><button class="secondary" data-notes="${t.id}" aria-label="Notes for ${esc(t.title)}">Notes</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No tasks match this view.</td></tr>'}</tbody></table></div>`;
 document.querySelectorAll('#columns [data-task]').forEach(b=>b.onclick=()=>taskEditor(b.dataset.task));
 document.querySelectorAll('[data-notes]').forEach(b=>b.onclick=()=>notesEditor(b.dataset.notes));
 document.querySelectorAll('[data-task-status]').forEach(select=>select.onchange=async ()=>{
  if(busy||!ready){render();return}
  const task=state.tasks.find(t=>t.id===select.dataset.taskStatus);
  if(!task||!statuses.includes(select.value))return;
  task.status=select.value;
  if(!await save())return;
  render();toast('Status updated');
 });
}
function welcome(){
 document.body.classList.add('welcome-mode');
 $('#content').innerHTML=`<div class="welcome-card"><div class="welcome-logo">▧ Azzurro Workspace</div><p class="label">YOUR TEAM’S WORKSPACE</p><h1>Let’s get to work.</h1><p class="subtitle">Enter your name so your team knows who shared each update.</p><form id="welcome-form"><label for="visitor-name">Your name</label><input id="visitor-name" name="name" maxlength="70" autocomplete="name" required placeholder="e.g. Alvin Rustia"><button class="primary" type="submit">Enter workspace →</button></form><small>No account or password needed. Names are self-entered.</small></div>`;
 $('#welcome-form').onsubmit=e=>{e.preventDefault();const name=new FormData(e.target).get('name').trim();if(!name)return;visitorName=name;sessionStorage.setItem('forma-visitor',name);render();refresh()};
}
function recordLocalChanges(before,after){
 const entries=[];
 for(const collection of ['tasks','members']){
  for(const item of after[collection]){
   const old=before[collection].find(x=>x.id===item.id);
   const changes={};for(const key of Object.keys(item)){if(key!=='id'&&key!=='note_updated_at'&&(!old||item[key]!==old[key]||(key==='latest_note'&&item.note_updated_at!==old.note_updated_at)))changes[key]={from:old?.[key]??null,to:item[key]}}
   if(!old||Object.keys(changes).length)entries.push({id:crypto.randomUUID(),record_id:item.id,entity:collection,action:old?'UPDATE':'INSERT',actor_name:visitorName,created_at:new Date().toISOString(),record_title:item.title||item.name,changes});
  }
  for(const old of before[collection])if(!after[collection].some(x=>x.id===old.id))entries.push({id:crypto.randomUUID(),record_id:old.id,entity:collection,action:'DELETE',actor_name:visitorName,created_at:new Date().toISOString(),record_title:old.title||old.name,changes:{}});
 }
 after.activity=[...entries.reverse(),...(before.activity||[])];
}
function activityHTML(taskId){
 const entries=(state.activity||[]).filter(e=>e.entity==='tasks'&&e.record_id===taskId);
 const labels={latest_note:'Note',status:'Status',title:'Title',description:'Description',memberId:'Assignee',member_id:'Assignee',due:'Due date',priority:'Priority'};
 return `<div class="activity-history"><h3>Update history</h3>${entries.map(entry=>`<article><b>${esc(entry.actor_name)}</b><time>${esc(new Date(entry.created_at).toLocaleString('en-AU',{timeZone:'Australia/Sydney',dateStyle:'medium',timeStyle:'medium'}))} · Sydney</time><p>${entry.action==='INSERT'?'Task created':entry.action==='DELETE'?'Task deleted':'Task updated'}</p>${Object.entries(entry.changes||{}).filter(([key])=>key!=='note_updated_at'&&key!=='created_at'&&key!=='id').map(([key,value])=>`<p><strong>${esc(labels[key]||key)}:</strong> ${esc(value.to??'Unassigned')}</p>`).join('')}</article>`).join('')||'<p class="note">No recorded updates yet. History starts with changes made after this feature was added.</p>'}</div>`;
}
function notesEditor(id){
 const task=state.tasks.find(t=>t.id===id);if(!task)return;
 openDialog(`<form id="notes-form"><h2>Task notes</h2><p class="subtitle">${esc(task.title)}</p><div class="latest-note-preview"><label>Latest note</label><p>${esc(task.latest_note||'No notes yet')}</p>${task.note_updated_at?`<small>${esc(new Date(task.note_updated_at).toLocaleString('en-AU',{timeZone:'Australia/Sydney'}))}</small>`:''}</div>${activityHTML(task.id)}<label for="note-text">Update note</label><textarea id="note-text" name="note" maxlength="3000" required placeholder="Add the latest update…"></textarea><small>Every saved update is kept in activity history.</small><div class="actions"><button type="button" class="secondary" id="cancel">Close</button><button type="submit" class="primary">Save note</button></div></form>`);
 $('#notes-form').onsubmit=async e=>{
  e.preventDefault();if(busy||!ready)return;
  const note=new FormData(e.target).get('note').trim();if(!note)return;
  const currentTask=state.tasks.find(t=>t.id===id);if(!currentTask){toast('Task no longer exists');return}
  currentTask.latest_note=note;currentTask.note_updated_at=new Date().toISOString();
  if(!await save())return;
  $('#editor').close();render();toast('Note saved');
 };
}
function members(){$('#body').innerHTML=`<div class="members">${state.members.map(m=>`<div class="panel member"><span class="avatar">${esc(initials(m.name))}</span><h3>${esc(m.name)}</h3><span class="pill">${m.role}</span><p class="note">${state.tasks.filter(t=>t.memberId===m.id&&t.status!=='Completed').length} active tasks</p>${admin()?`<button class="secondary" data-remove="${m.id}">Remove member</button>`:''}</div>`).join('')}</div><p class="note">Member roles: Admin, Dev and ProB. No login required — everyone can manage tasks and members.</p>`;document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async ()=>{if(busy||!ready||!admin())return;const m=member(b.dataset.remove);if(!confirm(`Remove ${m.name}? Their tasks will be kept and marked unassigned.`))return;state.tasks.forEach(t=>{if(t.memberId===m.id)t.memberId=''});state.members=state.members.filter(x=>x.id!==m.id);if(!await save())return;render();toast('Member removed')})}
function openDialog(html){$('#editor').innerHTML=html;$('#editor').showModal();$('#cancel').onclick=()=>$('#editor').close()}
function taskEditor(id){if(busy||!ready)return;const t=state.tasks.find(t=>t.id===id);openDialog(`<form id="task-form"><h2>${t?'Edit task':'Create a task'}</h2><label for="title">Task title</label><input id="title" name="title" required maxlength="120" value="${esc(t?.title||'')}" placeholder="What needs to be done?"><label for="description">Description</label><textarea id="description" name="description">${esc(t?.description||'')}</textarea>${t?.latest_note?`<div class="latest-note-preview"><label>Latest note</label><p>${esc(t.latest_note)}</p>${t.note_updated_at?`<small>${esc(new Date(t.note_updated_at).toLocaleString('en-AU',{timeZone:'Australia/Sydney'}))}</small>`:''}</div>`:''}<label for="latest-note">${t?.latest_note?'Update latest note':'Add a note'}</label><textarea id="latest-note" name="note" maxlength="3000" placeholder="Add an update for the team…"></textarea><small>Leave blank to keep the current note.</small>${t?'<button type="button" class="primary save-note-button" id="save-task-note">Save note</button><div id="task-history"></div>':'<small>Save the new task to record its first note.</small>'}<div class="form-row"><div><label for="assignee">Assigned to</label><select id="assignee" name="memberId"><option value="">Unassigned</option>${state.members.map(m=>`<option value="${m.id}" ${(t?.memberId||(selected==='all'?'':selected))===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div><label for="due">Due date</label><input id="due" type="date" name="due" required value="${t?.due||today()}"></div></div><div class="form-row"><div><label for="status">Status</label><select id="status" name="status">${statuses.map(s=>`<option ${t?.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div><label for="priority">Priority</label><select id="priority" name="priority">${['Normal','High'].map(s=>`<option ${t?.priority===s?'selected':''}>${s}</option>`).join('')}</select></div></div><div class="actions">${t?'<button type="button" class="secondary" id="delete-task">Delete</button>':''}<button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">Save task</button></div></form>`);if(t){
 $('#task-history').innerHTML=activityHTML(t.id);
 $('#save-task-note').onclick=async ()=>{
  if(busy||!ready)return;
  const note=$('#latest-note').value.trim();if(!note){toast('Enter a note first');$('#latest-note').focus();return}
  const task=state.tasks.find(x=>x.id===id);if(!task){toast('Task no longer exists');return}
  const button=$('#save-task-note');button.disabled=true;
  task.latest_note=note;task.note_updated_at=new Date().toISOString();
  try{
   if(!await save())return;
   $('#latest-note').value='';$('#task-history').innerHTML=activityHTML(id);
   const preview=$('#task-form .latest-note-preview');
   if(preview)preview.remove();
   const updated=state.tasks.find(x=>x.id===id);
   $('#latest-note').insertAdjacentHTML('beforebegin',`<div class="latest-note-preview"><label>Latest note</label><p>${esc(updated.latest_note)}</p><small>${esc(visitorName)} · ${esc(new Date(updated.note_updated_at).toLocaleString('en-AU',{timeZone:'Australia/Sydney'}))}</small></div>`);
   render();toast('Note saved');
  }finally{button.disabled=false}
 };
}$('#task-form').onsubmit=async e=>{e.preventDefault();if(busy||!ready)return;const data=Object.fromEntries(new FormData(e.target));data.title=data.title.trim();if(!data.title)return;const note=data.note.trim();delete data.note;if(note){data.latest_note=note;data.note_updated_at=new Date().toISOString()}data.id=t?.id||crypto.randomUUID();if(t){const currentTask=state.tasks.find(x=>x.id===id);if(!currentTask){toast("Task no longer exists");return}Object.assign(currentTask,data)}else state.tasks.push(data);if(!await save())return;$('#editor').close();render();toast('Task saved')};$('#delete-task')?.addEventListener('click',async ()=>{if(busy||!ready)return;if(confirm('Delete this task?')){state.tasks=state.tasks.filter(x=>x.id!==id);if(!await save())return;$('#editor').close();render();toast('Task deleted')}})}
function memberEditor(){if(busy||!ready||!admin())return;openDialog('<form id="member-form"><h2>Add team member</h2><label for="name">Full name</label><input id="name" name="name" required maxlength="70" placeholder="e.g. Alex Morgan"><label for="role">Role</label><select id="role" name="role"><option>Dev</option><option>ProB</option><option>Admin</option></select><div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button type="submit" class="primary">Add member</button></div></form>');$('#member-form').onsubmit=async e=>{e.preventDefault();if(!admin())return;const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();if(!data.name)return;state.members.push({...data,id:crypto.randomUUID()});if(!await save())return;$('#editor').close();render();toast('Member added')}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.task-row')){e.preventDefault();taskEditor(e.target.dataset.task)}});
if(FormaStore.enabled){state={members:[],tasks:[]};baseline=structuredClone(state);render();refresh();setInterval(refresh,15000);window.addEventListener('focus',refresh)}else{render()}
