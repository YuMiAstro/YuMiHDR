# Changelog

All notable changes to YuMiHDR are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-05-26
### Added
- First public release.
- Multi-scale Laplacian-style HDR engine with adaptive per-pixel gain.
- Global tone curve combining MTF, asinh highlight rolloff and shadow lift.
- Star protection via brightness-based mask with adjustable threshold and
  dilation.
- IFN / faint background lift, masked and smoothed.
- Chromaticity-preserving recombination plus optional saturation polish.
- Real-time side-by-side preview pane with draggable split.
- Drag-and-drop process instances; parameters persist with the icon.
- PixInsight update repository at `https://yumiastro.github.io/YuMiHDR/`.
