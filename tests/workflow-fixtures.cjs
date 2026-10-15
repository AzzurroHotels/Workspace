// Fictional design-review content. Never used by the production config or store.
module.exports = () => {
  const data=require('./fixtures.cjs')();
  const Schedule=require('../schedules.js');
  const day=Schedule.clock().date;
  data.recurring=[
    ['r1','Review arrivals and departures','daily',null,'08:30','Reception','Check today’s arrivals, departures, and special requests.'],
    ['r2','Room status check','daily',null,'11:00','Housekeeping','Confirm clean, occupied, and out-of-order rooms with the team.'],
    ['r3','Evening handover','daily',null,'18:00','Reception','Share open requests and the next shift’s priorities.'],
    ['r4','Supplies and linen count','weekly',1,'10:00','Housekeeping','Check stock levels and add shortages to Purchase List.'],
    ['r5','Publish the team roster','weekly',5,'15:00','Team','Confirm shift coverage for the coming week.']
  ].map(([id,title,frequency,weekday,time,category,notes])=>({id,title,frequency,weekday,time,category,notes,start_date:day,paused:false}));
  data.completions=[{id:'demo-completed',recurring_id:'r1',occurrence:day,completed_at:new Date().toISOString()}];
  data.purchases=[
    {id:'p1',title:'Corridor light bulbs',quantity:'12 bulbs',category:'Maintenance',priority:'High',notes:'Warm white. Confirm the fitting with the onsite team.',status:'planned',purchased_at:null},
    {id:'p2',title:'Bath towels',quantity:'3 packs',category:'Housekeeping',priority:'Normal',notes:'White cotton · check the current supplier’s sizes.',status:'planned',purchased_at:null},
    {id:'p3',title:'Reception stationery',quantity:'2 boxes',category:'Reception',priority:'Normal',notes:'Pens, markers, and handover notebooks.',status:'purchased',purchased_at:new Date().toISOString()}
  ];
  data.tasks.push({id:'maintenance-demo',area:'maintenance',title:'Replace corridor light',description:'Second floor · inspect the fitting before ordering.',memberId:'morgan',due:day,priority:'High',status:'In progress',latest_note:'Inspection complete. Replacement bulbs added to Purchase List.',note_updated_at:new Date().toISOString(),maintenance_property:'Central',maintenance_location:'Second-floor corridor',created_at:new Date().toISOString()});
  return data;
};
