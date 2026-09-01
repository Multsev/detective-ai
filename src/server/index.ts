import 'dotenv/config';
import { createApp } from './app.js';
import { ResearchAgent } from './research/researchAgent.js';
import { CaseStore } from './storage/caseStore.js';

const port = Number(process.env.PORT ?? 8787);
const model = process.env.OPENAI_MODEL ?? 'gpt-5.4';
const researchAgent = process.env.OPENAI_API_KEY
  ? new ResearchAgent(process.env.OPENAI_API_KEY, model)
  : undefined;

const app = createApp({ store: new CaseStore(), researchAgent, model });

app.listen(port, () => {
  console.log(`Detective AI API: http://localhost:${port}`);
  console.log(`AI research: ${researchAgent ? `enabled (${model})` : 'disabled — set OPENAI_API_KEY in .env'}`);
});
