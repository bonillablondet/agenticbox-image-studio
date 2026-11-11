# IS-4A provisional application contract

This is a mock-driven frontend contract, not an existing Router API or deployment. The fixed same-origin prefix is `/api/image-studio/v1`. No caller may configure an external endpoint or browser credential. Status is fetched once on mount and on explicit retry; errors are visible. Jobs are polled only while active.

- `GET /status` → `{available: boolean, mock: boolean, message?: string}`. Mock responders must mark `mock: true`.
- `POST /jobs` → `{id, state, message?}`. Request is either `{role:"create",prompt}` or `{role:"edit",prompt,references:[one data URL]}`. Roles map to NitroFusion2 Q6 and FLUX.2 Klein Q8 respectively. Accepted CLI defaults remain server-owned: Create 512², Euler/one step, CFG 1, simple scheduler, flow shift 3; Edit 512², Euler/four steps, CFG 1 and one reference. This does not claim native-server qualification.
- `GET /jobs/{id}` → job state `queued`, `running`, `completed`, `failed` or `cancelled`.
- `POST /jobs/{id}/cancel` → job state; `GET /jobs/{id}/result` → image Blob.
- `POST /enhance` with `{prompt, role}` → `{prompt}` is a provisional same-origin JSON suggestion; the UI preserves original text until explicit acceptance. Streaming is not part of this mock contract.

Synthetic adapter fixtures are not inference. No browser-stored provider key, endpoint selection, model path, native recipe, native lifecycle operation or arbitrary sampler is offered. Existing legacy preference keys are not read or deleted, except the harmless existing theme preference. Generated preview is transient; gallery and export are future IS-4 work.

**Security boundary remains unimplemented:** IS-3 must independently authenticate caller, enforce authorization, origins/CSRF and request limits, validate role and fields, bind job ownership, protect credentials, mediate private native endpoints, and coordinate GPU resources and thermal policy. Client-side checking is defense-in-depth, not authority. Real Router contract may require adaptation after IS-3 qualification.

Result downloads reject oversized Content-Length before reading and stop streamed bodies above 5 MiB. Job lifecycle uses revision guards, keeps the prior preview until a new result is retrieved, and makes status/result retry explicit. Browser rendering and server enforcement remain pending.
