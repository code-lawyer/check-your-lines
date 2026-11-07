// Run with the project's Electron runtime: electron scripts/build-icons.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.whenReady().then(async()=>{
  const target=path.resolve(__dirname,'../assets');
  const svg='data:image/svg+xml;base64,'+fs.readFileSync(path.join(target,'icon.svg')).toString('base64');
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await window.loadURL('data:text/html,<meta charset="utf-8"><title>Icon build</title>');
    const buffers=new Map();
    for(const size of [16,24,32,48,64,128,256,512,1024]) {
      const data=await window.webContents.executeJavaScript(`(async()=>{const img=new Image();img.src=${JSON.stringify(svg)};await img.decode();const c=document.createElement('canvas');c.width=c.height=${size};c.getContext('2d').drawImage(img,0,0,${size},${size});return c.toDataURL('image/png').split(',')[1]})()`);
      buffers.set(size,Buffer.from(data,'base64'));
    }
    fs.writeFileSync(path.join(target,'icon.png'),buffers.get(1024));
    const sizes=[16,24,32,48,64,128,256],header=Buffer.alloc(6+16*sizes.length);
    header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
    sizes.forEach((size,index)=>{const p=6+16*index,b=buffers.get(size);header[p]=header[p+1]=size===256?0:size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(b.length,p+8);header.writeUInt32LE(offset,p+12);offset+=b.length;});
    fs.writeFileSync(path.join(target,'icon.ico'),Buffer.concat([header,...sizes.map(n=>buffers.get(n))]));
    const chunks=[[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']].map(([size,type])=>{const png=buffers.get(size),chunk=Buffer.alloc(8);chunk.write(type);chunk.writeUInt32BE(8+png.length,4);return Buffer.concat([chunk,png]);});
    const icns=Buffer.alloc(8);icns.write('icns');icns.writeUInt32BE(8+chunks.reduce((n,b)=>n+b.length,0),4);
    fs.writeFileSync(path.join(target,'icon.icns'),Buffer.concat([icns,...chunks]));
    console.log('Generated application icons from assets/icon.svg');
  } finally {window.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1)});
