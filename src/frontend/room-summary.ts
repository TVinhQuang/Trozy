import { today } from './api';
import type { AppData, RecordData } from './types';

/** An allowlisted operational snapshot, never an invoice or a verified AI result. */
export type RoomSummary = {
  id: string;
  roomId: string;
  propertyId: string;
  propertyName: string;
  code: string;
  floor: number | string;
  status: string;
  listedRent: number;
  contractRent: number | null;
  area: number;
  capacity: number;
  tenantNames: string[];
  tenantCount: number;
  contractId: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  contractState: string;
  heldDeposit: number;
  reservationDeposit: number;
  roomDebt: number;
  overdueDebt: number;
  latestReadingPeriod: string | null;
  electricReading: number | null;
  waterReading: number | null;
  openIssues: number;
  amenities: string;
  description: string;
};

const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const readingValue = (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const belongsTo = (row: RecordData, room: RecordData) => row.roomId === room.id && row.propertyId === room.propertyId;
const newestContract = (a: RecordData, b: RecordData) => String(b.activatedAt || b.endedAt || b.startDate || '').localeCompare(String(a.activatedAt || a.endedAt || a.startDate || '')) || String(b.id).localeCompare(String(a.id));

export function buildRoomSummaries(data: AppData, rooms: RecordData[], asOf = today()): RoomSummary[] {
  // Callers pass only permitted rooms. Never discover more rooms through joined collections.
  return rooms.map(room => {
    const contracts = data.contracts.filter(row => belongsTo(row, room));
    const activeContracts = contracts.filter(row => row.status === 'active').sort(newestContract);
    const handoverContracts = room.status === 'handover' ? contracts.filter(row => row.status === 'ended').sort(newestContract) : [];
    const contract = activeContracts[0] || handoverContracts[0];
    const tenants = data.tenants.filter(row => belongsTo(row, room) && row.status === 'active');
    const currentTenant = contract && tenants.find(row => row.id === contract.tenantId);
    // tenantCount counts maintained tenant profiles, not free-text 'members' prose.
    const currentTenants = contract ? (currentTenant ? [currentTenant] : []) : tenants;
    const ledger = contract ? data.deposits.filter(row => belongsTo(row, room) && row.contractId === contract.id && row.tenantId === contract.tenantId) : [];
    const netDeposit = (entries: RecordData[]) => entries.reduce((balance, row) => {
      const value = amount(row.amount);
      return balance + (row.type === 'receipt' ? value : ['deduction', 'refund'].includes(row.type) ? -value : 0);
    }, 0);
    const heldDeposit = netDeposit(ledger);
    // Draft contracts can hold real reservation receipts. Keep those separate
    // from the present tenancy and never treat a promised contract deposit as cash.
    const reservationContracts = contracts.filter(row => row.status === 'draft');
    const reservationDeposit = netDeposit(data.deposits.filter(row => belongsTo(row, room) && reservationContracts.some(reservation => row.contractId === reservation.id && row.tenantId === reservation.tenantId)));
    const unpaid = data.invoices.filter(row => belongsTo(row, room) && row.status === 'issued');
    const remaining = (invoice: RecordData) => Math.max(0, amount(invoice.total) - amount(invoice.paid));
    const roomDebt = unpaid.reduce((total, row) => total + remaining(row), 0);
    const overdueDebt = unpaid.filter(row => typeof row.dueDate === 'string' && row.dueDate < asOf).reduce((total, row) => total + remaining(row), 0);
    const reading = data.readings.filter(row => belongsTo(row, room) && row.confirmed === true)
      .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')) || String(b.id).localeCompare(String(a.id)))[0];
    const contractState = !contract ? 'Chưa có hợp đồng hiện tại'
      : contract.status === 'ended' ? 'Chờ bàn giao'
      : contract.startDate > asOf ? 'Chưa đến ngày thuê'
      : contract.endDate < asOf ? 'Đã quá hạn hợp đồng' : 'Đang hiệu lực';
    return {
      id: room.id,
      roomId: room.id,
      propertyId: String(room.propertyId || ''),
      propertyName: String(data.properties.find(row => row.id === room.propertyId)?.name || 'Chưa có tên cơ sở'),
      code: String(room.code ?? ''),
      floor: room.floor ?? 0,
      status: String(room.status || 'vacant'),
      listedRent: amount(room.price),
      contractRent: contract ? readingValue(contract.rent) : null,
      area: amount(room.area),
      capacity: amount(room.capacity),
      tenantNames: currentTenants.map(row => String(row.name || 'Chưa có tên')),
      tenantCount: currentTenants.length,
      contractId: contract?.id || null,
      contractStart: typeof contract?.startDate === 'string' ? contract.startDate : null,
      contractEnd: typeof contract?.endDate === 'string' ? contract.endDate : null,
      contractState,
      heldDeposit,
      reservationDeposit,
      roomDebt,
      overdueDebt,
      latestReadingPeriod: typeof reading?.period === 'string' ? reading.period : null,
      electricReading: readingValue(reading?.electricNew),
      waterReading: readingValue(reading?.waterNew),
      openIssues: data.issues.filter(row => belongsTo(row, room) && ['new', 'progress', 'resolved'].includes(row.status)).length,
      amenities: String(room.amenities || ''),
      description: String(room.description || ''),
    };
  });
}
