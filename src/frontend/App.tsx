import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, Building2, Check, ChevronDown, DoorOpen, LifeBuoy, LoaderCircle, LogOut, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { BrandLogo } from './brand-logo';
import { api, ApiError } from './api';
import { InstallHelp, InstallWelcome } from './install-help';
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
function Brand({onNavigate}:{onNavigate?:()=>void}){return <a href="#dashboard" className="brand" aria-label="Trozy — Trang tổng quan" onClick={event=>{if(onNavigate){event.preventDefault();onNavigate();}}}><BrandLogo/></a>;}

function Auth({onAuthenticated}:{onAuthenticated:()=>Promise<void>}){
 const query=new URLSearchParams(location.search),action=query.get('action');
 const token=action==='create-landlord'?new URLSearchParams(location.hash.slice(1)).get('token')||'':query.get('token')||'';
 const [mode,setMode]=useState(action==='create-landlord'?'activate':action==='register-landlord'?'owner':action==='reset'?'forgot':action==='verify'?'verify':'login'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [localDemo,setLocalDemo]=useState(false),[mailAvailable,setMailAvailable]=useState(false);
 const [signupAvailable,setSignupAvailable]=useState<boolean|null>(null),[role,setRole]=useState('landlord');
 useEffect(()=>{
   const controller=new AbortController();
   api<{database?:string,mailAvailable?:boolean,landlordSignup?:boolean}>('/health',{signal:controller.signal}).then(health=>{
     if(controller.signal.aborted)return;
     setLocalDemo(health.database==='sqlite');
     setMailAvailable(health.mailAvailable!==false);
     setSignupAvailable(Boolean(health.landlordSignup));
     if(!health.landlordSignup)setMode(current=>current==='owner'?'register':current);
   }).catch(()=>{if(!controller.signal.aborted)setError('Không kiểm tra được kết nối với Trozy. Hãy tải lại trang để thử lại.');});
   return ()=>controller.abort();
 },[]);
 const [recoveryEmail,setRecoveryEmail]=useState(''),[resetToken,setResetToken]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  const values=Object.fromEntries(new FormData(e.currentTarget));
  try{
   if(mode==='login'){
    await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});await onAuthenticated();
   }else if(mode==='owner'){
    const address=String(values.email).trim();
    const result=await api('/auth/landlord-signup',{method:'POST',body:JSON.stringify({email:address})});
    setEmail(address);setMode('requested');setMessage(result.message);
   }else if(mode==='activate'){
    if(values.password!==values.confirmation)throw Error('Hai mật khẩu chưa khớp. Hãy nhập lại.');
    const result=await api('/auth/landlord-activate',{method:'POST',body:JSON.stringify({...values,token})});
    history.replaceState(null,'',location.pathname);
    setEmail(result.email);setPassword('');setMode('login');setMessage('Đã tạo tài khoản chủ trọ. Bạn có thể đăng nhập bằng mật khẩu vừa đặt.');
   }else if(mode==='register'){
    const result=await api('/auth/register',{method:'POST',body:JSON.stringify(values)});setMode('login');setEmail(String(values.email));setMessage(result.message);
   }else if(mode==='resend'){const result=await api('/auth/resend-registration',{method:'POST',body:JSON.stringify(values)});setMessage(result.message);setMode('login');
   }else if(mode==='forgot'){
    const result=await api('/auth/forgot-password',{method:'POST',body:JSON.stringify(values)});setRecoveryEmail(String(values.email));setMode('otp');setMessage(result.message);
   }else if(mode==='otp'){
    const result=await api('/auth/verify-reset-otp',{method:'POST',body:JSON.stringify({email:recoveryEmail,otp:values.otp})});
    setResetToken(result.resetToken);setMode('reset');
   }else if(mode==='reset'){
    await api('/auth/reset-password',{method:'POST',body:JSON.stringify({...values,token:resetToken})});history.replaceState(null,'',location.pathname);setMessage('Đã đặt lại mật khẩu. Bạn có thể đăng nhập.');setMode('login');await onAuthenticated();
   }else{
    const result=await api<{linkStatus?:string}>('/auth/verify-email',{method:'POST',body:JSON.stringify({token})});
    history.replaceState(null,'',location.pathname);
    setMessage(result.linkStatus==='pending'
      ?'Email đã được xác thực. Yêu cầu liên kết đang chờ chủ trọ duyệt. Bạn có thể đăng nhập để xem trạng thái.'
      :result.linkStatus==='expired'
        ?'Email đã được xác thực. Hãy đăng nhập và kiểm tra mã mời với chủ trọ để liên kết hồ sơ.'
        :'Email đã được xác thực. Bạn có thể đăng nhập.');
    setMode('login');await onAuthenticated();
   }
  }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 function changeMode(next:string){
   if(busy)return;
   if(location.search)history.replaceState(null,'',location.pathname);
   setResetToken('');setMode(next);setError('');setMessage('');
 }
 const pages:Record<string,[string,string,string]>={
   login:['Mừng bạn trở lại.','Đăng nhập bằng email và mật khẩu của bạn.','Đăng nhập'],
   owner:['Tạo tài khoản chủ trọ',signupAvailable===null?'Đang kiểm tra kết nối…':mailAvailable?'Nhập email để nhận liên kết tạo tài khoản quản lý nhà trọ.':'Trozy đang tạm ngừng gửi thư. Bạn có thể để lại email để nhận liên kết khi dịch vụ hoạt động. Yêu cầu được giữ trong 7 ngày.','Đăng ký bằng email'],
   requested:['Yêu cầu đăng ký chủ trọ',email,''],
   activate:['Hoàn tất tài khoản chủ trọ','Điền thông tin và đặt mật khẩu để bắt đầu quản lý nhà trọ của bạn.','Tạo tài khoản chủ trọ'],
   register:[role==='tenant'?'Tạo tài khoản người thuê':'Tạo tài khoản chủ trọ','Điền thông tin đăng ký và xác thực email để đăng nhập.','Tạo tài khoản'],
   resend:['Gửi lại thư xác thực','Nhập địa chỉ email bạn đã dùng để đăng ký.','Gửi lại thư'],
   forgot:['Quên mật khẩu?','Nhập email đã đăng ký để nhận mã OTP.','Gửi mã OTP'],
   otp:['Nhập mã OTP','Kiểm tra email để lấy mã đặt lại mật khẩu.','Kiểm tra mã OTP'],
   reset:['Đặt mật khẩu mới','Nhập mật khẩu bạn muốn dùng để đăng nhập.','Lưu mật khẩu'],
   verify:['Xác thực email','Nhấn xác thực để xác nhận địa chỉ email của bạn.','Xác thực email'],
 };
 const [title,description,submitLabel]=pages[mode];
 return <div className="auth-layout"><aside className="auth-story"><Brand/><div className="auth-story-main"><h1>Chăm chút tổ ấm.<br/><span>Nhẹ gánh quản lý.</span></h1><p>Từ căn phòng đầu tiên đến cả một khu trọ.<br/>Trozy giúp bạn kết nối mọi việc, mỗi ngày.</p><div className="auth-feature-list"><div><DoorOpen size={22}/><span><b>Phòng trọ, gọn trong tầm tay</b><small>Thông tin phòng, người thuê và hợp đồng.</small></span></div><div><ReceiptText size={22}/><span><b>Rõ ràng từng khoản thu</b><small>Điện nước, hóa đơn và lịch sử thanh toán.</small></span></div><div><MessageSquare size={22}/><span><b>Kết nối mỗi ngày</b><small>Thông báo, hỗ trợ và yêu cầu sửa chữa.</small></span></div></div><p className="auth-audience">Dành cho chủ trọ &amp; người thuê</p></div><div className="auth-story-bottom"><span>© 2026 Trozy · Nhóm 11</span><ShieldCheck size={18}/></div></aside><main className="auth-main"><div className="auth-mobile-brand"><Brand/></div><div className="auth-form-wrap">
  <h2>{title}</h2><p>{description}</p>
  <form key={mode} onSubmit={submit} className="stack">
    {mode==='owner'&&<Field label="Email của chủ trọ" name="email" type="email" autoComplete="email" defaultValue={email} maxLength={254} required/>}
    {(mode==='register'||mode==='activate')&&<>
      {mode==='register'&&<>
        {localDemo
          ?<Field label="Vai trò" name="role" type="select" value={role} onChange={e=>setRole(e.target.value)}><option value="landlord">Chủ trọ</option><option value="tenant">Người thuê</option></Field>
          :<input type="hidden" name="role" value={role}/>}
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} required/>
      </>}
      <Field label="Họ và tên" name="name" autoComplete="name" minLength={2} maxLength={150} required/>
      <Field label="Số điện thoại" name="phone" type="tel" autoComplete="tel" maxLength={30} required/>
      {mode==='register'&&role==='tenant'&&<Field label="Mã mời của chủ trọ" name="inviteCode" hint="Nếu đã có mã mời, nhập mã để liên kết với phòng đang thuê."/>}
      <Field label="Mật khẩu" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required hint="Từ 8 đến 128 ký tự."/>
      {mode==='activate'&&<Field label="Nhập lại mật khẩu" name="confirmation" type="password" autoComplete="new-password" required/>}
      <Field type="checkbox" name="consent" label="Tôi đồng ý xử lý dữ liệu cá nhân cần thiết để đăng ký và sử dụng Trozy." required/>
    </>}
    {mode==='login'&&<>
      <Field label="Email" type="email" value={email} autoComplete="username" required onChange={e=>setEmail(e.target.value)} placeholder="ban@example.com"/>
      <Field label="Mật khẩu" type="password" value={password} autoComplete="current-password" required onChange={e=>setPassword(e.target.value)}/>
      <div className="auth-options"><span><ShieldCheck size={15}/>Phiên đăng nhập được bảo vệ</span>
        {mailAvailable&&<><button type="button" className="text-button" onClick={()=>changeMode('forgot')}>Quên mật khẩu?</button>
        <button type="button" className="text-button" onClick={()=>changeMode('resend')}>Gửi lại thư xác thực</button></>}
      </div>
    </>}
    {(mode==='forgot'||mode==='resend')&&<Field label="Email đã đăng ký" type="email" name="email" defaultValue={email} required autoComplete="email"/>}
    {mode==='otp'&&<><Field label="Mã OTP từ email" autoComplete="one-time-code" inputMode="numeric" name="otp" required/>
      <button type="button" className="text-button" onClick={()=>changeMode('forgot')}>Yêu cầu mã mới</button></>}
    {mode==='reset'&&<><Field label="Mật khẩu mới" autoComplete="new-password" type="password" name="password" minLength={8} maxLength={128} required/><Field label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" name="confirmation" required/></>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {message&&<p className="form-success" role="status">{message}</p>}
    {submitLabel&&<button className="btn btn-primary auth-submit" disabled={busy||(mode==='owner'&&signupAvailable===null)}>
      {busy&&<LoaderCircle size={18} className="spin"/>}{submitLabel}<ArrowRight size={18}/>
    </button>}
  </form>
  <div className="auth-switch">
    {mode==='login'?<>
      <a className="text-button" href="?action=register-landlord">Tạo tài khoản chủ trọ</a>
      {mailAvailable&&<p><button type="button" className="text-button" onClick={()=>{setRole('tenant');changeMode('register');}}>Đăng ký tài khoản người thuê</button></p>}
    </>:<>
      {(mode==='requested'||mode==='activate'&&error)&&<p><a className="text-button" href="?action=register-landlord">Yêu cầu liên kết mới</a></p>}
      <button type="button" className="text-button" onClick={()=>changeMode('login')}>Quay lại đăng nhập</button>
    </>}
  </div>
  {mode==='login'&&<InstallHelp/>}
  {mode==='login'&&localDemo&&<div className="demo-accounts"><div className="demo-divider"><span>KHÁM PHÁ BẰNG TÀI KHOẢN MẪU</span></div><div className="grid-2"><button className="demo-account" onClick={()=>{setEmail('chu@trozy.vn');setPassword('Trozy@2026');setError('');}}><Building2 size={19}/><div><b>Chủ trọ</b><small>Quản lý & vận hành</small></div><ChevronDown size={15}/></button><button className="demo-account" onClick={()=>{setEmail('thue@trozy.vn');setPassword('Trozy@2026');setError('');}}><UserRound size={19}/><div><b>Người thuê</b><small>Cổng thông tin riêng</small></div><ChevronDown size={15}/></button></div><p className="demo-note">Dữ liệu minh họa · Chọn vai trò để điền thông tin đăng nhập</p></div>}</div><p className="auth-footer">Không gian của bạn, được chăm chút mỗi ngày.</p></main></div>;
}

export default function App(){
 const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[page,setPage]=useState<PageId>(initialPage),[toast,setToast]=useState<{message:string;kind:'success'|'error'}|null>(null),[logout,setLogout]=useState(false),[logoutAll,setLogoutAll]=useState(false),[search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
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
 if(loading)return <div className="app-loading"><BrandLogo/><LoaderCircle className="spin"/><p>Đang chuẩn bị không gian của bạn…</p></div>;
 if(loadError)return <div className="app-loading"><LifeBuoy size={38}/><h2>Chưa kết nối được máy chủ</h2><p>{loadError}</p><button className="btn btn-warning" onClick={()=>{setLoading(true);refresh().catch(e=>setLoadError(e.message)).finally(()=>setLoading(false));}}>Thử kết nối lại</button></div>;
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
            <button className="icon-button logout-button" onClick={()=>{setLogoutAll(false);setLogout(true);}} aria-label="Đăng xuất"><LogOut size={17}/></button>
          </div>
        </header>
        <QuickNavigation role={user.role} page={safePage} navigate={chooseSearchPage} unread={unread} issues={issues} resetKey={`${safePage}:${propertyId}:${user.id}`} onOpenChange={setQuickMenuOpen}/>
      </div>
      <main id="main-content" tabIndex={-1} className="main-content" key={`${safePage}-${propertyId}`}>{propertyId===emptyWorkspaceId&&!['properties','profile','settings','assistant'].includes(safePage)?<section className="card"><div className="card-body stack"><h1>Chưa có cơ sở đang hoạt động</h1><p className="muted">{user.role==='landlord'?'Thêm cơ sở hoặc kiểm tra các cơ sở đã lưu trữ để bắt đầu quản lý.':'Cơ sở của bạn hiện chưa khả dụng. Vui lòng liên hệ chủ trọ.'}</p>{user.role==='landlord'&&<div><button className="btn btn-primary" onClick={()=>navigate('properties')}>Quản lý cơ sở</button></div>}</div></section>:<><CorePages page={safePage}/><TenancyPages page={safePage}/><OperationsPages page={safePage}/>{safePage==='assistant'&&<AssistantPage/>}</>}</main>
      <footer className="app-footer"><span>© 2026 Trozy. Chăm chút không gian sống.</span></footer>
    </div>
    {safePage!=='assistant'&&<button inert={mobile&&narrow} className="assistant-fab" onClick={()=>navigate('assistant')}><Sparkles size={18}/>Hỏi Trozy</button>}
    {toast&&<div className={`toast toast-${toast.kind}`} role={toast.kind==='error'?'alert':'status'}><span>{toast.kind==='success'?<Check size={18}/>:<X size={18}/>}</span><p>{toast.message}</p><button className="icon-button" onClick={()=>setToast(null)} aria-label="Đóng thông báo"><X size={15}/></button></div>}
    <InstallWelcome key={user.id} userId={user.id}/>
    {propertyManager&&user.role==='landlord'&&<PropertyManager mode={propertyManager} onClose={closePropertyManager} onSelect={id=>setRequestedProperty({userId:user.id,id})}/>}
    {logout&&<Modal title="Đăng xuất khỏi Trozy?" onClose={()=>setLogout(false)}><label className="inline"><input type="checkbox" checked={logoutAll} onChange={e=>setLogoutAll(e.target.checked)}/>Đăng xuất trên tất cả thiết bị</label><div className="form-actions"><button className="btn" onClick={()=>setLogout(false)}>Ở lại</button><button className="btn btn-danger" onClick={async()=>{try{await api('/auth/logout',{method:'POST',body:JSON.stringify({allDevices:logoutAll})});setBootstrap(null);setLogout(false);}catch(error){notify((error as Error).message,'error');}}}>Đăng xuất</button></div></Modal>}
  </div>
 </AppContext.Provider>;
}
