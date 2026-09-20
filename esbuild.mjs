import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info"
};

const extension = {
  ...shared,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"]
};

const webview = {
  ...shared,
  entryPoints: ["src/webview/main.ts"],
  outdir: "dist/webview",
  platform: "browser",
  format: "iife",
  target: ["es2022"],
  loader: {
    ".woff2": "file",
    ".woff": "file",
    ".ttf": "file",
    ".eot": "file"
  },
  assetNames: "assets/[name]-[hash]"
};

if (watch) {
  const extensionContext = await esbuild.context(extension);
  const webviewContext = await esbuild.context(webview);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log("Watching Inkglow extension and webview bundles…");
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
