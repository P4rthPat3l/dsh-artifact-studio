/** The build replaces the WebGPU shader renderer; a design canvas does not draw shader paints. */
export function createRendererFromJSON(): never {
  throw new Error('Shader rendering is not bundled in the canvas.');
}
