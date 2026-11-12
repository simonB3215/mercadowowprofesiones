import { defineConfig } from 'vitest/config';
// PGlite en memoria aplica todas las migraciones por prueba: puede tardar más de 5 s en equipos cargados.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30000 } });
