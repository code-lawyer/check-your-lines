const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const {version}=require('../package.json');
const release=path.join(root,'release');
const archive=path.join(release,'win-unpacked/resources/app.asar');
const manifest=JSON.parse(asar.extractFile(archive,'package.json').toString());
assert.equal(manifest.version,version,'Packaged version differs from source');
const files=asar.listPackage(archive).map(f=>f.replaceAll('\\','/'));
assert(!files.some(f=>/^\/(work|test-results|tests|scripts)\//.test(f)),'Development or hardware diagnostics entered the package');
assert(!files.some(f=>/UcsiControl\.exe$/i.test(f)),'The Microsoft diagnostic executable must not be redistributed');
function verifyDirectory(relative) {
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
    const file=relative+'/'+entry.name;
    if(entry.isDirectory()) {verifyDirectory(file);continue;}
    const packaged=file.startsWith('electron/native/')
      ?fs.readFileSync(path.join(release,'win-unpacked/resources/app.asar.unpacked',file))
      :asar.extractFile(archive,path.normalize(file));
    assert(packaged.equals(fs.readFileSync(path.join(root,file))),`Packaged source differs: ${file}`);
  }
}
verifyDirectory('electron');verifyDirectory('shared');
const artifact=path.join(release,`Cablewise-${version}-win-x64.exe`);
const bytes=fs.readFileSync(artifact);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const ps=path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const metadata=JSON.parse(execFileSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',
  '[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); Import-Module (Join-Path $PSHOME "Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1") -ErrorAction Stop; $v=[Diagnostics.FileVersionInfo]::GetVersionInfo($env:CABLEWISE_VERIFY_EXE); $s=Get-AuthenticodeSignature -LiteralPath $env:CABLEWISE_VERIFY_EXE; @{productName=$v.ProductName;productVersion=$v.ProductVersion;signatureStatus=$s.Status.ToString()} | ConvertTo-Json -Compress'
],{encoding:'utf8',windowsHide:true,env:{...process.env,CABLEWISE_VERIFY_EXE:path.join(release,'win-unpacked/Cablewise.exe')},timeout:30000}));
assert.equal(metadata.productName,'Cablewise','Executable still contains another product identity');
assert(metadata.productVersion.startsWith(version.split('-')[0]),'Executable version differs');
const result={version,artifact:path.basename(artifact),bytes:bytes.length,sha256,packageContents:'passed',...metadata,signed:metadata.signatureStatus==='Valid'};
fs.writeFileSync(artifact.replace(/\.exe$/,'.sha256'),`${sha256}  ${path.basename(artifact)}\n`);
fs.writeFileSync(path.join(release,'package-verification.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(release,`Cablewise-${version}-package-verification.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
