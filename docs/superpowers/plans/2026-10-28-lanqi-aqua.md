# 澜启渔新双端实现计划

**目标**：完整可运行Web、原生鸿蒙App、共享API，公开上传GitHub。
**设计**：[设计约定](../specs/2026-10-28-lanqi-aqua-design.md)，[API](../../API.md)。
**约束**：Node24；API12；新代码不含旧签名；显式演示标识；动作等待回执；用户已授权公开推送。

1. [x] 确定隔离目录、用户授权、接口契约和视觉方向；GitHub凭据已读验证。
2. [x] API：services/api/src/{app,store,seed,auth,index}.ts；test/api.test.ts，先用HTTP用例验证401、幂等、状态机、真实回执与持久性。
3. [x] Web：apps/web；按API契约实现所有页面和表单，错误与pending可见；桌面/手机布局。
4. [x] 鸿蒙：apps/harmony；原生ArkTS界面与HTTP客户端，私密签名不进入仓库；SDK编译。
5. [x] 集成：安装锁定依赖，build/check/test；真实浏览器走通登录、选择塘口、设备、告警、任务、导出，检查窄屏与错误日志。
6. [x] 发布准备：README、API、安装和治理文档、CI和许可证、公开文件检查完成；公开仓库已创建，发布时核对远端文件树与自动构建。

任务2、3、4只通过固定API交互，目录所有权不重叠，可按dispatching-parallel-agents技能独立推进。主Agent负责根目录、API、整体验证和Git；Web与鸿蒙实现者仅修改各自apps子目录，不自行提交或上传。
