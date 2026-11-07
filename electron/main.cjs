const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { isTrustedSender } = require('./sender-validation.cjs');
const brandRules = import('../shared/brands.mjs');
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let window;
let inFlight;
let diagnosis;
const uiPath = path.join(__dirname, '..', 'dist', 'index.html');
function validSender(event) {
  return isTrustedSender(event, window?.webContents, uiPath);
}
async function scan() {
  if(diagnosis) await diagnosis;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (process.platform === 'win32') {
      let profile = null;
      try { profile = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'computer-capabilities.json'), 'utf8')); } catch {}
      const result=await require('./collectors/windows.cjs').scanWindows(profile);
      try { await fs.access(path.join(app.getPath('userData'),'compatibility-pending.json')); result.diagnostics.needsRestore=true; } catch {}
      return result;
    }
    if (process.platform === 'darwin') return require('./collectors/macos.cjs').scanMac();
    return { platform: process.platform, cables: [], capabilities: { singleEnded: 'unavailable', emarker: 'unavailable', message: '第一版支持 Windows 和 macOS。' }, scannedAt: new Date().toISOString() };
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
if(primaryInstance) app.whenReady().then(() => {
  const catalog = require('./catalog-store.cjs').createCatalogStore(app.getPath('userData'));
  window = new BrowserWindow({ width: 1420, height: 920, minWidth: 920, minHeight: 650, show: process.env.CABLEWISE_TEST_HIDE !== '1', backgroundColor: '#F5F7FB', title: '线知 · Cablewise', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  window.on('close', event=>{
    if(diagnosis) {event.preventDefault();diagnosis.finally(()=>window?.close()).catch(()=>{});}
  });
  ipcMain.handle('scan', async event => { if (!validSender(event)) throw new Error('Unknown sender'); return scan(); });
  function diagnose(event, restore) {
    if(!validSender(event) || process.platform!=='win32') throw new Error('Unsupported compatibility request');
    if(diagnosis) return diagnosis;
    const previousScan=inFlight;
    diagnosis=(async()=>{if(previousScan) await previousScan.catch(()=>{});return require('./compatibility-check.cjs').checkComputer(app.getPath('userData'),{restore});})();
    const result=diagnosis;
    result.finally(()=>{if(diagnosis===result) diagnosis=null;}).catch(()=>{});
    return result;
  }
  ipcMain.handle('check-computer', event=>diagnose(event,false));
  ipcMain.handle('restore-computer', event=>diagnose(event,true));
  ipcMain.handle('catalog-load', async event => { if (!validSender(event)) throw new Error('Unknown sender'); return catalog.load(); });
  ipcMain.handle('catalog-save', async (event, records) => { if (!validSender(event)) throw new Error('Unknown sender'); return catalog.save(records); });
  ipcMain.handle('catalog-recovery-info', async event => { if (!validSender(event)) throw new Error('Unknown sender'); return catalog.recoveryInfo(); });
  ipcMain.handle('catalog-recover', async (event, request) => { if (!validSender(event)) throw new Error('Unknown sender'); return catalog.recover(request); });
  ipcMain.handle('open-source', async (event, url) => { const { brands } = await brandRules; const { usageSources } = await import('../shared/recommendations.mjs'); if (validSender(event) && (brands.some(b => b.source === url) || usageSources.some(s => s.url === url))) await shell.openExternal(url); });
  ipcMain.handle('export', async (event, payload, format = 'json') => {
    if (!validSender(event) || typeof payload !== 'string' || Buffer.byteLength(payload) > 100 * 1024 * 1024 || !['json','csv','html'].includes(format)) throw new Error('Invalid report');
    const result = await dialog.showSaveDialog(window, { title: '导出线材清单', defaultPath: `Cablewise-catalog.${format}`, filters: [{ name: { json: '完整备份（含照片）', csv: 'CSV 表格', html: '图文清单' }[format], extensions: [format] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, payload, 'utf8');return true;
  });
  window.loadFile(uiPath);
  app.on('activate', () => { if(window && !window.isDestroyed()) window.show(); });
});
app.on('second-instance', () => { if(window && !window.isDestroyed()) {if(window.isMinimized()) window.restore();window.show();window.focus();} });
app.on('window-all-closed', () => app.quit());
