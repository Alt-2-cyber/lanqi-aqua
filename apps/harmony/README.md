# 澜启渔新 · 原生鸿蒙客户端

采用 ArkTS / ArkUI、Stage 模型，兼容与目标版本均为 HarmonyOS 5.0.0 / API 12。与 Web 共用仓库中的真实 HTTP API，不内置本地伪造成功状态，不包含旧项目资源或签名。

## 已实现

- **监测**：塘口选择、水温 / 溶氧 / pH / 浊度 / 水位、原生 Canvas 趋势、采样时间；按后端 `availableMetrics` 显示各项新鲜有效观测，缺失或过期的指标显示 `—`，兼容未提供此字段的旧服务；真实模式显示“观测在线”，不将在线状态解释为水质达标；手动、下拉与默认每 10 秒同步。
- **设备**：根据快照显示设备，传感器不可开关，离线和已有待回执指令禁用操作；发送带幂等键的命令，显示“等待回执”，服务端回执决定实际状态。
- **告警**：待处理与全部记录，仅按待确认 → 处理中 → 已解决更新。
- **我的**：投喂任务创建（指定分钟后计划）、列表、人工完成、取消；共享操作动态；连接设置与退出登录。
- **登录**：`POST /api/auth/demo` 与账号密码登录；原生请求带 Bearer token。地址和刷新间隔用 Preferences 持久保存，令牌和密码只在内存中。应用重启需重新登录；401 清除当前会话并提示登录。切换服务器会退出当前会话。
- 网络错误保留最后一份成功快照并提供重试；同步和回执刷新计时器在页面隐藏、应用后台、退出时停止，返回前台后恢复。

网络层使用 API 12 可用的系统 `@kit.RemoteCommunicationKit`，因为基础 `@ohos.net.http.RequestMethod` 未提供 PATCH。无第三方运行依赖。

## 构建未签名 HAP

安装 DevEco Studio、HarmonyOS SDK 与随 IDE 提供的 Node / Hvigor。项目不需要任何证书即可编译未签名包。已在 DevEco Hvigor **6.22.4**、本机 SDK **6.0.2.130 / API 22**（编译器）、API 12 兼容目标下构建。

在 PowerShell 执行：

```powershell
./build-unsigned.ps1 -DevEcoHome 'D:/Program Files/Huawei/DevEco Studio'
```

脚本将源码复制到新的纯英文临时目录（排除构建缓存、签名与本地配置），执行 release `assembleHap`，并把包保存到仓库 `artifacts/lanqi-aqua-harmony-unsigned.hap`。可用 `-StagingDirectory 'D:/lanqi-build-new'` 指定一个尚不存在的英文目录，`-OutputPath` 指定输出位置。原工作区含中文时必须使用这种真实副本：Hvigor 同时拒绝非英文目录与 junction 别名。脚本不删除临时工作区，便于检查编译日志。

在英文项目目录内也可直接运行：

```powershell
$env:DEVECO_SDK_HOME = 'D:/Program Files/Huawei/DevEco Studio/sdk'
$env:JAVA_HOME = 'D:/Program Files/Huawei/DevEco Studio/jbr'
& 'D:/Program Files/Huawei/DevEco Studio/tools/node/node.exe' `
  'D:/Program Files/Huawei/DevEco Studio/tools/hvigor/bin/hvigorw.js' `
  --mode module -p product=default -p module=entry@default -p buildMode=release assembleHap --no-daemon
```

原始输出：`entry/build/default/outputs/default/entry-default-unsigned.hap`。`No signingConfig found` 是本项目交付未签名包的预期提示。源码与公开仓库不包含私钥、证书、设备 profile、本地绝对 SDK 配置或已签名包。

## 安装到自己的设备

未签名 HAP 不能直接作为普通应用安装。用 DevEco Studio 打开英文目录中的项目，在 **File → Project Structure → Signing Configs** 中使用自己的华为开发者账号启用自动签名，选择自己的测试设备，按 IDE 提示授权设备并生成本地签名配置，再通过 **Run entry** 安装。也可将自己生成的签名 HAP 使用 `hdc install <signed.hap>` 安装。签名材料必须留在本机且不得加入 Git。

## 后端与局域网连接

默认地址 `http://127.0.0.1:4300` 指运行 App 的设备自身。模拟器访问宿主机时需使用该模拟器支持的宿主地址，或在 `hdc` 支持的环境中自行建立端口转发。真机连接流程：

1. 在仓库根目录按主 README 启动后端。默认仅监听 localhost；仅当需要同一可信局域网访问时，明确设置 `HOST=0.0.0.0`，使用演示模式 `DEMO_MODE=true`。
2. 电脑与手机连接同一局域网，查询电脑的局域网 IP，并在系统防火墙中为本地网络允许 TCP 4300。
3. 在登录页“设置”或“我的 → 服务地址”保存 `http://<电脑局域网IP>:4300`，不带 `/api`；选择“进入演示养殖场”。Web 与 App 的操作将同步到同一后端。
4. 演示模式明确标注模拟数据；切入真实模式后使用服务端配置的账号，真实观测和回执由网关独立接入。生产环境使用可信 HTTPS 域名。

当前目标 API 12 可用于本地 HTTP 开发；若操作系统或企业策略禁止明文流量，应使用 HTTPS 后端。不要为了联调关闭 TLS 证书校验。

## 验证与边界

已完成 ArkTS 编译、资源编译与 unsigned HAP 打包。当前环境 `hdc list targets` 无可用设备，尚未完成真机/模拟器界面和网络联调；不能把编译成功当作真机验证。安装后建议验证：演示登录 → 多塘切换和下拉刷新 → 指令等待回执 → 告警确认再解决 → 投喂任务人工完成/取消 → 后端断网重试 → 应用后台恢复 → 地址切换与登录过期。

原生端当前承担移动巡塘与协作操作；塘口创建、CSV 导出、全局养殖场设置等完整管理功能请使用 Web。投喂“人工完成”是操作记录，不能表示实物称量或真实设备投喂已验证。原创鱼形 SVG 图标随本项目按 Apache-2.0 授权。
