// ミニマップ：道と建物、敵・アイテムの位置を表示する（プレイヤー中心、向いている方向が上）

import { MAP_HALF_SIZE } from './Config';
import type { Rect } from './Level';

/** 1 m あたりのピクセル数 */
const PIXELS_PER_METER = 3.6;
/** 事前に描いておく範囲（マップの外側の建物も少し含める） */
const STATIC_EXTENT = MAP_HALF_SIZE + 6;

export interface MinimapMarker {
  x: number;
  z: number;
  color: string;
  size: number;
  /** 範囲外のときに縁へ寄せて表示するか */
  isClampedToEdge: boolean;
}

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement;
  private readonly radius: number;

  constructor(canvas: HTMLCanvasElement, blocks: Rect[]) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d')!;
    this.radius = canvas.width / 2 - 3;
    this.staticLayer = Minimap.DrawStaticLayer(blocks);
  }

  /** ステージが変わったときに地図を描き直す */
  SetBlocks(blocks: Rect[]): void {
    this.staticLayer = Minimap.DrawStaticLayer(blocks);
  }

  /** 道と建物だけの地図を 1 回だけ描いておく */
  private static DrawStaticLayer(blocks: Rect[]): HTMLCanvasElement {
    const size = Math.ceil(STATIC_EXTENT * 2 * PIXELS_PER_METER);
    const layer = document.createElement('canvas');
    layer.width = size;
    layer.height = size;
    const context = layer.getContext('2d')!;
    const ToPixel = (value: number) => (value + STATIC_EXTENT) * PIXELS_PER_METER;

    context.fillStyle = '#1a1226';
    context.fillRect(0, 0, size, size);
    // 歩けるマップの範囲
    context.fillStyle = '#6b5c78';
    context.fillRect(ToPixel(-MAP_HALF_SIZE), ToPixel(-MAP_HALF_SIZE), MAP_HALF_SIZE * 2 * PIXELS_PER_METER, MAP_HALF_SIZE * 2 * PIXELS_PER_METER);
    // 建物
    context.fillStyle = '#2e2438';
    context.strokeStyle = '#8a6fa0';
    context.lineWidth = 1;
    for (const block of blocks) {
      const x = ToPixel(Math.max(block.minX, -STATIC_EXTENT));
      const y = ToPixel(Math.max(block.minZ, -STATIC_EXTENT));
      const width = ToPixel(Math.min(block.maxX, STATIC_EXTENT)) - x;
      const height = ToPixel(Math.min(block.maxZ, STATIC_EXTENT)) - y;
      if (width <= 0 || height <= 0) continue;
      context.fillRect(x, y, width, height);
      context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    }
    return layer;
  }

  Draw(playerX: number, playerZ: number, yaw: number, markers: MinimapMarker[]): void {
    const context = this.context;
    const center = this.canvas.width / 2;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    context.save();
    context.beginPath();
    context.arc(center, center, this.radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#1a1226';
    context.fill();

    // プレイヤーを中心に、向いている方向が上になるように回す
    context.translate(center, center);
    context.rotate(yaw);
    context.drawImage(
      this.staticLayer,
      -(playerX + STATIC_EXTENT) * PIXELS_PER_METER,
      -(playerZ + STATIC_EXTENT) * PIXELS_PER_METER,
    );

    for (const marker of markers) {
      let dx = (marker.x - playerX) * PIXELS_PER_METER;
      let dy = (marker.z - playerZ) * PIXELS_PER_METER;
      const distance = Math.hypot(dx, dy);
      const limit = this.radius - 5;
      let alpha = 1;
      if (distance > limit) {
        if (!marker.isClampedToEdge) continue;
        dx *= limit / distance;
        dy *= limit / distance;
        alpha = 0.55;
      }
      context.globalAlpha = alpha;
      context.fillStyle = marker.color;
      context.beginPath();
      context.arc(dx, dy, marker.size * (alpha < 1 ? 0.75 : 1), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();

    // プレイヤー（中央の矢印）
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#000000';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(center, center - 7);
    context.lineTo(center + 5, center + 5);
    context.lineTo(center, center + 2);
    context.lineTo(center - 5, center + 5);
    context.closePath();
    context.fill();
    context.stroke();

    // 外枠
    context.strokeStyle = 'rgba(255, 138, 31, 0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center, center, this.radius, 0, Math.PI * 2);
    context.stroke();
  }
}
