export interface DesignPreset {
  id: string
  content: string
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'material-3',
    content: `# Material 3

## Visual language
Use Google's Material 3 design language: expressive but systematic, with tonal color, clear hierarchy, purposeful elevation, and controls that feel direct and touch-friendly. This file controls appearance, not page structure.

## Color
- Define semantic light and dark roles for background, surface, surface-container, outline, primary, secondary, tertiary, success, warning, and error.
- Build the interface from tonal surfaces rather than stacking shadows. Reserve the strongest primary color for the main action and current selection.
- Keep text and controls at WCAG AA contrast. Never rely on color alone for state.

## Typography
- Use Roboto when available, then a clean system sans-serif fallback.
- Use a deliberate type scale with distinct display, headline, title, body, label, and numeric roles.
- Prefer medium weight and size changes for hierarchy. Keep body copy at 14–16px with comfortable line height.

## Shape and elevation
- Use a coherent shape scale: 8px for small controls, 12–16px for fields and cards, and 24–28px only for prominent containers.
- Pills are reserved for filters, compact status, and segmented choices.
- Use tonal elevation first. Add soft shadows only when a surface must visibly float above another.

## Layout rhythm
- Use an 8px spacing grid with 4px for tight internal adjustments.
- Keep touch targets at least 44px. Let layouts reflow instead of shrinking controls on narrow screens.
- Use whitespace and surface tone to group content; do not wrap every block in a card.

## Components
- Buttons, fields, sliders, switches, chips, dialogs, and navigation should share the same color, state, shape, and focus conventions.
- Give every interactive control clear hover, pressed, selected, disabled, and keyboard-focus states.
- Keep labels visible and place validation or recovery text next to the affected control.

## Motion
- Use Material-style emphasized easing for meaningful changes in selection, expansion, and shared position.
- Keep transitions brief, interruptible, and limited to transform and opacity when possible.
- Respect prefers-reduced-motion and keep the final state fully understandable without animation.
`,
  },
  {
    id: 'apple-human-interface',
    content: `# Apple Human Interface

## Visual language
Use an Apple Human Interface–inspired visual language: calm, precise, content-led, and familiar. Controls should feel native and immediately understandable. This file controls appearance, not page structure.

## Color and materials
- Use semantic system-like colors that adapt cleanly to light and dark mode.
- Build hierarchy with grouped backgrounds, separators, and restrained translucent material. Do not apply glass, blur, or gradients to every surface.
- Keep body text, secondary text, separators, selection, success, warning, and destructive states distinct at WCAG AA contrast.

## Typography
- Use -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", and a system sans-serif fallback.
- Use larger display text sparingly. Most interface text should use 13–17px sizes with compact, readable line height.
- Use weight, alignment, and whitespace before adding color. Use tabular numerals for changing or comparable values.

## Shape and depth
- Use continuous-feeling rounded rectangles: 8–10px for controls and 12–16px for grouped surfaces.
- Prefer hairline separators and subtle material changes over visible card borders.
- Shadows are soft and rare, reserved for menus, sheets, and temporary floating layers.

## Layout rhythm
- Keep the content hierarchy obvious with generous outer margins and compact internal spacing.
- Align labels, values, and controls precisely. Preserve breathing room around the primary content.
- Keep pointer and touch targets at least 44px and account for safe-area insets on full-screen layouts.

## Components
- Use familiar labels and symbols. Icon-only controls require accessible names and should not replace a clearer text action.
- Primary actions are visually clear without becoming oversized. Destructive actions stay explicit and separated from routine actions.
- Use sheets, popovers, and dialogs only for temporary decisions; keep the underlying context visible when useful.

## Motion
- Use quick, natural transitions that reinforce continuity and direct manipulation.
- Avoid decorative looping animation and exaggerated bounce.
- Respect prefers-reduced-motion and keep every action usable without motion.
`,
  },
  {
    id: 'shadcn-ui',
    content: `# shadcn/ui

## Visual language
Use the crisp, neutral visual language associated with shadcn/ui: semantic tokens, strong component states, thin borders, restrained radius, and excellent form ergonomics. Recreate the visual principles with ordinary CSS; do not assume Tailwind or shadcn components are installed. This file controls appearance, not page structure.

## Tokens and color
- Define light and dark semantic tokens for background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, and ring.
- Use background/foreground pairs so text and icons always match their surface.
- Start from a neutral, zinc, stone, or slate base and add one purposeful brand accent. Keep charts and status colors distinct and accessible.

## Typography
- Use a modern system sans-serif such as Inter or Geist when available, then a system fallback.
- Keep interface text compact: 12px labels, 14–16px body, and 20–30px section headings.
- Use medium and semibold weights for control hierarchy and tabular numerals for aligned values.

## Shape and borders
- Use a shared radius token around 10px, deriving smaller radii for fields and larger radii for dialogs.
- Use 1px borders and visible focus rings. Prefer borders and surface contrast over heavy shadows.
- Do not put every text block inside a card; a card must express a real group or interaction boundary.

## Layout rhythm
- Use a disciplined 4px spacing scale and responsive grid or flex layouts.
- Keep forms compact but never reduce touch targets below 44px on mobile.
- Place labels, descriptions, errors, and actions consistently so users can scan repeated controls.

## Components
- Give buttons, inputs, selects, tabs, tables, dialogs, popovers, tooltips, and toasts consistent hover, active, disabled, and focus-visible states.
- Use explicit labels and concise helper text. Keep errors next to their field and preserve user input after failure.
- Tables and data rows use aligned columns, quiet dividers, and responsive alternatives rather than horizontal overflow.

## Motion
- Use 120–200ms opacity and transform transitions for popovers, dialogs, selection, and disclosure.
- Never use transition: all. Keep motion interruptible and honor prefers-reduced-motion.
`,
  },
]
