import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveProjectMap } from '../map/project-map-file.js';
import { CommitMonitor, readGitHead, type Graph, type MonitoredProject } from './commit-monitor.js';

const project: MonitoredProject = { id: 'demo', path: '/unused-in-mocked-tests' };
const graph: Graph = { nodes: [{ id: 'backend', name: 'Backend', type: 'service' }], relations: [] };
const log = { info() {}, error() {} };

test('unchanged HEAD does nothing; changed HEAD analyzes and failure keeps the last map', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commit-monitor-'));
  let head: string | null = 'commit-a';
  let calls = 0;
  let fail = false;
  let now = 0;
  const monitor = new CommitMonitor(async (_project, commit) => {
    calls++;
    if (fail) throw new Error('Mock analysis failure');
    await saveProjectMap(root, {
      project_id: project.id, ...(commit ? { commit } : {}),
      generated_at: new Date().toISOString(), ...graph,
    });
    return graph;
  }, log, async () => head, 1000, () => now);
  try {
    await monitor.load(project);
    assert.equal(monitor.isMonitoring(project.id), true);
    const file = join(root, 'ProjectMap.json');
    await monitor.checkNow(project.id);
    assert.equal(calls, 1);

    head = 'commit-b';
    await monitor.checkNow(project.id);
    assert.equal(calls, 2);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).commit, 'commit-b');

    const previous = readFileSync(file, 'utf8');
    fail = true;
    head = 'commit-c';
    await monitor.checkNow(project.id);
    assert.equal(calls, 3);
    assert.equal(readFileSync(file, 'utf8'), previous);
    fail = false;
    await monitor.checkNow(project.id);
    assert.equal(calls, 3);
    now = 29_999;
    await monitor.checkNow(project.id);
    assert.equal(calls, 3);
    now = 30_000;
    await monitor.checkNow(project.id);
    assert.equal(calls, 4);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).commit, 'commit-c');
    head = 'commit-d';
    await monitor.checkNow(project.id);
    assert.equal(calls, 5);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).commit, 'commit-d');
  } finally {
    monitor.stopAll();
    rmSync(root, { recursive: true, force: true });
  }
});

test('overlapping commit changes run one analysis at a time and process the latest commit', async () => {
  let head = 'commit-a';
  let running = 0;
  let maximumRunning = 0;
  const analyzed: Array<string | null> = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let signalFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => { signalFirst = resolve; });
  let signalLatest!: () => void;
  const latestDone = new Promise<void>((resolve) => { signalLatest = resolve; });
  const monitor = new CommitMonitor(async (_project, commit) => {
    running++;
    maximumRunning = Math.max(maximumRunning, running);
    analyzed.push(commit);
    if (commit === 'commit-b') {
      signalFirst();
      await firstBlocked;
    }
    running--;
    if (commit === 'commit-c') signalLatest();
    return graph;
  }, log, async () => head);
  try {
    await monitor.load(project);
    head = 'commit-b';
    const firstCheck = monitor.checkNow(project.id);
    await firstStarted;
    head = 'commit-c';
    await monitor.checkNow(project.id);
    assert.equal(maximumRunning, 1);
    releaseFirst();
    await firstCheck;
    await latestDone;
    assert.deepEqual(analyzed, ['commit-a', 'commit-b', 'commit-c']);
    assert.equal(maximumRunning, 1);
  } finally {
    releaseFirst();
    monitor.stopAll();
  }
});

test('monitor timers stop cleanly', async () => {
  let checks = 0;
  const monitor = new CommitMonitor(async () => graph, log, async () => {
    checks++;
    return 'commit-a';
  }, 10);
  await monitor.load(project);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.ok(checks > 1);
  monitor.stopAll();
  assert.equal(monitor.isMonitoring(project.id), false);
  const afterStop = checks;
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(checks, afterStop);
});

test('Git HEAD returns null for a repository without a commit, then reads its first commit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'git-head-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    assert.equal(await readGitHead(root), null);
    writeFileSync(join(root, 'README.md'), 'demo');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'first'], { cwd: root });
    assert.match((await readGitHead(root))!, /^[0-9a-f]{40,64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
