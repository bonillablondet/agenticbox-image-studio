/** Browser-authoritative gallery. Archive v1 is UTF-8 JSON with sorted IDs and base64 bytes. */
export type GalleryRole = 'create' | 'edit';
export interface GalleryItem { id:string; blob:Blob; mime:string; size:number; createdAt:string; role:GalleryRole; mock?:boolean; prompt?:string; referenceId?:string }
interface PortableItem { id:string; mime:string; size:number; createdAt:string; role:GalleryRole; mock?:boolean; prompt?:string; referenceId?:string; data:string }
export const MAX_IMAGE = 5 * 1024 * 1024, MAX_ARCHIVE = 100 * 1024 * 1024, MAX_ENTRIES = 50;
const DB_NAME='imagestudio-gallery', STORE='images', ID=/^[A-Za-z0-9_-]{1,80}$/;
const MIME=['image/png','image/jpeg','image/webp'];
function onlyKeys(value:object, allowed:string[]) { if(Object.keys(value).some(k=>!allowed.includes(k))) throw new Error('Unsupported archive field.'); }
function metadata(x:GalleryItem | PortableItem) {
 if(!x || typeof x!=='object' || typeof x.id!=='string' || !ID.test(x.id) || !MIME.includes(x.mime) || !Number.isSafeInteger(x.size) || x.size<1 || x.size>MAX_IMAGE || typeof x.createdAt!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x.createdAt) || !Number.isFinite(Date.parse(x.createdAt)) || new Date(x.createdAt).toISOString()!==x.createdAt || !['create','edit'].includes(x.role)) throw new Error('Invalid image metadata.');
 if(x.mock!==undefined && typeof x.mock!=='boolean') throw new Error('Invalid mock marker.');
 if(x.prompt!==undefined && (typeof x.prompt!=='string' || x.prompt.length>4000)) throw new Error('Invalid prompt metadata.');
 if(x.referenceId!==undefined && (typeof x.referenceId!=='string' || !ID.test(x.referenceId))) throw new Error('Invalid lineage ID.');
}
async function validateBlob(blob:Blob,mime:string,size:number) {
 if(!(blob instanceof Blob) || blob.type!==mime || blob.size!==size) throw new Error('Invalid image bytes.');
 const a=new Uint8Array(await blob.slice(0,12).arrayBuffer());
 const png=a.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>a[i]===v);
 const jpg=a.length>=3 && a[0]===255 && a[1]===216 && a[2]===255;
 const webp=a.length>=12 && String.fromCharCode(...a.slice(0,4))==='RIFF' && String.fromCharCode(...a.slice(8,12))==='WEBP';
 if(!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpg)||(mime==='image/webp'&&webp))) throw new Error('Image signature does not match MIME type.');
}
export async function validateItem(x:GalleryItem) { onlyKeys(x,['id','blob','mime','size','createdAt','role','mock','prompt','referenceId']); metadata(x); await validateBlob(x.blob,x.mime,x.size); }
function openDb(factory:IDBFactory=globalThis.indexedDB):Promise<IDBDatabase> { return new Promise((resolve,reject)=>{ if(!factory){reject(new Error('Browser storage unavailable.'));return;} let req:IDBOpenDBRequest; try{req=factory.open(DB_NAME,1);}catch(e){reject(e);return;} req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});}; req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error || new Error('Browser storage unavailable.'));req.onblocked=()=>reject(new Error('Browser storage upgrade blocked.')); }); }
function transaction<T>(db:IDBDatabase, mode:IDBTransactionMode, action:(store:IDBObjectStore,set:(x:T)=>void)=>void):Promise<T> { return new Promise((resolve,reject)=>{let tx:IDBTransaction, result:T;try{tx=db.transaction(STORE,mode);action(tx.objectStore(STORE),x=>{result=x;});}catch(e){try{tx!.abort();}catch{} reject(e);return;} tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('Gallery transaction failed.'));tx.onerror=()=>{};}); }
export async function listImages(factory?:IDBFactory):Promise<GalleryItem[]> { const db=await openDb(factory);try{return await transaction(db,'readonly',(store,set)=>{const r=store.getAll();r.onsuccess=()=>set(r.result as GalleryItem[]);});}finally{db.close();} }
async function addItems(db:IDBDatabase, items:GalleryItem[]):Promise<void> {return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);let reason:Error|undefined;const count=store.count();count.onsuccess=()=>{if(count.result+items.length>MAX_ENTRIES){reason=new Error('Gallery is limited to 50 images.');tx.abort();return;}for(const item of items)store.add(item);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason||tx.error||new Error('Gallery transaction failed.'));tx.onerror=()=>{};});}
export async function saveImage(item:GalleryItem,factory?:IDBFactory):Promise<void> {await validateItem(item);const db=await openDb(factory);try{await addItems(db,[item]);}finally{db.close();} }
export async function deleteImage(id:string,factory?:IDBFactory):Promise<void> {if(!ID.test(id))throw new Error('Invalid image ID.');const db=await openDb(factory);try{await transaction<void>(db,'readwrite',s=>{s.delete(id);});}finally{db.close();} }
function toBase64(bytes:Uint8Array):string {let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
function fromBase64(s:string):Uint8Array {if(typeof s!=='string'||s.length>4*Math.ceil(MAX_IMAGE/3)||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw new Error('Invalid image encoding.');const raw=atob(s), bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
const ARCHIVE_START = '{"format":"agenticbox-imagestudio-gallery","version":1,"images":[';
const ARCHIVE_END = ']}';
/** Size is the full UTF-8 JSON archive, not the unencoded image total. */
export function assertArchiveSize(bytes:number):void { if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_ARCHIVE) throw new Error('Encoded archive exceeds the 100 MiB limit.'); }
function portableMetadata(item:GalleryItem):PortableItem {
 const entry:PortableItem={id:item.id,mime:item.mime,size:item.size,createdAt:item.createdAt,role:item.role,data:''};
 if(item.mock!==undefined)entry.mock=item.mock;
 if(item.prompt!==undefined)entry.prompt=item.prompt;
 if(item.referenceId!==undefined)entry.referenceId=item.referenceId;
 return entry;
}
/** Exact encoded length without materializing image bytes or a 100 MiB JSON string. */
export function encodedArchiveSize(items:GalleryItem[]):number {
 if(items.length>MAX_ENTRIES)throw new Error('Too many images for one archive.');
 const encoder=new TextEncoder(),seen=new Set<string>();let size=encoder.encode(ARCHIVE_START).length+encoder.encode(ARCHIVE_END).length;
 for(const item of items){metadata(item);if(seen.has(item.id))throw new Error('Duplicate image ID in gallery.');seen.add(item.id);size+=encoder.encode(JSON.stringify(portableMetadata(item))).length+4*Math.ceil(item.size/3);}
 return size+Math.max(0,items.length-1);
}
export async function exportGallery(items:GalleryItem[]):Promise<Blob> {
 const sorted=[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 assertArchiveSize(encodedArchiveSize(sorted));
 const parts:BlobPart[]=[ARCHIVE_START];
 for(let i=0;i<sorted.length;i++){
  const item=sorted[i];await validateItem(item);
  const entry=portableMetadata(item);entry.data=toBase64(new Uint8Array(await item.blob.arrayBuffer()));
  if(i)parts.push(',');parts.push(JSON.stringify(entry));
 }
 parts.push(ARCHIVE_END);
 const out=new Blob(parts,{type:'application/json'});assertArchiveSize(out.size);return out;
}
export async function parseArchive(file:Blob):Promise<GalleryItem[]> {if(!(file instanceof Blob))throw new Error('Invalid archive file.');assertArchiveSize(file.size);let obj:unknown;try{obj=JSON.parse(await file.text());}catch{throw new Error('Invalid archive JSON.');}if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error('Invalid archive.');onlyKeys(obj,['format','version','images']);const a=obj as {format:string;version:number;images:PortableItem[]};if(a.format!=='agenticbox-imagestudio-gallery'||a.version!==1)throw new Error('Unsupported gallery archive format or version.');if(!Array.isArray(a.images)||a.images.length>MAX_ENTRIES)throw new Error('Too many archive entries.');let total=0;const seen=new Set<string>(), out:GalleryItem[]=[];for(const x of a.images){if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Invalid archive entry.');onlyKeys(x,['id','mime','size','createdAt','role','mock','prompt','referenceId','data']);metadata(x);if(seen.has(x.id))throw new Error('Duplicate image ID in archive.');seen.add(x.id);total+=x.size;if(total>MAX_ARCHIVE)throw new Error('Image total exceeds import limit.');const bytes=fromBase64(x.data);const blob=new Blob([bytes.buffer as ArrayBuffer],{type:x.mime});const {data,...rest}=x;x.data='';const item={...rest,blob};await validateItem(item);out.push(item);}return out;}
export class DuplicateGalleryImportError extends Error {
 readonly cause:unknown;
 constructor(cause:unknown){super('These images are already in your gallery. Nothing was imported.');this.name='DuplicateGalleryImportError';this.cause=cause;}
}
export async function importGallery(file:Blob,factory?:IDBFactory):Promise<number> {const items=await parseArchive(file);const db=await openDb(factory);try{try{await addItems(db,items);}catch(e){if(e && typeof e==='object' && 'name' in e && e.name==='ConstraintError')throw new DuplicateGalleryImportError(e);throw e;}return items.length;}finally{db.close();} }
export async function referenceData(item:GalleryItem):Promise<string>{await validateItem(item);return `data:${item.mime};base64,${toBase64(new Uint8Array(await item.blob.arrayBuffer()))}`;}
export function downloadBlob(blob:Blob,filename:string) {const url=URL.createObjectURL(blob);try{const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);} }
