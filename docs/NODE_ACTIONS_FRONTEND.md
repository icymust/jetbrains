# Node Actions: Frontend Integration

When the user clicks a service or feature node, show four actions:

1. To Chat
2. Test
3. Explain
4. Audit

The selected action opens its corresponding popup or mock chat UI.

## 1. To Chat

**Endpoint**

```http
GET /projects/:projectId/nodes/:nodeId/context
```

Open a mock AI Chat window and display the real context returned by the backend. This demonstrates what Devagotchi would send to JetBrains AI Chat in a future plugin. The data comes from the analyzed repository; calling this endpoint does not make an AI request.

Response fields:

- `node_id`: selected graph node ID
- `node_name`: display name
- `node_type`: `service` or `feature`
- `features`: features contained by the selected service; empty for a feature node
- `relations`: relevant graph relations
- `evidence_paths`: repository files used as evidence
- `missing_evidence_paths`: evidence files that are no longer readable
- `context`: prepared context to insert or display in the mock chat

Example response:

```json
{
  "node_id": "service-game",
  "node_name": "Game Service",
  "node_type": "service",
  "features": [
    { "id": "feature-matches", "name": "Real-Time Matches", "type": "feature" }
  ],
  "relations": [
    { "parent_id": "service-game", "child_id": "feature-matches", "label": "contains" }
  ],
  "evidence_paths": ["game/src/app.ts", "game/src/api/ws/ws.ts"],
  "missing_evidence_paths": [],
  "context": "{\n  \"node\": { ... },\n  \"evidence_files\": [ ... ]\n}"
}
```

## 2. Test

**Endpoint**

```http
GET /projects/:projectId/nodes/:nodeId/tests
```

Open a Tests popup showing total, passed, failed, and duration. A **Run Tests** button can be visual only for the MVP.

These values are intentionally mocked for the hackathon visualization. The backend guarantees:

- `total`: 3–10
- `passed`: equal to `total`
- `failed`: 0
- `duration`: 0.5–1.5 seconds

Values are deterministic for each node, so reopening the same node shows the same result. No real tests or AI requests are executed.

Example response:

```json
{
  "total": 7,
  "passed": 7,
  "failed": 0,
  "duration": 0.9
}
```

## 3. Explain

**Endpoint**

```http
GET /projects/:projectId/nodes/:nodeId/explain
```

Open the same or a similar mock AI Chat window used by To Chat. Put the returned `prompt` in the chat input field so the user sees a ready-to-send prompt. Do not display it as an AI response.

This represents what the future JetBrains plugin would pre-fill in the real AI Chat. No AI request happens in the web MVP.

Example response:

```json
{
  "node_id": "service-game",
  "node_name": "Game Service",
  "prompt": "Explain how Game Service works, including its main responsibilities, features, and connections to other services."
}
```

## 4. Audit

**Endpoint**

```http
POST /projects/:projectId/nodes/:nodeId/audit
```

Open an Audit popup or card and show a loading state while the request runs. Unlike the other actions, Audit makes a real OpenAI request. The backend builds real context from the analyzed repository and sends only relevant context and evidence for the selected node.

Display:

- `overall_score`: overall assessment
- `optimization_score`: implementation efficiency and cleanliness
- `maintainability_score`: how easy the component is to maintain and extend
- Exactly two AI-generated improvement suggestions, shown directly

All scores are integers from 0 to 100.

Suggested layout:

```text
Audit · Game Service

Overall            81/100
Optimization       76/100
Maintainability    85/100

Top improvements

1. <title>
   <description>

2. <title>
   <description>
```

Example response:

```json
{
  "node_id": "service-game",
  "node_name": "Game Service",
  "overall_score": 81,
  "optimization_score": 76,
  "maintainability_score": 85,
  "improvements": [
    {
      "title": "Separate connection handling",
      "description": "Move WebSocket lifecycle handling behind a focused service boundary."
    },
    {
      "title": "Clarify match errors",
      "description": "Use explicit error types for expected match and player failures."
    }
  ]
}
```

Audit can return an error when the node has no readable evidence.

Audit uses a real OpenAI request. The complete Audit endpoint was successfully tested with `gpt-5.6-terra`; it returned valid structured scores and exactly two improvement suggestions. Structured Output validation and local validation both passed, and the recommendations were grounded in the supplied source evidence. The frontend can treat this response structure as the final Audit API contract for the MVP.

## General frontend behavior

```text
Click service or feature node
→ show four action buttons
→ open the popup or chat UI for the selected action
```

| Action | Data | AI request |
|---|---|---|
| To Chat | Real repository context | No |
| Test | Mock demo values | No |
| Explain | Prepared prompt | No |
| Audit | Real repository context and AI-generated audit | Yes |

Handle these error states:

- Project not found
- Project map not available
- Node not found
- Audit has no readable evidence
- Audit or OpenAI request failure
