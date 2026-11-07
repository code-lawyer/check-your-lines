const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createCatalogStore(directory) {
  const file = path.join(directory, 'cable-catalog.json');
  let pending = Promise.resolve();
  async function readRecords(target) {
    const { parseBackup, maxCatalogBytes } = await import('../shared/catalog.mjs');
    if ((await fs.stat(target)).size > maxCatalogBytes) throw new Error('清单文件超过容量限制，请使用有效备份恢复');
    return parseBackup(await fs.readFile(target, 'utf8'));
  }
  async function load() {
    await pending;
    try { return { records: await readRecords(file) }; }
    catch (error) {
      if(error.code!=='ENOENT') throw error;
      try {await fs.access(file+'.bak');}
      catch(backupError) {if(backupError.code==='ENOENT') return {records:null};throw backupError;}
      throw new Error('当前清单文件缺失，但上一版备份仍在。请选择备份恢复');
    }
  }
  async function recoveryInfo() {
    await pending;
    try {
      const records=await readRecords(file+'.bak'),stat=await fs.stat(file+'.bak');
      return {available:true,records:records.length,savedAt:stat.mtime.toISOString()};
    } catch {return {available:false};}
  }
  function recover(request) {
    const operation=pending.then(async()=>{
      if(!request || !['backup','import'].includes(request.source)) throw new Error('请选择有效的恢复来源');
      const {normalizeCatalog,maxCatalogBytes,catalogVersion}=await import('../shared/catalog.mjs');
      const clean=request.source==='backup'?await readRecords(file+'.bak'):normalizeCatalog(request.records);
      const content=JSON.stringify({app:'Cablewise',catalogVersion,records:clean});
      if(Buffer.byteLength(content)>maxCatalogBytes) throw new Error('备份容量过大');
      let readable=false;
      try {await readRecords(file);readable=true;} catch {}
      if(readable) throw new Error('当前清单已可读取，请先重新读取，避免覆盖较新记录');
      await fs.mkdir(directory,{recursive:true});
      const temp=path.join(directory,`cable-catalog.${randomUUID()}.tmp`);
      let originalPreserved=false;
      try {
        await fs.writeFile(temp,content,{encoding:'utf8',flag:'wx'});
        const retained=path.join(directory,'recovery');await fs.mkdir(retained,{recursive:true});
        // Keep the damaged original byte-for-byte before replacing anything.
        // The existing valid .bak is never overwritten by the damaged file.
        try {await fs.copyFile(file,path.join(retained,`cable-catalog-${Date.now()}-${randomUUID()}.json`),constants.COPYFILE_EXCL);originalPreserved=true;}
        catch(error) {if(error.code!=='ENOENT') throw error;}
        await fs.rename(temp,file);
      } finally {await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT') throw error;});}
      return {records:clean,originalPreserved};
    });
    pending=operation.catch(()=>{});
    return operation;
  }
  function save(records) {
    const operation = pending.then(async () => {
      const { normalizeCatalog, maxCatalogBytes, catalogVersion } = await import('../shared/catalog.mjs');
      const clean = normalizeCatalog(records);
      const content = JSON.stringify({ app: 'Cablewise', catalogVersion, records: clean });
      if (Buffer.byteLength(content) > maxCatalogBytes) throw new Error('清单容量过大，请先导出备份');
      await fs.mkdir(directory, { recursive: true });
      const temp = path.join(directory, `cable-catalog.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
        try { await fs.copyFile(file, file + '.bak'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fs.rename(temp, file);
      } finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
      return clean;
    });
    pending = operation.catch(() => {});
    return operation;
  }
  return { load, save, recoveryInfo, recover };
}
module.exports = { createCatalogStore };
