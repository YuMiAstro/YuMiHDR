// ============================================================================
// YuMiHDR-Parameters.js
// ----------------------------------------------------------------------------
// Parameter container, persistence and validation for YuMiHDR.
// ============================================================================

#ifndef __YUMIHDR_PARAMETERS_JS__
#define __YUMIHDR_PARAMETERS_JS__

#define YMHDR_PARAM_PREFIX "YuMiHDR/"

function YuMiHDRParameters()
{
   // ----- Multi-scale HDR core -----
   this.numScales         = 7;        // 4..9, number of dyadic scales
   this.lowFreqCompress   = 0.65;     // 0..1, residual (large-scale) compression
   this.detailBoost       = 1.35;     // 0.5..3, mid-scale detail gain
   this.fineDetailBoost   = 1.10;     // 0.5..3, finest 1-2 scales (texture)
   this.coreCompression   = 0.55;     // 0..1, extra compression on brightest 10%

   // ----- Tone curve -----
   this.midtoneBalance    = 0.42;     // 0.05..0.95, midtone target (MTF)
   this.shadowLift        = 0.30;     // 0..1, shadow recovery amount
   this.shadowProtection  = 0.020;    // 0..0.2, noise floor (MAD-relative)
   this.highlightRecovery = 0.45;     // 0..1, soft highlight rolloff
   this.localContrast     = 0.50;     // 0..1, local-contrast adaptation

   // ----- Star protection -----
   this.starProtection    = 0.75;     // 0..1, mix back original luminance on stars
   this.starThreshold     = 0.82;     // 0..1, brightness above which is "star"
   this.starGrow          = 1.5;      // 0..5, dilation radius in pixels

   // ----- IFN / faint background -----
   this.ifnBoost          = 0.0;      // 0..1, asinh stretch strength on shadows
   this.ifnThreshold      = 0.12;     // 0..1, region considered "background"
   this.ifnSmooth         = 2.5;      // 0..10, mask softening sigma

   // ----- Color -----
   this.saturationBoost   = 0.12;     // -1..1
   this.preserveChroma    = true;     // keep RGB ratios when remapping L

   // ----- Final mix -----
   this.amount            = 1.00;     // 0..1 dry/wet blend with the input

   // ----- I/O -----
   this.targetView        = undefined;
   this.previewMaxSize    = 640;      // px, preview down-sample target
   this.previewQuality    = 1;        // 0 = fast, 1 = balanced, 2 = accurate
   this.autoPreview       = true;

   // ----- Internal -----
   this.version           = "1.0.0";
}

YuMiHDRParameters.prototype.clone = function()
{
   let p = new YuMiHDRParameters();
   for (let k in this)
      if (this.hasOwnProperty(k))
         p[k] = this[k];
   return p;
};

YuMiHDRParameters.prototype.reset = function()
{
   let d = new YuMiHDRParameters();
   for (let k in d)
      if (d.hasOwnProperty(k) && k !== "targetView")
         this[k] = d[k];
};

YuMiHDRParameters.prototype.save = function()
{
   let keys = [
      "numScales","lowFreqCompress","detailBoost","fineDetailBoost","coreCompression",
      "midtoneBalance","shadowLift","shadowProtection","highlightRecovery","localContrast",
      "starProtection","starThreshold","starGrow",
      "ifnBoost","ifnThreshold","ifnSmooth",
      "saturationBoost","preserveChroma","amount",
      "previewMaxSize","previewQuality","autoPreview"
   ];
   for (let i = 0; i < keys.length; ++i)
   {
      let k = keys[i];
      let v = this[k];
      let t = (typeof v === "boolean") ? DataType_Boolean
            : (Math.floor(v) === v && (k === "numScales" || k === "previewMaxSize" || k === "previewQuality"))
              ? DataType_Int32
              : DataType_Real32;
      Parameters.set(k, v);
   }
};

YuMiHDRParameters.prototype.load = function()
{
   let p = new YuMiHDRParameters();
   for (let k in p)
   {
      if (!p.hasOwnProperty(k) || k === "targetView") continue;
      if (!Parameters.has(k)) continue;
      let v = p[k];
      try {
         if (typeof v === "boolean")      this[k] = Parameters.getBoolean(k);
         else if (Number.isInteger(v))    this[k] = Parameters.getInteger(k);
         else                             this[k] = Parameters.getReal(k);
      } catch (e) {}
   }
   if (Parameters.has("targetView")) {
      let id = Parameters.getString("targetView");
      let w = ImageWindow.windowById(id);
      if (!w.isNull) this.targetView = w.mainView;
   }
};

#endif // __YUMIHDR_PARAMETERS_JS__
