# YuMiHDR parameter reference

All parameters are clamped to safe ranges on the fly; the table lists the
practical operating range exposed in the UI.

## Multi-scale HDR core

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Scales** | 4..9 | 7 | Number of dyadic decomposition scales. More scales compress larger structures (entire galaxy halos, IFN clouds). |
| **Large-scale compression** | 0..1 | 0.65 | Compresses the lowest-frequency residual toward the median. The single most important HDR knob. |
| **Mid-scale detail** | 0.5..3 | 1.35 | Detail gain applied to the middle scales (nebula structure, dust lanes, galaxy spiral arms). |
| **Fine detail** | 0.5..3 | 1.10 | Detail gain on the two finest scales (texture, faint stars). Keep modest to avoid amplifying noise. |
| **Core compression** | 0..1 | 0.55 | Extra compression on the brightest ~10% of the frame. Crucial for M42 trapezium / galaxy nucleus. |

## Tone curve

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Midtone balance** | 0.05..0.95 | 0.42 | MTF target for the midtones. Lower = brighter midtones. Acts as a soft gamma anchor. |
| **Shadow lift** | 0..1 | 0.30 | Amount of detail recovered from the deepest shadows toward the median. |
| **Shadow protection** | 0..0.2 | 0.020 | Noise floor (MAD-relative) below which the shadow lift is smoothly rolled off. |
| **Highlight rolloff** | 0..1 | 0.45 | Asinh-style compression near saturation. Prevents posterization on bright stars and cores. |
| **Local contrast** | 0..1 | 0.50 | Modulates the mid-scale detail boost by local brightness. Higher = more "punchy". |

## Star protection

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Strength** | 0..1 | 0.75 | How strongly original star pixels are blended back in. Set higher for star-rich fields. |
| **Threshold** | 0..1 | 0.82 | Brightness above the median (in observed range) considered a star. Lower = mask more stars. |
| **Mask grow** | 0..5 | 1.5 | Dilation radius in pixels. Increase to cover stellar halos / diffraction spikes. |

## IFN / faint background

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Boost** | 0..1 | 0.00 | Asinh stretch strength inside the background mask. The main IFN knob. |
| **Threshold** | 0..1 | 0.12 | Brightness threshold: pixels below this (relative to bright tail) are "background". |
| **Smoothing** | 0..10 | 2.5 | Softens the mask edges in pixels. Higher avoids hard transitions around stars/nebula edges. |

## Color & mix

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Saturation** | -1..1 | 0.12 | Post-HDR saturation polish. Use small positive values; negative desaturates. |
| **Amount** | 0..1 | 1.00 | Dry/wet blend with the original image. 0 = unprocessed, 1 = full effect. |
| **Preserve chrominance** | checkbox | on | If on, channels are scaled by L'/L (preserves color). If off, the difference L'-L is added per channel (safer near saturation, more neutral hue). |

## Preview

| Parameter | Range | Default | Effect |
|---|---|---|---|
| **Auto preview** | checkbox | on | If on, the preview re-renders ~80 ms after the last slider change. |
| **Max size** | 256..1600 | 640 | Maximum edge size of the preview render. Smaller = faster. |
| **Quality** | Fast/Balanced/Accurate | Balanced | Trades accuracy for responsiveness; "Accurate" matches the full-resolution output closely. |
