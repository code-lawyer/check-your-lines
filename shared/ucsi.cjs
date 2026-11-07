// UCSI response validation is independent of the Microsoft tool's exit code.
// The tool can exit 0 while the PPM reports unsupported, an error, or no data.
function parseUcsiResponse(probe) {
  const output = probe?.result?.output || '';
  const echo = output.match(/AsUInt64:\s*0x([0-9a-f]+)/i);
  if (probe?.result?.exitCode !== 0 || !echo || !/^[0-9a-f]+$/i.test(probe.control || '') || BigInt(`0x${echo[1]}`) !== BigInt(`0x${probe.control}`)) return { state: 'invalid', bytes: [] };
  const cciMatch = output.match(/UCSI_CCI:[\s\S]*?AsUInt32:\s*0x([0-9a-f]+)/i);
  if (!cciMatch) return { state: 'invalid', bytes: [] };
  const cci = Number.parseInt(cciMatch[1], 16) >>> 0;
  if (cci & 0x02000000) return { state: 'unsupported', bytes: [] };
  if ((cci & 0x40000000) || (cci & 0x10000000) || !(cci & 0x80000000)) return { state: 'error', bytes: [] };
  const length = (cci >>> 8) & 255;
  if (!length) return { state: 'empty', bytes: [] };
  const hex = output.match(/UCSI MESSAGE_IN:\s*={3,}\s*((?:(?:[0-9a-f]{2}[ \t]+)+\r?\n?)+)/i);
  const bytes = hex ? (hex[1].match(/[0-9a-f]{2}/gi) || []).map(x => Number.parseInt(x,16)) : [];
  return bytes.length === length ? { state: 'data', bytes } : { state: 'invalid', bytes: [] };
}
function parseUcsiNativeResponse(response) {
  if (!response || response.IoctlSuccess !== true || !Number.isInteger(response.Cci) || response.Cci < 0 || response.Cci > 0xffffffff || response.Returned < 16) return { state:'invalid', bytes:[] };
  const cci=response.Cci >>> 0;
  if(cci & 0x02000000) return {state:'unsupported',bytes:[]};
  if((cci & 0x40000000) || (cci & 0x10000000) || !(cci & 0x80000000)) return {state:'error',bytes:[]};
  const length=(cci>>>8)&255;
  if(!length) return {state:'empty',bytes:[]};
  if(response.Returned < 16+length || !Array.isArray(response.Data) || response.Data.length!==length || response.Data.some(b=>!Number.isInteger(b)||b<0||b>255)) return {state:'invalid',bytes:[]};
  return {state:'data',bytes:response.Data};
}
function assessNativeUcsiReport(report) {
  const controllers=report?.native?.controllers;
  if(!Array.isArray(controllers)||!controllers.length) return {state:'inconclusive',reason:'系统没有开放 USB-C 读取接口，未能确认电脑的线材读取能力。'};
  const reports=controllers.map(c=>{
    const responses=c.Responses || [];
    const capability=responses.find(r=>r.Name==='GET_CAPABILITY');
    const v=Number(capability?.Version)||0;
    return assessParsedResponses(responses.map(r=>({name:r.Name,...parseUcsiNativeResponse(r)})),`${(v>>8)&15}.${(v>>4)&15}.${v&15}`,report);
  });
  const allLimited=reports.every(r=>r.state==='firmware-limited');
  return {
    state:allLimited?'firmware-limited':reports.some(r=>r.state==='data-available')?'data-available':reports.some(r=>r.state==='conditional')?'conditional':'inconclusive',
    reason:allLimited?'这台电脑的固件未开放线材规格读取。可识别外接数据连接，但不能自动确认线材额定功率、电压、电流。':'已检查电脑的 USB-C 信息通道；能否取得完整规格仍取决于端口与线材。',
    controllers:reports,hostFingerprint:report.hostFingerprint,checkedAt:report.finishedAt,
    connectors:reports.reduce((n,r)=>n+(r.connectors||0),0)
  };
}
function assessUcsiReport(report) {
  if (!report || !Array.isArray(report.probes)) throw new Error('不是有效的 USB-C 兼容性报告');
  const capabilityProbe = report.probes.find(p => p.name === 'GET_CAPABILITY');
  const version=capabilityProbe?.result?.output?.match(/UCSI VERSION from PPM:\s*([\d.]+)/)?.[1] || null;
  return assessParsedResponses(report.probes.map(p=>({name:p.name,...parseUcsiResponse(p)})),version,report);
}
function assessParsedResponses(responses, version, report) {
  const capability=responses.find(p=>p.name==='GET_CAPABILITY');
  if (!capability || capability.state !== 'data' || capability.bytes.length < 16) return { state: 'inconclusive', reason: '未读取到完整的电脑 USB-C 能力信息' };
  const b = capability.bytes;
  const connectors = b[4] & 127;
  const features = b[5] | b[6] << 8 | b[7] << 16;
  const cableDetails = Boolean(features & 32), pdMessage = Boolean(features & 256);
  const validCableProperty = responses.some(p => p.name.endsWith('GET_CABLE_PROPERTY') && p.state === 'data' && decodeUcsiCableProperty(p.bytes));
  const identityData = responses.some(p => {
    if(!p.name.endsWith('GET_CABLE_IDENTITY_0') || p.state!=='data' || p.bytes.length!==16) return false;
    const tail=responses.find(t=>t.name===p.name.replace(/_0$/,'_16'));
    return tail?.state==='data' && Boolean(decodeUcsiIdentity([...p.bytes,...tail.bytes]));
  });
  const firmwareLimited = !cableDetails && !pdMessage && !validCableProperty && !identityData;
  return {
    state: firmwareLimited ? 'firmware-limited' : validCableProperty || identityData ? 'data-available' : 'conditional',
    reason: firmwareLimited ? '这台电脑的固件未开放线材规格读取。可识别外接数据连接，但不能自动确认线材额定功率、电压、电流。' : '电脑的线材信息读取能力取决于连接端口与线材；有返回数据仍需逐字段验证。',
    version, connectors, cableDetails, pdMessage, validCableProperty, identityData,
    checkedAt: report.finishedAt || report.startedAt || null,
    hostFingerprint: typeof report.hostFingerprint === 'string' ? report.hostFingerprint : null
  };
}
function applicableCapabilityProfile(profile, hostFingerprint) {
  if (!profile || profile.state !== 'firmware-limited' || !/^[a-f0-9]{64}$/i.test(hostFingerprint || '') || profile.hostFingerprint !== hostFingerprint) return null;
  const date = Date.parse(profile.checkedAt);
  if (!Number.isFinite(date) || date > Date.now() + 60000 || Date.now() - date > 30 * 86400000) return null;
  return profile;
}
function decodeUcsiCableProperty(bytes) {
  if(!Array.isArray(bytes)||bytes.length<5||bytes.some(b=>!Number.isInteger(b)||b<0||b>255)) return null;
  const speedWord=bytes[0]|bytes[1]<<8;
  if(!speedWord&&!bytes[2]&&!bytes[3]&&!bytes[4]) return null;
  const mbps=(speedWord>>>2)*10**(3*(speedWord&3))/1e6;
  const knownSpeed=[1.5,12,480,5000,10000,20000,40000,80000].includes(mbps);
  const flags=bytes[3],plug=(flags>>>3)&3,vbus=Boolean(flags&1);
  const current=bytes[2]>0?bytes[2]/20:null;
  const warnings=[];
  if(mbps&&!knownSpeed) warnings.push('系统上报的数据等级暂不支持解析');
  if(current&&!vbus) warnings.push('系统上报的电流与供电线路字段不一致');
  if(current>5) warnings.push('系统上报电流超出通用 USB-C 线材档位，需核对厂商规格');
  return {evidence:'controller',presence:'cable',sourceLabel:'USB-C 控制器上报的线材属性',
    connector:plug===2?'USB-C ↔ USB-C':plug===0?'USB-A ↔ USB-C':'USB-C · 另一端类型待确认',
    kind:knownSpeed?'data':'unknown',ratingCurrentA:vbus?current:null,ratingVoltageV:null,operationalVoltageV:null,maxPowerW:null,
    dataLabel:knownSpeed?mbps>=1000?`${mbps/1000} Gbps`:`${mbps} Mbps`:null,currentSpeedLabel:null,
    activeCable:Boolean(flags&2),warnings,speedNote:'系统控制器上报的线材数据等级，未进行实际传输测试。',
    powerEvidence:'此系统接口提供了电流能力，但没有线材额定电压，不能据此计算充电功率。'};
}
function decodeUcsiIdentity(bytes) {
  if(!Array.isArray(bytes)||bytes.length<20||bytes.length%4||bytes.some(b=>!Number.isInteger(b)||b<0||b>255)) return null;
  const words=[];for(let i=0;i<bytes.length;i+=4) words.push((bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16|bytes[i+3]<<24)>>>0);
  const header=words[0],svdm=(header>>>13)&3;
  // Only a fresh SOP' Discover Identity ACK with a known structured layout.
  // Older/unknown layouts stay undecoded rather than guessing a PD revision.
  if((header>>>16)!==0xff00||!(header&0x8000)||((header>>>6)&3)!==1||(header&31)!==1||svdm!==1||((header>>>11)&3)>1) return null;
  return require('./emarker.cjs').decodeIdentity(words.slice(1),3);
}
function cableRecordsFromNative(report) {
  const controllers=report?.native?.controllers||[],records=[];
  controllers.forEach((controller,index)=>{
    const responses=new Map((controller.Responses||[]).map(r=>[r.Name,parseUcsiNativeResponse(r)]));
    for(let port=1;port<=8;port++) {
      const prefix=`CONNECTOR_${port} `;
      const first=responses.get(prefix+'GET_CABLE_IDENTITY_0'),second=responses.get(prefix+'GET_CABLE_IDENTITY_16');
      let cable=first?.state==='data'&&first.bytes.length===16&&second?.state==='data'?decodeUcsiIdentity([...first.bytes,...second.bytes]):null;
      const status=responses.get(prefix+'GET_CONNECTOR_STATUS');
      if(!cable&&status?.state==='data'&&status.bytes.length>=3&&(status.bytes[2]&8)) {
        const property=responses.get(prefix+'GET_CABLE_PROPERTY');
        if(property?.state==='data') cable=decodeUcsiCableProperty(property.bytes);
      }
      if(!cable) continue;
      const portLabel=controllers.length>1?`USB-C 控制器 ${index+1} / 端口 ${port}`:`USB-C 端口 ${port}`;
      records.push({...cable,id:`ucsi-${index}-${port}-${report.finishedAt||report.startedAt||'scan'}`,name:portLabel+'线材',portLabel,
        presence:'cable',sourceLabel:cable.evidence==='emarker'?'线材芯片声明（USB-C 系统接口）':cable.sourceLabel,
        location:portLabel,note:'本次检查读取的线材信息。请按实物核对端口后保存；换线后应重新检查。'});
    }
  });
  return records;
}
module.exports = { parseUcsiResponse, parseUcsiNativeResponse, assessUcsiReport, assessNativeUcsiReport, applicableCapabilityProfile,decodeUcsiCableProperty,decodeUcsiIdentity,cableRecordsFromNative };
