import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {devApiTarget,devProxyError} from './scripts/dev-api.mjs';
if(existsSync('.env'))loadEnvFile('.env');
// Preserve Vite's default deny rules, then protect project runtimes and business data.
const viteDefaultDeny=['.env','.env.*','*.{crt,pem}','**/.git/**'];
const privateTrees=['.runtime','.cache','data','tmp'].flatMap(name=>[`**/${name}`,`**/${name}/**`]);
export default defineConfig({
  plugins: [react()],
  root: '.',
  server: { port: 5173, strictPort: true, watch:{ignored:privateTrees},fs:{deny:[...viteDefaultDeny,...privateTrees]},proxy: { '/api': {target:devApiTarget(),configure(proxy){proxy.on('error',devProxyError);}} } },
  build: { outDir: 'dist' },
});
