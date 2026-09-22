# Backend MVP

Requires Node.js 26+ and Git. Run `npm install`, set `OPENAI_API_KEY` in a local `.env` file, then run `npm run dev`. `OPENAI_MODEL` defaults to `gpt-4o-mini`; see `.env.example`.

Create a project with `POST /projects` using a local Git working-tree path. Call `POST /projects/:id/load` to analyze it and write `ProjectMap.json` in that folder. `GET /projects/:id/nodes` returns the current nodes and labeled relations.

After a successful load, this server process checks Git HEAD every second and refreshes the map when a commit changes. Uncommitted edits do not trigger a refresh. Monitoring stops when the server stops; after a restart, call `/load` again to resume monitoring. A repository without a commit can be loaded, and its first commit triggers a refresh.
