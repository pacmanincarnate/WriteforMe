# Stop really stops

Pressing Stop on Autopilot used to flip a switch that the pipeline only looked at between steps.
The model call already in flight ran to the end: a long scene kept generating, a hosted API kept
billing for it, and a local model stayed busy. No generation request carried a signal the app
could abort; the only abort was the timeout.

Now a Stop press cancels the call in flight.

## What happens on Stop

1. Every generation request (Gemini, OpenRouter, nano-GPT, Anthropic, KoboldCPP, and the Claude
   Code and Codex bridges) carries one shared signal, `modelStopSignal()`.
2. Turning Autopilot off calls `stopModelCalls()`, which aborts that signal. The browser drops the
   request, so a hosted API stops streaming. The Claude Code bridge already ended its process when
   the browser hung up; the Codex bridge now does the same. A real KoboldCPP is also sent
   `POST /api/extra/abort`, because it keeps generating after a dropped connection.
3. While the interrupted step unwinds, new model calls are refused at once, so nothing retries
   behind your back. Retry waits are cut short too. When the step has let go, calls work again.
4. A stopped call is not treated as a failure: no retry, no error toast, no intervention prompt.
   The prompt log shows it as "Stopped by you before the model finished."

## What is kept

Nothing from the cancelled call is kept. Many pipeline checks fail open (a review that errors
lets the draft through), so two guards stop a half-finished result from being saved as done:
the escalation runner refuses to return a draft after a stop, and scene writing refuses to archive
a scene after a stop. Work finished before you pressed Stop stays as it was, and Autopilot picks up
from the same scene next time.

## Where the code is

- `src/services/llm/stop.ts`: the switch (`stopModelCalls`, `resumeModelCalls`, `ModelStopError`).
- `src/services/http/fetchWithTimeout.ts`: reports the caller's own abort reason, not a timeout.
- `src/pipeline/aiDispatch.ts`: no retry or error report for a stop.
- `src/hooks/useContinuousAutopilot.ts`: the Stop press and the release afterwards.
- `tests/unit/model-stop.test.tsx`.

## Limits

- Only the Autopilot switch triggers it. A single manual step (for example one scene written by
  hand) still has no Stop button.
- Tokens a hosted API produced before the stop are still billed by that provider.
