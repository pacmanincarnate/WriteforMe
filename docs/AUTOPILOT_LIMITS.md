# Autopilot limits and the balance readout

Autopilot used to have one brake: you. It ran until the book was done, something failed, or you
pressed Stop. Three limits and a readout now sit in Settings, Pipeline, "Autopilot Limits".

## Pause at a checkpoint

Choose where Autopilot pauses by itself: never (the old behaviour and the default), after every
scene, after every sequence, or after every act. It finishes the scene, says where it paused, and
turns itself off. Turn it on again to continue from the next scene.

## Token cap per run

A number of thousands of tokens one run may use, counted from the moment Autopilot is turned on.
Every model call the app makes while the run is going is counted, from what the provider reports
(prompt plus response). Works with every provider, including local ones.

## Spend cap per run

A number of US dollars one run may spend. The app does not estimate prices. It reads the
provider's own account figure before the first step and again between steps, and the difference
is what the run spent. That works where the provider reports spending for free: OpenRouter
(credits used) and nano-GPT (balance). For other providers the spend cap does nothing; use the
token cap.

Both caps are checked between steps, so the step in progress always finishes and a run can go
past a cap by up to one step. With several providers in use, the spending of each one that
reports it is added up.

## Balance readout

With an OpenRouter or nano-GPT key saved, the panel shows what the account has left: OpenRouter
credits left of the total, the key's limit left if it has one, and what was used today; nano-GPT's
balance. A reading is kept for five minutes; Refresh Balance reads it again. No model is called
and nothing is spent. If the service cannot be reached, the panel says so and nothing else
changes.

The panel also shows the tokens and calls of the current run.

## Where the code is

- `src/domain/autopilot/limits.ts`: when to pause.
- `src/services/llm/usageMeter.ts`, `src/services/llm/balance.ts`: the token count and the readout.
- `src/pipeline/autopilotLimits.ts`, `src/pipeline/autopilot.ts`: the checks in the run.
- `src/views/settings/SettingsAutopilotLimits.tsx`: the panel.
- `tests/unit/autopilot-limits.test.tsx`.
