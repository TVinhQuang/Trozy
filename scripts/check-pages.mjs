// Render each route using real API-scoped data, without a browser or live demo DB.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer as createVite } from 'vite';
import { createApp } from '../src/backend/server.mjs';

const app=createApp({dbPath:':memory:',seed:true});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`;
const vite=await createVite({server:{middlewareMode:true},appType:'custom'});
try {
 const {AppContext}=await vite.ssrLoadModule('/src/frontend/context.tsx');
 const {CorePages}=await vite.ssrLoadModule('/src/frontend/pages/Core.tsx');
 const {TenancyPages}=await vite.ssrLoadModule('/src/frontend/pages/Tenancy.tsx');
 const {OperationsPages}=await vite.ssrLoadModule('/src/frontend/pages/Operations.tsx');
 const {AssistantPage}=await vite.ssrLoadModule('/src/frontend/pages/Assistant.tsx');
 const pages=['dashboard','properties','rooms','tenants','contracts','readings','services','invoices','payments','deposits','transactions','issues','assets','handovers','notifications','tickets','documents','vehicles','amenities','insights','reports','settings','profile','assistant'];
 let count=0;
 for(const email of ['chu@trozy.vn','thue@trozy.vn','khac@trozy.vn']){
  const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Trozy@2026'})});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const bootstrap=await fetch(`${base}/api/bootstrap`,{headers:{cookie}}).then(res=>res.json());
  const scopedPages=bootstrap.user.role==='tenant'?pages.filter(page=>!['properties','tenants','services','transactions','reports','settings'].includes(page)):pages;
  for(const propertyId of ['',bootstrap.data.properties[0]?.id].filter((v,i,a)=>v!==undefined&&a.indexOf(v)===i)){
   for(const page of scopedPages){
    const context={bootstrap,...bootstrap,propertyId,page,setPropertyId(){},navigate(){},notify(){},refresh:async()=>{},mutate:async()=>{},action:async()=>{},remove:async()=>{}};
    const html=renderToStaticMarkup(createElement(AppContext.Provider,{value:context},createElement('main',null,createElement(CorePages,{page}),createElement(TenancyPages,{page}),createElement(OperationsPages,{page}),page==='assistant'?createElement(AssistantPage):null)));
    assert.ok(html.includes('<h1'),`${email}/${propertyId}/${page} has no page title`);
    assert.ok(!html.includes('NaN'),`${email}/${page} contains invalid numeric output`);
    assert.ok(!html.includes('undefined ₫'),`${email}/${page} contains invalid currency`);
    count++;
   }
  }
 }
 console.log(`PASS: ${count} route/role/property renders against isolated SQLite data.`);
}finally{await vite.close();await app.close();}
