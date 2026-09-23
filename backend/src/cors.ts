import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

const localFrontendOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}$/;

export async function registerLocalCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: localFrontendOrigin,
    methods: ['GET', 'POST', 'DELETE'],
  });
}
