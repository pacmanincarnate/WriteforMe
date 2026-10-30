# EllipsisProse
### Zero-install AI-automated Storywriting System

## Getting Started
1. To get started, navigate to https://pacmanincarnate.github.io/WriteforMe/
This is a static page hosted on GitHub; all your data is stored entirely in your browser's cache.
2. Navigate to settings in the left panel to set your model backends. The app supports Gemini, OpenRouter, NanoGPT, or Codex APIs, or a local KoboldCPP instance for text generation.
(Setting up an account in OpenRouter is free with several models, and adding money lets you use a wider selection.) Using a local model with KoboldCPP is completely free, as long as you have a dedicated graphics card.
3. You can also set up image generation using Gemini, OpenRouter, or a local ComfyUI instance using Krea 2.
4. Once your model backend is set up, navigate to New Story Setup. Here you can provide your story prompt, giving as much or as little detail as you like.
5. The Author's Note is completely optional. This prompt will be added to the end of the context for every step of generation, helping guide the story a little better.
6. You can switch between novel mode and audio drama mode (still in progress!). You can also set the length of novel you are looking for, and the system will adjust it's structure as necessary to achieve that. The default is an average novel length.
7. Pressing Initiate Story will run the first stage of the pipeline, then pause for you to review the concept and overall story arc direction. Clicking Start Autopilot skips this pause and begins the full pipeline.
8. Now just wait! While open, the system runs the pipeline, generating your story from initial concept to scene-level prose. The UI jumps to the current focus to help you understand what is happening.
9. If you stop generation, all progress is saved and can be restarted at any time.
10. Export your story from the bottom of the navigation panel in EPUB format, used by book readers across platforms. This export includes everything needed to reimport the story, so it acts as a portable format for the application.

## What is this madness?!
EllipsisProse runs many LLM calls to draft your story from start to finished prose. The system relies on a series of distinct 'agents', each tasked with crafting part of the narrative structure, reviewing that structure, or modifying the generated content. Additional checks run throughout to ensure coherence, reduce "AI-isms," and store lore, events, and relationships. The end result is a story that fits your concept in a creative way, including multiple complex characters, narrative threads, and reveals.

## Shut up and take my money!
I won't take your money, this is fully open source and freely offered. I wanted to see if I could make it, and I wanted cheap, personalized content to listen to on transit or when working out. I'm offering it here for anyone who wants to try it out, since I've spent a long time getting it to the quality it's now.

As for the APIs, the cost can vary significantly, based on a number of factors. Koboldcpp runs locally (I recommend Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive, personally) and is completely free and pretty fast. When I use a cloud model, I use DeepSeek 4 Flash. To generate a full novel, I pay less than $2. DeepSeek Pro is closer to $5-10, and Claude models are quite a bit more than that at pay-per-token costs (but likely higher quality). You definitely get what you pay for, but the locally generated novels are not bad, and the DeepSeek Flash novels are genuinely enjoyable reading material. Because we break the process down so much and guide generation at each step with very specific context and prompting, the model size really only affects nuance.
