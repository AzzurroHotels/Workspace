// Public-key REST adapter. Authorization must be enforced by Supabase RLS.
window.FormaStore = (() => {
  const config = window.FORMA_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabasePublishableKey);
  const fields = {
    members: ['id', 'name', 'role'],
    trackers: ['id', 'name', 'url'],
    recurring: ['id','title','category','notes','frequency','weekday','time','start_date','paused'],
    completions: ['id','recurring_id','occurrence','completed_at'],
    purchases: ['id','title','quantity','category','notes','priority','status','purchased_at'],
    tasks: ['id', 'area', 'title', 'description', 'member_id', 'status', 'due', 'priority', 'latest_note', 'note_updated_at', 'maintenance_property', 'maintenance_location']
  };
  let snapshots = new Map();

  async function request(path, method = 'GET', body, prefer = 'return=representation') {
    const sharedEntry = config.accessMode === 'shared-name';
    const accessToken = sharedEntry ? config.supabasePublishableKey : await window.WorkspaceAuth.token();
    let response;
    try {
      response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
        method,
        headers: {
          apikey: config.supabasePublishableKey,
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          Prefer: prefer,
          ...(sharedEntry ? { 'x-board-actor': encodeURIComponent(String(window.boardActorName?.() || 'Unknown').trim().slice(0, 70)) } : {})
        },
        signal: AbortSignal.timeout(20000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      throw new Error(error.name === 'TimeoutError' ? 'The request timed out. Check the workspace before retrying.' : 'The connection was interrupted. Check the workspace before retrying.');
    }
    if (!response.ok) {
      let error;
      try { error = await response.json(); } catch { error = {}; }
      throw new Error(error.message || `Database request failed (${response.status})`);
    }
    if (response.status === 204) return [];
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('The workspace returned an unexpected response.');
    return data;
  }

  async function allRows(path) {
    const rows = [], seen = new Set();
    // Advance by the actual page size: the project may cap responses below 500.
    for (;;) {
      const page = await request(`${path}&limit=500&offset=${rows.length}`);
      if (!page.length) return rows;
      for (const row of page) {
        if (!row.id || seen.has(row.id)) throw new Error('Workspace changed during loading. Please refresh.');
        seen.add(row.id);
        rows.push(row);
      }
    }
  }

  async function load() {
    const [members, tasks, activity, trackers, recurring, completions, purchases] = await Promise.all([
      allRows('board_members?select=*&order=created_at.asc,id.asc'),
      allRows('board_tasks?select=*&order=created_at.asc,id.asc'),
      allRows('board_activity?select=*&order=created_at.desc,id.desc'),
      allRows('board_trackers?select=*&order=created_at.asc,id.asc'),
      allRows('board_recurring?select=*&order=created_at.asc,id.asc'),
      allRows('board_completions?select=*&order=created_at.asc,id.asc'),
      allRows('board_purchases?select=*&order=created_at.asc,id.asc')
    ]);
    snapshots = new Map([
      ...recurring.map(row => [`recurring:${row.id}`, row]),
      ...completions.map(row => [`completions:${row.id}`, row]),
      ...purchases.map(row => [`purchases:${row.id}`, row]),
      ...members.map(row => [`members:${row.id}`, row]),
      ...tasks.map(row => [`tasks:${row.id}`, row]),
      ...trackers.map(row => [`trackers:${row.id}`, row])
    ]);
    return {
      // UI edits must never mutate the original values used by concurrency guards.
      activity, recurring: recurring.map(row => ({ ...row })), completions: completions.map(row => ({ ...row })), purchases: purchases.map(row => ({ ...row })), trackers: trackers.map(({ id, name, url }) => ({ id, name, url })),
      members: members.map(({ id, name, role }) => ({ id, name, role })),
      tasks: tasks.map(({ id, area, title, description, member_id, status, due, priority, latest_note, note_updated_at, maintenance_property, maintenance_location, created_at }) => ({
        id, area: area || 'operations', title, description: description || '', memberId: member_id || '', status, due, priority,
        latest_note: latest_note || '', note_updated_at: note_updated_at || null,
        maintenance_property: maintenance_property || '', maintenance_location: maintenance_location || '', created_at: created_at || null
      }))
    };
  }

  function toRow(collection, item) {
    const source = { ...item, member_id: item.memberId || null };
    return Object.fromEntries(fields[collection].filter(key => source[key] !== undefined).map(key => [key, source[key]]));
  }

  function equals(value) {
    // Simple eq filters take a literal value. URLSearchParams safely encodes it;
    // quoting it here would compare the quote characters as part of the text.
    return value == null ? 'is.null' : 'eq.' + String(value);
  }

  function guardedPath(table, collection, old, keys) {
    const original = snapshots.get(`${collection}:${old.id}`) || toRow(collection, old);
    const query = new URLSearchParams({ id: `eq.${old.id}` });
    for (const key of keys) if (key !== 'id') query.set(key, equals(original[key]));
    return `${table}?${query}`;
  }

  async function save(before, after) {
    const removedMembers = new Set(before.members.filter(person => !after.members.some(next => next.id === person.id)).map(person => person.id));
    const removedRoutines = new Set((before.recurring || []).filter(row => !(after.recurring || []).some(next => next.id === row.id)).map(row => row.id));
    let writes = 0;
    try {
      for (const [collection, table] of [['members', 'board_members'], ['tasks', 'board_tasks'], ['trackers', 'board_trackers'], ['recurring','board_recurring'], ['completions','board_completions'], ['purchases','board_purchases']]) {
        for (const item of (after[collection] || [])) {
          const old = (before[collection] || []).find(row => row.id === item.id);
          const row = toRow(collection, item);
          if (!old) { await request(table, 'POST', row); writes++; continue; }
          const previous = toRow(collection, old);
          const changes = Object.fromEntries(Object.entries(row).filter(([key, value]) => key !== 'id' && value !== previous[key]));
          // The existing ON DELETE SET NULL foreign key unassigns these atomically.
          // A concurrent reassignment must not be overwritten by a separate PATCH.
          if (collection === 'tasks' && changes.member_id === null && removedMembers.has(previous.member_id)) delete changes.member_id;
          if (Object.keys(changes).length) {
            const result = await request(guardedPath(table, collection, old, Object.keys(changes)), 'PATCH', changes);
            if (!result.length) throw new Error('This record changed or was removed by someone else. Review the latest values before saving again.');
            writes++;
          }
        }
      }
      // Explicit reassignments happen first; the FK handles remaining assignments.
      for (const [collection, table] of [['completions','board_completions'], ['tasks', 'board_tasks'], ['members', 'board_members'], ['trackers', 'board_trackers'], ['recurring','board_recurring'], ['purchases','board_purchases']]) {
        for (const item of (before[collection] || [])) {
          if (collection === 'completions' && removedRoutines.has(item.recurring_id)) continue;
          if ((after[collection] || []).some(row => row.id === item.id)) continue;
          const result = await request(guardedPath(table, collection, item, fields[collection]), 'DELETE');
          if (!result.length) throw new Error('This record changed or was removed by someone else. Refresh before deleting it.');
          writes++;
        }
      }
    } catch (error) {
      error.partial = writes > 0;
      throw error;
    }
  }
  async function users() {
    const rows = []; let page;
    do { page = await request('workspace_access?select=email,username,display_name,role,created_at&order=username.asc&limit=500&offset=' + rows.length); rows.push(...page); } while (page.length);
    return rows;
  }
  async function saveUser(user, original) {
    const body = { username: user.username, display_name: user.display_name, role: user.role };
    const query = original ? new URLSearchParams({ email: equals(original.email), username: equals(original.username), role: equals(original.role), display_name: equals(original.display_name) }) : null;
    const result = await request('workspace_access' + (query ? '?' + query : ''), original ? 'PATCH' : 'POST', original ? body : { ...body, email: user.email });
    if (!result.length) throw new Error('User access changed. Refresh Users and try again.');
  }
  async function removeUser(user) {
    const result = await request('workspace_access?' + new URLSearchParams({ email: equals(user.email), username: equals(user.username), role: equals(user.role), display_name: equals(user.display_name) }), 'DELETE');
    if (!result.length) throw new Error('User access changed. Refresh Users and try again.');
  }
  const availabilityLoad = async () => ({assets:await allRows('board_availability_assets?select=*&active=eq.true&order=id.asc'),reports:await allRows('board_availability_reports?select=*&order=reported_at.asc,id.asc')});
  const availabilityReport = row => request('board_availability_reports?on_conflict=id','POST',row,'resolution=ignore-duplicates,return=representation');
  return { enabled, load, save, users, saveUser, removeUser, availabilityLoad, availabilityReport };
})();
