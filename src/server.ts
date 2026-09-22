import Fastify from 'fastify';
import { config } from './config.js';
import { openDatabase } from './db/db.js';
import { registerProjectRoutes } from './projects/project.routes.js';

const database = openDatabase(config.databasePath);
const app = Fastify({ logger: true });

registerProjectRoutes(app, database);

app.addHook('onClose', async () => {
  database.close();
});

try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
