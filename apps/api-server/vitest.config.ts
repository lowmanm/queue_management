import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    alias: {
      '@nexus-queue/shared-models': resolve(__dirname, '../../libs/shared-models/src/index.ts'),
    },
  },
});
