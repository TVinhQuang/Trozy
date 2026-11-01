/** Only explicitly confirmed profiles from this reader may drive automatic recognition. */
export function confirmedMeterProfile(store,ownerId,roomId,utility){
 const profile=store.list('meterProfiles',ownerId).find(row=>row.roomId===roomId&&row.utility===utility);
 return ['visionstate-v2','meter-reader-v3'].includes(profile?.reader)&&profile.confirmed===true&&profile.meterType==='mechanical'&&Number.isSafeInteger(profile.version)&&profile.version>=1&&validMeterLayout(profile.digits,profile.decimals)?profile:null;
}
export const meterEngine=utility=>utility==='electric'?'paddleocr':'visionstate';
export const meterModel=utility=>utility==='electric'?'paddleocr-ppocrv6':'wheels-v2';
export function validMeterLayout(digits,decimals){
 return Number.isSafeInteger(digits)&&digits>=1&&digits<=12&&Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=4&&decimals<digits&&digits-decimals<=9;
}
export function meterProfileDTO(profile){
 return profile?{...Object.fromEntries(['id','roomId','utility','digits','decimals','meterType','version','confirmed','reader'].map(key=>[key,profile[key]])),engine:meterEngine(profile.utility)}:null;
}
