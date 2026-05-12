import { Hono } from 'hono';

export const jobsRoutes = new Hono();

jobsRoutes.get('/', (c) => c.json({ jobs: [] }));
