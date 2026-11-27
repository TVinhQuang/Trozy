import {initializeMeterReader,validateReaderProposalForReview} from './meter-reader-service.mjs';
import {meterWorkflow} from './meter-workflow.mjs';
export {meterSubmissionUsage,assertMeterSubmissionBaseline} from './meter-workflow.mjs';

export function createMeterSubmissionService(store,{onCreated=()=>{},onReviewed=()=>{}}={}){
  initializeMeterReader(store);
  // Previously queued photos now enter manual review without running a model.
  store.transaction(()=>{for(const row of store.list('meterSubmissions').filter(row=>row.status==='processing')){
    store.put('meterSubmissions',{...row,status:'pending',version:(row.version||0)+1,jobLeaseToken:null,jobLeaseUntil:null});
  }});
  return meterWorkflow(store,{onCreated,onReviewed,validateReaderProposalForReview});
}
