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
  ) {}

  isMonitoring(id: string): boolean {
    return this.states.has(id);
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
      state.lastCommit = commit;
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
    this.log.info({ projectId: id, previousCommit: state.lastCommit, commit }, 'Git commit changed');
    state.lastCommit = commit;
    if (state.running) {
      state.dirty = true;
      return;
    }
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
    try {
      return await this.analyze(state.project, commit);
    } finally {
      state.running = false;
      if (state.dirty && this.states.get(state.project.id) === state) {
        state.dirty = false;
        void this.runAutomatic(state, state.lastCommit);
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
