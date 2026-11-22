import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // 로컬 개발(dev)은 '/', GitHub Pages 배포 빌드(build)는 저장소 경로 적용
  base: command === 'build' ? '/Github_Pages/' : '/',
}));
