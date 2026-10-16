/**
 * `?url` imports, as Vite resolves them. The server program only meets them
 * through the font face manifest, which the emoji test (22.6) reads to render
 * with exactly the range the export uses.
 */
declare module "*?url" {
  const url: string;
  export default url;
}
