import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Color, DoubleSide, Material, Mesh, Texture, type IUniform, type WebGLProgramParametersWithUniforms } from "three";
import { LilToonMaterial, enableLilToon } from "@mochiya/three-liltoon";
import type { VRM } from "@pixiv/three-vrm";
import type { GltfJson, ToneUniforms } from ".";
import type { AvatarShaderLook } from "../look/look";
import { lilToonBaseProperties, lilToonLookProperties, lilToonOutlineUsesSurface } from "../look/lilToonLook";
import { vroidLookFor } from "../look/vroidPalette";

// Same conversion as Animama's dev lilToon switch (PR #587, lilToon.ts):
// three-liltoon only converts materials carrying its own glTF extension, which
// VRoid exports never have, so MToon materials are rebuilt by hand with the
// VRoid palette and the selected look preset.

export function LilToonRendering() {
  const gl = useThree((s) => s.gl);
  useEffect(() => enableLilToon(gl), [gl]);
  return null;
}

// three-liltoon writes sRGB itself and ignores renderer.toneMapping; apply
// three's ACES Filmic or Neutral curve (picked by a uniform) with the pane's
// exposure just before that conversion.
const TONE_MAPPING_GLSL = `
uniform highp float labExposure;
uniform highp float labNeutralToneMapping;
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
  color *= labExposure / 0.6;
  color = outputMat * labRRTAndODTFit(inputMat * color);
  return clamp(color, 0.0, 1.0);
}
highp vec3 labNeutral(highp vec3 color) {
  const highp float StartCompression = 0.8 - 0.04;
  const highp float Desaturation = 0.15;
  color *= labExposure;
  highp float x = min(color.r, min(color.g, color.b));
  highp float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  highp float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;
  highp float d = 1. - StartCompression;
  highp float newPeak = 1. - d * d / (peak + d - StartCompression);
  color *= newPeak / peak;
  highp float g = 1. - 1. / (Desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}
`;
const SRGB_INPUT = "highp vec3 linearColor = max(out_var_SV_Target.rgb, vec3(0.0));";

/**
 * Non-enumerable, so lilToon's program switches (which delete and re-add every
 * enumerable uniform) keep them, as in Animama.
 */
function attachToneUniforms(uniforms: Record<string, IUniform>, tone: ToneUniforms) {
  for (const [name, uniform] of [
    ["labExposure", tone.exposure],
    ["labNeutralToneMapping", tone.neutral],
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(uniforms, name)) continue;
    Object.defineProperty(uniforms, name, { value: uniform, enumerable: false, configurable: true });
  }
}

export function stripMToonOutlines(json: GltfJson) {
  for (const material of json.materials ?? []) {
    const mtoon = material.extensions?.VRMC_materials_mtoon;
    if (mtoon) mtoon.outlineWidthMode = "none";
  }
}

type MToonLike = Material & { map?: Texture | null; color?: Color; alphaTest: number };

function lookProperties(name: string, settings: AvatarShaderLook) {
  const look = vroidLookFor(name);
  return {
    ...lilToonBaseProperties(settings.lilToonPreset),
    ...(look ? lilToonLookProperties(look, settings.lilToonPreset, settings) : {}),
  };
}

function toLilToon(source: MToonLike, settings: AvatarShaderLook, tone: ToneUniforms): LilToonMaterial {
  const look = vroidLookFor(source.name);
  const c = source.color ?? new Color(1, 1, 1);
  const map = source.map ?? null;
  const outlineTexture = look && lilToonOutlineUsesSurface(settings.lilToonPreset) ? map : null;
  const material = new LilToonMaterial({
    name: source.name,
    map,
    ...(outlineTexture ? { textures: { _OutlineTex: outlineTexture } } : {}),
    alphaTest: source.transparent ? 0 : source.alphaTest,
    renderMode: source.transparent ? "transparent" : source.alphaTest > 0 ? "cutout" : "opaque",
    properties: {
      _Color: [c.r, c.g, c.b, source.opacity],
      _Cull: source.side === DoubleSide ? 0 : 2,
      // lilToon's transparent mode writes depth by default; MToon's does not.
      _ZWrite: source.depthWrite ? 1 : 0,
      _UseShadow: look ? 1 : 0,
      _UseRim: look ? 1 : 0,
      _UseOutline: look ? 1 : 0,
      ...lookProperties(source.name, settings),
    },
  });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    if (!shader.fragmentShader.includes(SRGB_INPUT)) return;
    attachToneUniforms(shader.uniforms, tone);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main()", `${TONE_MAPPING_GLSL}\nvoid main()`)
      .replace(
        SRGB_INPUT,
        "highp vec3 linearColor = max(out_var_SV_Target.rgb, vec3(0.0));\n  linearColor = labNeutralToneMapping > 0.5 ? labNeutral(linearColor) : labACESFilmic(linearColor);",
      );
  };
  return material;
}

export function applyLilToon(vrm: VRM, settings: AvatarShaderLook, tone: ToneUniforms) {
  const converted = new Map<Material, LilToonMaterial>();
  const convert = (m: Material) => {
    if (!converted.has(m)) converted.set(m, toLilToon(m as MToonLike, settings, tone));
    return converted.get(m)!;
  };
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  // VRM material-colour expressions pointed at the old materials.
  for (const m of converted.keys()) m.dispose();
}

function sameValue(current: unknown, next: number | number[]) {
  if (!Array.isArray(next)) return current === next;
  return Array.isArray(current) && current.length === next.length && next.every((v, i) => current[i] === v);
}

/** Live preset and slider changes; unchanged values are skipped since each can rebuild the program key. */
export function updateLilToon(vrm: VRM, settings: AvatarShaderLook) {
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(m instanceof LilToonMaterial)) continue;
      for (const [name, value] of Object.entries(lookProperties(m.name, settings))) {
        if (!sameValue(m.lilToonProperties[name], value)) m.setProperty(name, value);
      }
      if (!vroidLookFor(m.name)) continue;
      const outlineTexture = lilToonOutlineUsesSurface(settings.lilToonPreset) ? m.map : null;
      if ((m.lilToonTextures._OutlineTex ?? null) !== outlineTexture) m.setTexture("_OutlineTex", outlineTexture);
    }
  });
}
