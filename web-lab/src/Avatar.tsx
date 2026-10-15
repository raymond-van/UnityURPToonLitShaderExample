import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { ShaderVariant } from "./shaders";

function createLoader(shader: ShaderVariant) {
  const loader = new GLTFLoader();
  // Runs before the VRM plugin reads materials, so variants can retune MToon params.
  loader.register((parser) => {
    shader.patchGltf?.(parser.json);
    return { name: "LAB_patch_gltf" };
  });
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

// Relaxed standing pose instead of the bind T-pose.
function applyRestPose(vrm: VRM) {
  const h = vrm.humanoid;
  const set = (name: Parameters<typeof h.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
    h.getNormalizedBoneNode(name)?.rotation.set(x, y, z);
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
  onReady,
}: {
  url: string;
  shader: ShaderVariant;
  onReady: (vrm: VRM) => void;
}) {
  const [vrm, setVrm] = useState<VRM | null>(null);

  useEffect(() => {
    let disposed = false;
    let loaded: VRM | null = null;
    (async () => {
      const gltf = await createLoader(shader).loadAsync(url);
      const next = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(next);
      next.scene.traverse((o) => (o.frustumCulled = false));
      applyRestPose(next);
      await shader.apply(next);
      // Settle spring bones so hair hangs naturally before the first capture.
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
  }, [url, shader, onReady]);

  useFrame((_, delta) => vrm?.update(Math.min(delta, 1 / 30)));

  return vrm ? <primitive object={vrm.scene} /> : null;
}
