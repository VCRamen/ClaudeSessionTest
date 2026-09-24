// エントリーポイント

import './style.css';
import { Game } from './Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

// 開発時のみデバッグ用にコンソールから触れるようにする
if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
