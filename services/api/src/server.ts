import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { CasWorker } from './cas';
import { loadEnv, serverConfig } from './config';
import { claudeModelCall } from './grader';
import { TutorModelSchema } from './tutor';
import { UsageLog } from './usage';

loadEnv();
const config = serverConfig();

if (!config.sharedSecret && process.env.ALLOW_NO_AUTH !== '1') {
  console.error('Set API_SHARED_SECRET in .env (or ALLOW_NO_AUTH=1 for local testing only).');
  process.exit(1);
}

const checker = new CasWorker();
const client = new Anthropic();
const tutorCall = claudeModelCall(client, config, { schema: TutorModelSchema, effort: config.tutorEffort });
const usage = new UsageLog(config.usageLogPath);
const app = createApp(config, { call: claudeModelCall(client, config), tutorCall, checker, usage });
process.on('exit', () => checker.close());

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Grading API on http://localhost:${info.port} (model ${config.model}, effort ${config.effort})`);
});
