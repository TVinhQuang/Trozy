/**
 * Export landlord-verified meter photos as labeled gold-set items.
 *
 * Read-only access to the Trozy SQLite file. No room, tenant, owner or
 * user identifier and no EXIF data is written; the meter is stored only as a
 * salted hash so repeat photos of one meter stay in the same split.
 */
import {addImage,meterGroup,validLayout} from './gold-lib.mjs';

const json=value=>{try{return JSON.parse(value);}catch{return null;}};

function readerOutcome(db,submission){
  if(!submission.readerProposalId)return {proposal:null};
  const row=db.prepare('SELECT result FROM meter_reader_proposals WHERE id=?').get(submission.readerProposalId);
  return {proposal:row?json(row.result):null};
}

function confirmedLayout(db,submission,proposal){
  if(proposal?.config&&validLayout(proposal.config.digits,proposal.config.decimals))return {digits:proposal.config.digits,decimals:proposal.config.decimals};
  for(const row of db.prepare("SELECT data FROM records WHERE collection='meterProfiles'").all()){
    const profile=json(row.data);
    if(profile?.roomId===submission.roomId&&profile.utility===submission.utility&&profile.confirmed===true&&validLayout(profile.digits,profile.decimals))
      return {digits:profile.digits,decimals:profile.decimals};
  }
  return {digits:null,decimals:null};
}

export async function exportVerified(db,{root,manifest,source='all'}){
  if(!['all','owner','tenant'].includes(source))throw new Error('--source phải là all, owner hoặc tenant.');
  const stats={considered:0,added:0,duplicate:0,skipped:{not_verified:0,wrong_source:0,no_file:0,bad_image:0}};
  const rows=db.prepare("SELECT data FROM records WHERE collection='meterSubmissions'").all();
  for(const row of rows){
    const submission=json(row.data);
    if(!submission)continue;
    stats.considered++;
    if(submission.status!=='approved'||!Number.isSafeInteger(submission.verifiedValue)||submission.verifiedValue<0){stats.skipped.not_verified++;continue;}
    const fromOwner=submission.source==='owner';
    if((source==='owner'&&!fromOwner)||(source==='tenant'&&fromOwner)){stats.skipped.wrong_source++;continue;}
    const fileId=submission.selectedFileId||submission.photos?.[0]?.fileId;
    const file=fileId?db.prepare('SELECT bytes FROM files WHERE id=?').get(fileId):null;
    if(!file){stats.skipped.no_file++;continue;}
    const {proposal}=readerOutcome(db,submission);
    const {digits,decimals}=confirmedLayout(db,submission,proposal);
    const readerAtExport=proposal?{status:proposal.status??null,engine:proposal.engine??null,integerValue:proposal.reading?.integerValue??null}:null;
    // A photo the local reader could not read (including Gemini fallback cases), or read wrongly, is the most useful training example.
    const hard=!proposal||proposal.status!=='ready'||proposal.reading?.integerValue!==submission.verifiedValue||proposal.engine==='gemini-vision';
    const matchedDisplay=proposal?.status==='ready'&&proposal.reading?.integerValue===submission.verifiedValue&&typeof proposal.reading?.displayText==='string'&&/^[0-9]{1,12}(?:\.[0-9]{1,4})?$/.test(proposal.reading.displayText)?proposal.reading.displayText:null;
    try{
      const result=await addImage(manifest,root,{bytes:Buffer.from(file.bytes),utility:submission.utility,group:meterGroup(submission.ownerId,submission.roomId,submission.utility),
        source:'verified-export',digits,decimals,label:submission.verifiedValue,digitsText:matchedDisplay,labelSource:'owner-verified',hard,readerAtExport});
      if(result.status==='added')stats.added++;else stats.duplicate++;
    }catch{stats.skipped.bad_image++;}
  }
  return stats;
}
