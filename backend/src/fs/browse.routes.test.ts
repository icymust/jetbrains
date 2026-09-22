import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { registerBrowseRoutes } from './browse.routes.js';
import type { DirectoryListing } from './browse.routes.js';

test('browsing lists directories, marks Git repositories, and stays inside the root', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'browse-routes-')));
  const projects = join(root, 'projects');
  const repository = join(projects, 'repository');
  const plain = join(projects, 'plain');

  mkdirSync(repository, { recursive: true });
  mkdirSync(plain);
  mkdirSync(join(projects, '.hidden'));
  mkdirSync(join(projects, 'node_modules'));
  writeFileSync(join(projects, 'notes.txt'), 'text');
  execFileSync('git', ['init', '-q', repository]);

  const app = Fastify();
  registerBrowseRoutes(app, root);

  try {
    const atRoot = await app.inject({ method: 'GET', url: '/directories' });
    assert.equal(atRoot.statusCode, 200);
    const rootListing = atRoot.json() as DirectoryListing;
    assert.equal(rootListing.path, root);
    assert.equal(rootListing.parent, null, 'the root has no parent to walk up to');
    assert.deepEqual(
      rootListing.entries.map((entry) => entry.name),
      ['projects'],
    );

    const inProjects = await app.inject({
      method: 'GET',
      url: `/directories?path=${encodeURIComponent(projects)}`,
    });
    assert.equal(inProjects.statusCode, 200);
    const listing = inProjects.json() as DirectoryListing;
    assert.equal(listing.parent, root);
    assert.equal(listing.isGitRepo, false);
    assert.deepEqual(
      listing.entries.map((entry) => entry.name),
      ['plain', 'repository'],
      'dot-directories, node_modules and plain files are left out',
    );
    assert.equal(listing.entries.find((entry) => entry.name === 'repository')?.isGitRepo, true);
    assert.equal(listing.entries.find((entry) => entry.name === 'plain')?.isGitRepo, false);

    const inRepository = await app.inject({
      method: 'GET',
      url: `/directories?path=${encodeURIComponent(repository)}`,
    });
    assert.equal((inRepository.json() as DirectoryListing).isGitRepo, true);

    // A worktree or submodule keeps .git as a file, so detection must not demand a directory.
    const submodule = join(projects, 'submodule');
    mkdirSync(submodule);
    writeFileSync(join(submodule, '.git'), 'gitdir: ../repository/.git/modules/submodule');
    const withSubmodule = await app.inject({
      method: 'GET',
      url: `/directories?path=${encodeURIComponent(projects)}`,
    });
    assert.equal(
      (withSubmodule.json() as DirectoryListing).entries.find((e) => e.name === 'submodule')
        ?.isGitRepo,
      true,
    );

    for (const outside of [join(root, '..'), '/etc', tmpdir()]) {
      const refused = await app.inject({
        method: 'GET',
        url: `/directories?path=${encodeURIComponent(outside)}`,
      });
      assert.equal(refused.statusCode, 400, `${outside} must not be browsable`);
      assert.match((refused.json() as { error: string }).error, /outside/i);
    }

    const missing = await app.inject({
      method: 'GET',
      url: `/directories?path=${encodeURIComponent(join(root, 'nope'))}`,
    });
    assert.equal(missing.statusCode, 404);

    const notADirectory = await app.inject({
      method: 'GET',
      url: `/directories?path=${encodeURIComponent(join(projects, 'notes.txt'))}`,
    });
    assert.equal(notADirectory.statusCode, 404);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
