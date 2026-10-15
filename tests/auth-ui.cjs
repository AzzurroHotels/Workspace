const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_MODULE); }
const fixture = require('./fixtures.cjs');
const auth = require('./auth-fixture.cjs');
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.TEST_OUTPUT || 'test-results');
fs.mkdirSync(output,{recursive:true});
const results = [], errors = [];
function pass(name) { results.push({name,status:'passed'}); console.log('PASS',name); }

(async () => {
  const browser = await playwright.chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
  async function setup({signedIn=true,role='admin'}={}) {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const data = fixture();
    const db = {board_members:data.members,board_tasks:data.tasks.map(({memberId,...task})=>({...task,member_id:memberId||null})),board_activity:[],board_trackers:data.trackers,workspace_access:[{...auth.profile,role},{email:'viewer@example.com',display_name:'Jamie Wilson',role:'viewer'}]};
    const requests=[]; let otpFailure=false;
    await context.addInitScript(({signedIn,session})=>{
      if (!sessionStorage.getItem('test-initialized')) {
        if(signedIn) localStorage.setItem('azzurro-staff-auth',JSON.stringify(session));
        sessionStorage.setItem('forma-visitor','Forged local name');
        sessionStorage.setItem('test-initialized','yes');
      }
    },{signedIn,session:auth.session});
    await context.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FORMA_CONFIG={supabaseUrl:"https://workspace.test",supabasePublishableKey:"test"};'}));
    await context.route('**/*.supabase.co/**',route=>route.abort());
    await context.route('https://workspace.test/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const body=request.postData() ? request.postDataJSON() : null;
      requests.push({method:request.method(),path:url.pathname,body,headers:request.headers()});
      if(url.pathname==='/auth/v1/user') return route.fulfill({json:auth.user});
      if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204});
      if(url.pathname==='/auth/v1/otp') return route.fulfill(otpFailure ? {status:429,json:{msg:'Please wait before requesting another sign-in link.'}} : {json:{}});
      if(url.pathname==='/auth/v1/token') return route.fulfill({json:auth.session});
      const table=url.pathname.split('/').pop();
      assert.ok(db[table], 'Only known API tables may be requested');
      assert.equal(request.headers().authorization,'Bearer '+auth.session.access_token);
      let rows=db[table];
      if(url.searchParams.has('email')) rows=rows.filter(row=>row.email===url.searchParams.get('email').slice(3));
      for(const key of ['id','name','url','role','display_name']) if(url.searchParams.has(key)) rows=rows.filter(row=>String(row[key])===url.searchParams.get(key).slice(3));
      if(request.method()==='GET') return route.fulfill({json:rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+500)});
      if(!['workspace_access','board_trackers'].includes(table)) return route.fulfill({status:403,json:{message:'Test forbids task writes'}});
      if(request.method()==='POST') {
        if(table==='workspace_access' && db[table].some(row=>row.email===body.email)) return route.fulfill({status:409,json:{message:'This email already has access.'}});
        db[table].push(body); rows=[body];
      } else if(request.method()==='PATCH') rows.forEach(row=>Object.assign(row,body));
      else if(request.method()==='DELETE') db[table]=db[table].filter(row=>!rows.includes(row));
      return route.fulfill({json:rows});
    });
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.locator(signedIn ? '.heading' : '#login-form button:not([disabled])').waitFor();
    return {page,context,db,requests,setOtpFailure(value){otpFailure=value;}};
  }
  try {
    const admin=await setup(); const page=admin.page;
    await page.locator('[data-view="users"]').click(); await page.locator('.user-card').first().waitFor();
    assert.equal(await page.locator('.user-card').count(),2);
    await page.screenshot({path:path.join(output,'desktop-users.png'),fullPage:true});
    await page.locator('#add-user').click(); await page.locator('#user-name').fill('New staff'); await page.locator('#user-email').fill(' NEW@example.com '.trim());
    assert.equal(await page.locator('#user-role').inputValue(),'viewer');
    await page.locator('#user-form button[type="submit"]').click();
    await page.getByText('new@example.com',{exact:true}).waitFor();
    assert.equal(admin.db.workspace_access.find(row=>row.email==='new@example.com').role,'viewer');
    await page.locator('[data-edit-user="new@example.com"]').click(); await page.locator('#user-role').selectOption('admin'); await page.locator('#user-form button[type="submit"]').click();
    await page.locator('#editor[open]').waitFor({state:'detached'});
    assert.equal(admin.db.workspace_access.find(row=>row.email==='new@example.com').role,'admin');
    page.once('dialog',dialog=>dialog.accept()); await page.locator('[data-remove-user="new@example.com"]').click();
    await page.getByText('new@example.com',{exact:true}).waitFor({state:'detached'});
    assert.equal(admin.requests.some(req=>req.path==='/auth/v1/otp'),false);
    pass('Admin adds, changes, and removes user access without sending invitation emails');

    await page.locator('[data-edit-user="admin@example.com"]').click();
    assert.equal(await page.locator('#user-role').isDisabled(),true); assert.equal(await page.locator('#user-email').getAttribute('readonly'),'');
    await page.locator('#cancel').click(); assert.equal(await page.locator('[data-remove-user="admin@example.com"]').count(),0);
    pass('Own administrator access is protected in the Users interface');

    for(const width of [1920,1440,1280,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Users overflow at '+width);
      await page.locator('#add-user').click();
      assert.ok(await page.locator('#editor').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'User dialog overflow at '+width);
      await page.locator('#cancel').click();
    }
    await page.setViewportSize({width:1440,height:1000});
    pass('Users page and add-user dialog fit all seven viewport widths');

    await page.locator('[data-view="trackers"]').click();
    await page.locator('#add-tracker').click();await page.locator('#tracker-name').fill('Shared tracker');await page.locator('#tracker-url').fill('https://example.com/shared');
    await page.locator('#tracker-form button[type="submit"]').click();
    await page.getByRole('link',{name:'Open Shared tracker in a new tab',exact:true}).waitFor();
    const row=admin.db.board_trackers.find(row=>row.name==='Shared tracker');assert.ok(row);
    await page.locator('[data-edit-tracker="'+row.id+'"]').click();await page.locator('#tracker-name').fill('Updated shared tracker');await page.locator('#tracker-form button[type="submit"]').click();
    await page.getByRole('link',{name:'Open Updated shared tracker in a new tab',exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());await page.locator('[data-remove-tracker="'+row.id+'"]').click();
    await page.getByRole('link',{name:'Open Updated shared tracker in a new tab',exact:true}).waitFor({state:'detached'});
    assert.equal(admin.db.board_trackers.some(item=>item.id===row.id),false);
    pass('Shared tracker CRUD uses authenticated REST and refreshes the tiles after saving');
    const trackerWrites=admin.requests.filter(req=>req.path.includes('/board_')&&req.method!=='GET').length;
    admin.db.workspace_access[0].role='viewer'; await page.evaluate(()=>refresh(true));
    assert.equal(await page.locator('[data-view="users"]').isVisible(),false);
    assert.equal(await page.locator('#add-task').count(),0);
    await page.locator('[data-view="board"]').click();
    assert.equal(await page.locator('[data-task-status]').count(),0);
    assert.equal(await page.locator('.card[draggable="true"]').count(),0);
    assert.equal(await page.locator('[data-edit-task]').count(),0);
    await page.locator('.card[data-id="task-1"] .latest-note').click();
    assert.match(await page.locator('#editor').innerText(),/Read-only access/);
    assert.equal(await page.locator('#editor input,#editor textarea,#editor select').count(),0);
    await page.locator('#cancel').click();
    await page.locator('[data-notes="task-1"]').click(); await page.locator('#cancel').click();
    await page.locator('[data-view="members"]').click();
    assert.equal(await page.locator('[data-edit-member],[data-remove],#add-member').count(),0);
    await page.locator('[data-view="trackers"]').click();
    assert.equal(await page.locator('.tracker-open[href]').count(),6);
    assert.equal(await page.locator('#add-tracker,[data-edit-tracker],[data-remove-tracker]').count(),0);
    await page.evaluate(()=>trackerEditor()); assert.equal(await page.locator('#editor[open]').count(),0);
    pass('Viewers open tracker links but cannot add, edit or remove trackers');
    await page.locator('[data-view="board"]').click();
    await page.evaluate(()=>updateStatus('task-1','Completed'));
    assert.equal(admin.requests.filter(req=>req.path.includes('/board_')&&req.method!=='GET').length,trackerWrites);
    await page.screenshot({path:path.join(output,'desktop-viewer.png'),fullPage:true});
    pass('Demotion changes the active session to read-only tasks, notes, members, and navigation');

    admin.db.workspace_access=[]; await page.evaluate(()=>refresh(true));
    await page.locator('#login-form').waitFor(); assert.match(await page.locator('#auth-message').innerText(),/does not have workspace access/);
    assert.equal(await page.locator('.card').count(),0); assert.equal(await page.locator('#editor[open]').count(),0);
    pass('Revocation clears cached workspace data and returns to the access screen');

    const denied=await setup({signedIn:false});
    assert.equal(denied.requests.filter(req=>req.path.includes('/rest/')).length,0);
    await denied.page.screenshot({path:path.join(output,'desktop-sign-in.png'),fullPage:true});
    for(const width of [1440,390,320]) {
      await denied.page.setViewportSize({width,height:900});
      assert.ok(await denied.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await denied.page.setViewportSize({width:1440,height:1000});
    await denied.page.locator('#login-email').fill('admin@example.com'); await denied.page.locator('#login-form button').click();
    await denied.page.getByText('Check your inbox.',{exact:false}).waitFor();
    const otp=denied.requests.find(req=>req.path==='/auth/v1/otp');
    assert.equal(otp.body.email,'admin@example.com'); assert.equal(otp.body.code_challenge_method,'s256'); assert.ok(otp.body.code_challenge);
    pass('Signed-out users cannot bypass sign-in with the old name cache; SDK sends a PKCE link request');

    await denied.page.goto(base+'/?code=mock-email-callback'); await denied.page.locator('.heading').waitFor();
    const exchange=denied.requests.find(req=>req.path==='/auth/v1/token');
    assert.equal(exchange.body.auth_code,'mock-email-callback'); assert.ok(exchange.body.code_verifier);
    assert.equal(new URL(denied.page.url()).searchParams.has('code'),false);
    await denied.page.reload(); await denied.page.locator('.heading').waitFor();
    pass('Official SDK handles the email callback, clears its code, and restores a verified session on reload');

    await denied.page.locator('#sign-out').click(); await denied.page.locator('#login-form').waitFor();
    assert.equal(await denied.page.evaluate(()=>localStorage.getItem('azzurro-staff-auth')),null);
    await denied.page.reload(); await denied.page.locator('#login-form button:not([disabled])').waitFor();
    denied.setOtpFailure(true); await denied.page.locator('#login-email').fill('admin@example.com'); await denied.page.locator('#login-form button').click();
    await denied.page.getByText('Please wait before requesting another sign-in link.',{exact:true}).waitFor();
    assert.equal(await denied.page.locator('#login-form button').isEnabled(),true);
    pass('Sign-out clears the session; email delivery errors remain actionable and retryable');
    assert.deepEqual(errors,[]); pass('No browser JavaScript errors in access workflows');
    fs.writeFileSync(path.join(output,'access-verification.json'),JSON.stringify({results,errors},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
