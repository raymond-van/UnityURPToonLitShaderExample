# Toon Shader Lab

A standalone three.js / r3f page for comparing toon shaders on a VRM avatar
(Annie, the VRoid `AvatarSample_A` preset) under fixed lights and camera views.
It uses the same three (0.182) and three-vrm (3.x) versions as Animama.

## Setup

```sh
npm install
# The avatar is not committed (VRoid preset terms). Copy it from an Animama checkout:
cp ../../animama/content/included/avatars/AvatarSample_A_1_New.vrm public/avatars/annie.vrm
npm run dev
```

Pick the shader, light and view from the panel; the URL keeps the selection
(`?shader=mtoon&light=side&view=face`).

## Screenshots

```sh
npm run capture                                  # every shader x light x view
npm run capture -- --shaders=mtoon --views=face  # filter with --shaders/--lights/--views
```

Shots land in `captures/<shader>/<light>-<view>.png`, plus one comparison sheet
per light (`captures/sheet-<light>.png`, rows = shaders). If Playwright's bundled
Chromium isn't installed, point `CHROMIUM_PATH` at a local Chromium.

## Adding a shader

Add an entry to `SHADERS` in `src/shaders/index.ts`. Its `apply(vrm)` receives
the loaded VRM and may replace or modify any material.

Lights live in `src/config.ts`; `animama` mirrors Animama's main avatar canvas.
