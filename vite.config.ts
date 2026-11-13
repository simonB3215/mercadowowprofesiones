import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  // xfwd: la API recibe X-Forwarded-Host/Proto con el origen del navegador (localhost:5173), necesario para la URL de
  // retorno de Battle.net y la comprobación de origen de las peticiones que cambian datos.
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, xfwd: true } } },
});
