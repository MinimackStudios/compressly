# Changelog

All notable changes to this project will be documented in this file.

## [1.0.6] - 2025-10-09

### Added

- Audio compression support: re-encode common audio formats (MP3, WAV, M4A/AAC, FLAC, OGG/Opus) while preserving original container where possible.
- Per-file progress UI improvements and smoothing for more responsive progress bars.
- Update-check flow: detect new releases, show modal, and download the installer to the user's Downloads folder.
- "winget install ffmpeg" instruction (copyable) shown in the FFmpeg modal.
- Music thumbnail SVG now uses the app brand gradient for a consistent look.

### Fixed

- Fixed crashes and errors related to .m4a files that contained embedded artwork by stripping non-audio streams during audio compression (previous attempts to transcode artwork could fail).
- Restored missing globals used by the UI (files, fileStates, anyCancelled) which fixed "files is not defined" errors.
- Improved error logging for ffmpeg operations to aid debugging.

### Changed

- Installer download in the update flow now writes the downloaded asset to the Downloads folder and attempts to run the installer via the main process.
- Settings (target size, FPS, resolution, priority) persisted to localStorage.
- UI/UX: download spinner placement, dynamic button resizing, and other polish.

### Removed

- The app no longer preserves or attempts to re-embed album artwork into compressed audio outputs (default behavior changed to strip artwork to avoid conversion errors and simplify processing).

## [1.0.5] - (previous)

- See prior release notes (not included here).

---

Notes:

- For large update assets the current download is buffered in the renderer; consider switching to main-process streaming in a future update to reduce memory pressure.
- If users want album art preservation as an opt-in feature, a future release could add a setting (Preserve album art) and a safer extraction/remux flow.
