// Fixed scene presets so screenshots are comparable across shaders.

export type LightPreset = {
  id: string;
  label: string;
  ambient: number;
  directional: { position: [number, number, number]; intensity: number; color?: string }[];
};

export const LIGHTS: LightPreset[] = [
  {
    // Mirrors DEFAULT_SCENE_LIGHTS in Animama's main avatar canvas.
    id: "animama",
    label: "Animama default",
    ambient: 0.7,
    directional: [{ position: [3, 4, 2], intensity: 1.1 }],
  },
  {
    id: "side",
    label: "Side key",
    ambient: 0.35,
    directional: [{ position: [-4, 2.5, 0.5], intensity: 2.2 }],
  },
  {
    id: "rim",
    label: "Backlit",
    ambient: 0.45,
    directional: [
      { position: [1, 3, 4], intensity: 0.6 },
      { position: [-2, 3, -4], intensity: 2.4, color: "#ffd9b0" },
    ],
  },
  {
    // Three-point setup for a portrait (waist-up) camera: warm key front-right
    // and above, cool fill front-left plus ambient, and a rim from behind-left
    // at ~45% of the key, kept weaker than the key so it stays a rim.
    id: "portrait",
    label: "Three-point portrait",
    ambient: 0.5,
    directional: [
      { position: [1.6, 2.4, 2.6], intensity: 1.3, color: "#fff3e6" },
      { position: [-2.5, 1, 2], intensity: 0.35, color: "#e6ecff" },
      { position: [-1.5, 2.5, -3], intensity: 0.6, color: "#ffffff" },
    ],
  },
];

export type ViewPreset = {
  id: string;
  label: string;
  // Offsets from the head bone (target) and camera position, in metres.
  target: [number, number, number];
  camera: [number, number, number];
  fov: number;
};

export const VIEWS: ViewPreset[] = [
  { id: "full", label: "Full body", target: [0, -0.62, 0], camera: [0, -0.5, 2.9], fov: 32 },
  // Animama's "portrait" camera preset: head height, 1.6 m back, FOV 35.
  { id: "waist", label: "Waist up (Animama)", target: [0, -0.1, 0], camera: [0, 0, 1.6], fov: 35 },
  { id: "bust", label: "Bust 3/4", target: [0, -0.18, 0], camera: [0.6, -0.02, 1.4], fov: 30 },
  { id: "face", label: "Face", target: [0, 0.04, 0], camera: [0, 0.06, 0.62], fov: 28 },
  { id: "profile", label: "Face profile", target: [0, 0.03, 0], camera: [0.5, 0.06, 0.38], fov: 28 },
  { id: "back", label: "Back 3/4", target: [0, -0.1, 0], camera: [-0.7, 0.05, -0.9], fov: 32 },
];

export const BACKGROUND = "#c9ccd6";
