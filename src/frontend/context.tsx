import { createContext, useContext } from 'react';
import type { AppData, Bootstrap, Collection, PageId, RecordData, User } from './types';
export type AppContextType = {
  user: User; data: AppData; propertyId: string; setPropertyId: (id:string)=>void;
  page: PageId; navigate:(page:PageId)=>void; refresh:()=>Promise<void>;
  notify:(message:string, kind?:'success'|'error')=>void;
  mutate:(collection:Collection, values:Partial<RecordData>, id?:string)=>Promise<any>;
  remove:(collection:Collection,id:string)=>Promise<void>;
  action:(name:string, values:any)=>Promise<any>;
  bootstrap:Bootstrap;
};
export const AppContext=createContext<AppContextType|null>(null);
export function useApp() { const context=useContext(AppContext);if(!context)throw new Error('Thiếu AppContext');return context; }
export function useRecords(collection:Collection) {const {data,propertyId}=useApp();return data[collection].filter(row=>!propertyId||!row.propertyId||row.propertyId===propertyId);}
