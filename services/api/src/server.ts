import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadEnv, serverConfig } from './config';
import { claudeModelCall } from './grader';

loadEnv();
const config = serverConfig();

if (!config.sharedSecret && process.env.ALLOW_NO_AUTH !== '1') {
  console.error('Set API_SHARED_SECRET in .env (or ALLOW_NO_AUTH=1 for local testing only).');
  process.exit(1);
}

const app = createApp(config, claudeModelCall(new Anthropic(), config));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Grading API on http://localhost:${info.port} (model ${config.model}, effort ${config.effort})`);
});
