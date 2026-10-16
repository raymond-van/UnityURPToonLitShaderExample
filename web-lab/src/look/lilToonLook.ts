import type { ToonLook } from "./vroidPalette";

/*
 * lilToon property recipes for the experimental lilToon variant. Kept apart
 * from `lilToon.ts` so the debug panel can apply them live without importing
 * three-liltoon outside its lazy chunk. Each preset sets every property the
 * other one changes, so switching presets fully replaces the previous look.
 */

export const LIL_TOON_PRESETS = ["current", "nilotoon"] as const;

export type LilToonPreset = (typeof LIL_TOON_PRESETS)[number];

export const LIL_TOON_PRESET_LABELS: Record<LilToonPreset, string> = {
  current: "Current",
  nilotoon: "NiloToon-style",
};

/** Multipliers from the debug panel's look sliders. */
export type LilToonLookScale = {
  shadow: number;
  rim: number;
  outline: number;
};

type Rgb = [number, number, number];
type Properties = Record<string, number | number[]>;

/** Move a shadow colour away from (or towards) white; 0 gives white. */
export function deepenShade(rgb: Rgb, strength: number): Rgb {
  // Written so the tuned colour stays exact at the default strength of 1.
  return rgb.map((c) =>
    Math.min(1, Math.max(0, c + (1 - c) * (1 - strength))),
  ) as Rgb;
}

export function scaleRgb(rgb: readonly number[], factor: number): Rgb {
  return rgb.map((value) => value * factor) as Rgb;
}

/**
 * Lighting response for every converted material, VRoid palette or not.
 * "current" restores lilToon's defaults.
 */
export function lilToonBaseProperties(preset: LilToonPreset): Properties {
  return preset === "nilotoon"
    ? // Never fully dark, flatter and brighter, light colour less tinted.
      { _LightMinLimit: 0.2, _AsUnlit: 0.15, _MonochromeLighting: 0.3 }
    : { _LightMinLimit: 0.05, _AsUnlit: 0, _MonochromeLighting: 0 };
}

/** Pale, low-saturation shadow tones for the NiloToon-style preset. */
const NILOTOON_SHADE: Record<ToonLook["kind"], Rgb> = {
  face: [0.95, 0.75, 0.72],
  skin: [0.95, 0.75, 0.72],
  cloth: [0.7, 0.68, 0.78],
  hair: [0.74, 0.64, 0.7],
};

/** Shadow, rim, backlight and outline properties for a VRoid look. */
export function lilToonLookProperties(
  look: ToonLook,
  preset: LilToonPreset,
  scale: LilToonLookScale,
): Properties {
  const isFace = look.kind === "face";
  const isSkin = isFace || look.kind === "skin";
  if (preset === "nilotoon") {
    const shade = NILOTOON_SHADE[look.kind];
    const [r, g, b] = shade;
    return {
      _ShadowColor: [...deepenShade(shade, scale.shadow), 1],
      _ShadowStrength: isFace ? 0.3 : 0.65,
      _ShadowBorder: isFace ? 0.35 : 0.5,
      _ShadowBlur: 0.15,
      _ShadowBorderRange: isSkin ? 0.08 : 0,
      _Shadow2ndColor: [
        ...deepenShade([r * 0.85, g * 0.8, b * 0.9], scale.shadow),
        0.4,
      ],
      _Shadow2ndBorder: isFace ? 0.05 : 0.15,
      _Shadow2ndBlur: 0.1,
      // A thin, crisp rim on the lit side that picks up some surface colour.
      _RimColor: [...scaleRgb([1, 0.97, 0.93], 0.6 * scale.rim), 1],
      _RimBorder: 0.65,
      _RimBlur: 0.1,
      _RimFresnelPower: 4,
      _RimEnableLighting: 1,
      _RimShadowMask: 1,
      _RimDirStrength: 0.5,
      _RimMainStrength: 0.3,
      // Light glowing through hair and skin edges.
      _UseBacklight: look.kind === "cloth" ? 0 : 1,
      _BacklightColor: [1, 0.95, 0.9, 0.4],
      _BacklightBorder: 0.35,
      _BacklightBlur: 0.05,
      _BacklightDirectivity: 5,
      // Thin, even outlines in a darkened surface colour (`_OutlineTex`).
      _OutlineWidth: (isFace ? 0.035 : 0.055) * scale.outline,
      _OutlineFixWidth: 1,
      _OutlineColor: [1, 1, 1, 1],
      _OutlineTexHSVG: [0, 1.3, 0.4, 1],
      _OutlineEnableLighting: 1,
    };
  }
  const [r, g, b] = look.shade;
  return {
    _ShadowColor: [...deepenShade(look.shade, scale.shadow), 1],
    _ShadowStrength: 1,
    _ShadowBorder: isFace ? 0.2 : 0.55,
    _ShadowBlur: 0.08,
    // lilToon's warm terminator band suits skin but tints cloth pink.
    _ShadowBorderRange: isSkin ? 0.08 : 0,
    _Shadow2ndColor: [
      ...deepenShade([r * 0.8, g * 0.75, b * 0.85], scale.shadow),
      0.6,
    ],
    _Shadow2ndBorder: isFace ? 0.05 : 0.3,
    _Shadow2ndBlur: 0.15,
    _RimColor: [...scaleRgb(look.rim, 2.5 * scale.rim), 1],
    _RimBorder: 0.5,
    _RimBlur: 0.5,
    _RimFresnelPower: look.rimPower,
    _RimEnableLighting: 1,
    _RimShadowMask: 0.5,
    _RimDirStrength: 0,
    _RimMainStrength: 0,
    _UseBacklight: 0,
    _OutlineWidth: (isFace ? 0.05 : 0.1) * scale.outline,
    _OutlineFixWidth: 0.5,
    _OutlineColor: [...look.outlineColor, 1],
    _OutlineTexHSVG: [0, 1, 1, 1],
    _OutlineEnableLighting: 1,
  };
}

/** Whether a preset tints outlines from the surface texture. */
export function lilToonOutlineUsesSurface(preset: LilToonPreset): boolean {
  return preset === "nilotoon";
}
