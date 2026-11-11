import { imageRequest, type ImageInput, type Job } from './imagestudio-api';

export interface JobServices {
  submit(input: ImageInput): Promise<Job>;
  getJob(id: string): Promise<Job>;
  cancel(id: string): Promise<Job>;
  getResult(id: string): Promise<Blob>;
}
export interface JobView { job: Job | null; busy: boolean; error: string; retry: 'status' | 'result' | null; phase: 'idle' | 'submitting' | 'waiting' | 'cancelling' | 'retrieving' }

/** Invalidate older asynchronous operations before changing or cancelling the active job. */
export function createJobController(services: JobServices, publish: (state: JobView) => void, showPreview: (blob: Blob) => void, schedule = (fn: () => void) => window.setTimeout(fn, 1500), unschedule = (id: number) => window.clearTimeout(id)) {
  let state: JobView = {job:null,busy:false,error:'',retry:null,phase:'idle'};
  let revision = 0, disposed = false, timer: number | undefined;
  const update = (patch: Partial<JobView>) => { state = {...state,...patch}; publish({...state}); };
  const clear = () => { if (timer !== undefined) { unschedule(timer); timer = undefined; } };
  const current = (r: number) => !disposed && revision === r;
  const message = (e: unknown) => e instanceof Error ? e.message : 'Request failed';
  async function result(id: string, r: number) {
    if (!current(r)) return;
    update({busy:true,phase:'retrieving',error:'',retry:null});
    try { const blob = await services.getResult(id); if (!current(r)) return; showPreview(blob); update({busy:false,phase:'idle'}); }
    catch(e) { if (!current(r)) return; update({busy:false,phase:'idle',error:`Result retrieval failed: ${message(e)}`,retry:'result'}); }
  }
  async function handle(job: Job, r: number) {
    if (!current(r)) return;
    update({job,error:'',retry:null});
    if (job.state === 'completed') { await result(job.id,r); return; }
    if (job.state === 'failed' || job.state === 'cancelled') { update({busy:false,phase:'idle',error:job.state === 'failed' ? job.message || 'Generation failed.' : ''}); return; }
    update({busy:true,phase:'waiting'});
    timer = schedule(() => { timer = undefined; void poll(job.id,r); });
  }
  async function poll(id: string, r: number) {
    try { const job = await services.getJob(id); if (!current(r)) return; if (job.id !== id) throw new Error('Mismatched job ID.'); await handle(job,r); }
    catch(e) { if (!current(r)) return; update({busy:true,phase:'waiting',error:`Job status unknown: ${message(e)}`,retry:'status'}); }
  }
  async function start(input: ImageInput) {
    if (state.busy || disposed) return;
    let valid: ImageInput;
    try { valid = imageRequest(input); } catch(e) { update({error:message(e)}); return; }
    clear(); const r = ++revision; update({job:null,busy:true,phase:'submitting',error:'',retry:null});
    try { const job = await services.submit(valid); if (!current(r)) return; await handle(job,r); }
    catch(e) { if (!current(r)) return; update({busy:false,phase:'idle',error:message(e)}); }
  }
  async function cancelJob() {
    if (!state.job || !state.busy || state.phase === 'cancelling' || disposed) return;
    clear(); const id = state.job.id, r = ++revision; update({busy:true,phase:'cancelling',error:'',retry:null});
    try { const job = await services.cancel(id); if (!current(r)) return; if (job.id !== id) throw new Error('Mismatched job ID.'); await handle(job,r); }
    catch(e) { if (!current(r)) return; update({busy:true,phase:'waiting',error:`Cancellation status unknown: ${message(e)}`,retry:'status'}); }
  }
  async function retry() {
    if (!state.job || !state.retry || disposed) return;
    clear(); const id = state.job.id, kind = state.retry, r = ++revision; update({error:'',retry:null,busy:true,phase:kind === 'result' ? 'retrieving' : 'waiting'});
    if (kind === 'result') await result(id,r); else await poll(id,r);
  }
  function dispose() { disposed = true; revision++; clear(); }
  return {start,cancel:cancelJob,retry,dispose};
}
