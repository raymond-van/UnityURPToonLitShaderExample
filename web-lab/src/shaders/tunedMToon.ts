import type { GltfJson } from ".";

// Retunes VRoid-exported MToon params for a stronger anime look while staying
// inside the MToon 1.0 spec, so any MToon renderer (and Animama) can use them.
//
// VRoid exports shadeColor = white with shadeMultiplyTexture = the base texture,
// so the shade side equals the lit side. Body and clothes also use
// shadingShift = 1, which keeps them fully lit at any light angle.

export type Rgb = [number, number, number];

export type Look = {
  shade: Rgb;
  shift: number;
  toony: number;
  rim: Rgb;
  rimPower: number;
  rimLift: number;
  rimLightingMix: number;
  outlineWidth?: number; // screen-space fraction; omit to keep the source outline
  outlineColor?: Rgb;
};

const SKIN: Look = {
  shade: [0.9, 0.6, 0.58],
  shift: 0.0,
  toony: 0.85,
  rim: [0.3, 0.22, 0.2],
  rimPower: 4,
  rimLift: 0,
  rimLightingMix: 0.5,
  outlineWidth: 0.0045,
  outlineColor: [0.32, 0.16, 0.14],
};

// The face stays mostly lit: nose and cheek shadows read as dirt in anime style.
const FACE: Look = { ...SKIN, shift: 0.6, toony: 0.7, outlineWidth: 0.0035 };

const CLOTH: Look = {
  shade: [0.56, 0.55, 0.72],
  shift: -0.1,
  toony: 0.85,
  rim: [0.22, 0.22, 0.28],
  rimPower: 4,
  rimLift: 0,
  rimLightingMix: 0.5,
  outlineWidth: 0.0045,
  outlineColor: [0.16, 0.14, 0.2],
};

const HAIR: Look = {
  shade: [0.42, 0.3, 0.42],
  shift: -0.1,
  toony: 0.8,
  rim: [0.3, 0.22, 0.24],
  rimPower: 3,
  rimLift: 0,
  rimLightingMix: 0.5,
  outlineWidth: 0.004,
  outlineColor: [0.2, 0.08, 0.08],
};

export function lookFor(name: string): Look | null {
  if (name.includes("_Face_") && name.includes("_SKIN")) return FACE;
  if (name.includes("_SKIN")) return SKIN;
  if (name.includes("_CLOTH")) return CLOTH;
  if (name.includes("_HAIR")) return HAIR;
  return null; // eyes, brows, mouth: leave flat
}

export function patchTunedMToon(json: GltfJson) {
  for (const material of json.materials ?? []) {
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    const look = lookFor(material.name ?? "");
    if (!mtoon || !look) continue;
    mtoon.shadeColorFactor = look.shade;
    mtoon.shadingShiftFactor = look.shift;
    mtoon.shadingToonyFactor = look.toony;
    mtoon.parametricRimColorFactor = look.rim;
    mtoon.parametricRimFresnelPowerFactor = look.rimPower;
    mtoon.parametricRimLiftFactor = look.rimLift;
    mtoon.rimLightingMixFactor = look.rimLightingMix;
    if (look.outlineWidth) {
      mtoon.outlineWidthMode = "screenCoordinates";
      mtoon.outlineWidthFactor = look.outlineWidth;
      mtoon.outlineColorFactor = look.outlineColor;
      mtoon.outlineLightingMixFactor = 0.6;
    }
  }
}
