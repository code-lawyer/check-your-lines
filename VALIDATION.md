# Cablewise 0.3.0-rc.2 · 验证记录

日期：2026-11-06。环境：Windows、本机 Electron 45.2.3、Node.js 24.16，PowerShell 7 / Windows PowerShell 5.1。

## 本轮已通过

- 41 项单元及故障模拟测试、TypeScript 检查、Vite 生产构建。
- 真实连接：Xiaomi 15 换为 Galaxy S21 5G，均为 1 个外接连接，排除 3 个内置设备。当前速率 480 Mbps，不表示线材额定上限。
- 系统自带 PowerShell 5.1 原生扫描约 0.95 秒完成，名称、数量和速度正确，无回退警告。旧 CIM/PnP 路径曾超时，已以只读原生设备属性采集替代。
- 自有 UCSI 读取器：实际读取的能力和两端口状态与微软工具一致；本机固件未开放线材属性与 PD 身份。临时设置恢复，控制器健康。
- 开发版完整桌面流程：真实扫描、两线对比、照片压缩、改名、补录、七类用途、HTML/CSV/JSON 导出、重复导入、搜索、窄窗口、重启保存、照片移除与恢复，无渲染错误。
- 兼容性界面测试：确认、取消、返回控制器属性并存档、失败后恢复。使用明确标记的 IPC 夹具，无系统改动。
- 恢复故障测试：损坏或缺失日志不能认定恢复成功；超时保留待恢复任务；恢复失败不缓存能力；一个控制器失败仍处理其他控制器；重试只恢复未完成项；日志写入失败不会显示成功。
- 清单恢复：主文件损坏或缺失时，可恢复上一版自动备份或选择 JSON 备份；无效备份不覆盖数据，已恢复的新主文件不被过期操作覆盖。损坏原件逐字节另存，备份保留。打包版经过两次损坏、无效备份拒绝、照片恢复和重启验证。
- 官方 npm registry 审计 0 项漏洞。针对 minimatch 构建依赖的漏洞使用范围覆盖升级至 11.0.1，未降级构建工具。

## 打包验收

0.3.0-rc.2 Windows x64 候选包已通过本轮打包验收，未签名、未公开发布。

- 文件：release/Cablewise-0.3.0-rc.2-win-x64.exe，111,932,761 字节。
- SHA-256：e078ccf216537fe910b5cfdcb3b8774ddab2ac060f1ec4445d059db890bd06d0。
- 打包后完整清单流程、清单故障恢复和兼容性界面流程通过；真实扫描为 1 个外接连接。
- 直接运行便携 EXE 的启动检查通过，实际解包后的应用显示 0.3.0-rc.2、正确扫描三星 S21，并正常退出。使用隔离配置，没有写入日常清单。
- Electron / shared 源文件逐一与 ASAR 或解包文件一致，原生文件完整；不包含 work、test-results、测试脚本或微软 UcsiControl.exe。
- 应用图标与版本资源已写入；ProductName=Cablewise，Windows 数字版本为 0.3.0.0，应用内标记完整 RC 版本。签名状态为 NotSigned。
- 散列和内容检查报告：release/Cablewise-0.3.0-rc.2-package-verification.json；release/package-verification.json 指向最近一轮内容，可用 scripts/verify-windows-package.cjs 重新生成。

RC1 的安装包、源码包和版本化校验报告仍保留。RC1 Windows 包 SHA-256 为 592693f81825919e74576984760bdd79dfd4537d0e2779325698a46f16932310；其 37 项测试与旧打包记录仅代表当时版本。历史 0.2 的打包结果亦不适用于当前版本。

## 未通过或需要外部环境

- 正式应用提权→读取→自动恢复的真实端到端流程：最近的 Windows 管理员请求被取消。本轮未通过，不用模拟测试代替。
- Windows 支持规格读取的硬件正例；单端、多线、多控制器物理场景。控制器属性和 Discover Identity 的正例仅为协议夹具。
- macOS 真机、双架构安装包、签名、公证和正式发行。
- Windows 发行签名与目标下载渠道。

## 复现

    npm run build
    npm test
    node tests/recovery-smoke.cjs
    node tests/catalog-smoke.cjs
    node tests/compatibility-smoke.cjs

设置 CABLEWISE_TEST_EXE 为 release/win-unpacked/Cablewise.exe 的绝对路径，可对实际打包应用执行相同桌面测试。本机只有一个外接连接时设置 CABLEWISE_EXPECT_EXTERNAL_COUNT=1，测试会验证数量。

node tests/portable-smoke.cjs 检查最终便携 EXE 的实际启动、扫描和退出；无需管理员权限。node scripts/verify-windows-package.cjs 核对发行内容、元数据、签名状态与散列。测试不能代替上文列出的未完成硬件及发行门槛。

测试数据位于 test-results/desktop、test-results/recovery-ui、test-results/portable、test-results/compatibility 和 test-results/compatibility-unit；原生诊断记录位于 work/ucsi。它们均不打入软件；记录中的测试照片、规范夹具不是实物检测证据。
