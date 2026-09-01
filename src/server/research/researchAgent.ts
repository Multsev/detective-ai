import OpenAI from 'openai';
import type { InvestigationCase, InvestigationEntity, ResearchResult } from '../../shared/domain.js';
import { researchJsonSchema, researchResultSchema } from './researchSchema.js';

const investigatorInstructions = `
You are an evidence-first OSINT research agent for a private investigation board.
Use only lawfully accessible public sources. Do not collect or expose home addresses,
private phone numbers, identity documents, financial account numbers, family details,
or other sensitive personal data.

Separate identity resolution from relationship research. Never merge namesakes without
strong identifiers. Every proposed claim must cite at least one returned source. Prefer
official registries and primary sources. A search with no result means unknown, not false.

Evidence statuses:
- official: directly established by an authoritative primary source;
- corroborated: supported by at least two independent reliable sources;
- probable: supported but not fully established;
- hypothesis: useful lead requiring verification;
- contradicted: credible sources disagree;
- unknown: evidence is insufficient.

Do not return user_asserted for web findings. Do not infer guilt, intent, criminality,
ethnicity, health, politics, religion, sexuality, or other sensitive traits. Keep the
language neutral. The board is a claim map, not a profile for harassment or surveillance.

Reuse IDs of existing entities. Candidate entity IDs must be short URL-safe strings and
must not collide with existing IDs. Claims may reference only existing entity IDs or IDs
returned in candidateEntities. Return exact public URLs in sources.
`.trim();

export class ResearchAgent {
  private readonly client: OpenAI;
  readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async investigate(focusEntity: InvestigationEntity, investigationCase: InvestigationCase, researchQuestion: string): Promise<ResearchResult> {
    const compactCase = {
      title: investigationCase.title,
      entities: investigationCase.entities.map(({ id, type, title, subtitle, summary }) => ({ id, type, title, subtitle, summary })),
      relations: investigationCase.relations.map(({ sourceId, targetId, label, status }) => ({ sourceId, targetId, label, status })),
    };

    const response = await this.client.responses.create({
      model: this.model,
      instructions: investigatorInstructions,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Investigate this focus entity and return proposed graph additions.\n\nFocus entity:\n${JSON.stringify(focusEntity)}\n\nExisting case graph:\n${JSON.stringify(compactCase)}\n\nUser research question:\n${researchQuestion || 'Find identity-safe public facts, organizations, documents, events, and verifiable relationships.'}`,
            },
          ],
        },
      ],
      tools: [{ type: 'web_search' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'investigation_research_result',
          strict: true,
          schema: researchJsonSchema,
        },
      },
    });

    if (!response.output_text) {
      throw new Error('AI research completed without a structured result.');
    }

    const parsed = researchResultSchema.parse(JSON.parse(response.output_text));
    const accessedAt = new Date().toISOString().slice(0, 10);
    return {
      ...parsed,
      sources: parsed.sources.map((source) => ({ ...source, accessedAt })),
    };
  }
}
