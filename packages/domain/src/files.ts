/** Stored files are grouped by app module, then by area: each pair is a storage folder, e.g. hr/leave. */
export const FILE_AREAS = { hr: ["leave", "requests", "letters", "documents"] } as const;
export type FileModule = keyof typeof FILE_AREAS;
export type FileArea<M extends FileModule = FileModule> = (typeof FILE_AREAS)[M][number];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = "JPG, PNG or PDF";
/** For file pickers. The server checks the actual bytes (`detectFileType`), never this. */
export const FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export function isFileArea(module: string, area: string): boolean {
  return (FILE_AREAS as Record<string, readonly string[]>)[module]?.includes(area) ?? false;
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** The real type of a file from its first bytes: a renamed file doesn't pass. */
export function detectFileType(b: Uint8Array): { contentType: string; format: string } | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", format: "jpg" };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", format: "png" };
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { contentType: "application/pdf", format: "pdf" };
  return null;
}
