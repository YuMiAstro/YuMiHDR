// ============================================================================
//
//                          YuMiHDR for PixInsight
//
// ----------------------------------------------------------------------------
// Advanced HDR processor for non-linear deep-sky astrophotography.
// Designed to handle high-dynamic-range targets such as M42 (Orion Nebula),
// M81 (Bode's Galaxy) and faint IFN (Integrated Flux Nebula) backgrounds
// without flattening cores or amplifying noise in the shadows.
//
// Features
//   - Multi-scale Laplacian-style HDR with adaptive per-pixel gain
//   - Soft global tone curve (MTF + asinh highlight rolloff + shadow lift)
//   - Star-protection mask to keep stellar cores tight
//   - Masked IFN / faint background asinh stretch
//   - Chromaticity-preserving recombination
//   - Side-by-side real-time preview with draggable split
//   - Drag-and-drop process instances (parameters are saved with the icon)
//
// Update repository (paste into RESOURCES > Updates > Manage Repositories):
//
//      https://yumiastro.github.io/YuMiHDR/
//
// Project home:
//
//      https://github.com/YuMiAstro/YuMiHDR
//
// License: MIT
// Author : YuMiHDR contributors
// Version: 1.0.0
//
// ============================================================================

#feature-id    YuMiHDR : YuMiHDR > YuMiHDR
#feature-info  Advanced HDR for non-linear deep-sky astrophotography (M42, \
               M81, IFN) with multi-scale local tone mapping, star protection \
               and real-time side-by-side preview.

#define TITLE   "YuMiHDR"
#define VERSION "1.0.0"

#include <pjsr/UndoFlag.jsh>

#include "YuMiHDR-Parameters.js"
#include "YuMiHDR-Engine.js"
#include "YuMiHDR-Dialog.js"

// ----------------------------------------------------------------------------
// Run as a process container: apply current parameter set straight to the
// supplied view, without showing the dialog. This is what gets executed when
// the user drops the YuMiHDR process icon onto a view.
// ----------------------------------------------------------------------------
function ymhdr_processView(view, params)
{
   if (!view || view.isNull) {
      console.criticalln("YuMiHDR: no target view.");
      return;
   }
   let t0 = (new Date).getTime();
   let engine = new YuMiHDREngine();
   engine.applyToView(view, params);
   console.noteln(format("YuMiHDR: %s processed in %.2f s",
                         view.id, ((new Date).getTime() - t0) / 1000));
}

// ----------------------------------------------------------------------------
// Entry point.
// ----------------------------------------------------------------------------
function main()
{
   console.show();
   console.noteln("---- " + TITLE + " " + VERSION + " ----");

   let params = new YuMiHDRParameters();

   // Default target = active window's main view.
   let active = ImageWindow.activeWindow;
   if (active && !active.isNull) params.targetView = active.mainView;

   // Restore parameters when launched from a process icon.
   if (Parameters.isViewTarget) {
      params.load();
      params.targetView = Parameters.targetView;
      ymhdr_processView(params.targetView, params);
      return;
   }
   if (Parameters.isGlobalTarget) {
      params.load();
   }

   // Interactive dialog.
   let dlg = new YuMiHDRDialog(params);
   for (;;) {
      if (!dlg.execute()) {
         console.noteln("YuMiHDR cancelled.");
         break;
      }
      if (!params.targetView || params.targetView.isNull) {
         let mb = new MessageBox(
            "Please select a target view before applying.",
            TITLE, StdIcon_Warning, StdButton_Ok);
         mb.execute();
         continue;
      }
      ymhdr_processView(params.targetView, params);
      break;
   }
   console.hide();
}

main();
