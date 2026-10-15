// Renders every shader x light x view combination and builds one comparison
// sheet per light (rows = shaders, columns = views).
//
//   npm run capture                       # everything
//   npm run capture -- --shaders=mtoon    # filter (also --lights=, --views=)
//   npm run capture -- --expr=happy       # set a VRM expression; files get a -happy suffix

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "captures");
const size = { width: 640, height: 800 };

const filters = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--") && a.includes("="))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, new Set(v.split(","))];
    }),
);
const expr = filters.expr ? [...filters.expr][0] : null;
const pick = (key, list) => (filters[key] ? list.filter((x) => filters[key].has(x.id)) : list);

if (!existsSync(join(root, "public/avatars/annie.vrm"))) {
  console.error("Missing public/avatars/annie.vrm (see README).");
  process.exit(1);
}

const server = await createServer({ root, logLevel: "error", server: { port: 5199, strictPort: true } });
await server.listen();
const base = "http://localhost:5199/";

const browser = await chromium.launch({
  // Use a preinstalled Chromium when Playwright's bundled one isn't downloaded.
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: size });
page.on("pageerror", (e) => console.error("page error:", e.message));

try {
  await page.goto(`${base}?capture`);
  const meta = await page.evaluate(() => window.__labMeta);
  const shaders = pick("shaders", meta.shaders);
  const lights = pick("lights", meta.lights);
  const views = pick("views", meta.views);

  for (const shader of shaders) {
    await mkdir(join(out, shader.id), { recursive: true });
    for (const light of lights) {
      for (const view of views) {
        await page.goto(`${base}?capture&shader=${shader.id}&light=${light.id}&view=${view.id}${expr ? `&expr=${expr}` : ""}`);
        await page.waitForFunction(() => window.__labReady || window.__labError, null, { timeout: 120_000 });
        const err = await page.evaluate(() => window.__labError);
        if (err) throw new Error(`${shader.id}/${light.id}/${view.id}: ${err}`);
        const file = join(out, shader.id, `${light.id}-${view.id}${expr ? `-${expr}` : ""}.png`);
        await page.locator("canvas").screenshot({ path: file });
        console.log("captured", file.replace(root + "/", ""));
      }
    }
  }

  // Comparison sheets, laid out in HTML and screenshotted.
  const cell = 220;
  for (const light of lights) {
    const rows = shaders
      .map(
        (s) =>
          `<tr><th>${s.label}</th>${views
            .map((v) => `<td><img src="file://${join(out, s.id, `${light.id}-${v.id}${expr ? `-${expr}` : ""}.png`)}"></td>`)
            .join("")}</tr>`,
      )
      .join("");
    const html = `<!doctype html><style>
      body{margin:0;padding:16px;background:#14151a;color:#e8e8ee;font:14px system-ui}
      h1{font-size:16px;margin:0 0 12px} table{border-collapse:collapse}
      th{padding:6px 10px;text-align:left;font-weight:600;width:150px} thead th{text-align:center;width:auto}
      td{padding:3px} img{width:${cell}px;height:${(cell * size.height) / size.width}px;display:block;border-radius:4px}
    </style><h1>Light: ${light.label}</h1><table><thead><tr><th></th>${views
      .map((v) => `<th>${v.label}</th>`)
      .join("")}</tr></thead><tbody>${rows}</tbody></table>`;
    const htmlPath = join(out, `sheet-${light.id}${expr ? `-${expr}` : ""}.html`);
    await writeFile(htmlPath, html);
    const sheet = await browser.newPage({ viewport: { width: 200 + views.length * (cell + 6) + 40, height: 400 } });
    await sheet.goto(`file://${htmlPath}`);
    await sheet.screenshot({ path: join(out, `sheet-${light.id}${expr ? `-${expr}` : ""}.png`), fullPage: true });
    await sheet.close();
    console.log("sheet", `captures/sheet-${light.id}${expr ? `-${expr}` : ""}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
