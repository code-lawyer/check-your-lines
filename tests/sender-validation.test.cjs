const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {isTrustedSender}=require('../electron/sender-validation.cjs');

function fixture() {
  const base=path.resolve(__dirname,'../test-results/sender-validation');
  fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'profile-'));
  const actual=path.join(root,'actual'),alias=path.join(root,'alias');
  fs.mkdirSync(actual);fs.writeFileSync(path.join(actual,'index.html'),'test UI');
  fs.writeFileSync(path.join(actual,'other.html'),'untrusted page');
  fs.symlinkSync(actual,alias,process.platform==='win32'?'junction':'dir');
  const mainFrame={url:pathToFileURL(path.join(actual,'index.html')).href};
  const webContents={mainFrame};
  return {actual,alias,mainFrame,webContents,event:{sender:webContents,senderFrame:mainFrame}};
}

test('trusted main-frame IPC accepts canonical aliases of the same local UI file',()=>{
  const f=fixture();
  assert.equal(isTrustedSender(f.event,f.webContents,path.join(f.alias,'index.html')),true);
  f.mainFrame.url=pathToFileURL(path.join(f.alias,'index.html')).href+'#catalog';
  assert.equal(isTrustedSender(f.event,f.webContents,path.join(f.actual,'index.html')),true);
});

test('IPC still rejects other windows, child frames and non-UI destinations',()=>{
  const f=fixture(),ui=path.join(f.actual,'index.html');
  assert.equal(isTrustedSender(f.event,f.webContents,ui),true);
  assert.equal(isTrustedSender({...f.event,sender:{}},f.webContents,ui),false);
  assert.equal(isTrustedSender({...f.event,senderFrame:{url:f.mainFrame.url}},f.webContents,ui),false);
  for(const url of ['https://example.com',pathToFileURL(path.join(f.actual,'other.html')).href,pathToFileURL(ui).href+'?other=1',pathToFileURL(path.join(f.actual,'missing.html')).href]) {
    f.mainFrame.url=url;assert.equal(isTrustedSender(f.event,f.webContents,ui),false);
  }
  assert.equal(isTrustedSender({sender:null,senderFrame:null},undefined,ui),false);
});
