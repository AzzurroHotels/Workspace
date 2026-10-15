"""Synthetic local preview only. No production network calls or records."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT=Path(os.environ.get('TEST_OUTPUT','test-results')).resolve();OUT.mkdir(exist_ok=True,parents=True)
BASE=os.environ.get('TEST_URL','http://127.0.0.1:4174')
results=[];errors=[]
def passed(name):
    results.append({'name':name,'status':'passed'}); print('PASS',name,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge')
    try:
        context=browser.new_context(viewport={'width':1440,'height':1050},timezone_id='Asia/Kolkata')
        context.route('**/*.supabase.co/**',lambda r:r.abort())
        page=context.new_page();page.clock.install(time='2026-10-15T00:00:00Z');page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle');expect(page.locator('.heading')).to_be_visible()
        assert page.locator('nav button:visible').all_text_contents()==[' Dashboard',' Recurring tasks',' Operations',' Onsite Maintenance',' Trackers',' Purchase List',' Team members',' Users']
        before=page.evaluate('JSON.stringify(state.tasks)')
        page.locator('[data-view="maintenance"]').click();expect(page.locator('.card')).to_have_count(0)
        page.locator('#add-task').click();page.locator('#title').fill('Replace corridor light');page.locator('#maintenance-property').select_option('Allen');page.locator('#maintenance-location').fill('Room 204');page.locator('#description').fill('Second floor · check the fitting before ordering.')
        page.locator('#latest-note').fill('Inspection requested');page.locator('#task-form button[type=submit]').click()
        expect(page.locator('.card')).to_have_count(1);expect(page.locator('.note-time')).to_contain_text('Update added on')
        expect(page.locator('.card .maintenance-place')).to_contain_text('Allen · Room 204');expect(page.locator('.card .task-created')).to_contain_text('Added Thu, 15 Oct 2026')
        assert page.evaluate('state.tasks.find(t => t.title === "Replace corridor light").created_at')
        page.locator('.card [data-notes]').click();page.locator('#note-text').fill('Replacement bulb collected');page.locator('#notes-form button[type=submit]').click()
        expect(page.locator('.card')).to_contain_text('Replacement bulb collected')
        page.locator('[data-layout="list"]').click();expect(page.locator('.task-table tbody tr')).to_have_count(1)
        page.locator('[data-task-status]').select_option('For Review')
        page.locator('[data-view="board"]').click();page.locator('#scope').select_option('all')
        assert page.get_by_role('button',name='Replace corridor light',exact=True).count()==0
        assert page.evaluate('JSON.stringify(state.tasks.filter(t => t.area !== "maintenance"))')==before
        page.locator('[data-view="maintenance"]').click();page.locator('[data-layout="kanban"]').click()
        page.screenshot(path=str(OUT/'preview-maintenance.png'),full_page=True)
        passed('Maintenance keeps full board controls and history while every original task stays in Operations')

        page.locator('[data-view="recurring"]').click()
        def routine(title,time,frequency='daily',category='Reception'):
            page.locator('#add-recurring').click();page.locator('#routine-title').fill(title);page.locator('#routine-time').fill(time)
            page.locator('#routine-frequency').select_option(frequency)
            page.locator('#routine-start').fill(page.evaluate('Schedule.shift(today(),-14)'))
            if frequency=='weekly':page.locator('#routine-weekday').select_option('1')
            page.locator('#routine-category-input').fill(category);page.locator('#routine-notes').fill('Confirm with the shift lead and record any exceptions.')
            page.locator('#routine-form button[type=submit]').click();expect(page.locator('#editor')).not_to_be_visible()
        routine('Evening handover','18:00');routine('Check arrivals and departures','08:30');routine('Review room status','11:00',category='Housekeeping')
        routine('Weekly supplies count','10:00','weekly','Housekeeping');routine('Prepare team roster','15:00','weekly','Team')
        assert page.locator('.daily .routine-details h3').all_text_contents()==['Check arrivals and departures','Review room status','Evening handover']
        expect(page.locator('.weekly .routine-row')).to_have_count(2)
        first=page.locator('.daily .routine-row').first
        first.locator('[data-complete-routine]').click();expect(page.locator('.daily .routine-row').first).to_have_attribute('data-state','done')
        page.reload(wait_until='networkidle');expect(page.locator('.daily .routine-row').first).to_have_attribute('data-state','done')
        page.locator('#routine-history').click();expect(page.locator('#editor')).to_contain_text('Check arrivals and departures');page.locator('#cancel').click()
        page.locator('.daily .routine-row').first.locator('[data-complete-routine]').click();assert page.evaluate('state.completions.length')==0
        page.locator('#routine-category').select_option('Housekeeping');expect(page.locator('.routine-row')).to_have_count(2)
        page.locator('#routine-category').select_option('');page.locator('#routine-search').fill('supplies');expect(page.locator('.routine-row')).to_have_count(1);page.locator('#routine-search').fill('')
        page.locator('.weekly .routine-row').first.locator('[data-edit-routine]').click();page.locator('input[name=paused]').check();page.locator('#routine-form button[type=submit]').click()
        expect(page.locator('.weekly .routine-row').first).to_have_attribute('data-state','paused');expect(page.locator('.weekly .routine-row').first.locator('[data-complete-routine]')).to_be_disabled()
        page.screenshot(path=str(OUT/'preview-recurring.png'),full_page=True)
        passed('Daily and weekly schedules sort by time, persist completion, support undo, categories, search, pause and history')
        # Frozen clock verifies the timer updates without rerendering focused inputs or discarding drafts.
        page.clock.set_system_time('2026-10-15T00:00:00Z')
        page.evaluate("state.recurring.push({id:'clock-check',title:'Clock check',frequency:'daily',weekday:null,time:'11:01',start_date:'2026-01-01',category:'',notes:'',paused:false});recurring()")
        expect(page.locator('[data-routine-row="clock-check"]')).to_have_attribute('data-state','soon')
        page.locator('#add-recurring').click();page.locator('#routine-title').fill('Keep this draft')
        page.clock.fast_forward(61000)
        expect(page.locator('[data-routine-row="clock-check"]')).to_have_attribute('data-state','now');expect(page.locator('#routine-title')).to_have_value('Keep this draft')
        page.locator('#cancel').click();page.reload(wait_until='networkidle')
        page.locator('[data-view="board"]').click();expect(page.locator('#routine-nav-count')).to_be_visible()
        passed('Reminder colors change on time even with an editor open, preserving the unsaved draft')

        page.locator('[data-view="purchases"]').click()
        def purchase(title,quantity,category,priority='Normal'):
            page.locator('#add-purchase').click();page.locator('#purchase-title').fill(title);page.locator('#purchase-quantity').fill(quantity);page.locator('#purchase-category').fill(category)
            page.locator('#purchase-priority').select_option(priority);page.locator('#purchase-notes').fill('Confirm specification with the onsite team before purchase.');page.locator('#purchase-form button[type=submit]').click()
        purchase('Bath towels','3 packs','Olympic · Housekeeping');purchase('Corridor light bulbs','12 bulbs','Maintenance','High');purchase('Reception stationery','2 boxes','Reception')
        assert page.locator('.purchase-details h2').all_text_contents()[0]=='Corridor light bulbs'
        page.locator('.purchase-row').first.locator('[data-purchase-toggle]').click();expect(page.locator('.purchase-row')).to_have_count(2)
        page.locator('[data-purchase-scope="purchased"]').click();expect(page.locator('.purchase-row')).to_have_count(1);expect(page.locator('.purchase-row small')).to_contain_text('Purchased')
        page.reload(wait_until='networkidle');page.locator('[data-purchase-scope="purchased"]').click();expect(page.locator('.purchase-row')).to_have_count(1)
        page.locator('[data-edit-purchase]').click();page.locator('#purchase-quantity').fill('24 bulbs');page.locator('#purchase-form button[type=submit]').click();expect(page.locator('.purchase-row')).to_contain_text('24 bulbs')
        page.locator('[data-purchase-toggle]').click();expect(page.locator('.purchase-row')).to_have_count(0)
        page.locator('[data-purchase-scope="planned"]').click();expect(page.locator('.purchase-row')).to_have_count(3)
        page.locator('.purchase-row').first.locator('[data-purchase-toggle]').click();page.locator('[data-purchase-scope="all"]').click()
        page.screenshot(path=str(OUT/'preview-purchases.png'),full_page=True)
        passed('Purchase list supports quantities, priority sorting, editing, purchased timestamps, undo and reload persistence')

        for width in [1920,1440,1280,1024,768,390,320]:
            page.set_viewport_size({'width':width,'height':1050})
            for view in ['recurring','maintenance','purchases']:
                page.locator('[data-view="'+view+'"]').click()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{view} overflow {width}'
            for view,button,form in [('recurring','#add-recurring','#routine-form'),('maintenance','#add-task','#task-form'),('purchases','#add-purchase','#purchase-form')]:
                page.locator('[data-view="'+view+'"]').click();page.locator(button).click()
                assert page.locator('#editor').evaluate('(el)=>el.scrollWidth <= el.clientWidth+1'), f'{form} overflow {width}'
                if view=='maintenance':
                    assert page.locator('#maintenance-property').is_visible() and page.locator('#maintenance-location').is_visible()
                page.locator('#cancel').click()
        passed('New tabs and editors fit seven desktop, tablet and phone widths without horizontal page overflow')
        page.set_viewport_size({'width':1440,'height':1050});page.locator('[data-view="recurring"]').click();page.locator('#sidebar-toggle').click()
        assert page.locator('main').bounding_box()['x']==0;page.locator('#sidebar-toggle').click()
        page.locator('.daily .routine-row').first.locator('[data-edit-routine]').click();page.once('dialog',lambda d:d.accept());page.locator('#remove-routine').click();expect(page.locator('.daily .routine-row')).to_have_count(2)
        page.locator('[data-view="purchases"]').click();page.locator('[data-purchase-scope="all"]').click();count=page.locator('.purchase-row').count();page.locator('[data-edit-purchase]').first.click();page.once('dialog',lambda d:d.accept());page.locator('#remove-purchase').click();expect(page.locator('.purchase-row')).to_have_count(count-1)
        assert not errors,errors
        passed('Sidebar, deletion confirmations and keyboard-accessible controls work with no browser errors')
        (OUT/'workflow-verification.json').write_text(json.dumps({'results':results,'errors':errors,'environment':'Local fictional preview; no production writes'},indent=2))
    finally:browser.close()
