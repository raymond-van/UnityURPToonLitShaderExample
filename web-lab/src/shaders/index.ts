import type { VRM } from "@pixiv/three-vrm";

// A shader variant takes a freshly loaded VRM and swaps or tweaks its materials.
export type ShaderVariant = {
  id: string;
  label: string;
  apply: (vrm: VRM) => void | Promise<void>;
};

export const SHADERS: ShaderVariant[] = [
  {
    id: "mtoon",
    label: "MToon (three-vrm default)",
    apply: () => {},
  },
];
