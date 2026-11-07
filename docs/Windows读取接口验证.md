# Windows 读取接口验证

2026-11-06。目标：使应用自主读取系统开放的数据，不将设备连接或空响应误称为线材芯片。

## 官方工具实测

微软 MUTT 3.0.1 内的 x64 UcsiControl.exe，SHA-256：`22ac51ef4503e4ff3344b7c33ffb7509f43d26f5f4942a2c382dd91f4fb7b9a7`。

下载来自微软官网：<https://www.microsoft.com/en-us/download/details.aspx?id=51604>。仅提取诊断工具用于本地验证，没有安装驱动，不随应用发行。

当前电脑：UCSI 1.2.0，2 个连接器，OptionalFeatures=0；CableDetailsAvailable=0。GET_CABLE_PROPERTY 的 CCI=0x80000000、数据长度=0；GET_PD_MESSAGE 的 CCI=0x82000000、NotSupported=1。进程退出码均可为 0，因此必须检查 CCI 与数据长度。

临时 TestInterfaceEnabled 已删除恢复，控制器状态正常。完整本地报告位于 work/ucsi/hardware-probe.json（不随发行包分发）。

## 本地静态互操作检查

REA 能确认目标格式/散列，当前环境未配置原生反汇编引擎。因此以下是本地 pefile/Capstone 的静态观察，并非 REA Evidence，也不是运行结果：

- 0x140010e4f：普通测试接口 GUID 字节，解析为 `0d3bc324-0125-4e95-b25a-7b393333ea9a`。
- 0x14000c16b–0x14000c180：经典 UCSI 事务 IOCTL `0x12131018`，输入/输出 0x30 字节。
- 0x14000c156–0x14000c164：扩展数据块 IOCTL `0x1213101c`，0x210 字节。当前原生读取器尚未启用此未经实机验证的变体。
- 上述地址属于该散列的 Microsoft 工具，只用于核对互操作常量；没有复制工具实现或将其加入发行包。

数据块字段依据：[微软 UCSI 数据块](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ucmucsispec/ns-ucmucsispec-_ucsi_data_block)。
测试接口及临时开关依据：[微软 UCSI 驱动文档](https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/ucsi)。

## 自有读取器实测

自有 UcsiReader.cs 已在管理员诊断中实际读取本机控制器。GET_CAPABILITY 与两个 GET_CONNECTOR_STATUS 的有效载荷和微软工具一致；原始结果保存在本地 work/ucsi/native-probe.json。两种读取方法都表明该电脑没有开放线材属性及 PD 身份读取能力。这是电脑固件限制，不能推导线材没有芯片、损坏或不支持快充。

Windows 应用已提供兼容性检查、恢复日志和结果缓存。正式应用的完整提权流程曾因管理员请求被取消而未通过实机验收；没有把界面模拟用例当作提权实测。此前的临时诊断设置已恢复，控制器正常。取消后未继续发起管理员请求。

恢复逻辑额外覆盖：日志缺失或损坏不宣称恢复成功；某个控制器恢复失败仍继续恢复其他控制器；重试只处理未完成项；写入失败保留恢复记录。该组测试使用模拟回调，不修改系统设置。

## 普通 USB 连接采集

USB hub 端口属性用于区分可外接端口和内置设备。SetupAPI 与 Configuration Manager 获取设备名称、父子关系和容器信息；没有设备名称黑名单。三星 S21 的名称取自其 WPD 子设备，但计数仍保留一个物理端口记录。

Windows PowerShell 5.1 的旧 CIM/PnP 查询路径曾超过 30 秒。改用原生只读属性查询后，本机同样扫描约 0.95 秒完成：Galaxy S21 5G、480 Mbps、1 个外接连接、3 个内置设备。此时间是本机观察，不是所有机器的性能保证。PowerShell 脚本使用带 BOM 的 UTF-8，兼容系统自带的 5.1 解析器。

依据：[CM_Get_DevNode_PropertyW](https://learn.microsoft.com/en-us/windows/win32/api/cfgmgr32/nf-cfgmgr32-cm_get_devnode_propertyw)、[设备子节点关系](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/devpkey-device-children)、[微软属性键定义](https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/shared/devpkey.h)。

## 仍需验证

正式应用提权与自动恢复的完整实测；支持线材属性的电脑上的正例；多控制器和多端口场景；扩展 UCSI 数据块接口；macOS 真机。读取到的 UCSI 端口不会自动与 USB 设备配对，以免把电脑充电器的线误认作手机的线。未验证项不能作为发布承诺。
