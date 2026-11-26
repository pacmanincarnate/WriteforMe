# Third-party software

## Shipped inside the EllipsisProse installer

| Component | License | Notes |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) (includes Chromium and Node.js) | MIT, plus the Chromium and Node.js notices in `LICENSES.chromium.html` next to the program | The desktop shell |
| [7zip-bin](https://github.com/develar/7zip-bin) (`7za.exe`) | 7-Zip: GNU LGPL-2.1 with the unRAR restriction; package: MIT | Unpacks downloaded backends. Source: https://www.7-zip.org |
| The EllipsisProse web app and its npm dependencies | See `LICENSE` and each package | Same build as the web version |

## Downloaded on request, never shipped

The installer contains none of these. When you press **Install** in the Backends window, the app
downloads the program straight from the project's own GitHub release, unchanged, into your
backends folder. Each keeps its own license, which applies to your copy:

| Backend | License | Source |
| --- | --- | --- |
| KoboldCpp | GNU AGPL-3.0 | https://github.com/LostRuins/koboldcpp |
| ComfyUI (Windows portable) | GNU GPL-3.0 | https://github.com/Comfy-Org/ComfyUI |
| audio.cpp | Apache-2.0 | https://github.com/0xShug0/audio.cpp |

Voice models (Breeze 2, Fish Audio Drama-3, Whisper, Silero VAD) and any text or image model you
download come from Hugging Face under their authors' licenses. The Backends window links each one.
