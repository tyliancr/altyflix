import * as esbuild from 'esbuild';

console.log('📦 Bundling Netlify Function api.mjs (self-contained)...');
await esbuild.build({
  entryPoints: ['netlify/functions-src/api.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'netlify/functions/api.mjs',
  minify: false,
  sourcemap: false,
  banner: {
    js: `import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);`
  }
});
console.log('✅ Netlify Function api.mjs successfully bundled.');
