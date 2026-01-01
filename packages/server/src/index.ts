import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ ok: true }));

const port = Number(process.env.PORT || 3000);
fastify.listen({ port, host: '0.0.0.0' })
    .then(() => console.log(`Server listening on http://localhost:${port}`))
    .catch((err) => { fastify.log.error(err); process.exit(1); });