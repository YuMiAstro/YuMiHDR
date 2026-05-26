# Installing YuMiHDR

YuMiHDR is a PixInsight JavaScript module. The recommended install path
is via PixInsight's update mechanism &mdash; this is the same way you
install any official or third-party PixInsight script package.

## Via the update repository (recommended)

1. In PixInsight, open **RESOURCES &rarr; Updates &rarr; Manage Repositories**.
2. Click **Add**, paste the following URL, then **OK**:

       https://yumiastro.github.io/YuMiHDR/

3. Open **RESOURCES &rarr; Updates &rarr; Check for Updates**.
4. Accept the proposed update.
5. When PixInsight prompts you, **restart the application**.
6. After restart, the script appears under **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**.

That's it &mdash; PixInsight will pick up future releases from the same
URL automatically. To uninstall, remove the repository from the same
*Manage Repositories* dialog and delete the files under
`<PixInsightDir>/src/scripts/YuMiHDR/`.

## Manual install (offline / advanced)

If you can't reach the update URL (e.g. running PixInsight on an
isolated workstation):

1. Download `YuMiHDR-script-x.y.z.zip` from
   [GitHub Releases](https://github.com/YuMiAstro/YuMiHDR/releases).
2. Open the zip. Its layout mirrors the PixInsight installation root.
3. Copy the contents so that you have:

       <PixInsightDir>/src/scripts/YuMiHDR/YuMiHDR.js
       <PixInsightDir>/src/scripts/YuMiHDR/YuMiHDR-Parameters.js
       <PixInsightDir>/src/scripts/YuMiHDR/YuMiHDR-Engine.js
       <PixInsightDir>/src/scripts/YuMiHDR/YuMiHDR-Dialog.js

4. Launch PixInsight, then **SCRIPT &rarr; Feature Scripts...** click
   **Add**, point it at `<PixInsightDir>/src/scripts/YuMiHDR/` and
   click **Done**.
5. The script appears under **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**.

## Verifying the install

A quick smoke test:

1. Open any non-linear deep-sky image (auto-stretched is fine).
2. Run **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**.
3. The dialog should appear and within a couple of seconds the preview
   pane should fill in with a *Before / After* split view.
4. Drag the green vertical line to compare; the right half should look
   noticeably more HDR-compressed.

If the dialog appears but the preview stays empty, check the PixInsight
**Process Console** for warnings &mdash; the most common cause is a
view selection issue.

## System requirements

- PixInsight 1.8.9 or newer, any platform (Windows, macOS, Linux).
- Recommended: 8 GB RAM for typical 6000&times;4000 mono images,
  16 GB for OSC or 32-bit float at large dimensions. Memory use scales
  with the number of decomposition scales (`Scales` parameter).
