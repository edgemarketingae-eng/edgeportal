import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

/** File storage. Files are private: nothing here hands a public link to a browser. */
export interface StoredFile {
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
}

export interface FileRef {
  publicId: string;
  resourceType: string;
  format: string | null;
}

export interface FileStore {
  upload(input: { bytes: Uint8Array; folder: string; format: string }): Promise<StoredFile>;
  read(file: FileRef): Promise<Uint8Array>;
  delete(file: FileRef): Promise<void>;
}

/** Long enough for this server to fetch the file, and no longer. */
const DOWNLOAD_LINK_SECONDS = 60;

class CloudinaryFileStore implements FileStore {
  private config: { cloud_name: string; api_key: string; api_secret: string; secure: true };

  constructor(cfg: { cloudName: string; apiKey: string; apiSecret: string }) {
    this.config = { cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret, secure: true };
  }

  async upload(input: { bytes: Uint8Array; folder: string; format: string }): Promise<StoredFile> {
    cloudinary.config(this.config);
    const res = await new Promise<{ public_id: string; resource_type: string; format?: string; bytes: number }>((resolve, reject) => {
      // `folder` sets both the Console folder and the public id path, and works in fixed and dynamic folder mode.
      const stream = cloudinary.uploader.upload_stream(
        { folder: input.folder, type: "private", resource_type: "auto", use_filename: false, unique_filename: true },
        (err, out) => {
          if (err || !out) reject(new Error(`Cloudinary upload failed: ${err?.message ?? "no response"}`));
          else resolve(out);
        },
      );
      stream.end(Buffer.from(input.bytes));
    });
    return { publicId: res.public_id, resourceType: res.resource_type, format: res.format ?? input.format, bytes: res.bytes };
  }

  async read(file: FileRef): Promise<Uint8Array> {
    cloudinary.config(this.config);
    const url = cloudinary.utils.private_download_url(file.publicId, file.format ?? "", {
      resource_type: file.resourceType,
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_SECONDS,
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Cloudinary download failed (${res.status}): ${res.headers.get("x-cld-error") ?? ""}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(file: FileRef) {
    cloudinary.config(this.config);
    await cloudinary.uploader.destroy(file.publicId, { type: "private", resource_type: file.resourceType, invalidate: true });
  }
}

/** Keeps files in memory for tests and local development. */
export class MockFileStore implements FileStore {
  files = new Map<string, Uint8Array>();

  async upload(input: { bytes: Uint8Array; folder: string; format: string }): Promise<StoredFile> {
    const publicId = `${input.folder}/${randomUUID()}`;
    this.files.set(publicId, input.bytes);
    return { publicId, resourceType: "image", format: input.format, bytes: input.bytes.length };
  }

  async read(file: FileRef) {
    const bytes = this.files.get(file.publicId);
    if (!bytes) throw new Error(`Mock file not found: ${file.publicId}`);
    return bytes;
  }

  async delete(file: FileRef) {
    this.files.delete(file.publicId);
  }
}

export function createFileStore(cfg: {
  mode: "mock" | "sandbox" | "live";
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}): FileStore {
  if (cfg.mode === "mock") return new MockFileStore();
  if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret)
    throw new Error("STORAGE_MODE needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET");
  return new CloudinaryFileStore({ cloudName: cfg.cloudName, apiKey: cfg.apiKey, apiSecret: cfg.apiSecret });
}
