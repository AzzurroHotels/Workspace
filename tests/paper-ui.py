"""Local-only Playwright checks for trackers, layout and strict startup."""
import json
import os
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:4174')
OUT = Path(os.environ.get('TEST_OUTPUT', 'test-results')).resolve()
OUT.mkdir(parents=True, exist_ok=True)
results, errors = [], []

def passed(name):
    results.append({'name': name, 'status': 'passed'})
    print('PASS', name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('BROWSER_CHANNEL', 'msedge'))
    try:
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        context.route('**/*.supabase.co/**', lambda route: route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until='networkidle')
        expect(page.locator('.heading')).to_be_visible()
        assert page.locator('#change-name,#welcome-form,#visitor-name').count() == 0
        expect(page.locator('.preview-banner')).to_contain_text('Sample data only')
        expect(page.locator('#sidebar-toggle')).to_have_attribute('aria-expanded', 'true')
        page.locator('#sidebar-toggle').click()
        expect(page.locator('aside')).to_be_hidden()
        assert page.locator('main').bounding_box()['x'] == 0
        page.reload(wait_until='networkidle')
        expect(page.locator('aside')).to_be_hidden()
        page.screenshot(path=str(OUT / 'desktop-expanded.png'), full_page=True)
        page.locator('#sidebar-toggle').click()
        expect(page.locator('aside')).to_be_visible()
        passed('Sidebar toggles full-width content and remembers the choice after reload')

        page.locator('[data-view="trackers"]').click()
        expect(page.locator('.tracker-tile')).to_have_count(6)
        page.screenshot(path=str(OUT / 'desktop-trackers.png'), full_page=True)
        page.locator('#add-tracker').click()
        page.locator('#tracker-name').fill('Audit sheet <safe>')
        page.locator('#tracker-url').fill('javascript:alert(1)')
        page.locator('#tracker-form button[type=submit]').click()
        expect(page.locator('#editor')).to_be_visible()
        assert page.locator('#tracker-url').evaluate('(el)=>el.validity.valid') is False
        page.locator('#tracker-url').fill('https://docs.google.com/spreadsheets/d/test-local-only/edit#gid=1')
        page.locator('#tracker-form button[type=submit]').click()
        link = page.get_by_role('link', name='Open Audit sheet <safe> in a new tab', exact=True)
        expect(link).to_be_visible()
        expect(link).to_have_attribute('rel', 'noopener noreferrer')
        assert link.locator('safe').count() == 0
        context.route('https://docs.google.com/**', lambda route: route.fulfill(body='<title>Local document fixture</title>'))
        with page.expect_popup() as popup_info:
            link.click()
        popup = popup_info.value
        popup.wait_for_load_state()
        assert popup.url == 'https://docs.google.com/spreadsheets/d/test-local-only/edit#gid=1'
        popup.close()
        page.get_by_role('button', name='Edit Audit sheet <safe>', exact=True).click()
        page.locator('#tracker-name').fill('Audit handover')
        page.locator('#tracker-url').fill('https://docs.google.com/document/d/test-local-only/edit')
        page.locator('#tracker-form button[type=submit]').click()
        page.reload(wait_until='networkidle')
        expect(page.get_by_role('link', name='Open Audit handover in a new tab')).to_be_visible()
        page.locator('#tracker-search').fill('handover')
        assert page.locator('.tracker-tile').count() == 2
        page.locator('#tracker-search').fill('no such tracker')
        expect(page.locator('.empty-state')).to_contain_text('No matching trackers')
        page.locator('#tracker-search').fill('')
        page.locator('[data-tracker-filter="sheet"]').click()
        expect(page.locator('.tracker-tile')).to_have_count(2)
        page.locator('[data-tracker-filter="all"]').click()
        page.once('dialog', lambda dialog: dialog.accept())
        page.get_by_role('button', name='Remove Audit handover', exact=True).click()
        expect(page.locator('.tracker-tile')).to_have_count(6)
        passed('Tracker add/edit/delete persist; search, type filters, escaped names and new-tab links work')
        passed('Unsafe tracker URL is rejected without saving or navigating')

        for width in [1920, 1440, 1280, 1024, 768, 390, 320]:
            page.set_viewport_size({'width': width, 'height': 1000})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Trackers overflow at {width}'
            page.locator('#add-tracker').click()
            box = page.locator('#editor').bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= width
            page.locator('#cancel').click()
            page.locator('#sidebar-toggle').click()
            expect(page.locator('aside')).to_be_hidden()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#sidebar-toggle').click()
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(OUT / 'mobile-trackers.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        passed('Trackers, editor and expanded mode fit seven viewport widths from 320 to 1920')

        page.locator('[data-view="board"]').click()
        page.locator('[data-filter="jordan"]').click()
        expect(page.locator('#scope')).to_have_value('all')
        expect(page.locator('.card[data-id="task-6"]')).to_be_visible()
        expect(page.locator('.card[data-id="task-2"]')).to_be_visible()
        page.locator('.card[data-id="task-6"] .latest-note').click()
        expect(page.locator('#task-form')).to_be_visible()
        expect(page.locator('#title')).to_have_value('Publish October team roster')
        page.keyboard.press('Escape')
        page.get_by_role('button', name='Edit Publish October team roster', exact=True).click()
        expect(page.locator('#task-form')).to_be_visible()
        page.keyboard.press('Escape')
        for key in ['Enter', 'Space']:
            page.locator('.card[data-id="task-6"]').focus()
            page.keyboard.press(key)
            expect(page.locator('#task-form')).to_be_visible()
            page.keyboard.press('Escape')
        page.locator('[data-notes="task-6"]').click()
        expect(page.locator('#notes-form')).to_be_visible()
        assert page.locator('#task-form').count() == 0
        page.keyboard.press('Escape')
        page.locator('[data-layout="list"]').click()
        expect(page.locator('[data-task="task-6"]')).to_be_visible()
        page.locator('[data-layout="kanban"]').click()
        page.locator('[data-filter="all"]').click()
        expect(page.locator('#scope')).to_have_value('active')
        page.screenshot(path=str(OUT / 'desktop-board-restored.png'), full_page=True)
        passed('Original whole-card opening, Edit button, keyboard actions and completed member tasks are restored')

        page.locator('[data-notes="task-1"]').click()
        page.locator('#note-text').fill('New timestamped update')
        page.locator('#notes-form button[type=submit]').click()
        task = page.locator('.card[data-id="task-1"]')
        expect(task.locator('.note-time')).to_contain_text('Update added on')
        saved_time = task.locator('time').get_attribute('datetime')
        assert saved_time and saved_time.endswith('Z')
        page.reload(wait_until='networkidle')
        expect(page.locator('.card[data-id="task-1"] time')).to_have_attribute('datetime', saved_time)
        page.locator('[data-layout="list"]').click()
        expect(page.locator('tr', has=page.locator('[data-task="task-1"]')).locator('.note-time')).to_contain_text('Update added on')
        page.locator('[data-notes="task-1"]').click()
        expect(page.locator('.activity-history')).to_contain_text('Added an update')
        expect(page.locator('.activity-history')).to_contain_text('New timestamped update')
        page.locator('#cancel').click()
        passed('New task updates retain timestamps across reload, board/list views and history')

        locked_context = browser.new_context()
        locked_context.route('**/config.js', lambda route: route.fulfill(content_type='text/javascript', body='window.FORMA_CONFIG={};'))
        locked_context.add_init_script("sessionStorage.setItem('forma-visitor','Forged admin');localStorage.setItem('azzurro-board-v2','{\"tasks\":[],\"members\":[]}');")
        locked = locked_context.new_page()
        locked.goto(BASE, wait_until='networkidle')
        expect(locked.locator('h1')).to_have_text('Workspace setup required')
        assert locked.locator('.heading,#welcome-form,#login-form').count() == 0
        # Even an explicit preview flag cannot enable local demo privileges on a public host.
        def public_fixture(route):
            name = urlsplit(route.request.url).path.lstrip('/') or 'index.html'
            if name == 'config.js':
                return route.fulfill(content_type='text/javascript', body='window.FORMA_CONFIG={preview:true};')
            return route.fulfill(path=str(Path(__file__).resolve().parents[1] / name))
        locked_context.route('http://public-preview.test/**', public_fixture)
        locked.goto('http://public-preview.test/', wait_until='networkidle')
        expect(locked.locator('h1')).to_have_text('Workspace setup required')
        passed('Missing configuration and public-host preview flags fail closed; cached names grant no access')
        assert errors == [], errors
        passed('No JavaScript errors in new paper-theme workflows')
        (OUT / 'paper-verification.json').write_text(json.dumps({'results': results, 'errors': errors}, indent=2), encoding='utf8')
    finally:
        browser.close()
