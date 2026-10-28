# Design

<!-- impeccable:design-schema 1 -->

## Mode

**Operate.** The user is completing a task (finding a client, moving a card, sending an invoice), often for the twentieth time. Scanability, consistency and real usage beat expression. Ambition shows up as precision: alignment, tabular numbers, honest states, nothing decorative that does not carry information.

## The World

A working ledger, not a dashboard product. Quiet paper, hairline rules, ink text, one warm accent reserved for *state* (unsynced, due soon) — never for decoration. Records feel like entries in a well-kept book: a title, a compact field grid, a body of prose. Monospace is used only where a machine wrote the value: ids, amounts, dates, paths.

## Palette

Semantic tokens only (defined in `src/ui/styles.css`), light and dark both first-class.

| Role | Light | Intent |
|---|---|---|
| `background` | warm off-white | paper |
| `foreground` | near-black ink | primary text |
| `card` | white | raised surface |
| `muted` / `muted-foreground` | warm grey | secondary text, field labels |
| `border` | hairline grey | structure, never heavy |
| `primary` | deep ink | primary action (not a brand colour) |
| `accent` | amber | attention: unsynced, overdue, needs-attention |
| `destructive` | red | destructive actions and errors |

No gradients, no glass, no drop shadows beyond a single subtle elevation for overlays. Colour is never the only signal: state always pairs an icon or label with the token.

## Type

* UI: system sans stack (offline app — no webfonts).
* Machine values (ids, money, dates, paths): `ui-monospace` with `tabular-nums`.
* Scale: 12 / 13 / 14 / 16 / 20 / 24. Body 14, view titles 20. Line height 1.5 body, 1.25 titles.
* No display type. Hierarchy comes from weight and spacing, not size jumps.

## Space and shape

* 4px base; layout gaps 8/12/16/24/32.
* Radius 8px for controls and cards (`--radius: 0.5rem`); pills for badges.
* Hairline 1px borders; content max-width per view (tables full width, detail panels 44rem).
* Dense but breathable: table rows 40px, form fields 32px.

## Motion

* 120–180ms ease-out for state changes; no entrance animations for content that is already there.
* Motion communicates causality: a row that just changed flashes its background once; a moved card settles.
* `prefers-reduced-motion` removes all of it.

## Layout

* Persistent left sidebar (collapsible under 900px), header with workspace name, sync badge and command palette trigger.
* Content views own their own scroll; the shell never scrolls.
* Lists are the primary surface; detail is a side panel (`Sheet`) on wide screens and a full view on narrow ones.
* Empty states name the next action and the file that would be created.

## Component contract

* shadcn/ui primitives, composed — no bespoke buttons, inputs, badges, dialogs, alerts or skeletons.
* Forms use `FieldGroup` + `Field`, validation via `data-invalid` + `aria-invalid`.
* Money always rendered with `tabular-nums` and a fixed two decimals; never right-aligned inconsistently within a column.
* Icons from Lucide via `data-icon` on buttons; no sizing classes inside components.
* Every destructive action confirms via `AlertDialog`; every result that is not visible in place reports through `sonner`.

## Copied copy rules

* Sentence case everywhere. No exclamation marks.
* Empty state: what this is → why it is empty → the single next action.
* Errors name the mechanic: "Record changed on disk while you were editing" beats "Something went wrong".
