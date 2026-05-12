import { Hono } from 'hono';

export const agentsRoutes = new Hono();

agentsRoutes.get('/', (c) => c.json({ agents: [] }));
