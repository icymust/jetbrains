import { readdir, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

/** Directories that only add noise when choosing a repository. */
const hiddenNames = new Set(['node_modules']);
const maxEntries = 500;

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export interface DirectoryListing {
  root: string;
  path: string;
  parent: string | null;
  isGitRepo: boolean;
  entries: DirectoryEntry[];
  truncated: boolean;
}

class BrowseError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'BrowseError';
  }
}

/** `.git` is a directory in a normal clone but a file in worktrees and submodules. */
async function isGitRepository(path: string): Promise<boolean> {
  try {
    await stat(join(path, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a requested path and refuses anything outside the root. Symlinks are resolved
 * before the comparison, so a link inside the root cannot be used to step out of it.
 */
function resolveWithinRoot(root: string, requested: string | undefined): string {
  if (!requested) return root;

  let path: string;
  try {
    path = realpathSync(resolve(requested));
  } catch {
    throw new BrowseError(404, 'Directory not found');
  }

  if (path !== root && !path.startsWith(root + sep)) {
    throw new BrowseError(400, 'Path is outside the browsable root');
  }
  return path;
}

async function listDirectories(root: string, path: string): Promise<DirectoryListing> {
  let found;
  try {
    if (!(await stat(path)).isDirectory()) throw new BrowseError(404, 'Directory not found');
    found = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error instanceof BrowseError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new BrowseError(404, 'Directory not found');
    throw new BrowseError(403, 'Directory could not be read');
  }

  // Symlinks are skipped for the same reason the scanner skips them: they invite cycles.
  const directories = found
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .filter((entry) => !entry.name.startsWith('.') && !hiddenNames.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const truncated = directories.length > maxEntries;
  const entries = await Promise.all(
    directories.slice(0, maxEntries).map(async (entry) => {
      const child = join(path, entry.name);
      return { name: entry.name, path: child, isGitRepo: await isGitRepository(child) };
    }),
  );

  return {
    root,
    path,
    parent: path === root ? null : dirname(path),
    isGitRepo: await isGitRepository(path),
    entries,
    truncated,
  };
}

/**
 * Read-only directory browsing for the repository picker. It reports directory names only —
 * never file contents — and cannot see outside `root`.
 */
export function registerBrowseRoutes(app: FastifyInstance, root: string = homedir()): void {
  const canonicalRoot = realpathSync(resolve(root));

  app.get<{ Querystring: { path?: string } }>('/directories', async (request, reply) => {
    try {
      const path = resolveWithinRoot(canonicalRoot, request.query.path);
      return await listDirectories(canonicalRoot, path);
    } catch (error) {
      if (error instanceof BrowseError) {
        return reply.code(error.status).send({ error: error.message });
      }
      app.log.error({ err: error }, 'Directory listing failed');
      return reply.code(500).send({ error: 'Directory could not be read' });
    }
  });
}
