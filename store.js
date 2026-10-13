// Per-record writes avoid overwriting other team members' unrelated changes.
window.FormaStore = (() => {
  const config = window.FORMA_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabasePublishableKey);
  async function request(path, method = 'GET', body) {
    const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
      method,
      headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json', 'x-board-actor': encodeURIComponent(window.boardActorName ? window.boardActorName() : 'Unknown'), Prefer: 'return=representation' },
      signal: AbortSignal.timeout(20000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      let error;
      try { error = await response.json(); } catch { error = {}; }
      throw new Error(error.message || `Database request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
  }
  async function allRows(path) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = await request(`${path}&limit=500&offset=${offset}`);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  async function load() {
    const [members, tasks, activity] = await Promise.all([
      allRows('board_members?select=*&order=created_at.asc,id.asc'),
      allRows('board_tasks?select=*&order=created_at.asc,id.asc'),
      allRows('board_activity?select=*&order=created_at.desc,id.desc')
    ]);
    return { activity, members: members.map(({ id, name, role }) => ({ id, name, role })),
      tasks: tasks.map(({ id, title, description, member_id, status, due, priority, latest_note, note_updated_at }) =>
        ({ id, title, description, memberId: member_id || '', status, due, priority, latest_note: latest_note || '', note_updated_at: note_updated_at || null })) };
  }
  async function save(before, after) {
    // Members first so new task assignments have valid foreign keys.
    for (const [collection, table] of [['members', 'board_members'], ['tasks', 'board_tasks']]) {
      for (const item of after[collection]) {
        const old = before[collection].find(x => x.id === item.id);
        const row = collection === 'tasks' ? { ...item, member_id: item.memberId || null } : { ...item };
        delete row.memberId;
        if (!old) await request(table, 'POST', row);
        else {
          const changes = {};
          for (const key of Object.keys(item)) {
            if (key !== 'id' && item[key] !== old[key]) {
              changes[key === 'memberId' ? 'member_id' : key] = key === 'memberId' ? item[key] || null : item[key];
            }
          }
          if (Object.keys(changes).length) {
            const result = await request(`${table}?id=eq.${encodeURIComponent(item.id)}`, 'PATCH', changes);
            if (!result.length) throw new Error('This record was removed by another team member. Refresh and try again.');
          }
        }
      }
    }
    for (const [collection, table] of [['tasks', 'board_tasks'], ['members', 'board_members']]) {
      for (const item of before[collection]) {
        if (!after[collection].some(x => x.id === item.id)) await request(`${table}?id=eq.${encodeURIComponent(item.id)}`, 'DELETE');
      }
    }
  }
  return { enabled, load, save };
})();
