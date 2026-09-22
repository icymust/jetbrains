import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectNode, ProjectRelation } from '../analyzer/types.js';

const execFileAsync = promisify(execFile);

export interface MonitoredProject {
  id: string;
  path: string;
}

export type Graph = { nodes: ProjectNode[]; relations: ProjectRelation[] };
export type Analyze = (project: MonitoredProject, commit: string | null) => Promise<Graph>;
export type ReadHead = (path: string) => Promise<string | null>;

export async function readGitHead(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: path, timeout: 5000,
    });
    return stdout.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException & { code?: number }).code !== 128) throw error;
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: path, timeout: 5000,
    });
    if (stdout.trim() === 'true') return null;
    throw error;
  }
}

interface MonitorState {
  project: MonitoredProject;
  lastCommit: string | null;
  analyzingCommit?: string | null;
  failedCommit?: string | null;
  retryAfter?: number;
  running: boolean;
  dirty: boolean;
  checking: boolean;
  timer?: NodeJS.Timeout;
}

export class AnalysisBusyError extends Error {
  constructor() {
    super('Project analysis already running');
  }
}

export class CommitMonitor {
  private readonly states = new Map<string, MonitorState>();
  private readonly loadsInProgress = new Set<string>();
  private stopped = false;

  constructor(
    private readonly analyze: Analyze,
    private readonly log: {
      info(data: object, message: string): void;
      error(data: object, message: string): void;
    },
    private readonly readHead: ReadHead = readGitHead,
    private readonly intervalMs = 1000,
    private readonly now: () => number = Date.now,
    private readonly retryCooldownMs = 30_000,
  ) {}

  isMonitoring(id: string): boolean {
    return this.states.has(id);
  }

  restore(project: MonitoredProject, savedCommit: string | null): void {
    if (this.stopped) throw new Error('Commit monitor is stopped');
    if (this.states.has(project.id)) return;
    const state: MonitorState = {
      project, lastCommit: savedCommit, running: false, dirty: false, checking: false,
    };
    this.states.set(project.id, state);
    state.timer = setInterval(() => { void this.checkNow(project.id); }, this.intervalMs);
    void this.checkNow(project.id);
  }

  async load(project: MonitoredProject): Promise<Graph> {
    if (this.stopped) throw new Error('Commit monitor is stopped');
    const existing = this.states.get(project.id);
    if (existing?.running || this.loadsInProgress.has(project.id)) throw new AnalysisBusyError();
    this.loadsInProgress.add(project.id);
    try {
      const commit = await this.readHead(project.path);
      if (existing?.running) throw new AnalysisBusyError();
      const state = existing ?? {
        project, lastCommit: commit, running: false, dirty: false, checking: false,
      };
      state.project = project;
      const graph = await this.run(state, commit);

      if (!existing && !this.stopped) {
        this.states.set(project.id, state);
        state.timer = setInterval(() => { void this.checkNow(project.id); }, this.intervalMs);
      }
      return graph;
    } finally {
      this.loadsInProgress.delete(project.id);
    }
  }

  async checkNow(id: string): Promise<void> {
    const state = this.states.get(id);
    if (!state || state.checking) return;
    state.checking = true;
    let commit: string | null;
    try {
      commit = await this.readHead(state.project.path);
    } catch (error) {
      this.log.error({ projectId: id, err: error }, 'Git HEAD check failed');
      return;
    } finally {
      state.checking = false;
    }
    if (this.states.get(id) !== state || commit === state.lastCommit) return;
    if (state.running) {
      if (commit !== state.analyzingCommit) state.dirty = true;
      return;
    }
    if (commit === state.failedCommit && this.now() < (state.retryAfter ?? 0)) return;
    this.log.info({ projectId: id, previousCommit: state.lastCommit, commit }, 'Git commit changed');
    await this.runAutomatic(state, commit);
  }

  stopAll(): void {
    this.stopped = true;
    for (const state of this.states.values()) {
      if (state.timer) clearInterval(state.timer);
    }
    this.states.clear();
    this.loadsInProgress.clear();
  }

  private async run(state: MonitorState, commit: string | null): Promise<Graph> {
    state.running = true;
    state.analyzingCommit = commit;
    try {
      const graph = await this.analyze(state.project, commit);
      state.lastCommit = commit;
      state.failedCommit = undefined;
      state.retryAfter = undefined;
      return graph;
    } catch (error) {
      state.failedCommit = commit;
      state.retryAfter = this.now() + this.retryCooldownMs;
      throw error;
    } finally {
      state.running = false;
      state.analyzingCommit = undefined;
      if (state.dirty && this.states.get(state.project.id) === state) {
        state.dirty = false;
        void this.checkNow(state.project.id);
      }
    }
  }

  private async runAutomatic(state: MonitorState, commit: string | null): Promise<void> {
    try {
      await this.run(state, commit);
    } catch (error) {
      this.log.error({ projectId: state.project.id, err: error }, 'Automatic project analysis failed');
    }
  }
}
