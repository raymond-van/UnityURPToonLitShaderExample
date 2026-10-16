import {
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  Vector4,
  type IUniform,
  type Material,
  type Texture,
} from "three";

// A three.js port of Colin Leung's MIT "SimpleURPToonLitOutlineExample"
// (the free tutorial shader in this repo's root), plus optional extras modelled
// on NiloToonURP's publicly documented look: a screen-space depth rim light and
// depth-texture shadows (hair shading the face). Nothing here comes from the
// closed NiloToonURP source.

// Shared by every Nilo material; NiloRendering keeps them current each frame.
export const niloShared = {
  tDepth: { value: null as Texture | null },
  tCasterId: { value: null as Texture | null },
  uResolution: { value: new Vector2(1, 1) },
  uCameraNearFar: { value: new Vector2(0.05, 50) },
  uDepthOnly: { value: 0 },
  uHeadForward: { value: new Vector3(0, 0, 1) },
};

// Bound during the depth pre-pass so no material samples the texture being written.
export const blankDepth = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blankDepth.needsUpdate = true;

export type NiloParams = {
  isFace: boolean;
  // Cel shade (Colin's _CelShadeMidPoint / _CelShadeSoftness, on N.L).
  midPoint: number;
  softness: number;
  // Shadow colour = albedo * shadowTint, then saturation scaled by shadowSaturation.
  shadowTint: [number, number, number];
  shadowSaturation: number;
  indirectMin: number;
  // How much the ambient light floors the result (Colin's max(indirect, direct)).
  indirectStrength: number;
  // Face: 0 = Colin's lerp(0.5, 1, N.L); 1 = lit unless the light is behind the head.
  faceMode: number;
  // Outline (Colin's _OutlineWidth, outline colour multiplier, view-space Z offset).
  outline: boolean;
  outlineWidth: number;
  outlineColor: [number, number, number];
  outlineFromShadow: number; // 0 = lit colour * outlineColor, 1 = shadow colour * outlineColor
  outlineZOffset: number;
  // NiloToon-style screen-space extras (need NiloRendering's depth pass).
  rimStrength: number;
  rimWidth: number; // metres
  depthShadow: number; // 0..1
  depthShadowOffset: number; // metres toward the light
  casterId: number; // written in the depth pass (hair 1, face 0.5, rest 0.25)
  receiveFromId: number; // takes depth shadows only from casters with id >= this
};

const VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

uniform float uIsOutline;
uniform float uIsFace;
uniform float uOutlineWidth;
uniform float uOutlineZOffset;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPosition;

// NiloOutlineUtil.hlsl: keep outline width similar on screen across distance and FOV.
float outlineCameraFix(float positionVSZ) {
  float fovDeg = atan(1.0 / projectionMatrix[1][1]) * 2.0 * 57.2958;
  return clamp(abs(positionVSZ), 0.0, 1.0) * fovDeg * 0.00005;
}

// NiloZOffset.hlsl: push depth (only) away from the camera in view space.
vec4 zOffsetClip(vec4 positionCS, float offset) {
  float modifiedVSZ = -positionCS.w - offset;
  float modifiedCSZ = modifiedVSZ * projectionMatrix[2][2] + projectionMatrix[3][2];
  positionCS.z = modifiedCSZ * positionCS.w / (-modifiedVSZ);
  return positionCS;
}

void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>

  vec4 positionWS = modelMatrix * vec4(transformed, 1.0);
  vec3 normalWS = normalize(mat3(modelMatrix) * objectNormal);
  if (uIsOutline > 0.5) {
    float viewZ = (viewMatrix * positionWS).z;
    positionWS.xyz += normalWS * uOutlineWidth * outlineCameraFix(viewZ);
  }
  vec4 mvPosition = viewMatrix * positionWS;
  vViewPosition = -mvPosition.xyz;
  vNormalView = normalize((viewMatrix * vec4(normalWS, 0.0)).xyz);
  gl_Position = projectionMatrix * mvPosition;
  if (uIsOutline > 0.5) gl_Position = zOffsetClip(gl_Position, uOutlineZOffset + 0.03 * uIsFace);
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>

uniform mat4 projectionMatrix;
uniform sampler2D baseMap;
uniform vec4 baseColor;
uniform float alphaCutoff;
uniform float uIsOutline;
uniform float uIsFace;
uniform float uMidPoint;
uniform float uSoftness;
uniform vec3 uShadowTint;
uniform float uShadowSaturation;
uniform float uIndirectMin;
uniform float uIndirectStrength;
uniform float uFaceMode;
uniform vec3 uOutlineColor;
uniform float uOutlineFromShadow;
uniform float uRimStrength;
uniform float uRimWidth;
uniform float uDepthShadow;
uniform float uDepthShadowOffset;
uniform float uCasterId;
uniform float uReceiveFromId;

uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform vec2 uCameraNearFar;
uniform float uDepthOnly;
uniform vec3 uHeadForward;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPosition;

uniform sampler2D tCasterId;

float sceneCasterId(vec2 pixel) {
  return texture2D(tCasterId, pixel / uResolution).r;
}

float sceneViewZ(vec2 pixel) {
  float d = texture2D(tDepth, pixel / uResolution).x;
  return perspectiveDepthToViewZ(d, uCameraNearFar.x, uCameraNearFar.y);
}

// Metres at this fragment's depth to pixels.
float metresToPixels(float metres) {
  return metres * projectionMatrix[1][1] * 0.5 * uResolution.y / vViewPosition.z;
}

vec3 saturateColor(vec3 c, float amount) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return max(mix(vec3(l), c, amount), 0.0);
}

void main() {
  vec4 base = texture2D(baseMap, vUv) * baseColor;
  if (base.a < alphaCutoff) discard;
  // Depth pre-pass: red = caster id, so the face only takes shadows from hair.
  if (uDepthOnly > 0.5) { gl_FragColor = vec4(uCasterId, 0.0, 0.0, 1.0); return; }

  vec3 albedo = base.rgb;
  vec3 N = normalize(vNormalView);
  if (!gl_FrontFacing && uIsOutline < 0.5) N = -N;
  float selfViewZ = -vViewPosition.z;

  // Main light = brightest directional light (URP's GetMainLight()).
  int mainIndex = -1;
  float best = -1.0;
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    float lum = dot(directionalLights[i].color, vec3(0.299, 0.587, 0.114));
    if (lum > best) { best = lum; mainIndex = i; }
  }
  #endif

  vec3 shadowAlbedo = saturateColor(albedo * uShadowTint, uShadowSaturation);
  vec3 mainResult = vec3(0.0);
  vec3 additional = vec3(0.0);
  vec3 mainLightColor = vec3(0.0);
  vec3 L = vec3(0.0, 0.0, 1.0);

  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 lightDir = directionalLights[i].direction;
    vec3 lightColor = clamp(directionalLights[i].color, 0.0, 1.0);
    float NoL = dot(N, lightDir);
    float area = smoothstep(uMidPoint - uSoftness, uMidPoint + uSoftness, NoL);
    if (uIsFace > 0.5) {
      if (uFaceMode < 0.5) {
        area = mix(0.5, 1.0, area);
      } else {
        vec3 F = normalize((viewMatrix * vec4(uHeadForward, 0.0)).xyz);
        area = smoothstep(-0.45, -0.2, dot(F, lightDir));
      }
    }
    bool isMain = i == mainIndex;
    if (isMain) {
      L = lightDir;
      mainLightColor = lightColor;
      // Depth-texture shadow: anything noticeably closer to the camera a little
      // toward the light (e.g. fringe over the forehead) shades this pixel.
      if (uDepthShadow > 0.0) {
        vec2 offset = (vec3(lightDir.xy, 0.0)).xy * metresToPixels(uDepthShadowOffset);
        vec2 pixel = gl_FragCoord.xy + offset;
        float diff = sceneViewZ(pixel) - selfViewZ;
        float shadow = smoothstep(0.006, 0.012, diff) * (1.0 - smoothstep(0.08, 0.12, diff));
        shadow *= step(uReceiveFromId, sceneCasterId(pixel));
        area *= 1.0 - shadow * uDepthShadow;
      }
    }
    vec3 lit = mix(shadowAlbedo, albedo, area) * lightColor;
    if (isMain) mainResult = lit; else additional += lit * 0.25;
  }
  #endif

  // Colin's ShadeGI: flat average ambient, floored to avoid pitch black.
  vec3 indirect = max(vec3(uIndirectMin), ambientLightColor) * albedo * uIndirectStrength;
  vec3 color = max(indirect, mainResult + additional);

  // NiloToon-style depth rim: a fixed-width band where the depth behind the
  // silhouette (along the screen-space normal) falls away.
  if (uRimStrength > 0.0 && uIsOutline < 0.5) {
    vec2 dir = N.xy;
    float len = length(dir);
    if (len > 1e-3) {
      vec2 offset = dir / len * metresToPixels(uRimWidth);
      float behindZ = sceneViewZ(gl_FragCoord.xy + offset);
      float edge = smoothstep(0.1, 0.25, selfViewZ - behindZ);
      float facing = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
      color += edge * mix(0.25, 1.0, facing) * (albedo + 0.35) * max(mainLightColor, vec3(0.3)) * uRimStrength;
    }
  }

  if (uIsOutline > 0.5) {
    vec3 src = mix(color, shadowAlbedo * max(mainLightColor, ambientLightColor), uOutlineFromShadow);
    color = src * uOutlineColor;
  }

  gl_FragColor = vec4(color, base.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

type MToonLike = Material & {
  map?: Texture | null;
  color?: Color;
  alphaTest: number;
  transparent: boolean;
};

export function createNiloMaterial(source: MToonLike, p: NiloParams, isOutline: boolean): ShaderMaterial {
  const c = source.color ?? new Color(1, 1, 1);
  const uniforms: Record<string, IUniform> = UniformsUtils.merge([
    UniformsLib.lights,
    {
      baseMap: { value: source.map ?? blankDepth },
      baseColor: { value: new Vector4(c.r, c.g, c.b, source.opacity) },
      alphaCutoff: { value: source.transparent ? 0.001 : source.alphaTest },
      uIsOutline: { value: isOutline ? 1 : 0 },
      uIsFace: { value: p.isFace ? 1 : 0 },
      uMidPoint: { value: p.midPoint },
      uSoftness: { value: p.softness },
      uShadowTint: { value: new Vector3(...p.shadowTint) },
      uShadowSaturation: { value: p.shadowSaturation },
      uIndirectMin: { value: p.indirectMin },
      uIndirectStrength: { value: p.indirectStrength },
      uFaceMode: { value: p.faceMode },
      uOutlineWidth: { value: p.outlineWidth },
      uOutlineColor: { value: new Vector3(...p.outlineColor) },
      uOutlineFromShadow: { value: p.outlineFromShadow },
      uOutlineZOffset: { value: p.outlineZOffset },
      uRimStrength: { value: p.rimStrength },
      uRimWidth: { value: p.rimWidth },
      uDepthShadow: { value: p.depthShadow },
      uDepthShadowOffset: { value: p.depthShadowOffset },
      uCasterId: { value: p.casterId },
      uReceiveFromId: { value: p.receiveFromId },
    },
  ]);
  // Keep the shared uniforms shared (merge clones them).
  Object.assign(uniforms, niloShared);

  const material = new ShaderMaterial({
    name: `${source.name}${isOutline ? " (Nilo outline)" : " (Nilo)"}`,
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    lights: true,
    transparent: !isOutline && source.transparent,
    depthWrite: isOutline || source.depthWrite,
    side: isOutline ? BackSide : source.side === DoubleSide ? DoubleSide : FrontSide,
  });
  return material;
}
