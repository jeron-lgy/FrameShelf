# Frame Shelf 0.1 — architecture and acceptance contract

## Scope

Windows, AE 2025 (25.x), CEP 12. Record combinations of the **root composition's Solo and Video switches** and a local frame index. Nested composition content, effects, text, camera parameters and external footage are read at export time. A combination is not an immutable project snapshot. Output the root composition, not isolated precomps.

The project must have been saved once for durable identity. Unsaved edits in that saved project are rendered. Save As creates a separate session. Layer IDs survive reorder/rename; adding/removing/replacing layers invalidates a record and requires explicit recapture. No silent matching by name or index.

## Decisions after prototype review

- Keep CEP + ExtendScript for AE 25.x. A C++ renderer or AME bridge does not solve the current product problem more simply.
- Use one Render Queue backend for previews, profile probes and final frames. Do not use the undocumented `saveFrameToPng` shortcut.
- User-saved AE Output Module templates are the authority for format, depth, alpha and color conversion. Inspect settings and render a tiny sample before using a profile for a large batch. Never claim that changing an extension sets a format.
- Preview uses reduced render resolution with an explicit preview profile. Preview is a navigation aid, not color proof and not the export source.
- Host mutations use a transaction with a persisted recovery snapshot. Restore Solo/Video switches and original queued items after success, error or cancel. Restoration errors are surfaced independently of the render error.
- Final files are rendered to a unique plugin-owned staging directory in the destination folder. Validate header structure, image dimensions, depth, sample type and channel metadata. Publish with an exclusive hard link on the same volume; fail closed if atomic exclusive publication is unsupported. Never create a zero-byte final file, overwrite a user's file, or label a partial copy as complete.
- UI, domain rules, filesystem operations and host code are separate. No external runtime dependencies, remote scripts or network services in the installed extension.
- Browser demo is explicit and cannot render; it is never evidence that AE integration works.

## Tests required

1. Domain: Unicode names, invalid/reserved names, duplicate paths, template mapping, stable slot IDs, frame ranges.
2. Files: malformed/truncated images, bit depth/alpha mismatch, Unicode paths, collisions, atomic publication, no-clobber behavior.
3. Host contract with fakes: stable-ID restore, failure at every transaction stage, queue isolation, canceled render, missing layer refusal.
4. AE 25.x isolated process: inspect actual API settings, small known-color combinations, frame selection, profile probe, UI-state restoration and untouched unrelated queue task.
5. Large-frame smoke: 15000 × 8438, TIFF 16bpc, Chinese final names. Report this separately from complex project compatibility.
6. Browser UI: drag/drop and keyboard selector equivalence, presets survive reload, narrow panel, busy state, export review and failure messaging.

## Deliberate limitations

Foreground AE renders block host scripting. The panel can request **stop after the current frame**; immediate cancellation is through AE's native render controls. An output template can require one-time setup in AE. Project may become marked modified due to temporary queue operations. Recovery covers switches/queue, not application crashes or external file changes in general. No arbitrary promise of 15K success for every third-party effect.
