export interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
export declare const BUDGET_BYTES: number;
export declare function initialChunks(manifest: Record<string, ManifestChunk>, entry: string): string[];
