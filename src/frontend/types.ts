export type RecordData = { id: string; [key: string]: any };
export type User = { id: string; name: string; email: string; role: 'landlord'|'tenant'; tenantId?: string; phone?: string; verified?: boolean; avatarFileId?:string; notificationPreferences?:{invoices?:boolean;contracts?:boolean;maintenance?:boolean;general?:boolean} };
export const collections = ['properties','rooms','tenants','contracts','readings','meterSubmissions','meterProfiles','services','invoices','payments','deposits','transactions','issues','assets','handovers','notifications','tickets','documents','vehicles','amenities','bookings','settings','audits','credits'] as const;
export type Collection = typeof collections[number];
export type AppData = Record<Collection, RecordData[]>;
export type Bootstrap = { user: User; data: AppData; capabilities?: Record<string,boolean> };
export type PageId = 'dashboard'|'properties'|'rooms'|'tenants'|'contracts'|'readings'|'services'|'invoices'|'payments'|'deposits'|'transactions'|'issues'|'assets'|'handovers'|'notifications'|'tickets'|'documents'|'vehicles'|'amenities'|'insights'|'reports'|'settings'|'profile'|'assistant';
