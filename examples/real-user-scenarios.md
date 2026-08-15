# Real-user acceptance scenarios

These prompts describe a goal, not a screen. None is hard-coded into the plugin.

## Prepare a release from live repository evidence

> Help me prepare the next small release of `modelcontextprotocol/servers`. Look at recent open issues, pull requests, and failed Actions. Find a set that can be finished in one day, has clear user impact, and keeps regression risk under control. Do not change the repository yet. I want to inspect the evidence and confirm the shortlist before you continue with the release plan.

The useful surface is a source-linked shortlist. The Agent must distinguish competing PRs, preserve the user's choices, and read them back on the next turn.

## Understand why a positive test can be wrong

> A clinic says a test is 95% accurate, but a friend says a positive result may still be wrong. I have no statistics background. Explain it using 10,000 people and let me change how common the condition is.

The interactive part is a population model, not a dashboard: prevalence, sensitivity, and specificity change the true- and false-positive counts and the takeaway.

## Explore what limits photosynthesis

> I keep thinking photosynthesis means a plant uses sunlight to make sugar directly, but my teacher says the light reactions and Calvin cycle are different. Help me understand which step becomes limiting when light, carbon dioxide, temperature, or stomatal opening changes. I want to change the conditions myself and watch energy and matter move through the system.

The model should connect light reactions, ATP/NADPH, the Calvin cycle, photorespiration, heat loss, and sugar output without turning into an encyclopedia page.

## Build an intuition for the scale of the Milky Way

> I know the Sun is inside the Milky Way, but I have no intuition for the scale. Where is the Sun, how far away is the center, and how many orders of magnitude separate nearby stars from the whole galaxy? Take me from the Solar System outward. I want to change the scale and viewpoint, see how long light takes, and understand how we infer the galaxy's shape from inside it. Do not just list facts.

The useful surface is a logarithmic journey with face-on and edge-on views, landmarks, and light-travel time.

## Stay with prose

> Rewrite this notice so it sounds natural: We will have the weekly meeting tomorrow at 3 PM. Please prepare your progress for this week in advance.

Return prose only. An interface would add friction.
