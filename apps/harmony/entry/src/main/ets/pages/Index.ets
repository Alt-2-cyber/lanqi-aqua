import preferences from '@ohos.data.preferences';
import common from '@ohos.app.ability.common';
import { ApiClient, ApiError } from '../service/ApiClient';
import { Alert, AuditEvent, Command, Device, FeedTask, Pond, Snapshot, emptyPond, emptySnapshot } from '../model/Models';
import { WaterTrend } from '../components/WaterTrend';

@Entry
@Component
struct Index {
  @State private tab: number = 0;
  @State private snapshot: Snapshot = emptySnapshot();
  @State private selectedPondId: string = '';
  @State private signedIn: boolean = false;
  @State private userName: string = '';
  @State private loading: boolean = false;
  @State private refreshing: boolean = false;
  @State private busy: boolean = false;
  @State private errorMessage: string = '';
  @State private successMessage: string = '';
  @State private baseUrl: string = 'http://127.0.0.1:4300';
  @State private addressDraft: string = 'http://127.0.0.1:4300';
  @State private refreshSeconds: number = 10;
  @State private refreshDraft: string = '10';
  @State private showConnection: boolean = false;
  @State private username: string = '';
  @State private password: string = '';
  @State private feedAmount: string = '20';
  @State private feedMinutes: string = '10';
  @State private feedVisible: boolean = false;
  @State private activeAlertOnly: boolean = true;
  @StorageLink('aquaForeground') @Watch('foregroundChanged') private foreground: boolean = true;
  private api: ApiClient = new ApiClient();
  private store?: preferences.Preferences;
  private pollTimer: number = -1;
  private receiptTimer: number = -1;
  private pageVisible: boolean = true;
  private sessionEpoch: number = 0;
  private requestKeys: Map<string, string> = new Map<string, string>();

  aboutToAppear(): void {
    this.loadConfiguration().catch(() => {
      this.errorMessage = '本地设置暂时无法读取，可继续使用默认地址';
    });
  }

  aboutToDisappear(): void {
    this.pageVisible = false;
    this.stopPolling();
  }

  onPageShow(): void {
    this.pageVisible = true;
    this.startPolling();
  }

  onPageHide(): void {
    this.pageVisible = false;
    this.stopPolling();
  }

  private foregroundChanged(): void {
    if (this.foreground) {
      this.startPolling();
      if (this.signedIn) { this.refresh(); }
    } else {
      this.stopPolling();
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      this.store = await preferences.getPreferences(this.getUIContext().getHostContext() as common.UIAbilityContext, 'lanqi_connection_v1');
      this.baseUrl = await this.store.get('baseUrl', 'http://127.0.0.1:4300') as string;
      const interval = await this.store.get('refreshSeconds', 10) as number;
      this.refreshSeconds = Number.isInteger(interval) && interval >= 3 && interval <= 60 ? interval : 10;
      this.addressDraft = this.baseUrl;
      this.refreshDraft = this.refreshSeconds.toString();
      this.api.baseUrl = this.baseUrl;
    } catch (_error) {
      this.errorMessage = '本地设置暂时无法读取，可继续使用默认地址';
    }
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.signedIn || !this.pageVisible || !this.foreground) { return; }
    this.pollTimer = setInterval(() => this.refresh(), this.refreshSeconds * 1000);
  }

  private stopPolling(): void {
    if (this.pollTimer >= 0) { clearInterval(this.pollTimer); this.pollTimer = -1; }
    if (this.receiptTimer >= 0) { clearTimeout(this.receiptTimer); this.receiptTimer = -1; }
  }

  private notify(message: string): void {
    this.successMessage = message;
    try { this.getUIContext().getPromptAction().showToast({ message: message, duration: 2200 }); }
    catch (_error) { /* The operation already succeeded; toast availability does not affect it. */ }
  }

  private fail(error: Error): void {
    if (error instanceof ApiError && error.status === 401) {
      this.resetSession();
      this.errorMessage = '登录已过期，请重新登录';
      return;
    }
    this.errorMessage = error.message || '操作未完成，请重试';
  }

  private resetSession(): void {
    this.sessionEpoch++;
    this.signedIn = false;
    this.api.token = '';
    this.snapshot = emptySnapshot();
    this.userName = '';
    this.password = '';
    this.selectedPondId = '';
    this.requestKeys.clear();
    this.stopPolling();
  }

  private async signIn(demo: boolean): Promise<void> {
    if (this.busy) { return; }
    if (!demo && (!this.username.trim() || !this.password)) {
      this.errorMessage = '请输入账号和密码';
      return;
    }
    this.busy = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      this.api.baseUrl = this.baseUrl;
      const auth = demo ? await this.api.demoLogin() : await this.api.login(this.username.trim(), this.password);
      this.userName = auth.user.name;
      this.password = '';
      this.signedIn = true;
      this.sessionEpoch++;
      await this.refresh();
      this.startPolling();
    } catch (error) {
      this.fail(error as Error);
    } finally {
      this.busy = false;
    }
  }

  private async refresh(): Promise<void> {
    if (!this.signedIn || this.loading) { this.refreshing = false; return; }
    const epoch = this.sessionEpoch;
    this.loading = true;
    try {
      const next = await this.api.snapshot();
      if (epoch !== this.sessionEpoch) { return; }
      this.snapshot = next;
      if (!next.ponds.some((pond: Pond) => pond.id === this.selectedPondId)) {
        this.selectedPondId = next.ponds.length > 0 ? next.ponds[0].id : '';
      }
      this.errorMessage = '';
    } catch (error) {
      if (epoch === this.sessionEpoch) { this.fail(error as Error); }
    } finally {
      this.loading = false;
      this.refreshing = false;
    }
  }

  private async saveConfiguration(): Promise<void> {
    let address = this.addressDraft.trim();
    while (address.endsWith('/')) { address = address.substring(0, address.length - 1); }
    if (!/^https?:\/\/[^\s/?#]+(?::\d+)?$/.test(address)) {
      this.errorMessage = '请输入完整服务地址，例如 http://192.168.1.8:4300，不含 /api';
      return;
    }
    const interval = Number(this.refreshDraft);
    if (!Number.isInteger(interval) || interval < 3 || interval > 60) {
      this.errorMessage = '刷新间隔应为 3–60 秒的整数';
      return;
    }
    this.busy = true;
    try {
      if (!this.store) {
        this.store = await preferences.getPreferences(this.getUIContext().getHostContext() as common.UIAbilityContext, 'lanqi_connection_v1');
      }
      await this.store.put('baseUrl', address);
      await this.store.put('refreshSeconds', interval);
      await this.store.flush();
      if (address !== this.baseUrl) { this.resetSession(); }
      this.baseUrl = address;
      this.addressDraft = address;
      this.api.baseUrl = address;
      this.refreshSeconds = interval;
      this.showConnection = false;
      this.errorMessage = '';
      this.startPolling();
      this.notify('连接设置已保存');
    } catch (_error) {
      this.errorMessage = '设置保存失败，请重试';
    } finally { this.busy = false; }
  }

  private async signOut(): Promise<void> {
    if (this.busy) { return; }
    this.busy = true;
    this.stopPolling();
    try {
      await this.api.logout();
      this.errorMessage = '';
    } catch (_error) {
      this.errorMessage = '已清除本机登录；服务端注销未确认，会话将按服务端期限过期';
    } finally {
      this.resetSession();
      this.busy = false;
    }
  }

  private currentPond(): Pond {
    const pond = this.snapshot.ponds.find((item: Pond) => item.id === this.selectedPondId);
    return pond ? pond : emptyPond();
  }

  private pondName(id: string): string {
    const pond = this.snapshot.ponds.find((item: Pond) => item.id === id);
    return pond ? pond.name : '未分配塘口';
  }

  private pondDevices(): Device[] {
    return this.snapshot.devices.filter((device: Device) => device.pondId === this.selectedPondId);
  }

  private visibleAlerts(): Alert[] {
    return this.snapshot.alerts.filter((alert: Alert) => !this.activeAlertOnly || alert.status !== 'resolved');
  }

  private openAlertCount(): number {
    return this.snapshot.alerts.filter((alert: Alert) => alert.status !== 'resolved').length;
  }

  private pendingFor(id: string): boolean {
    return this.snapshot.commands.some((command: Command) => command.deviceId === id && command.status === 'pending');
  }

  private latestCommand(id: string): Command | undefined {
    return this.snapshot.commands.filter((command: Command) => command.deviceId === id)
      .sort((first: Command, second: Command) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
  }

  private commandText(id: string): string {
    const command = this.latestCommand(id);
    if (!command) { return '暂无操作记录'; }
    const action = command.action === 'on' ? '开启' : '关闭';
    if (command.status === 'pending') { return `${action}指令 · 等待回执`; }
    if (command.status === 'succeeded') { return `${action}指令 · 执行成功`; }
    if (command.status === 'expired') { return `${action}指令 · 已过期`; }
    return `${action}指令 · ${command.error || '执行失败'}`;
  }

  private async sendCommand(device: Device): Promise<void> {
    if (this.busy || !device.online || device.type === 'sensor' || this.pendingFor(device.id)) { return; }
    this.busy = true;
    this.errorMessage = '';
    const epoch = this.sessionEpoch;
    const action = device.state === 'on' ? 'off' : 'on';
    const attempt = `${device.id}:${action}`;
    let key = this.requestKeys.get(attempt);
    if (!key) {
      key = `harmony-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
      this.requestKeys.set(attempt, key);
    }
    try {
      const command = await this.api.command(device.id, action, key);
      if (epoch !== this.sessionEpoch) { return; }
      this.requestKeys.delete(attempt);
      this.snapshot.commands = [command].concat(this.snapshot.commands.filter((item: Command) => item.id !== command.id));
      this.snapshot = this.snapshot;
      this.notify(command.status === 'pending' ? '指令已受理，等待设备回执' : '已取得指令处理结果');
      await this.refresh();
      if (this.pageVisible && this.foreground && this.signedIn) {
        this.receiptTimer = setTimeout(() => {
          this.receiptTimer = -1;
          this.refresh();
        }, 2200);
      }
    } catch (error) {
      const failure = error as Error;
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        this.requestKeys.delete(attempt);
      }
      this.fail(failure);
    } finally { this.busy = false; }
  }

  private async updateAlert(alert: Alert): Promise<void> {
    if (this.busy || alert.status === 'resolved') { return; }
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.api.updateAlert(alert.id, alert.status === 'open' ? 'acknowledged' : 'resolved');
      this.notify(alert.status === 'open' ? '已确认告警，请核查并处理现场' : '告警已记录为解决');
      await this.refresh();
    } catch (error) { this.fail(error as Error); }
    finally { this.busy = false; }
  }

  private async createFeed(): Promise<void> {
    if (this.busy) { return; }
    const amount = Number(this.feedAmount);
    const minutes = Number(this.feedMinutes);
    if (!this.selectedPondId || !Number.isFinite(amount) || amount <= 0 || amount > 500 ||
      !Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      this.errorMessage = '请选择塘口，投喂量为 0–500 kg（不含0），计划时间为 1–10080 分钟后';
      return;
    }
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.api.createFeed(this.selectedPondId, amount, new Date(Date.now() + minutes * 60000).toISOString());
      this.notify('投喂任务已创建');
      await this.refresh();
    } catch (error) { this.fail(error as Error); }
    finally { this.busy = false; }
  }

  private async updateFeed(task: FeedTask, status: string): Promise<void> {
    if (this.busy || task.status !== 'scheduled') { return; }
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.api.updateFeed(task.id, status);
      this.notify(status === 'completed' ? '已记录人工完成，不代表实物称量验证' : '投喂任务已取消');
      await this.refresh();
    } catch (error) { this.fail(error as Error); }
    finally { this.busy = false; }
  }

  private time(value: string): string {
    if (!value || value.startsWith('1970')) { return '暂无采样'; }
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  private metricAvailable(metric: string): boolean {
    const pond = this.currentPond();
    if (pond.availableMetrics) { return pond.availableMetrics.indexOf(metric) >= 0; }
    return pond.status !== 'offline';
  }

  private reading(value: number, digits: number, metric: string): string {
    return !this.metricAvailable(metric) || !Number.isFinite(value) ? '—' : value.toFixed(digits);
  }

  private deviceType(type: string): string {
    if (type === 'aerator') { return '增氧机'; }
    if (type === 'pump') { return '水泵'; }
    if (type === 'feeder') { return '投喂机'; }
    return '传感器';
  }

  private deviceState(device: Device): string {
    if (!device.online || device.state === 'offline') { return '设备离线'; }
    return device.state === 'on' ? '运行中' : '已关闭';
  }

  @Builder
  private chip(text: string, color: string = '#14695e', background: string = '#e9f4ef') {
    Text(text).fontSize(11).fontWeight(FontWeight.Medium).fontColor(color)
      .padding({ left: 9, right: 9, top: 5, bottom: 5 }).backgroundColor(background).borderRadius(20)
  }

  @Builder
  private panelTitle(title: string, detail: string = '') {
    Row() {
      Text(title).fontSize(18).fontWeight(FontWeight.Bold).fontColor('#203e37').layoutWeight(1)
      if (detail) { Text(detail).fontSize(11).fontColor('#73867f') }
    }.width('100%').margin({ bottom: 14 })
  }

  @Builder
  private emptyPanel(title: string, detail: string) {
    Column({ space: 9 }) {
      Text('≈').fontSize(40).fontColor('#8ab7a8')
      Text(title).fontSize(17).fontWeight(FontWeight.Medium).fontColor('#39584e')
      Text(detail).fontSize(13).fontColor('#788b82').textAlign(TextAlign.Center).lineHeight(21)
    }.width('100%').padding(30).backgroundColor('#ffffff').borderRadius(18)
  }

  @Builder
  private messages() {
    if (this.errorMessage) {
      Column({ space: 9 }) {
        Text(this.errorMessage).fontSize(13).fontColor('#9d4b25').lineHeight(20).width('100%')
        if (this.signedIn) {
          Button('重新获取数据').fontSize(12).fontColor('#9d4b25').backgroundColor('#fff0e3')
            .height(32).enabled(!this.loading).onClick(() => this.refresh())
        }
      }.padding(14).width('100%').backgroundColor('#fff7ee').borderRadius(12).margin({ bottom: 12 })
    }
  }

  @Builder
  private connectionForm() {
    Column({ space: 12 }) {
      this.panelTitle('连接设置', '仅保存在本机')
      Text('后端服务地址').fontSize(13).fontColor('#4f685f').width('100%')
      TextInput({ text: this.addressDraft, placeholder: 'http://192.168.1.8:4300' })
        .type(InputType.Normal).fontSize(14).backgroundColor('#f2f6f3')
        .onChange((value: string) => this.addressDraft = value)
      Text('自动刷新间隔（3–60 秒）').fontSize(13).fontColor('#4f685f').width('100%')
      TextInput({ text: this.refreshDraft, placeholder: '10' }).type(InputType.Number)
        .backgroundColor('#f2f6f3').onChange((value: string) => this.refreshDraft = value)
      Text('真机请使用同一局域网内电脑的 IP。服务端需明确允许局域网访问；正式部署使用 HTTPS。')
        .fontSize(12).fontColor('#73867f').lineHeight(20).width('100%')
      Button('保存连接设置').width('100%').height(44).fontSize(14).backgroundColor('#14695e')
        .enabled(!this.busy).onClick(() => this.saveConfiguration())
      if (this.showConnection) {
        Button('收起').fontSize(13).fontColor('#678176').backgroundColor(Color.Transparent)
          .onClick(() => this.showConnection = false)
      }
    }.padding(20).backgroundColor('#ffffff').borderRadius(18).width('100%')
  }

  @Builder
  private loginPage() {
    Scroll() {
      Column({ space: 18 }) {
        Column({ space: 12 }) {
          Image($r('app.media.app_icon')).width(70).height(70).borderRadius(20)
          Text('澜启渔新').fontSize(32).fontWeight(FontWeight.Bold).fontColor('#173f35')
          Text('水有感知 · 养殖有数').fontSize(14).fontColor('#71877c')
        }.width('100%').padding({ top: 46, bottom: 20 })
        this.messages()
        Column({ space: 14 }) {
          this.panelTitle('连接你的养殖场')
          Text('演示账号使用模拟养殖数据，所有操作与 Web 管理端同步。')
            .fontSize(13).fontColor('#70847a').lineHeight(21).width('100%')
          Button(this.busy ? '正在连接…' : '进入演示养殖场').width('100%').height(48)
            .fontSize(16).fontWeight(FontWeight.Medium).backgroundColor('#14695e')
            .enabled(!this.busy).onClick(() => this.signIn(true))
          Row({ space: 10 }) {
            Divider().layoutWeight(1).color('#e3ebe5')
            Text('或使用服务端账号').fontSize(11).fontColor('#91a095')
            Divider().layoutWeight(1).color('#e3ebe5')
          }.margin({ top: 6, bottom: 2 })
          TextInput({ text: this.username, placeholder: '账号' }).fontSize(14).backgroundColor('#f2f6f3')
            .onChange((value: string) => this.username = value)
          TextInput({ text: this.password, placeholder: '密码' }).type(InputType.Password)
            .fontSize(14).backgroundColor('#f2f6f3').onChange((value: string) => this.password = value)
          Button('账号登录').width('100%').height(44).fontSize(14)
            .fontColor('#14695e').backgroundColor('#e8f2eb').enabled(!this.busy).onClick(() => this.signIn(false))
        }.width('100%').padding(22).backgroundColor('#ffffff').borderRadius(22)
        Row() {
          Column({ space: 4 }) {
            Text('当前服务').fontSize(11).fontColor('#8a9a90')
            Text(this.baseUrl).fontSize(12).fontColor('#587365').maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Button('设置').fontSize(13).fontColor('#14695e').backgroundColor('#e7f0e9')
            .onClick(() => this.showConnection = !this.showConnection)
        }.width('100%').padding({ left: 5, right: 5 })
        if (this.showConnection) { this.connectionForm() }
        Text('澜启渔新 · 开源水产养殖协同平台').fontSize(11).fontColor('#98a89d').margin({ bottom: 24 })
      }.padding({ left: 22, right: 22 }).width('100%').constraintSize({ maxWidth: 560 })
    }.width('100%').height('100%').scrollBar(BarState.Off).backgroundColor('#f3f7f4')
  }

  @Builder
  private header() {
    Column({ space: 11 }) {
      Row({ space: 10 }) {
        Image($r('app.media.app_icon')).width(34).height(34).borderRadius(10)
        Column({ space: 1 }) {
          Text('澜启渔新').fontSize(20).fontWeight(FontWeight.Bold).fontColor('#173f35')
          Text('LANQI AQUA').fontSize(8).letterSpacing(2).fontColor('#83998a')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        this.chip(this.snapshot.mode === 'demo' ? '模拟演示' : (this.snapshot.mode === 'live' ? '真实服务' : '连接中'),
          this.snapshot.mode === 'demo' ? '#9c6834' : '#14695e', this.snapshot.mode === 'demo' ? '#faf0df' : '#e9f4ef')
      }.width('100%')
      Row() {
        Text(this.snapshot.site.name).fontSize(12).fontColor('#74867b').layoutWeight(1)
        Text(this.loading ? '正在同步…' : `${this.time(this.snapshot.generatedAt)} 更新`)
          .fontSize(10).fontColor('#839589')
        Button('刷新').fontSize(11).height(26).fontColor('#14695e').backgroundColor(Color.Transparent)
          .enabled(!this.loading).onClick(() => this.refresh())
      }.width('100%')
    }.width('100%').padding({ left: 22, right: 20, top: 14, bottom: 12 }).backgroundColor('#ffffff')
  }

  @Builder
  private pondSelector() {
    Scroll() {
      Row({ space: 8 }) {
        ForEach(this.snapshot.ponds, (pond: Pond) => {
          Button(pond.name).height(35).fontSize(12)
            .fontColor(pond.id === this.selectedPondId ? '#ffffff' : '#60796c')
            .backgroundColor(pond.id === this.selectedPondId ? '#14695e' : '#e8efea')
            .onClick(() => this.selectedPondId = pond.id)
        }, (pond: Pond) => pond.id)
      }
    }.width('100%').scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).margin({ bottom: 16 })
  }

  @Builder
  private metricCard(label: string, value: string, unit: string, color: string = '#1e5143') {
    Column({ space: 9 }) {
      Text(label).fontSize(12).fontColor('#7c9082').width('100%')
      Row({ space: 5 }) {
        Text(value).fontSize(31).fontWeight(FontWeight.Medium).fontColor(color).fontFamily('monospace')
        Text(unit).fontSize(11).fontColor('#8b9a8f').margin({ top: 13 })
      }.width('100%')
    }.layoutWeight(1).padding(17).backgroundColor('#ffffff').borderRadius(16)
  }

  @Builder
  private monitoringPage() {
    this.pondSelector()
    if (this.snapshot.ponds.length === 0) {
      this.emptyPanel('等待第一个塘口', '请在 Web 管理端添加塘口并注册设备，接入数据后即可在此监测。')
    } else {
      Column({ space: 12 }) {
        Column({ space: 15 }) {
          Row() {
            Column({ space: 5 }) {
              Text(this.currentPond().name).fontSize(25).fontWeight(FontWeight.Bold).fontColor('#ffffff')
              Text(`${this.currentPond().species}  /  ${this.currentPond().areaMu} 亩`).fontSize(12).fontColor('#b5d9c8')
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            this.chip(this.currentPond().status === 'offline' ? '离线' : this.currentPond().status === 'warning' ? '需关注' :
              this.snapshot.mode === 'live' ? '观测在线' : '水质正常',
              '#ffffff', this.currentPond().status === 'warning' ? '#a97843' : '#337d69')
          }.width('100%')
          Row() {
            Text('≈').fontSize(52).fontColor('#66baa2')
            Column({ space: 5 }) {
              Text(this.currentPond().location).fontSize(11).fontColor('#c5e2d3')
              Text(`最近采样  ${this.time(this.currentPond().updatedAt)}`).fontSize(10).fontColor('#a3cbb5')
            }.alignItems(HorizontalAlign.End).layoutWeight(1)
          }.width('100%')
        }.width('100%').padding(22).backgroundColor('#195e4d').borderRadius(22)
        Row({ space: 12 }) {
          this.metricCard('溶解氧', this.reading(this.currentPond().dissolvedOxygen, 1, 'oxygen'), 'mg/L',
            this.snapshot.mode === 'demo' && this.metricAvailable('oxygen') && this.currentPond().dissolvedOxygen < 4 ? '#b56c31' : '#1e5143')
          this.metricCard('水温', this.reading(this.currentPond().waterTemperature, 1, 'temperature'), '°C')
        }.width('100%')
        Row({ space: 12 }) {
          this.metricCard('pH 酸碱度', this.reading(this.currentPond().ph, 1, 'ph'), '')
          this.metricCard('水体浊度', this.reading(this.currentPond().turbidity, 0, 'turbidity'), 'NTU')
        }.width('100%')
        Column({ space: 8 }) {
          this.panelTitle('溶氧变化', 'mg/L · 自适应刻度')
          if (this.metricAvailable('oxygen') && this.currentPond().history.length > 1) {
            WaterTrend({ points: this.currentPond().history })
            Row() {
              Text(this.time(this.currentPond().history[0].time)).fontSize(10).fontColor('#8b9b90')
              Blank()
              Text(this.time(this.currentPond().history[this.currentPond().history.length - 1].time)).fontSize(10).fontColor('#8b9b90')
            }.width('100%')
          } else {
            Text('等待有效历史采样').fontSize(13).fontColor('#8b9b90').height(100)
          }
          Divider().color('#edf1eb')
          Row() {
            Text('水位').fontSize(12).fontColor('#7d9082')
            Blank()
            Text(`${this.reading(this.currentPond().waterLevel, 2, 'waterLevel')} m`).fontSize(15).fontColor('#2f5a46')
          }.width('100%').margin({ top: 8 })
        }.width('100%').padding(20).backgroundColor('#ffffff').borderRadius(18)
        Button('查看本塘设备与回执 →').height(44).width('100%').fontSize(14)
          .fontColor('#14695e').backgroundColor('#e5f0e8').onClick(() => this.tab = 1)
        Text(this.snapshot.mode === 'demo' ? '当前读数为模拟数据，用于演示与联调。' : '读数来源于后端接收的设备观测，请结合采样时间核查。')
          .fontSize(11).fontColor('#8b9d90').lineHeight(18).width('100%')
      }.width('100%')
    }
  }

  @Builder
  private deviceCard(device: Device) {
    Column({ space: 14 }) {
      Row({ space: 12 }) {
        Text(device.type === 'sensor' ? '◉' : '↻').fontSize(26).fontColor('#42846c')
          .width(48).height(48).textAlign(TextAlign.Center).backgroundColor('#edf5ef').borderRadius(14)
        Column({ space: 6 }) {
          Text(device.name).fontSize(16).fontWeight(FontWeight.Medium).fontColor('#294e3e')
          Text(`${this.deviceType(device.type)} · ${device.auto ? '自动模式' : '手动模式'}`).fontSize(11).fontColor('#8a9b8e')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        this.chip(this.deviceState(device), device.online ? '#3f7c5b' : '#91998f', device.online ? '#eaf4ea' : '#eff0eb')
      }.width('100%')
      Divider().color('#edf1eb')
      Row({ space: 10 }) {
        Column({ space: 4 }) {
          Text(this.commandText(device.id)).fontSize(12)
            .fontColor(this.pendingFor(device.id) ? '#ab7635' : '#738977').maxLines(2)
          Text(`设备更新 ${this.time(device.updatedAt)}`).fontSize(10).fontColor('#9aaa9d')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
        if (device.type !== 'sensor') {
          Button(this.pendingFor(device.id) ? '等待回执' : device.state === 'on' ? '关闭设备' : '开启设备')
            .fontSize(12).height(36).fontColor(device.state === 'on' ? '#63836a' : '#ffffff')
            .backgroundColor(this.pendingFor(device.id) || !device.online ? '#e4e9e0' : device.state === 'on' ? '#eaf2e7' : '#14695e')
            .enabled(!this.busy && device.online && !this.pendingFor(device.id))
            .onClick(() => this.sendCommand(device))
        }
      }.width('100%')
    }.padding(18).width('100%').backgroundColor('#ffffff').borderRadius(18).margin({ bottom: 12 })
  }

  @Builder
  private devicesPage() {
    this.panelTitle('设备管理', `${this.pondDevices().length} 台设备`)
    this.pondSelector()
    Text('指令受理后等待设备回执，实际状态以服务端回执为准。')
      .fontSize(12).fontColor('#7f9281').lineHeight(20).width('100%').margin({ bottom: 16 })
    if (this.pondDevices().length === 0) {
      this.emptyPanel('暂无设备', '请在服务端注册本塘设备后刷新。')
    }
    ForEach(this.pondDevices(), (device: Device) => { this.deviceCard(device) }, (device: Device) => device.id)
  }

  @Builder
  private alertCard(alert: Alert) {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        this.chip(alert.severity === 'critical' ? '紧急' : '预警', alert.severity === 'critical' ? '#b44b39' : '#a57130',
          alert.severity === 'critical' ? '#fae9e2' : '#faf0dd')
        Text(this.pondName(alert.pondId)).fontSize(12).fontColor('#82917f').layoutWeight(1)
        Text(alert.status === 'open' ? '待确认' : alert.status === 'acknowledged' ? '处理中' : '已解决')
          .fontSize(11).fontColor('#7e9b7a')
      }.width('100%')
      Text(alert.title).fontSize(17).fontWeight(FontWeight.Medium).fontColor('#3c4f37').width('100%')
      Text(alert.description).fontSize(13).fontColor('#88907d').lineHeight(21).width('100%')
      Row() {
        Text(this.time(alert.createdAt)).fontSize(10).fontColor('#9ca48f').layoutWeight(1)
        if (alert.status !== 'resolved') {
          Button(alert.status === 'open' ? '确认告警' : '记录解决').fontSize(12).height(34)
            .backgroundColor(alert.status === 'open' ? '#b48347' : '#14695e').enabled(!this.busy)
            .onClick(() => this.updateAlert(alert))
        }
      }.width('100%')
      if (alert.operator) { Text(`处理人：${alert.operator}`).fontSize(10).fontColor('#94a18a').width('100%') }
    }.padding(18).width('100%').backgroundColor('#ffffff').borderRadius(18).margin({ bottom: 12 })
  }

  @Builder
  private alertsPage() {
    this.panelTitle('告警中心', `${this.openAlertCount()} 条待处理`)
    Row({ space: 8 }) {
      Button('待处理').fontSize(12).height(34).fontColor(this.activeAlertOnly ? '#ffffff' : '#68816b')
        .backgroundColor(this.activeAlertOnly ? '#14695e' : '#e8efdf').onClick(() => this.activeAlertOnly = true)
      Button('全部记录').fontSize(12).height(34).fontColor(!this.activeAlertOnly ? '#ffffff' : '#68816b')
        .backgroundColor(!this.activeAlertOnly ? '#14695e' : '#e8efdf').onClick(() => this.activeAlertOnly = false)
    }.width('100%').margin({ bottom: 16 })
    if (this.visibleAlerts().length === 0) {
      this.emptyPanel('一切井然有序', '当前没有待处理告警，继续保持巡塘与设备检查。')
    }
    ForEach(this.visibleAlerts(), (alert: Alert) => { this.alertCard(alert) }, (alert: Alert) => alert.id)
  }

  @Builder
  private feedCard(task: FeedTask) {
    Column({ space: 10 }) {
      Row() {
        Text(this.pondName(task.pondId)).fontSize(14).fontWeight(FontWeight.Medium).fontColor('#395434').layoutWeight(1)
        this.chip(task.status === 'scheduled' ? '待投喂' : task.status === 'completed' ? '人工完成' : '已取消')
      }.width('100%')
      Row() {
        Text(`${task.amountKg} kg`).fontSize(23).fontWeight(FontWeight.Medium).fontColor('#29572f').layoutWeight(1)
        Text(this.time(task.scheduledAt)).fontSize(12).fontColor('#8c9c7f')
      }.width('100%')
      if (task.status === 'scheduled') {
        Row({ space: 10 }) {
          Button('记录人工完成').fontSize(12).height(34).backgroundColor('#14695e')
            .enabled(!this.busy).onClick(() => this.updateFeed(task, 'completed'))
          Button('取消任务').fontSize(12).height(34).fontColor('#829376').backgroundColor('#eff3e8')
            .enabled(!this.busy).onClick(() => this.updateFeed(task, 'cancelled'))
        }.width('100%')
      }
    }.padding(16).width('100%').backgroundColor('#f6f9f0').borderRadius(12).margin({ top: 10 })
  }

  @Builder
  private feedSection() {
    Column({ space: 12 }) {
      this.panelTitle('投喂任务', '完成仅为人工记录')
      this.pondSelector()
      Row({ space: 10 }) {
        Column({ space: 6 }) {
          Text('投喂量 / kg').fontSize(11).fontColor('#8d9d7c').width('100%')
          TextInput({ text: this.feedAmount, placeholder: '20' }).type(InputType.Number).backgroundColor('#f1f5e9')
            .onChange((value: string) => this.feedAmount = value)
        }.layoutWeight(1)
        Column({ space: 6 }) {
          Text('多少分钟后').fontSize(11).fontColor('#8d9d7c').width('100%')
          TextInput({ text: this.feedMinutes, placeholder: '10' }).type(InputType.Number).backgroundColor('#f1f5e9')
            .onChange((value: string) => this.feedMinutes = value)
        }.layoutWeight(1)
      }.width('100%')
      Button('创建投喂任务').fontSize(14).width('100%').height(42).backgroundColor('#14695e')
        .enabled(!this.busy && this.snapshot.ponds.length > 0).onClick(() => this.createFeed())
      Text('“人工完成”不表示已由实物称量或投喂设备验证。').fontSize(11).fontColor('#96a184').lineHeight(18).width('100%')
      ForEach(this.snapshot.feedTasks, (task: FeedTask) => { this.feedCard(task) }, (task: FeedTask) => task.id)
      if (this.snapshot.feedTasks.length === 0) { Text('暂无投喂任务').fontSize(12).fontColor('#9baa86').padding(14) }
    }.padding(18).width('100%').backgroundColor('#ffffff').borderRadius(18)
  }

  @Builder
  private myPage() {
    Column({ space: 16 }) {
      Row({ space: 14 }) {
        Text('澜').fontSize(22).fontWeight(FontWeight.Medium).fontColor('#ffffff')
          .width(54).height(54).textAlign(TextAlign.Center).backgroundColor('#337c64').borderRadius(18)
        Column({ space: 6 }) {
          Text(this.userName).fontSize(19).fontWeight(FontWeight.Bold).fontColor('#264c33')
          Text('管理员 · 本次会话已登录').fontSize(12).fontColor('#859c79')
        }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      }.width('100%').padding(20).backgroundColor('#ffffff').borderRadius(18)
      Column({ space: 14 }) {
        this.panelTitle('应用设置')
        Row() {
          Column({ space: 6 }) {
            Text('服务地址').fontSize(13).fontColor('#648254')
            Text(this.baseUrl).fontSize(11).fontColor('#92a184').maxLines(2)
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Button('修改').fontSize(12).height(32).fontColor('#14695e').backgroundColor('#eaf1e2')
            .onClick(() => this.showConnection = !this.showConnection)
        }.width('100%')
        Divider().color('#edf1e5')
        Row() {
          Text('自动同步').fontSize(13).fontColor('#648254').layoutWeight(1)
          Text(`每 ${this.refreshSeconds} 秒`).fontSize(12).fontColor('#8ea07d')
        }.width('100%')
        Button(this.feedVisible ? '收起投喂任务 ↑' : `投喂任务 · ${this.snapshot.feedTasks.length} 条 →`)
          .width('100%').fontSize(14).fontColor('#14695e').height(44).backgroundColor('#eef4e7')
          .onClick(() => this.feedVisible = !this.feedVisible)
      }.padding(20).width('100%').backgroundColor('#ffffff').borderRadius(18)
      if (this.showConnection) { this.connectionForm() }
      if (this.feedVisible) { this.feedSection() }
      Column({ space: 11 }) {
        this.panelTitle('最近动态', '共享操作记录')
        ForEach(this.snapshot.events.slice(0, 6), (event: AuditEvent) => {
          Column({ space: 6 }) {
            Row() {
              Text(event.title).fontSize(13).fontColor('#5a7649').layoutWeight(1).maxLines(2)
              Text(event.source === 'demo' ? '模拟' : event.source === 'device' ? '设备' : '人工')
                .fontSize(10).fontColor('#a0ae8d')
            }.width('100%')
            Text(event.detail).fontSize(11).fontColor('#8d9f7a').lineHeight(18).width('100%')
            Text(`${this.time(event.createdAt)} · ${event.operator}`).fontSize(10).fontColor('#a6b293').width('100%')
            Divider().color('#edf1e5').margin({ top: 6 })
          }.width('100%')
        }, (event: AuditEvent) => event.id)
        if (this.snapshot.events.length === 0) { Text('暂无操作记录').fontSize(12).fontColor('#a0ad90').padding(12) }
      }.padding(20).width('100%').backgroundColor('#ffffff').borderRadius(18)
      Button('退出登录').width('100%').height(44).fontSize(14).fontColor('#a17d57').backgroundColor('#f4eee3')
        .enabled(!this.busy).onClick(() => this.signOut())
      Text('澜启渔新 1.0.0 · Apache-2.0\n原生 ArkUI · 开源水产养殖协同平台')
        .fontSize(10).fontColor('#a3b08f').textAlign(TextAlign.Center).lineHeight(19).margin({ top: 6 })
    }.width('100%')
  }

  @Builder
  private navItem(index: number, icon: string, title: string) {
    Column({ space: 4 }) {
      Text(icon).fontSize(22).fontWeight(FontWeight.Medium).fontColor(this.tab === index ? '#14695e' : '#9aa994')
      Text(title).fontSize(11).fontColor(this.tab === index ? '#14695e' : '#94a58b')
    }.layoutWeight(1).height(56).justifyContent(FlexAlign.Center)
      .backgroundColor(this.tab === index ? '#f2f7ed' : '#ffffff').borderRadius(14)
      .accessibilityText(title).onClick(() => this.tab = index)
  }

  build() {
    if (!this.signedIn) {
      this.loginPage()
    } else {
      Column() {
        this.header()
        Refresh({ refreshing: $$this.refreshing }) {
          Scroll() {
            Column() {
              this.messages()
              if (this.tab === 0) { this.monitoringPage() }
              else if (this.tab === 1) { this.devicesPage() }
              else if (this.tab === 2) { this.alertsPage() }
              else { this.myPage() }
            }.padding({ left: 18, right: 18, top: 18, bottom: 24 }).width('100%').constraintSize({ maxWidth: 650 })
          }.width('100%').height('100%').scrollBar(BarState.Off)
        }.layoutWeight(1).width('100%').onRefreshing(() => this.refresh())
        Row({ space: 5 }) {
          this.navItem(0, '≈', '监测')
          this.navItem(1, '◉', '设备')
          this.navItem(2, '!', this.openAlertCount() > 0 ? `告警 ${this.openAlertCount()}` : '告警')
          this.navItem(3, '○', '我的')
        }.width('100%').padding({ left: 16, right: 16, top: 7, bottom: 8 }).backgroundColor('#ffffff')
      }.width('100%').height('100%').backgroundColor('#f3f7f1')
    }
  }
}
