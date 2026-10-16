import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping, NeutralToneMapping, Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { VRM } from "@pixiv/three-vrm";
import { Avatar } from "./Avatar";
import { AVATARS, BACKGROUND, LIGHTS, VIEWS, type LightPreset, type ViewPreset } from "./config";
import { SHADERS, type ToneUniforms } from "./shaders";
import {
  AVATAR_TONE_MAPPINGS,
  DEFAULT_LOOK,
  LOOK_CONTROLS,
  LOOK_PRESETS,
  canvasFilter,
  parseLook,
  type AvatarShaderLook,
} from "./look/look";
import { LIL_TOON_PRESETS, LIL_TOON_PRESET_LABELS } from "./look/lilToonLook";

type LabWindow = Window & { __labReady?: boolean };
type Pane = { key: number; shader: string; look: AvatarShaderLook };

const MAX_PANES = 3;
const params = new URLSearchParams(location.search);
const capture = params.has("capture");
let nextKey = 0;

// Lets the capture script enumerate presets without duplicating them.
(window as unknown as { __labMeta: object }).__labMeta = {
  shaders: SHADERS.map(({ id, label }) => ({ id, label })),
  lights: LIGHTS.map(({ id, label }) => ({ id, label })),
  views: VIEWS.map(({ id, label }) => ({ id, label })),
  avatars: AVATARS.map(({ id, label }) => ({ id, label })),
};

function writeParam(key: string, value: string) {
  params.set(key, value);
  history.replaceState(null, "", `?${params}`);
}

function useParam(key: string, fallback: string) {
  const [value, setValue] = useState(params.get(key) ?? fallback);
  const update = (next: string) => {
    writeParam(key, next);
    setValue(next);
  };
  return [value, update] as const;
}

// `panes` holds [{shader, look}] as JSON; `shader` alone (the capture script) gives one default pane.
function readPanes(): Pane[] {
  try {
    const parsed = JSON.parse(params.get("panes") ?? "null");
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.slice(0, MAX_PANES).map((p) => ({ key: nextKey++, shader: String(p?.shader ?? SHADERS[0].id), look: parseLook(p?.look) }));
    }
  } catch {
    // Fall through to the default pane.
  }
  return [{ key: nextKey++, shader: params.get("shader") ?? SHADERS[0].id, look: { ...DEFAULT_LOOK } }];
}

// Orbiting one pane moves the others: the pane being dragged broadcasts its camera.
type CameraPose = { position: Vector3; target: Vector3 };
const cameraSync = {
  driver: null as number | null,
  listeners: new Map<number, (pose: CameraPose) => void>(),
  broadcast(from: number, pose: CameraPose) {
    for (const [key, listener] of this.listeners) if (key !== from) listener(pose);
  },
};

function CameraRig({ paneKey, vrm, view }: { paneKey: number; vrm: VRM | null; view: ViewPreset }) {
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

  useEffect(() => {
    if (!controls) return;
    cameraSync.listeners.set(paneKey, ({ position, target }) => {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      invalidate();
    });
    const onStart = () => (cameraSync.driver = paneKey);
    const onEnd = () => (cameraSync.driver = null);
    const onChange = () => {
      if (cameraSync.driver === paneKey) cameraSync.broadcast(paneKey, { position: camera.position, target: controls.target });
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    controls.addEventListener("change", onChange);
    return () => {
      cameraSync.listeners.delete(paneKey);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
    };
  }, [paneKey, camera, controls, invalidate]);

  return null;
}

// The pane's exposure and tone-mapping curve, for three's materials and lilToon's.
function RendererLook({ look, tone }: { look: AvatarShaderLook; tone: ToneUniforms }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = look.toneMapping === "neutral" ? NeutralToneMapping : ACESFilmicToneMapping;
    gl.toneMappingExposure = look.exposure;
    tone.exposure.value = look.exposure;
    tone.neutral.value = look.toneMapping === "neutral" ? 1 : 0;
  }, [gl, look.toneMapping, look.exposure, tone]);
  return null;
}

function PaneView({
  pane,
  avatarUrl,
  light,
  view,
  onChange,
  onRemove,
}: {
  pane: Pane;
  avatarUrl: string;
  light: LightPreset;
  view: ViewPreset;
  onChange: (changes: Partial<Pane>) => void;
  onRemove?: () => void;
}) {
  const shader = SHADERS.find((s) => s.id === pane.shader) ?? SHADERS[0];
  const { look } = pane;
  const [vrm, setVrm] = useState<VRM | null>(null);
  const onReady = useCallback((next: VRM) => setVrm(next), []);
  const tone = useMemo<ToneUniforms>(() => ({ exposure: { value: 1 }, neutral: { value: 0 } }), []);

  useEffect(() => setVrm(null), [shader, avatarUrl]);

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", borderLeft: "1px solid #0006" }}>
      {!capture && (
        <PaneSettings shader={shader.id} look={look} onChange={onChange} onRemove={onRemove} defaultOpen={!onRemove} />
      )}
      <div style={{ position: "absolute", inset: 0, filter: canvasFilter(look) }}>
        <Canvas gl={{ antialias: true, preserveDrawingBuffer: capture }} dpr={capture ? 1 : [1, 2]} camera={{ fov: 30, near: 0.05, far: 50 }}>
          <color attach="background" args={[BACKGROUND]} />
          <RendererLook look={look} tone={tone} />
          <ambientLight intensity={light.ambient * look.ambientLight} />
          {light.directional.map((d, i) => (
            // The first directional light is the key light.
            <directionalLight key={i} position={d.position} intensity={d.intensity * (i === 0 ? look.keyLight : 1)} color={d.color ?? "#ffffff"} />
          ))}
          {shader.CanvasExtras && <shader.CanvasExtras />}
          <Avatar url={avatarUrl} shader={shader} look={look} tone={tone} expression={params.get("expr") ?? undefined} onReady={onReady} />
          {!capture && <OrbitControls makeDefault />}
          <CameraRig paneKey={pane.key} vrm={vrm} view={view} />
        </Canvas>
      </div>
      {!vrm && !capture && <div style={{ position: "absolute", bottom: 12, right: 12, opacity: 0.7 }}>Loading…</div>}
    </div>
  );
}

function PaneSettings({
  shader,
  look,
  onChange,
  onRemove,
  defaultOpen,
}: {
  shader: string;
  look: AvatarShaderLook;
  onChange: (changes: Partial<Pane>) => void;
  onRemove?: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const setLook = (changes: Partial<AvatarShaderLook>) => onChange({ look: { ...look, ...changes } });
  return (
    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 1, width: 220, display: "grid", gap: 5, padding: 8, background: "#000b", fontSize: 12, borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select value={shader} onChange={(e) => onChange({ shader: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
          {SHADERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button onClick={() => setOpen(!open)} title={open ? "Hide settings" : "Show settings"}>
          {open ? "▴" : "▾"}
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove this canvas">
            ×
          </button>
        )}
      </div>
      {open && (
        <>
          <Buttons
            label="Look preset"
            options={LIL_TOON_PRESETS.map((id) => ({
              id,
              label: LIL_TOON_PRESET_LABELS[id],
              pressed: look.lilToonPreset === id,
              onClick: () => setLook(LOOK_PRESETS[id]),
            }))}
          />
          <Buttons
            label="Tone mapping"
            options={AVATAR_TONE_MAPPINGS.map((id) => ({
              id,
              label: id === "aces" ? "ACES" : "Neutral",
              pressed: look.toneMapping === id,
              onClick: () => setLook({ toneMapping: id }),
            }))}
          />
          <Buttons
            label="Canvas filters"
            options={[
              { id: "soft", label: "Soft grade", pressed: look.softGrade, onClick: () => setLook({ softGrade: !look.softGrade }) },
              { id: "glow", label: "Edge glow", pressed: look.edgeGlow, onClick: () => setLook({ edgeGlow: !look.edgeGlow }) },
            ]}
          />
          {LOOK_CONTROLS.map(({ key, label, min, max, step }) => {
            const inactive = shader === "mtoon" && (key === "shadow" || key === "rim" || key === "outline");
            return (
              <label key={key} style={{ display: "grid", gap: 2, opacity: inactive ? 0.4 : 1 }}>
                <span style={{ display: "flex", justifyContent: "space-between" }}>
                  {label}
                  <span style={{ color: "#c8c9d2", fontVariantNumeric: "tabular-nums" }}>{look[key].toFixed(2)}</span>
                </span>
                <input type="range" min={min} max={max} step={step} value={look[key]} disabled={inactive} onChange={(e) => setLook({ [key]: Number(e.target.value) })} />
              </label>
            );
          })}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onChange({ look: { ...DEFAULT_LOOK } })}>Reset look</button>
          </div>
          <div style={{ opacity: 0.6, fontSize: 11, lineHeight: 1.35 }}>
            As in Animama's debug panel: a preset sets the lilToon recipe plus lighting, tone mapping and filters. Shadow, rim and outline don't change default MToon.
          </div>
        </>
      )}
    </div>
  );
}

function Buttons({ label, options }: { label: string; options: { id: string; label: string; pressed: boolean; onClick: () => void }[] }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span>{label}</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o.id}
            aria-pressed={o.pressed}
            onClick={o.onClick}
            style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #fff3", background: o.pressed ? "#e8e8ee" : "transparent", color: o.pressed ? "#14151a" : "#e8e8ee" }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [avatarId, setAvatarId] = useParam("avatar", AVATARS[0].id);
  const [lightId, setLightId] = useParam("light", LIGHTS[0].id);
  const [viewId, setViewId] = useParam("view", "waist");
  const [panes, setPanes] = useState<Pane[]>(readPanes);

  const avatar = AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
  const light = LIGHTS.find((l) => l.id === lightId) ?? LIGHTS[0];
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];

  useEffect(() => {
    if (!capture) writeParam("panes", JSON.stringify(panes.map(({ shader, look }) => ({ shader, look }))));
  }, [panes]);

  const update = (key: number, changes: Partial<Pane>) => setPanes((ps) => ps.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  const add = () => setPanes((ps) => (ps.length >= MAX_PANES ? ps : [...ps, { ...ps[ps.length - 1], key: nextKey++ }]));
  const remove = (key: number) => setPanes((ps) => ps.filter((p) => p.key !== key));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {!capture && (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", background: "#14151a" }}>
          <strong>Toon Shader Lab</strong>
          <Select label="Avatar" value={avatar.id} options={AVATARS} onChange={setAvatarId} />
          <Select label="Light" value={light.id} options={LIGHTS} onChange={setLightId} />
          <Select label="View" value={view.id} options={VIEWS} onChange={setViewId} />
          <button onClick={add} disabled={panes.length >= MAX_PANES} title="Add a comparison canvas (copies the last one)">
            + Compare
          </button>
          <span style={{ opacity: 0.6 }}>Drag to orbit; all canvases follow.</span>
        </div>
      )}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {panes.map((pane) => (
          <PaneView
            key={pane.key}
            pane={pane}
            avatarUrl={avatar.url}
            light={light}
            view={view}
            onChange={(changes) => update(pane.key, changes)}
            onRemove={panes.length > 1 ? () => remove(pane.key) : undefined}
          />
        ))}
      </div>
    </div>
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
    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
