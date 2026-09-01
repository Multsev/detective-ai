import 'dotenv/config';
import { createApp } from './app.js';
import { CaseStore } from './storage/caseStore.js';
import { McpSettingsStore } from './storage/mcpSettingsStore.js';

const port = Number(process.env.PORT ?? 8787);
const app = createApp({ store: new CaseStore(), mcpSettingsStore: new McpSettingsStore() });

app.listen(port, () => {
  console.log(`Detective AI API: http://localhost:${port}`);
  console.log('Codex CLI status is detected at runtime on /api/codex/status');
});
