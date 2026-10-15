import type { VRM } from "@pixiv/three-vrm";
import type { FC } from "react";
import { patchTunedMToon } from "./tunedMToon";
import { LilToonRendering, applyLilToon, stripMToonOutlines } from "./liltoon";

// A shader variant can rewrite the glTF JSON before load (e.g. MToon params)
// and/or swap or tweak materials on the loaded VRM.
export type ShaderVariant = {
  id: string;
  label: string;
  patchGltf?: (json: GltfJson) => void;
  apply: (vrm: VRM) => void | Promise<void>;
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
  },
  {
    id: "liltoon",
    label: "lilToon (three-liltoon)",
    patchGltf: stripMToonOutlines,
    apply: applyLilToon,
    CanvasExtras: LilToonRendering,
  },
];
