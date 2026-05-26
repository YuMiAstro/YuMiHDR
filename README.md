# YuMiHDR

**Advanced HDR processor for non-linear deep-sky astrophotography in
PixInsight.** Designed for objects with extreme dynamic range &mdash; M42
(Orion Nebula), M81 (Bode's Galaxy), the Andromeda core, and faint IFN
(Integrated Flux Nebula) backgrounds &mdash; without flattening cores or
muddying the shadows.

> 中文文档请见 [README.zh-CN.md](README.zh-CN.md)

---

## Installation

The recommended way is via PixInsight's update mechanism.

1. In PixInsight, open **RESOURCES &rarr; Updates &rarr; Manage Repositories**.
2. Click **Add** and paste:

       https://yumiastro.github.io/YuMiHDR/

3. Click **OK**, then **RESOURCES &rarr; Updates &rarr; Check for Updates**.
4. Apply the proposed update and **restart PixInsight** when prompted.
5. After restart, run **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**.

### Manual install (advanced users)

1. Download the latest `YuMiHDR-script-x.y.z.zip` from
   [Releases](https://github.com/YuMiAstro/YuMiHDR/releases).
2. Extract the archive over your PixInsight install directory so that the
   files end up in `<PixInsightDir>/src/scripts/YuMiHDR/`.
3. In PixInsight: **SCRIPT &rarr; Feature Scripts... &rarr; Add** and select
   the `src/scripts/YuMiHDR/` folder.

---

## What's in the box

- **Multi-scale HDR core** &mdash; a Laplacian-style pyramid with adaptive
  per-pixel gain. Bright cores are compressed; faint structure is amplified.
- **Soft global tone curve** &mdash; MTF midtone shaping, asinh-style
  highlight rolloff and median-anchored shadow lift.
- **Star protection** &mdash; brightness-based mask with adjustable
  dilation, keeps stellar cores tight.
- **IFN / faint background lift** &mdash; masked asinh stretch only inside
  the sky background, designed to reveal IFN without blowing up noise.
- **Chromaticity-preserving recombination** &mdash; choose between ratio-mode
  (preserves R:G:B ratios) or additive-mode (safer near saturation).
- **Real-time side-by-side preview** with a draggable split &mdash; sliders
  update the preview within ~80 ms by default.
- **Process icon support** &mdash; drag the *New Instance* badge to a
  workspace to save a parameter set; drop the icon on a view to apply.

---

## Quick start

1. Stretch your image to a normal non-linear state (e.g. via
   `HistogramTransformation`, `ScreenTransferFunction &rarr; Auto stretch
   &rarr; HT`, or `GeneralizedHyperbolicStretch`).
2. Launch **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**.
3. Pick the view from the **Target view** dropdown. The preview pane fills
   in within a moment.
4. Suggested starting points:
   - **M42 / bright HII** &mdash; *Large-scale compression* 0.70,
     *Core compression* 0.65, *Star protection* 0.80, *IFN boost* 0.0.
   - **M81 / galaxy** &mdash; *Large-scale compression* 0.55,
     *Mid-scale detail* 1.40, *Highlight rolloff* 0.45,
     *Local contrast* 0.55.
   - **IFN field** &mdash; *Large-scale compression* 0.40,
     *Shadow lift* 0.40, *IFN boost* 0.55, *IFN threshold* 0.10,
     *Star protection* 0.85.
5. Drag the green split bar in the preview to compare before/after.
6. When satisfied, click **Apply**.

See [doc/parameters.md](doc/parameters.md) for a parameter-by-parameter
guide and [doc/algorithm.md](doc/algorithm.md) for the math.

---

## Repository layout

    src/scripts/YuMiHDR/         PJSR sources (this is what gets installed)
        YuMiHDR.js               entry point + #feature-id
        YuMiHDR-Parameters.js    parameter container & persistence
        YuMiHDR-Engine.js        HDR processing pipeline
        YuMiHDR-Dialog.js        interactive dialog + preview

    repository/                  what gets published as the update URL
        updates.xri              PixInsight update manifest
        index.html               human-readable landing page
        YuMiHDR-script-*.zip     payload, produced by tools/build.ps1

    tools/build.ps1              packager: builds the zip, signs the xri
    doc/                         user / algorithm documentation
    CHANGELOG.md  LICENSE  README.md

---

## Building from source

Requires PowerShell 5.1+ (or `pwsh`). From the repo root:

    pwsh -File tools/build.ps1 -Version 1.0.0

This creates `dist/YuMiHDR-script-1.0.0.zip`, copies it into `repository/`
and rewrites `repository/updates.xri` with the actual SHA-1 and release date.
Publish the contents of `repository/` at the URL you advertise.

---

## License

MIT &mdash; see [LICENSE](LICENSE).
