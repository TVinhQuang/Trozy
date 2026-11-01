// Manual reading entry with synthetic data and intercepted saves; no business DB.
// DOM interaction checks do not measure real browser layout or verify meter photos.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'http://127.0.0.1:5173/', pretendToBeVisual:true });
const previous = new Map();
function install(name, value) {
  previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
}
for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','Event','MouseEvent','KeyboardEvent','File','FileReader','FormData','MutationObserver']) {
  install(name,name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name]);
}
install('getComputedStyle',dom.window.getComputedStyle.bind(dom.window));
install('requestAnimationFrame',callback=>setTimeout(()=>callback(Date.now()),0));
install('cancelAnimationFrame',clearTimeout);
install('IS_REACT_ACT_ENVIRONMENT',true);
dom.window.HTMLElement.prototype.scrollIntoView = function() {};
dom.window.scrollTo = () => {};
const nativeFetch = globalThis.fetch;
const requests=[];
globalThis.fetch = async url => { requests.push(String(url)); throw new Error(`Reading-entry tests must not request the network: ${url}`); };

const vite = await createVite({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {createElement:h} = await import('react');
const {render,screen,fireEvent,within,waitFor,cleanup} = await import('@testing-library/react');
const {AppContext} = await vite.ssrLoadModule('/src/frontend/context.tsx');
const {Readings} = await vite.ssrLoadModule('/src/frontend/pages/Core.tsx');
const {collections} = await vite.ssrLoadModule('/src/frontend/types.ts');
let checks=0;
const pass = message => { checks++;console.log(`PASS ${message}`); };

function fixture({role='landlord',existing=false}={}) {
  const data=Object.fromEntries(collections.map(name=>[name,[]]));
  data.properties=[{id:'p1',name:'Cơ sở thử nghiệm',archived:false}];
  data.rooms=[{id:'r1',propertyId:'p1',code:'101',status:'occupied',area:24,price:3000000,capacity:2}];
  data.tenants=[{id:'t1',propertyId:'p1',roomId:'r1',userId:'tenant-user',status:'active',name:'Người thuê mẫu'}];
  data.readings=[{id:'previous',propertyId:'p1',roomId:'r1',period:'2020-10',electricOld:1000,electricNew:9000,waterOld:110,waterNew:120,confirmed:true}];
  if(existing)data.readings.push({id:'current',propertyId:'p1',roomId:'r1',period:'2020-11',electricOld:9000,electricNew:10200,waterOld:120,waterNew:123,confirmed:true});
  const user={id:role==='landlord'?'owner-user':'tenant-user',name:'Người dùng thử',role,tenantId:role==='tenant'?'t1':undefined};
  const mutations=[],notifications=[];
  const value={user,data,bootstrap:{user,data},page:'readings',propertyId:'p1',setPropertyId(){},navigate(){},refresh:async()=>{},notify(...args){notifications.push(args);},mutate:async(...args)=>{mutations.push(structuredClone(args));return{id:'saved',...args[1]};},remove:async()=>assert.fail('No deletion expected'),action:async()=>assert.fail('No business action expected')};
  return {value,mutations,notifications};
}
const mount=ctx=>render(h(AppContext.Provider,{value:ctx.value},h(Readings)));
const field=label=>screen.getByLabelText(label,{exact:false});
const change=(label,value)=>fireEvent.change(field(label),{target:{value:String(value)}});
const dialog=()=>screen.getByRole('dialog');
const checkbox=()=>within(dialog()).getByRole('checkbox');
const save=()=>within(dialog()).getByRole('button',{name:'Lưu chỉ số',exact:true});
const openNew=()=>fireEvent.click(screen.getByRole('button',{name:'Ghi chỉ số',exact:true}));

try {
  let ctx=fixture(),view=mount(ctx);openNew();
  assert.equal(field('Cách nhập điện nước').value,'cumulative');
  assert.equal(field('Chỉ số điện đầu kỳ (kWh)').value,'9000');
  assert.equal(field('Chỉ số điện cuối kỳ (kWh)').value,'9000');
  assert.equal(field('Chỉ số nước đầu kỳ (m³)').value,'120');
  assert.equal(field('Chỉ số nước cuối kỳ (m³)').value,'120');
  assert.equal(save().disabled,true);
  fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent,/kiểm tra.*xác nhận/i));
  assert.deepEqual(ctx.mutations,[]);
  pass('Default entry identifies cumulative start/end readings and requires explicit confirmation before saving');

  change('Cách nhập điện nước','consumption');
  assert.equal(screen.queryByRole('alert'),null,'Changing the entry method removes the stale validation message');
  change('Điện tiêu thụ kỳ này (kWh)',1200);
  change('Nước tiêu thụ kỳ này (m³)',3);
  assert.equal(field('Chỉ số điện đầu kỳ (kWh)').value,'9000');
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').value,'10200');
  assert.equal(field('Chỉ số nước cuối kỳ được tính (m³)').value,'123');
  assert.equal(field('Chỉ số điện đầu kỳ (kWh)').readOnly,true);
  assert.equal(field('Chỉ số nước đầu kỳ (m³)').readOnly,true);
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').readOnly,true);
  assert.equal(field('Chỉ số nước cuối kỳ được tính (m³)').readOnly,true);
  assert.equal(save().disabled,true);
  assert.deepEqual(ctx.mutations,[]);
  fireEvent.click(checkbox());
  fireEvent.click(save());
  await waitFor(()=>assert.equal(ctx.mutations.length,1));
  const [collection,payload,id]=ctx.mutations[0];
  assert.equal(collection,'readings');assert.equal(id,undefined);
  assert.equal(payload.roomId,'r1');assert.equal(payload.propertyId,'p1');
  assert.equal(payload.electricOld,9000);assert.equal(payload.electricNew,10200);
  assert.equal(payload.waterOld,120);assert.equal(payload.waterNew,123);
  assert.equal(payload.electricNew-payload.electricOld,1200);
  assert.ok(1200<ctx.value.data.readings[0].electricNew-ctx.value.data.readings[0].electricOld,'Fixture usage must be lower than the prior month');
  assert.equal(payload.confirmed,true);
  await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
  view.unmount();
  pass('A lower monthly usage of 1200 after 8000 saves only the equivalent positive cumulative interval, never 1200 as the ending counter');

  ctx=fixture();view=mount(ctx);openNew();
  change('Cách nhập điện nước','consumption');
  change('Điện tiêu thụ kỳ này (kWh)',1200);change('Nước tiêu thụ kỳ này (m³)',3);
  change('Cách nhập điện nước','cumulative');
  assert.equal(field('Chỉ số điện cuối kỳ (kWh)').value,'10200');
  assert.equal(field('Chỉ số điện cuối kỳ (kWh)').readOnly,false);
  change('Cách nhập điện nước','consumption');
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').value,'1200');
  assert.equal(field('Nước tiêu thụ kỳ này (m³)').value,'3');
  fireEvent.click(checkbox());assert.equal(save().disabled,false);
  change('Điện tiêu thụ kỳ này (kWh)',100);
  assert.equal(checkbox().checked,false);assert.equal(save().disabled,true);
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').value,'9100');
  assert.deepEqual(ctx.mutations,[]);
  pass('Switching entry methods retains the same interval; changing monthly usage revokes prior confirmation without saving');

  change('Điện tiêu thụ kỳ này (kWh)','');
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').value,'');
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').value,'');
  assert.equal(save().disabled,true);
  change('Điện tiêu thụ kỳ này (kWh)',-1);
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').min,'0');
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').validity.rangeUnderflow,true);
  fireEvent.click(checkbox());fireEvent.click(save());
  fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.deepEqual(ctx.mutations,[]);
  change('Điện tiêu thụ kỳ này (kWh)',0);change('Nước tiêu thụ kỳ này (m³)',0);
  assert.equal(screen.queryByRole('alert'),null);
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').value,'9000');
  assert.equal(field('Chỉ số nước cuối kỳ được tính (m³)').value,'120');
  change('Cách nhập điện nước','cumulative');
  change('Chỉ số điện cuối kỳ (kWh)',1200);
  change('Cách nhập điện nước','consumption');
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').value,'0','A decreasing cumulative draft cannot silently become a negative usage');
  assert.equal(field('Chỉ số điện cuối kỳ được tính (kWh)').value,'9000');
  fireEvent.click(checkbox());
  change('Kỳ ghi chỉ số','2020-09');
  assert.equal(field('Cách nhập điện nước').value,'cumulative');
  assert.equal(field('Chỉ số điện đầu kỳ (kWh)').value,'0');
  assert.equal(checkbox().checked,false);
  assert.deepEqual(ctx.mutations,[]);
  view.unmount();
  pass('Blank or negative monthly usage cannot submit; zero is valid, invalid drafts normalize safely and a period change resets entry context');

  ctx=fixture({existing:true});view=mount(ctx);
  const currentRow=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('2020-11'));
  assert.ok(currentRow);fireEvent.click(within(currentRow).getByRole('button',{name:'Chỉnh sửa',exact:true}));
  assert.equal(field('Cách nhập điện nước').value,'cumulative');
  assert.equal(field('Chỉ số điện đầu kỳ (kWh)').value,'9000');
  assert.equal(field('Chỉ số điện cuối kỳ (kWh)').value,'10200');
  change('Cách nhập điện nước','consumption');
  assert.equal(field('Điện tiêu thụ kỳ này (kWh)').value,'1200');
  assert.equal(field('Nước tiêu thụ kỳ này (m³)').value,'3');
  assert.deepEqual(ctx.mutations,[]);view.unmount();
  pass('Editing historical readings preserves their stored cumulative values and derives monthly usage without reinterpreting history');

  ctx=fixture({role:'tenant'});view=mount(ctx);
  assert.equal(screen.queryByRole('button',{name:'Ghi chỉ số',exact:true}),null);
  assert.equal(screen.queryByRole('button',{name:'Chỉnh sửa',exact:true}),null);
  assert.equal(screen.queryByLabelText('Cách nhập điện nước',{exact:true}),null);
  assert.deepEqual(ctx.mutations,[]);assert.deepEqual(requests,[]);view.unmount();
  pass('Tenant access exposes no owner manual reading editor or numeric consumption entry and never requests recognition or persistence');
  console.log(`PASS: ${checks} manual reading-entry groups with synthetic records and intercepted saves. No browser layout or real meter evidence was verified.`);
} finally {
  cleanup();await vite.close();dom.window.close();globalThis.fetch=nativeFetch;
  for(const[name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
