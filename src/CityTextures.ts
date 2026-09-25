// 商店街の見た目に使うテクスチャを Canvas で生成する（画像ファイル不要）

import * as THREE from 'three';

const SIGN_FONT = '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", "IPAMincho", serif';
const GOTHIC_FONT = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "IPAGothic", Meiryo, sans-serif';

const textureCache = new Map<string, THREE.CanvasTexture>();

function CreateCanvasTexture(key: string, width: number, height: number, Draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  Draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

/** 石畳（道路全体） */
export function CreatePavingTexture(): THREE.CanvasTexture {
  const texture = CreateCanvasTexture('paving', 512, 512, (context) => {
    context.fillStyle = '#6d6259';
    context.fillRect(0, 0, 512, 512);
    const rowHeight = 64;
    for (let row = 0; row < 8; row++) {
      const offset = row % 2 === 0 ? 0 : 48;
      for (let x = -offset; x < 512; x += 96) {
        const shade = 118 + Math.floor(Math.random() * 30);
        context.fillStyle = `rgb(${shade}, ${shade - 12}, ${shade - 24})`;
        context.fillRect(x + 3, row * rowHeight + 3, 90, rowHeight - 6);
      }
    }
    for (let i = 0; i < 3000; i++) {
      const shade = 80 + Math.floor(Math.random() * 80);
      context.fillStyle = `rgba(${shade}, ${shade - 10}, ${shade - 20}, 0.25)`;
      context.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** 歩道のタイル */
export function CreateSidewalkTexture(): THREE.CanvasTexture {
  const texture = CreateCanvasTexture('sidewalk', 256, 256, (context) => {
    context.fillStyle = '#5c5550';
    context.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 64) {
        const shade = 140 + Math.floor(Math.random() * 20);
        context.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 14})`;
        context.fillRect(x + 2, y + 2, 60, 60);
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** 店のショーウィンドウ（中が明るく、棚が並んでいる） */
export function CreateShopWindowTexture(variant: number): THREE.CanvasTexture {
  return CreateCanvasTexture(`shop-window-${variant}`, 256, 128, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, variant % 2 === 0 ? '#ffd9a0' : '#ffe6b8');
    gradient.addColorStop(1, '#d98a3c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 128);
    // 棚と商品のシルエット
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 30 + shelf * 32;
      context.fillStyle = 'rgba(90, 50, 20, 0.7)';
      context.fillRect(0, y + 18, 256, 4);
      for (let x = 6; x < 250; x += 10 + Math.random() * 10) {
        const hue = Math.floor(Math.random() * 360);
        context.fillStyle = `hsla(${hue}, 60%, 45%, 0.8)`;
        const itemHeight = 8 + Math.random() * 10;
        context.fillRect(x, y + 18 - itemHeight, 6 + Math.random() * 4, itemHeight);
      }
    }
    // 窓枠
    context.strokeStyle = '#3b2616';
    context.lineWidth = 6;
    context.strokeRect(3, 3, 250, 122);
    for (let x = 64; x < 256; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 128);
      context.stroke();
    }
  });
}

/** 2 階の窓（明かりが点いている／いない） */
export function CreateUpperWindowTexture(isLit: boolean): THREE.CanvasTexture {
  return CreateCanvasTexture(`upper-window-${isLit}`, 128, 128, (context) => {
    context.fillStyle = isLit ? '#ffc977' : '#2b2438';
    context.fillRect(0, 0, 128, 128);
    if (isLit) {
      context.fillStyle = 'rgba(255, 240, 200, 0.6)';
      context.fillRect(10, 10, 108, 60);
    }
    context.strokeStyle = '#2a1d14';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 120, 120);
    context.beginPath();
    context.moveTo(64, 0);
    context.lineTo(64, 128);
    context.moveTo(0, 64);
    context.lineTo(128, 64);
    context.stroke();
  });
}

/** 縦長の看板（縦書き） */
export function CreateVerticalSignTexture(text: string, background: string, foreground: string): THREE.CanvasTexture {
  return CreateCanvasTexture(`vsign-${text}-${background}`, 128, 448, (context) => {
    context.fillStyle = background;
    context.fillRect(0, 0, 128, 448);
    context.strokeStyle = foreground;
    context.lineWidth = 6;
    context.strokeRect(8, 8, 112, 432);
    context.fillStyle = foreground;
    const characters = [...text];
    const size = Math.min(92, 400 / characters.length);
    context.font = `bold ${size}px ${SIGN_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const startY = 224 - ((characters.length - 1) * size) / 2;
    characters.forEach((character, index) => {
      context.fillText(character, 64, startY + index * size);
    });
  });
}

/** 日よけ（横書きの店名入り） */
export function CreateAwningTexture(text: string, color: string): THREE.CanvasTexture {
  return CreateCanvasTexture(`awning-${text}-${color}`, 512, 96, (context) => {
    context.fillStyle = color;
    context.fillRect(0, 0, 512, 96);
    context.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let x = 0; x < 512; x += 64) context.fillRect(x, 0, 32, 96);
    context.fillStyle = '#fff6e8';
    context.font = `bold 58px ${SIGN_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 50);
  });
}

/** 黒板の立て看板 */
export function CreateChalkboardTexture(): THREE.CanvasTexture {
  return CreateCanvasTexture('chalkboard', 256, 320, (context) => {
    context.fillStyle = '#243024';
    context.fillRect(0, 0, 256, 320);
    context.fillStyle = '#f2efe6';
    context.font = `bold 34px ${GOTHIC_FONT}`;
    context.textAlign = 'center';
    context.fillText('本日の', 128, 60);
    context.fillText('おすすめ', 128, 104);
    context.font = `28px ${GOTHIC_FONT}`;
    context.fillText('かぼちゃ団子', 128, 160);
    // かぼちゃの絵
    context.fillStyle = '#ff8a1f';
    context.beginPath();
    context.ellipse(128, 240, 52, 40, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#243024';
    context.beginPath();
    context.moveTo(104, 230);
    context.lineTo(114, 214);
    context.lineTo(124, 230);
    context.moveTo(132, 230);
    context.lineTo(142, 214);
    context.lineTo(152, 230);
    context.fill();
    context.fillRect(106, 250, 44, 8);
  });
}

/** 自動販売機の正面 */
export function CreateVendingMachineTexture(variant: number): THREE.CanvasTexture {
  return CreateCanvasTexture(`vending-${variant}`, 128, 256, (context) => {
    context.fillStyle = variant === 0 ? '#e8eef5' : '#d23a3a';
    context.fillRect(0, 0, 128, 256);
    context.fillStyle = '#bfe3ff';
    context.fillRect(10, 12, 108, 120);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 5; column++) {
        const hue = (row * 70 + column * 40 + variant * 30) % 360;
        context.fillStyle = `hsl(${hue}, 70%, 50%)`;
        context.fillRect(16 + column * 20, 20 + row * 38, 12, 26);
      }
    }
    context.fillStyle = '#222';
    context.fillRect(20, 190, 88, 30);
    context.fillStyle = variant === 0 ? '#3a78c2' : '#fff';
    context.fillRect(10, 140, 108, 36);
  });
}

/** ハロウィンのガーランド（旗）：0 = かぼちゃ（オレンジ）、1 = コウモリ（紫） */
export function CreateBuntingTexture(kind: number): THREE.CanvasTexture {
  return CreateCanvasTexture(`bunting-${kind}`, 128, 128, (context) => {
    context.fillStyle = kind === 0 ? '#ff8a1f' : '#7a3fbf';
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(128, 0);
    context.lineTo(64, 128);
    context.closePath();
    context.fill();
    context.fillStyle = kind === 0 ? '#2a1400' : '#1a0a26';
    if (kind === 0) {
      // かぼちゃの顔
      context.beginPath();
      context.moveTo(38, 30);
      context.lineTo(50, 14);
      context.lineTo(60, 30);
      context.moveTo(68, 30);
      context.lineTo(78, 14);
      context.lineTo(90, 30);
      context.fill();
      context.fillRect(44, 44, 40, 8);
    } else {
      // コウモリ
      context.beginPath();
      context.moveTo(64, 34);
      context.quadraticCurveTo(44, 10, 24, 28);
      context.quadraticCurveTo(40, 32, 44, 44);
      context.quadraticCurveTo(54, 38, 64, 48);
      context.quadraticCurveTo(74, 38, 84, 44);
      context.quadraticCurveTo(88, 32, 104, 28);
      context.quadraticCurveTo(84, 10, 64, 34);
      context.fill();
    }
  });
}

/** 工事用バリケード（黄色と黒の縞） */
export function CreateBarricadeTexture(): THREE.CanvasTexture {
  const texture = CreateCanvasTexture('barricade', 256, 64, (context) => {
    context.fillStyle = '#f2c400';
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = '#1a1a1a';
    for (let x = -64; x < 256; x += 48) {
      context.beginPath();
      context.moveTo(x, 64);
      context.lineTo(x + 24, 64);
      context.lineTo(x + 88, 0);
      context.lineTo(x + 64, 0);
      context.closePath();
      context.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
