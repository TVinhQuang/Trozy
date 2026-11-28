import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync,readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {devApiTarget,devProxyError} from './scripts/dev-api.mjs';
if(existsSync('.env'))loadEnvFile('.env');
// Preserve Vite's default deny rules, then protect project runtimes and business data.
const viteDefaultDeny=['.dev.vars','.dev.vars.*','.env','.env.*','*.{crt,pem}','**/.git/**'];
const privateTrees=['.runtime','.cache','.wrangler','.secrets','data','tmp'].flatMap(name=>[`**/${name}`,`**/${name}/**`]);
export default defineConfig({
  plugins: [react(),{
    name:'trozy-contract-ocr',
    configureServer(server){
      server.middlewares.use('/contract-ocr',(req,res,next)=>{
        const asset=contractAssets.find(([name])=>'/'+name===req.url?.split('?')[0]);
        if(!asset)return next();
        res.setHeader('Content-Type',asset[2]);res.end(readFileSync(asset[1]));
      });
    },
    generateBundle(){
      for(const [name,path] of contractAssets)this.emitFile({type:'asset',fileName:'contract-ocr/'+name,source:readFileSync(path)});
    },
  }],
  root: '.',
  server: { port: 5173, strictPort: true, watch:{ignored:privateTrees},fs:{deny:[...viteDefaultDeny,...privateTrees]},proxy: { '/api': {target:devApiTarget(),configure(proxy){proxy.on('error',devProxyError);}} } },
  build: { outDir: 'dist' },
});
const contractAssets=[
  ['worker.min.js','node_modules/tesseract.js/dist/worker.min.js','application/javascript'],
  ['worker.min.js.LICENSE.txt','node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt','text/plain'],
  ['tesseract-LICENSE.txt','node_modules/tesseract.js/LICENSE.md','text/plain'],
  ['core-LICENSE.txt','node_modules/tesseract.js-core/LICENSE','text/plain'],
  ['tesseract-core-lstm.js','node_modules/tesseract.js-core/tesseract-core-lstm.js','application/javascript'],
  ['tesseract-core-lstm.wasm','node_modules/tesseract.js-core/tesseract-core-lstm.wasm','application/wasm'],
  ['vie.traineddata.gz','node_modules/@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz','application/octet-stream'],
];
