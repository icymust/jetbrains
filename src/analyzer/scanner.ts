import { open, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ignoredDirectories = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next',
  'out', 'target', 'vendor', '.data',
]);
const ignoredFiles = new Set([
  'ProjectMap.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'Cargo.lock', 'poetry.lock', 'uv.lock',
]);
const ignoredExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip',
  '.gz', '.sqlite', '.db', '.woff', '.woff2', '.ttf', '.exe', '.class',
  '.pem', '.key', '.p12', '.pfx',
]);

export interface ScanFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface ScanResult {
  directories: string[];
  files: ScanFile[];
  truncated: boolean;
}

export interface ScanLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  maxEntries: number;
  maxDepth: number;
}

export const defaultScanLimits: ScanLimits = {
  maxFileBytes: 32 * 1024,
  maxTotalBytes: 128 * 1024,
  maxFiles: 200,
  maxEntries: 5000,
  maxDepth: 25,
};

function isIgnored(name: string, directory: boolean): boolean {
  if (directory) return ignoredDirectories.has(name);
  if (ignoredFiles.has(name) || name.startsWith('.ProjectMap.json.') ||
      name === '.env' || name.startsWith('.env.') || name === 'id_rsa') return true;
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  return ignoredExtensions.has(extension);
}

function isBinary(bytes: Buffer): boolean {
  for (const byte of bytes) {
    if (byte === 0 || (byte < 9 || (byte > 13 && byte < 32))) return true;
  }
  return false;
}

async function readExcerpt(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function scanProject(
  root: string,
  limits: ScanLimits = defaultScanLimits,
): Promise<ScanResult> {
  const result: ScanResult = { directories: [], files: [], truncated: false };
  const pending: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  let entriesSeen = 0;
  let bytesCollected = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = (await readdir(current.path, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (++entriesSeen > limits.maxEntries) {
        result.truncated = true;
        return result;
      }
      if (entry.isSymbolicLink()) continue;
      const path = join(current.path, entry.name);
      const relativePath = relative(root, path).split(sep).join('/');

      if (entry.isDirectory()) {
        if (isIgnored(entry.name, true)) continue;
        if (current.depth >= limits.maxDepth) {
          result.truncated = true;
          continue;
        }
        result.directories.push(relativePath);
        pending.push({ path, depth: current.depth + 1 });
        continue;
      }

      if (!entry.isFile() || isIgnored(entry.name, false)) continue;
      if (result.files.length >= limits.maxFiles || bytesCollected >= limits.maxTotalBytes) {
        result.truncated = true;
        return result;
      }

      const fileSize = (await stat(path)).size;
      const allowed = Math.min(limits.maxFileBytes, limits.maxTotalBytes - bytesCollected);
      const bytes = await readExcerpt(path, allowed);
      if (isBinary(bytes)) continue;

      let content: string | undefined;
      // A bounded excerpt may end in the middle of one UTF-8 character.
      const maxTrim = fileSize > bytes.length ? Math.min(3, bytes.length - 1) : 0;
      for (let trim = 0; trim <= maxTrim; trim++) {
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - trim));
          break;
        } catch {
          // Try dropping one more trailing byte.
        }
      }
      if (content === undefined) continue;

      result.files.push({ path: relativePath, content, truncated: fileSize > bytes.length });
      bytesCollected += bytes.length;
    }
  }

  return result;
}
