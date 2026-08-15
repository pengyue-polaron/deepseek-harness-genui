# Real-user acceptance scenarios

These prompts state a goal, not a screen specification. The cases are acceptance tests for judgment and reusable behavior; none should be hard-coded into the plugin.

## Make a decision

> I want to spend half a day with my parents this weekend. Dad cannot walk far, Mum avoids strong sun, and I would like a good coffee. We are choosing between an indoor exhibition, a riverside walk, and the old town. Keep it under $20 per person and finish by 5 PM. Help us decide.

Give the main recommendation in prose. Use one compact working surface only if comparing and adjusting the few important trade-offs makes the decision easier. Save the final choice so a later question such as “What did we settle on?” can be answered from the user's actual selections.

## Show an interactive live card

> I will be in Hangzhou from Friday to Sunday. Please make an interactive weather card so I can compare each day, switch between temperature and rain, and refresh the forecast before I leave.

The explicit request removes presentation ambiguity. Use a connected weather tool when available; otherwise use only an approved credential-free public endpoint. Explain any travel implication briefly in prose, and let the card handle comparison and refresh.

## Work with connected tools

> Find promising open-source GUI agent models on Hugging Face, then show me their related GitHub repositories so I can compare activity, license, and fit for a small local experiment. Let me shortlist the ones worth testing.

Use the exact connected Hugging Face and GitHub tools rather than public HTTP substitutes. Ask for each narrowly scoped read permission only when first needed. Preserve the shortlist and report it back to the Agent for the next turn.

## Explain one difficult idea

> A clinic says a test is 95% accurate, but a friend says a positive result may still be wrong. I have no statistics background. Explain it using 1,000 people when only 10 actually have the condition.

Answer the misconception directly in prose. The useful interactive part is a small causal model where prevalence, sensitivity, and false-positive rate can be changed and the population counts update visibly. It should not look like an analytics dashboard. A follow-up such as “What if 100 out of 1,000 have it?” should update the same surface.

## Collect input during a longer task

> I need to arrange dinner for 6 people after work on Friday. I know one person is vegetarian, one has a tight budget, and 2 arrival times are uncertain. Move the plan forward; I will come back later and ask what is still missing.

Give a short coordination recommendation, then collect only the missing booking inputs in a focused surface. After submission, the next Agent turn must read the saved answers instead of guessing or asking for them again.

## Triage a connected work queue

> Look at the open issues in my GitHub project and help me choose what should make the next small release. I care about user impact, effort, and regressions. Do not change anything until I confirm the shortlist.

Read through the connected GitHub tool once, then make the shortlist interactive. Ask only for read permission while exploring. If the user later applies labels or a milestone, request the narrow write permission at that moment and read the result back from GitHub.

## Find a meeting time, then act

> Find 3 good times for a 45-minute design review with Mia and Leon next week. I prefer afternoons, but avoid placing it next to another long meeting. Let me compare the trade-offs before booking.

Use connected calendar availability to present a small comparison, preserving the selected slot in task state. Reading calendars and creating the event are separate permissions. Never book from an initial card load or selection click; wait for an explicit confirmation.

## Explore evidence from several sources

> Compare the main claims in these papers with the latest model cards I can access. I want to see which evidence supports each claim and flag the uncertain ones for follow-up.

Keep the synthesis in prose. Use a compact evidence surface only for source-linked comparison, uncertainty flags, and the user's follow-up list. Fetch each requested source once and preserve provenance; do not fan out into keyword sweeps.

## Monitor a genuinely live operation

> Show me the status of the release I just started. I need to see each stage, refresh it while I watch, and stop if the health check fails.

Use a connected deployment tool and request read access before monitoring. Poll only while the surface is visible, at a service-appropriate interval, and stop on unmount or a terminal state. A stop or rollback action requires a separate write permission and explicit confirmation.

## Stay with prose

> Rewrite this notice so it sounds natural: We will have the weekly meeting tomorrow at 3 PM. Please prepare your progress for this week in advance.

Return rewritten prose only. An interface would add friction.
