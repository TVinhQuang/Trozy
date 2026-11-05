import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { primaryNavigation, secondaryNavigation, utilityNavigation, type NavigationItem } from './navigation';
import type { PageId, User } from './types';

type NavigationProps = { role:User['role']; page:PageId; navigate:(page:PageId)=>void; unread:number; issues:number };
const permitted = (item:NavigationItem, role:User['role']) => role === 'landlord' || item.tenant;

function NavigationContent({item,short=false,unread,issues}:{item:NavigationItem;short?:boolean;unread:number;issues:number}) {
  const Icon=item.icon;
  return <><Icon size={18} strokeWidth={1.8}/><span>{item.id==='payments'&&short?'Thanh toán':item.id==='issues'&&short?'Bảo trì':item.label}</span>
    {item.id==='issues'&&issues>0&&<b className="nav-counter">{issues}</b>}
    {item.id==='notifications'&&unread>0&&<b className="nav-counter">{unread}</b>}
  </>;
}

function NavigationButton({item,page,navigate,compact=false,unread,issues,className='nav-link',menuItem=false}:Omit<NavigationProps,'role'> & {item:NavigationItem;compact?:boolean;className?:string;menuItem?:boolean}) {
  return <button className={`${className} ${page===item.id?'active':''}`} role={menuItem?'menuitem':undefined} tabIndex={menuItem?-1:undefined} data-nav-page={item.id} onClick={()=>navigate(item.id)} aria-current={page===item.id?'page':undefined} aria-label={item.label} title={compact?item.label:undefined}>
    <NavigationContent item={item} short={className==='quick-nav-link'} unread={unread} issues={issues}/>
  </button>;
}

export function SecondaryNavigation({role,page,navigate,compact,onExpand,unread,issues}:NavigationProps & {compact:boolean;onExpand:()=>void}) {
  const [openGroup,setOpenGroup]=useState(()=>secondaryNavigation.find(group=>group.items.some(item=>item.id===page))?.id||'');
  useEffect(()=>{
    const active=secondaryNavigation.find(group=>group.items.some(item=>item.id===page));
    if(active)setOpenGroup(active.id);
  },[page]);
  return <nav className="sidebar-nav" aria-label="Điều hướng bổ sung">
    <p className="sidebar-nav-intro">{role === 'landlord' ? 'Công cụ quản lý' : 'Cổng thông tin người thuê'}</p>
    {secondaryNavigation.map(group=>{
      const entries=group.items.filter(item=>permitted(item,role));
      if(!entries.length)return null;
      const open=openGroup===group.id&&!compact;
      const active=entries.some(item=>item.id===page);
      const count=group.id==='communication'?unread:0;
      return <div className="nav-section" key={group.id}>
        <button className={`nav-section-toggle ${active?'active-group':''}`} aria-label={group.label} aria-expanded={open} aria-controls={`nav-section-${group.id}`} title={compact?group.label:undefined} onClick={()=>{
          if(compact){onExpand();setOpenGroup(group.id);}else setOpenGroup(open?'':group.id);
        }}><group.icon size={19} strokeWidth={1.8}/><span>{group.label}</span>{count>0&&<b className="nav-counter">{count}</b>}<ChevronDown size={15} className="nav-section-chevron"/></button>
        <div id={`nav-section-${group.id}`} className="nav-section-items" hidden={!open}>
          {open&&entries.map(item=><NavigationButton key={item.id} item={item} page={page} navigate={navigate} unread={unread} issues={issues}/>) }
        </div>
      </div>;
    })}
    <div className="nav-utilities">{utilityNavigation.filter(item=>permitted(item,role)).map(item=><NavigationButton key={item.id} item={item} page={page} navigate={navigate} compact={compact} unread={unread} issues={issues}/>)}</div>
  </nav>;
}

export function QuickNavigation({role,page,navigate,unread,issues,resetKey,onOpenChange}:NavigationProps & {resetKey?:string;onOpenChange?:(open:boolean)=>void}) {
  const available=useMemo(()=>primaryNavigation.filter(item=>permitted(item,role)),[role]);
  const container=useRef<HTMLElement>(null), measure=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  const [visibleCount,setVisibleCount]=useState(available.length), [open,setOpen]=useState(false), [menuHeight,setMenuHeight]=useState(360);
  const countRef=useRef(visibleCount), openRef=useRef(open), lastWidth=useRef(0), restoreAfterLayout=useRef(false), openingEdge=useRef<'first'|'last'>('first');
  countRef.current=visibleCount;openRef.current=open;
  const menuId=useId(), visible=available.slice(0,visibleCount), overflow=available.slice(visibleCount), activeOverflow=overflow.find(item=>item.id===page);

  // Measure natural, active-weight labels rather than assuming a particular screen
  // size or font. The measuring spans cannot receive focus or duplicate AT routes.
  useLayoutEffect(()=>{
    const element=container.current, sizing=measure.current;
    if(!element||!sizing)return;
    let disposed=false;
    const update=(viewportResize=false)=>{
      if(disposed)return;
      const css=window.getComputedStyle(element);
      const width=element.clientWidth-(parseFloat(css.paddingLeft)||0)-(parseFloat(css.paddingRight)||0);
      const gap=parseFloat(css.columnGap)||4;
      const widths=Array.from(sizing.querySelectorAll<HTMLElement>('[data-measure-page]')).map(item=>item.getBoundingClientRect().width);
      const moreWidth=sizing.querySelector<HTMLElement>('[data-measure-more]')?.getBoundingClientRect().width||0;
      // SSR and non-layout renderers have no geometry. Keep all routes available.
      if(width<=0||!moreWidth||widths.some(value=>value<=0))return;
      let count=available.length;
      if(widths.reduce((total,value)=>total+value,0)+gap*(widths.length-1)>width-1){
        count=0;let used=moreWidth;
        for(const itemWidth of widths){if(used+gap+itemWidth>width-1)break;used+=gap+itemWidth;count++;}
      }
      const countChanged=count!==countRef.current, resized=lastWidth.current>0&&Math.abs(width-lastWidth.current)>=1;
      if(countChanged||((resized||viewportResize)&&openRef.current)){
        restoreAfterLayout.current=element.contains(document.activeElement);
        setOpen(false);
      }
      lastWidth.current=width;
      if(countChanged){countRef.current=count;setVisibleCount(count);}
    };
    const resized=()=>update(true), observed=()=>update();
    update();window.addEventListener('resize',resized);
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(observed);
    observer?.observe(element);observer?.observe(sizing);
    sizing.querySelectorAll<HTMLElement>('[data-measure-page], [data-measure-more]').forEach(item=>observer?.observe(item));
    document.fonts?.addEventListener('loadingdone',observed);
    document.fonts?.ready.then(()=>{if(!disposed)update();});
    return()=>{disposed=true;window.removeEventListener('resize',resized);document.fonts?.removeEventListener('loadingdone',observed);observer?.disconnect();};
  },[available,issues,unread]);

  useLayoutEffect(()=>{
    if(restoreAfterLayout.current){
      restoreAfterLayout.current=false;
      const current=container.current?.querySelector<HTMLButtonElement>('.quick-nav-link[aria-current="page"]');
      (current||trigger.current||container.current?.querySelector<HTMLButtonElement>('.quick-nav-link'))?.focus();
    }
    if(open){
      const items=menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      (openingEdge.current==='last'?items?.[items.length-1]:items?.[0])?.focus();
      setMenuHeight(Math.max(44,window.innerHeight-(container.current?.getBoundingClientRect().bottom||0)-16));
    }
  },[visibleCount,open]);
  useEffect(()=>{onOpenChange?.(open);},[open,onOpenChange]);
  useEffect(()=>()=>onOpenChange?.(false),[onOpenChange]);
  useEffect(()=>{
    if(menu.current?.contains(document.activeElement))trigger.current?.focus();
    setOpen(false);
  },[page,role,resetKey]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!container.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside,true);
    return()=>document.removeEventListener('pointerdown',outside,true);
  },[open]);

  function showMenu(edge:'first'|'last'='first') {openingEdge.current=edge;setOpen(true);}
  function menuKeyboard(event:React.KeyboardEvent<HTMLDivElement>) {
    if(event.key==='Tab'){
      // Restore the menu's position in the tab order before native Tab proceeds.
      trigger.current?.focus();setOpen(false);return;
    }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')||[]);
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
  return <nav ref={container} className="quick-navigation" aria-label="Chức năng thường dùng" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}} onKeyDown={event=>{
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();trigger.current?.focus();setOpen(false);}
  }}>
    {visible.map(item=><NavigationButton key={item.id} item={item} page={page} navigate={navigate} unread={unread} issues={issues} className="quick-nav-link"/>)}
    {overflow.length>0&&<div className="quick-nav-more">
      <button ref={trigger} className={`quick-nav-link quick-nav-more-trigger ${activeOverflow?'active':''}`} aria-label={`Thêm chức năng (${overflow.length})${activeOverflow?', đang xem '+activeOverflow.label:''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} title={activeOverflow?.label} onClick={()=>{if(open)setOpen(false);else showMenu();}} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();showMenu(event.key==='ArrowUp'?'last':'first');}
      }}><Ellipsis size={18}/><span>Thêm ({overflow.length})</span><ChevronDown size={14}/></button>
      {open&&<div ref={menu} id={menuId} className="quick-nav-menu" role="menu" aria-label="Chức năng khác" style={{maxHeight:menuHeight}} onKeyDown={menuKeyboard}>
        {overflow.map(item=><NavigationButton key={item.id} item={item} page={page} navigate={next=>{setOpen(false);navigate(next);}} unread={unread} issues={issues} className="quick-more-link" menuItem/>)}
      </div>}
    </div>}
    <div ref={measure} className="quick-nav-measure" aria-hidden="true" inert>
      {available.map(item=><span key={item.id} className="quick-nav-link active" data-measure-page={item.id}><NavigationContent item={item} short unread={unread} issues={issues}/></span>)}
      <span className="quick-nav-link quick-nav-more-trigger active" data-measure-more><Ellipsis size={18}/><span>Thêm ({available.length})</span><ChevronDown size={14}/></span>
    </div>
  </nav>;
}
