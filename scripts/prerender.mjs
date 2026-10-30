// Writes the server-rendered landing page into dist/index.html (spec section 18.4).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_TAG = '<div id="root"></div>';

const { render } = await import(pathToFileURL(resolve("build-meta/ssr/entry-server.js")).href);
const file = resolve("dist/index.html");
const template = readFileSync(file, "utf8");
if (!template.includes(ROOT_TAG))
  throw new Error("prerender: empty #root not found in dist/index.html");

// React 19 renders <title> in place; index.html already has the landing title in <head>.
const html = (await render("/")).replace(/<title>[^<]*<\/title>/g, "");
if (!html.includes("Write the book only you can write.")) {
  throw new Error("prerender: the landing headline is missing from the rendered HTML");
}
writeFileSync(file, template.replace(ROOT_TAG, `<div id="root">${html}</div>`));
console.log(`Prerendered / into dist/index.html (${html.length} characters).`);
