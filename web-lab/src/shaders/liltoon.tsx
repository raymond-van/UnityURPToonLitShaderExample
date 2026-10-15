import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Material, Mesh, Texture } from "three";
import { LilToonMaterial, enableLilToon } from "@mochiya/three-liltoon";
import type { VRM } from "@pixiv/three-vrm";
import type { GltfJson } from ".";
import { lookFor, type Look } from "./tunedMToon";

// three-liltoon only converts materials carrying its own glTF extension, which
// VRoid exports never have. So we load as MToon (without outline geometry) and
// rebuild each material as a LilToonMaterial, reusing the tuned MToon palette
// so the comparison isolates the shader rather than the colour choices.

export function LilToonRendering() {
  const gl = useThree((s) => s.gl);
  useEffect(() => enableLilToon(gl), [gl]);
  return null;
}

// three-liltoon writes sRGB output itself and ignores renderer.toneMapping, so
// next to tone-mapped MToon it looks washed out. Apply three's ACES Filmic curve
// (r3f's default) just before lilToon's sRGB conversion.
const ACES_GLSL = `
highp vec3 labRRTAndODTFit(highp vec3 v) {
  highp vec3 a = v * (v + 0.0245786) - 0.000090537;
  highp vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
highp vec3 labACESFilmic(highp vec3 color) {
  const highp mat3 inputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const highp mat3 outputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = outputMat * labRRTAndODTFit(inputMat * color);
  return clamp(color, 0.0, 1.0);
}
`;
const SRGB_INPUT = "highp vec3 linearColor = max(out_var_SV_Target.rgb, vec3(0.0));";

function addToneMapping(shader: { fragmentShader: string }) {
  if (!shader.fragmentShader.includes(SRGB_INPUT)) return;
  shader.fragmentShader = shader.fragmentShader
    .replace("void main()", `${ACES_GLSL}\nvoid main()`)
    .replace(SRGB_INPUT, "highp vec3 linearColor = labACESFilmic(max(out_var_SV_Target.rgb, vec3(0.0)));");
}

export function stripMToonOutlines(json: GltfJson) {
  for (const material of json.materials ?? []) {
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    if (mtoon) mtoon.outlineWidthMode = "none";
  }
}

type MToonLike = Material & {
  map?: Texture | null;
  color?: { r: number; g: number; b: number };
  alphaTest: number;
  transparent: boolean;
  side: number;
};

function toLilToon(source: MToonLike): LilToonMaterial {
  const look: Look | null = lookFor(source.name);
  const isFace = source.name.includes("_Face_") && source.name.includes("_SKIN");
  const c = source.color ?? { r: 1, g: 1, b: 1 };

  const properties: Record<string, number | number[]> = {
    _Color: [c.r, c.g, c.b, source.opacity],
    _Cull: source.side === 2 ? 0 : 2,
    // lilToon's transparent mode writes depth by default; MToon's does not.
    _ZWrite: source.depthWrite ? 1 : 0,
    _UseShadow: look ? 1 : 0,
    _UseRim: look ? 1 : 0,
    _UseOutline: look ? 1 : 0,
  };
  if (look) {
    Object.assign(properties, {
      _ShadowColor: [...look.shade, 1],
      _ShadowBorder: isFace ? 0.2 : 0.55,
      _ShadowBlur: 0.08,
      // lilToon's warm terminator band suits skin but tints white cloth pink.
      _ShadowBorderRange: look.shade[0] > 0.8 ? 0.08 : 0,
      _Shadow2ndColor: [look.shade[0] * 0.8, look.shade[1] * 0.75, look.shade[2] * 0.85, 0.6],
      _Shadow2ndBorder: isFace ? 0.05 : 0.3,
      _Shadow2ndBlur: 0.15,
      _RimColor: [...look.rim.map((v) => v * 2.5), 1],
      _RimBorder: 0.5,
      _RimBlur: 0.5,
      _RimFresnelPower: look.rimPower,
      _RimEnableLighting: 1,
      _OutlineWidth: isFace ? 0.05 : 0.1,
      _OutlineColor: [...(look.outlineColor ?? [0.2, 0.15, 0.15]), 1],
    });
  }

  const material = new LilToonMaterial({
    name: source.name,
    map: source.map ?? null,
    alphaTest: source.transparent ? 0 : source.alphaTest,
    renderMode: source.transparent ? "transparent" : source.alphaTest > 0 ? "cutout" : "opaque",
    properties,
  });
  material.onBeforeCompile = addToneMapping;
  return material;
}

export function applyLilToon(vrm: VRM) {
  const converted = new Map<Material, LilToonMaterial>();
  const convert = (m: Material) => {
    if (!converted.has(m)) converted.set(m, toLilToon(m as MToonLike));
    return converted.get(m)!;
  };
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  // VRM material-colour expressions pointed at the old materials; Annie has none.
  for (const m of converted.keys()) m.dispose();
}
