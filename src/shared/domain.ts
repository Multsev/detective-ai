export const entityTypes = ['person', 'company', 'document', 'event', 'location', 'question', 'note'] as const;
export type EntityType = (typeof entityTypes)[number];

export const evidenceStatuses = [
  'official',
  'corroborated',
  'probable',
  'hypothesis',
  'user_asserted',
  'contradicted',
  'unknown',
] as const;
export type EvidenceStatus = (typeof evidenceStatuses)[number];

export interface SourceReference {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  accessedAt: string;
}

export interface CaseFact {
  id: string;
  kind: 'claim' | 'question' | 'note';
  text: string;
  status: EvidenceStatus;
  confidence: number;
  sourceIds: string[];
  createdBy: 'user' | 'ai';
}

export interface InvestigationEntity {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  summary: string;
  position: { x: number; y: number };
  facts: CaseFact[];
}

export interface InvestigationRelation {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  explanation: string;
  status: EvidenceStatus;
  confidence: number;
  sourceIds: string[];
  createdBy: 'user' | 'ai';
}

export interface InvestigationCase {
  id: string;
  caseNumber: number;
  subject: string;
  title: string;
  subtitle: string;
  entities: InvestigationEntity[];
  relations: InvestigationRelation[];
  sources: SourceReference[];
  updatedAt: string;
}

export interface CaseSummary {
  id: string;
  caseNumber: number;
  subject: string;
  title: string;
  updatedAt: string;
  entityCount: number;
  relationCount: number;
}

export interface CreateCaseInput {
  subject: string;
  entityType: 'person' | 'company';
}

export interface ResearchCandidateEntity {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  summary: string;
}

export interface ResearchClaim {
  id: string;
  subjectId: string;
  predicate: string;
  objectId: string;
  status: EvidenceStatus;
  confidence: number;
  explanation: string;
  sourceIds: string[];
}

export interface ResearchQuestion {
  text: string;
  why: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ResearchResult {
  summary: string;
  identityAssessment: string;
  candidateEntities: ResearchCandidateEntity[];
  claims: ResearchClaim[];
  questions: ResearchQuestion[];
  sources: SourceReference[];
  warnings: string[];
}

export interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
  ready: boolean;
  path: string;
  version: string;
  authMessage: string;
  checkedAt: string;
}

export interface HealthStatus {
  ok: boolean;
  codex: CodexStatus;
}

export type McpTransport = 'stdio' | 'http';

export interface McpServerSetting {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  url: string;
  bearerTokenEnvVar: string;
  envVars: string[];
  requiredEnvVars: string[];
  sourceUrl: string;
  caution: string;
  preset: boolean;
}

export interface McpServerReadiness {
  id: string;
  ready: boolean;
  runtimeAvailable: boolean;
  missingEnvVars: string[];
  message: string;
}

export interface McpSettings {
  servers: McpServerSetting[];
  updatedAt: string;
}

export interface McpSettingsView extends McpSettings {
  readiness: McpServerReadiness[];
}

export type EntityResearchStatus = 'running' | 'completed' | 'error';

export interface EntityResearchState {
  entityId: string;
  status: EntityResearchStatus;
  stage: string;
  message: string;
  question: string;
  startedAt: string;
  result?: ResearchResult;
}

export type ResearchStreamEvent =
  | { type: 'status'; stage: string; message: string }
  | { type: 'result'; result: ResearchResult }
  | { type: 'error'; message: string };
