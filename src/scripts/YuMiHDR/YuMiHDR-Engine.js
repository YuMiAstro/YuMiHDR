// ============================================================================
// YuMiHDR-Engine.js
// ----------------------------------------------------------------------------
// Core HDR engine for non-linear deep-sky images.
//
// The pipeline is built around a Laplacian-style multiscale decomposition of
// the working luminance channel. Each detail layer is then re-combined with an
// adaptive gain that depends both on its scale and on the local brightness, so
// that bright cores (M42 trapezium, M81 nucleus) are compressed while the
// faint outer envelope and the IFN background gain visible detail.
//
//   L'(x) = sum_s D_s(x) * gain_s(L_s(x))  +  R(x) * compress
//
// gain_s is shaped by:
//   - a per-scale boost (detailBoost, fineDetailBoost)
//   - a brightness-dependent attenuator that softly suppresses noise in the
//     dark regions and rolls off near saturation
//
// The compressed luminance is then passed through a soft global curve
// (MTF + asinh-style highlight rolloff + IFN shadow lift) and recombined
// with the original chrominance preserving R:G:B ratios.
//
// Star regions are detected from the *original* luminance and the original
// values are mixed back in to avoid star-core flattening.
// ============================================================================

#ifndef __YUMIHDR_ENGINE_JS__
#define __YUMIHDR_ENGINE_JS__

#include <pjsr/SampleType.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/UndoFlag.jsh>

// ----------------------------------------------------------------------------
// Small numeric helpers
// ----------------------------------------------------------------------------

function ymhdr_clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function ymhdr_mtf(m, x)
{
   // PixInsight midtones transfer function
   if (x <= 0) return 0;
   if (x >= 1) return 1;
   if (m === 0.5) return x;
   return ((m - 1) * x) / (((2*m - 1) * x) - m);
}

function ymhdr_smoothstep(a, b, x)
{
   if (x <= a) return 0;
   if (x >= b) return 1;
   let t = (x - a) / (b - a);
   return t * t * (3 - 2*t);
}

// Gaussian kernel as a Matrix usable with Image.convolve / convolveBy.
function ymhdr_gaussianMatrix(sigma)
{
   sigma = Math.max(0.4, sigma);
   let r = Math.max(1, Math.ceil(3.0 * sigma));
   let n = 2*r + 1;
   let row = new Array(n);
   let s = 0;
   let twoSigma2 = 2 * sigma * sigma;
   for (let i = 0; i < n; ++i) {
      let x = i - r;
      row[i] = Math.exp(-(x*x) / twoSigma2);
      s += row[i];
   }
   let inv = 1 / s;
   for (let i = 0; i < n; ++i) row[i] *= inv;
   let m = new Matrix(n, n);
   for (let y = 0; y < n; ++y)
      for (let x = 0; x < n; ++x)
         m.at(y, x, row[x] * row[y]);
   return m;
}

// In-place separable Gaussian blur of a single-channel Image. Falls back to a
// 2-D kernel via convolveBy() which is the most portable PJSR primitive.
function ymhdr_blur(img, sigma)
{
   if (sigma < 0.4) return img;
   // For very large sigmas, iterate small blurs (faster than one big kernel).
   if (sigma > 12) {
      let steps = Math.ceil(sigma / 8);
      let s2 = Math.sqrt((sigma*sigma) / steps);
      let k = ymhdr_gaussianMatrix(s2);
      for (let i = 0; i < steps; ++i) img.convolveBy(k);
      return img;
   }
   img.convolveBy(ymhdr_gaussianMatrix(sigma));
   return img;
}

// ----------------------------------------------------------------------------
// Engine
// ----------------------------------------------------------------------------

function YuMiHDREngine()
{
   this.__base__ = Object;
   this.__base__();

   // -------------------------------------------------------------------------
   // Public: process a full ImageWindow's main view in-place.
   // -------------------------------------------------------------------------
   this.applyToView = function(view, params)
   {
      if (!view || view.isNull) throw new Error("No target view.");
      let img = view.image;

      view.beginProcess(UndoFlag_PixelData);
      try {
         let working = new Image(img);
         this._process(working, params, /*isPreview*/ false);
         img.assign(working);
      } finally {
         view.endProcess();
      }
   };

   // -------------------------------------------------------------------------
   // Public: render a preview-resolution result into the supplied Image.
   //   `src` is a small RGB/Gray Image (already down-sampled).
   //   Returns a new Image of the same geometry holding the HDR result.
   // -------------------------------------------------------------------------
   this.preview = function(src, params)
   {
      let working = new Image(src);
      this._process(working, params, /*isPreview*/ true);
      return working;
   };

   // -------------------------------------------------------------------------
   // Pipeline
   // -------------------------------------------------------------------------
   this._process = function(img, p, isPreview)
   {
      let W = img.width, H = img.height;
      let isColor = img.isColor;

      // 1. Extract luminance and (if color) chrominance ratios.
      let L0 = this._extractLuminance(img);
      let stats = this._luminanceStats(L0);

      // 2. Multi-scale decomposition + adaptive recombination.
      let L1 = this._multiscaleHDR(L0, p, stats, isPreview);

      // 3. Global tone curve (MTF + highlight rolloff + shadow lift).
      this._applyToneCurve(L1, p, stats);

      // 4. Faint-background / IFN lift, masked.
      if (p.ifnBoost > 1e-4)
         this._boostBackground(L1, L0, p, stats);

      // 5. Star protection: blend the original luminance back into bright
      //    isolated peaks to keep star cores tight.
      if (p.starProtection > 1e-4)
         this._protectStars(L1, L0, p, stats);

      // 6. Final dry/wet mix against the un-touched luminance.
      if (p.amount < 0.999)
         this._blendImages(L1, L0, p.amount);

      // 7. Re-apply enhanced luminance to RGB while preserving chroma.
      if (isColor)
         this._recombine(img, L0, L1, p);
      else
         img.assign(L1);

      // 8. Optional saturation polish.
      if (isColor && Math.abs(p.saturationBoost) > 1e-4)
         this._boostSaturation(img, p.saturationBoost);

      // Final safety clamp.
      img.truncate(0, 1);
   };

   // -------------------------------------------------------------------------
   // Luminance extraction (CIE Rec.709 weights).
   // -------------------------------------------------------------------------
   this._extractLuminance = function(img)
   {
      let W = img.width, H = img.height;
      let L = new Image(W, H, 1, ColorSpace_Gray, 32, SampleType_Real);
      if (img.isColor) {
         for (let y = 0; y < H; ++y)
            for (let x = 0; x < W; ++x) {
               let r = img.sample(x, y, 0);
               let g = img.sample(x, y, 1);
               let b = img.sample(x, y, 2);
               L.setSample(0.2126*r + 0.7152*g + 0.0722*b, x, y, 0);
            }
      } else {
         L.assign(img);
      }
      return L;
   };

   // -------------------------------------------------------------------------
   // Robust luminance statistics (median + MAD + a high-percentile estimate).
   // -------------------------------------------------------------------------
   this._luminanceStats = function(L)
   {
      let stats = {};
      stats.median = L.median();
      stats.mad    = L.MAD();           // PJSR returns raw MAD
      stats.sigma  = Math.max(1e-5, 1.4826 * stats.mad);
      stats.min    = L.minimum();
      stats.max    = L.maximum();
      stats.mean   = L.mean();
      // High-percentile estimate: median + 4*sigma, capped at observed max.
      stats.highTail = Math.min(stats.max, stats.median + 4 * stats.sigma);
      stats.lowTail  = Math.max(0, stats.median - 2 * stats.sigma);
      return stats;
   };

   // -------------------------------------------------------------------------
   // Multi-scale decomposition: Laplacian-style pyramid using dyadic
   // Gaussian blurs. Detail layers are reweighted with a brightness-aware
   // gain that compresses bright structure and amplifies faint structure.
   // -------------------------------------------------------------------------
   this._multiscaleHDR = function(L, p, stats, isPreview)
   {
      let nScales = Math.max(3, Math.min(9, p.numScales | 0));
      // For previews, drop the largest scales so the result stays interactive.
      if (isPreview && nScales > 6) nScales = 6;

      // Build cumulative blur levels: B[0]=L, B[i+1]=Blur(B[i], sigma=2^i).
      let B = new Array(nScales + 1);
      B[0] = new Image(L);
      let sigma = 1.0;
      for (let i = 0; i < nScales; ++i) {
         B[i+1] = new Image(B[i]);
         ymhdr_blur(B[i+1], sigma);
         sigma *= 2;
      }

      // Detail layers D[i] = B[i] - B[i+1]
      let D = new Array(nScales);
      for (let i = 0; i < nScales; ++i) {
         D[i] = new Image(B[i]);
         D[i].apply(B[i+1], ImageOp_Sub);     // D[i] = B[i] - B[i+1]
      }

      // Residual (low-frequency) is B[nScales]. Compress it toward median.
      let R = new Image(B[nScales]);
      let m = stats.median;
      let c = ymhdr_clamp(p.lowFreqCompress, 0, 1);
      // R' = (R - m) * (1 - c) + m
      this._affine(R, 1 - c, m * c);

      // Recombine: result = R + sum_i gain_i(brightness) * D[i]
      let result = new Image(R);
      let W = result.width, H = result.height;

      // Pre-compute per-scale base gains.
      let baseGain = new Array(nScales);
      for (let i = 0; i < nScales; ++i) {
         let t = (nScales > 1) ? i / (nScales - 1) : 0;        // 0..1
         // Finest two scales follow fineDetailBoost; mid scales follow
         // detailBoost; largest scales get a softer touch.
         let fine = (i <= 1) ? p.fineDetailBoost : 1.0;
         let mid  = (i > 0 && i < nScales - 1) ? p.detailBoost : 1.0;
         let large = (i === nScales - 1) ? (1 - 0.5*p.lowFreqCompress) : 1.0;
         baseGain[i] = fine * mid * large;
      }

      // Adaptive per-pixel gain modulator using B[nScales-1] as local mean.
      let localMean = B[Math.min(nScales - 1, 3)];   // smooth local brightness
      let hi = stats.highTail;
      let lo = Math.max(stats.median, stats.lowTail + 4 * stats.sigma);
      let coreC = ymhdr_clamp(p.coreCompression, 0, 1);
      let localC = ymhdr_clamp(p.localContrast, 0, 1);

      for (let y = 0; y < H; ++y) {
         for (let x = 0; x < W; ++x) {
            let lm = localMean.sample(x, y, 0);
            // Bright-region attenuation factor (1 in shadows, decreases near hi).
            let bright = ymhdr_smoothstep(lo, Math.max(hi, lo + 1e-4), lm);
            let attenBright = 1 - coreC * bright;

            // Shadow protection: kill detail boost where mean < noise floor.
            let darkFloor = stats.median - p.shadowProtection;
            let shadowKill = ymhdr_smoothstep(
               Math.max(0, darkFloor - 2*stats.sigma),
               Math.max(1e-4, darkFloor + 2*stats.sigma),
               lm);

            // Local-contrast modulation: more boost where local variance is
            // high; here approximated by 1 + localC * (lm - median).
            let localMod = 1 + localC * 0.5 * (lm - stats.median) / Math.max(1e-4, stats.sigma);
            localMod = ymhdr_clamp(localMod, 0.25, 2.5);

            let sum = result.sample(x, y, 0);
            for (let i = 0; i < nScales; ++i) {
               let g = baseGain[i] * attenBright * shadowKill;
               // Slightly stronger localMod on mid scales.
               if (i > 0 && i < nScales - 1) g *= localMod;
               sum += g * D[i].sample(x, y, 0);
            }
            result.setSample(sum, x, y, 0);
         }
      }

      return result;
   };

   // -------------------------------------------------------------------------
   // Global tone curve. Combines:
   //   - MTF for midtone placement (acts as gamma toward midtoneBalance)
   //   - asinh-style highlight rolloff
   //   - shadow lift toward median
   // -------------------------------------------------------------------------
   this._applyToneCurve = function(L, p, stats)
   {
      let W = L.width, H = L.height;
      let m  = ymhdr_clamp(p.midtoneBalance, 0.02, 0.98);
      let hr = ymhdr_clamp(p.highlightRecovery, 0, 1);
      let sl = ymhdr_clamp(p.shadowLift, 0, 1);
      let med = stats.median;
      let sigma = stats.sigma;

      // Highlight knee: above this we apply asinh compression.
      let knee = ymhdr_clamp(med + 6*sigma, 0.35, 0.95);
      let kStrength = 0.5 + 4.5 * hr;       // 0.5..5

      // Shadow toe: below this we lift toward median proportionally.
      let toe = Math.max(0, med - 2*sigma);
      let lift = sl * 0.6;                  // max 0.6 lift

      for (let y = 0; y < H; ++y) {
         for (let x = 0; x < W; ++x) {
            let v = L.sample(x, y, 0);

            // Shadow lift (smooth ramp from 0 to toe).
            if (lift > 0 && v < med) {
               let t = 1 - ymhdr_smoothstep(0, Math.max(med, 1e-4), v);
               v = v + lift * t * (med - v);
            }

            // MTF midtone shaping.
            v = ymhdr_mtf(m, ymhdr_clamp(v, 0, 1));

            // Highlight rolloff: smooth asinh-style compression above knee.
            if (hr > 0 && v > knee) {
               let over = v - knee;
               let head = 1 - knee;
               // map over/head through asinh, scaled by kStrength.
               let r = Math.log(1 + kStrength * over / Math.max(head, 1e-4))
                     / Math.log(1 + kStrength);
               v = knee + r * head;
            }

            L.setSample(ymhdr_clamp(v, 0, 1), x, y, 0);
         }
      }
   };

   // -------------------------------------------------------------------------
   // IFN / faint background lift. Builds a soft mask of "background" pixels
   // (those below ifnThreshold relative to median) and applies an asinh
   // stretch only there.
   // -------------------------------------------------------------------------
   this._boostBackground = function(L, L0, p, stats)
   {
      let W = L.width, H = L.height;
      let strength = ymhdr_clamp(p.ifnBoost, 0, 1);
      let thr = ymhdr_clamp(p.ifnThreshold, 0, 1);
      let smooth = Math.max(0, p.ifnSmooth);

      // Mask: 1 inside background, 0 in bright objects.
      let mask = new Image(L0);
      let cutoff = stats.median + thr * (stats.highTail - stats.median);
      let edge = Math.max(stats.sigma, 1e-4);

      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let v = L0.sample(x, y, 0);
            // 1 when v << cutoff, 0 when v >> cutoff.
            let mval = 1 - ymhdr_smoothstep(cutoff - edge, cutoff + edge, v);
            mask.setSample(mval, x, y, 0);
         }
      if (smooth > 0.1) ymhdr_blur(mask, smooth);

      // asinh stretch parameters.
      let a = 20 + 180 * strength;        // 20..200
      let denom = Math.log(1 + a) || 1;

      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let m = mask.sample(x, y, 0);
            if (m < 1e-3) continue;
            let v = L.sample(x, y, 0);
            // Scale around lowTail so that the stretch is anchored above 0.
            let base = Math.max(0, stats.lowTail);
            let n = (v - base) / Math.max(1e-4, 1 - base);
            n = ymhdr_clamp(n, 0, 1);
            let stretched = Math.log(1 + a * n) / denom;
            let lifted = base + stretched * (1 - base);
            L.setSample(v * (1 - m * strength) + lifted * (m * strength), x, y, 0);
         }
   };

   // -------------------------------------------------------------------------
   // Star protection: build a star mask from the original luminance, dilate
   // it, then blend the original L0 back into L at those pixels.
   // -------------------------------------------------------------------------
   this._protectStars = function(L, L0, p, stats)
   {
      let W = L.width, H = L.height;
      let strength = ymhdr_clamp(p.starProtection, 0, 1);
      let thr = ymhdr_clamp(p.starThreshold, 0, 1);
      let grow = Math.max(0, p.starGrow);

      // Map threshold from [0..1] onto the observed luminance range so the
      // default value works for very dim and very bright frames alike.
      let starCut = stats.median + thr * (stats.max - stats.median);

      let mask = new Image(W, H, 1, ColorSpace_Gray, 32, SampleType_Real);
      let edge = Math.max(stats.sigma * 2, 1e-4);
      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let v = L0.sample(x, y, 0);
            mask.setSample(ymhdr_smoothstep(starCut - edge, starCut + edge, v), x, y, 0);
         }
      if (grow > 0.1) ymhdr_blur(mask, grow);

      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let m = mask.sample(x, y, 0) * strength;
            if (m < 1e-3) continue;
            let a = L.sample(x, y, 0);
            let b = L0.sample(x, y, 0);
            L.setSample(a * (1 - m) + b * m, x, y, 0);
         }
   };

   // -------------------------------------------------------------------------
   // Re-apply L' to the RGB image. Two modes:
   //   * preserveChroma:  c' = c * (L' / L)         keeps R:G:B ratio
   //   * additive:        c' = c + (L' - L)         neutral hue shift, safer
   //                                               near saturation
   // -------------------------------------------------------------------------
   this._recombine = function(img, L0, L1, p)
   {
      let W = img.width, H = img.height;
      let preserveChroma = !!p.preserveChroma;
      let eps = 1e-5;
      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let l0 = L0.sample(x, y, 0);
            let l1 = L1.sample(x, y, 0);
            if (preserveChroma) {
               let k = (l0 > eps) ? (l1 / l0) : 1.0;
               // Cap the multiplier to avoid runaway in deep shadows.
               if (k > 16) k = 16;
               for (let c = 0; c < 3; ++c) {
                  let v = img.sample(x, y, c) * k;
                  img.setSample(ymhdr_clamp(v, 0, 1), x, y, c);
               }
            } else {
               let d = l1 - l0;
               for (let c = 0; c < 3; ++c) {
                  let v = img.sample(x, y, c) + d;
                  img.setSample(ymhdr_clamp(v, 0, 1), x, y, c);
               }
            }
         }
   };

   // -------------------------------------------------------------------------
   // Saturation tweak in HSV-ish space: amplifies (c - L) around current L.
   // -------------------------------------------------------------------------
   this._boostSaturation = function(img, amount)
   {
      let W = img.width, H = img.height;
      let s = 1 + amount;        // amount in [-1..1] -> scale in [0..2]
      for (let y = 0; y < H; ++y)
         for (let x = 0; x < W; ++x) {
            let r = img.sample(x, y, 0);
            let g = img.sample(x, y, 1);
            let b = img.sample(x, y, 2);
            let L = 0.2126*r + 0.7152*g + 0.0722*b;
            img.setSample(ymhdr_clamp(L + (r - L) * s, 0, 1), x, y, 0);
            img.setSample(ymhdr_clamp(L + (g - L) * s, 0, 1), x, y, 1);
            img.setSample(ymhdr_clamp(L + (b - L) * s, 0, 1), x, y, 2);
         }
   };

   // -------------------------------------------------------------------------
   // Helpers
   // -------------------------------------------------------------------------
   this._affine = function(img, a, b)
   {
      // img := a*img + b, in-place
      let W = img.width, H = img.height, C = img.numberOfChannels;
      for (let c = 0; c < C; ++c)
         for (let y = 0; y < H; ++y)
            for (let x = 0; x < W; ++x)
               img.setSample(a * img.sample(x, y, c) + b, x, y, c);
   };

   this._blendImages = function(dst, src, amount)
   {
      // dst := amount*dst + (1-amount)*src
      let W = dst.width, H = dst.height, C = dst.numberOfChannels;
      let a = amount, b = 1 - amount;
      for (let c = 0; c < C; ++c)
         for (let y = 0; y < H; ++y)
            for (let x = 0; x < W; ++x)
               dst.setSample(a*dst.sample(x, y, c) + b*src.sample(x, y, c), x, y, c);
   };
}

YuMiHDREngine.prototype = new Object;

#endif // __YUMIHDR_ENGINE_JS__
