# Real-User Acceptance Scenarios

These prompts state the user's goal, not a screen specification. None is hard-coded into the plugin.

## 1. Choose a Local Vision Model

Design: `notion-calm`

> I want to run a vision-language model locally on a Mac with 24 GB of unified memory, mainly for screenshots and simple documents. Use only the Hugging Face and GitHub sources I already connected. Explain the practical limits around memory, licenses, and runnable implementations, then help me keep the candidates worth considering. I will ask for a final recommendation after I choose.

Acceptance:

- Uses real Hugging Face and GitHub evidence within the discovery budget.
- Keeps the main recommendation and caveats in prose.
- Saves filters and selected candidates in the task.
- Answers the follow-up from saved choices without searching again.

## 2. Find Calendar Time Safely

Design: `notion-calm`

> Look at my availability next week and find three 90-minute windows for focused writing. Keep private event titles out of the answer. I do not want a button for every 15-minute start time; show only two or three useful choices per day. Do not create anything until I confirm the exact times.

Acceptance:

- Reads real calendar availability without exposing unrelated event content.
- Shows a small set of non-overlapping options inside working hours.
- Saves the selected times and reads them back on the next turn.
- Requests explicit confirmation before writing, then verifies the created events through the same calendar connection.

## 3. Explore What Limits Photosynthesis

Design: `material-expressive`

> I keep thinking photosynthesis means a plant uses sunlight to make sugar directly, but my teacher says the light reactions and Calvin cycle are different. Help me understand which step becomes limiting when light, carbon dioxide, temperature, or stomatal opening changes. I want to change the conditions myself and watch energy and matter move through the system.

Acceptance:

- Explains the causal chain in concise prose before the app.
- Uses one control group, one main model, and one changing takeaway.
- Persists all four controls.
- Explains the exact saved conditions on the next turn.

## 4. Build an Intuition for the Milky Way

Design: `material-expressive`

> I know the Sun is inside the Milky Way, but I have no intuition for the scale. Where is the Sun, how far away is the center, and how many orders of magnitude separate nearby stars from the whole galaxy? Take me from the Solar System outward. I want to change the scale and viewpoint, compare light-travel times, and understand how we infer the galaxy's shape from inside it. Do not just list facts.

Acceptance:

- Keeps the observational explanation in prose.
- Provides a logarithmic scale, multiple viewpoints, and meaningful landmarks.
- Persists the scale, viewpoint, and selected target.
- Translates saved values into natural language on the next turn without exposing internal keys.

## Negative Control: Stay With Prose

> Rewrite this notice so it sounds natural: We will have the weekly meeting tomorrow at 3 PM. Please prepare your progress for this week in advance.

Acceptance: returns prose only. An interface would add friction.
