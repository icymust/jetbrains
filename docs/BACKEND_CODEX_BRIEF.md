# Backend Implementation Brief for Codex

## 1. Product Summary

We are building a web application that visualizes the architecture and
functionality of software projects as an interactive graph.

The product is designed for modern development workflows where
developers and AI coding agents generate and modify large amounts of
code. As projects grow, developers can lose a clear understanding of
what services exist, what functionality they provide, and how different
parts of the system interact.

The backend is responsible for turning one or more source-code
repositories/folders into a structured architecture graph.

The frontend is out of scope for this document.

### Core concept

The graph contains:

-   **Service nodes**: large nodes representing
    applications/services/repositories or major architectural
    components.
-   **Feature nodes**: smaller nodes representing functionality such as
    Authentication, User Management, Orders, Payments, Notifications,
    etc.
-   **Connections/edges**: relationships between services and features,
    including cross-service API calls and dependencies.

Example:

``` text
Frontend
├── Authentication
├── User Profile
└── Orders
        │
        │ HTTP API
        ↓
Backend
├── Authentication
├── User Management
└── Order Management
        │
        ↓
Database
```

The application should support multiple repositories/folders belonging
to the same project.

Example:

``` text
Project
├── frontend repository
├── backend repository
├── payments repository
└── notifications repository
```

The backend analyzes all sources and produces one unified graph.

## 2. Backend Responsibilities

The backend must:

1.  Create and read project instances.
2.  Attach one or more local repository/folder sources to a project.
3.  Scan repository structures.
4.  Ignore irrelevant/generated/vendor files.
5.  Extract useful facts from source code.
6.  Detect services/applications.
7.  Detect API endpoints and external/internal API calls.
8.  Detect classes, functions, modules and dependencies when useful.
9.  Use OpenAI to convert low-level code facts into higher-level product
    features.
10. Determine relationships between features and services.
11. Build a normalized graph containing nodes and edges.
12. Store the latest graph and analysis metadata.
13. Expose the graph through an HTTP API.
14. Watch project sources for changes.
15. Re-analyze affected parts after changes rather than rebuilding
    everything when possible.
16. expose enough source references so a graph node can later be used as
    AI chat context.
17. Support backend actions requested from graph nodes in later phases,
    such as tests, performance audits, and creating connections.

## 3. Recommended Stack

Use TypeScript throughout the backend.

### Runtime

-   Node.js
-   TypeScript

### HTTP server

-   Fastify

Reasons:

-   lightweight;
-   fast startup;
-   good TypeScript support;
-   schema-based APIs;
-   suitable for a hackathon MVP.

### Database

Start with:

-   SQLite

Recommended ORM:

-   Prisma or Drizzle ORM.

The database is local and does not need complex infrastructure for the
MVP.

### Code parsing

Use a combination of:

-   filesystem scanning;
-   Tree-sitter where structural parsing is needed;
-   TypeScript Compiler API or ts-morph for JS/TS repositories if
    useful;
-   lightweight framework-specific detectors.

Do NOT send an entire repository blindly to an LLM.

Static analysis should first extract compact facts.

### AI

Use the OpenAI API.

The OpenAI integration should primarily perform semantic architecture
analysis:

-   group low-level code components into features;
-   name features;
-   describe features;
-   identify likely relationships;
-   summarize responsibilities;
-   help infer architecture that static analysis alone cannot reliably
    identify.

Require structured JSON output that can be validated before being
stored.

Keep the OpenAI integration behind an interface so models/configuration
can be changed without rewriting the analyzer.

### File watching

Use:

-   chokidar

Watch only relevant project files and debounce bursts of changes.

## 4. High-Level Architecture

``` text
Repositories / Local folders
              │
              ▼
       Repository Scanner
              │
              ▼
       Static Analyzer
              │
     ┌────────┼─────────┐
     ▼        ▼         ▼
  Imports   APIs     Symbols
     │        │         │
     └────────┼─────────┘
              ▼
       Analysis Snapshot
              │
              ▼
        OpenAI Analyzer
              │
              ▼
         Graph Builder
              │
       ┌──────┴──────┐
       ▼             ▼
     SQLite        REST API
       ▲
       │
   File Watcher
       │
 changed files
       └──────> incremental analysis
```

## 5. Important Design Principle

Separate **facts** from **AI interpretation**.

Static analysis should produce facts such as:

``` json
{
  "file": "src/auth/AuthController.ts",
  "symbols": ["AuthController"],
  "imports": ["JwtService", "UserRepository"],
  "endpoints": [
    {
      "method": "POST",
      "path": "/login"
    }
  ]
}
```

The AI layer can interpret those facts as:

``` json
{
  "name": "Authentication",
  "type": "feature",
  "description": "Authenticates users and manages access tokens",
  "components": [
    "AuthController",
    "JwtService",
    "UserRepository"
  ]
}
```

This distinction is important because it makes the system more
deterministic, debuggable and cheaper.

## 6. Core Domain Models

### Project

``` ts
interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### ProjectSource

A project can contain multiple repositories/folders.

``` ts
interface ProjectSource {
  id: string;
  projectId: string;
  name: string;
  path: string;
  type: "local";
}
```

Git repository URLs can be added later. For the initial MVP, a local
path is enough if that matches the hackathon environment.

### GraphNode

``` ts
type GraphNodeType =
  | "service"
  | "feature"
  | "api"
  | "component";

interface GraphNode {
  id: string;
  projectId: string;
  sourceId?: string;

  type: GraphNodeType;

  name: string;
  description?: string;

  parentId?: string;

  sourceFiles: string[];

  metadata?: Record<string, unknown>;
}
```

For the MVP, the frontend mainly needs `service` and `feature`.

`api` and `component` allow deeper expansion later.

### GraphEdge

``` ts
type GraphEdgeType =
  | "contains"
  | "calls"
  | "depends_on"
  | "communicates_with"
  | "data_flow";

interface GraphEdge {
  id: string;
  projectId: string;

  source: string;
  target: string;

  type: GraphEdgeType;

  metadata?: Record<string, unknown>;
}
```

## 7. Suggested API

Exact naming may change during implementation.

### Projects

``` text
POST   /projects
GET    /projects
GET    /projects/:projectId
DELETE /projects/:projectId
```

Example project creation:

``` json
{
  "name": "My Application"
}
```

### Sources

``` text
POST   /projects/:projectId/sources
GET    /projects/:projectId/sources
DELETE /projects/:projectId/sources/:sourceId
```

Example:

``` json
{
  "name": "backend",
  "path": "/projects/my-app/backend"
}
```

Multiple sources can belong to one project.

### Analysis

``` text
POST /projects/:projectId/analyze
GET  /projects/:projectId/analysis/status
```

Analysis should run asynchronously from the request.

Possible states:

``` text
idle
queued
scanning
static_analysis
ai_analysis
building_graph
completed
failed
```

Return progress/status so the frontend loader can display meaningful
messages.

### Graph

``` text
GET /projects/:projectId/graph
```

Example response:

``` json
{
  "nodes": [
    {
      "id": "backend",
      "type": "service",
      "name": "Backend",
      "sourceFiles": []
    },
    {
      "id": "authentication",
      "type": "feature",
      "name": "Authentication",
      "parentId": "backend",
      "sourceFiles": [
        "src/auth/AuthController.ts",
        "src/auth/JwtService.ts"
      ]
    }
  ],
  "edges": [
    {
      "id": "backend-authentication",
      "source": "backend",
      "target": "authentication",
      "type": "contains"
    }
  ]
}
```

### Node context

Eventually:

``` text
GET /projects/:projectId/nodes/:nodeId/context
```

This should return the source files/symbols/code references required to
use a selected graph node as AI chat context.

## 8. Scanner

The scanner walks each project source and creates an inventory.

It should collect:

-   relative file paths;
-   extensions;
-   project manifests;
-   package/module names;
-   source directories;
-   configuration files.

Ignore common irrelevant directories:

``` text
node_modules
.git
.idea
dist
build
coverage
.next
out
target
vendor
```

Also respect `.gitignore` where practical.

Do not load binary files.

Set limits on:

-   individual file size;
-   total files analyzed;
-   total text passed to AI.

## 9. Static Analyzer

The static analyzer converts source files into structured facts.

Start with JS/TS support for the MVP if time is limited.

Extract where possible:

-   imports;
-   exports;
-   classes;
-   functions;
-   methods;
-   routes;
-   HTTP methods;
-   API paths;
-   HTTP client calls;
-   module relationships;
-   package dependencies.

Example:

``` ts
interface FileAnalysis {
  path: string;

  imports: string[];

  symbols: {
    name: string;
    kind: "class" | "function" | "method" | "interface";
  }[];

  endpoints: {
    method: string;
    path: string;
  }[];

  apiCalls: {
    method?: string;
    path?: string;
    target?: string;
  }[];
}
```

Do not try to solve every programming language during the hackathon.

Design analyzers behind interfaces so more languages can be added later.

## 10. Service Detection

Initially use repository/folder boundaries as the strongest service
boundary.

For example:

``` text
project
├── frontend
├── backend
└── payments
```

can become:

``` text
Frontend
Backend
Payments
```

Additional signals can include:

-   `package.json`;
-   application entrypoints;
-   Dockerfiles;
-   docker-compose;
-   framework configuration;
-   package/module boundaries.

Do not make service detection unnecessarily complex for the first MVP.

## 11. Feature Detection with OpenAI

This is one of the most important backend features.

Static analysis produces facts.

The AI receives a compact representation such as:

``` text
Source: backend

Files:
src/auth/AuthController.ts
src/auth/JwtService.ts
src/users/UserRepository.ts

Endpoints:
POST /login
POST /refresh
POST /logout

Dependencies:
AuthController -> JwtService
JwtService -> UserRepository
```

Ask the model to identify product-level features.

Expected structured result:

``` json
{
  "features": [
    {
      "id": "authentication",
      "name": "Authentication",
      "description": "Handles login, logout and token lifecycle.",
      "files": [
        "src/auth/AuthController.ts",
        "src/auth/JwtService.ts"
      ],
      "confidence": 0.93
    }
  ]
}
```

The application should validate the returned structure.

Never assume arbitrary model output is valid.

## 12. Detecting Cross-Service Connections

This is a major differentiator of the product.

Example:

Frontend contains:

``` text
GET /api/users/:id
```

Backend exposes:

``` text
GET /api/users/:id
```

The backend analyzer should attempt to match these.

Potential signals:

-   HTTP method;
-   normalized route;
-   URL/path;
-   imported SDK/client;
-   service hostname/environment variable;
-   message queue topic;
-   shared schema;
-   static dependency.

This can produce:

``` text
Frontend/User Profile
        │
        │ GET /api/users/:id
        ▼
Backend/User Management
```

Start with simple HTTP route matching.

AI can help when static matching is ambiguous, but deterministic
matching should be preferred when possible.

## 13. Graph Builder

The Graph Builder receives:

-   detected services;
-   AI-generated features;
-   static dependencies;
-   API connections.

It produces normalized `nodes` and `edges`.

Requirements:

-   IDs must be stable across re-analysis when the underlying entity did
    not change.
-   Avoid duplicate features.
-   Every feature should normally belong to a service.
-   Store source file references for every feature where possible.
-   Connections should include evidence in metadata.

Example edge:

``` json
{
  "source": "frontend-user-profile",
  "target": "backend-user-management",
  "type": "calls",
  "metadata": {
    "method": "GET",
    "path": "/api/users/:id"
  }
}
```

## 14. Automatic Updates

The product requirement says that when an AI coding task modifies the
project, the map should update automatically.

For the MVP, implement this generically through filesystem watching.

Use `chokidar`.

Flow:

``` text
File changes
     ↓
Watcher
     ↓
debounce
     ↓
Determine affected files
     ↓
Static re-analysis
     ↓
AI re-analysis if semantic feature data may have changed
     ↓
Graph update
```

Do not immediately re-run analysis for every filesystem event.

Debounce changes because coding agents may modify many files in seconds.

Initially, it is acceptable to rebuild the complete graph after a
debounced change if incremental analysis becomes too complex.

Correctness is more important than premature optimization during the
hackathon.

## 15. OpenAI Integration

Create a dedicated module:

``` text
src/ai/
├── OpenAIClient.ts
├── FeatureAnalyzer.ts
├── prompts/
└── schemas/
```

Environment variable:

``` text
OPENAI_API_KEY=
```

Never hard-code API keys.

The AI module should expose domain-level methods, not generic chat
calls.

Example:

``` ts
interface ArchitectureAI {
  detectFeatures(input: ArchitectureSnapshot): Promise<DetectedFeature[]>;

  analyzeRelationships(
    input: RelationshipAnalysisInput
  ): Promise<DetectedRelationship[]>;
}
```

Prompts should ask for structured output.

Keep prompts versioned in source control.

## 16. Context for AI Chat

A key product feature is:

> Click a graph node and add it to AI chat.

Therefore each feature node must retain traceability back to code.

Example:

``` json
{
  "id": "authentication",
  "sourceFiles": [
    "src/auth/AuthController.ts",
    "src/auth/JwtService.ts"
  ],
  "symbols": [
    "AuthController",
    "JwtService"
  ]
}
```

Later, `GET /nodes/:id/context` can assemble only the relevant code
instead of sending the whole repository.

This is important to design correctly from the beginning.

## 17. Long-Press Actions

The planned UI contains actions such as:

-   Make Tests
-   Performance Audit
-   Make a connection from A to B

The first backend MVP does NOT need to fully implement these.

However, design nodes so these actions can later operate on their
associated source files/symbols.

Possible future API:

``` text
POST /projects/:projectId/nodes/:nodeId/actions/tests
POST /projects/:projectId/nodes/:nodeId/actions/performance-audit
POST /projects/:projectId/connections
```

Do not prioritize this before repository analysis and graph generation
work reliably.

## 18. Suggested Project Structure

``` text
src/
├── app.ts
├── server.ts
│
├── config/
│   └── env.ts
│
├── db/
│   ├── client.ts
│   └── schema/
│
├── projects/
│   ├── project.routes.ts
│   ├── project.service.ts
│   └── project.repository.ts
│
├── sources/
│   ├── source.routes.ts
│   └── source.service.ts
│
├── scanner/
│   ├── scanner.ts
│   ├── ignore.ts
│   └── types.ts
│
├── analyzers/
│   ├── analyzer.ts
│   ├── typescript/
│   ├── api/
│   └── dependencies/
│
├── ai/
│   ├── openai.client.ts
│   ├── feature-analyzer.ts
│   ├── relationship-analyzer.ts
│   ├── prompts/
│   └── schemas/
│
├── graph/
│   ├── graph-builder.ts
│   ├── graph.service.ts
│   └── graph.types.ts
│
├── watcher/
│   └── project-watcher.ts
│
└── common/
    ├── errors/
    ├── logger/
    └── utils/
```

## 19. Implementation Sequence

Codex should implement the backend incrementally.

### Phase 1: Foundation

Goal: running backend with persistent projects.

Tasks:

1.  Initialize Node.js + TypeScript project.
2.  Configure linting/formatting.
3.  Add Fastify.
4.  Add environment configuration.
5.  Add SQLite.
6.  Add ORM/schema.
7.  Implement Project model.
8.  Implement ProjectSource model.
9.  Implement project CRUD.
10. Implement source CRUD.
11. Add basic error handling and logging.

Definition of done:

-   backend starts locally;
-   project can be created;
-   multiple folder sources can be attached;
-   project can be retrieved after restart.

### Phase 2: Repository Scanner

Goal: inspect project folders.

Tasks:

1.  Validate source paths.
2.  Recursively scan source directories.
3.  Implement ignore rules.
4.  Detect relevant source files.
5.  Detect manifests/configuration.
6.  Return a normalized repository inventory.
7.  Add scanner tests.

Definition of done:

Given a local project folder, the backend can return a clean inventory
without `node_modules`, `.git`, build artifacts, etc.

### Phase 3: Static Analysis

Goal: understand basic source structure without AI.

Start with TypeScript/JavaScript.

Tasks:

1.  Parse JS/TS.
2.  Extract imports/exports.
3.  Extract classes.
4.  Extract functions/methods.
5.  Extract common API routes.
6.  Extract common HTTP client calls.
7.  Build file-level dependency data.
8.  Store an analysis snapshot.

Definition of done:

A test repository produces structured JSON describing files, symbols,
routes and dependencies.

### Phase 4: Initial Graph

Goal: produce a usable graph without AI.

Tasks:

1.  Create service nodes from project sources.
2.  Create basic component/API nodes if useful.
3.  Generate deterministic edges.
4.  Implement stable IDs.
5.  Implement `GET /projects/:id/graph`.

Definition of done:

Frontend could already draw a basic graph using backend JSON.

### Phase 5: OpenAI Feature Analysis

Goal: turn technical structure into human-readable features.

Tasks:

1.  Add OpenAI SDK.
2.  Configure API key through environment variables.
3.  Define structured feature schema.
4.  Create architecture snapshot compression.
5.  Implement feature detection prompt.
6.  Validate model response.
7.  Map features back to files/symbols.
8.  Merge AI features into graph.
9.  Handle OpenAI failures gracefully.
10. Add token/input limits and logging.

Definition of done:

A repository containing authentication code produces a feature such as
`Authentication` connected to the correct service and backed by relevant
source files.

### Phase 6: Cross-Repository Connections

Goal: make multi-repository visualization useful.

Tasks:

1.  Normalize API routes.
2.  Match API callers to API providers.
3.  Create cross-service edges.
4.  Store evidence for connections.
5.  Use AI only for ambiguous semantic relationships.

Definition of done:

If frontend calls an endpoint exposed by backend, the graph contains an
edge between the corresponding features/services.

### Phase 7: Automatic Updates

Goal: graph changes when code changes.

Tasks:

1.  Add chokidar.
2.  Watch all project sources.
3.  Ignore irrelevant paths.
4.  Debounce file events.
5.  Trigger analysis.
6.  Update graph.
7.  Track analysis status.
8.  Prevent concurrent duplicate analysis jobs.

Definition of done:

Changing a relevant source file causes the graph to update automatically
without restarting the backend.

### Phase 8: AI Context

Goal: make graph nodes useful to coding agents/chat.

Tasks:

1.  Implement node-to-source traceability.
2.  Implement node context endpoint.
3.  Return relevant files/symbols/snippets.
4.  Add sensible context-size limits.

Definition of done:

Selecting an `Authentication` feature can produce focused code context
for an AI chat without loading the entire repository.

## 20. Hackathon MVP

Do NOT attempt to support every language and framework.

The minimum impressive demo should be:

``` text
Create Project
      ↓
Add frontend + backend folders
      ↓
Analyze
      ↓
Detect services
      ↓
Detect features using static analysis + OpenAI
      ↓
Detect frontend → backend API relationships
      ↓
Return graph JSON
      ↓
Modify code
      ↓
Watcher detects change
      ↓
Graph updates
```

If this works reliably, the core backend is successful.

## 21. Priority Order

### P0 - Must work

-   project creation;
-   multiple sources;
-   folder scanning;
-   JS/TS static analysis;
-   service detection;
-   OpenAI feature detection;
-   graph generation;
-   graph API;
-   source references for nodes.

### P1 - Very valuable

-   frontend/backend API connection detection;
-   filesystem watcher;
-   automatic graph refresh;
-   analysis progress/status;
-   node context endpoint.

### P2 - After core works

-   more languages;
-   sophisticated incremental analysis;
-   GitHub URL cloning;
-   Make Tests action;
-   Performance Audit action;
-   manual connection creation;
-   WebSockets/SSE;
-   deep message queue/database relationship analysis.

## 22. Non-Goals for Initial Implementation

Avoid spending hackathon time on:

-   Kubernetes;
-   microservice infrastructure for our own backend;
-   complex authentication;
-   cloud deployment before local MVP works;
-   vector databases unless a demonstrated need appears;
-   parsing every programming language;
-   perfect semantic analysis;
-   complete call graphs;
-   advanced permissions;
-   distributed queues;
-   premature performance optimization.

## 23. Engineering Requirements

Codex should follow these rules while implementing:

1.  Use strict TypeScript.
2.  Keep scanner, analyzer, AI and graph layers separated.
3.  Avoid giant service classes.
4.  Define interfaces between major modules.
5.  Validate external input.
6.  Validate AI output.
7.  Never expose or commit API keys.
8.  Add useful logs around analysis.
9.  Make analysis failures recoverable.
10. Store enough evidence to explain why a node or edge exists.
11. Prefer deterministic static analysis over AI when the answer can be
    determined reliably.
12. Use AI for semantic interpretation rather than basic parsing.
13. Keep model-specific OpenAI code isolated.
14. Add tests for scanner, route normalization and graph building.
15. Do not introduce infrastructure that is unnecessary for the MVP.

## 24. Key Technical Risks

### Feature identification

There is no universal deterministic definition of a software "feature".

Solution:

Use static analysis to gather evidence, then OpenAI for semantic
grouping.

### Huge repositories

Sending all code to OpenAI will be expensive and unreliable.

Solution:

Analyze locally first and send compact architecture snapshots. Analyze
smaller logical groups when necessary.

### AI hallucination

A model may invent features or relationships.

Solution:

Every generated feature should ideally reference real files/symbols.
Every relationship should contain evidence. Reject invalid references
where possible.

### Multiple repositories

Names alone are not enough to detect relationships.

Solution:

Start with deterministic API route matching and enrich later.

### Continuous updates

AI agents can modify many files quickly.

Solution:

Debounce filesystem events and batch analysis.

## 25. First Milestone for Codex

Do not start by implementing the entire specification.

First build this vertical slice:

``` text
POST /projects
        ↓
attach two local sources
        ↓
POST /projects/:id/analyze
        ↓
scan both folders
        ↓
detect JS/TS files
        ↓
extract basic symbols + API routes
        ↓
create service nodes
        ↓
GET /projects/:id/graph
```

Make this work end-to-end before introducing OpenAI.

Then add AI feature detection as the next vertical slice.

## 26. Final Product Mental Model

The backend is not simply a repository parser.

It is an **architecture intelligence engine**.

Its pipeline is:

``` text
CODE
 ↓
STATIC FACTS
 ↓
SEMANTIC UNDERSTANDING
 ↓
SERVICES + FEATURES + RELATIONSHIPS
 ↓
GRAPH
 ↓
AI CONTEXT / ACTIONS
```

Whenever an implementation decision is unclear, optimize for this
pipeline and for producing a graph that is:

-   understandable by a developer;
-   traceable back to real code;
-   automatically updateable;
-   usable as focused context for AI coding agents.
