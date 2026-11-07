const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUcsiResponse, assessUcsiReport, applicableCapabilityProfile } = require('../shared/ucsi.cjs');
function probe(control, cci, hex = '') {
  return { control, result: { exitCode: 0, output: `UCSI_CONTROL:\nAsUInt64: 0x${control}\nUCSI_CCI:\n=========\nAsUInt32: 0x${cci}\n\nUCSI MESSAGE_IN:\n================\n${hex}\n` } };
}
test('exit code 0 and a success sentence are not proof of cable data', () => {
  assert.equal(parseUcsiResponse(probe('10011','80000000')).state,'empty');
  assert.equal(parseUcsiResponse(probe('104001010015','82000000')).state,'unsupported');
  assert.equal(parseUcsiResponse(probe('10011','c0000500','01 02 03 04 05 ')).state,'error');
});
test('truncated data and a different echoed command cannot become specifications', () => {
  assert.equal(parseUcsiResponse(probe('10011','80000500','01 02 ')).state,'invalid');
  const p=probe('104001010015','80000500','01 02 03 04 05 ');p.control='416001010015';
  assert.equal(parseUcsiResponse(p).state,'invalid');
  assert.deepEqual(parseUcsiResponse(probe('10011','80000500','01 02 03 04 05 ')),{state:'data',bytes:[1,2,3,4,5]});
});
test('observed firmware capability and empty cable responses produce a host limitation, not a bad-cable verdict', () => {
  const p=probe('6','80001000','44 40 00 00 02 00 00 00 \n00 00 00 00 00 00 00 00 ');p.name='GET_CAPABILITY';
  const result=assessUcsiReport({probes:[p,{name:'CONNECTOR_1 GET_CABLE_PROPERTY',...probe('10011','80000000')}]});
  assert.equal(result.state,'firmware-limited');assert.equal(result.connectors,2);
  assert.equal(result.cableDetails,false);assert.equal(result.identityData,false);
  p.result.output=p.result.output.replace('02 00 00 00','02 20 00 00');
  assert.equal(assessUcsiReport({probes:[p]}).state,'conditional');
});
test('host capability cache cannot migrate between computers or outlive a firmware change', () => {
  const profile={state:'firmware-limited',hostFingerprint:'a'.repeat(64),checkedAt:new Date().toISOString()};
  assert.equal(applicableCapabilityProfile(profile,'a'.repeat(64)),profile);
  assert.equal(applicableCapabilityProfile(profile,'b'.repeat(64)),null);
  assert.equal(applicableCapabilityProfile({...profile,checkedAt:'2020-01-01'},'a'.repeat(64)),null);
});
test('native reader validates actual CCI/payload bytes and agrees with the official tool capture', () => {
  const {parseUcsiNativeResponse,assessNativeUcsiReport}=require('../shared/ucsi.cjs');
  const response={Name:'GET_CAPABILITY',Control:'6',IoctlSuccess:true,Returned:48,Version:288,Cci:0x80001000,Data:[68,64,0,0,2,0,0,0,0,0,0,0,0,0,0,0]};
  assert.equal(parseUcsiNativeResponse(response).state,'data');
  assert.equal(parseUcsiNativeResponse({...response,IoctlSuccess:false}).state,'invalid');
  assert.equal(parseUcsiNativeResponse({...response,Data:[]}).state,'invalid');
  const result=assessNativeUcsiReport({native:{controllers:[{Responses:[response]}]}});
  assert.equal(result.state,'firmware-limited');assert.equal(result.connectors,2);assert.equal(result.controllers[0].version,'1.2.0');
});
test('UCSI cable-property specification fixture preserves current without inventing voltage or watts',()=>{
  const {decodeUcsiCableProperty}=require('../shared/ucsi.cjs');
  const cable=decodeUcsiCableProperty([23,0,100,17,0]);
  assert.equal(cable.evidence,'controller');assert.equal(cable.ratingCurrentA,5);assert.equal(cable.dataLabel,'5 Gbps');
  assert.equal(cable.ratingVoltageV,null);assert.equal(cable.maxPowerW,null);assert.equal(cable.connector,'USB-C ↔ USB-C');
  assert.equal(decodeUcsiCableProperty([0,0,0,0,0]),null);
});
test('split Discover Identity specification fixture requires an ACK and a complete cable VDO',()=>{
  const {decodeUcsiIdentity}=require('../shared/ucsi.cjs');
  const words=[0xff00a041,(3<<27)>>>0,0,0,((2<<18)|(1<<17)|(3<<9)|(2<<5)|0)>>>0];
  const bytes=words.flatMap(w=>[w&255,(w>>>8)&255,(w>>>16)&255,w>>>24]);
  assert.equal(decodeUcsiIdentity(bytes).maxPowerW,240);
  assert.equal(decodeUcsiIdentity(bytes.slice(0,16)),null);
  bytes[0]=0x81;assert.equal(decodeUcsiIdentity(bytes),null);
});
test('empty cable properties and a partial identity do not claim successful cable detection',()=>{
  const {assessNativeUcsiReport}=require('../shared/ucsi.cjs');
  const response=(Name,Data)=>({Name,IoctlSuccess:true,Returned:48,Version:288,Cci:(0x80000000|(Data.length<<8))>>>0,Data});
  const report={native:{controllers:[{Responses:[
    response('GET_CAPABILITY',[68,64,0,0,2,32,1,0,0,0,0,0,0,0,0,0]),
    response('CONNECTOR_1 GET_CABLE_PROPERTY',[0,0,0,0,0]),
    response('CONNECTOR_1 GET_CABLE_IDENTITY_0',[65,160,0,255,0,0,0,24,0,0,0,0,0,0,0,0])
  ]}]}};
  const r=assessNativeUcsiReport(report);assert.equal(r.state,'conditional');
  assert.equal(r.controllers[0].validCableProperty,false);assert.equal(r.controllers[0].identityData,false);
});
