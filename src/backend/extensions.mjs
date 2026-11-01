/** B01, B02 and B04 have local providers; B03 is removed and B05 remains an extension. Providers receive authorized data.
 * Do not grant providers a database handle or authority to mutate money/contracts.
 * Return suggested values only; normal core validation/confirmation remains mandatory.
 */
export const extensionNames=['B01','B02','B03','B04','B05'];
const providers=new Map();
export function registerExtension(name,provider) {
  if(name==='B03'||!extensionNames.includes(name)||typeof provider!=='function')throw new TypeError('Unknown extension or invalid provider');
  providers.set(name,provider);
}
export const extensionCapabilities=()=>Object.fromEntries(extensionNames.map(name=>[name,providers.has(name)]));
export async function runExtension(name,{user,data,input,file}) {
  const provider=providers.get(name);
  if(!provider){const error=new Error('Tính năng này chưa được kết nối. Bạn vẫn có thể sử dụng các nghiệp vụ thông thường.');error.status=501;throw error;}
  return provider({user:structuredClone(user),data:structuredClone(data),input:structuredClone(input||{}),...(file?{file:{bytes:Buffer.from(file.bytes),type:file.type}}:{})});
}
