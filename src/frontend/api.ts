export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const disconnected = 'Không kết nối được máy chủ Trozy. Vui lòng thử lại sau hoặc kiểm tra máy chủ ứng dụng.';
function responseError(status: number, gateway = false) {
  if (status >= 500) return gateway ? disconnected : 'Máy chủ Trozy chưa xử lý được yêu cầu. Vui lòng thử lại.';
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện yêu cầu này.';
  if (status === 404) return 'Không tìm thấy API được yêu cầu. Vui lòng tải lại ứng dụng hoặc kiểm tra phiên bản máy chủ Trozy.';
  if (status === 429) return 'Có quá nhiều yêu cầu. Vui lòng đợi một lát rồi thử lại.';
  return `Không thể thực hiện yêu cầu (HTTP ${status}). Vui lòng thử lại.`;
}
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(disconnected, 0);
  }
  let value: any;
  try { value = await response.json(); }
  catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(response.ok ? 'Máy chủ trả về dữ liệu không hợp lệ. Vui lòng tải lại ứng dụng và thử lại.' : responseError(response.status, true), response.status);
  }
  if (!response.ok) throw new ApiError(typeof value?.error === 'string' && value.error.trim() ? value.error : responseError(response.status), response.status);
  return value;
}
export const money = (value: any) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value)||0);
export const number = (value: any) => new Intl.NumberFormat('vi-VN').format(Number(value)||0);
export const date = (value: any) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
export const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'});
export function download(name: string, content: string, type = 'application/json') { const url=URL.createObjectURL(new Blob([content], {type})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
