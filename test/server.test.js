const test=require('node:test');const assert=require('node:assert/strict');const{server,cookies}=require('../server');let base;
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});test.after(()=>server.close());
test('serves the Hebrew Telegram app shell',async()=>{const r=await fetch(base);assert.equal(r.status,200);const text=await r.text();assert.match(text,/Telegram/);assert.doesNotMatch(text,/Google Drive/);});
test('reports Bot mode without exposing a token',async()=>{const body=await fetch(base+'/api/config').then(r=>r.json());assert.equal(body.telegram.mode,'bot');assert.equal(Object.hasOwn(body,'token'),false);});
test('library requires a session',async()=>{const r=await fetch(base+'/api/library');assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'not_connected'});});
test('creates an opaque local session',async()=>{const r=await fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);});
test('cookie parser handles encoded values',()=>{assert.deepEqual(cookies({headers:{cookie:'a=1; b=hello%20world'}}),{a:'1',b:'hello world'});});
