let trackerQuery = '', trackerFilter = 'all';
function trackerUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 2048) return null;
    return url.href;
  } catch { return null; }
}
function trackerKind(value) {
  const safe = trackerUrl(value);
  if (!safe) return { key: 'link', label: 'Link', icon: 'link', host: 'Check this link' };
  const url = new URL(safe), host = url.hostname.replace(/^www\./, '');
  if (host === 'docs.google.com' && url.pathname.startsWith('/spreadsheets')) return { key: 'sheet', label: 'Google Sheets', icon: 'sheet', host };
  if (host === 'docs.google.com' && url.pathname.startsWith('/document')) return { key: 'doc', label: 'Google Docs', icon: 'doc', host };
  if (host === 'docs.google.com' && url.pathname.startsWith('/presentation')) return { key: 'slides', label: 'Google Slides', icon: 'slides', host };
  if (host === 'forms.gle' || host === 'docs.google.com' && url.pathname.startsWith('/forms')) return { key: 'form', label: 'Google Forms', icon: 'form', host };
  if (host === 'drive.google.com') return { key: 'folder', label: 'Google Drive', icon: 'folder', host };
  return { key: 'link', label: 'Web link', icon: 'link', host };
}
function trackers() {
  const rows = state.trackers || [];
  const kinds = [...new Set(rows.map(row => trackerKind(row.url).key))];
  if (trackerFilter !== 'all' && !kinds.includes(trackerFilter)) trackerFilter = 'all';
  $('#body').innerHTML = `<div class="tracker-toolbar"><div class="tabs" role="group" aria-label="Filter trackers"><button data-tracker-filter="all" class="${trackerFilter === 'all' ? 'selected' : ''}" aria-pressed="${trackerFilter === 'all'}">All trackers <span>${rows.length}</span></button>${kinds.map(key => { const kind = trackerKind(rows.find(row => trackerKind(row.url).key === key).url); return `<button data-tracker-filter="${key}" class="${trackerFilter === key ? 'selected' : ''}" aria-pressed="${trackerFilter === key}">${esc(kind.label)}</button>`; }).join('')}</div><div class="search-wrap">${icon('search')}<label class="sr-only" for="tracker-search">Search trackers</label><input id="tracker-search" type="search" placeholder="Find a tracker…" value="${esc(trackerQuery)}"></div></div><div id="tracker-grid"></div><p class="note">Select a tile to open its link in a new tab. Access to each document is managed in Google Drive or its own service.</p>`;
  document.querySelectorAll('[data-tracker-filter]').forEach(button => { button.onclick = () => { trackerFilter = button.dataset.trackerFilter; trackers(); $(`[data-tracker-filter="${trackerFilter}"]`).focus(); }; });
  $('#tracker-search').oninput = event => { trackerQuery = event.target.value; trackerTiles(); };
  trackerTiles();
}
function trackerTiles() {
  const all = state.trackers || [], rows = trackerRows();
  $('#tracker-grid').innerHTML = rows.length ? `<div class="trackers-grid">${rows.map(row => {
    const kind = trackerKind(row.url), safe = trackerUrl(row.url);
    return `<article class="tracker-tile ${kind.key}"><a class="tracker-open" ${safe ? `href="${esc(safe)}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true"'} aria-label="Open ${esc(row.name)} in a new tab"><div class="tracker-top"><span class="tracker-icon">${icon(kind.icon)}</span><span class="tracker-type">${esc(kind.label)}</span>${icon('arrow', 'tracker-arrow')}</div><h2>${esc(row.name)}</h2><p class="tracker-host">${esc(kind.host)}</p><span class="tracker-cta">${safe ? 'Open tracker' : 'Invalid link · Ask an admin to edit'}</span></a>${isAdmin() ? `<div class="tracker-actions"><button class="text-button" data-edit-tracker="${esc(row.id)}" aria-label="Edit ${esc(row.name)}">Edit link</button><button class="text-button remove-link" data-remove-tracker="${esc(row.id)}" aria-label="Remove ${esc(row.name)}">Remove</button></div>` : ''}</article>`;
  }).join('')}</div>` : `<div class="empty-state tracker-empty">${icon('folder')}<h2>${all.length ? 'No matching trackers' : 'A home for your shared trackers'}</h2><p>${all.length ? 'Try another name or clear your filters.' : isAdmin() ? 'Add a Google Sheet, document, or useful link. Your team can open it from here whenever they need it.' : 'An administrator can add the team’s shared sheets, documents, and links here.'}</p>${!all.length && isAdmin() ? '<button class="primary" id="first-tracker">Add a tracker</button>' : ''}</div>`;
  $('#first-tracker')?.addEventListener('click', () => trackerEditor());
  document.querySelectorAll('[data-edit-tracker]').forEach(button => { button.onclick = () => trackerEditor(button.dataset.editTracker); });
  document.querySelectorAll('[data-remove-tracker]').forEach(button => { button.onclick = async () => {
    if (!canEdit()) return;
    const row = state.trackers.find(item => item.id === button.dataset.removeTracker);
    if (!row || !confirm(`Remove “${row.name}” from the workspace? The original document will not be deleted.`)) return;
    state.trackers = state.trackers.filter(item => item.id !== row.id);
    if (await save()) { render(); saved('Tracker removed'); }
  }; });
}
function trackerRows() {
  const needle = trackerQuery.trim().toLowerCase();
  return (state.trackers || []).filter(row => (trackerFilter === 'all' || trackerKind(row.url).key === trackerFilter) && `${row.name} ${row.url}`.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
}
function trackerCopyText() {
  const rows = trackerRows(); if (!rows.length) return '';
  const lines = [`View: ${trackerFilter === 'all' ? 'All trackers' : trackerKind(rows[0].url).label}${trackerQuery ? ` · Search: ${trackerQuery}` : ''}`, `Trackers: ${rows.length}`, ''];
  for (const row of rows) {
    const kind = trackerKind(row.url), safe = trackerUrl(row.url);
    lines.push(`${row.name} · ${kind.label}`, `Link: ${safe || 'Invalid link'}`, '');
  }
  return copyDocument('Trackers', lines);
}
function trackerEditor(id) {
  if (!canEdit()) return;
  const original = state.trackers?.find(row => row.id === id);
  if (id && !original) { toast('This tracker no longer exists.', true); return; }
  const draftId = original?.id || crypto.randomUUID();
  openDialog(`<form id="tracker-form"><h2 id="dialog-title">${original ? 'Edit tracker' : 'Add a tracker'}</h2><p class="subtitle">Keep the links your team uses close at hand.</p><label for="tracker-name">Tracker name</label><input id="tracker-name" name="name" required maxlength="120" placeholder="e.g. Daily room status" value="${esc(original?.name || '')}"><label for="tracker-url">Tracker link</label><input id="tracker-url" type="url" name="url" required maxlength="2048" inputmode="url" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/…" value="${esc(original?.url || '')}"><small>Paste the full link. Your team will still need permission to open the document.</small><div class="tracker-link-preview" id="tracker-link-preview">${icon('link')}<span>Sheets, documents, forms, and other useful links.</span></div><div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button class="primary" type="submit">${original ? 'Save tracker' : 'Add tracker'}</button></div></form>`);
  $('#tracker-url').oninput = () => {
    $('#tracker-url').setCustomValidity(''); const kind = trackerKind($('#tracker-url').value);
    $('#tracker-link-preview').innerHTML = `${icon(kind.icon)}<span>${esc(kind.label)}${trackerUrl($('#tracker-url').value) ? ` · ${esc(kind.host)}` : ''}</span>`;
  };
  $('#tracker-name').oninput = () => $('#tracker-name').setCustomValidity('');
  $('#tracker-form').onsubmit = async event => {
    event.preventDefault(); if (!canEdit()) return;
    const name = $('#tracker-name').value.trim(), url = trackerUrl($('#tracker-url').value);
    if (!name) { $('#tracker-name').setCustomValidity('Enter a tracker name.'); $('#tracker-name').reportValidity(); return; }
    if (!url) { $('#tracker-url').setCustomValidity('Use a valid http or https link without a username or password.'); $('#tracker-url').reportValidity(); return; }
    const row = state.trackers.find(item => item.id === draftId);
    if (original && !row) { toast('This tracker was removed. Close this form and refresh.', true); return; }
    if (row) Object.assign(row, { name, url }); else state.trackers.push({ id: draftId, name, url });
    if (await save()) { $('#editor').close(); render(); saved(original ? 'Tracker updated' : 'Tracker added'); }
  };
}
