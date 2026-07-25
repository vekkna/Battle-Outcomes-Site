import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");
const assetFiles = [
  { route: "/", file: "index.html", type: "text/html; charset=utf-8" },
  { route: "/index.html", file: "index.html", type: "text/html; charset=utf-8" },
  { route: "/styles.css", file: "styles.css", type: "text/css; charset=utf-8" },
  { route: "/app.js", file: "app.js", type: "text/javascript; charset=utf-8" }
];

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

const assets = [];
for (const asset of assetFiles) {
  const body = await readFile(join(root, asset.file), "utf8");
  assets.push([asset.route, { body, type: asset.type }]);
  if (asset.route !== "/") await copyFile(join(root, asset.file), join(client, asset.file));
}

const worker = `const assets = new Map(${JSON.stringify(assets)});

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const route = url.pathname.endsWith("/") ? "/" : url.pathname;
    const asset = assets.get(route);
    if (!asset) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return new Response(asset.body, {
      headers: {
        "content-type": asset.type,
        "cache-control": route === "/" || route === "/index.html"
          ? "no-cache"
          : "public, max-age=3600"
      }
    });
  }
};
`;

await writeFile(join(server, "index.js"), worker, "utf8");
