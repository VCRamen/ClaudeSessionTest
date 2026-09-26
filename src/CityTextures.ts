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

// ------------------------------------------------------------
// ビル街
// ------------------------------------------------------------

/**
 * 高層ビルのガラス窓（4 列 × 4 階分を 1 枚にして、繰り返して貼る）。
 * variant 0 = 青いガラスのオフィス、1 = 暖色の明かりのオフィス
 */
export function CreateOfficeWindowTexture(variant: number): THREE.CanvasTexture {
  const texture = CreateCanvasTexture(`office-window-${variant}`, 256, 256, (context) => {
    context.fillStyle = variant === 0 ? '#1a2438' : '#231e2a';
    context.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) {
        const x = column * 64 + 4;
        const y = row * 64 + 8;
        const isLit = Math.random() < (variant === 0 ? 0.55 : 0.45);
        if (isLit) {
          const warm = variant === 1 || Math.random() < 0.4;
          context.fillStyle = warm ? '#ffd28a' : '#cfe6ff';
        } else {
          context.fillStyle = variant === 0 ? '#2c3f5e' : '#35303e';
        }
        context.fillRect(x, y, 56, 46);
        if (isLit) {
          // ブラインドの影
          context.fillStyle = 'rgba(0, 0, 0, 0.18)';
          for (let line = y + 4; line < y + 22; line += 5) context.fillRect(x, line, 56, 2);
        }
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** マンションの窓（2 部屋分を 1 枚にして、横に繰り返して貼る） */
export function CreateApartmentWindowTexture(): THREE.CanvasTexture {
  const texture = CreateCanvasTexture('apartment-window', 256, 128, (context) => {
    context.fillStyle = '#6f6a64';
    context.fillRect(0, 0, 256, 128);
    for (let room = 0; room < 2; room++) {
      const x = room * 128 + 10;
      const isLit = Math.random() < 0.7;
      const gradient = context.createLinearGradient(0, 8, 0, 120);
      gradient.addColorStop(0, isLit ? '#ffe2a8' : '#2e2c3a');
      gradient.addColorStop(1, isLit ? '#e89a4c' : '#1c1a26');
      context.fillStyle = gradient;
      context.fillRect(x, 8, 108, 112);
      // カーテンと窓枠
      if (isLit) {
        context.fillStyle = 'rgba(120, 70, 40, 0.35)';
        context.fillRect(x, 8, 18, 112);
        context.fillRect(x + 90, 8, 18, 112);
      }
      context.strokeStyle = '#3a3634';
      context.lineWidth = 4;
      context.strokeRect(x, 8, 108, 112);
      context.beginPath();
      context.moveTo(x + 54, 8);
      context.lineTo(x + 54, 120);
      context.stroke();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** 1 階のガラス張りの店（明るい店内） */
export function CreateStorefrontTexture(variant: number): THREE.CanvasTexture {
  return CreateCanvasTexture(`storefront-${variant}`, 512, 192, (context) => {
    const colors = [['#fff0d0', '#e8a060'], ['#ffe8f0', '#c87aa0'], ['#f0f6ff', '#8aa8d0']][variant % 3];
    const gradient = context.createLinearGradient(0, 0, 0, 192);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 192);
    // 天井の照明
    context.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let x = 30; x < 512; x += 80) context.fillRect(x, 10, 40, 5);
    // 棚・商品・かぼちゃの飾り
    for (let x = 20; x < 500; x += 90 + Math.random() * 40) {
      context.fillStyle = 'rgba(80, 50, 40, 0.55)';
      context.fillRect(x, 80, 50, 90);
      for (let shelf = 0; shelf < 3; shelf++) {
        context.fillStyle = `hsla(${Math.floor(Math.random() * 360)}, 55%, 55%, 0.9)`;
        context.fillRect(x + 4, 86 + shelf * 28, 42, 14);
      }
    }
    context.fillStyle = '#ff8a1f';
    for (const x of [60, 300, 440]) {
      context.beginPath();
      context.ellipse(x, 172, 16, 12, 0, 0, Math.PI * 2);
      context.fill();
    }
    // 窓枠
    context.strokeStyle = '#2a2a30';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 504, 184);
    for (let x = 128; x < 512; x += 128) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 192);
      context.stroke();
    }
  });
}

/** 街灯に吊るすハロウィンのバナー（紫地にジャック・オー・ランタン） */
export function CreateHalloweenBannerTexture(): THREE.CanvasTexture {
  return CreateCanvasTexture('halloween-banner', 128, 256, (context) => {
    context.fillStyle = '#4a2170';
    context.fillRect(0, 0, 128, 256);
    context.strokeStyle = '#e8a030';
    context.lineWidth = 5;
    context.strokeRect(6, 6, 116, 244);
    // かぼちゃ
    context.fillStyle = '#ff8a1f';
    context.beginPath();
    context.ellipse(64, 120, 42, 34, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3d6b21';
    context.fillRect(60, 78, 8, 12);
    context.fillStyle = '#2a1000';
    context.beginPath();
    context.moveTo(40, 112);
    context.lineTo(50, 96);
    context.lineTo(60, 112);
    context.moveTo(68, 112);
    context.lineTo(78, 96);
    context.lineTo(88, 112);
    context.fill();
    context.beginPath();
    context.moveTo(38, 128);
    context.lineTo(90, 128);
    context.lineTo(80, 142);
    context.lineTo(48, 142);
    context.closePath();
    context.fill();
    context.fillStyle = '#f2d27a';
    context.font = `bold 26px ${GOTHIC_FONT}`;
    context.textAlign = 'center';
    context.fillText('HALLO', 64, 200);
    context.fillText('WEEN', 64, 228);
  });
}
