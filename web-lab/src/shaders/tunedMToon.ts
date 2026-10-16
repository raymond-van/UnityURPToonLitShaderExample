import type { MToonMaterial, VRM } from "@pixiv/three-vrm";
import type { Material, Mesh } from "three";
import type { GltfJson } from ".";
import { tunedMToonLook, type AvatarShaderLook } from "../look/look";
import { vroidLookFor, type ToonLook } from "../look/vroidPalette";

// Retunes VRoid-exported MToon params for a stronger anime look while staying
// inside the MToon 1.0 spec, matching Animama's "MToon tuned" (PR #587).
//
// VRoid exports shadeColor = white with shadeMultiplyTexture = the base texture,
// so the shade side equals the lit side. Body and clothes also use
// shadingShift = 1, which keeps them fully lit at any light angle.

/** Shading shift and toony values per look; the face stays mostly lit. */
const SHADING: Record<ToonLook["kind"], { shift: number; toony: number }> = {
  face: { shift: 0.6, toony: 0.7 },
  skin: { shift: 0, toony: 0.85 },
  cloth: { shift: -0.1, toony: 0.85 },
  hair: { shift: -0.1, toony: 0.8 },
};

export function patchTunedMToon(json: GltfJson, settings: AvatarShaderLook) {
  for (const material of json.materials ?? []) {
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    const look = vroidLookFor(material.name ?? "");
    if (!mtoon || !look) continue;
    const tuned = tunedMToonLook(look, settings);
    mtoon.shadeColorFactor = tuned.shade;
    mtoon.shadingShiftFactor = SHADING[look.kind].shift;
    mtoon.shadingToonyFactor = SHADING[look.kind].toony;
    mtoon.parametricRimColorFactor = tuned.rim;
    mtoon.parametricRimFresnelPowerFactor = look.rimPower;
    mtoon.parametricRimLiftFactor = 0;
    mtoon.rimLightingMixFactor = 0.5;
    mtoon.outlineWidthMode = "screenCoordinates";
    mtoon.outlineWidthFactor = tuned.outlineWidth;
    mtoon.outlineColorFactor = look.outlineColor;
    mtoon.outlineLightingMixFactor = 0.6;
  }
}

/** Live shadow, rim and outline sliders (outline clones share the name). */
export function updateTunedMToon(vrm: VRM, settings: AvatarShaderLook) {
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      const look = vroidLookFor(m.name);
      if (!look || !(m as Partial<MToonMaterial>).isMToonMaterial) continue;
      const mtoon = m as MToonMaterial;
      const tuned = tunedMToonLook(look, settings);
      mtoon.shadeColorFactor.setRGB(...tuned.shade);
      mtoon.parametricRimColorFactor.setRGB(...tuned.rim);
      mtoon.outlineWidthFactor = tuned.outlineWidth;
    }
  });
}
