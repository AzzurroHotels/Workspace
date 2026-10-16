// Run against `npm start`. Local fixtures and mocked REST keep production untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Install playwright or set PLAYWRIGHT_MODULE to its package directory.'); playwright = require(process.env.PLAYWRIGHT_MODULE); }
const fixture = require('./fixtures.cjs');
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.TEST_OUTPUT || 'test-results');
fs.mkdirSync(output, { recursive: true });
const results = [];
const check = (name, details = '') => { results.push({ name, status: 'passed', details }); console.log('PASS', name, details); };

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const errors = [];
  async function newPage(data, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
    await context.route('**/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.FORMA_CONFIG = {preview:true};' }));
    // Never contact a real Supabase project from this test suite.
    await context.route('**/*.supabase.co/**', route => route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(data => { sessionStorage.setItem('forma-visitor', 'Alex Chen'); if (data && !localStorage.getItem('azzurro-board-v2')) localStorage.setItem('azzurro-board-v2', JSON.stringify(data)); }, data);
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedText = value; } } }));
    await page.goto(base); await page.locator('.heading').waitFor();
    return page;
  }
  try {
    const page = await newPage(fixture());
    assert.equal(await page.locator('.stat-label:visible').count(), 4);
    await page.locator('#copy-view').click();
    await page.waitForFunction(() => window.__copiedText?.includes('DASHBOARD SNAPSHOT'));
    assert.match(await page.evaluate(() => window.__copiedText), /COMING UP · ALL TASKS DUE IN THE NEXT 3 DAYS/);
    await page.screenshot({ path: path.join(output, 'desktop-dashboard.png'), fullPage: true });
    await page.locator('[data-view="board"]').click();
    await page.locator('#scope').selectOption('all');
    assert.equal(await page.locator('.card').count(), 9);
    const tops = await page.locator('.column').evaluateAll(columns => columns.map(column => Math.round(column.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, 'Desktop shows four columns on the same row');
    await page.screenshot({ path: path.join(output, 'desktop-board.png'), fullPage: true });
    await page.locator('[data-layout="list"]').click();
    await page.screenshot({ path: path.join(output, 'desktop-list.png'), fullPage: true });
    await page.locator('[data-view="members"]').click();
    await page.screenshot({ path: path.join(output, 'desktop-members.png'), fullPage: true });
    check('Desktop dashboard, four-column board, list, and members render');

    await page.locator('[data-view="board"]').click();
    await page.locator('[data-filter="unassigned"]').click();
    await page.locator('#scope').selectOption('completed');
    assert.equal(await page.locator('[data-task="task-9"]').count(), 1);
    await page.locator('[data-filter="all"]').click();
    await page.locator('#scope').selectOption('all');
    await page.locator('#search').fill('templates tested');
    assert.equal(await page.locator('[data-task="task-7"]').count(), 1);
    await page.locator('#copy-view').click();
    await page.waitForFunction(() => window.__copiedText?.includes('Test payment confirmation emails'));
    const exported = await page.evaluate(() => window.__copiedText);
    assert.match(exported, /View: all tasks/); assert.doesNotMatch(exported, /Inspect common-area lighting/);
    const downloadPromise = page.waitForEvent('download'); await page.locator('#export-tasks').click();
    const download = await downloadPromise, exportPath = await download.path();
    const downloadedText = fs.readFileSync(exportPath, 'utf8');
    assert.match(downloadedText, /Test payment confirmation emails/); assert.doesNotMatch(downloadedText, /Inspect common-area lighting/);
    await page.locator('#search').fill('');
    check('Completed unassigned work, note search, and filtered task copy');

    await page.locator('[data-view="members"]').click(); await page.locator('#add-member').click();
    await page.locator('#name').fill('Test Member'); await page.locator('#role').selectOption('ProB'); await page.locator('#member-form button[type="submit"]').click();
    assert.equal(await page.locator('.member h3', { hasText: 'Test Member' }).count(), 1);
    await page.locator('[data-view="board"]').click(); await page.locator('#add-task').click();
    await page.locator('#title').fill('Regression task'); await page.locator('#description').fill('Keyboard and note regression');
    await page.locator('#assignee').selectOption({ label: 'Test Member' }); await page.locator('#latest-note').fill('First update'); await page.locator('#task-form button[type="submit"]').click();
    await page.getByRole('button', { name: 'Regression task', exact: true }).click();
    await page.locator('#title').fill('Regression task edited'); await page.locator('#latest-note').fill('Second update\nWith a second line');
    await page.locator('#save-task-note').click();
    assert.equal(await page.locator('#title').inputValue(), 'Regression task edited');
    assert.match(await page.locator('#task-history').innerText(), /Second update/);
    await page.locator('#task-form button[type="submit"]').click();
    const taskId = await page.getByRole('button', { name: 'Regression task edited', exact: true }).getAttribute('data-task');
    await page.locator(`[data-task-status="${taskId}"]`).selectOption('Completed');
    assert.equal(await page.locator(`[data-task-status="${taskId}"]`).inputValue(), 'Completed');
    check('Create member/task, edit details, save notes without losing draft, update status');

    await page.locator('[data-view="members"]').click(); await page.locator('#copy-view').click();
    await page.waitForFunction(() => window.__copiedText?.includes('TEAM MEMBERS'));
    assert.match(await page.evaluate(() => window.__copiedText), /Alex Chen/);
    assert.match(await page.evaluate(() => window.__copiedText), /Prepare the weekly operations report/);
    await page.locator('[data-view="users"]').click(); await page.waitForFunction(() => !document.querySelector('#copy-view').disabled);
    await page.locator('#copy-view').click(); await page.waitForFunction(() => window.__copiedText?.includes('WORKSPACE USERS'));
    const userCopy = await page.evaluate(() => window.__copiedText);
    assert.match(userCopy, /Login name: preview/); assert.doesNotMatch(userCopy, /password|preview@example\.com/i);
    check('Team and user tabs copy helpful fields without copying passwords or account emails');

    const workflowPage = await newPage(require('./workflow-fixtures.cjs')());
    await workflowPage.locator('[data-view="recurring"]').click(); await workflowPage.locator('#routine-category').selectOption({ label: 'Housekeeping' });
    await workflowPage.locator('#routine-search').fill('room'); await workflowPage.locator('#copy-view').click();
    await workflowPage.waitForFunction(() => window.__copiedText?.includes('RECURRING TASKS'));
    const routineCopy = await workflowPage.evaluate(() => window.__copiedText);
    assert.match(routineCopy, /Room status check/); assert.match(routineCopy, /Every day/); assert.doesNotMatch(routineCopy, /Evening handover/);
    await workflowPage.locator('[data-view="maintenance"]').click();
    await workflowPage.evaluate(() => state.activity.push({ entity: 'tasks', record_id: 'maintenance-demo', action: 'UPDATE', actor_name: 'Sam Taylor', created_at: new Date().toISOString(), changes: { latest_note: { from: '', to: 'Checked the fitting' } } }));
    await workflowPage.locator('#copy-view').click(); await workflowPage.waitForFunction(() => window.__copiedText?.includes('ONSITE MAINTENANCE'));
    const maintenanceCopy = await workflowPage.evaluate(() => window.__copiedText);
    assert.match(maintenanceCopy, /Property: Central/); assert.match(maintenanceCopy, /Room or place: Second-floor corridor/); assert.match(maintenanceCopy, /Checked the fitting/);
    await workflowPage.locator('[data-view="trackers"]').click(); await workflowPage.locator('[data-tracker-filter="sheet"]').click();
    await workflowPage.locator('#copy-view').click(); await workflowPage.waitForFunction(() => window.__copiedText?.includes('Trackers: 2'));
    assert.match(await workflowPage.evaluate(() => window.__copiedText), /Daily room status/);
    assert.doesNotMatch(await workflowPage.evaluate(() => window.__copiedText), /Reception handover/);
    await workflowPage.locator('[data-view="purchases"]').click(); await workflowPage.locator('#copy-view').click();
    await workflowPage.waitForFunction(() => window.__copiedText?.includes('Purchase List'));
    const purchaseCopy = await workflowPage.evaluate(() => window.__copiedText);
    assert.match(purchaseCopy, /^Date: \d{1,2} [A-Za-z]{3} \d{4}\nPurchase List\nCorridor light bulbs - 12 bulbs\nBath towels - 3 packs$/);
    assert.doesNotMatch(purchaseCopy, /Quantity|Priority|Maintenance|Reception stationery/);
    await workflowPage.locator('[data-purchase-scope="all"]').click(); await workflowPage.locator('#copy-view').click();
    await workflowPage.waitForFunction(() => window.__copiedText?.includes('Reception stationery - 2 boxes'));
    assert.match(await workflowPage.evaluate(() => window.__copiedText), /Corridor light bulbs - 12 bulbs[\s\S]*Bath towels - 3 packs[\s\S]*Reception stationery - 2 boxes/);
    check('Filtered recurring, maintenance history, trackers, and purchase list copy their own fields');

    await page.locator('[data-view="board"]').click(); await page.locator('[data-layout="kanban"]').click();
    await page.locator('.card[data-id="task-2"]').dragTo(page.locator('.column[data-status="In progress"]'));
    assert.equal(await page.locator('[data-task-status="task-2"]').inputValue(), 'In progress');
    await page.locator('[data-view="members"]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.member', { has: page.locator('h3', { hasText: 'Test Member' }) }).getByRole('button', { name: 'Remove Test Member', exact: true }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('azzurro-board-v2')));
    assert.equal(stored.tasks.find(task => task.id === taskId).memberId, '');
    await page.locator('[data-view="board"]').click();
    await page.getByRole('button', { name: 'Regression task edited', exact: true }).click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('#delete-task').click();
    assert.equal(await page.getByRole('button', { name: 'Regression task edited', exact: true }).count(), 0);
    check('Drag status, remove member while preserving tasks, delete task');

    await page.locator('[data-view="dashboard"]').click();
    const originalMonth = await page.locator('.calendar-toolbar b').innerText();
    await page.locator('#next').click(); assert.notEqual(await page.locator('.calendar-toolbar b').innerText(), originalMonth);
    await page.locator('#now').click(); assert.equal(await page.locator('.calendar-toolbar b').innerText(), originalMonth);
    await page.locator('.calendar-task').first().click(); assert.equal(await page.locator('#editor').getAttribute('open'), '');
    await page.keyboard.press('Escape');
    await page.locator('[data-view="board"]').click(); await page.keyboard.press('/'); assert.equal(await page.locator('#search').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-view="members"]').click(); await page.goBack(); assert.match(page.url(), /#board$/);
    await page.reload(); assert.match(await page.locator('#breadcrumb').innerText(), /Operations/);
    assert.equal(await page.locator('[data-task-status="task-2"]').inputValue(), 'In progress');
    check('Calendar controls, keyboard search, Escape, browser history, persisted state');

    const widths = [1920, 1440, 1280, 1024, 768, 390, 320];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ['dashboard', 'board', 'members']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${view} overflows at ${width}`);
        if (view === 'dashboard') assert.equal(await page.locator('.stat-label:visible').count(), 4);
        if (view === 'board') for (const layout of ['list', 'kanban']) {
          await page.locator(`[data-layout="${layout}"]`).click();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${layout} overflows at ${width}`);
          if (width >= 1280 && layout === 'kanban') {
            const tops = await page.locator('.column').evaluateAll(items => items.map(el => el.offsetTop)); assert.equal(new Set(tops).size, 1);
          }
        }
      }
      await page.locator('#add-member').click();
      const fits = await page.locator('#editor').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
      assert.equal(fits, true, `Dialog overflows at ${width}`); await page.keyboard.press('Escape');
      await workflowPage.setViewportSize({ width, height: 1000 });
      for (const workflowView of ['recurring', 'maintenance', 'trackers', 'purchases']) {
        await workflowPage.locator(`[data-view="${workflowView}"]`).click();
        assert.equal(await workflowPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${workflowView} overflows at ${width}`);
        const actionFits = await workflowPage.locator('#copy-view').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
        assert.equal(actionFits, true, `${workflowView} copy action overflows at ${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-view="board"]').click(); await page.screenshot({ path: path.join(output, 'mobile-board.png'), fullPage: true });
    check('Responsive views and dialogs', widths.join(', ') + 'px; desktop stays four columns at 1280px+');

    const empty = await newPage(null);
    await empty.locator('[data-view="members"]').click(); assert.equal(await empty.locator('#first-member').count(), 1);
    await empty.locator('[data-view="board"]').click(); await empty.locator('#search').fill('no results'); await empty.locator('#copy-view').click();
    assert.match(await empty.locator('#toast').innerText(), /nothing in this view/);
    await empty.locator('#export-tasks').click(); assert.match(await empty.locator('#toast').innerText(), /No tasks to export/);
    assert.equal(await empty.locator('#change-name,#welcome-form,#visitor-name').count(), 0);
    await empty.setViewportSize({width:320,height:800});
    assert.equal(await empty.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    check('Empty states and removal of all name-only entry controls');

    const malicious = fixture(); malicious.members[0].role = '<img src=x onerror=alert(1)>'; malicious.tasks[0].title = '<script>window.injected=true</script>'; malicious.members[0].name = 'A'.repeat(70);
    const hostile = await newPage(malicious); await hostile.locator('[data-view="members"]').click(); assert.equal(await hostile.locator('.member img').count(), 0);
    await hostile.locator('[data-view="board"]').click(); assert.equal(await hostile.evaluate(() => window.injected), undefined);
    check('Stored content is escaped instead of executed');

    const blockedStorage = await newPage(fixture());
    await blockedStorage.locator('[data-view="board"]').click();
    await blockedStorage.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
    await blockedStorage.locator('[data-task-status="task-1"]').selectOption('Completed');
    assert.match(await blockedStorage.locator('#toast').innerText(), /not saved/);
    assert.equal(await blockedStorage.locator('[data-task-status="task-1"]').inputValue(), 'In progress');
    check('Storage failure rolls back the displayed change and reports it');

    // Shared-mode errors are exercised only against an intercepted fake host.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const authFixture = require('./auth-fixture.cjs');
    await context.addInitScript(session => localStorage.setItem('azzurro-staff-auth', JSON.stringify(session)), authFixture.session);
    await context.route('**/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.FORMA_CONFIG={supabaseUrl:"https://workspace.test",supabasePublishableKey:"test"};' }));
    const sharedFixture = fixture();
    const db = { board_members: sharedFixture.members, board_tasks: sharedFixture.tasks.map(({ memberId, ...task }) => ({ ...task, member_id: memberId || null })), board_activity: [] };
    let failLoad = false, writes = 0, ambiguousCreate = false;
    await context.route('https://workspace.test/**', async route => {
      const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: authFixture.user });
      if (table === 'workspace_access') return route.fulfill({ json: [authFixture.profile] });
      if (req.method() === 'GET') {
        if (failLoad) return route.fulfill({ status: 503, json: { message: 'Test reload failure' } });
        return route.fulfill({ json: (db[table] || []).slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + 500) });
      }
      writes++;
      if (ambiguousCreate && req.method() === 'POST') { db[table].push(req.postDataJSON()); return route.abort('failed'); }
      failLoad = true; return route.fulfill({ json: [{ ...db[table][0], ...req.postDataJSON() }] });
    });
    const shared = await context.newPage(); shared.on('pageerror', error => errors.push(error.message));
    await shared.goto(base + '/#board'); await shared.locator('[data-task-status="task-1"]').waitFor();
    await shared.locator('[data-task-status="task-1"]').selectOption('For Review');
    await shared.locator('#reconnect').waitFor();
    assert.match(await shared.locator('#toast').innerText(), /latest workspace could not be loaded/);
    assert.equal(writes, 1);
    await shared.locator('#add-task').click(); assert.equal(await shared.locator('#editor[open]').count(), 0);
    failLoad = false; await shared.locator('#reconnect').click(); await shared.locator('#reconnect').waitFor({ state: 'detached' });
    check('Successful write plus failed reload reports saved, blocks duplicate edits, and reconnects');

    await shared.locator('#add-task').click(); await shared.locator('#title').fill('An unsaved draft');
    const loadBefore = await shared.locator('#title').inputValue();
    await shared.evaluate(() => refresh());
    assert.equal(await shared.locator('#title').inputValue(), loadBefore);
    await shared.keyboard.press('Escape');
    await shared.locator('#search').fill('weekly'); await shared.evaluate(() => refresh());
    assert.equal(await shared.locator('#search').inputValue(), 'weekly');
    check('Background refresh preserves open dialogs and focused search input');

    failLoad = true;
    await shared.reload(); await shared.locator('#retry').waitFor();
    assert.match(await shared.locator('h1').innerText(), /reconnect/);
    failLoad = false; await shared.locator('#retry').click(); await shared.locator('.heading').waitFor();
    check('Initial connection failure offers a working retry');

    ambiguousCreate = true;
    const beforeCreate = writes;
    await shared.locator('#add-task').click(); await shared.locator('#title').fill('Ambiguous creation test');
    await shared.locator('#task-form button[type="submit"]').click();
    await shared.getByText('Save could not be confirmed.', { exact: false }).waitFor();
    assert.equal(await shared.locator('#editor[open]').count(), 1);
    await shared.locator('#task-form button[type="submit"]').click();
    await shared.locator('#editor[open]').waitFor({ state: 'detached' });
    assert.equal(writes, beforeCreate + 1);
    assert.equal(db.board_tasks.filter(task => task.title === 'Ambiguous creation test').length, 1);
    check('Retry after a committed creation with a lost response does not duplicate the task');

    assert.deepEqual(errors, []);
    check('No browser JavaScript errors');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`${results.length} browser scenario groups passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
