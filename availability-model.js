(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AvailabilityModel=api;})(typeof window!=='undefined'?window:this,()=>{
  const properties=['Allen','Central','Potts Point','Olympic'];
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const day=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
  const property=s=>({allen:'Allen','darling harbour':'Allen','darling harbor':'Allen',central:'Central','central sydney':'Central',pp:'Potts Point','potts point':'Potts Point',olympic:'Olympic','olympic hotel':'Olympic'})[norm(s)];
  const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  function sydneyEnd(date){
    let guess=Date.parse(date+'T12:59:59.999Z');
    for(let i=0;i<3;i++){
      const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
      const wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.999Z`);
      guess+=Date.parse(date+'T23:59:59.999Z')-wall;
    }return guess;
  }
  function parse(text,assets,at=Date.now()){
    const reports=[],unparsed=[];
    for(const raw of String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
      let parts=raw.split('|').map(s=>s.trim());
      if(parts.length<3){
        const m=raw.match(/^(Allen|Darling Harbour|Central(?: Sydney)?|Potts Point|PP|Olympic(?: Hotel)?)\s*[:,]?\s+(Ensuite\s+Room\s+\d+[A-Z]?|Room\s+\d+[A-Z]?|(?:Bathroom|Toilet|Shower)\s+[A-Z]?\d+)\s+(?:is\s+)?(blocked|closed|unavailable|open|reopened|available)\b\s*(.*)$/i);
        if(m&&!/\?/.test(raw)){parts=[m[1],m[2],m[3]];let rest=m[4].replace(/^[\s:–-]+/,'');const since=rest.match(/^since\s+(\d{4}-\d{2}-\d{2}|unknown)\b\s*/i);if(since){parts.push('since '+since[1]);rest=rest.slice(since[0].length);}if(rest)parts.push('reason '+rest);}
      }
      if(parts.length<3){unparsed.push(raw);continue;}
      const p=property(parts[0]),label=norm(parts[1]),state=({blocked:'blocked',closed:'blocked',unavailable:'blocked',open:'available',reopened:'available',available:'available',update:'update'})[norm(parts[2])];
      if(!p||!state){unparsed.push(raw);continue;}
      const targets=label==='all'&&state==='available'?assets.filter(a=>a.property===p):assets.filter(a=>a.property===p&&(norm(a.label)===label||norm(a.id)===label));
      if(!targets.length||(targets.length>1&&label!=='all')){unparsed.push(raw);continue;}
      const fields={closed_on:null,reason:'',action:'',owner:'',eta:''};let bad=false;
      for(const part of parts.slice(3)){
        const m=part.match(/^(since|reason|action|owner|eta)(?:\s*:\s*|\s+)(.+)$/i);
        if(!m){bad=true;break;}const key=m[1].toLowerCase(),value=m[2].trim();
        if(key==='since'){if(value.toLowerCase()==='unknown')continue;if(!dateOK(value)||value>day(at)){bad=true;break;}fields.closed_on=value;}
        else fields[key]=value.slice(0,1000);
      }
      if(bad){unparsed.push(raw);continue;}
      for(const a of targets)reports.push({asset_id:a.id,state,...fields});
    }return{reports,unparsed};
  }
  function replay(assets,reports,now=Date.now()){
    const rows=new Map(assets.map(a=>[a.id,{...a,status:'unconfirmed',current:null,history:[],last_reported_at:null}]));
    const seen=new Set();
    for(const r of [...reports].sort((a,b)=>Date.parse(a.reported_at)-Date.parse(b.reported_at)||String(a.id).localeCompare(String(b.id)))){
      if(seen.has(r.id)||!rows.has(r.asset_id)||!Number.isFinite(Date.parse(r.reported_at))||Date.parse(r.reported_at)>now)continue;seen.add(r.id);
      const a=rows.get(r.asset_id),at=Date.parse(r.reported_at);a.last_reported_at=r.reported_at;
      if(r.state==='blocked'){
        if(!a.current){a.current={id:r.id,asset_id:a.id,first_reported_at:r.reported_at,closed_on:r.closed_on||null,reason:'',action:'',owner:'',eta:'',resolved_at:null,events:[]};a.history.push(a.current);}
        else if(r.closed_on&&(!a.current.closed_on||r.closed_on<a.current.closed_on))a.current.closed_on=r.closed_on;
        a.status='blocked';
      }
      if(a.current){
        for(const k of ['reason','action','owner','eta'])if(r[k])a.current[k]=r[k];
        a.current.events.push(r);
        if(r.state==='available'){a.current.resolved_at=r.reported_at;a.current=null;}
      }
      if(r.state==='available')a.status='available';
    }
    for(const a of rows.values())if(a.current){
      const c=a.current,first=Date.parse(c.first_reported_at);
      c.age_from=c.closed_on?Math.min(first,sydneyEnd(c.closed_on)):first;
      c.age_hours=Math.max(0,(now-c.age_from)/3600000);c.level=c.age_hours>=72?'escalate':c.age_hours>=48?'watch':'open';
    }
    return[...rows.values()];
  }
  function inventoryText(catalog,p){
    const a=catalog.assets.filter(a=>a.property===p),rooms=a.filter(a=>a.kind==='room'),baths=a.filter(a=>a.kind==='bathroom');
    return `${p==='Allen'?'Allen (Darling Harbour)':p} — room and bathroom register\n\nRooms (${rooms.length}): ${rooms.map(a=>a.label.replace(/^Room /,'')).join(', ')}\n\nBathrooms / toilets / showers (${baths.length}): ${baths.map(a=>a.label).join(', ')}\n\n${catalog.gaps.filter(g=>g.property===p).map(g=>'Inventory check: '+g.note+'\n').join('')}Availability is unconfirmed until reception reports it. No closure dates have been invented.`;
  }
  function caseText(a){const c=a.current;return `${a.property} — ${a.label}\nClosed since: ${c.closed_on||'date not supplied; first reported '+day(c.first_reported_at)}\nKnown unresolved age: ${Math.floor(c.age_hours/24)} days ${Math.floor(c.age_hours%24)} hours\nIssue: ${c.reason||'not supplied'}\nAction needed: ${c.action||'not supplied'}\nOwner: ${c.owner||'not supplied'}\nETA: ${c.eta||'not supplied'}`;}
  return{properties,norm,day,property,dateOK,sydneyEnd,parse,replay,inventoryText,caseText};
});
