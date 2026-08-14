export interface DesignPreset {
  id: string
  content: string
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'notion-calm',
    content: `# Notion Calm

## Intent
Build a quiet, content-first workspace that feels like paper rather than a dashboard. Let the user's words and objects carry the visual weight.

## Color
- Support light and dark mode with CSS custom properties and prefers-color-scheme.
- Light canvas: #ffffff; raised surface: #f7f6f3; primary ink: #37352f; muted ink: #787774.
- Dark canvas: #191919; raised surface: #202020; primary ink: #ebebeb; muted ink: #9b9b9b.
- Use one muted semantic accent only when an action or state needs it. No gradients or neon glow.

## Type
- Use ui-sans-serif for controls and Georgia for an occasional editorial heading.
- Body text is 14-16px with a relaxed 1.5-1.65 line height.
- Use sentence case. Avoid oversized hero type and decorative all-caps labels.

## Layout
- Keep the main reading column between 720px and 980px.
- Use 8px spacing increments, generous page margins, and compact controls.
- Prefer a document flow, simple tables, checklists, and inline properties over nested cards.

## Components
- Borders are 1px and low contrast. Radius stays between 4px and 8px.
- Buttons look like quiet controls until hovered; destructive actions remain explicit.
- Use icons sparingly and never as decoration.
- Empty states should say what is missing and offer one next action.

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
    id: 'material-expressive',
    content: `# Material Expressive

## Intent
Use the adaptable Material 3 model for a warm, personal interface with clear hierarchy, responsive components, and purposeful motion. Keep expression tied to the user's content.

Reference: https://m3.material.io/

## Color
- Define light and dark color schemes from one source hue using CSS custom properties.
- Separate primary, secondary, surface, surface-container, outline, success, and error roles.
- Meet WCAG AA contrast for text and controls. Never place body text directly on a busy gradient.
- Reserve the strongest color for the primary action and current selection.

## Type
- Use a variable sans face when available, otherwise ui-rounded or ui-sans-serif.
- Use a clear scale: 12px labels, 14-16px body, 20-28px section titles, and at most one 36-48px display line.
- Keep labels in sentence case and use weight before adding more colors.

## Shape
- Use contrasting shape roles: 12px for fields, 16-20px for cards, and pill shapes for compact filters or status.
- Avoid putting every text block in a card. Containers must express grouping or interaction.

## Layout
- Build an adaptive grid that collapses cleanly at 840px and 560px.
- Touch targets are at least 44px. Important actions remain reachable on mobile.
- Use tonal surface changes to show depth; keep shadows soft and rare.

## Motion
- Use 180-280ms emphasized easing for expansion, selection, and shared-axis changes.
- Animate one meaningful transition at a time and respect prefers-reduced-motion.

## Copy
- Make the next action obvious and specific.
- Prefer "Plan Friday dinner" over "Unlock your culinary journey".
- Do not mention AI, prompts, architecture, or design systems unless the user asks.
`,
  },
]
