# IS-4 UI continuity review

The IS-4A role-based screen is an interim security and transport scaffold. It retains Vue, the upstream stylesheet/theme variables and theme preference, but it replaces the upstream App.vue layout. It is not the final accepted Leejet-style household experience.

Temporarily absent useful upstream elements to restore or adapt without reintroducing browser authority:
- Upstream responsive studio layout, navigation hierarchy, polished spacing, visual feedback and accessible keyboard/focus treatment.
- Prompt-composer controls and explicit editable enhancement workflow, including retry, cancel, restore-original and nonblocking model-unavailable feedback.
- Image preview presentation, progress detail and before/after comparison, truthful queued/running/cancelled/failure/cooldown states.
- Mobile-friendly input/reference previews and removal, with exactly one reference in Edit.
- Refine the newly added browser-local gallery, Download, explicit Save/Delete and portable export/import controls; verify their presentation and accessibility in a real browser.

Do not restore native model selection/load/unload, arbitrary model files, recipe administration, direct native API access, external provider selection, browser-stored API keys, LoRA, video or unqualified modes. Adapt UI controls to the scoped Router-owned application contract. Server-side origin/authentication/authorization, parameter validation, ownership and scheduling remain IS-3 requirements. Browser visual, responsiveness, console, networking and accessibility testing is outstanding.

## IS-4C candidate update

The candidate restores a responsive studio layout using upstream theme variables, styles and status-chip component, adds reference/before-and-after presentation and an editable local enhancement suggestion. The 384×256 image is a synthetic fixture. Browser visual, keyboard/accessibility, responsive and runtime network qualification remain outstanding; live Router integration and gallery robustness remain separately gated.
