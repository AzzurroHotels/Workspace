module.exports = function fixture() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const due = offset => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const members = [{ id: 'alex', name: 'Alex Chen', role: 'Admin' }, { id: 'sam', name: 'Sam Taylor', role: 'Dev' }, { id: 'jordan', name: 'Jordan Lee', role: 'ProB' }, { id: 'morgan', name: 'Morgan Ellis', role: 'Dev' }];
  const rows = [
    ['Prepare the weekly operations report', 'alex', 'In progress', 0, 'High', 'Occupancy figures are ready. Adding the final maintenance updates.'],
    ['Refresh the guest welcome guide', 'jordan', 'New', 1, 'Normal', 'Review arrival instructions and the local recommendations.'],
    ['Review the new check-in flow', 'sam', 'For Review', 0, 'High', 'Desktop changes are ready for the team to review.'],
    ['Check room inventory and supplies', 'morgan', 'New', 2, 'Normal', 'Confirm quantities with reception before placing the order.'],
    ['Update the reception handover', 'alex', 'In progress', -1, 'High', 'Waiting for the evening shift’s updates.'],
    ['Publish October team roster', 'jordan', 'Completed', -2, 'Normal', 'Confirmed with the team and shared at reception.'],
    ['Test payment confirmation emails', 'sam', 'For Review', 3, 'Normal', 'Templates tested. Please check the wording and amounts.'],
    ['Inspect common-area lighting', '', 'New', 4, 'Normal', 'Walk through the shared areas and list any replacements.'],
    ['Archive the previous supplier list', '', 'Completed', -3, 'Normal', 'The new directory is now up to date.']
  ];
  return { members, trackers: [
    {id:'tracker-1',name:'Daily room status',url:'https://docs.google.com/spreadsheets/'},
    {id:'tracker-2',name:'Reception handover',url:'https://docs.google.com/document/'},
    {id:'tracker-3',name:'Team roster',url:'https://docs.google.com/spreadsheets/'},
    {id:'tracker-4',name:'Guest experience guide',url:'https://docs.google.com/document/'},
    {id:'tracker-5',name:'Maintenance requests',url:'https://docs.google.com/forms/'},
    {id:'tracker-6',name:'Shared team folder',url:'https://drive.google.com/'}
  ], tasks: rows.map((r, i) => ({ id: `task-${i + 1}`, title: r[0], memberId: r[1], status: r[2], due: due(r[3]), priority: r[4], latest_note: r[5], description: 'Internal operations task. Coordinate the next step with the assigned team member.', note_updated_at: new Date().toISOString() })), activity: [] };
};
