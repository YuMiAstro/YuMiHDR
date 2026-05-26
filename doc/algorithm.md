# YuMiHDR algorithm

YuMiHDR is built around a Laplacian-style multiscale decomposition of the
working luminance channel, recombined with an adaptive per-pixel gain that
depends on both the scale and the local brightness. The result is then
passed through a soft global tone curve, optionally lifted in the
background regions, and recombined with the original chrominance.

The complete pipeline applied to an input image `I` is:

```
1.  Lum extraction:        L0 = 0.2126·R + 0.7152·G + 0.0722·B
2.  Robust statistics:     m  = median(L0),  σ = 1.4826·MAD(L0)
3.  Multi-scale HDR:       L1 = MultiscaleHDR(L0, params)
4.  Global tone curve:     L2 = ToneCurve(L1, params, m, σ)
5.  IFN / shadow lift:     L3 = BackgroundLift(L2, L0, params, m, σ)
6.  Star protection:       L4 = blend(L3, L0, starMask, p.starProtection)
7.  Dry/wet blend:         L5 = lerp(L0, L4, p.amount)
8.  Recombine:             I'  = recombine(I, L0, L5, p.preserveChroma)
9.  Saturation polish:     I'' = saturation(I', p.saturationBoost)
```

## 1. Multi-scale decomposition

A Gaussian pyramid `B[0..N]` is built directly on `L0` with dyadic sigmas
(σ = 1, 2, 4, …). Detail layers are simply the differences:

```
B[0]  = L0
B[i+1] = blur(B[i], σ = 2^i)         for i = 0..N-1
D[i]  = B[i] - B[i+1]
```

The lowest-frequency residual `R = B[N]` carries the global mean
luminance gradient (galaxy core glow, nebular cocoon). It is compressed
toward the global median by a factor `c = lowFreqCompress`:

    R' = (R - m) · (1 - c) + m

Detail layers are then recombined with an adaptive gain:

    L1 = R' + Σ_i  g_i(x) · D[i]

The gain `g_i(x)` is the product of:

- A **per-scale base gain**:
  - finest 1&ndash;2 scales follow `fineDetailBoost`
  - mid scales follow `detailBoost`
  - largest scale gets a softer factor proportional to
    `(1 - 0.5·lowFreqCompress)`
- A **bright-region attenuator**:
  `attenBright = 1 - coreCompression · smoothstep(loTail, hiTail, B[s_loc])`,
  where `s_loc` is a smooth local-brightness pilot (typically `B[3]`).
- A **shadow protector**:
  `shadowKill = smoothstep(m - shadowProtection - 2σ, m - shadowProtection + 2σ, B[s_loc])`,
  which kills detail boost below the noise floor.
- A **local-contrast modulator** (mid scales only):
  `localMod = clamp(1 + localContrast · 0.5 · (B[s_loc] - m) / σ, 0.25, 2.5)`.

This combination is what gives YuMiHDR its characteristic look on
extreme-DR targets: bright cores cannot accumulate more detail gain (so
they don't posterize or invert), and dark sky cannot accumulate noise
gain (so it stays smooth).

## 2. Global tone curve

The compressed luminance is shaped by three sequential operators applied
per-pixel to `v = L1(x)`:

1. **Shadow lift**, smooth ramp from 0 to the median:
   `v ← v + shadowLift · 0.6 · (1 - smoothstep(0, m, v)) · (m - v)`.
2. **MTF midtone shaping** with target `midtoneBalance`:
   `v ← mtf(midtoneBalance, v)`.
3. **Highlight rolloff** above an adaptive knee
   `k = clamp(m + 6σ, 0.35, 0.95)`, with strength `S = 0.5 + 4.5·highlightRecovery`:

       over = v - k
       head = 1 - k
       v ← k + head · log(1 + S·over/head) / log(1 + S)

The knee is automatically placed a few MAD above the image median, so it
adapts to images at different stretch levels without manual tuning.

## 3. IFN / faint background lift

A soft background mask is built from the *original* luminance `L0`:

```
cutoff = m + ifnThreshold · (highTail - m)
mask(x) = 1 - smoothstep(cutoff - σ, cutoff + σ, L0(x))
```

then optionally blurred by `ifnSmooth` pixels. Inside the mask, an asinh
stretch (anchored above `lowTail`) is mixed in proportionally to
`ifnBoost`:

```
n         = (L1(x) - lowTail) / (1 - lowTail)
stretched = log(1 + a·n) / log(1 + a)        with a = 20..200
L1(x)    ← L1(x) · (1 - m·s) + (lowTail + stretched·(1-lowTail)) · (m·s)
```

This lift only fires inside `mask`, so M42's bright shock front or M81's
disc are never affected.

## 4. Star protection

Bright isolated peaks are detected from `L0` by a smoothstep around
`starCut = m + starThreshold · (max - m)`. The mask is dilated by a
Gaussian of σ = `starGrow` (px), and the original luminance is blended
back into the result there with strength `starProtection`:

```
L4(x) = L3(x) · (1 - mask(x)·starProtection) + L0(x) · mask(x)·starProtection
```

This is the single most important reason stellar cores stay tight even
under aggressive global compression.

## 5. Recombination

Two modes:

- **preserveChroma = true** (default, the photographic look):
  every channel is scaled by `L5/L0`, with a hard cap at 16 to prevent
  runaway amplification in deep shadows.
- **preserveChroma = false** (additive, safer near saturation):
  `c' = c + (L5 - L0)`, the same delta is added to all three channels.

A final saturation operator amplifies `c - L` in the recombined image
when `saturationBoost ≠ 0`.

## Notes on noise

The pipeline is deliberately conservative about amplifying noise:

- The shadow protector zeroes detail-layer gain below `m - shadowProtection`.
- The IFN lift acts only inside the background mask, but applies an asinh
  function whose slope at zero is bounded by `a / log(1+a)`. For the
  default `ifnBoost = 0.55`, that's roughly 25, which is reasonable for
  ~1 e- noise floors on modern CMOS data; if noise is visible, raise
  `ifnSmooth` first, then back off `ifnBoost`.
- The bright-region attenuator avoids star-core posterization that
  plain `HDRMultiscaleTransform` is prone to.

## References

- B. K. Horn, *Hill shading and the reflectance map* (Laplacian pyramids).
- E. Reinhard et al., *Photographic Tone Reproduction for Digital Images*.
- J. Conrady & R. Kennedy, *asinh stretch* in observational astronomy.
- PJSR documentation:
  [pixinsight.com/developer/pjsr/](https://pixinsight.com/developer/pjsr/).
