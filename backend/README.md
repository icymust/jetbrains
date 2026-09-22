# Backend MVP

Requires Node.js 26+ and Git. Run `npm install`, then run `npm run dev`. Set `OPENAI_API_KEY` in a local `.env` file. `OPENAI_MODEL` is optional; see `.env.example`.

Create a project with `POST /projects` using a local Git working-tree path. Call `POST /projects/:id/load` to analyze it and write `ProjectMap.json` in that folder. `GET /projects/:id/nodes` returns the current nodes and labeled relations.

`GET /projects/:id/commits` returns up to the 10 newest commits from the project's local Git repository, newest first. The response is `{ "commits": [{ "hash": "<full SHA>", "short_hash": "<abbreviated SHA>", "message": "<subject>", "author": "<name>", "date": "<ISO 8601>" }] }`. This read-only endpoint does not load or analyze the project.

Node actions use the selected node from the saved project map:

- `GET /projects/:projectId/nodes/:nodeId/context` returns real node, feature, relation, and repository evidence context. It does not call AI.
- `GET /projects/:projectId/nodes/:nodeId/tests` returns stable mock test totals and duration for the demo. It does not discover or run tests.
- `GET /projects/:projectId/nodes/:nodeId/explain` returns a short prepared chat prompt. It does not call AI or generate an explanation.
- `POST /projects/:projectId/nodes/:nodeId/audit` sends only the selected node's saved evidence and related map context to the configured OpenAI model. It returns three integer scores from 0 to 100 and exactly two improvement suggestions.

After a successful load, this server process checks Git HEAD every second and refreshes the map when a commit changes. Uncommitted edits do not trigger a refresh. Monitoring stops when the server stops; after a restart, call `/load` again to resume monitoring. A repository without a commit can be loaded, and its first commit triggers a refresh.
