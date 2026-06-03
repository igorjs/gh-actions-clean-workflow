import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  minify: true,
  splitting: false,
  target: 'node24',
  noExternal: [/.*/],
})
