export interface DesignPreset {
  id: string
  content: string
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'editorial-workbench',
    content: `# Editorial Workbench

## Intent
Build a quiet, content-first workspace that feels edited rather than decorated. Let the user's words, choices, and source material carry the visual weight.

## Color
- Support light and dark mode with CSS custom properties and prefers-color-scheme.
- Light canvas: #ffffff; raised surface: #f6f5f2; primary ink: #302f2c; muted ink: #74716b.
- Dark canvas: #191919; raised surface: #222220; primary ink: #eeeeeb; muted ink: #a19e97.
- Use one muted semantic accent only when an action or state needs it. No gradients or neon glow.

## Type
- Use a precise sans face for controls and a restrained serif for an occasional editorial heading.
- Body text is 14-16px with a relaxed 1.5-1.65 line height.
- Use sentence case. Avoid oversized hero type and decorative all-caps labels.

## Layout
- Keep the main reading column between 720px and 980px.
- Use 8px spacing increments, generous page margins, and compact controls.
- Prefer document flow, simple tables, checklists, and inline properties over nested cards.

## Components
- Borders are 1px and low contrast. Radius stays between 4px and 8px.
- Buttons look like quiet controls until hovered; destructive actions remain explicit.
- Use icons sparingly and never as decoration.
- Empty states say what is missing and offer one next action.

## Motion
- Use 120-180ms fades or small position changes only when they explain a state transition.
- Respect prefers-reduced-motion.

## Copy
- Use concrete nouns and verbs from the user's situation.
- Labels stay short: "Add recipe", "Packed", "Saturday".
- Do not mention AI, prompts, architecture, or design systems unless the user asks.
`,
  },
  {
    id: 'field-atlas',
    content: `# Field Atlas

## Intent
Turn a difficult causal, spatial, or scientific idea into a manipulable field guide. The visual model is the center; controls and notes support it.

## Color
- Use mineral neutrals with one vivid field color and one contrasting signal color.
- Keep diagrams legible in light and dark mode; encode important states with labels or shape as well as color.
- Avoid decorative gradients. A restrained gradient is allowed only when it carries scale, depth, energy, or direction.

## Type
- Pair a compact sans face with tabular numerals and a readable serif for short explanatory notes.
- Use a clear hierarchy: 12px labels, 14-16px body, 20-30px section titles.
- Keep units attached to values and align comparable numbers.

## Layout
- Use one control group, one main model, and one changing takeaway.
- Put controls beside the model on wide screens and below it on narrow screens.
- Keep legends close to the marks they explain. Prefer direct labels over distant keys.

## Components
- Sliders show current value and unit. Toggles state the consequence, not just the variable name.
- Use cross-sections, paths, scales, and annotated landmarks before generic cards.
- Reveal definitions and caveats progressively so the model remains readable.

## Motion
- Animate only changes that help the user track cause, movement, scale, or viewpoint.
- Keep transitions interruptible and provide a reduced-motion state.

## Copy
- Name the current limiting factor or spatial relationship directly.
- Separate observation, inference, and simplification.
- Avoid classroom cheerleading and generic discovery language.
`,
  },
  {
    id: 'kinetic-signal',
    content: `# Kinetic Signal

## Intent
Build a responsive working surface for live data, connected tools, and user-triggered actions. Expression follows state changes and never competes with the task.

## Color
- Define light and dark semantic roles for canvas, surface, outline, primary, success, warning, and error.
- Reserve the strongest color for the current selection or primary action.
- Meet WCAG AA contrast and never place body text on a busy background.

## Type
- Use a variable sans face when available, otherwise a rounded or humanist sans.
- Use a clear scale: 12px labels, 14-16px body, 20-28px section titles, and at most one 36-44px display line.
- Use weight and spacing before adding more colors.

## Shape
- Use 10-12px radii for fields, 16-20px for interactive groups, and pills only for compact filters or status.
- Do not put every text block in a card. Containers must express grouping or interaction.

## Layout
- Build an adaptive grid that collapses cleanly at 840px and 560px.
- Touch targets are at least 44px. Important actions remain reachable on mobile.
- Use tonal surface changes to show depth; keep shadows soft and rare.

## Motion
- Use 180-260ms emphasized easing for expansion, selection, and shared-axis changes.
- Animate one meaningful transition at a time and respect prefers-reduced-motion.

## Copy
- Make the next action obvious and specific.
- Prefer "Plan Friday dinner" over "Unlock your culinary journey".
- Do not mention AI, prompts, architecture, or design systems unless the user asks.
`,
  },
  {
    id: 'ledger-grid',
    content: `# Ledger Grid

## Intent
Make comparisons, shortlists, schedules, and evidence easy to scan without turning the page into a dashboard. Density is useful only when alignment reveals a decision.

## Color
- Use an off-white or charcoal canvas, quiet row separators, and one saturated selection color.
- Status colors must include text or icons. Keep unselected data neutral.
- Support light and dark mode with equal information hierarchy.

## Type
- Use a compact sans face with tabular numerals for values, dates, scores, and durations.
- Keep column labels at 11-12px and row content at 13-15px.
- Truncate long secondary text, but keep the primary identifier visible.

## Layout
- Align comparable values in real rows or a consistent grid.
- Pin the few controls that change the comparison; hide low-value filters.
- On narrow screens, turn rows into ordered comparison blocks without losing labels.

## Components
- Use checkboxes for a shortlist, radio controls for one choice, and explicit buttons for actions.
- Show why an option is unavailable next to it. Never silently disable a choice.
- Keep totals and recommendations close to the affected rows.

## Motion
- Use brief highlight and reordering transitions so changes remain trackable.
- Avoid animated counters and decorative chart entrances. Respect prefers-reduced-motion.

## Copy
- Use factual column labels and short decision notes.
- State trade-offs directly; do not manufacture scores or certainty.
- Keep source and freshness information visible when it affects the decision.
`,
  },
]
