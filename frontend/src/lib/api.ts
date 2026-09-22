/**
 * Typed client for the local backend.
 * Contract: docs/FRONTEND_BACKEND_CONTEXT.md
 */

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'

export interface Project {
  id: string
  name: string
  path: string
}

export interface ProjectNode {
  id: string
  name: string
  type: 'service' | 'feature'
}

export interface ProjectRelation {
  parent_id: string
  child_id: string
  label: string
}

export interface Graph {
  nodes: ProjectNode[]
  relations: ProjectRelation[]
}

/** An error carrying the backend's own message, or 0 when the backend is unreachable. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  /** True when the request never reached the backend. */
  get isUnreachable(): boolean {
    return this.status === 0
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
    })
  } catch {
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE_URL}. Start it with "cd backend && npm run dev".`,
      0,
    )
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response, path), response.status)
  }

  return (await response.json()) as T
}

/** Fastify sends `{ error }` for our routes and `{ message }` for schema validation failures. */
async function readErrorMessage(response: Response, path: string): Promise<string> {
  const body = await response.text()

  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object') {
      const { error, message } = parsed as { error?: unknown; message?: unknown }
      if (typeof error === 'string' && error) return error
      if (typeof message === 'string' && message) return message
    }
  } catch {
    // Not JSON, so it did not come from our backend — say so below.
    return (
      `Got ${response.status} from ${API_BASE_URL}${path}, but the reply was not from the ` +
      `CodeOrbit backend. Check that the backend — and not another app — is serving ${API_BASE_URL}.`
    )
  }

  return `Request failed with status ${response.status}`
}

export async function listProjects(): Promise<Project[]> {
  const { projects } = await request<{ projects: Project[] }>('/projects')
  return projects
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${encodeURIComponent(id)}`)
}

/** Saves project metadata only — this does not analyze the repository. */
export async function createProject(name: string, path: string): Promise<Project> {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, path }),
  })
}

/** Scans, analyzes and writes ProjectMap.json. Slow: this makes a real AI call. */
export async function loadProject(id: string): Promise<Graph> {
  return request<Graph>(`/projects/${encodeURIComponent(id)}/load`, { method: 'POST' })
}

/** Reads the last saved map. No AI call. */
export async function getProjectNodes(id: string): Promise<Graph> {
  return request<Graph>(`/projects/${encodeURIComponent(id)}/nodes`)
}
