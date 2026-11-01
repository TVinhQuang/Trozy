import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {analyzeMeterPixels} from '../src/shared/meter-image-quality.mjs';

const quality=async bytes=>analyzeMeterPixels(await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true}).then(({data,info})=>({data,width:info.width,height:info.height,channels:info.channels})),{scope:'counter'});
const counter=()=>sharp(Buffer.from('<svg width="640" height="120"><rect width="640" height="120" fill="white"/><text x="25" y="100" fill="black" font-size="105" font-family="sans-serif">012345</text></svg>')).png().toBuffer();

test('technical camera quality rejects blank, dark and tiny crops without claiming a reading',()=>{
 const flat={data:new Uint8Array(320*120).fill(140),width:320,height:120,channels:1};
 const result=analyzeMeterPixels(flat,{scope:'counter'});assert.equal(result.status,'retake');assert.equal(result.checks.sharpness,false);assert.equal(result.canSubmit,false);
 const dark=analyzeMeterPixels({...flat,data:new Uint8Array(320*120).fill(3)},{scope:'counter'});assert.equal(dark.checks.exposure,false);
 const tiny=analyzeMeterPixels({data:new Uint8Array(100*20).fill(100),width:100,height:20,channels:1},{scope:'counter'});assert.equal(tiny.checks.resolution,false);
 assert.equal(result.suggestedValue,undefined);
});

test('technical camera quality distinguishes visible edges from blur and tolerates printed white backgrounds',async()=>{
 const bytes=await counter(),clear=await quality(bytes),blurred=await quality(await sharp(bytes).blur(12).png().toBuffer());
 assert.equal(clear.status,'pass');assert.equal(clear.checks.glare,true);assert.equal(clear.canSubmit,true);
 assert.equal(blurred.checks.sharpness,false);assert.equal(blurred.canSubmit,false);
});

test('quality calculations are deterministic and reject malformed pixel inputs',()=>{
 const pixels={data:new Uint8Array(100).fill(100),width:10,height:10,channels:1};assert.deepEqual(analyzeMeterPixels(pixels),analyzeMeterPixels(pixels));
 assert.throws(()=>analyzeMeterPixels({data:new Uint8Array(12),width:10,height:10,channels:4}));
 assert.throws(()=>analyzeMeterPixels(pixels,{scope:'unknown'}));
});
