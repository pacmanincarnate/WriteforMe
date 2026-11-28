# Prompt order for caching

Every model service and every local model can skip re-reading a prompt, but only for the part at
its start that is the same as the last time. Claude, OpenAI, Gemini and DeepSeek bill that part at
a fraction of the price. KoboldCPP and llama.cpp do not have to read it again, which on a slow
machine is most of the wait. So the rule is: **what changes least goes first.**

## The four tiers

| Tier | Changes | In the scene-writing prompt |
| --- | --- | --- |
| story | only when the story settings change | authorial persona, genre rules, anti-patterns, style, author note, world primer |
| cast | only when the people in the scene change | character voices, character profiles |
| scene | with every scene | story so far, relationship matrix, active state, lore, previous scene, blueprint, pacing targets |
| call | with every call | the draft being revised, the critique, a rewrite or directive instruction |

The scene-writing prompt was already close to this order. One thing moved: the character voices and
profiles now come **before** the story so far, because consecutive scenes often share a cast while
the story so far changes after every scene.

`cacheOrderProblems()` in `src/domain/prompt/cacheLayout.ts` reads a built prompt and names any
section that sits after a faster-changing one. A unit test runs it on the real prompt, so a later
edit that puts something volatile ahead of something stable fails the test with a sentence saying
which section to move.

## The cache point

The scene-writing prompt marks the end of its scene tier. Everything before the mark is the same,
letter for letter, for every call that writes that scene: the writing agent's later turns (it may
look things up with tools before it commits) and any rewrite after a critique or a directive.

The mark is an invisible character sequence (`CACHE_POINT`). It is taken out of the prompt before
anything is sent or logged, in the two places every prompt passes through
(`pipeline/aiDispatch.ts` and `services/llm/agenticLoop.ts`), and turned into a position.

- **Claude, directly or through OpenRouter**, is told the position, as a cache mark on the opening
  message. Before this change the opening message of the writing agent's conversation had no mark,
  so each of its turns paid full price to re-read the whole scene prompt.
- **OpenAI, Gemini, DeepSeek, nano-GPT, KoboldCPP** cache by matching the start of the prompt by
  themselves. They are not told anything; they benefit from the order alone.

Any other prompt builder can use the same mark: put `CACHE_POINT` where the repeated part ends.

## What it costs

Claude charges about a quarter more than normal to write a part into its cache, and about a tenth
of normal to read it back, and a cached part is kept for five minutes. So:

- A scene whose writer takes two or more turns, or that is rewritten within five minutes, costs
  less: each re-read of the scene prompt is about 90% cheaper.
- A scene written in one turn and never rewritten costs about a quarter more for the marked part.

Settings, Pipeline, **Prompt Cache Marks** turns the mark off. The order stays either way. The
Logs page already shows how many tokens of each call were read from cache, which is how to see
whether it pays off for a given story and model.

## Not done

- Only the scene-writing prompt is marked. Planning, review and continuity prompts are unchanged.
- No second mark at the end of the story tier. It would help only when the next scene is written
  within five minutes, and would cost a little on every scene otherwise.
- KoboldCPP keeps the work for one prompt at a time, so the saved start is lost as soon as a
  different kind of call (a review, a summary) runs. Adventure solves that by saving the model's
  state to disk between calls; that is not ported here.
