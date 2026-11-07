const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
  const target=path.join(root,'release',`Cablewise-${version}-win-x64.exe`);
  const dir=path.join(root,'test-results/portable');await fs.mkdir(dir,{recursive:true});
  const profile=await fs.mkdtemp(path.join(dir,'profile-'));
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;await new Promise(r=>server.close(r));
  const env={...process.env,CABLEWISE_TEST_HIDE:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(target,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:'ignore'});
  let ended=false,error=null,browser,cdp;
  const closed=new Promise(resolve=>{child.on('exit',(code,signal)=>{ended=true;resolve({code,signal});});child.on('error',e=>{error=e;ended=true;resolve({error:e.message});});});
  try {
    for(let i=0;i<120;i++) {
      if(error) throw error;if(ended) throw new Error('Portable launcher exited before application startup');
      try {const r=await fetch(`http://127.0.0.1:${port}/json/version`);if(r.ok) break;} catch {}
      await delay(500);
    }
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page=browser.contexts()[0].pages()[0];assert(page,'Portable application has no window');
    await page.getByRole('heading',{name:'看看这些线，能做什么。'}).waitFor();
    assert.match(await page.locator('.sidebar-bottom').innerText(),new RegExp(version.replaceAll('.','\\.')));
    const result=await page.evaluate(()=>window.cablewise.scan());
    assert.equal(result.platform,'Windows');assert(result.cables.every(c=>c.connectionScope==='external'));
    if(process.env.CABLEWISE_EXPECT_EXTERNAL_COUNT) assert.equal(result.cables.length,Number(process.env.CABLEWISE_EXPECT_EXTERNAL_COUNT));
    assert.equal(await page.locator('.demo-banner').count(),0);
    await page.screenshot({path:path.join(dir,'startup.png'),fullPage:true});
    console.log(JSON.stringify({status:'PASS',runtime:'portable-launcher',version,connections:result.cables.length,isolatedProfile:profile}));
  } finally {
    if(browser) {cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{});await browser.close().catch(()=>{});}
    const exit=await Promise.race([closed,delay(15000).then(()=>null)]);
    if(!exit) {child.kill();throw new Error('Portable wrapper did not exit after closing the application');}
    if(exit.error || exit.code!==0) throw new Error('Portable wrapper exit failed: '+JSON.stringify(exit));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
