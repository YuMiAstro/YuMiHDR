// ============================================================================
// YuMiHDR-Dialog.js
// ----------------------------------------------------------------------------
// Main interactive dialog with real-time preview.
// ============================================================================

#ifndef __YUMIHDR_DIALOG_JS__
#define __YUMIHDR_DIALOG_JS__

#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/ColorSpace.jsh>

// ----------------------------------------------------------------------------
// Down-sample an Image into a preview-size Image (max edge = maxSize).
// ----------------------------------------------------------------------------
function ymhdr_downsample(image, maxSize)
{
   let W = image.width, H = image.height;
   let scale = Math.min(1.0, maxSize / Math.max(W, H));
   if (scale >= 1.0) return new Image(image);
   let newW = Math.max(1, Math.round(W * scale));
   let newH = Math.max(1, Math.round(H * scale));
   let dst = new Image(newW, newH, image.numberOfChannels,
                       image.colorSpace, 32, SampleType_Real);
   // Simple area-average down-sample (cheap, smooth enough for preview).
   let invSX = W / newW, invSY = H / newH;
   for (let c = 0; c < image.numberOfChannels; ++c)
      for (let y = 0; y < newH; ++y) {
         let y0 = Math.floor(y * invSY);
         let y1 = Math.min(H, Math.floor((y + 1) * invSY));
         if (y1 <= y0) y1 = y0 + 1;
         for (let x = 0; x < newW; ++x) {
            let x0 = Math.floor(x * invSX);
            let x1 = Math.min(W, Math.floor((x + 1) * invSX));
            if (x1 <= x0) x1 = x0 + 1;
            let s = 0, n = 0;
            for (let yy = y0; yy < y1; ++yy)
               for (let xx = x0; xx < x1; ++xx) { s += image.sample(xx, yy, c); ++n; }
            dst.setSample(s / n, x, y, c);
         }
      }
   return dst;
}

// ----------------------------------------------------------------------------
// Convert a normalised [0..1] Image (RGB or Gray) to a Bitmap for display.
// Uses a simple gamma 1/2.2 lift so the preview looks consistent with what
// the user sees in the workspace under a default STF-free rendering.
// ----------------------------------------------------------------------------
function ymhdr_imageToBitmap(image)
{
   let W = image.width, H = image.height;
   let bmp = new Bitmap(W, H);
   let isColor = image.isColor;
   let GAMMA = 1.0 / 1.0;        // assume image is already non-linear
   for (let y = 0; y < H; ++y) {
      for (let x = 0; x < W; ++x) {
         let r, g, b;
         if (isColor) {
            r = image.sample(x, y, 0);
            g = image.sample(x, y, 1);
            b = image.sample(x, y, 2);
         } else {
            r = g = b = image.sample(x, y, 0);
         }
         let R = Math.min(255, Math.max(0, Math.round(255 * r))) | 0;
         let G = Math.min(255, Math.max(0, Math.round(255 * g))) | 0;
         let B = Math.min(255, Math.max(0, Math.round(255 * b))) | 0;
         bmp.setPixel(x, y, 0xff000000 | (R << 16) | (G << 8) | B);
      }
   }
   return bmp;
}

// ----------------------------------------------------------------------------
// Preview pane: shows side-by-side "before / after" with a draggable split.
// ----------------------------------------------------------------------------
function YuMiHDRPreviewPane(parent)
{
   this.__base__ = Frame;
   this.__base__(parent);

   this.frameStyle = FrameStyle_Sunken;
   this.setMinSize(560, 420);
   this.setScaledMinSize(560, 420);

   this.beforeBitmap = null;
   this.afterBitmap  = null;
   this.splitPos     = 0.5;
   this.busy         = false;

   this.setBefore = function(bmp) { this.beforeBitmap = bmp; this.update(); };
   this.setAfter  = function(bmp) { this.afterBitmap  = bmp; this.update(); };

   this.onPaint = function()
   {
      let g = new Graphics(this);
      g.fillRect(0, 0, this.width, this.height, new Brush(0xff202020));

      let bmp = this.afterBitmap || this.beforeBitmap;
      if (bmp) {
         // Fit bmp to control while preserving aspect.
         let r = Math.min(this.width / bmp.width, this.height / bmp.height);
         let dw = Math.round(bmp.width * r);
         let dh = Math.round(bmp.height * r);
         let dx = ((this.width  - dw) >> 1);
         let dy = ((this.height - dh) >> 1);

         // Draw "after" on the right side, "before" on the left side of the split.
         if (this.beforeBitmap && this.afterBitmap) {
            let splitX = dx + Math.round(dw * this.splitPos);
            // Before (left half of dest)
            g.drawScaledBitmapRect(dx, dy, splitX, dy + dh, this.beforeBitmap);
            // After (right half)
            g.drawScaledBitmapRect(splitX, dy, dx + dw, dy + dh, this.afterBitmap);
            // Split line
            g.pen = new Pen(0xff80ff80, 1);
            g.drawLine(splitX, dy, splitX, dy + dh);
            // Labels
            g.pen = new Pen(0xffe0e0e0);
            g.drawText(dx + 6, dy + 16, "Before");
            g.drawText(splitX + 6, dy + 16, "After");
         } else {
            g.drawScaledBitmap(dx, dy, dw, dh, bmp);
         }

         // Spinner / busy hint
         if (this.busy) {
            g.pen = new Pen(0xffffff00);
            g.drawText(dx + 6, dy + dh - 6, "computing...");
         }
      } else {
         g.pen = new Pen(0xff808080);
         g.drawText(20, 30, "No preview. Select a target view and press Refresh.");
      }
      g.end();
   };

   this.onMouseMove = function(x, y, btn)
   {
      if (btn & MouseButton_Left) {
         let bmp = this.afterBitmap || this.beforeBitmap;
         if (!bmp) return;
         let r = Math.min(this.width / bmp.width, this.height / bmp.height);
         let dw = Math.round(bmp.width * r);
         let dx = ((this.width - dw) >> 1);
         this.splitPos = Math.min(1, Math.max(0, (x - dx) / dw));
         this.update();
      }
   };
   this.onMousePress = this.onMouseMove;
}
YuMiHDRPreviewPane.prototype = new Frame;

// ----------------------------------------------------------------------------
// Main dialog.
// ----------------------------------------------------------------------------
function YuMiHDRDialog(params)
{
   this.__base__ = Dialog;
   this.__base__();

   let self = this;
   this.params = params;
   this.engine = new YuMiHDREngine();
   this.previewSource = null;        // small Image cache of source view
   this.previewBefore = null;        // Bitmap of source
   this.previewTimer = null;
   this.dirty = false;

   // Geometry / theme
   this.windowTitle = "YuMiHDR " + params.version + "  -  HDR for Deep-Sky";
   this.scaledMinWidth  = 1080;
   this.scaledMinHeight = 720;

   // ----- Header ---------------------------------------------------------
   this.titleLabel = new Label(this);
   this.titleLabel.text =
      "<b>YuMiHDR</b> &nbsp; Advanced HDR for non-linear deep-sky images " +
      "(M42, M81, IFN). Drag the green split bar to compare before/after.";
   this.titleLabel.useRichText = true;
   this.titleLabel.wordWrapping = true;

   // ----- Target view selector ------------------------------------------
   this.viewLabel = new Label(this);
   this.viewLabel.text = "Target view: ";
   this.viewLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

   this.viewList = new ViewList(this);
   this.viewList.getAll();
   this.viewList.onViewSelected = function(view) {
      self.params.targetView = (view && !view.isNull) ? view : undefined;
      self.rebuildPreviewSource();
      self.schedulePreview(0);
   };
   if (params.targetView && !params.targetView.isNull)
      this.viewList.currentView = params.targetView;

   this.refreshButton = new ToolButton(this);
   this.refreshButton.text = "Refresh source";
   this.refreshButton.onClick = function() {
      self.rebuildPreviewSource();
      self.schedulePreview(0);
   };

   this.viewSizer = new HorizontalSizer;
   this.viewSizer.spacing = 6;
   this.viewSizer.add(this.viewLabel);
   this.viewSizer.add(this.viewList, 100);
   this.viewSizer.add(this.refreshButton);

   // ----- Preview pane ---------------------------------------------------
   this.previewPane = new YuMiHDRPreviewPane(this);

   // ----- Parameter helpers ---------------------------------------------
   function makeSlider(label, tip, min, max, prec, key)
   {
      let nc = new NumericControl(self);
      nc.label.text = label;
      nc.label.minWidth = 170;
      nc.setRange(min, max);
      nc.setPrecision(prec);
      nc.slider.setRange(0, 1000);
      nc.slider.scaledMinWidth = 220;
      nc.toolTip = tip;
      nc.setValue(self.params[key]);
      nc.onValueUpdated = function(v) {
         self.params[key] = v;
         self.schedulePreview(80);
      };
      nc._yumihdrKey = key;
      return nc;
   }

   function makeIntSlider(label, tip, min, max, key)
   {
      let nc = new NumericControl(self);
      nc.label.text = label;
      nc.label.minWidth = 170;
      nc.setRange(min, max);
      nc.setPrecision(0);
      nc.slider.setRange(min, max);
      nc.slider.scaledMinWidth = 220;
      nc.toolTip = tip;
      nc.setValue(self.params[key]);
      nc.onValueUpdated = function(v) {
         self.params[key] = (v | 0);
         self.schedulePreview(80);
      };
      nc._yumihdrKey = key;
      return nc;
   }

   // ----- Section: Multi-scale HDR --------------------------------------
   this.gbHDR = new GroupBox(this);
   this.gbHDR.title = "Multi-scale HDR core";
   this.gbHDR.sizer = new VerticalSizer;
   this.gbHDR.sizer.margin = 8;
   this.gbHDR.sizer.spacing = 4;

   this.cNumScales       = makeIntSlider("Scales", "Number of dyadic decomposition scales. Higher = stronger compression of large structures.", 4, 9, "numScales");
   this.cLowFreqCompress = makeSlider("Large-scale compression", "Compress the lowest-frequency residual toward the image median. The main HDR knob.", 0, 1, 3, "lowFreqCompress");
   this.cDetailBoost     = makeSlider("Mid-scale detail", "Detail gain on mid-frequency scales (nebula structure, dust lanes).", 0.5, 3, 3, "detailBoost");
   this.cFineDetail      = makeSlider("Fine detail", "Detail gain on the finest scales (texture, faint stars).", 0.5, 3, 3, "fineDetailBoost");
   this.cCoreCompress    = makeSlider("Core compression", "Extra compression applied to the brightest 10% (galaxy / nebula cores).", 0, 1, 3, "coreCompression");

   this.gbHDR.sizer.add(this.cNumScales);
   this.gbHDR.sizer.add(this.cLowFreqCompress);
   this.gbHDR.sizer.add(this.cDetailBoost);
   this.gbHDR.sizer.add(this.cFineDetail);
   this.gbHDR.sizer.add(this.cCoreCompress);

   // ----- Section: Tone curve -------------------------------------------
   this.gbTone = new GroupBox(this);
   this.gbTone.title = "Tone curve";
   this.gbTone.sizer = new VerticalSizer;
   this.gbTone.sizer.margin = 8;
   this.gbTone.sizer.spacing = 4;

   this.cMidtone        = makeSlider("Midtone balance",  "MTF midtone target. Lower = brighter midtones.", 0.05, 0.95, 3, "midtoneBalance");
   this.cShadowLift     = makeSlider("Shadow lift",      "Recover detail in the deepest shadows.", 0, 1, 3, "shadowLift");
   this.cShadowProtect  = makeSlider("Shadow protection","Noise floor below which the shadow lift is rolled off.", 0, 0.2, 4, "shadowProtection");
   this.cHighlight      = makeSlider("Highlight rolloff","Soft asinh-style compression near saturation.", 0, 1, 3, "highlightRecovery");
   this.cLocalContrast  = makeSlider("Local contrast",   "Adapt detail boost to local brightness.", 0, 1, 3, "localContrast");

   this.gbTone.sizer.add(this.cMidtone);
   this.gbTone.sizer.add(this.cShadowLift);
   this.gbTone.sizer.add(this.cShadowProtect);
   this.gbTone.sizer.add(this.cHighlight);
   this.gbTone.sizer.add(this.cLocalContrast);

   // ----- Section: Stars -------------------------------------------------
   this.gbStars = new GroupBox(this);
   this.gbStars.title = "Star protection";
   this.gbStars.sizer = new VerticalSizer;
   this.gbStars.sizer.margin = 8;
   this.gbStars.sizer.spacing = 4;

   this.cStarProtect   = makeSlider("Strength",  "How strongly the original star cores are preserved.", 0, 1, 3, "starProtection");
   this.cStarThreshold = makeSlider("Threshold", "Brightness above the median (in observed range) considered a star.", 0, 1, 3, "starThreshold");
   this.cStarGrow      = makeSlider("Mask grow", "Dilate the star mask in pixels to cover halos.", 0, 5, 2, "starGrow");

   this.gbStars.sizer.add(this.cStarProtect);
   this.gbStars.sizer.add(this.cStarThreshold);
   this.gbStars.sizer.add(this.cStarGrow);

   // ----- Section: IFN ---------------------------------------------------
   this.gbIFN = new GroupBox(this);
   this.gbIFN.title = "IFN / faint background";
   this.gbIFN.sizer = new VerticalSizer;
   this.gbIFN.sizer.margin = 8;
   this.gbIFN.sizer.spacing = 4;

   this.cIFNBoost     = makeSlider("Boost",     "asinh stretch strength applied only to the background mask. Reveals IFN.", 0, 1, 3, "ifnBoost");
   this.cIFNThreshold = makeSlider("Threshold", "Brightness below which a pixel is considered background.", 0, 1, 3, "ifnThreshold");
   this.cIFNSmooth    = makeSlider("Smoothing", "Soften the background mask edges (px).", 0, 10, 2, "ifnSmooth");

   this.gbIFN.sizer.add(this.cIFNBoost);
   this.gbIFN.sizer.add(this.cIFNThreshold);
   this.gbIFN.sizer.add(this.cIFNSmooth);

   // ----- Section: Color & mix ------------------------------------------
   this.gbMix = new GroupBox(this);
   this.gbMix.title = "Color & mix";
   this.gbMix.sizer = new VerticalSizer;
   this.gbMix.sizer.margin = 8;
   this.gbMix.sizer.spacing = 4;

   this.cSaturation = makeSlider("Saturation", "Color saturation post-HDR.", -1, 1, 3, "saturationBoost");
   this.cAmount     = makeSlider("Amount",     "Dry/wet blend with the original image.", 0, 1, 3, "amount");

   this.cbPreserveChroma = new CheckBox(this);
   this.cbPreserveChroma.text = "Preserve chrominance (ratio mode)";
   this.cbPreserveChroma.toolTip =
      "If checked, R:G:B ratios are preserved by scaling each channel with L'/L.\n" +
      "If unchecked, the difference (L'-L) is added equally, which is safer near saturation.";
   this.cbPreserveChroma.checked = params.preserveChroma;
   this.cbPreserveChroma.onCheck = function(b) {
      self.params.preserveChroma = b;
      self.schedulePreview(80);
   };

   this.gbMix.sizer.add(this.cSaturation);
   this.gbMix.sizer.add(this.cAmount);
   this.gbMix.sizer.add(this.cbPreserveChroma);

   // ----- Section: Preview ----------------------------------------------
   this.gbPreview = new GroupBox(this);
   this.gbPreview.title = "Preview";
   this.gbPreview.sizer = new HorizontalSizer;
   this.gbPreview.sizer.margin = 8;
   this.gbPreview.sizer.spacing = 6;

   this.cbAutoPreview = new CheckBox(this);
   this.cbAutoPreview.text = "Auto preview";
   this.cbAutoPreview.checked = params.autoPreview;
   this.cbAutoPreview.onCheck = function(b) {
      self.params.autoPreview = b;
      if (b) self.schedulePreview(0);
   };

   this.previewSizeLabel = new Label(this);
   this.previewSizeLabel.text = "Max size:";
   this.previewSizeLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

   this.previewSizeSpin = new SpinBox(this);
   this.previewSizeSpin.setRange(256, 1600);
   this.previewSizeSpin.setFixedWidth(80);
   this.previewSizeSpin.value = params.previewMaxSize;
   this.previewSizeSpin.onValueUpdated = function(v) {
      self.params.previewMaxSize = v;
      self.rebuildPreviewSource();
      self.schedulePreview(50);
   };

   this.previewQualityLabel = new Label(this);
   this.previewQualityLabel.text = "Quality:";
   this.previewQualityLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

   this.previewQualityCombo = new ComboBox(this);
   this.previewQualityCombo.addItem("Fast");
   this.previewQualityCombo.addItem("Balanced");
   this.previewQualityCombo.addItem("Accurate");
   this.previewQualityCombo.currentItem = params.previewQuality;
   this.previewQualityCombo.onItemSelected = function(i) {
      self.params.previewQuality = i;
      self.schedulePreview(50);
   };

   this.runPreviewButton = new PushButton(this);
   this.runPreviewButton.text = "Run preview now";
   this.runPreviewButton.onClick = function() { self.runPreview(); };

   this.gbPreview.sizer.add(this.cbAutoPreview);
   this.gbPreview.sizer.addSpacing(12);
   this.gbPreview.sizer.add(this.previewSizeLabel);
   this.gbPreview.sizer.add(this.previewSizeSpin);
   this.gbPreview.sizer.addSpacing(12);
   this.gbPreview.sizer.add(this.previewQualityLabel);
   this.gbPreview.sizer.add(this.previewQualityCombo);
   this.gbPreview.sizer.addStretch();
   this.gbPreview.sizer.add(this.runPreviewButton);

   // ----- Buttons row ----------------------------------------------------
   this.newInstanceButton = new ToolButton(this);
   this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
   this.newInstanceButton.setScaledFixedSize(24, 24);
   this.newInstanceButton.toolTip = "New instance — drag to a workspace to create a process icon.";
   this.newInstanceButton.onMousePress = function() {
      self.params.save();
      self.newInstance();
   };

   this.resetButton = new PushButton(this);
   this.resetButton.text = "Reset";
   this.resetButton.icon = this.scaledResource(":/process-interface/reset.png");
   this.resetButton.onClick = function() {
      self.params.reset();
      self.syncControls();
      self.schedulePreview(0);
   };

   this.applyButton = new PushButton(this);
   this.applyButton.text = "Apply";
   this.applyButton.icon = this.scaledResource(":/icons/play.png");
   this.applyButton.default = true;
   this.applyButton.onClick = function() { self.ok(); };

   this.cancelButton = new PushButton(this);
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource(":/icons/cancel.png");
   this.cancelButton.onClick = function() { self.cancel(); };

   this.helpButton = new ToolButton(this);
   this.helpButton.icon = this.scaledResource(":/process-interface/browse-documentation.png");
   this.helpButton.toolTip = "Open documentation";
   this.helpButton.onClick = function() {
      Dialog.openBrowser("https://yumiastro.github.io/YuMiHDR/");
   };

   this.buttonsSizer = new HorizontalSizer;
   this.buttonsSizer.spacing = 6;
   this.buttonsSizer.add(this.newInstanceButton);
   this.buttonsSizer.add(this.helpButton);
   this.buttonsSizer.addStretch();
   this.buttonsSizer.add(this.resetButton);
   this.buttonsSizer.add(this.applyButton);
   this.buttonsSizer.add(this.cancelButton);

   // ----- Layout ---------------------------------------------------------
   // Left column: preview pane + view selector
   // Right column: parameter sections
   let leftSizer = new VerticalSizer;
   leftSizer.spacing = 6;
   leftSizer.add(this.viewSizer);
   leftSizer.add(this.previewPane, 100);
   leftSizer.add(this.gbPreview);

   let rightSizer = new VerticalSizer;
   rightSizer.spacing = 6;
   rightSizer.add(this.gbHDR);
   rightSizer.add(this.gbTone);
   rightSizer.add(this.gbStars);
   rightSizer.add(this.gbIFN);
   rightSizer.add(this.gbMix);
   rightSizer.addStretch();

   let columns = new HorizontalSizer;
   columns.spacing = 8;
   columns.add(leftSizer, 60);
   columns.add(rightSizer, 40);

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 6;
   this.sizer.add(this.titleLabel);
   this.sizer.add(columns, 100);
   this.sizer.add(this.buttonsSizer);

   this.userResizable = true;
   this.adjustToContents();

   // ----- Public methods -------------------------------------------------
   this.syncControls = function()
   {
      let map = [
         [this.cNumScales,       "numScales"],
         [this.cLowFreqCompress, "lowFreqCompress"],
         [this.cDetailBoost,     "detailBoost"],
         [this.cFineDetail,      "fineDetailBoost"],
         [this.cCoreCompress,    "coreCompression"],
         [this.cMidtone,         "midtoneBalance"],
         [this.cShadowLift,      "shadowLift"],
         [this.cShadowProtect,   "shadowProtection"],
         [this.cHighlight,       "highlightRecovery"],
         [this.cLocalContrast,   "localContrast"],
         [this.cStarProtect,     "starProtection"],
         [this.cStarThreshold,   "starThreshold"],
         [this.cStarGrow,        "starGrow"],
         [this.cIFNBoost,        "ifnBoost"],
         [this.cIFNThreshold,    "ifnThreshold"],
         [this.cIFNSmooth,       "ifnSmooth"],
         [this.cSaturation,      "saturationBoost"],
         [this.cAmount,          "amount"]
      ];
      for (let i = 0; i < map.length; ++i)
         map[i][0].setValue(this.params[map[i][1]]);
      this.cbPreserveChroma.checked = this.params.preserveChroma;
      this.cbAutoPreview.checked    = this.params.autoPreview;
      this.previewSizeSpin.value    = this.params.previewMaxSize;
      this.previewQualityCombo.currentItem = this.params.previewQuality;
   };

   this.rebuildPreviewSource = function()
   {
      this.previewSource = null;
      this.previewBefore = null;
      let v = this.params.targetView;
      if (!v || v.isNull) {
         this.previewPane.setBefore(null);
         this.previewPane.setAfter(null);
         return;
      }
      this.previewSource = ymhdr_downsample(v.image, this.params.previewMaxSize);
      this.previewBefore = ymhdr_imageToBitmap(this.previewSource);
      this.previewPane.setBefore(this.previewBefore);
      this.previewPane.setAfter(this.previewBefore);
   };

   this.schedulePreview = function(delayMs)
   {
      if (!this.params.autoPreview) return;
      if (!this.previewSource) return;
      if (this.previewTimer == null) {
         this.previewTimer = new Timer;
         this.previewTimer.periodic = false;
         this.previewTimer.singleShot = true;
         this.previewTimer.onTimeout = function() { self.runPreview(); };
      }
      this.previewTimer.interval = Math.max(0, delayMs) / 1000;
      this.previewTimer.start();
   };

   this.runPreview = function()
   {
      if (!this.previewSource) return;
      this.previewPane.busy = true;
      this.previewPane.update();
      try {
         let result = this.engine.preview(this.previewSource, this.params);
         let bmp = ymhdr_imageToBitmap(result);
         this.previewPane.setAfter(bmp);
      } catch (e) {
         console.warningln("YuMiHDR preview error: " + e.message);
      } finally {
         this.previewPane.busy = false;
         this.previewPane.update();
      }
   };

   // ----- Initial preview ------------------------------------------------
   this.rebuildPreviewSource();
   this.schedulePreview(0);
}

YuMiHDRDialog.prototype = new Dialog;

#endif // __YUMIHDR_DIALOG_JS__
