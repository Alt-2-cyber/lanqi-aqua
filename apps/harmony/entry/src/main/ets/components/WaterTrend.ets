import { HistoryPoint } from '../model/Models';

@Component
export struct WaterTrend {
  @Prop @Watch('draw') points: HistoryPoint[] = [];
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private chartWidth: number = 300;

  private draw(): void {
    const width = this.chartWidth;
    const height = 136;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e8efeb';
    for (let i = 0; i < 4; i++) {
      const y = 12 + i * 36;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    if (this.points.length < 2) { return; }
    let minValue = this.points[0].oxygen;
    let maxValue = minValue;
    this.points.forEach((point: HistoryPoint) => {
      minValue = Math.min(minValue, point.oxygen);
      maxValue = Math.max(maxValue, point.oxygen);
    });
    const floor = Math.max(0, minValue - 0.8);
    const range = Math.max(1.6, maxValue + 0.8 - floor);
    ctx.strokeStyle = '#23988b';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.points.forEach((point: HistoryPoint, index: number) => {
      const x = 4 + index * (width - 8) / (this.points.length - 1);
      const y = 122 - (point.oxygen - floor) / range * 110;
      if (index === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    const last = this.points[this.points.length - 1];
    ctx.fillStyle = '#14695e';
    ctx.beginPath();
    ctx.arc(width - 4, 122 - (last.oxygen - floor) / range * 110, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  build() {
    Canvas(this.context)
      .width('100%')
      .height(136)
      .onReady(() => this.draw())
      .onAreaChange((_oldArea: Area, newArea: Area) => {
        this.chartWidth = Number(newArea.width);
        this.draw();
      })
      .accessibilityText('溶解氧历史变化趋势，具体当前数值见溶解氧卡片')
  }
}
