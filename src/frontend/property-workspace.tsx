import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, List, Plus } from 'lucide-react';
import type { RecordData, User } from './types';

export const emptyWorkspaceId = '__trozy_no_property__';
const preferenceKey = (userId: string) => `trozy.workspace.${userId}`;

/** Normalize before rendering content so a missing preference never means all properties. */
export function usePropertyWorkspace(userId: string | undefined, properties: RecordData[]) {
  const [selection, setSelection] = useState<{ userId: string; id: string } | null>(null);
  const available = properties.filter(property => !property.archived);
  let saved = '';
  if (userId) { try { saved = localStorage.getItem(preferenceKey(userId)) || ''; } catch { /* Storage may be unavailable. */ } }
  const requested = selection && selection.userId === userId ? selection.id : saved;
  const propertyId = !userId ? '' : available.find(property => property.id === requested)?.id || available[0]?.id || emptyWorkspaceId;
  useEffect(() => {
    if (!userId) return;
    setSelection(current => current?.userId === userId && current.id === propertyId ? current : { userId, id: propertyId });
    try {
      if (propertyId === emptyWorkspaceId) localStorage.removeItem(preferenceKey(userId));
      else localStorage.setItem(preferenceKey(userId), propertyId);
    } catch { /* A working selection must not depend on browser storage. */ }
  }, [userId, propertyId]);
  const setPropertyId = useCallback((id: string) => {
    if (userId && properties.some(property => property.id === id && !property.archived)) setSelection({ userId, id });
  }, [userId, properties]);
  return { propertyId, setPropertyId };
}

type PickerProps = { properties: RecordData[]; propertyId: string; onChange: (id: string) => void; role: User['role']; onOpenChange: (open: boolean) => void; onManage?: () => void; onCreate?: () => void };
export function PropertyWorkspacePicker({ properties, propertyId, onChange, role, onOpenChange, onManage, onCreate }: PickerProps) {
  const available = properties.filter(property => !property.archived);
  const selected = available.find(property => property.id === propertyId);
  const [open, setOpen] = useState(false), [placement, setPlacement] = useState({ maxHeight: 360, width: 288, left: 0 });
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const initialIndex = useRef(0), listId = useId();
  const signature = available.map(property => property.id).join('\0');
  useEffect(() => { onOpenChange(open); }, [open, onOpenChange]);
  useEffect(() => () => onOpenChange(false), [onOpenChange]);
  useEffect(() => {
    if (list.current?.contains(document.activeElement)) trigger.current?.focus();
    setOpen(false);
  }, [propertyId, role, signature]);
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[initialIndex.current]?.focus();
    const bounds = root.current?.getBoundingClientRect();
    const width = Math.min(Math.max(bounds?.width || 0, 288), 384, Math.max(0, window.innerWidth - 24));
    const left = Math.max(12, Math.min(bounds?.left || 0, window.innerWidth - width - 12)) - (bounds?.left || 0);
    setPlacement({ maxHeight: Math.max(44, window.innerHeight - (trigger.current?.getBoundingClientRect().bottom || 0) - 20), width, left });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const resized = () => { if (root.current?.contains(document.activeElement)) trigger.current?.focus(); setOpen(false); };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('resize', resized);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', resized); };
  }, [open]);
  function show(edge?: 'first' | 'last') {
    initialIndex.current = edge === 'first' ? 0 : edge === 'last' ? available.length - 1 : Math.max(0, available.findIndex(property => property.id === propertyId));
    setOpen(true);
  }
  function choose(id: string) { onChange(id); trigger.current?.focus(); setOpen(false); }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false); return; }
    if (!open) return;
    if (event.key === 'Tab') {
      const actions = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.workspace-property-actions button') || []);
      if (!event.shiftKey && list.current?.contains(document.activeElement) && actions.length) { event.preventDefault(); actions[0].focus(); return; }
      if (event.shiftKey && document.activeElement === actions[0]) { event.preventDefault(); list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[initialIndex.current]?.focus(); return; }
      if (event.shiftKey && actions.includes(document.activeElement as HTMLButtonElement) && document.activeElement !== actions[0]) return;
      if (!event.shiftKey && actions.includes(document.activeElement as HTMLButtonElement) && document.activeElement !== actions.at(-1)) return;
      trigger.current?.focus(); setOpen(false); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (!list.current?.contains(document.activeElement)) return;
    event.preventDefault();
    const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }
  return <div ref={root} className="workspace-picker" onKeyDown={keyboard} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="workspace-selector" role="combobox" aria-label="Chọn cơ sở nhà trọ" aria-describedby={listId + '-selected-name'} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={!available.length} data-property-id={selected?.id} onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
      if (!open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); show(event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined); }
    }}>
      <Building2 size={21}/><span className="workspace-selector-copy"><span>{role === 'landlord' ? 'Không gian quản lý' : 'Không gian của bạn'}</span><b id={listId + '-selected-name'} className="workspace-selected-value" title={selected?.name}>{selected?.name || 'Chưa có cơ sở'}</b></span><ChevronDown size={15}/>
    </button>
    {open && <div className="workspace-property-popup" style={placement}><div ref={list} id={listId} className="workspace-property-list" role="listbox" aria-label="Cơ sở nhà trọ">
      {available.map((property, index) => <button key={property.id} type="button" role="option" tabIndex={-1} aria-selected={property.id === propertyId} aria-label={property.name} aria-describedby={listId + '-address-' + index} data-property-id={property.id} onClick={() => choose(property.id)}><Building2 size={19}/><span><b>{property.name}</b><small id={listId + '-address-' + index} title={property.address || ''}>{property.address || 'Chưa có địa chỉ'}</small></span>{property.id === propertyId && <Check size={17}/>}</button>)}
    </div>{role === 'landlord' && (onManage || onCreate) && <div className="workspace-property-actions">
      {onManage && <button type="button" onClick={() => { setOpen(false); onManage(); }}><List size={17}/>Quản lý danh sách cơ sở</button>}
      {onCreate && <button type="button" onClick={() => { setOpen(false); onCreate(); }}><Plus size={17}/>Thêm cơ sở mới</button>}
    </div>}</div>}
  </div>;
}
