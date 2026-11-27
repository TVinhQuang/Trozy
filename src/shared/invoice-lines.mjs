export function invoiceLines(invoice) {
  if (invoice.items?.length || invoice.settlementId) return invoice.items || [];
  const lines = [{name:'Tiền phòng',quantity:1,rate:invoice.rent}];
  for (const [key,name] of [['electric','Điện'],['water','Nước']]) {
    const quantity=Number(invoice[key+'New']||0)-Number(invoice[key+'Old']||0);
    lines.push({name,quantity,rate:invoice[key+'Rate']});
  }
  lines.push(...(invoice.serviceItems?.length?invoice.serviceItems:[{name:'Dịch vụ',quantity:1,rate:invoice.serviceFee}]));
  if(invoice.adjustment)lines.push({name:'Điều chỉnh',quantity:1,rate:invoice.adjustment});
  return lines.map(item=>({...item,amount:item.amount??(item.quantity??1)*Number(item.rate||0)}));
}
