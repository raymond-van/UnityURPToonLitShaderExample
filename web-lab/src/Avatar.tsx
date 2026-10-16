import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { ShaderVariant, ToneUniforms } from "./shaders";
import type { AvatarShaderLook } from "./look/look";

function createLoader(shader: ShaderVariant, look: AvatarShaderLook) {
  const loader = new GLTFLoader();
  loader.register((parser) => {
    const plugin = new VRMLoaderPlugin(parser);
    // Patch right after the VRM 0.x compat step (where VRM 0.x files gain
    // VRMC_materials_mtoon) and before three-vrm builds any material, as
    // Animama's withAvatarShaderPatch does.
    const v0Compat = plugin.materialsV0CompatPlugin;
    const convertV0Materials = v0Compat.beforeRoot.bind(v0Compat);
    v0Compat.beforeRoot = async () => {
      await convertV0Materials();
      shader.patchGltf?.(parser.json, look);
    };
    return plugin;
  });
  return loader;
}

// Relaxed standing pose instead of the bind T-pose.
function applyRestPose(vrm: VRM) {
  const h = vrm.humanoid;
  // VRM 0.x normalized bones face the other way (rotateVRM0 turns the scene),
  // so rotations about x and z flip sign.
  const flip = vrm.meta.metaVersion === "0" ? -1 : 1;
  const set = (name: Parameters<typeof h.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
    h.getNormalizedBoneNode(name)?.rotation.set(x * flip, y, z * flip);
  };
  set("leftUpperArm", 0, 0, -1.2);
  set("rightUpperArm", 0, 0, 1.2);
  set("leftLowerArm", 0, -0.25, 0);
  set("rightLowerArm", 0, 0.25, 0);
  set("leftHand", 0, 0, -0.1);
  set("rightHand", 0, 0, 0.1);
}

export function Avatar({
  url,
  shader,
  look,
  tone,
  expression,
  onReady,
}: {
  url: string;
  expression?: string;
  shader: ShaderVariant;
  look: AvatarShaderLook;
  tone: ToneUniforms;
  onReady: (vrm: VRM) => void;
}) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  // The look at load time; later changes apply live through updateLook.
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    if (vrm) shader.updateLook?.(vrm, look);
  }, [vrm, shader, look]);

  useEffect(() => {
    let disposed = false;
    let loaded: VRM | null = null;
    setVrm(null);
    (async () => {
      const gltf = await createLoader(shader, lookRef.current).loadAsync(url);
      const next = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(next);
      next.scene.traverse((o) => (o.frustumCulled = false));
      applyRestPose(next);
      await shader.apply(next, lookRef.current, tone);
      // Settle spring bones so hair hangs naturally before the first capture.
      if (expression) next.expressionManager?.setValue(expression, 1);
      next.update(0);
      for (let i = 0; i < 120; i++) next.springBoneManager?.update(1 / 60);
      if (disposed) return VRMUtils.deepDispose(next.scene);
      loaded = next;
      setVrm(next);
      onReady(next);
    })().catch((err) => {
      console.error(err);
      (window as unknown as { __labError: string }).__labError = String(err);
    });
    return () => {
      disposed = true;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [url, shader, tone, expression, onReady]);

  useFrame((_, delta) => vrm?.update(Math.min(delta, 1 / 30)));

  return vrm ? <primitive object={vrm.scene} /> : null;
}
