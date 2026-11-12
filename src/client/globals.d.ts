/** The bundle wrapper installs this bridge before the plugin body runs. */
declare global {
  var __dshArtifactsRequireAsync: (<T>(path: string) => Promise<T>) | undefined;
}

export {};
