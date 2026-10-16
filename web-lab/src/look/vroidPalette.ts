/*
 * Shading looks for VRoid-exported materials, matched by VRoid's material name
 * suffixes. VRoid exports a white MToon shade colour (the shade side equals the
 * lit side) and `shadingShift` 1 on body and clothes, so they never darken.
 * These values were tuned on the Annie preset; other models may need their own.
 */

type Rgb = [number, number, number];

export type ToonLook = {
  kind: "face" | "skin" | "cloth" | "hair";
  shade: Rgb;
  rim: Rgb;
  rimPower: number;
  outlineColor: Rgb;
};

const SKIN: Omit<ToonLook, "kind"> = {
  shade: [0.9, 0.6, 0.58],
  rim: [0.3, 0.22, 0.2],
  rimPower: 4,
  outlineColor: [0.32, 0.16, 0.14],
};

const CLOTH: Omit<ToonLook, "kind"> = {
  shade: [0.56, 0.55, 0.72],
  rim: [0.22, 0.22, 0.28],
  rimPower: 4,
  outlineColor: [0.16, 0.14, 0.2],
};

const HAIR: Omit<ToonLook, "kind"> = {
  shade: [0.42, 0.3, 0.42],
  rim: [0.3, 0.22, 0.24],
  rimPower: 3,
  outlineColor: [0.2, 0.08, 0.08],
};

/** The look for a VRoid material name; eyes, brows and mouth stay flat (null). */
export function vroidLookFor(materialName: string): ToonLook | null {
  if (materialName.includes("_Face_") && materialName.includes("_SKIN")) {
    return { kind: "face", ...SKIN };
  }
  if (materialName.includes("_SKIN")) return { kind: "skin", ...SKIN };
  if (materialName.includes("_CLOTH")) return { kind: "cloth", ...CLOTH };
  if (materialName.includes("_HAIR")) return { kind: "hair", ...HAIR };
  return null;
}
