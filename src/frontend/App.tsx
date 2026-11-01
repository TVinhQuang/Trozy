import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, Building2, Check, ChevronDown, DoorOpen, Home, LifeBuoy, LoaderCircle, LogOut, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { api, ApiError } from './api';
import { AppContext, type AppContextType } from './context';
import { collections, type Bootstrap, type PageId } from './types';
import { CorePages } from './pages/Core';
import { TenancyPages } from './pages/Tenancy';
import { OperationsPages } from './pages/Operations';
import { AssistantPage } from './pages/Assistant';
import { Field, Modal } from './ui';
import { useMeterOwnerUpdates } from './meter-owner-updates';
import { useWorkspaceShell } from './workspace-shell';
import { allNav } from './navigation';
import { QuickNavigation, SecondaryNavigation } from './workspace-navigation';
import { useScrollNavigation } from './use-scroll-navigation';
import { emptyWorkspaceId, PropertyWorkspacePicker, usePropertyWorkspace } from './property-workspace';
import { PropertyManager } from './property-manager';

function initialPage():PageId {const hash=location.hash.slice(1);return allNav.some(i=>i.id===hash)||hash==='profile'?hash as PageId:'dashboard';}
function Brand({onNavigate}:{onNavigate?:()=>void}){return <a href="#dashboard" className="brand" aria-label="Trozy — Trang tổng quan" onClick={event=>{if(onNavigate){event.preventDefault();onNavigate();}}}><span className="brand-mark"><Home size={23} strokeWidth={2.2}/></span><span className="brand-word">Trozy<span>.</span><small>YOUR SPACE, SIMPLIFIED</small></span></a>;}

function Auth({onAuthenticated}:{onAuthenticated:()=>Promise<void>}){
 const query=new URLSearchParams(location.search),token=query.get('token')||'';
 const [mode,setMode]=useState(query.get('action')==='reset'?'reset':query.get('action')==='verify'?'verify':'login'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  const values=Object.fromEntries(new FormData(e.currentTarget));
  try{
   if(mode==='login'){
    await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});await onAuthenticated();
   }else if(mode==='register'){
    await api('/auth/register',{method:'POST',body:JSON.stringify(values)});await onAuthenticated();
   }else if(mode==='forgot'){
    const result=await api('/auth/forgot-password',{method:'POST',body:JSON.stringify(values)});setMessage(result.message);
   }else if(mode==='reset'){
    await api('/auth/reset-password',{method:'POST',body:JSON.stringify({...values,token})});history.replaceState(null,'',location.pathname);setMessage('Đã đặt lại mật khẩu. Bạn có thể đăng nhập.');setMode('login');await onAuthenticated();
   }else{
    await api('/auth/verify-email',{method:'POST',body:JSON.stringify({token})});history.replaceState(null,'',location.pathname);setMessage('Email đã được xác thực. Bạn có thể đăng nhập.');setMode('login');await onAuthenticated();
   }
  }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 function changeMode(next:string){setMode(next);setError('');setMessage('');}
 return <div className="auth-layout"><aside className="auth-story"><Brand/><div className="auth-story-main"><h1>Chăm chút tổ ấm.<br/><span>Nhẹ gánh quản lý.</span></h1><p>Từ căn phòng đầu tiên đến cả một khu trọ.<br/>Trozy giúp bạn kết nối mọi việc, mỗi ngày.</p><div className="auth-feature-list"><div><DoorOpen size={22}/><span><b>Phòng trọ, gọn trong tầm tay</b><small>Thông tin phòng, người thuê và hợp đồng.</small></span></div><div><ReceiptText size={22}/><span><b>Rõ ràng từng khoản thu</b><small>Điện nước, hóa đơn và lịch sử thanh toán.</small></span></div><div><MessageSquare size={22}/><span><b>Kết nối mỗi ngày</b><small>Thông báo, hỗ trợ và yêu cầu sửa chữa.</small></span></div></div><p className="auth-audience">Dành cho chủ trọ &amp; người thuê</p></div><div className="auth-story-bottom"><span>© 2026 Trozy · Nhóm 11</span><ShieldCheck size={18}/></div></aside><main className="auth-main"><div className="auth-mobile-brand"><Brand/></div><div className="auth-form-wrap"><h2>{mode==='login'?'Mừng bạn trở lại.':mode==='register'?'Bắt đầu cùng Trozy.':mode==='forgot'?'Quên mật khẩu?':mode==='reset'?'Đặt mật khẩu mới':'Xác thực email'}</h2><p>{mode==='login'?'Đăng nhập để tiếp tục quản lý không gian của bạn.':mode==='register'?'Tạo tài khoản chủ trọ hoặc liên kết phòng đang thuê.':'Làm theo hướng dẫn để bảo vệ tài khoản của bạn.'}</p><form onSubmit={submit} className="stack">{mode==='register'?<><Field label="Họ và tên" name="name" autoComplete="name" required/><Field label="Email" name="email" type="email" autoComplete="email" required/><Field label="Mật khẩu" name="password" type="password" minLength={8} autoComplete="new-password" required hint="Từ 8 đến 128 ký tự."/><Field label="Bạn sử dụng Trozy với vai trò" name="role" type="select"><option value="landlord">Chủ trọ</option><option value="tenant">Người thuê</option></Field><Field label="Mã mời của chủ trọ" name="inviteCode" hint="Dành cho người thuê để liên kết đúng phòng và hợp đồng."/></>:mode==='login'?<><Field label="Email" type="email" value={email} autoComplete="username" required onChange={e=>setEmail(e.target.value)} placeholder="ban@example.com"/><Field label="Mật khẩu" type="password" value={password} autoComplete="current-password" required onChange={e=>setPassword(e.target.value)}/><div className="auth-options"><span><ShieldCheck size={15}/>Phiên đăng nhập được bảo vệ</span><button type="button" className="text-button" onClick={()=>changeMode('forgot')}>Quên mật khẩu?</button></div></>:mode==='forgot'?<Field label="Email đã đăng ký" type="email" name="email" required autoComplete="email"/>:mode==='reset'?<Field label="Mật khẩu mới" type="password" name="password" minLength={8} required/>:<p>Nhấn xác thực để xác nhận địa chỉ email của bạn.</p>}{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success" role="status">{message}</p>}<button className="btn btn-primary auth-submit" disabled={busy}>{busy?<LoaderCircle size={18} className="spin"/>:null}{mode==='login'?'Đăng nhập':mode==='register'?'Tạo tài khoản':mode==='forgot'?'Gửi hướng dẫn':mode==='reset'?'Lưu mật khẩu':'Xác thực email'}<ArrowRight size={18}/></button></form><p className="auth-switch">{mode==='login'?<>Chưa có tài khoản? <button className="text-button" onClick={()=>changeMode('register')}>Đăng ký ngay</button></>:<>Đã có tài khoản? <button className="text-button" onClick={()=>changeMode('login')}>Quay lại đăng nhập</button></>}</p>{mode==='login'&&<div className="demo-accounts"><div className="demo-divider"><span>KHÁM PHÁ BẰNG TÀI KHOẢN MẪU</span></div><div className="grid-2"><button className="demo-account" onClick={()=>{setEmail('chu@trozy.vn');setPassword('Trozy@2026');setError('');}}><Building2 size={19}/><div><b>Chủ trọ</b><small>Quản lý & vận hành</small></div><ChevronDown size={15}/></button><button className="demo-account" onClick={()=>{setEmail('thue@trozy.vn');setPassword('Trozy@2026');setError('');}}><UserRound size={19}/><div><b>Người thuê</b><small>Cổng thông tin riêng</small></div><ChevronDown size={15}/></button></div><p className="demo-note">Dữ liệu minh họa · Chọn vai trò để điền thông tin đăng nhập</p></div>}</div><p className="auth-footer">Không gian của bạn, được chăm chút mỗi ngày.</p></main></div>;
}

export default function App(){
 const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[page,setPage]=useState<PageId>(initialPage),[toast,setToast]=useState<{message:string;kind:'success'|'error'}|null>(null),[logout,setLogout]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
 const [propertyManager,setPropertyManager]=useState<'list'|'create'|null>(null),[requestedProperty,setRequestedProperty]=useState<{userId:string;id:string}|null>(null);
 const {propertyId,setPropertyId}=usePropertyWorkspace(bootstrap?.user.id,bootstrap?.data.properties||[]);
 const {compact,narrow,mobile,setMobile,toggleCompact,sidebarRef,menuRef,searchRef}=useWorkspaceShell();
 const [chromeFocused,setChromeFocused]=useState(false),[quickMenuOpen,setQuickMenuOpen]=useState(false),[propertyMenuOpen,setPropertyMenuOpen]=useState(false);
 const chromeKeyboard=useRef(false);
 const searchNavigationFrame=useRef<number|undefined>(undefined);
 const toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const notify=useCallback((message:string,kind:'success'|'error'='success')=>{clearTimeout(toastTimer.current);setToast({message,kind});toastTimer.current=setTimeout(()=>setToast(null),5000);},[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const next=await api<Bootstrap>('/bootstrap',signal?{signal}:{});if(signal?.aborted)return;for(const key of collections)next.data[key]??=[];setBootstrap(next);setLoadError('');}catch(e){if(signal?.aborted)return;if(e instanceof ApiError&&e.status===401)setBootstrap(null);else throw e;}},[]);
 useMeterOwnerUpdates(bootstrap?.user||null,refresh);
 useEffect(()=>{refresh().catch(e=>setLoadError(e.message)).finally(()=>setLoading(false));return()=>{clearTimeout(toastTimer.current);if(searchNavigationFrame.current!==undefined)window.cancelAnimationFrame(searchNavigationFrame.current);};},[refresh]);
 const navigate=useCallback((next:PageId)=>{setPage(next);location.hash=next;setMobile(false);setSearchOpen(false);window.scrollTo(0,0);},[]);
 useEffect(()=>{const listener=()=>setPage(initialPage());window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
 const allowed=allNav.filter(item=>bootstrap?.user.role==='landlord'||item.tenant);
 const safePage=page==='profile'||allowed.some(i=>i.id===page)?page:'dashboard';
 const {hidden:chromeHidden,reveal:revealChrome}=useScrollNavigation({locked:mobile||searchOpen||logout||chromeFocused||quickMenuOpen||propertyMenuOpen||!!propertyManager,resetKey:`${safePage}:${propertyId}:${bootstrap?.user.id||'guest'}`});
 function chooseSearchPage(next:PageId){
  (document.activeElement as HTMLElement|null)?.blur();
  setChromeFocused(false);navigate(next);setSearch('');
  if(searchNavigationFrame.current!==undefined)window.cancelAnimationFrame(searchNavigationFrame.current);
  searchNavigationFrame.current=window.requestAnimationFrame(()=>{searchNavigationFrame.current=undefined;document.getElementById('main-content')?.focus();});
 }
 useEffect(()=>{
  if(!requestedProperty)return;
  if(!bootstrap||requestedProperty.userId!==bootstrap.user.id){setRequestedProperty(null);return;}
  if(bootstrap.data.properties.some(property=>property.id===requestedProperty.id&&!property.archived)){
   setPropertyId(requestedProperty.id);setRequestedProperty(null);navigate('dashboard');
  }
 },[bootstrap,requestedProperty,setPropertyId,navigate]);
 useEffect(()=>{setPropertyManager(null);setRequestedProperty(null);},[bootstrap?.user.id]);
 function closePropertyManager(){
  setPropertyManager(null);
  if(searchNavigationFrame.current!==undefined)window.cancelAnimationFrame(searchNavigationFrame.current);
  searchNavigationFrame.current=window.requestAnimationFrame(()=>{searchNavigationFrame.current=undefined;(document.querySelector<HTMLElement>('.workspace-add')||document.querySelector<HTMLElement>('.workspace-selector'))?.focus();});
 }
 const ctx=useMemo<AppContextType|null>(()=>bootstrap?{bootstrap,user:bootstrap.user,data:bootstrap.data,propertyId,setPropertyId,page:safePage,navigate,refresh,notify,mutate:async(collection,values,id)=>{const result=await api(`/${collection}${id?`/${encodeURIComponent(id)}`:''}`,{method:id?'PATCH':'POST',body:JSON.stringify(values)});await refresh();return result;},remove:async(collection,id)=>{await api(`/${collection}/${encodeURIComponent(id)}`,{method:'DELETE'});await refresh();},action:async(name,values)=>{const result=await api(`/actions/${name}`,{method:'POST',body:JSON.stringify(values)});await refresh();return result;}}:null,[bootstrap,propertyId,setPropertyId,safePage,navigate,refresh,notify]);
 if(loading)return <div className="app-loading"><span className="brand-mark"><Home size={26}/></span><h2>Trozy.</h2><LoaderCircle className="spin"/><p>Đang chuẩn bị không gian của bạn…</p></div>;
 if(loadError)return <div className="app-loading"><LifeBuoy size={38}/><h2>Chưa kết nối được máy chủ</h2><p>{loadError}</p><button className="btn btn-primary" onClick={()=>{setLoading(true);refresh().catch(e=>setLoadError(e.message)).finally(()=>setLoading(false));}}>Thử kết nối lại</button></div>;
 if(!bootstrap||!ctx||(new URLSearchParams(location.search).has('token')&&['reset','verify'].includes(new URLSearchParams(location.search).get('action')||'')))return <Auth onAuthenticated={async()=>{await refresh();navigate('dashboard');}}/>;
 const user=bootstrap.user,unread=bootstrap.data.notifications.filter(n=>(!n.propertyId||n.propertyId===propertyId)&&!n.readBy?.includes(user.id)).length,issues=bootstrap.data.issues.filter(issue=>issue.status==='new'&&(!issue.propertyId||issue.propertyId===propertyId)).length;
 return <AppContext.Provider value={ctx}>
  <div className={`app-shell ${compact?'sidebar-compact':''}`} onKeyDownCapture={()=>{chromeKeyboard.current=true;}} onPointerDownCapture={()=>{chromeKeyboard.current=false;setChromeFocused(false);}}>
    <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>Đến nội dung chính</a>
    {mobile&&<button className="sidebar-overlay" onClick={()=>setMobile(false)} aria-label="Đóng menu"/>}
    <aside id="workspace-navigation" ref={sidebarRef} className={`sidebar ${mobile?'mobile-open':''}`} role={narrow&&mobile?'dialog':undefined} aria-modal={narrow&&mobile?true:undefined} aria-label="Menu Trozy" aria-hidden={narrow&&!mobile?true:undefined} inert={narrow&&!mobile}>
      <div className="sidebar-brand"><Brand onNavigate={()=>navigate('dashboard')}/><button className="icon-button sidebar-close" onClick={()=>setMobile(false)} aria-label="Đóng menu"><X size={19}/></button></div>
      <SecondaryNavigation role={user.role} page={safePage} navigate={navigate} compact={compact} onExpand={toggleCompact} unread={unread} issues={issues}/>
      <div className="sidebar-footer">
        <button className="help-link" title={user.role==='landlord'?'Mở Trợ lý Trozy':'Mở yêu cầu hỗ trợ'} onClick={()=>navigate(user.role==='landlord'?'assistant':'tickets')}><span className="help-icon">{user.role==='landlord'?<Sparkles size={19}/>:<LifeBuoy size={19}/>}</span><span><b>Cần một chút hỗ trợ?</b>{' '}<small>{user.role==='landlord'?'Trao đổi với Trợ lý Trozy':'Gửi yêu cầu đến chủ trọ'}</small></span><ArrowRight size={16}/></button>
        <div className="sidebar-bottom"><button className="icon-button" aria-label={compact?'Mở rộng thanh bên':'Thu gọn thanh bên'} onClick={toggleCompact} aria-pressed={compact}>{compact?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}<span>{compact?'Mở rộng':'Thu gọn menu'}</span></button></div>
      </div>
    </aside>
    <div className="main-shell" inert={mobile&&narrow}>
      <div className={`workspace-chrome ${chromeHidden?'chrome-hidden':''}`} onFocusCapture={()=>{revealChrome();if(chromeKeyboard.current)setChromeFocused(true);}} onKeyDownCapture={()=>setChromeFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setChromeFocused(false);}}>
        <header className="topbar">
          <div className="topbar-left">
            <button ref={menuRef} className="icon-button mobile-menu" aria-label="Mở menu" aria-controls="workspace-navigation" aria-expanded={mobile} onClick={()=>setMobile(true)}><Menu size={22}/></button>
            <button className="icon-button desktop-sidebar-toggle" aria-label={compact?'Mở rộng thanh bên':'Thu gọn thanh bên'} aria-controls="workspace-navigation" aria-expanded={!compact} onClick={toggleCompact}>{compact?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}</button>
            <div className="workspace-controls"><PropertyWorkspacePicker properties={bootstrap.data.properties} propertyId={propertyId} onChange={setPropertyId} role={user.role} onOpenChange={setPropertyMenuOpen} onManage={()=>setPropertyManager('list')} onCreate={()=>setPropertyManager('create')}/>{user.role==='landlord'&&<button className="icon-button workspace-add" aria-label="Thêm cơ sở" title="Thêm cơ sở" onClick={()=>setPropertyManager('create')}><Plus size={20}/></button>}</div>
            <span className="workspace-page-context"><small><span className="live-dot"/>Dữ liệu đã kết nối</small></span>
          </div>
          <div className="topbar-right">
            <div className="global-search" onFocus={()=>setSearchOpen(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setSearchOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'){setSearchOpen(false);(document.activeElement as HTMLElement|null)?.blur();}}}><Search size={17}/><input ref={searchRef} placeholder="Tìm trang, tác vụ…" aria-label="Tìm trang trong Trozy" value={search} onChange={event=>{setSearch(event.target.value);setSearchOpen(true);}}/><kbd>/</kbd>
              {searchOpen&&<div className="search-results" role="region" aria-label="Kết quả tìm trang">{!allowed.some(item=>item.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))&&<p className="search-empty">Chưa tìm thấy trang phù hợp. Thử từ khóa khác.</p>}{allowed.filter(item=>item.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).slice(0,7).map(item=><button key={item.id} onMouseDown={event=>event.preventDefault()} onClick={()=>chooseSearchPage(item.id)}><item.icon size={16}/>{item.label}<ArrowRight size={14}/></button>)}</div>}
            </div>
            <button className="icon-button notification-button" aria-label={`${unread} thông báo chưa đọc`} onClick={()=>navigate('notifications')}><Bell size={20}/>{unread>0&&<i/>}</button>
            <div className="topbar-divider"/>
            <button className="profile-button" onClick={()=>navigate('profile')}><span className="user-avatar">{user.avatarFileId?<img alt="Avatar" src={`/api/files/${encodeURIComponent(user.avatarFileId)}?inline=1`}/>:user.name.split(' ').slice(-1)[0].charAt(0)}</span><span><b>{user.name}</b><small>{user.role==='landlord'?'Chủ trọ':'Người thuê'}</small></span><ChevronDown size={15}/></button>
            <button className="icon-button logout-button" onClick={()=>setLogout(true)} aria-label="Đăng xuất"><LogOut size={17}/></button>
          </div>
        </header>
        <QuickNavigation role={user.role} page={safePage} navigate={chooseSearchPage} unread={unread} issues={issues} resetKey={`${safePage}:${propertyId}:${user.id}`} onOpenChange={setQuickMenuOpen}/>
      </div>
      <main id="main-content" tabIndex={-1} className="main-content" key={`${safePage}-${propertyId}`}>{propertyId===emptyWorkspaceId&&!['properties','profile','settings','assistant'].includes(safePage)?<section className="card"><div className="card-body stack"><h1>Chưa có cơ sở đang hoạt động</h1><p className="muted">{user.role==='landlord'?'Thêm cơ sở hoặc kiểm tra các cơ sở đã lưu trữ để bắt đầu quản lý.':'Cơ sở của bạn hiện chưa khả dụng. Vui lòng liên hệ chủ trọ.'}</p>{user.role==='landlord'&&<div><button className="btn btn-primary" onClick={()=>navigate('properties')}>Quản lý cơ sở</button></div>}</div></section>:<><CorePages page={safePage}/><TenancyPages page={safePage}/><OperationsPages page={safePage}/>{safePage==='assistant'&&<AssistantPage/>}</>}</main>
      <footer className="app-footer"><span>© 2026 Trozy. Chăm chút không gian sống.</span></footer>
    </div>
    {safePage!=='assistant'&&<button inert={mobile&&narrow} className="assistant-fab" onClick={()=>navigate('assistant')}><Sparkles size={18}/>Hỏi Trozy</button>}
    {toast&&<div className={`toast toast-${toast.kind}`} role={toast.kind==='error'?'alert':'status'}><span>{toast.kind==='success'?<Check size={18}/>:<X size={18}/>}</span><p>{toast.message}</p><button className="icon-button" onClick={()=>setToast(null)} aria-label="Đóng thông báo"><X size={15}/></button></div>}
    {propertyManager&&user.role==='landlord'&&<PropertyManager mode={propertyManager} onClose={closePropertyManager} onSelect={id=>setRequestedProperty({userId:user.id,id})}/>}
    {logout&&<Modal title="Đăng xuất khỏi Trozy?" onClose={()=>setLogout(false)}><p>Bạn có thể đăng nhập lại bất cứ lúc nào để tiếp tục công việc.</p><div className="form-actions"><button className="btn" onClick={()=>setLogout(false)}>Ở lại</button><button className="btn btn-danger" onClick={async()=>{try{await api('/auth/logout',{method:'POST'});setBootstrap(null);setLogout(false);}catch(error){notify((error as Error).message,'error');}}}>Đăng xuất</button></div></Modal>}
  </div>
 </AppContext.Provider>;
}
