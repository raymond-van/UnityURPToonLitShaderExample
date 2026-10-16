import { deepenShade, scaleRgb, LIL_TOON_PRESETS, type LilToonPreset } from "./lilToonLook";
import type { ToonLook } from "./vroidPalette";

// The look settings of Animama's dev "Avatar shader" debug panel
// (src/frontend/web/src/lib/avatar/toon-shader/avatarShaderLook.ts, PR #587),
// without its store: each lab pane keeps its own copy.

export const AVATAR_TONE_MAPPINGS = ["aces", "neutral"] as const;
export type AvatarToneMapping = (typeof AVATAR_TONE_MAPPINGS)[number];

export type AvatarShaderLook = {
  exposure: number;
  ambientLight: number;
  keyLight: number;
  shadow: number;
  rim: number;
  outline: number;
  lilToonPreset: LilToonPreset;
  toneMapping: AvatarToneMapping;
  softGrade: boolean;
  edgeGlow: boolean;
};

export type LookNumberKey = {
  [K in keyof AvatarShaderLook]: AvatarShaderLook[K] extends number ? K : never;
}[keyof AvatarShaderLook];

export const LOOK_CONTROLS: readonly { key: LookNumberKey; label: string; min: number; max: number; step: number }[] = [
  { key: "exposure", label: "Exposure", min: 0.4, max: 1.6, step: 0.05 },
  { key: "ambientLight", label: "Ambient light", min: 0, max: 2, step: 0.05 },
  { key: "keyLight", label: "Key light", min: 0, max: 2, step: 0.05 },
  { key: "shadow", label: "Shadow", min: 0, max: 2, step: 0.05 },
  { key: "rim", label: "Rim light", min: 0, max: 2, step: 0.05 },
  { key: "outline", label: "Outline width", min: 0, max: 2, step: 0.05 },
];

export const DEFAULT_LOOK: AvatarShaderLook = {
  exposure: 1,
  ambientLight: 1,
  keyLight: 1,
  shadow: 1,
  rim: 1,
  outline: 1,
  lilToonPreset: "current",
  toneMapping: "aces",
  softGrade: false,
  edgeGlow: false,
};

/** What choosing a preset sets: its lilToon recipe plus the lighting and renderer settings. */
export const LOOK_PRESETS: Record<LilToonPreset, Partial<AvatarShaderLook>> = {
  current: {
    lilToonPreset: "current",
    exposure: 1,
    ambientLight: 1,
    keyLight: 1,
    toneMapping: "aces",
    softGrade: false,
    edgeGlow: false,
  },
  nilotoon: {
    lilToonPreset: "nilotoon",
    exposure: 1.1,
    ambientLight: 1.4,
    keyLight: 0.8,
    toneMapping: "neutral",
    softGrade: true,
    edgeGlow: true,
  },
};

/** Look values from untrusted input (the URL), each clamped to its control's range. */
export function parseLook(value: unknown): AvatarShaderLook {
  const look = { ...DEFAULT_LOOK };
  if (!value || typeof value !== "object") return look;
  const values = value as Record<string, unknown>;
  for (const { key, min, max } of LOOK_CONTROLS) {
    const v = values[key];
    if (typeof v === "number" && Number.isFinite(v)) look[key] = Math.min(max, Math.max(min, v));
  }
  if (LIL_TOON_PRESETS.includes(values.lilToonPreset as LilToonPreset)) look.lilToonPreset = values.lilToonPreset as LilToonPreset;
  if (AVATAR_TONE_MAPPINGS.includes(values.toneMapping as AvatarToneMapping)) look.toneMapping = values.toneMapping as AvatarToneMapping;
  if (typeof values.softGrade === "boolean") look.softGrade = values.softGrade;
  if (typeof values.edgeGlow === "boolean") look.edgeGlow = values.edgeGlow;
  return look;
}

/** Animama's chat-canvas CSS filter for the soft grade and edge glow toggles. */
export function canvasFilter(look: AvatarShaderLook): string | undefined {
  const filters = [
    look.softGrade ? "brightness(1.04) contrast(0.92) saturate(0.88)" : "",
    look.edgeGlow ? "drop-shadow(0 0 6px rgba(255, 255, 255, 0.55))" : "",
  ].filter(Boolean);
  return filters.length ? filters.join(" ") : undefined;
}

const MTOON_OUTLINE_WIDTH: Record<ToonLook["kind"], number> = { face: 0.0035, skin: 0.0045, cloth: 0.0045, hair: 0.004 };

/** Tuned MToon's shade, rim and outline values for a look. */
export function tunedMToonLook(look: ToonLook, settings: AvatarShaderLook) {
  return {
    shade: deepenShade(look.shade, settings.shadow),
    rim: scaleRgb(look.rim, settings.rim),
    outlineWidth: MTOON_OUTLINE_WIDTH[look.kind] * settings.outline,
  };
}
