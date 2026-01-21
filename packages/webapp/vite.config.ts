import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react({ fastRefresh: false }),
    ],
    server: {
        port: 5173,
        strictPort: true,
        hmr: false, // полностью гасим HMR, чтобы не было перезагрузок/WS перезапусков
    },
});