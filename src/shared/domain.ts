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
  title: string;
  subtitle: string;
  entities: InvestigationEntity[];
  relations: InvestigationRelation[];
  sources: SourceReference[];
  updatedAt: string;
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

export type ResearchStreamEvent =
  | { type: 'status'; stage: string; message: string }
  | { type: 'result'; result: ResearchResult }
  | { type: 'error'; message: string };
