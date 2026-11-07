const fs=require('node:fs');
const {fileURLToPath}=require('node:url');

function isTrustedSender(event,webContents,uiPath) {
  if(!webContents || event.sender!==webContents || event.senderFrame!==webContents.mainFrame) return false;
  try {
    const url=new URL(event.senderFrame.url);
    if(url.protocol!=='file:' || url.search) return false;
    // Windows portable launchers may use an 8.3 TEMP path while Chromium reports
    // its long form. Compare the real local file, retaining the window/frame
    // boundary and rejecting every other destination. Electron's fs handles ASAR.
    return fs.realpathSync(fileURLToPath(url))===fs.realpathSync(uiPath);
  } catch { return false; }
}
module.exports={isTrustedSender};
