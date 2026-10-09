# Frame Shelf 0.6.0 — Design QA

- Scope: refine the existing export workspace using the supplied 0.5.0 screenshot and requested compact layout. This is an intentional refinement, not a pixel-identical clone.
- Source: C:/Users/adminss/AppData/Local/Temp/codex-clipboard-cfcaf33e-496d-4dbb-931b-891eb61ef293.png (1920×1200, UI geometry consistent with 150% desktop scaling).
- Implementation: .test-output/ui-polish-final.png, Codex in-app browser, 1280×800 CSS viewport. Real thumbnails and six records/four slots loaded into an in-memory, read-only design fixture. User storage unmodified. Browser demo banner and output directory differ intentionally.
- Combined comparison: .test-output/design-comparison.png. Source normalized to 1280×800 and placed beside the implementation. Full view and 900×650 narrow view inspected; no horizontal overflow. Header, field form, card names, and footer also inspected through browser state and screenshots.

## Findings and disposition

- Original P1: stacked brand, tabs, scope, permanent success notice, heading and explanation pushed output cards below the fold. Fixed by 48px navigation, 32px scope, transient toast, removing repeated heading/explanation, collapsible date tools. Final screenshot shows the first row including derived names and actions; second row begins above footer.
- Original P2: preset actions wrap unevenly; columns lack clear separation. Fixed with equal-width action row, aligned 32px section headings, consistent padding, column dividers and independent scrolling.
- Original P1: adding a custom field did not bind it to output names. Fixed with name/value/target form and immediate binding. Browser confirmed all four V01 suffixes update to V02 on input; channel field affects only chosen card.
- P2 found during narrow check: scrollbars consume a large fraction of narrow preview column. Fixed with 8px scrollbars. Final 1280×800 recapture includes fix; 900×650 width checks showed no overflow before or after geometry change.
- Known functional limitation: opening the selected native AE template directly remains unavailable in this implementation. Button is honestly labelled 管理模板 with an explicit tooltip. Not claimed as implemented or covered by visual QA.

## Required surfaces

- Typography: retained Segoe UI / Microsoft YaHei stack; 13px section headings, 12px editable names, 11px derived names, smaller secondary metadata. Long rules remain horizontally editable, with full-rule title. No new display font.
- Spacing: 48/32px top bars, aligned column titles, fixed footer, consistent 6–14px internal spacing. Intentional density increase from reference. Full-width template and directory controls stay within 900px window.
- Colors/tokens: retained dark charcoal and blue interaction palette; muted labels distinguish hierarchy; selected edit card uses blue border, export remains primary action.
- Image quality: original local PNG preview assets reused, aspect ratio contained, no cropping/stretching or fabricated product imagery. Existing brand/icon system retained.
- Copy: removed repeated instructions; fields now describe immediate linkage; native template limitation stated accurately. Demo badge prevents confusion with native AE execution.

## Interaction evidence

In-app browser tested adding/applying fields to all names and one name, editing field values without blur, opening date tools/inserting $mm, history navigation, and 900px layout. Console error query returned none. Unit suite: 30 passed. AE API reflection probe only; no render retest this iteration.

## Comparison history

1. Initial implementation capture: .test-output/ui-polish-before-qa.png. Narrow review identified bulky scrollbars.
2. Fix: thin scrollbar styling. Final screenshot and combined comparison reviewed with no remaining P0/P1/P2 visual findings. Native selected-template editing remains explicitly incomplete outside the passed visual scope.

final result: passed

## 0.7.0 ordered-field follow-up

Source: codex-clipboard-479f05e1-4da4-4afa-ad17-17b4ab4705af.png. Rendered: .test-output/ui-ordered-fields.png (1280×900); combined component comparison: .test-output/ordered-comparison.png. Reused numbered vertical list, editable values, order/delete actions, add-type dropdown and custom separator. Adapted to a 300px sidebar with independent scroll; controls are text-labelled for clarity. The reference's display-field-label toggle was not requested and is intentionally absent. Types and per-slot values differ from reference's notification data by design. Same font/token system retained; product thumbnails remain untouched.

Browser verification caught a malformed fixed-type option and an unreliable native drag gesture. Both fixed: valid option markup and numbered pointer drag handle; witnessed date move from third to first and matching filename changes. Scrolling exposes separator below long field lists; no fixed clipping. Component comparison shows no remaining blocking visual issues for this scoped interaction reuse.

final result: passed
