const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../schedules.js');
const task={id:'r',frequency:'daily',weekday:null,time:'09:00',start_date:'2026-01-01',paused:false};
test('Sydney schedule ignores device timezone and resets at Sydney midnight',()=>{
  assert.equal(S.clock(new Date('2026-10-14T13:00:00Z')).date,'2026-10-15');
  const done=[{recurring_id:'r',occurrence:'2026-10-15'}];
  assert.equal(S.status(task,done,new Date('2026-10-15T12:59:00Z')).key,'done');
  assert.equal(S.status(task,done,new Date('2026-10-15T13:00:00Z')).key,'upcoming');
});
test('reminder boundaries use labels as well as color',()=>{
  for(const [iso,key] of [['21:29','upcoming'],['21:30','soon'],['22:00','now'],['22:15','now'],['22:16','overdue']])
    assert.equal(S.status(task,[],new Date(`2026-10-14T${iso}:00Z`)).key,key);
});
test('weekly occurrences remain actionable until the next scheduled day',()=>{
  const weekly={...task,frequency:'weekly',weekday:1};
  assert.equal(S.occurrence(weekly,new Date('2026-10-14T23:00Z')),'2026-10-12');
  assert.equal(S.status(weekly,[],new Date('2026-10-14T23:00Z')).key,'overdue');
  assert.equal(S.occurrence(weekly,new Date('2026-10-18T13:00Z')),'2026-10-19');
  assert.equal(S.status(weekly,[{recurring_id:'r',occurrence:'2026-10-12'}],new Date('2026-10-18T13:00Z')).key,'upcoming');
});
test('new weekly and future routines do not invent overdue occurrences',()=>{
  const weekly={...task,start_date:'2026-10-15',frequency:'weekly',weekday:1};
  const status=S.status(weekly,[],new Date('2026-10-15T00:00Z'));
  assert.equal(status.date,'2026-10-19');assert.equal(status.canComplete,false);
  assert.equal(S.occurrence({...task,start_date:'2027-01-01'},new Date('2026-12-31T00:00Z')),'2027-01-01');
});
test('daylight-saving transitions produce one occurrence per local date',()=>{
  const early={...task,time:'02:30'};
  assert.equal(S.status(early,[],new Date('2026-10-03T15:59Z')).key,'upcoming');
  assert.equal(S.status(early,[],new Date('2026-10-03T16:00Z')).key,'overdue');
  const done=[{recurring_id:'r',occurrence:'2026-04-05'}];
  assert.equal(S.status(early,done,new Date('2026-04-04T15:45Z')).key,'done');
  assert.equal(S.status(early,done,new Date('2026-04-04T16:45Z')).key,'done');
  assert.equal(S.shift('2026-12-31',1),'2027-01-01');
});
test('paused routines never become actionable',()=>{
  const s=S.status({...task,paused:true},[],new Date('2026-10-15T05:00Z'));
  assert.equal(s.key,'paused');assert.equal(s.canComplete,false);
});
