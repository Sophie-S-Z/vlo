/*
 * The appMeta key of a project's last image sweep. It has its own module with no imports, so the library
 * page can delete the key without loading Yjs and the image code at start.
 */

/** The key of the time of a project's last sweep, in `appMeta`. */
export function sweepKey(projectId: string): string {
  return `imageSweep:${projectId}`;
}

/** The key of the time when a sweep first found each image of a project unused, in `appMeta`. */
export function unusedKey(projectId: string): string {
  return `imageUnused:${projectId}`;
}
