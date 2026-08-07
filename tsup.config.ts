import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    bin: "src/cli/bin.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  dts: true,
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
