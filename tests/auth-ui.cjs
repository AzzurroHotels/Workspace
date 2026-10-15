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
    const db = {board_members:data.members,board_tasks:data.tasks.map(({memberId,...task})=>({...task,member_id:memberId||null})),board_activity:[],board_recurring:[],board_completions:[],board_purchases:[],board_trackers:data.trackers,workspace_access:[{...auth.profile,role},{email:'viewer@example.com',username:'jamie',display_name:'Jamie Wilson',role:'viewer'}]};
    const requests=[]; let passwordFailure=false;
    await context.addInitScript(({signedIn,session})=>{
      if (!sessionStorage.getItem('test-initialized')) {
        if(signedIn) localStorage.setItem('azzurro-staff-auth',JSON.stringify(session));
        sessionStorage.setItem('forma-visitor','Forged local name');
        sessionStorage.setItem('test-initialized','yes');
      }
    },{signedIn,session:auth.session});
    await context.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FORMA_CONFIG={supabaseUrl:"https://workspace.test",supabasePublishableKey:"test",userCreationEnabled:true};'}));
    await context.route('**/*.supabase.co/**',route=>route.abort());
    await context.route('https://workspace.test/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const body=request.postData() ? request.postDataJSON() : null;
      requests.push({method:request.method(),path:url.pathname,grantType:url.searchParams.get('grant_type'),body,headers:request.headers()});
      if(url.pathname==='/auth/v1/user') return route.fulfill({json:auth.user});
      if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204});
      if(url.pathname==='/functions/v1/workspace-sign-in') return route.fulfill(passwordFailure ? {status:401,json:{error:'Name or password is incorrect.'}} : {json:{session:auth.session}});
      if(url.pathname==='/auth/v1/token') return route.fulfill(url.searchParams.get('grant_type')==='password'&&passwordFailure ? {status:400,json:{msg:'Invalid login credentials'}} : {json:auth.session});
      if(url.pathname==='/functions/v1/create-workspace-user') {
        assert.equal(request.headers().authorization,'Bearer '+auth.session.access_token);
        const username=body.display_name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^[._-]+|[._-]+$/g,'').slice(0,32).replace(/[._-]+$/g,'');
        const email=username+'@workspace.invalid';
        if(db.workspace_access.some(row=>row.email===email||row.username===username)) return route.fulfill({status:409,json:{error:'That name already has access.'}});
        const row={email,username,display_name:body.display_name,role:body.role}; db.workspace_access.push(row);
        return route.fulfill({status:201,json:{user:row}});
      }
      if(url.pathname==='/functions/v1/update-workspace-user') {
        assert.equal(request.headers().authorization,'Bearer '+auth.session.access_token);
        const row=db.workspace_access.find(item=>item.email===body.email); assert.ok(row);
        row.display_name=body.display_name; row.username=body.display_name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^[._-]+|[._-]+$/g,'').slice(0,32).replace(/[._-]+$/g,'');
        return route.fulfill({json:{user:{username:row.username,display_name:row.display_name,role:row.role}}});
      }
      const table=url.pathname.split('/').pop();
      assert.ok(db[table], 'Only known API tables may be requested');
      assert.equal(request.headers().authorization,'Bearer '+auth.session.access_token);
      let rows=db[table];
      if(url.searchParams.has('email')) rows=rows.filter(row=>row.email===url.searchParams.get('email').slice(3));
      for(const key of ['id','name','url','role','display_name','username']) if(url.searchParams.has(key)) rows=rows.filter(row=>String(row[key])===url.searchParams.get(key).slice(3));
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
    return {page,context,db,requests,setPasswordFailure(value){passwordFailure=value;}};
  }
  try {
    const admin=await setup(); const page=admin.page;
    await page.locator('[data-view="users"]').click(); await page.locator('.user-card').first().waitFor();
    assert.equal(await page.locator('.user-card').count(),2);
    await page.screenshot({path:path.join(output,'desktop-users.png'),fullPage:true});
    await page.locator('#add-viewer-user').click(); await page.locator('#user-name').fill('New staff'); await page.locator('#user-password').fill('Local Test Password 42!');
    assert.equal(await page.locator('#user-form input').count(),2);
    await page.locator('#user-form button[type="submit"]').click();
    const newUserEmail='new-staff@workspace.invalid';
    await page.getByRole('heading',{name:'New staff',exact:true}).waitFor();
    assert.equal(admin.db.workspace_access.find(row=>row.email===newUserEmail).role,'viewer');
    const provision=admin.requests.find(req=>req.path==='/functions/v1/create-workspace-user');
    assert.deepEqual(Object.keys(provision.body).sort(),['display_name','password','role']); assert.equal(provision.body.display_name,'New staff'); assert.equal(provision.body.role,'viewer'); assert.ok(provision.body.password); assert.equal(Object.hasOwn(admin.db.workspace_access.find(row=>row.email===newUserEmail),'password'),false);
    await page.locator('[data-edit-user="admin@example.com"]').click();
    assert.deepEqual(await page.locator('#user-form label').allTextContents(),['Name','Password']);
    await page.locator('#cancel').click();
    assert.doesNotMatch(await page.locator('.user-card').filter({has:page.getByRole('heading',{name:'New staff'})}).innerText(),/workspace\.invalid|new-staff/);
    await page.locator(`[data-edit-user="${newUserEmail}"]`).click(); await page.locator('#user-name').fill('New staff member'); await page.locator('#user-password').fill('Changed Test Password 43!'); await page.locator('#user-form button[type="submit"]').click();
    assert.ok(admin.requests.some(req=>req.path==='/functions/v1/update-workspace-user'&&req.body.password==='Changed Test Password 43!'));
    const renamedEmail=newUserEmail;
    await page.locator(`[data-change-role="${renamedEmail}"]`).click();
    await page.locator('#editor[open]').waitFor({state:'detached'});
    assert.equal(admin.db.workspace_access.find(row=>row.email===renamedEmail).role,'admin');
    page.once('dialog',dialog=>dialog.accept()); await page.locator(`[data-remove-user="${renamedEmail}"]`).click();
    await page.getByRole('heading',{name:'New staff member',exact:true}).waitFor({state:'detached'});
    pass('Admin creates and updates name/password accounts; role stays separate and passwords never enter workspace data');

    await page.locator('[data-edit-user="admin@example.com"]').click();
    assert.equal(await page.locator('#user-form input').count(),2);
    await page.locator('#cancel').click(); assert.equal(await page.locator('[data-remove-user="admin@example.com"]').count(),0); assert.equal(await page.locator('[data-change-role="admin@example.com"]').count(),0);
    pass('Own administrator access is protected in the Users interface');

    for(const width of [1920,1440,1280,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Users overflow at '+width);
      await page.locator('#add-admin-user').click();
      assert.ok(await page.locator('#editor').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'User dialog overflow at '+width);
      await page.locator('#cancel').click();
    }
    await page.setViewportSize({width:1440,height:1000});
    pass('Users page and two-field account dialog fit all seven viewport widths');

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
    denied.setPasswordFailure(true);
    await denied.page.locator('#login-username').fill('not-added'); await denied.page.locator('#login-password').fill('Local Test Password 42!');
    await denied.page.locator('#login-form button[type="submit"]').click();
    await denied.page.getByText('Name or password is incorrect.',{exact:true}).waitFor();
    assert.equal(denied.requests.filter(req=>req.path.includes('/rest/')).length,0);
    denied.setPasswordFailure(false);
    await denied.page.locator('#login-username').fill('VIVEK'); await denied.page.locator('#login-password').fill('Local Test Password 42!');
    await denied.page.locator('#login-form button[type="submit"]').click();
    await denied.page.locator('.heading').waitFor();
    const signInRequest=denied.requests.find(req=>req.path==='/functions/v1/workspace-sign-in'&&req.body?.username==='vivek');
    assert.equal(signInRequest.body.username,'vivek'); assert.ok(signInRequest.body.password);
    assert.equal(await denied.page.locator('#auth-mode-toggle').count(),0);
    await denied.page.reload(); await denied.page.locator('.heading').waitFor();
    pass('Only administrator-provisioned username/password accounts can sign in; the session restores after reload');

    await denied.page.locator('#sign-out').click(); await denied.page.locator('#login-form').waitFor();
    assert.equal(await denied.page.evaluate(()=>localStorage.getItem('azzurro-staff-auth')),null);
    await denied.page.reload(); await denied.page.locator('#login-form button:not([disabled])').waitFor();
    denied.setPasswordFailure(true); await denied.page.locator('#login-username').fill('vivek'); await denied.page.locator('#login-password').fill('Wrong Local Password 42!'); await denied.page.locator('#login-form button').click();
    await denied.page.getByText('Name or password is incorrect.',{exact:true}).waitFor();
    assert.equal(await denied.page.locator('#login-form button').isEnabled(),true);
    pass('Sign-out clears the session; invalid-credential errors remain actionable and retryable');
    assert.deepEqual(errors,[]); pass('No browser JavaScript errors in access workflows');
    fs.writeFileSync(path.join(output,'access-verification.json'),JSON.stringify({results,errors},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
