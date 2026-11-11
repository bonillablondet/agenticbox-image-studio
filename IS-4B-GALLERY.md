# IS-4B gallery: candidate contract and smoke instructions

IndexedDB database `imagestudio-gallery`, version 1, store `images` keyed by stable ID. Each record holds an image Blob, MIME/byte size, ISO UTC timestamp, create/edit role, optional prompt, mock marker, and optional saved-reference ID. An unsaved preview or uploaded reference is not written automatically. Save uses IndexedDB `add` and waits for transaction completion. Deleting a source leaves its ID as historical lineage in dependent records; it does not delete or rewrite them.

Portable format: UTF-8 JSON object `{ "format": "agenticbox-imagestudio-gallery", "version": 1, "images": [...] }`. Images sorted by ID; each entry has `id`, `mime`, `size`, `createdAt`, `role`, `data` (base64 bytes), and optionally `mock`, `prompt`, `referenceId`. No filenames or paths are accepted. PNG/JPEG/WebP signatures and metadata are checked. Limits: 5 MiB per image, 50 entries, and 100 MiB complete encoded UTF-8 JSON archive, including metadata. Duplicate IDs within an archive or already in the gallery reject the whole import; no records are overwritten. Export may fail when a gallery exceeds these limits; no silent truncation. Export preflights exact encoded size before reading image bytes and assembles per-entry Blob parts; it never returns a partial backup. Import rejects an oversized file before reading it and validates all entries before a single transaction. JSON parsing, base64 strings and decoded Blobs can coexist in memory, so large archives may still exceed browser memory or quota.

Operator browser smoke on ArchForge only, after reviewing the source/build. In a terminal from this checkout run:

```zsh
(
  cd /workspace/image-studio/maintained-source || exit 1
  print -r -- '6f7327a5f388fcd10f5f018596fec62bfb3b5bbf8ed37d1849b9c978dbaba9db  dist/index.html' | sha256sum --check || exit 1
  python3 scripts/imagestudio-mock.py 18765
)
```

Open `http://127.0.0.1:18765/` in Chrome on that workstation. The mock binds only loopback, returns a synthetic 384×256 PNG and never performs inference. Verify: mock indicator; Create preview; reload before Save leaves gallery empty; Save then reload preserves image; Download opens a PNG; Use as reference selects Edit; create an Edit result, save and verify lineage; delete its source and verify lineage remains; export JSON, import in a clean browser profile at the same local URL, and verify duplicate import is rejected atomically. Use `[mock:slow]` in a synthetic prompt to exercise Cancel; use `[mock:fail]` to exercise the failure state. Check console, Network (only same-origin mock requests), mobile layout, quota/denied storage where feasible, and object URL cleanup. Stop with Ctrl-C. Do not use personal data or connect to Router/native server. This fixture is a test server, not an authorization or scheduling boundary.

Actual browser IndexedDB, image decoding/rendering, quota behavior, responsive UX, and security against a real malicious client remain unqualified. The Node fake-indexeddb tests are substitutes only. Install the test-only substitute into `/workspace/image-studio/.gallery-test-toolchain` or set `IMAGESTUDIO_FAKE_IDB` to its package location; it is not an application dependency or part of the lockfile.

IS-4C enhancement smoke: Enter a synthetic prompt and choose Enhance; confirm the original remains untouched while the editable suggestion appears. Edit and accept it, then Restore original. Try again; use `[enhance:slow]` to cancel and `[enhance:unavailable]` to check that a 503 does not block normal generation. Repeat in Edit and verify the suggestion preserves reference intent. Inspect Console and Network for same-origin calls only. The mock contract returns JSON; streaming is not yet implemented.
