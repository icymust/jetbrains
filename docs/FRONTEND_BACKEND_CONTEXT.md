# Frontend ↔ Backend Context

## Backend Overview

This local Node.js 26+ / TypeScript / Fastify backend runs on the same computer as the MVP frontend and the Git repositories it analyzes. It accepts a local repository root path, scans its source files, asks the configured AI provider for an architecture graph, and stores the public graph in `<repository>/ProjectMap.json`. After a successful initial analysis, it checks Git HEAD every second and regenerates the graph when a new commit appears.

## Frontend User Flow

Home → `GET /projects` → Add Project form (name and local repository root path) → `POST /projects` → use the returned `id` in `POST /projects/:id/load` → open graph → `GET /projects/:id/nodes`. `POST /projects` only saves project metadata; it does **not** analyze. For an existing project, open the graph with `GET /projects/:id/nodes`. Call `/load` when an initial analysis is needed (or explicitly requested), not on every graph page open.

## API Contract

Base URL by default: `http://127.0.0.1:3000`. JSON request bodies use `Content-Type: application/json`. Examples below use illustrative IDs and paths.

| Endpoint | Purpose and request | Success | Relevant errors |
| --- | --- | --- | --- |
| `GET /projects` | List projects in SQLite; no body. | `200 {"projects":[{"id":"p1","name":"Demo","path":"/absolute/repo"}]}`; empty database: `{"projects":[]}`. | No route-specific error response. |
| `POST /projects` | Save a project. Body: `{"name":"Demo","path":"/absolute/repo"}`. Path must exist, be a directory, and be inside a Git working tree. | `201 {"id":"p1","name":"Demo","path":"/canonical/absolute/repo"}`. | `400 {"error":"Project name must not be blank"}`, `{"error":"Project path must exist and be a directory"}`, or `{"error":"Project path must be a Git working tree"}`. Missing fields, wrong types, or extra fields also get Fastify's `400` validation response. |
| `GET /projects/:id` | Read one stored project; no body. | `200 {"id":"p1","name":"Demo","path":"/canonical/absolute/repo"}`. | `404 {"error":"Project not found"}`. |
| `POST /projects/:id/load` | Scan, analyze, validate, save `ProjectMap.json`, and begin in-process commit monitoring; no body. | `200 {"nodes":[{"id":"service-backend-...","name":"Backend","type":"service"}],"relations":[]}`. | `404 {"error":"Project not found"}`; `409 {"error":"Project analysis already running"}`; `500 {"error":"Project analysis failed"}` (for example, unavailable AI provider or invalid analysis). A failed analysis does not replace a valid existing map. |
| `GET /projects/:id/nodes` | Read the current `ProjectMap.json`; no body and no AI call. | `200 {"nodes":[{"id":"service-backend-...","name":"Backend","type":"service"}],"relations":[]}`. | `404 {"error":"Project not found"}` or `{"error":"Project map not loaded"}`; `409 {"error":"Project map belongs to another project"}`; `500 {"error":"Project map could not be read"}`. |

## Graph Data

The public graph is `{ "nodes": ProjectNode[], "relations": ProjectRelation[] }`:

```ts
type ProjectNode = { id: string; name: string; type: 'service' | 'feature' };
type ProjectRelation = { parent_id: string; child_id: string; label: string };
```

Render service nodes as major architecture components and feature nodes as smaller pieces of functionality. Draw each relation from `parent_id` to `child_id` and display its returned `label`. Labels can be `contains`, `HTTP`, `gRPC`, or other short text; there is no fixed label enum. Internal `evidence_paths` are not returned to the frontend. `ProjectMap.json` additionally stores `project_id`, `generated_at`, and optionally `commit`; these fields are not part of `/load` or `/nodes` responses.

## Important MVP Constraints

- Repositories are local Git working trees. The browser sends a path string that must refer to a repository accessible by the backend process. It does not upload files. GitHub URLs, cloning, and multi-repo projects are outside this MVP.
- AI analysis runs on `/load` and after detected Git HEAD changes. Uncommitted edits do not trigger it. `GET /nodes` only reads the last saved map.
- Commit monitoring is in process. After a backend restart, a saved map can still be read, but call `/load` to resume monitoring.

## Local Development

From the repository root, run `cd backend`, `npm install`, then `npm run dev`. The server binds to `127.0.0.1` on port `3000` by default (`PORT` overrides the port). SQLite defaults to `backend/.data/projects.sqlite` when started from `backend/` (`DATABASE_PATH` overrides it). Git must be installed. For `/load`, set `AI_PROVIDER=openai` and `OPENAI_API_KEY`, or `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`, in `backend/.env`; the corresponding `OPENAI_MODEL` or `ANTHROPIC_MODEL` is optional. Never put provider keys in frontend code.

The backend allows browser CORS requests from `http://localhost:<port>` and `http://127.0.0.1:<port>` for its GET and POST API calls, including POST preflight requests. Other origins receive no CORS permission. The backend does not configure a frontend proxy.

## What Frontend Should NOT Assume

Do not scan repositories or call AI from the frontend. Do not expect browser folder upload support, GitHub import, or endpoints beyond those listed here. Do not expose AI API keys in the browser.
