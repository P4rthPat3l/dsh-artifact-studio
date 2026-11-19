/**
 * Mermaid diagrams are not part of the whiteboard build. Excalidraw imports
 * this package lazily for text-to-diagram and paste; the stub keeps that code
 * out of the chunk and reports the missing feature instead of fetching it.
 */

export async function parseMermaidToExcalidraw(): Promise<never> {
  throw new Error('Mermaid diagrams are not available in this build.');
}

export async function mermaidToExcalidraw(): Promise<never> {
  throw new Error('Mermaid diagrams are not available in this build.');
}
