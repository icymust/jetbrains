# Backend MVP Brief for Codex

## Goal

Build the **minimum backend MVP** for the hackathon.

Do not implement the full future architecture yet. The backend only
needs to:

1.  Create and read a project.
2.  Accept a **local path to the project/repository folder**.
3.  Analyze that folder.
4.  Generate graph nodes and relations.
5.  Save the generated map into a `ProjectMap` file in the repository
    root.
6.  Return the graph through API endpoints.
7.  Check the repository's latest Git commit every second.
8.  If the commit changes, re-analyze the project and update the graph.

The frontend is out of scope.

------------------------------------------------------------------------

# 1. MVP Stack

Use:

-   Node.js
-   TypeScript
-   Fastify
-   SQLite
-   OpenAI API
-   Node.js `child_process` for Git commands

Keep dependencies and architecture simple.

Do NOT add Redis, queues, Docker infrastructure, vector databases,
WebSockets, microservices, or other infrastructure unless absolutely
necessary.

------------------------------------------------------------------------

# 2. Product Concept

The application visualizes a software project as a graph.

There are only two node types in the MVP:

``` ts
type NodeType = "service" | "feature";
```

### Service

A large architectural/application component.

Examples:

-   Backend
-   Frontend
-   Payment Service

### Feature

Functionality belonging to a service.

Examples:

-   Authentication
-   User Management
-   Orders
-   Payments

Relations connect nodes.

Example:

``` text
Backend
   |
   +-- Authentication
   |
   +-- User Management
   |
   +-- Orders
```

Graph representation:

``` json
{
  "nodes": [
    {
      "id": "backend",
      "name": "Backend",
      "type": "service"
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "type": "feature"
    }
  ],
  "relations": [
    {
      "parent_id": "backend",
      "child_id": "authentication"
    }
  ]
}
```

------------------------------------------------------------------------

# 3. Required Data Models

## Project

For MVP:

``` ts
interface Project {
  id: string;
  name: string;
  path: string;
}
```

Fields:

-   `id`
-   `name`
-   `path` - absolute or validated local path to the repository/project
    folder

Store projects in SQLite.

------------------------------------------------------------------------

## Node

``` ts
interface ProjectNode {
  id: string;
  name: string;
  type: "service" | "feature";
}
```

Only these fields are required for MVP.

Additional internal metadata may be stored if useful, but do not make
the public contract unnecessarily complicated.

------------------------------------------------------------------------

## Relation

``` ts
interface ProjectRelation {
  parent_id: string;
  child_id: string;
}
```

A relation means:

``` text
parent node -> child node
```

Typical example:

``` text
Backend -> Authentication
```

------------------------------------------------------------------------

## Project Map

``` ts
interface ProjectMap {
  project_id: string;
  commit?: string;
  generated_at: string;
  nodes: ProjectNode[];
  relations: ProjectRelation[];
}
```

------------------------------------------------------------------------

# 4. Required API Endpoints

The exact URL naming can be adjusted slightly, but keep the behavior
below.

## Create Project

``` text
POST /projects
```

Request:

``` json
{
  "name": "Example Project",
  "path": "/Users/example/projects/my-project"
}
```

Backend must:

1.  validate the path;
2.  make sure the folder exists;
3.  preferably verify it is a Git repository;
4.  create an ID;
5.  save the project to SQLite;
6.  return the created project.

Example response:

``` json
{
  "id": "project-123",
  "name": "Example Project",
  "path": "/Users/example/projects/my-project"
}
```

Project creation itself does not need to block while full AI analysis
runs.

------------------------------------------------------------------------

## Read Project

``` text
GET /projects/:projectId
```

Return:

``` json
{
  "id": "project-123",
  "name": "Example Project",
  "path": "/Users/example/projects/my-project"
}
```

------------------------------------------------------------------------

## Read Nodes / Current Map

Required endpoint:

``` text
GET /projects/:projectId/nodes
```

Recommended response:

``` json
{
  "nodes": [
    {
      "id": "backend",
      "name": "Backend",
      "type": "service"
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "type": "feature"
    }
  ],
  "relations": [
    {
      "parent_id": "backend",
      "child_id": "authentication"
    }
  ]
}
```

It is acceptable internally to call this a graph/map endpoint, but the
MVP must provide a way to read the list of nodes and relations.

------------------------------------------------------------------------

## Load / Analyze Project

Required endpoint:

``` text
POST /projects/:projectId/load
```

This is the central MVP endpoint.

When called:

``` text
Read project
      ↓
Scan project folder
      ↓
Collect useful project information
      ↓
Analyze project
      ↓
Detect services + features
      ↓
Generate relations
      ↓
Create ProjectMap
      ↓
Save ProjectMap file
      ↓
Return nodes + relations
```

Example response:

``` json
{
  "nodes": [
    {
      "id": "backend",
      "name": "Backend",
      "type": "service"
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "type": "feature"
    }
  ],
  "relations": [
    {
      "parent_id": "backend",
      "child_id": "authentication"
    }
  ]
}
```

For the hackathon MVP, this endpoint may wait until analysis finishes
and then return the result. A background job system is not required.

------------------------------------------------------------------------

# 5. ProjectMap File

After analysis, save the generated graph into the root directory of the
analyzed repository.

Recommended filename:

``` text
ProjectMap.json
```

Example:

``` text
my-project/
├── src/
├── package.json
├── .git/
└── ProjectMap.json
```

Example contents:

``` json
{
  "project_id": "project-123",
  "commit": "abc123...",
  "generated_at": "2026-09-22T10:00:00.000Z",
  "nodes": [
    {
      "id": "backend",
      "name": "Backend",
      "type": "service"
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "type": "feature"
    }
  ],
  "relations": [
    {
      "parent_id": "backend",
      "child_id": "authentication"
    }
  ]
}
```

Use atomic file replacement where practical so the frontend/backend does
not read a partially written JSON file.

Add `ProjectMap.json` to the analyzer's ignore list so it never analyzes
its own generated output.

------------------------------------------------------------------------

# 6. Project Analysis

This is the most important part of the MVP.

Do NOT attempt to build a perfect compiler or full dependency graph.

The objective is simply:

``` text
project code
     ↓
services
features
relations
```

Use two stages.

## Stage A: Local Scanner

Scan the repository and collect compact information.

Collect things such as:

-   folder structure;
-   source file paths;
-   package manifests;
-   README if useful;
-   class/function names when easy to extract;
-   API routes when easy to detect;
-   imports when useful.

Ignore:

``` text
.git
node_modules
dist
build
coverage
.next
out
target
vendor
ProjectMap.json
```

Do not send binaries to OpenAI.

Do not send dependency directories.

Set sensible file-size and total-input limits.

------------------------------------------------------------------------

# 7. OpenAI Analysis

Use the provided OpenAI API key for semantic analysis.

Environment variable:

``` text
OPENAI_API_KEY=
```

Never hard-code or commit the key.

The local scanner should first reduce the repository into useful
information.

Then send that information to OpenAI.

The model's task:

> Based only on the supplied repository evidence, identify the main
> services and user/developer-facing features of the project and
> describe parent-child relations between them.

Require structured output matching approximately:

``` json
{
  "nodes": [
    {
      "id": "backend",
      "name": "Backend",
      "type": "service"
    },
    {
      "id": "auth",
      "name": "Authentication",
      "type": "feature"
    }
  ],
  "relations": [
    {
      "parent_id": "backend",
      "child_id": "auth"
    }
  ]
}
```

Validate AI output before saving it.

Rules:

-   node IDs must be unique;
-   type must be `service` or `feature`;
-   every relation must reference existing node IDs;
-   duplicate relations should be removed;
-   empty/invalid output should not overwrite a previously valid map;
-   do not allow the model to invent arbitrary fields into the persisted
    public schema.

Prefer stable IDs derived from stable identifiers/names instead of
random IDs for graph nodes where possible. This reduces visual churn
between refreshes.

------------------------------------------------------------------------

# 8. Git Commit Monitoring

This is REQUIRED for MVP.

For every active/loaded project, the system checks the newest Git commit
every second.

Use a command equivalent to:

``` text
git rev-parse HEAD
```

Execute it with the project directory as the working directory.

Do not construct shell commands by concatenating untrusted project
paths. Use safe process arguments and `cwd`.

Maintain the last known commit for each monitored project.

Logic:

``` text
Every 1 second
       ↓
git rev-parse HEAD
       ↓
current commit
       ↓
compare with cached commit
       ↓
same?
 ├── YES → do nothing
 │
 └── NO
      ↓
 update cached commit
      ↓
 re-analyze project
      ↓
 update ProjectMap.json
```

Important:

Only one analysis may run for a project at a time.

If another commit is detected while analysis is running, mark the
project as dirty and run analysis again once the current analysis
finishes.

Do not start overlapping OpenAI requests for the same project.

------------------------------------------------------------------------

# 9. Important Git Limitation

The required MVP specification says to monitor the latest Git commit
every second.

Therefore the MVP detects **committed changes**.

It does NOT automatically detect ordinary uncommitted file edits unless
additional file watching is implemented.

Do not add filesystem watching until the required commit-based MVP
works.

This behavior should be documented clearly.

------------------------------------------------------------------------

# 10. Monitoring Lifecycle

Start monitoring after a project has successfully been loaded/analyzed.

For MVP it is acceptable for monitoring to live in the Node.js process.

Example:

``` ts
Map<projectId, MonitorState>
```

State can contain:

``` ts
interface MonitorState {
  lastCommit: string | null;
  analysisRunning: boolean;
  dirty: boolean;
}
```

When the server shuts down, clear timers cleanly.

If the server restarts, projects remain in SQLite. It is acceptable
either to resume monitoring persisted projects automatically or to
resume after the next `/load` call. Prefer the simpler reliable option
for the hackathon.

------------------------------------------------------------------------

# 11. Suggested Minimal Folder Structure

Do not over-engineer.

``` text
src/
├── server.ts
├── config.ts
│
├── db/
│   ├── db.ts
│   └── projects.ts
│
├── projects/
│   ├── project.routes.ts
│   └── project.service.ts
│
├── analyzer/
│   ├── scanner.ts
│   ├── analyzer.ts
│   └── types.ts
│
├── ai/
│   └── openai-analyzer.ts
│
├── map/
│   ├── project-map.ts
│   └── project-map-file.ts
│
└── git/
    └── commit-monitor.ts
```

This is enough for the MVP.

------------------------------------------------------------------------

# 12. Implementation Order

Codex should implement the backend in this exact general order.

## Step 1: Project Setup

Create:

-   Node.js project;
-   TypeScript;
-   Fastify;
-   environment configuration;
-   SQLite.

Make sure the server starts.

------------------------------------------------------------------------

## Step 2: Project Storage

Implement:

``` text
POST /projects
GET /projects/:id
```

SQLite table only needs approximately:

``` text
projects
--------
id
name
path
```

Validate the folder path.

Definition of done:

A project can be created and retrieved after restarting the server.

------------------------------------------------------------------------

## Step 3: Project Scanner

Implement:

``` ts
scanProject(path)
```

It should:

-   recursively inspect files;
-   ignore dependency/build/git folders;
-   collect relevant text/source files;
-   produce a compact analysis input.

Definition of done:

Given a repository path, scanner returns useful project information
without `node_modules` or `.git`.

------------------------------------------------------------------------

## Step 4: OpenAI Analyzer

Implement:

``` ts
analyzeProject(scanResult): Promise<ProjectMap>
```

OpenAI should convert scanner information into:

``` text
nodes
relations
```

Validate output.

Definition of done:

A test repository produces at least a service node and sensible feature
nodes.

------------------------------------------------------------------------

## Step 5: ProjectMap File

Implement:

``` ts
saveProjectMap(projectPath, map)
readProjectMap(projectPath)
```

Save:

``` text
<ProjectRoot>/ProjectMap.json
```

Definition of done:

Running analysis creates valid JSON in the repository root.

------------------------------------------------------------------------

## Step 6: Load Endpoint

Implement:

``` text
POST /projects/:id/load
```

Pipeline:

``` text
Project DB
   ↓
Scanner
   ↓
OpenAI
   ↓
Validate
   ↓
ProjectMap.json
   ↓
Response
```

Return:

``` json
{
  "nodes": [],
  "relations": []
}
```

Definition of done:

One HTTP request can analyze a real local repository and return a graph.

------------------------------------------------------------------------

## Step 7: Nodes Endpoint

Implement:

``` text
GET /projects/:id/nodes
```

Read the current `ProjectMap.json` and return nodes + relations.

If no map exists, return an appropriate empty/not-loaded response.

------------------------------------------------------------------------

## Step 8: Git Monitor

After successful `/load`:

1.  get `git rev-parse HEAD`;
2.  cache it;
3.  start a 1-second interval;
4.  compare HEAD every second;
5.  if HEAD changes, trigger analysis;
6.  replace `ProjectMap.json`;
7.  prevent concurrent analyses.

Definition of done:

``` text
load project
↓
commit code change
↓
within ~1 second backend notices new HEAD
↓
project is re-analyzed
↓
ProjectMap.json changes
```

------------------------------------------------------------------------

# 13. MVP API Summary

Only these endpoints are necessary initially:

``` text
POST /projects
GET  /projects/:id

POST /projects/:id/load

GET  /projects/:id/nodes
```

Do not build a large API surface before these work.

------------------------------------------------------------------------

# 14. MVP Acceptance Scenario

The backend is considered demo-ready when this works:

### 1

Start server.

### 2

Create project:

``` http
POST /projects
```

``` json
{
  "name": "Demo Backend",
  "path": "/local/path/to/demo-repo"
}
```

### 3

Load project:

``` http
POST /projects/:id/load
```

Backend:

``` text
scans repository
→ sends compact information to OpenAI
→ receives services/features
→ creates relations
→ saves ProjectMap.json
→ returns graph
```

### 4

Frontend requests:

``` http
GET /projects/:id/nodes
```

and receives:

``` text
service nodes
feature nodes
relations
```

### 5

Developer or AI agent changes the repository and creates a Git commit.

### 6

Backend detects that `git rev-parse HEAD` changed.

### 7

Backend automatically repeats analysis.

### 8

`ProjectMap.json` and `/nodes` now expose the updated graph.

If this flow works reliably, STOP adding infrastructure and polish the
demo.

------------------------------------------------------------------------

# 15. Explicitly Out of Scope Until MVP Works

Do NOT prioritize:

-   GitHub URL cloning;
-   multiple repositories per project;
-   filesystem watcher;
-   uncommitted change detection;
-   WebSockets;
-   SSE;
-   Redis;
-   queues;
-   PostgreSQL;
-   vector database;
-   embeddings;
-   authentication;
-   cloud deployment;
-   deep AST analysis;
-   support for every language;
-   automatic test generation;
-   performance audit;
-   "make connection A to B";
-   AI chat integration;
-   node-level AI context;
-   incremental per-file graph updates;
-   complicated caching.

These are future features.

------------------------------------------------------------------------

# 16. Future Features

After the MVP works, possible additions include:

``` text
Multiple repositories
GitHub repository URLs
Frontend ↔ Backend API relationship detection
Node → AI Chat context
Make Tests
Performance Audit
Manual connection A → B
Uncommitted file watching
Incremental analysis
More programming languages
```

Do not allow these to delay the required MVP.

------------------------------------------------------------------------

# 17. Engineering Rules for Codex

While implementing:

1.  Use strict TypeScript.
2.  Keep code understandable rather than overly abstract.
3.  Never hard-code `OPENAI_API_KEY`.
4.  Validate all paths received from API.
5.  Use safe Git process execution with `cwd`.
6.  Validate OpenAI structured output.
7.  Never analyze `.git`, dependencies or generated `ProjectMap.json`.
8.  Never run two analyses simultaneously for the same project.
9.  Preserve the last valid map if a refresh fails.
10. Log project analysis start, completion and errors.
11. Log commit changes.
12. Return useful HTTP errors.
13. Add a few focused tests around graph validation and Git monitoring.
14. Do not introduce features that are not required for the MVP until
    the acceptance scenario works.

------------------------------------------------------------------------

# 18. Core Mental Model

Keep the implementation centered around this pipeline:

``` text
Project
(id, name, path)
       ↓
Repository Scanner
       ↓
Compact code/project information
       ↓
OpenAI Analyzer
       ↓
Nodes + Relations
       ↓
ProjectMap.json
       ↓
REST API
```

And continuously:

``` text
git rev-parse HEAD every second
             ↓
        commit changed?
             ↓ YES
       run pipeline again
```

That is the backend MVP.

Implement this reliable end-to-end flow first. Do not expand the scope
until it works.
