const { _electron: electron } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  const root=path.resolve(__dirname,'..'), shotDir=path.join(root,'test-results','desktop');
  await fs.mkdir(shotDir,{recursive:true});
  const profile=await fs.mkdtemp(path.join(shotDir,'profile-'));
  const env={...process.env,CABLEWISE_TEST_HIDE:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.CABLEWISE_TEST_EXE;
  const launch=()=>electron.launch({...(exe?{executablePath:exe}:{}),args:[...(exe?[]:[root]),'--user-data-dir='+profile],env,timeout:30000});
  let app=await launch();const errors=[];let connectionCount=0;
  try {
    let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));
    await page.getByRole('heading',{name:'看看这些线，能做什么。'}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.quiet-status')?.textContent.includes('自动刷新'),null,{timeout:45000});
    assert.equal(await page.locator('.demo-banner').count(),0);
    const live=await page.evaluate(()=>window.cablewise.scan());connectionCount=live.cables.length;assert(live.cables.every(c=>!c.demo));
    if(live.platform==='Windows') {
      assert(live.cables.every(c=>c.connectionScope==='external'));
      if(process.env.CABLEWISE_EXPECT_EXTERNAL_COUNT) assert.equal(connectionCount,Number(process.env.CABLEWISE_EXPECT_EXTERNAL_COUNT));
      assert.equal(await page.locator('.cable-card').count(),connectionCount);
      if(connectionCount) {
        assert.match(await page.locator('.device-illustration').first().innerText(),/已识别外接连接/);
        assert.match(await page.locator('.primary-use').innerText(),/普通文件传输/);
      }
      await page.getByText('查看扫描范围与识别说明',{exact:true}).click();
      if(live.diagnostics.internalDevices.length) assert.match(await page.locator('.scan-details').innerText(),new RegExp(`已排除 ${live.diagnostics.internalDevices.length} 个内置设备`));
      await page.screenshot({path:path.join(shotDir,'real-connections.png'),fullPage:true});
    }
    await page.getByRole('button',{name:'查看演示',exact:true}).click();
    await page.getByRole('checkbox',{name:'对比桌面主力线'}).check();
    await page.getByRole('checkbox',{name:'对比随身充电线'}).check();
    await page.getByRole('button',{name:'并排对比'}).click();assert.match(await page.getByRole('dialog').innerText(),/240 W/);
    await page.getByRole('button',{name:'关闭对比'}).click();
    await page.getByRole('button',{name:'查看随身充电线',exact:true}).click();
    await page.getByRole('button',{name:'加入我的线材',exact:true}).click();
    await page.getByLabel('自定义名称',{exact:true}).fill('随身充电线（示例）');
    await page.getByLabel('存放位置',{exact:true}).fill('出行包');
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#f0f3f8';ctx.fillRect(0,0,640,420);ctx.strokeStyle='#4967e8';ctx.lineWidth=20;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(160,120);ctx.bezierCurveTo(510,80,480,390,220,320);ctx.bezierCurveTo(70,300,130,170,300,205);ctx.stroke();
      ctx.fillStyle='#223b66';ctx.fillRect(110,99,65,42);ctx.fillRect(285,184,65,42);ctx.fillStyle='#8998af';ctx.fillRect(93,107,23,26);ctx.fillRect(345,192,23,26);ctx.font='16px sans-serif';ctx.fillText('PHOTO TEST / DEMO',24,390);return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('上传线材照片').setInputFiles({name:'cable-test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByRole('img',{name:'线材照片预览'}).waitFor();
    await page.getByRole('button',{name:'保存线材',exact:true}).click();
    await page.getByRole('heading',{name:'我的线材清单',exact:true}).waitFor();
    assert.match(await page.locator('.cable-card').first().innerText(),/演示记录/);
    assert.match(await page.locator('.primary-use').innerText(),/主力手机充电/);
    assert.equal(await page.locator('.cable-photo').count(),1);console.log('PASS photo and demo archive');
    await page.getByRole('button',{name:'添加线材',exact:true}).click();
    await page.getByLabel('自定义名称',{exact:true}).fill('鼠标充电短线（测试）');
    await page.getByLabel('存放位置',{exact:true}).fill('键盘旁');
    await page.getByLabel('两端接口',{exact:true}).selectOption('USB-A ↔ USB-C');
    await page.getByLabel('标称充电功率（W）',{exact:true}).fill('5');
    await page.getByLabel('额定电流（A）',{exact:true}).fill('1');
    await page.getByLabel('额定电压（V）',{exact:true}).fill('5');
    await page.getByLabel('数据能力',{exact:true}).selectOption('power-only');
    await page.getByLabel('补充规格的依据',{exact:true}).fill('测试夹具规格（非真实线材）');
    await page.getByRole('button',{name:'保存线材',exact:true}).click();
    await page.getByRole('heading',{name:'鼠标充电短线（测试）',exact:true}).first().waitFor();
    assert.match(await page.locator('.primary-use').innerText(),/鼠标 \/ 键盘充电/);
    let catalog=await page.evaluate(()=>window.cablewise.loadCatalog());assert.equal(catalog.records.length,2);assert.equal(catalog.records[1].demo,false);
    await page.getByRole('button',{name:'编辑线材档案'}).click();
    await page.getByLabel('自定义名称',{exact:true}).fill('键鼠充电短线（测试）');
    await page.getByLabel('备注',{exact:true}).fill('仅充电，不能当作有线输入连接。');
    await page.getByRole('button',{name:'保存线材',exact:true}).click();
    await page.getByRole('heading',{name:'键鼠充电短线（测试）',exact:true}).first().waitFor();
    await page.getByRole('button',{name:'查看随身充电线（示例）',exact:true}).click();
    await page.screenshot({path:path.join(shotDir,'catalog.png'),fullPage:true});
    for(const format of ['html','csv','json']) {
      const target=path.join(shotDir,`catalog.${format}`);
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},target);
      await page.getByLabel('导出格式').selectOption(format);await page.getByRole('button',{name:'导出',exact:true}).click();
      let text;for(let i=0;i<50;i++){try{text=await fs.readFile(target,'utf8');if(text)break;}catch{}await new Promise(r=>setTimeout(r,50));}
      assert(text?.includes('随身充电线'));if(format==='html')assert(text.includes('data:image/jpeg;base64,'));if(format==='csv')assert(text.includes('CSV 不含照片'));
      if(format==='json'){const data=JSON.parse(text);assert(data.records[0].photoDataUrl);assert.equal(data.records[1].demo,false);}
    }
    await page.getByLabel('导入线材备份').setInputFiles(path.join(shotDir,'catalog.json'));
    await page.getByRole('status').filter({hasText:'跳过 2 条重复记录'}).waitFor();
    await page.getByRole('button',{name:'用途标准',exact:true}).click();assert.equal(await page.locator('.rules-table tbody tr').count(),7);
    await page.screenshot({path:path.join(shotDir,'usage-rules.png'),fullPage:true});
    await page.getByRole('button',{name:/^我的线材/}).click();
    await page.getByLabel('搜索线材').fill('出行包');assert.equal(await page.locator('.cable-card').count(),1);
    await page.getByRole('button',{name:'清空搜索'}).click();
    await page.setViewportSize({width:720,height:1000});await page.screenshot({path:path.join(shotDir,'catalog-narrow.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    await app.close();app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('button',{name:/^我的线材/}).click();
    await page.getByRole('heading',{name:'随身充电线（示例）',exact:true}).first().waitFor();
    assert.equal(await page.locator('.cable-card').count(),2);assert.equal(await page.locator('.cable-photo').count(),1);assert.match(await page.locator('.cable-card').nth(1).innerText(),/键鼠充电短线/);
    await page.getByRole('button',{name:'编辑线材档案'}).click();await page.getByRole('button',{name:'移除照片',exact:true}).click();await page.getByRole('button',{name:'保存线材',exact:true}).click();
    await page.getByRole('status').filter({hasText:'演示线材已保存'}).waitFor();catalog=await page.evaluate(()=>window.cablewise.loadCatalog());assert.equal(catalog.records[0].photoDataUrl,undefined);
    await page.getByRole('button',{name:'移除此记录',exact:true}).click();await page.getByRole('status').filter({hasText:'记录已移除'}).waitFor();
    await page.getByLabel('导入线材备份').setInputFiles(path.join(shotDir,'catalog.json'));await page.getByRole('status').filter({hasText:'已导入 1 条，跳过 1 条重复记录'}).waitFor();
    assert.equal(await page.locator('.cable-photo').count(),1);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'PASS',runtime:exe?'packaged':'development',nativeConnections:connectionCount,tests:['real scanner','comparison','photo upload','custom name','manual specs','demo provenance','recommendations','HTML/CSV/JSON','duplicate import','rules','search','narrow layout','restart persistence','photo removal','photo restore','renderer errors'],screenshots:shotDir}));
  } catch(error) { try {const p=await app.firstWindow();await p.screenshot({path:path.join(shotDir,'failure.png'),fullPage:true});console.error((await p.getByRole('dialog').allTextContents()).join(' '));} catch {} throw error; } finally {await app.close();}
})().catch(error=>{console.error(error);process.exit(1);});
