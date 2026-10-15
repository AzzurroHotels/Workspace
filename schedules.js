// Calendar arithmetic uses Sydney wall time, independent of the viewer's device zone.
const Schedule = (() => {
  const zone = 'Australia/Sydney';
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function clock(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p => [p.type,p.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`, minutes:Number(parts.hour)*60+Number(parts.minute), time:`${parts.hour}:${parts.minute}`};
  }
  const shift = (date, days) => new Date(Date.parse(date+'T12:00:00Z') + days*86400000).toISOString().slice(0,10);
  const day = date => new Date(date+'T12:00:00Z').getUTCDay();
  function occurrence(task, now = new Date()) {
    const current = clock(now), start = task.start_date || current.date;
    let date = current.date < start ? start : current.date;
    if (task.frequency === 'weekly') {
      const previous = shift(date, -((day(date)-Number(task.weekday)+7)%7));
      date = previous >= start ? previous : shift(previous,7);
    }
    return date;
  }
  function status(task, completions, now = new Date()) {
    const current = clock(now), date = occurrence(task,now);
    const completion = completions.find(row => row.recurring_id === task.id && row.occurrence === date);
    const [hours,minutes] = task.time.split(':').map(Number);
    const diff = (Date.parse(date+'T12:00:00Z')-Date.parse(current.date+'T12:00:00Z'))/60000 + hours*60+minutes-current.minutes;
    const key = task.paused ? 'paused' : completion ? 'done' : diff < -15 ? 'overdue' : diff <= 0 ? 'now' : diff <= 30 ? 'soon' : 'upcoming';
    return {key,date,completion,canComplete:!task.paused && date<=current.date, label:{paused:'Paused',done:'Completed',overdue:'Overdue',now:'Due now',soon:'Due soon',upcoming:'Upcoming'}[key]};
  }
  function timeLabel(time) {
    const [h,m] = time.split(':').map(Number);
    return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'am':'pm'}`;
  }
  return {zone,weekdays,clock,shift,occurrence,status,timeLabel};
})();
if (typeof module !== 'undefined') module.exports = Schedule;
