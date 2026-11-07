# 线知 Cablewise · 0.3.0-rc.3

用于辨认和整理自有线材的本地桌面应用。支持自定义名称、照片、规格记录、自动用途建议、图文清单和备份。当前是未签名候选版本，尚未完成跨平台正式发行验收；具体状态见 [交付验收状态](docs/交付验收状态.md)。

[公开仓库](https://github.com/code-lawyer/check-your-lines) · [候选版下载](https://github.com/code-lawyer/check-your-lines/releases/tag/v0.3.0-rc.3) · [自动构建与桌面测试](https://github.com/code-lawyer/check-your-lines/actions/workflows/verify.yml)

## 使用

在 Releases 下载 Cablewise-0.3.0-rc.3-win-x64.exe，双击运行。发行页提供 SHA-256 与源码包；本地构建文件位于 release/。这是未签名的预发行版，完整发行门槛仍见上述记录。Mac DMG 为未签名、未公证的开发验收包，尚未完成实物线材和正常安装流程验证。

1. 在「当前连接」查看电脑能确认的外接连接、设备名称和当前数据速率。内置摄像头、蓝牙等不计入外接数量。
2. 从当前连接点击「加入我的线材」，或在「我的线材」添加实物档案。名称、照片、存放位置、备注和规格都会保存在本机。
3. 规格填写包装或官网上可核对的信息，并注明依据；不确定的项目留空。用途建议随已知信息变化。
4. 「用途标准」展示七类用途的区分表。功率和数据速度分别判断，信息不足不会自动归类为键鼠充电线。
5. 导出 HTML 图文清单、CSV 表格或 JSON 完整备份。HTML / JSON 含照片；CSV 不含照片。JSON 可导入恢复，重复编号跳过。

照片仅用于辨认，不猜测规格。系统端口编号不是永久线材身份；换手机或重新插线后，应用不会自动认领成某条已保存档案。

## 自动读取的边界

- 普通 Windows 扫描提供外接端口、设备名称和当前数据连接。当前 480 Mbps 说明连接的数据档位，不能证明线材最高速度或额定功率。
- 「检查电脑兼容性」可在明确确认和 Windows 管理员授权后，临时开启系统 UCSI 诊断接口。结束后恢复原设置；遇到异常保留恢复记录。普通扫描不需要管理员权限。
- 自有读取器已在当前 Windows 实机对照微软工具验证。当前电脑固件没有开放线材规格读取，所以无法自动获取额定功率、电压、电流。这不是对线材好坏的判断。
- 支持的控制器可分别返回线材属性或芯片声明；两类来源独立标注。电流字段没有电压依据时，不计算功率。UCSI 端口与 USB 设备不自动配对。
- macOS 已有 IORegistry 采集代码和云端打包桌面测试，尚待 Mac 实物线材与安装验收；此时不提供正式 Mac 发行承诺。
- 品牌私有快充需要具体机型、充电器和线材方案。没有从手机名称推测支持协议。
- 不测线阻、压降、发热、实际承载能力或质量评分。

参考：[用途推荐标准](docs/用途推荐标准.md)、[Windows 读取验证](docs/Windows读取接口验证.md)。

## 本地数据

桌面清单位于 Electron 用户数据目录的 cable-catalog.json，Windows 通常为 %APPDATA%/cablewise/。成功保存时保留上一版 .bak；无效保存或读取失败不覆盖原清单。浏览器预览使用独立 IndexedDB，通过 JSON 备份与桌面交换。

桌面主清单损坏或主文件丢失但备份仍在时，应用提供「恢复上一版备份」与「选择 JSON 备份恢复」。恢复前校验数据，现有原文件另存到用户数据目录的 recovery/，有效 .bak 保留；无效备份不覆盖原数据。恢复操作由用户主动选择，读取失败不会自动写入空清单。

最多 500 条档案，照片自动压缩。0.3 备份格式为版本 3，能导入版本 1 / 2；旧应用不能读取新增来源字段，请使用新版恢复。演示记录始终保留标记，真实扫描不混入示例。

电脑兼容性结果另存 computer-capabilities.json，绑定当前 Windows 安装与 BIOS 版本，30 天后重新验证。compatibility-pending.json 表示有诊断尚未确认恢复；应用提示恢复前，不应删除对应日志。

## 开发

    npm ci
    npm run build
    npm start
    npm test
    node tests/catalog-smoke.cjs
    node tests/compatibility-smoke.cjs
    node tests/recovery-smoke.cjs
    npm run package:win

npm run dev 启动浏览器预览，不具备原生硬件读取。Windows 既支持 PowerShell 7，也支持系统自带 PowerShell 5.1。原生 PowerShell 脚本必须保留 UTF-8 BOM，避免 5.1 对中文脚本的错误解码。

桌面测试使用隔离配置，不修改日常档案。兼容性测试默认模拟 IPC，不改变系统设置；真实提权验收只有明确设置 CABLEWISE_TEST_UCSI=1 才会执行，需操作人另外确认和处理 UAC。

macOS 构建需在 Mac 上执行 npm run package:mac，并完成实际硬件、签名和公证验收。测试详情见 [VALIDATION.md](VALIDATION.md)。

GitHub Actions 分别运行 Windows x64、macOS arm64 和 macOS x64 的自动测试、打包和隔离档案流程。通过后的包作为临时 CI 产物保存；云端运行环境没有用户的实物线材，构建通过不等于硬件读取验收或正式发行。

## 工程记录

历史调研和进度在 docs/。work/ 是本地诊断资料，test-results/ 保存隔离测试数据；两者不提交到仓库或发行。个人线材档案保存在应用用户数据目录，也不随源码发布。第三方许可见 THIRD_PARTY_NOTICES.md；项目当前保留 package.json 中的 UNLICENSED 设置。
