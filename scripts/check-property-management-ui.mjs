// Real owner property-management interactions with synthetic data and intercepted
// CRUD calls. This does not touch a business database or verify browser layout.
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
const nativeFetch = globalThis.fetch, requests=[];
globalThis.fetch = async url => { requests.push(String(url)); throw new Error(`Property management UI checks must not request the network: ${url}`); };

const vite = await createVite({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {createElement:h,useState} = await import('react');
const {render,screen,fireEvent,within,waitFor,cleanup,act,configure} = await import('@testing-library/react');
configure({asyncUtilTimeout:6000});
const {AppContext} = await vite.ssrLoadModule('/src/frontend/context.tsx');
const {PropertyManager} = await vite.ssrLoadModule('/src/frontend/property-manager.tsx');
const {collections} = await vite.ssrLoadModule('/src/frontend/types.ts');
let checks=0;
const pass=message=>{checks++;console.log(`PASS ${message}`);};
const p1={id:'p1',name:'Nhà An Nhiên',address:'12 Đường Hoa, Phường 1',contact:'Chủ nhà mẫu',phone:'0900000000',floors:2,rules:'Giữ yên lặng',archived:false};
const p2={id:'p2',name:'Nhà Bình Minh',address:'24 Đường Nắng, Phường 2',contact:'',phone:'',floors:1,rules:'',archived:false};
const p3={id:'p3',name:'Nhà đã lưu trữ',address:'36 Đường Cũ, Phường 3',contact:'',phone:'',floors:1,rules:'',archived:true};

function fixture({role='landlord',empty=false}={}) {
  const data=Object.fromEntries(collections.map(name=>[name,[]]));
  data.properties=empty?[]:structuredClone([p1,p2,p3]);
  data.rooms=empty?[]:[{id:'r1',propertyId:'p1',code:'101',status:'vacant',floor:1}];
  const user={id:role==='landlord'?'owner':'tenant',name:'Người dùng thử',role};
  const ctx={data,user,mutations:[],deletions:[],selections:[],navigation:[],notifications:[],closed:0,failMutation:'',failRemove:'',pending:null,emit:null};
  ctx.value={user,data,bootstrap:{user,data},page:'properties',propertyId:'p1',setPropertyId(id){ctx.selections.push(id);},navigate(page){ctx.navigation.push(page);},notify(...args){ctx.notifications.push(args);},refresh:async()=>{},
    mutate:async(collection,payload,id)=>{
      ctx.mutations.push(structuredClone([collection,payload,id]));
      if(ctx.pending)await ctx.pending.promise;
      if(ctx.failMutation)throw new Error(ctx.failMutation);
      assert.equal(collection,'properties');
      const row=id?{...ctx.data.properties.find(item=>item.id===id),...payload,id}:{...payload,id:'created-property'};
      ctx.data.properties=id?ctx.data.properties.map(item=>item.id===id?row:item):[...ctx.data.properties,row];
      ctx.emit?.();return row;
    },
    remove:async(collection,id)=>{
      ctx.deletions.push([collection,id]);
      if(ctx.pending)await ctx.pending.promise;
      if(ctx.failRemove)throw new Error(ctx.failRemove);
      assert.equal(collection,'properties');ctx.data.properties=ctx.data.properties.filter(item=>item.id!==id);ctx.emit?.();
    },action:async()=>assert.fail('Property manager must not call unrelated business actions')};
  return ctx;
}
function mount(ctx,mode='list',props={}) {
  function Harness() {
    const [,update]=useState(0),[open,setOpen]=useState(true);
    ctx.emit=()=>update(value=>value+1);
    const value={...ctx.value,data:ctx.data,bootstrap:{user:ctx.user,data:ctx.data}};
    return h(AppContext.Provider,{value},open?h(PropertyManager,{mode,...props,onClose(){ctx.closed++;setOpen(false);}}):null);
  }
  return render(h(Harness));
}
const dialog=()=>screen.getByRole('dialog');
const button=name=>screen.getByRole('button',{name,exact:true});
const change=(label,value)=>fireEvent.change(screen.getByLabelText(label,{exact:false}),{target:{value:String(value)}});
const click=name=>fireEvent.click(button(name));
const fillNew=()=>{change('Tên cơ sở','Nhà Hồng Mới');change('Địa chỉ','48 Đường Mới, Phường 4');change('Người liên hệ','Nguyễn Hồng');change('Số điện thoại','0912345678');change('Số tầng',3);change('Nội quy','Không hút thuốc trong phòng.');};
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

try {
  let ctx=fixture(),view=mount(ctx);
  assert.ok(screen.getByRole('dialog',{name:'Danh sách cơ sở của bạn'}));
  for(const property of [p1,p2,p3]){assert.ok(screen.getByText(property.name,{exact:true}));assert.ok(screen.getByText(property.address,{exact:true}));}
  assert.ok(button('Mở cơ sở '+p1.name));assert.ok(button('Mở cơ sở '+p2.name));
  assert.equal(screen.queryByRole('button',{name:'Mở cơ sở '+p3.name,exact:true}),null);
  assert.deepEqual(ctx.mutations,[]);assert.deepEqual(ctx.deletions,[]);
  click('Mở cơ sở '+p2.name);
  assert.deepEqual(ctx.selections,['p2']);assert.equal(ctx.closed,1);
  view.unmount();
  pass('Property list shows names/addresses and archived state, while opening an active workspace selects it without CRUD writes');

  ctx=fixture({empty:true});view=mount(ctx,'create');
  assert.ok(screen.getByRole('dialog',{name:'Thêm cơ sở nhà trọ'}));
  assert.equal(screen.getByLabelText('Tên cơ sở',{exact:false}).required,true);
  assert.equal(screen.getByLabelText('Địa chỉ',{exact:false}).required,true);
  assert.equal(screen.getByLabelText('Số tầng',{exact:false}).min,'1');
  fillNew();click('Tạo cơ sở');
  await waitFor(()=>assert.equal(ctx.mutations.length,1));
  assert.deepEqual(ctx.mutations[0],['properties',{name:'Nhà Hồng Mới',address:'48 Đường Mới, Phường 4',contact:'Nguyễn Hồng',phone:'0912345678',floors:3,rules:'Không hút thuốc trong phòng.',archived:false},undefined]);
  await waitFor(()=>assert.deepEqual(ctx.selections,['created-property']));
  assert.equal(ctx.closed,1);assert.equal(screen.queryByRole('dialog'),null);
  view.unmount();
  pass('Create submits typed property fields, uses the returned ID for selection and closes only after successful creation');

  ctx=fixture({empty:true});const selectedByParent=[];view=mount(ctx,'create',{onSelect:id=>selectedByParent.push(id)});fillNew();click('Tạo cơ sở');
  await waitFor(()=>assert.deepEqual(selectedByParent,['created-property']));
  assert.deepEqual(ctx.selections,[],'An explicit parent selection callback must replace the stale context setter');
  assert.equal(ctx.closed,1);view.unmount();
  pass('Create delegates new-workspace selection to the provided parent callback when integration must await refreshed data');

  ctx=fixture({empty:true});view=mount(ctx,'create');
  fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent,/tên cơ sở/i));
  assert.deepEqual(ctx.mutations,[]);
  fillNew();change('Địa chỉ','ab');fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent,/địa chỉ/i));
  assert.deepEqual(ctx.mutations,[]);
  change('Địa chỉ','Địa chỉ hợp lệ');change('Số tầng','2.5');fireEvent.submit(dialog().querySelector('form'));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent,/số tầng.*số nguyên/i));
  assert.deepEqual(ctx.mutations,[]);
  click('Hủy');assert.equal(ctx.closed,1);assert.deepEqual(ctx.mutations,[]);view.unmount();
  pass('Direct form submission cannot bypass name, address and whole-floor validation, and cancelling creation makes no write');

  ctx=fixture();view=mount(ctx);click('Chỉnh sửa cơ sở '+p2.name);
  assert.equal(screen.getByLabelText('Tên cơ sở',{exact:false}).value,p2.name);
  change('Tên cơ sở','Nhà Bình Minh cập nhật');change('Địa chỉ','Địa chỉ mới đã kiểm tra');click('Lưu thay đổi');
  await waitFor(()=>assert.equal(ctx.mutations.length,1));
  assert.equal(ctx.mutations[0][0],'properties');assert.equal(ctx.mutations[0][2],'p2');
  assert.equal(ctx.mutations[0][1].name,'Nhà Bình Minh cập nhật');
  assert.equal(ctx.mutations[0][1].address,'Địa chỉ mới đã kiểm tra');
  assert.deepEqual(ctx.selections,[]);assert.deepEqual(ctx.deletions,[]);
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Danh sách cơ sở của bạn'})));
  click('Xóa cơ sở Nhà Bình Minh cập nhật');
  assert.ok(screen.getByRole('dialog',{name:'Xóa cơ sở'}));assert.deepEqual(ctx.deletions,[]);
  click('Quay lại danh sách');assert.deepEqual(ctx.deletions,[]);
  view.unmount();
  pass('Edit updates the intended ID without changing workspace, and cancelling deletion leaves the property untouched');

  ctx=fixture();view=mount(ctx);click('Xóa cơ sở '+p1.name);
  assert.ok(screen.getByRole('dialog',{name:'Xóa cơ sở'}));
  assert.equal(screen.queryByRole('button',{name:'Xóa cơ sở',exact:true}),null);
  assert.ok(button('Lưu trữ cơ sở'));assert.deepEqual(ctx.deletions,[]);
  click('Quản lý phòng');
  assert.deepEqual(ctx.selections,['p1']);assert.deepEqual(ctx.navigation,['rooms']);assert.equal(ctx.closed,1);
  view.unmount();
  pass('A property with rooms cannot be deleted and offers the scoped room-management route instead');

  ctx=fixture();ctx.failRemove='Cơ sở có lịch sử nghiệp vụ; hãy dùng thao tác lưu trữ.';view=mount(ctx);click('Xóa cơ sở '+p2.name);click('Xóa cơ sở');
  await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.match(screen.getByRole('alert').textContent,/lịch sử nghiệp vụ/);
  assert.equal(ctx.data.properties.some(item=>item.id==='p2'),true);
  assert.ok(button('Lưu trữ cơ sở'),'A blocked history deletion must retain a direct archive alternative');
  assert.equal(button('Xóa cơ sở').disabled,false);
  assert.equal(ctx.deletions.length,1);
  ctx.failRemove='';click('Xóa cơ sở');
  await waitFor(()=>assert.equal(ctx.deletions.length,2));
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Danh sách cơ sở của bạn'})));
  assert.equal(ctx.data.properties.some(item=>item.id==='p2'),false);
  view.unmount();
  pass('Delete requires explicit confirmation; a server history guard reports an error without optimistic removal and permits retry');

  ctx=fixture();view=mount(ctx);click('Lưu trữ cơ sở '+p2.name);
  assert.ok(screen.getByRole('dialog',{name:'Lưu trữ cơ sở'}));assert.deepEqual(ctx.mutations,[]);
  click('Lưu trữ');
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Danh sách cơ sở của bạn'})));
  assert.deepEqual(ctx.mutations[0],['properties',{archived:true},'p2']);
  assert.equal(screen.queryByRole('button',{name:'Mở cơ sở '+p2.name,exact:true}),null);
  click('Khôi phục cơ sở '+p2.name);click('Khôi phục');
  await waitFor(()=>assert.ok(screen.getByRole('dialog',{name:'Danh sách cơ sở của bạn'})));
  assert.deepEqual(ctx.mutations[1],['properties',{archived:false},'p2']);
  assert.ok(button('Mở cơ sở '+p2.name));assert.deepEqual(ctx.deletions,[]);
  view.unmount();
  pass('Archive and restore remain separate confirmed updates and preserve records rather than deleting history');

  ctx=fixture({empty:true});ctx.pending=deferred();view=mount(ctx,'create');fillNew();click('Tạo cơ sở');
  await waitFor(()=>assert.equal(ctx.mutations.length,1));
  assert.equal(button('Đang lưu…').disabled,true);assert.equal(button('Hủy').disabled,true);
  assert.equal(screen.getByLabelText('Tên cơ sở',{exact:false}).disabled,true);
  fireEvent.click(button('Đang lưu…'));assert.equal(ctx.mutations.length,1);
  await act(async()=>{ctx.pending.resolve();await ctx.pending.promise;});
  await waitFor(()=>assert.equal(ctx.closed,1));view.unmount();
  ctx=fixture({empty:true});ctx.failMutation='Chưa kết nối được máy chủ. Vui lòng thử lại.';view=mount(ctx,'create');fillNew();click('Tạo cơ sở');
  await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.equal(ctx.closed,0);assert.deepEqual(ctx.selections,[]);assert.equal(button('Tạo cơ sở').disabled,false);
  assert.equal(screen.getByLabelText('Tên cơ sở',{exact:false}).value,'Nhà Hồng Mới');
  ctx.failMutation='';click('Tạo cơ sở');await waitFor(()=>assert.equal(ctx.closed,1));view.unmount();
  pass('Pending creation disables duplicate clicks and cancellation; failed saves preserve form values and allow retry');

  ctx=fixture({empty:true});view=mount(ctx);assert.ok(button('Thêm cơ sở'));assert.deepEqual(ctx.mutations,[]);view.unmount();
  ctx=fixture({role:'tenant'});view=mount(ctx);assert.equal(screen.queryByRole('dialog'),null);assert.deepEqual(ctx.mutations,[]);assert.deepEqual(ctx.deletions,[]);view.unmount();
  ctx=fixture({role:'tenant'});view=mount(ctx,'create');assert.equal(screen.queryByRole('dialog'),null);assert.deepEqual(ctx.mutations,[]);view.unmount();
  assert.deepEqual(requests,[]);
  pass('Empty owner lists retain a create action while tenants receive no property-management or CRUD controls');
  console.log(`PASS: ${checks} property-management UI groups with synthetic records and intercepted CRUD. No business data or browser layout was changed.`);
} finally {
  cleanup();await vite.close();dom.window.close();globalThis.fetch=nativeFetch;
  for(const[name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
