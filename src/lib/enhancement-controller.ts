import type { Role } from './imagestudio-api';
export interface EnhancementView { busy:boolean; suggestion:string; original:string|null; error:string; accepted:boolean }
export function createEnhancementController(request:(prompt:string,role:Role,signal:AbortSignal)=>Promise<{prompt:string}>, publish:(v:EnhancementView)=>void, apply:(text:string)=>void) {
 let state:EnhancementView={busy:false,suggestion:'',original:null,error:'',accepted:false}, seq=0, abort:AbortController|null=null, disposed=false;
 const update=(p:Partial<EnhancementView>)=>{state={...state,...p};publish({...state});};
 function cancel(){seq++;abort?.abort();abort=null;update({busy:false});}
 async function run(prompt:string, role:Role){
  const original=state.original ?? prompt;
  if(!original.trim() || original.length>4000){update({error:'Enter a prompt before enhancing.'});return;}
  cancel();const r=++seq, control=new AbortController();abort=control;update({original,busy:true,error:'',suggestion:'',accepted:false});
  try{const result=await request(original,role,control.signal);if(disposed||seq!==r)return;update({suggestion:result.prompt,busy:false});}
  catch(e){if(disposed||seq!==r)return;update({busy:false,error:e instanceof TypeError?'Prompt enhancement is unavailable right now. Your original prompt is unchanged, and you can still create or edit images.':e instanceof Error?e.message:'Enhancement unavailable.'});}
  finally{if(seq===r)abort=null;}
 }
 function edit(text:string){if(text.length<=4000)update({suggestion:text});}
 function accept(){if(!state.suggestion.trim())return;apply(state.suggestion.trim());update({accepted:true});}
 function restore(){if(state.original!==null)apply(state.original);cancel();update({original:null,suggestion:'',accepted:false,error:''});}
 function reset(){cancel();update({original:null,suggestion:'',accepted:false,error:''});}
 function dispose(){disposed=true;seq++;abort?.abort();abort=null;}
 return {run,cancel,edit,accept,restore,reset,dispose};
}
