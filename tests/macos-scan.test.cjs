const {test}=require('node:test');
const assert=require('node:assert/strict');
const plist=require('plist');
const {scanMac}=require('../electron/collectors/macos.cjs');

test('macOS with no matching cable registry entries returns an empty scan without an XML error',async()=>{
  for(const stdout of ['', ' \n\t', plist.build([])]) {
    let calls=0;
    const result=await scanMac(async(file,args)=>{
      calls++;assert.equal(file,'/usr/sbin/ioreg');
      assert.deepEqual(args,['-a','-l','-r','-c','IOPortTransportComponentCCUSBPDSOPp']);
      return {stdout,stderr:''};
    });
    assert.equal(calls,1);assert.equal(result.platform,'macOS');
    assert.deepEqual(result.cables,[]);
    assert.equal(result.capabilities.emarker,'conditional');
    assert.match(result.capabilities.message,/未读取到/);
  }
});

test('macOS empty-registry handling does not hide command failures or malformed XML',async()=>{
  await assert.rejects(scanMac(async()=>{throw new Error('ioreg permission failure')}),/ioreg permission failure/);
  await assert.rejects(scanMac(async()=>({stdout:'not a property list'})));
});

test('macOS scanner still decodes valid cable entries after handling an empty result',async()=>{
  const words=[(3<<27)>>>0,0,0,((2<<18)|(1<<13)|(2<<5)|2)>>>0];
  const stdout=plist.build([{
    IORegistryEntryID:42,ParentPortNumber:1,'Specification Revision':3,
    Metadata:{VDOs:words.map(n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;})}
  }]);
  const result=await scanMac(async()=>({stdout}));
  assert.equal(result.cables.length,1);assert.equal(result.cables[0].evidence,'emarker');
  assert.equal(result.cables[0].ratingCurrentA,5);
});
