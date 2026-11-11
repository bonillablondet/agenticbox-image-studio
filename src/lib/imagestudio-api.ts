/** Provisional IS-4A contract. Server-side authentication, authorization, validation,
 * admission and job ownership remain mandatory IS-3 work. Never use as a security boundary. */
export type Role = 'create' | 'edit';
export type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface Status { available: boolean; mock: boolean; message?: string }
export interface Job { id: string; state: JobState; message?: string }
export interface CreateInput { role: 'create'; prompt: string }
export interface EditInput { role: 'edit'; prompt: string; references: string[] }
export type ImageInput = CreateInput | EditInput;
const ROOT = '/api/image-studio/v1';
const MAX_PROMPT = 4000;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_LENGTH = 4 * Math.ceil(MAX_REFERENCE_BYTES / 3);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported field.');
}
function promptText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_PROMPT) throw new Error('Prompt must contain 1–4000 characters.');
  return value.trim();
}
export function imageRequest(input: ImageInput): ImageInput {
  if (!input || typeof input !== 'object') throw new Error('Invalid image request.');
  if (input.role === 'create') { keys(input, ['role', 'prompt']); return { role: 'create', prompt: promptText(input.prompt) }; }
  if (input.role === 'edit') {
    keys(input, ['role', 'prompt', 'references']);
    if (!Array.isArray(input.references) || input.references.length !== 1 || typeof input.references[0] !== 'string') throw new Error('Edit requires exactly one reference image.');
    const match = DATA_IMAGE.exec(input.references[0]);
    if (!match || match[1].length > MAX_DATA_LENGTH || Math.floor(match[1].length * 3 / 4) - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0) > MAX_REFERENCE_BYTES) throw new Error('Reference must be a PNG, JPEG or WebP image no larger than 5 MiB.');
    return { role: 'edit', prompt: promptText(input.prompt), references: [input.references[0]] };
  }
  throw new Error('Unsupported image role.');
}
function jobId(id: string) { if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid job ID.'); return id; }
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`ImageStudio API unavailable (HTTP ${response.status}).`);
  try { return await response.json() as T; } catch { throw new Error('Invalid ImageStudio API response.'); }
}
export async function getStatus(): Promise<Status> {
  const s = await json<Status>('/status');
  if (typeof s?.available !== 'boolean' || typeof s?.mock !== 'boolean') throw new Error('Invalid status response.');
  return s;
}
export async function submit(input: ImageInput): Promise<Job> { return parseJob(await json<unknown>('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imageRequest(input)) })); }
function parseJob(value: unknown): Job {
  if (!value || typeof value !== 'object') throw new Error('Invalid job response.');
  const j = value as Job;
  if (typeof j.id !== 'string' || !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(j.state)) throw new Error('Invalid job response.');
  jobId(j.id); return j;
}
export async function getJob(id: string): Promise<Job> { return parseJob(await json<unknown>(`/jobs/${jobId(id)}`)); }
export async function cancel(id: string): Promise<Job> { return parseJob(await json<unknown>(`/jobs/${jobId(id)}/cancel`, { method: 'POST' })); }
export async function getResult(id: string): Promise<Blob> {
  const r = await fetch(`${ROOT}/jobs/${jobId(id)}/result`, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error(`Result unavailable (HTTP ${r.status}).`);
  const mime = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) { await r.body?.cancel(); throw new Error('Invalid image result type.'); }
  const length = r.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REFERENCE_BYTES)) { await r.body?.cancel(); throw new Error('Image result exceeds 5 MiB.'); }
  if (!r.body) throw new Error('Image result stream unavailable.');
  const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_REFERENCE_BYTES) { await reader.cancel(); throw new Error('Image result exceeds 5 MiB.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('Image result is empty.');
  return new Blob(chunks.map(c => new Uint8Array(c).buffer), {type: mime});
}
/** Provisional JSON enhancement transport; streaming is not yet part of this contract. */
export async function enhance(prompt: string, role: Role = 'create', signal?: AbortSignal): Promise<{ prompt: string }> {
  if (role !== 'create' && role !== 'edit') throw new Error('Unsupported image role.');
  const result = await json<{prompt: string}>('/enhance', {method:'POST', signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:promptText(prompt),role})});
  return {prompt: promptText(result?.prompt)};
}
