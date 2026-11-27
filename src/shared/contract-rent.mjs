/** A price change inside the billing month needs the parties' agreed rent. */
export function periodRent(contract, period) {
  const changes=(contract.addenda||[]).filter(a=>a.rent!==a.previousRent);
  if(changes.some(a=>a.effectiveDate.slice(0,7)===period&&a.effectiveDate.slice(8)!=='01'))return null;
  return changes.filter(a=>a.effectiveDate<=period+'-01').at(-1)?.rent??changes[0]?.previousRent??contract.rent;
}
