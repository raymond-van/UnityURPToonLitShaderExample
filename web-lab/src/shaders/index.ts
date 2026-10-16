import type { VRM } from "@pixiv/three-vrm";
import type { FC } from "react";
import type { AvatarShaderLook } from "../look/look";
import { patchTunedMToon, updateTunedMToon } from "./tunedMToon";
import { LilToonRendering, applyLilToon, stripMToonOutlines, updateLilToon } from "./liltoon";
import { NiloRendering, applyNilo, exampleParams, styleParams, updateNiloLook } from "./nilo";

/** A pane's tone-mapping uniforms, for shaders that tone-map themselves (lilToon). */
export type ToneUniforms = { exposure: { value: number }; neutral: { value: number } };

// A shader variant can rewrite the glTF JSON before three-vrm builds materials
// (e.g. MToon params) and/or swap or tweak materials on the loaded VRM.
// `updateLook` follows the pane's look sliders without reloading.
export type ShaderVariant = {
  id: string;
  label: string;
  patchGltf?: (json: GltfJson, look: AvatarShaderLook) => void;
  apply: (vrm: VRM, look: AvatarShaderLook, tone: ToneUniforms) => void | Promise<void>;
  updateLook?: (vrm: VRM, look: AvatarShaderLook) => void;
  // Mounted inside the Canvas while the variant is active (renderer hooks).
  CanvasExtras?: FC;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GltfJson = any;

export const SHADERS: ShaderVariant[] = [
  {
    id: "mtoon",
    label: "MToon (three-vrm default)",
    apply: () => {},
  },
  {
    id: "mtoon-tuned",
    label: "MToon tuned",
    patchGltf: patchTunedMToon,
    apply: () => {},
    updateLook: updateTunedMToon,
  },
  {
    id: "liltoon",
    label: "lilToon (three-liltoon)",
    patchGltf: stripMToonOutlines,
    apply: applyLilToon,
    updateLook: updateLilToon,
    CanvasExtras: LilToonRendering,
  },
  {
    id: "nilo-example",
    label: "Nilo example (Colin's MIT shader)",
    patchGltf: stripMToonOutlines,
    apply: (vrm) => applyNilo(vrm, exampleParams),
    updateLook: updateNiloLook,
    CanvasExtras: NiloRendering,
  },
  {
    id: "nilo-style",
    label: "NiloToon-style (custom)",
    patchGltf: stripMToonOutlines,
    apply: (vrm) => applyNilo(vrm, styleParams),
    updateLook: updateNiloLook,
    CanvasExtras: NiloRendering,
  },
];
