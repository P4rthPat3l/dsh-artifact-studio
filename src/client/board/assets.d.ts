/** The Excalidraw package ships CSS; the build loads it as text. */
declare module '*.css' {
  const content: string;
  export default content;
}
