import type { Config } from 'drizzle-kit';

export default {
  schema: './schema/index.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  strict: true,
  verbose: true,
} satisfies Config;
