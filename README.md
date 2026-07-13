# Compressly

**Compressly** is a desktop app built with Electron that compresses images, videos, and audio locally. Use exact target-size controls when a file must fit a limit, or Smart Compression when you want a smaller file while retaining strong visual fidelity. **Requires Windows 10 or later, or macOS 12 Monterey or later.**

There are many tools for compressing videos, but few that also support
images & audio, fewer still that work entirely offline, and even fewer
that don't have some sort of file size limit and/or lock features
behind a paywall.

So I decided: Why not make my own? With little to no coding experience, I used GitHub Copilot to make it a reality, prompting, refining, and troubleshooting until it matched how I wanted it to be. Compressly is the result of persistence, curiosity, and creative direction.

## Getting Started

To run Compressly locally:

1. Clone the repository  
   `git clone https://github.com/compressly/compressly`
2. Open the folder in Visual Studio Code
3. Install dependencies  
   `npm install`
4. Start the app  
   `npm start`

## Building the App

To compile a production build:

1. Run the build script  
   `npm run build`
2. Your packaged app will be ready in the `dist` folder

## Version 2.0

Version 2.0 adds Smart Compression, target-size and FPS presets, a full per-file Detailed View, sampled SSIM analysis for visual media, a Smart Compression completion dashboard, and a guided welcome tour. Saved preferences and generated thumbnail cache data can be cleared from **About → Reset Compressly data** without deleting source files or compressed outputs.

### macOS arm64 note

- The mac build now targets both `x64` and `arm64`.
- For bundled FFmpeg on Apple Silicon, place binaries at:
   - `build/ffmpeg/darwin/arm64/ffmpeg`
   - `build/ffmpeg/darwin/arm64/ffprobe`
- Existing Intel binaries can remain at `build/ffmpeg/darwin/ffmpeg` and `build/ffmpeg/darwin/ffprobe` (or under `build/ffmpeg/darwin/x64/`).

## Website

The Compressly landing page is hosted at [compressly.github.io](https://compressly.github.io)  
Source code for the website: https://github.com/compressly/compressly.github.io
