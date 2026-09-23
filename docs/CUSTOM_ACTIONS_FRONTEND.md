# Custom Actions: Frontend Integration

Custom actions are persistent, AI-powered, text-only actions for **service nodes**. Feature nodes are not supported in the MVP.

## Add flow

```text
+ Add
→ enter Name, Icon, and Prompt
→ create action
→ show it as a persistent service action
```

### Create

```http
POST /projects/:projectId/nodes/:nodeId/actions
Content-Type: application/json
```

```json
{
  "name": "Generate Docs",
  "icon": "document",
  "prompt": "Generate concise documentation for this service based on its implementation."
}
```

Successful response: `201 Created`

```json
{
  "id": "action-id",
  "name": "Generate Docs",
  "icon": "document",
  "prompt": "Generate concise documentation for this service based on its implementation."
}
```

Creating an action stores it in the backend database and does not call AI.

### List

```http
GET /projects/:projectId/nodes/:nodeId/actions
```

```json
{
  "actions": [
    {
      "id": "action-id",
      "name": "Generate Docs",
      "icon": "document",
      "prompt": "Generate concise documentation for this service based on its implementation."
    }
  ]
}
```

Load this endpoint when displaying a service's action menu. Listing does not call AI.

## Execution flow

```text
custom action click
→ optional Additional Instructions
→ Run
→ Executing state
→ execute action
→ Status: Done
→ show Output
→ Close
```

```http
POST /projects/:projectId/nodes/:nodeId/actions/:actionId/execute
Content-Type: application/json
```

The body is optional. Send `{}` or omit it when there are no additional instructions.

```json
{
  "additional_instructions": "Focus on the public API and keep it concise."
}
```

Successful response: `200 OK`

```json
{
  "action_id": "action-id",
  "action_name": "Generate Docs",
  "node_id": "service-node-id",
  "node_name": "Order Service",
  "status": "done",
  "output": "Generated text output..."
}
```

Execution is the only custom-action operation that calls OpenAI. Show a loading state until it completes. The response intentionally excludes source contents, prompts, and token usage.

## Delete

```http
DELETE /projects/:projectId/nodes/:nodeId/actions/:actionId
```

```json
{
  "deleted": true
}
```

Remove the action from the service menu after a successful response. Deletion is permanent and does not call AI.

## Errors to handle

- `400` — invalid fields, oversized input, or selected node is not a service
- `404` — project, map, node, or custom action not found
- `409` — map belongs to another project or the service has no readable evidence
- `500` — service context or OpenAI execution failed

Display the backend's `error` message and keep the action available for retry after execution failures.
