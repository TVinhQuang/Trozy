/** Recognize supported raster headers without trusting a filename or browser MIME.
 * This identifies a format only. Meter readers must still fully decode and apply
 * their byte/pixel/frame limits before processing it.
 */
export const RASTER_FORMAT_MIMES=Object.freeze({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'});

export function rasterMimeFromBytes(value){
 if(!(value instanceof Uint8Array))return null;
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(value.buffer,value.byteOffset,value.byteLength);
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return RASTER_FORMAT_MIMES.png;
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return RASTER_FORMAT_MIMES.jpeg;
 if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16)))return RASTER_FORMAT_MIMES.webp;
 return null;
}

export function isSupportedRasterFormat(format){return Object.hasOwn(RASTER_FORMAT_MIMES,format);}
