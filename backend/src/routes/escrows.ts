import { Hono } from 'hono';

export const escrowsRoutes = new Hono();

escrowsRoutes.get('/', (c) => c.json({ escrows: [] }));
