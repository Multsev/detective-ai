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
  kind?: 'web' | 'uploaded_file' | 'google_contact';
}

export interface GoogleContactValue {
  value: string;
  type: string;
}

export interface GoogleContactOrganization {
  name: string;
  title: string;
  department: string;
}

export interface GoogleContactUserField {
  key: string;
  value: string;
}

export interface GoogleContact {
  id: string;
  resourceName: string;
  displayName: string;
  givenName: string;
  middleName: string;
  familyName: string;
  nickname: string;
  phoneNumbers: GoogleContactValue[];
  emailAddresses: GoogleContactValue[];
  organizations: GoogleContactOrganization[];
  biographies: string[];
  userDefined: GoogleContactUserField[];
  urls: GoogleContactValue[];
}

export interface GoogleIntegrationStatus {
  configured: boolean;
  connected: boolean;
  scope: string;
  message: string;
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

export const entityAttributeKinds = [
  'phone', 'email', 'social', 'website', 'tax_id', 'registration_id', 'bank_name',
  'bank_bic', 'bank_account', 'correspondent_account', 'employee_count', 'address',
  'date', 'identifier', 'text',
] as const;
export type EntityAttributeKind = (typeof entityAttributeKinds)[number];

export interface EntityAttribute {
  id: string;
  key: string;
  label: string;
  value: string;
  kind: EntityAttributeKind;
  sourceIds: string[];
  createdBy: 'user' | 'ai' | 'integration';
  confidence: number;
}

export interface ResearchEntityAttribute {
  key: string;
  label: string;
  value: string;
  kind: EntityAttributeKind;
  sourceIds: string[];
  confidence: number;
}

export interface ResearchEntityUpdate {
  entityId: string;
  attributes: ResearchEntityAttribute[];
}

export interface InvestigationEntity {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  summary: string;
  position: { x: number; y: number };
  facts: CaseFact[];
  attributes?: EntityAttribute[];
  sourceIds?: string[];
  createdBy?: 'user' | 'ai';
  occurredAt?: string;
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
  occurredAt?: string;
}

export interface InvestigationCase {
  id: string;
  caseNumber: number;
  subject: string;
  defaultSubjectEntityId?: string;
  researchSubjectEntityId?: string;
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
  occurredAt: string;
  attributes?: ResearchEntityAttribute[];
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
  occurredAt: string;
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
  entityUpdates?: ResearchEntityUpdate[];
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
export type ResearchMode = 'information' | 'relationships';

export interface EntityResearchState {
  entityId: string;
  mode: ResearchMode;
  entityIds: string[];
  status: EntityResearchStatus;
  stage: string;
  message: string;
  question: string;
  startedAt: string;
  source: 'web' | 'file';
  fileName?: string;
  result?: ResearchResult;
}

export interface ResearchDocument {
  fileName: string;
  mediaType: 'application/pdf' | 'text/markdown';
  text: string;
  sha256: string;
  truncated: boolean;
}

export type ResearchStreamEvent =
  | { type: 'status'; stage: string; message: string }
  | { type: 'result'; result: ResearchResult }
  | { type: 'error'; message: string };
