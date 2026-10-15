import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { VRM } from "@pixiv/three-vrm";
import { Avatar } from "./Avatar";
import { BACKGROUND, LIGHTS, VIEWS, type ViewPreset } from "./config";
import { SHADERS } from "./shaders";

type LabWindow = Window & { __labReady?: boolean };

const params = new URLSearchParams(location.search);
const capture = params.has("capture");

// Lets the capture script enumerate presets without duplicating them.
(window as unknown as { __labMeta: object }).__labMeta = {
  shaders: SHADERS.map(({ id, label }) => ({ id, label })),
  lights: LIGHTS.map(({ id, label }) => ({ id, label })),
  views: VIEWS.map(({ id, label }) => ({ id, label })),
};

function useParam(key: string, fallback: string) {
  const [value, setValue] = useState(params.get(key) ?? fallback);
  const update = (next: string) => {
    params.set(key, next);
    history.replaceState(null, "", `?${params}`);
    setValue(next);
  };
  return [value, update] as const;
}

function CameraRig({ vrm, view }: { vrm: VRM | null; view: ViewPreset }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!vrm) return;
    const head = new Vector3();
    vrm.humanoid.getNormalizedBoneNode("head")?.getWorldPosition(head);
    const target = head.clone().add(new Vector3(...view.target));
    camera.position.copy(head).add(new Vector3(...view.camera));
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    invalidate();
    if (capture) {
      // Give shaders a few frames to compile and settle before signalling.
      let frames = 0;
      const tick = () => (++frames > 20 ? ((window as LabWindow).__labReady = true) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }
  }, [vrm, view, camera, controls, invalidate]);

  return null;
}

export function App() {
  const [shaderId, setShaderId] = useParam("shader", SHADERS[0].id);
  const [lightId, setLightId] = useParam("light", LIGHTS[0].id);
  const [viewId, setViewId] = useParam("view", "bust");
  const [vrm, setVrm] = useState<VRM | null>(null);
  const prevShader = useRef(shaderId);

  const shader = SHADERS.find((s) => s.id === shaderId) ?? SHADERS[0];
  const light = LIGHTS.find((l) => l.id === lightId) ?? LIGHTS[0];
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];
  const onReady = useCallback((next: VRM) => setVrm(next), []);

  useEffect(() => {
    if (prevShader.current !== shaderId) setVrm(null);
    prevShader.current = shaderId;
  }, [shaderId]);

  const panel = useMemo(
    () =>
      capture ? null : (
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1, display: "grid", gap: 6, padding: 10, background: "#0009", borderRadius: 8 }}>
          <strong>Toon Shader Lab</strong>
          <Select label="Shader" value={shader.id} options={SHADERS} onChange={setShaderId} />
          <Select label="Light" value={light.id} options={LIGHTS} onChange={setLightId} />
          <Select label="View" value={view.id} options={VIEWS} onChange={setViewId} />
        </div>
      ),
    [shader.id, light.id, view.id, setShaderId, setLightId, setViewId],
  );

  return (
    <>
      {panel}
      <Canvas gl={{ antialias: true, preserveDrawingBuffer: capture }} dpr={capture ? 1 : [1, 2]} camera={{ fov: 30, near: 0.05, far: 50 }}>
        <color attach="background" args={[BACKGROUND]} />
        <ambientLight intensity={light.ambient} />
        {light.directional.map((d, i) => (
          <directionalLight key={i} position={d.position} intensity={d.intensity} color={d.color ?? "#ffffff"} />
        ))}
        <Avatar url="/avatars/annie.vrm" shader={shader} onReady={onReady} />
        {!capture && <OrbitControls makeDefault />}
        <CameraRig vrm={vrm} view={view} />
      </Canvas>
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
