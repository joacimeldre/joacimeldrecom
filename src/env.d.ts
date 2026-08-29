/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// hls.js ships no types for its subpath builds; the light build has the same public API.
declare module "hls.js/dist/hls.light.mjs" {
  export * from "hls.js";
  export { default } from "hls.js";
}
