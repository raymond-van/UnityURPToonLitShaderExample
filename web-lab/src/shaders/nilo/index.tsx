import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DepthTexture,
  FloatType,
  Mesh,
  Quaternion,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { VRM } from "@pixiv/three-vrm";
import { blankDepth, createNiloMaterial, niloShared, type NiloParams } from "./niloMaterial";

type Part = "face" | "faceParts" | "skin" | "cloth" | "hair";

function partFor(name: string): Part {
  if (name.includes("_Face_") && name.includes("_SKIN")) return "face";
  if (name.includes("_FACE") || name.includes("_EYE")) return "faceParts";
  if (name.includes("_SKIN")) return "skin";
  if (name.includes("_HAIR")) return "hair";
  return "cloth";
}

// Defaults of Colin's SimpleURPToonLitOutlineExample.shader, unchanged.
const EXAMPLE: NiloParams = {
  isFace: false,
  midPoint: -0.5,
  softness: 0.05,
  shadowTint: [1, 0.825, 0.78],
  shadowSaturation: 1,
  indirectMin: 0.1,
  indirectStrength: 1,
  faceMode: 0,
  outline: true,
  outlineWidth: 1,
  outlineColor: [0.5, 0.5, 0.5],
  outlineFromShadow: 0,
  outlineZOffset: 0.0001,
  rimStrength: 0,
  rimWidth: 0,
  depthShadow: 0,
  depthShadowOffset: 0,
  casterId: 0.25,
  receiveFromId: 0.4,
};

export function exampleParams(part: Part): NiloParams {
  const isFace = part === "face" || part === "faceParts";
  return { ...EXAMPLE, isFace, outline: part !== "faceParts" };
}

// NiloToon-flavoured look rebuilt from public screenshots and docs: a harder
// terminator, saturated warm skin shadows, cool cloth shadows, a face that only
// darkens when lit from behind, hair shadows on the face, a thin depth rim and
// outlines tinted from the shadow colour instead of grey.
export function styleParams(part: Part): NiloParams {
  const common: NiloParams = {
    ...EXAMPLE,
    midPoint: -0.05,
    softness: 0.02,
    indirectStrength: 0.55,
    outlineWidth: 0.8,
    outlineColor: [0.55, 0.5, 0.5],
    outlineFromShadow: 1,
    rimStrength: 0.4,
    rimWidth: 0.004,
    depthShadow: 1,
    depthShadowOffset: 0.03,
  };
  switch (part) {
    case "face":
      return { ...common, isFace: true, faceMode: 1, shadowTint: [0.92, 0.74, 0.72], shadowSaturation: 1.2, rimStrength: 0, outlineWidth: 0.6, casterId: 0.5, receiveFromId: 0.9 };
    case "faceParts":
      return { ...common, isFace: true, faceMode: 1, outline: false, rimStrength: 0, depthShadow: 0, shadowTint: [0.9, 0.8, 0.8] };
    case "skin":
      return { ...common, shadowTint: [0.95, 0.8, 0.78], shadowSaturation: 1.15, rimStrength: 0.25 };
    case "hair":
      return { ...common, casterId: 1, midPoint: -0.15, shadowTint: [0.72, 0.6, 0.7], shadowSaturation: 1.3 };
    case "cloth":
      return { ...common, shadowTint: [0.68, 0.66, 0.82], shadowSaturation: 1.15 };
  }
}

const outlineMaterials = new Set<Material>();
const heads = new Set<Object3D>();

export function applyNilo(vrm: VRM, paramsFor: (part: Part) => NiloParams) {
  outlineMaterials.clear();
  const surfaces = new Map<Material, [Material, Material | null]>();
  const convert = (m: Material) => {
    if (!surfaces.has(m)) {
      const p = paramsFor(partFor(m.name));
      const outline = p.outline ? createNiloMaterial(m, p, true) : null;
      if (outline) outlineMaterials.add(outline);
      surfaces.set(m, [createNiloMaterial(m, p, false), outline]);
    }
    return surfaces.get(m)!;
  };

  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const [surface, outline] = convert(mesh.material);
    if (!outline) {
      mesh.material = surface;
      return;
    }
    // Two-pass outline the way three-vrm draws MToon's: a second geometry group
    // drawing the same triangles with the outline material, so skinning and
    // morph targets stay shared.
    const geometry = mesh.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    geometry.clearGroups();
    geometry.addGroup(0, count, 0);
    geometry.addGroup(0, count, 1);
    mesh.material = [surface, outline];
  });
  for (const m of surfaces.keys()) m.dispose();

  const head = vrm.humanoid.getNormalizedBoneNode("head");
  heads.clear();
  if (head) heads.add(head);
}

// Renders scene depth (without outline shells) before the main pass, for the
// depth rim and depth shadows, and tracks the head's forward direction.
export function NiloRendering() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const target = useMemo(() => {
    const t = new WebGLRenderTarget(1, 1, { depthBuffer: true });
    t.depthTexture = new DepthTexture(1, 1, FloatType);
    return t;
  }, []);

  useEffect(() => {
    const w = Math.floor(size.width * dpr);
    const h = Math.floor(size.height * dpr);
    target.setSize(w, h);
    niloShared.uResolution.value.set(w, h);
  }, [size, dpr, target]);

  useEffect(() => () => target.dispose(), [target]);

  const q = useMemo(() => new Quaternion(), []);
  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera;
    niloShared.uCameraNearFar.value.set(camera.near, camera.far);
    for (const head of heads) {
      head.getWorldQuaternion(q);
      niloShared.uHeadForward.value.copy(new Vector3(0, 0, 1).applyQuaternion(q));
    }

    for (const m of outlineMaterials) m.visible = false;
    niloShared.uDepthOnly.value = 1;
    niloShared.tDepth.value = blankDepth;
    niloShared.tCasterId.value = blankDepth;
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(state.scene, camera);
    gl.setRenderTarget(null);
    niloShared.uDepthOnly.value = 0;
    niloShared.tDepth.value = target.depthTexture;
    niloShared.tCasterId.value = target.texture;
    for (const m of outlineMaterials) m.visible = true;

    gl.render(state.scene, camera);
  }, 1);

  return null;
}
