import { Activity, Bell, BookOpen, Building2, CalendarCheck, Car, CircleDollarSign, Coffee, DoorOpen, FileBarChart2, FileCheck2, Gauge, Layers, MessageSquare, Package, ReceiptText, SlidersHorizontal, Sparkles, Users, Wallet, Wrench, Zap, type LucideIcon } from 'lucide-react';
import type { PageId } from './types';

export type NavigationItem = { id: PageId; label: string; icon: LucideIcon; tenant?: boolean };
export const allNav: NavigationItem[] = [
  { id:'dashboard', label:'Tổng quan', icon:Gauge, tenant:true },
  { id:'rooms', label:'Phòng trọ', icon:DoorOpen, tenant:true },
  { id:'readings', label:'Điện & nước', icon:Zap, tenant:true },
  { id:'invoices', label:'Hóa đơn', icon:ReceiptText, tenant:true },
  { id:'payments', label:'Lịch sử thanh toán', icon:CircleDollarSign, tenant:true },
  { id:'contracts', label:'Hợp đồng', icon:FileCheck2, tenant:true },
  { id:'tenants', label:'Người thuê', icon:Users },
  { id:'issues', label:'Bảo trì & sự cố', icon:Wrench, tenant:true },
  { id:'properties', label:'Cơ sở nhà trọ', icon:Building2 },
  { id:'services', label:'Dịch vụ & phụ phí', icon:Layers },
  { id:'assets', label:'Tài sản & thiết bị', icon:Package, tenant:true },
  { id:'vehicles', label:'Phương tiện', icon:Car, tenant:true },
  { id:'amenities', label:'Tiện ích chung', icon:Coffee, tenant:true },
  { id:'handovers', label:'Bàn giao phòng', icon:CalendarCheck, tenant:true },
  { id:'transactions', label:'Sổ thu chi', icon:FileBarChart2 },
  { id:'deposits', label:'Tiền cọc', icon:Wallet, tenant:true },
  { id:'reports', label:'Báo cáo', icon:FileBarChart2 },
  { id:'insights', label:'Tiêu thụ điện nước', icon:Activity, tenant:true },
  { id:'notifications', label:'Thông báo', icon:Bell, tenant:true },
  { id:'tickets', label:'Yêu cầu hỗ trợ', icon:MessageSquare, tenant:true },
  { id:'documents', label:'Tài liệu & nội quy', icon:BookOpen, tenant:true },
  { id:'assistant', label:'Trợ lý Trozy', icon:Sparkles, tenant:true },
  { id:'settings', label:'Cài đặt', icon:SlidersHorizontal },
];
const items = (ids: PageId[]) => ids.map(id => allNav.find(item => item.id === id)!);
export const primaryNavigation = items(['dashboard','rooms','readings','invoices','payments','contracts','tenants','issues']);
export const secondaryNavigation = [
  { id:'management', label:'Quản lý cơ sở', icon:Building2, items:items(['properties','services','assets','vehicles','amenities','handovers']) },
  { id:'finance', label:'Tài chính & báo cáo', icon:FileBarChart2, items:items(['transactions','deposits','reports','insights']) },
  { id:'communication', label:'Trao đổi & tài liệu', icon:MessageSquare, items:items(['notifications','tickets','documents']) },
];
export const utilityNavigation = items(['assistant','settings']);
