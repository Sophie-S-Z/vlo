export interface LicenseRow {
  name: string;
  version: string;
  license: string;
  dev: boolean;
}
export declare const ALLOWED: Set<string>;
export declare function disallowed(rows: LicenseRow[]): LicenseRow[];
export declare function toMarkdown(rows: LicenseRow[]): string;
