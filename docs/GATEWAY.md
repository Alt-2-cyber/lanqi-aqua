# 网关接入与运行模式

## 环境配置

复制 `.env.example` 为 `.env`，配置：

```dotenv
HOST=127.0.0.1
PORT=4300
DEMO_MODE=false
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=replace-with-a-long-random-password
DEVICE_INGEST_TOKEN=replace-with-an-independent-random-device-token
SECURE_COOKIES=false
```

示例值不能用作实际密码。HTTPS反向代理后将 `SECURE_COOKIES=true`；只有需要可信局域网联调时才显式监听0.0.0.0。真实模式使用 `data/live.sqlite`，不会读入演示场景。需 Node24。

## 设备注册与生命周期

1. 管理员 `POST /api/auth/login`，使用返回的用户token进行管理。Web也支持HttpOnly会话cookie。
2. `POST /api/ponds` 登记塘口，body `{name,areaMu,species,location}`。
3. `POST /api/devices` 登记设备，body `{name,pondId,type}`，type可为sensor/aerator/pump/feeder。返回的设备id供网关配置。初始设备offline。
4. 网关独立使用 `Authorization: Bearer <DEVICE_INGEST_TOKEN>`。管理会话不能替代网关鉴权。
5. `POST /api/gateway/heartbeat` body `{deviceId,state:"on"|"off"}` 更新真实运行状态。传感器也通过有效观测更新在线时间。建议每60秒以内一次心跳；5分钟未更新判离线。执行设备必须先心跳上线才能提交命令。
6. 观测按 `POST /api/gateway/observations` 上传。参考字段见API.md。时间距服务端最多过去5分钟/未来30秒；同sampleId幂等；倒序、无效、不匹配的单位/设备不覆盖当前有效读数。
7. 基础水温、溶氧和pH观测齐全后塘口显示正常并形成三指标历史点，避免用未观测的零初始化值绘制曲线。其他指标按实际配置上传。
8. 执行器 `GET /api/gateway/commands?deviceId=<id>` 拉取pending；执行前再次检查本机急停、有效期、联锁，按command_id做好设备端幂等。
9. `POST /api/gateway/receipts` body `{commandId,deviceId,result:"succeeded"|"failed",actualState:"on"|"off",reason?}`。成功回执必须与目标设备和动作一致。服务端只接受仍未过期的pending指令；设备状态按实际回执更新。

## 指标单位

| metric | unit | 接入值域 |
| --- | --- | --- |
| oxygen | mg/L | 0..30 |
| temperature | ℃ 或 °C | -5..60 |
| ph | pH | 0..14 |
| turbidity | NTU | 0..10000 |
| waterLevel | m | 0..100 |

这些是接口数据有效域，不是养殖阈值；现场量程、阈值及处置规则按设备、鱼种、养殖阶段核定。当前真实模式不自动生成养殖控制策略。重复、过期数据留在原始网关档案中复核，不推入当前有效值。

## 演示验证

演示模式端到端操作通过同一HTTP后端和SQLite。只有输入读数、模拟设备回执属于仿真。演示任务和日志明确以demo来源呈现；任何对外效果数据都应另以实物、日志和同条件试验验证。
