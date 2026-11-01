// Role-specific support-request interactions in an isolated DOM with synthetic
// records. No browser layout assertion, network request or business-data write.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'http://127.0.0.1:5173/', pretendToBeVisual:true });
const previous = new Map();
function install(name,value) {
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
const nativeFetch = globalThis.fetch,requests=[];
globalThis.fetch = async url => { requests.push(String(url)); throw new Error(`Support UI checks must not request the network: ${url}`); };

const vite = await createVite({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {createElement:h,useState} = await import('react');
const {render,screen,fireEvent,within,waitFor,cleanup,act,configure} = await import('@testing-library/react');
configure({asyncUtilTimeout:6000});
const {AppContext} = await vite.ssrLoadModule('/src/frontend/context.tsx');
const {OperationsPages} = await vite.ssrLoadModule('/src/frontend/pages/Operations.tsx');
const {collections} = await vite.ssrLoadModule('/src/frontend/types.ts');
let checks=0;
const pass=message=>{checks++;console.log(`PASS ${message}`);};
const ticket={id:'ticket-own',propertyId:'p1',roomId:'r1',tenantId:'t1',title:'Kiểm tra thông tin hợp đồng',category:'Hợp đồng',body:'Nhờ chủ trọ kiểm tra thông tin ngày trả phòng.',status:'open',messages:[],createdAt:'2026-11-01T03:00:00.000Z'};

function fixture({role='landlord',empty=false}={}) {
  const data=Object.fromEntries(collections.map(name=>[name,[]]));
  data.properties=[{id:'p1',name:'Nhà mẫu'},{id:'p2',name:'Nhà khác'}];
  data.rooms=[{id:'r1',propertyId:'p1',code:'101',status:'occupied'},{id:'r2',propertyId:'p2',code:'202',status:'occupied'}];
  data.tenants=[{id:'t1',userId:'tenant-user',roomId:'r1',propertyId:'p1',name:'Người thuê mẫu',status:'active'},{id:'t2',userId:'other-user',roomId:'r2',propertyId:'p2',name:'Người thuê khác',status:'active'}];
  data.tickets=empty?[]:structuredClone([ticket,{...ticket,id:'ticket-other',propertyId:'p2',roomId:'r2',tenantId:'t2',title:'Yêu cầu cơ sở khác'}]);
  const user={id:role==='landlord'?'owner-user':'tenant-user',name:role==='landlord'?'Chủ trọ mẫu':'Người thuê mẫu',role,...(role==='tenant'?{tenantId:'t1'}:{})};
  const ctx={data,user,mutations:[],actions:[],notifications:[],failCreate:'',emit:null};
  ctx.value={user,data,bootstrap:{user,data},page:'tickets',propertyId:'p1',setPropertyId(){},navigate(){},refresh:async()=>{},notify(...args){ctx.notifications.push(args);},
    mutate:async(collection,payload,id)=>{
      ctx.mutations.push(structuredClone([collection,payload,id]));
      assert.equal(collection,'tickets');assert.equal(id,undefined);
      if(ctx.failCreate)throw new Error(ctx.failCreate);
      const row={...payload,id:'created-ticket',createdAt:'2026-11-01T04:00:00.000Z'};
      ctx.data.tickets=[...ctx.data.tickets,row];ctx.emit?.();return row;
    },
    action:async(name,payload)=>{
      ctx.actions.push(structuredClone([name,payload]));
      const row=ctx.data.tickets.find(item=>item.id===payload.id);assert.ok(row);
      if(name==='ticket-transition')row.status=payload.status;
      else if(name==='ticket-reply')row.messages=[...row.messages,{id:'reply-'+row.messages.length,body:payload.body,authorId:ctx.user.id,authorName:ctx.user.name,createdAt:'2026-11-01T05:00:00.000Z'}];
      else assert.fail(`Unexpected support action ${name}`);
      ctx.emit?.();return row;
    },remove:async()=>assert.fail('Support checks must not delete business records')};
  return ctx;
}
function mount(ctx) {
  function Harness() {
    const [,update]=useState(0);ctx.emit=()=>update(value=>value+1);
    const value={...ctx.value,user:ctx.user,data:ctx.data,bootstrap:{user:ctx.user,data:ctx.data}};
    return h(AppContext.Provider,{value},h(OperationsPages,{page:'tickets'}));
  }
  return render(h(Harness));
}
const button=name=>screen.getByRole('button',{name,exact:true});
const click=name=>fireEvent.click(button(name));
const change=(label,value)=>fireEvent.change(screen.getByLabelText(label,{exact:false}),{target:{value}});
const dialog=()=>screen.getByRole('dialog');
function fillTicket(){change('Tiêu đề','Đề nghị kiểm tra hóa đơn');change('Chủ đề','Hóa đơn & thanh toán');change('Nội dung yêu cầu','Nhờ chủ trọ kiểm tra lại hóa đơn kỳ này.');}

try {
  let ctx=fixture({empty:true}),view=mount(ctx);
  assert.ok(screen.getByRole('heading',{level:1,name:'Yêu cầu hỗ trợ'}));
  assert.equal(screen.queryByRole('button',{name:'Tạo yêu cầu',exact:true}),null);
  assert.equal(screen.queryByRole('dialog'),null);
  assert.equal(screen.queryByText(/Tạo yêu cầu khi cần/),null);
  assert.equal(document.querySelector('[name="roomId"]'),null);
  assert.deepEqual(ctx.mutations,[]);assert.deepEqual(ctx.actions,[]);
  view.unmount();
  pass('An owner empty state explains incoming requests without offering creation or a tenant-room form');

  ctx=fixture();view=mount(ctx);
  assert.ok(screen.getByText(ticket.title,{exact:true}));
  assert.equal(screen.queryByText('Yêu cầu cơ sở khác',{exact:true}),null);
  assert.equal(screen.queryByRole('button',{name:'Tạo yêu cầu',exact:true}),null);
  click('Mở trao đổi');
  assert.ok(within(dialog()).getByText(ticket.body,{exact:true}));
  assert.ok(button('Tiếp nhận'));assert.ok(button('Đánh dấu đã giải quyết'));
  assert.equal(document.querySelector('[name="roomId"]'),null);
  click('Tiếp nhận');
  await waitFor(()=>assert.deepEqual(ctx.actions,[['ticket-transition',{id:ticket.id,status:'progress'}]]));
  await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Tiếp nhận',exact:true}),null));
  change('Phản hồi','  Chủ trọ đã kiểm tra và sẽ cập nhật thông tin.  ');click('Gửi phản hồi');
  await waitFor(()=>assert.deepEqual(ctx.actions[1],['ticket-reply',{id:ticket.id,body:'Chủ trọ đã kiểm tra và sẽ cập nhật thông tin.',fileId:undefined}]));
  await waitFor(()=>assert.equal(screen.getByLabelText('Phản hồi',{exact:false}).value,''));
  assert.ok(within(dialog()).getByText('Chủ trọ đã kiểm tra và sẽ cập nhật thông tin.',{exact:true}));
  click('Đánh dấu đã giải quyết');
  await waitFor(()=>assert.deepEqual(ctx.actions[2],['ticket-transition',{id:ticket.id,status:'resolved'}]));
  await waitFor(()=>assert.ok(button('Mở lại yêu cầu')));
  assert.equal(screen.queryByRole('button',{name:'Gửi phản hồi',exact:true}),null);
  assert.deepEqual(ctx.mutations,[]);
  view.unmount();
  pass('Owners view requests in the selected property and can receive, reply and resolve without creating a request');

  ctx=fixture({role:'tenant',empty:true});view=mount(ctx);
  click('Tạo yêu cầu');
  assert.ok(screen.getByRole('dialog',{name:'Tạo yêu cầu hỗ trợ'}));
  assert.equal(document.querySelector('[name="roomId"]'),null);
  fillTicket();
  // Even unexpected form fields cannot change the tenant/room selected by the UI.
  const form=dialog().querySelector('form');
  for(const [name,value]of [['roomId','r2'],['tenantId','t2'],['propertyId','p2']]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
  fireEvent.submit(form);
  await waitFor(()=>assert.equal(ctx.mutations.length,1));
  assert.deepEqual(ctx.mutations[0],['tickets',{title:'Đề nghị kiểm tra hóa đơn',category:'Hóa đơn & thanh toán',body:'Nhờ chủ trọ kiểm tra lại hóa đơn kỳ này.',roomId:'r1',tenantId:'t1',propertyId:'p1',status:'open',fileId:undefined,messages:[]},undefined]);
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Đề nghị kiểm tra hóa đơn'})));
  assert.equal(screen.queryByRole('button',{name:'Tiếp nhận',exact:true}),null);
  assert.equal(screen.queryByRole('button',{name:'Đánh dấu đã giải quyết',exact:true}),null);
  assert.ok(button('Gửi phản hồi'));
  view.unmount();
  pass('Tenants can create a request tied to their own tenancy and continue the conversation without owner status controls');

  ctx=fixture({role:'tenant',empty:true});ctx.failCreate='Lưu yêu cầu chưa thành công, hãy thử lại.';view=mount(ctx);
  click('Tạo yêu cầu');fillTicket();fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.ok(within(dialog()).getByRole('alert').textContent.includes(ctx.failCreate)));
  assert.equal(screen.getByLabelText('Tiêu đề',{exact:false}).value,'Đề nghị kiểm tra hóa đơn');
  assert.equal(screen.getByLabelText('Nội dung yêu cầu',{exact:false}).value,'Nhờ chủ trọ kiểm tra lại hóa đơn kỳ này.');
  ctx.failCreate='';fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.equal(ctx.mutations.length,2));
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Đề nghị kiểm tra hóa đơn'})));
  view.unmount();
  pass('A failed tenant submission keeps its form and values available for a successful retry');

  ctx=fixture({role:'tenant',empty:true});view=mount(ctx);click('Tạo yêu cầu');
  assert.ok(screen.getByRole('dialog',{name:'Tạo yêu cầu hỗ trợ'}));
  await act(async()=>{ctx.user={id:'owner-user',name:'Chủ trọ mẫu',role:'landlord'};ctx.emit();});
  assert.equal(screen.queryByRole('dialog',{name:'Tạo yêu cầu hỗ trợ'}),null);
  assert.equal(screen.queryByRole('button',{name:'Tạo yêu cầu',exact:true}),null);
  assert.deepEqual(ctx.mutations,[]);
  view.unmount();
  pass('Changing to an owner role removes an already-open tenant creation form');

  assert.deepEqual(requests,[]);
  console.log(`PASS: ${checks} support-ticket role interaction groups; no network or real-data writes.`);
} finally {
  await act(async()=>{cleanup();await new Promise(resolve=>setImmediate(resolve));});
  await vite.close();dom.window.close();globalThis.fetch=nativeFetch;
  for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
