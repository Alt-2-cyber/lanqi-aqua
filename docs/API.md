# 两端共用接口 v1

默认开发API http://127.0.0.1:4300；Web开发端口5173通过Vite代理/api。所有时间为ISO 8601带时区字符串。演示数据属于模拟养殖场，与项目真实现场无关。所有请求/响应JSON，失败 `{error:string}`。

## 身份

- `GET /api/health` -> `{ok:true,mode:"demo"|"live",version:"1.0.0"}` 不需登录。
- `GET /api/auth/me` -> `{user:{id:string,name:string,role:"admin"},mode:string}`；未登录401。
- `POST /api/auth/demo` body `{}` -> `{user,token:string,mode:"demo"}`。仅DEMO_MODE=true启用。Web使用服务器自动设置的HttpOnly cookie；Harmony使用返回token以 `Authorization: Bearer <token>` 访问。演示用户“演示管理员”。
- `POST /api/auth/login` body `{username,password}` -> `{user,token,mode}`；真实模式使用环境配置的账号密码。
- `POST /api/auth/logout` -> `{ok:true}` 清除会话。

## 全量状态

`GET /api/snapshot`（需登录）返回以下结构。Web每5秒刷新，移动端手动和每10秒刷新。API是真实共享后端，Web与App操作互相可见；demo模式的设备回执由模拟器产生。

```ts
interface User { id:string; name:string; role:'admin' }
interface HistoryPoint { time:string; temperature:number; oxygen:number; ph:number }
interface Pond {
  id:string; name:string; areaMu:number; species:string; batch:string; location:string;
  status:'normal'|'warning'|'offline'; waterTemperature:number; dissolvedOxygen:number;
  ph:number; turbidity:number; waterLevel:number; updatedAt:string; history:HistoryPoint[];
  availableMetrics?:string[]; // fresh measured metrics only; missing means show—, not 0
}
interface Device {
  id:string; name:string; pondId:string; type:'aerator'|'pump'|'feeder'|'sensor';
  state:'on'|'off'|'offline'; online:boolean; auto:boolean; updatedAt:string;
}
interface Alert {
  id:string; pondId:string; deviceId:string; metric:string;
  severity:'warning'|'critical'; status:'open'|'acknowledged'|'resolved';
  title:string; description:string; createdAt:string;
  acknowledgedAt:string|null; resolvedAt:string|null; operator:string|null;
}
interface Command {
  id:string; deviceId:string; action:'on'|'off';
  status:'pending'|'succeeded'|'failed'|'expired'; createdAt:string;
  finishedAt:string|null; operator:string; error:string|null; idempotencyKey:string;
}
interface FeedTask {
  id:string; pondId:string; amountKg:number; scheduledAt:string; createdAt:string;
  status:'scheduled'|'completed'|'cancelled'; operator:string;
}
interface AuditEvent {
  id:string; type:string; title:string; detail:string; createdAt:string;
  operator:string; source:'demo'|'device'|'user';
}
interface Settings { siteName:string; operator:string; refreshSeconds:number }
interface Snapshot {
  mode:'demo'|'live'; generatedAt:string; site:{name:string;location:string};
  ponds:Pond[]; devices:Device[]; alerts:Alert[]; commands:Command[];
  feedTasks:FeedTask[]; events:AuditEvent[]; settings:Settings;
}
```

稳定演示ID：pond-1 青波一号塘（草鱼/鲢鱼）、pond-2 清溪二号塘（鲤鱼）、pond-3 荷风三号塘（鲫鱼）、pond-4 溪南育苗塘（鱼苗）。设备见snapshot，不硬编码设备数量。metric值 oxygen/temperature/ph/turbidity/waterLevel。UI按source/mode明示模拟状态。

## 用户操作

- `POST /api/devices/:id/commands` `{action:"on"|"off",idempotencyKey:string}` -> HTTP202 `{command:Command}`。重复同key不重复执行（相同请求返回原结果）；离线设备409；sensor不可开关。必须显示“等待回执”，不能直接将设备切为成功。demo约1.4秒回执，live等待真实网关。互斥pending返回409。
- `PATCH /api/alerts/:id` `{status:"acknowledged"|"resolved"}` -> `{alert:Alert}`。仅允许open->acknowledged->resolved，跳跃/逆转409。
- `POST /api/feed-tasks` `{pondId,amountKg:number,scheduledAt:ISO}` -> HTTP201 `{task:FeedTask}`。0<amountKg<=500；过去时间拒绝（允许1分钟时差）。
- `PATCH /api/feed-tasks/:id` `{status:"completed"|"cancelled"}` -> `{task:FeedTask}`；终态不可修改。任务完成是人工记录，不表示称量验证成功。
- `POST /api/ponds` `{name,areaMu:number,species,location}` -> HTTP201 `{pond:Pond}`。新塘默认offline，读数为0且updatedAt为1970-01-01，UI离线时显示“—”。
- `POST /api/devices` `{name,pondId,type:"aerator"|"pump"|"feeder"|"sensor"}` ->HTTP201 `{device:Device}`；初始offline，网关心跳后上线。
- `PATCH /api/settings` `{siteName,operator,refreshSeconds:number}` -> `{settings:Settings}`，refreshSeconds 3..60。
- `GET /api/export/observations.csv?pondId=pond-1` -> CSV下载；需登录，中文UTF8 BOM。支持全部塘口，避免导出公式注入。
- `POST /api/demo/scenarios` `{pondId,scenario:"low-oxygen"|"recover"}` -> `{ok:true}`；仅演示模式开放。异常写入共享状态并产生告警，恢复更新读数但保留人工处理流程。

## 真实网关（使用DEVICE_INGEST_TOKEN独立鉴权，不接受用户会话）

- `POST /api/gateway/observations` `{sampleId,deviceId,pondId,metric,value,unit,ts,quality:"valid"|"invalid"}`。
- `POST /api/gateway/heartbeat` `{deviceId,state:"on"|"off"}` -> `{ok:true}` 更新设备实际状态和在线时间；5分钟无更新判离线。
- `GET /api/gateway/commands?deviceId=...` -> `{commands:Command[]}` 仅未过期pending。
- `POST /api/gateway/receipts` `{commandId,deviceId,result:"succeeded"|"failed",actualState:"on"|"off",reason?:string}`。

设备ID必须已注册且塘口匹配；无效、重复、过期观测不能覆盖较新有效值，时序按塘口各指标分别判断。Pond.availableMetrics表示5分钟内有效上报的指标；氧、温度、pH均新鲜后塘口状态normal（仅表示观测在线，不是风险诊断），任一缺测或过期状态offline。未上报的浊度或水位显示—。TTL到期不再派发，指令成功只能由合法设备回执确认。演示与真实运行使用不同数据库文件，禁止把模拟数据写成现场实测。
