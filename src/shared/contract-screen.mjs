const fold=value=>value.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase();
const title=/\b(?:hop dong (?:cho )?thue|rental agreement|tenancy agreement|lease agreement)\b/;
const field=/\b(?:ben (?:cho )?thue|nguoi thue|gia thue|tien thue|tien (?:dat )?coc|phong|thoi han|ngay (?:bat dau|ket thuc)|tu ngay|den ngay|tenant|landlord|rent|deposit|room|start date|end date|email|dien thoai|ngay sinh)\b/;
const card=/\b(?:citizen identity card|identity card|identification card|personal identification|dac diem nhan dang|dau vet rieng|noi dang ky khai sinh|place of origin|date of expiry|co quan cap can cuoc)\b|(?:^|\n)\s*(?:the )?(?:can cuoc(?: cong dan)?|chung minh (?:nhan dan|thu)|cccd|cmnd)\s*(?:$|\n)|\bIDVNM|VNM[0-9<]{6,}/im;
const privateLabel=/\b(?:cccd|cmnd|can cuoc|chung minh|dinh danh|ho chieu|passport|so tai khoan|bank account|identity number)\b/;

export function screenContractText(text){
  if(typeof text!=='string'||text.length>16000)return '';
  const lines=text.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
  const plain=fold(lines.join('\n'));
  if(card.test(plain)||!title.test(plain))return '';
  const permitted=lines.filter(line=>{
    const normalized=fold(line);
    return line.length<=300&&!privateLabel.test(normalized)&&(title.test(normalized)||field.test(normalized));
  }).map(line=>line.replace(/\b(?:\d[ -]?){11}\d\b/g,'[đã che]'));
  return permitted.some(line=>field.test(fold(line))&&!title.test(fold(line)))?permitted.join('\n'):'';
}
