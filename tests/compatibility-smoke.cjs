const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-results','compatibility');
  await fs.mkdir(dir,{recursive:true});const profile=await fs.mkdtemp(path.join(dir,'profile-'));
  const env={...process.env,CABLEWISE_TEST_HIDE:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.CABLEWISE_TEST_EXE;
  const app=await electron.launch({...(exe?{executablePath:exe}:{}),args:[...(exe?[]:[root]),'--user-data-dir='+profile],env});
  try {
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.compatibility-action button')?.disabled);
    await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).click();
    await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/恢复原设置/);
    await page.getByRole('button',{name:'暂不检查',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
    if(process.env.CABLEWISE_TEST_UCSI==='1') {
      // Opt-in only. Requires separate human authorization because this triggers UAC
      // and a temporary controller restart. Ordinary tests never run this branch.
      await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).click();
      await page.getByRole('button',{name:'开始检查',exact:true}).click();
      await page.getByText('已确认恢复原有系统设置',{exact:true}).waitFor({timeout:125000});
      const result=JSON.parse(await fs.readFile(path.join(profile,'computer-capabilities.json'),'utf8'));
      assert(result.state);assert(result.checkedAt);
      await assert.rejects(fs.access(path.join(profile,'compatibility-pending.json')));
      await page.screenshot({path:path.join(dir,'result.png'),fullPage:true});
      await page.getByRole('button',{name:'关闭兼容性检查',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.quiet-status')?.textContent.includes('自动刷新'));
      if(result.state==='firmware-limited') {
        assert.match(await page.locator('.detection-note').innerText(),/未开放线材额定规格读取/);
        assert.match(await page.locator('.power-hero').innerText(),/此电脑无法读取额定功率/);
      }
      await page.screenshot({path:path.join(dir,'live-after-check.png'),fullPage:true});
      console.log(JSON.stringify({runtime:exe?'packaged':'development',state:result.state,restored:true,profile}));
    } else {
      // UI-only fixtures. These do not enable a test interface or establish real
      // hardware support; real elevated acceptance is the explicit branch above.
      const fixture={...require('../shared/ucsi.cjs').decodeUcsiCableProperty([23,0,100,17,0]),id:'ucsi-fixture',name:'USB-C 端口 1 线材',portLabel:'USB-C 端口 1',note:'测试夹具，不是真实扫描'};
      await app.evaluate(({ipcMain},record)=>{ipcMain.removeHandler('check-computer');ipcMain.handle('check-computer',()=>({restored:true,profile:{state:'data-available',reason:'测试夹具返回值'},records:[record]}));},fixture);
      await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).click();
      await page.getByRole('button',{name:'开始检查',exact:true}).click();
      await page.getByText('已确认恢复原有系统设置',{exact:true}).waitFor();
      assert.match(await page.locator('.diagnostic-cables').innerText(),/5 A/);assert.match(await page.locator('.diagnostic-cables').innerText(),/功率未读取/);
      await page.getByRole('button',{name:'记录这根线',exact:true}).click();
      await page.getByLabel('自定义名称',{exact:true}).fill('诊断流程测试夹具');
      await page.getByRole('button',{name:'保存线材',exact:true}).click();
      await page.getByRole('heading',{name:'我的线材清单',exact:true}).waitFor();
      const saved=(await page.evaluate(()=>window.cablewise.loadCatalog())).records;
      assert.equal(saved[0].evidence,'controller');assert.equal(saved[0].ratingCurrentA,5);assert.equal(saved[0].maxPowerW,null);
      await page.getByRole('button',{name:/^当前连接/}).click();
      await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('check-computer');ipcMain.handle('check-computer',()=>({cancelled:true,restored:true}));});
      await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).click();await page.getByRole('button',{name:'开始检查',exact:true}).click();
      await page.getByText('已取消检查',{exact:true}).waitFor();
      await page.getByRole('button',{name:'关闭兼容性检查',exact:true}).click();
      await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('check-computer');ipcMain.handle('check-computer',()=>({restored:false,error:'测试夹具：需恢复'}));ipcMain.removeHandler('restore-computer');ipcMain.handle('restore-computer',()=>({restored:true,restorationOnly:true}));});
      await page.getByRole('button',{name:'检查电脑兼容性',exact:true}).click();await page.getByRole('button',{name:'开始检查',exact:true}).click();
      await page.getByRole('button',{name:'恢复设置',exact:true}).click();await page.getByText('系统设置已恢复',{exact:true}).waitFor();
      console.log('PASS compatibility dialog, controller record persistence, cancellation and recovery UI (mocked IPC; no system setting changes)');
    }
    assert.deepEqual(errors,[]);
  } finally {await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
