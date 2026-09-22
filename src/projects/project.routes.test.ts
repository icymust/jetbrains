import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { openDatabase } from '../db/db.js';
import { registerProjectRoutes } from './project.routes.js';

test('projects persist and invalid paths are rejected', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'project-routes-'));
  const repository = join(temporary, 'repository');
  const databasePath = join(temporary, 'projects.sqlite');
  mkdirSync(repository);
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(temporary, 'file.txt'), 'text');

  async function startApp() {
    const database = openDatabase(databasePath);
    const app = Fastify();
    registerProjectRoutes(app, database);
    app.addHook('onClose', async () => database.close());
    return app;
  }

  try {
    const app = await startApp();
    const emptyList = await app.inject({ method: 'GET', url: '/projects' });
    assert.equal(emptyList.statusCode, 200);
    assert.deepEqual(emptyList.json(), { projects: [] });
    for (const path of [join(temporary, 'missing'), join(temporary, 'file.txt'), temporary]) {
      const response = await app.inject({ method: 'POST', url: '/projects', payload: { name: 'Bad', path } });
      assert.equal(response.statusCode, 400);
    }

    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Demo', path: repository },
    });
    assert.equal(created.statusCode, 201);
    const project = created.json();
    assert.deepEqual(Object.keys(project).sort(), ['id', 'name', 'path']);
    assert.equal(project.name, 'Demo');
    assert.equal(project.path, realpathSync(repository));
    const list = await app.inject({ method: 'GET', url: '/projects' });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json(), { projects: [project] });
    await app.close();

    const restartedApp = await startApp();
    const retrieved = await restartedApp.inject({ method: 'GET', url: `/projects/${project.id}` });
    assert.equal(retrieved.statusCode, 200);
    assert.deepEqual(retrieved.json(), project);
    const persistedList = await restartedApp.inject({ method: 'GET', url: '/projects' });
    assert.deepEqual(persistedList.json(), { projects: [project] });
    const missing = await restartedApp.inject({ method: 'GET', url: '/projects/unknown' });
    assert.equal(missing.statusCode, 404);
    await restartedApp.close();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
