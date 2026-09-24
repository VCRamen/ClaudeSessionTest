import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスでビルドし、GitHub Pages などのサブディレクトリでも動くようにする
  base: './',
  build: {
    // three.js を含むため 1 ファイルが大きくなるが、ゲーム用途なので許容する
    chunkSizeWarningLimit: 1500,
  },
});
