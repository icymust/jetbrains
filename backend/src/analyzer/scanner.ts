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

function candidatePriority(path: string): number {
  const name = path.split('/').at(-1)!.toLowerCase();
  if (/^(package\.json|pyproject\.toml|pom\.xml|cargo\.toml|go\.mod|build\.gradle(?:\.kts)?|compose\.ya?ml|docker-compose\.ya?ml|makefile|\.gitmodules)$/.test(name) ||
      (!path.includes('/') && /^readme(?:\.[^.]+)?$/.test(name))) return 0;
  if (/(^|\/)(tests?|examples?|fixtures?|\.vscode|types|interfaces)(\/|$)/i.test(path) ||
      /(?:\.d\.[cm]?[jt]s|(?:ts|js)config\.json)$/.test(name)) return 6;
  if (/(^|[\/._-])(ws|websocket|grpc|socket)(?=$|[\/._-])/i.test(path) ||
      /connection/i.test(name)) return 2;
  if (/^(app|server|main|index|router|routes?)\.[^.]+$/.test(name)) return 1;
  if (/(^|\/)(domain|services)(\/|$)/i.test(path) || /service\.[^.]+$/.test(name)) return 3;
  if (/(^|\/)(api|routes|controllers|handlers)(\/|$)/i.test(path) ||
      /(route|controller|handler)\.[^.]+$/.test(name)) return 4;
  if (/(^|\/)(config|utils?|helpers?|middlewares?)(\/|$)/i.test(path) ||
      /^(config|utils?|helpers?|logger|middleware)\.[^.]+$/.test(name) ||
      /^(dev|run|test|generate)[-_]/.test(name)) return 6;
  if (/\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|c|cc|cpp|h|hpp|cs|rb|php|swift)$/.test(name)) return 5;
  return 6;
}

function candidateArea(path: string, priority: number): string {
  const parts = path.split('/');
  if (priority === 3 || priority === 4) {
    let marker = parts.findIndex((part) => /^(domain|services)$/i.test(part));
    if (priority === 4) {
      marker = -1;
      for (let index = 0; index < parts.length; index++) {
        if (/^(api|routes|controllers|.*handlers)$/i.test(parts[index]!)) marker = index;
      }
    }
    if (marker >= 0 && marker + 2 < parts.length) return parts[marker + 1]!;
  }
  if (priority !== 5) return '';
  const sourceParts = parts[0] === 'src' ? parts.slice(1) : parts[1] === 'src' ? parts.slice(2) : parts.slice(1);
  return sourceParts.length > 1 ? sourceParts[0]! : '';
}

function candidateRank(path: string, priority: number): number {
  const name = path.split('/').at(-1)!.toLowerCase();
  if (priority === 1) return /^router\./.test(name) ? 0 : 1;
  if (priority === 2) return /route/.test(name) ? 0 : /^ws\.|^websocket\./.test(name) ? 1 :
    /connection/.test(name) || /(^|\/)[^/]*handlers?\//i.test(path) ? 2 : 3;
  if (priority === 3) return /service\.[^.]+$/.test(name) ? 0 : /manager\.[^.]+$/.test(name) ? 1 : 2;
  if (priority === 4) return /(^|\/)(?:public|private)?handlers?\//i.test(path) ? 0 :
    /^(handler|rest)\.[^.]+$/.test(name) ? 2 : 1;
  return 0;
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
  const candidates = new Map<string, Array<{ path: string; relativePath: string; size: number }>>();
  let entriesSeen = 0;
  let bytesCollected = 0;

  // Discover breadth first so the entry cap cannot favor one deep subtree.
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]!;
    const entries = (await readdir(current.path, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (++entriesSeen > limits.maxEntries) {
        result.truncated = true;
        break;
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
      const group = relativePath.includes('/') ? relativePath.split('/')[0]! : '';
      if (!candidates.has(group)) candidates.set(group, []);
      candidates.get(group)!.push({ path, relativePath, size: (await stat(path)).size });
    }
    if (entriesSeen > limits.maxEntries) break;
  }

  const groups = [...candidates].sort(([left], [right]) => left.localeCompare(right));
  for (const [, files] of groups) {
    const buckets = new Map<string, typeof files>();
    for (const file of files) {
      const priority = candidatePriority(file.relativePath);
      const key = `${priority}:${candidateArea(file.relativePath, priority)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(file);
    }
    for (const [key, bucket] of buckets) {
      const priority = Number(key.split(':')[0]);
      bucket.sort((left, right) => candidateRank(left.relativePath, priority) - candidateRank(right.relativePath, priority) ||
        (priority === 4 ? left.size - right.size : 0) ||
        left.relativePath.split('/').length - right.relativePath.split('/').length ||
        left.relativePath.localeCompare(right.relativePath));
    }
    const queues = new Map<number, typeof files>();
    for (const priority of [0, 1, 2, 3, 4, 5, 6]) {
      const names = [...buckets.keys()].filter((key) => key.startsWith(`${priority}:`)).sort((left, right) =>
        candidateRank(buckets.get(left)![0]!.relativePath, priority) -
        candidateRank(buckets.get(right)![0]!.relativePath, priority) ||
        left.localeCompare(right));
      const queue: typeof files = [];
      let remaining = true;
      while (remaining) {
        remaining = false;
        for (const name of names) {
          const next = buckets.get(name)!.shift();
          if (next) {
            queue.push(next);
            remaining = true;
          }
        }
      }
      queues.set(priority, queue);
    }
    const ordered: typeof files = [];
    const pattern = [0, 1, 2, 3, 4, 2, 3, 1, 4, 5, 2, 5, 3, 4];
    while (pattern.some((priority) => queues.get(priority)!.length > 0)) {
      for (const priority of pattern) {
        const next = queues.get(priority)!.shift();
        if (next) ordered.push(next);
      }
    }
    ordered.push(...queues.get(6)!);
    files.splice(0, files.length, ...ordered);
  }
  const positions = new Map(groups.map(([group]) => [group, 0]));

  async function include(candidate: { path: string; relativePath: string; size: number }, allowance: number): Promise<void> {
    const fileSize = candidate.size;
    const allowed = Math.min(limits.maxFileBytes, allowance);
    const bytes = await readExcerpt(candidate.path, allowed);
    if (isBinary(bytes)) return;

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
    if (content === undefined) return;

    result.files.push({ path: candidate.relativePath, content, truncated: fileSize > bytes.length });
    bytesCollected += bytes.length;
  }

  const byteShare = Math.max(1, Math.floor(limits.maxTotalBytes / Math.max(groups.length, 1)));
  const fileShare = Math.max(1, Math.floor(limits.maxFiles / Math.max(groups.length, 1)));
  for (const [group, files] of groups) {
    const groupStartBytes = bytesCollected;
    const groupStartFiles = result.files.length;
    while (positions.get(group)! < files.length &&
           bytesCollected - groupStartBytes < byteShare &&
           result.files.length - groupStartFiles < fileShare &&
           bytesCollected < limits.maxTotalBytes && result.files.length < limits.maxFiles) {
      const position = positions.get(group)!;
      positions.set(group, position + 1);
      await include(files[position]!, Math.min(byteShare - (bytesCollected - groupStartBytes),
        limits.maxTotalBytes - bytesCollected));
    }
  }

  // Give unused shares to remaining candidates, one file per area per round.
  while (bytesCollected < limits.maxTotalBytes && result.files.length < limits.maxFiles) {
    let advanced = false;
    for (const [group, files] of groups) {
      const position = positions.get(group)!;
      if (position >= files.length) continue;
      if (candidatePriority(files[position]!.relativePath) === 6 &&
          groups.some(([otherGroup, otherFiles]) => {
            const next = positions.get(otherGroup)!;
            return next < otherFiles.length && candidatePriority(otherFiles[next]!.relativePath) < 6;
          })) continue;
      positions.set(group, position + 1);
      advanced = true;
      await include(files[position]!, limits.maxTotalBytes - bytesCollected);
      if (bytesCollected >= limits.maxTotalBytes || result.files.length >= limits.maxFiles) break;
    }
    if (!advanced) break;
  }
  if (groups.some(([group, files]) => positions.get(group)! < files.length)) result.truncated = true;

  return result;
}
