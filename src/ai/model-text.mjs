export function cleanForModel(value){
  return String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email đã ẩn]').replace(/\b(?:0|\+84)[ .-]?(?:\d[ .-]?){8,10}\b/g,'[số liên hệ đã ẩn]').replace(/\b\d{9,19}\b/g,'[mã định danh đã ẩn]').slice(0,12000);
}
