import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { GraphRequester } from '../ai/openai-analyzer.js';
import { openDatabase } from '../db/db.js';
import type { ReadGitCommits } from '../git/commit-history.js';
import { registerProjectRoutes } from './project.routes.js';

function commit(repository: string, number: number, subject: string, author = 'Test Author'): string {
  writeFileSync(join(repository, 'history.txt'), String(number));
  execFileSync('git', ['add', 'history.txt'], { cwd: repository });
  const date = `2026-01-${String(number).padStart(2, '0')}T12:00:00+00:00`;
  execFileSync('git', [
    '-c', `user.name=${author}`, '-c', 'user.email=test@example.com',
    'commit', '-qm', subject, `--date=${date}`,
  ], { cwd: repository, env: { ...process.env, GIT_COMMITTER_DATE: date } });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

test('commit endpoint returns at most ten newest commits with machine-safe fields and does not analyze', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-commits-'));
  const repository = join(root, 'repository');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  const hashes: string[] = [];
  for (let number = 1; number <= 12; number++) {
    hashes.push(commit(repository, number, number === 12 ? 'latest: spaces & [special] #12' : `commit ${number}`));
  }

  let analyzerCalls = 0;
  const requester: GraphRequester = {
    async request() {
      analyzerCalls++;
      throw new Error('Analyzer must not be called');
    },
  };
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify();
  registerProjectRoutes(app, database, requester);
  app.addHook('onClose', async () => database.close());

  try {
    const created = await app.inject({
      method: 'POST', url: '/projects', payload: { name: 'Demo', path: repository },
    });
    const projectId = created.json().id as string;
    const response = await app.inject({ method: 'GET', url: `/projects/${projectId}/commits` });
    assert.equal(response.statusCode, 200);
    const commits = response.json().commits as Array<Record<string, string>>;
    assert.equal(commits.length, 10);
    assert.deepEqual(commits.map((item) => item.hash), hashes.slice(2).reverse());
    assert.equal(commits[0]?.short_hash, hashes[11]?.slice(0, commits[0].short_hash.length));
    assert.equal(commits[0]?.message, 'latest: spaces & [special] #12');
    assert.equal(commits[0]?.author, 'Test Author');
    assert.equal(commits[0]?.date, '2026-01-12T12:00:00.000Z');
    assert.equal(analyzerCalls, 0);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('commit endpoint returns every commit when the repository has fewer than ten', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-few-commits-'));
  const repository = join(root, 'repository');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  commit(repository, 1, 'first');
  commit(repository, 2, 'second');
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify();
  registerProjectRoutes(app, database);
  app.addHook('onClose', async () => database.close());

  try {
    const created = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Few', path: repository } });
    const response = await app.inject({ method: 'GET', url: `/projects/${created.json().id}/commits` });
    assert.deepEqual(response.json().commits.map((item: { message: string }) => item.message), ['second', 'first']);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('commit endpoint handles unknown projects and hides Git failures', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-commit-errors-'));
  const repository = join(root, 'repository');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  commit(repository, 1, 'first');
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify({ logger: false });
  let historyCalls = 0;
  const failingHistory: ReadGitCommits = async () => {
    historyCalls++;
    throw new Error('sensitive command details');
  };
  registerProjectRoutes(app, database, undefined, failingHistory);
  app.addHook('onClose', async () => database.close());

  try {
    const missing = await app.inject({ method: 'GET', url: '/projects/unknown/commits' });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: 'Project not found' });
    assert.equal(historyCalls, 0);

    const created = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Demo', path: repository } });
    const failed = await app.inject({ method: 'GET', url: `/projects/${created.json().id}/commits` });
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json(), { error: 'Git commit history could not be read' });
    assert.equal(failed.body.includes('sensitive command details'), false);
    assert.equal(historyCalls, 1);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('commit endpoint distinguishes missing and invalid stored repository paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'project-commit-path-errors-'));
  const missingRepository = join(root, 'missing-repository');
  const invalidRepository = join(root, 'invalid-repository');
  for (const repository of [missingRepository, invalidRepository]) {
    mkdirSync(repository);
    execFileSync('git', ['init', '-q', repository]);
  }
  const database = openDatabase(join(root, 'projects.sqlite'));
  const app = Fastify();
  registerProjectRoutes(app, database);
  app.addHook('onClose', async () => database.close());

  try {
    const missingProject = (await app.inject({
      method: 'POST', url: '/projects', payload: { name: 'Missing', path: missingRepository },
    })).json();
    const invalidProject = (await app.inject({
      method: 'POST', url: '/projects', payload: { name: 'Invalid', path: invalidRepository },
    })).json();
    rmSync(missingRepository, { recursive: true });
    rmSync(join(invalidRepository, '.git'), { recursive: true });

    const missing = await app.inject({ method: 'GET', url: `/projects/${missingProject.id}/commits` });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: 'Project repository not found' });

    const invalid = await app.inject({ method: 'GET', url: `/projects/${invalidProject.id}/commits` });
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(invalid.json(), { error: 'Project path is not a Git working tree' });
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
