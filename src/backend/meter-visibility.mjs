/** Tenant receipts contain only submission state and original photo references. */
export function tenantMeterReceipt(row){
 const receipt={id:row.id,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,period:row.period,utility:row.utility,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,photos:(row.photos||[]).slice(0,3).map(photo=>({fileId:photo.fileId,createdAt:photo.createdAt}))};
 if(row.reviewedAt)receipt.reviewedAt=row.reviewedAt;
 return receipt;
}

/** Old machine snapshots stay in storage; current review exposes photo evidence. */
export function ownerMeterSubmission(row){
 const selectedFileId=row.selectedFileId||(row.photos||[]).find(photo=>photo.analysisId===row.selectedAnalysisId)?.fileId||row.photos?.[0]?.fileId;
 const keys=['id','propertyId','roomId','tenantId','period','utility','status','version','source','submittedBy','submittedByName','createdAt','updatedAt','note','reviewedAt','reviewedBy','reviewNote','verifiedValue','verificationSource','readingId'];
 const result=Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
 result.photos=(row.photos||[]).map(photo=>({fileId:photo.fileId,createdAt:photo.createdAt}));
 if(selectedFileId)result.selectedFileId=selectedFileId;
 return result;
}
