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

## Triage a live incident without a permanent dashboard

> The checkout API started timing out after today's deploy. Use the monitoring, issue tracker, and deployment tools already connected to this Harness. Tell me what changed, group the failures by likely cause, and give me a small read-only incident board that I can filter by service and time window. Do not roll back or change production until I explicitly approve the exact action.

The Agent should keep the diagnosis in prose and use the temporary surface for evidence, filtering, and the action boundary. Any mutation needs a separate, exact confirmation.

## Reconcile exceptions instead of reading a long report

> Compare this month's failed reimbursements with their receipts and policy checks. Explain the recurring causes, then let me resolve only the ambiguous rows. Keep my decisions so you can draft the final exception summary afterward.

The useful surface is an evidence-linked exception queue. The next turn must use the saved decisions rather than asking the user to repeat them.

## Collect structured feedback during a larger task

> You are helping me review six onboarding flows. First explain the patterns you found. Then give me a compact way to rate clarity, trust, and effort for each flow and add one note. When I finish, use my ratings to write the recommendation.

The UI is a temporary input instrument tailored to the current evidence, not a reusable survey builder. Partial progress should survive closing and reopening the Canvas.

## Configure one safe action over connected tools

> Prepare a staging deployment from the current release candidate. Read the repository and deployment configuration, explain anything risky, and let me choose the region, rollout percentage, and health-check window. Show the exact action before asking me to approve it. Do not deploy while I am still adjusting the form.

The generated UI turns existing tools into a task-specific control surface. Configuration state and tool credentials remain separate, and the final mutation requires explicit approval.

## Compare evidence across sources

> Find small vision-language models that can run locally on a 24 GB machine. Search the model hub and the implementation repositories I connected. Explain the main constraints, then let me filter by license, memory, recency, and runnable code and keep a shortlist for the next turn.

The Agent should reconcile model metadata with repository evidence instead of copying one source. The UI provides filters and saved choices; prose carries caveats and conclusions.

## Stay with prose

> Rewrite this notice so it sounds natural: We will have the weekly meeting tomorrow at 3 PM. Please prepare your progress for this week in advance.

Return prose only. An interface would add friction.
