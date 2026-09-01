import { z } from 'zod';
import { entityAttributeKinds, entityTypes, evidenceStatuses } from '../../shared/domain.js';

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string(),
  publishedAt: z.string(),
  accessedAt: z.string(),
});

const entityAttributeSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  kind: z.enum(entityAttributeKinds),
  sourceIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

const entityAttributeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label', 'value', 'kind', 'sourceIds', 'confidence'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    value: { type: 'string' },
    kind: { type: 'string', enum: entityAttributeKinds },
    sourceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

export const researchResultSchema = z.object({
  summary: z.string(),
  identityAssessment: z.string(),
  candidateEntities: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(entityTypes),
    title: z.string().min(1),
    subtitle: z.string(),
    summary: z.string(),
    occurredAt: z.string(),
    attributes: z.array(entityAttributeSchema),
  })),
  entityUpdates: z.array(z.object({
    entityId: z.string().min(1),
    attributes: z.array(entityAttributeSchema),
  })),
  claims: z.array(z.object({
    id: z.string().min(1),
    subjectId: z.string().min(1),
    predicate: z.string().min(1),
    objectId: z.string().min(1),
    status: z.enum(evidenceStatuses),
    confidence: z.number().min(0).max(1),
    explanation: z.string(),
    sourceIds: z.array(z.string()),
    occurredAt: z.string(),
  })),
  questions: z.array(z.object({
    text: z.string(),
    why: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
  sources: z.array(sourceSchema),
  warnings: z.array(z.string()),
});

export const researchJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'identityAssessment', 'candidateEntities', 'entityUpdates', 'claims', 'questions', 'sources', 'warnings'],
  properties: {
    summary: { type: 'string' },
    identityAssessment: { type: 'string' },
    candidateEntities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'subtitle', 'summary', 'occurredAt', 'attributes'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: entityTypes },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
          occurredAt: { type: 'string' },
          attributes: { type: 'array', items: entityAttributeJsonSchema },
        },
      },
    },
    entityUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entityId', 'attributes'],
        properties: {
          entityId: { type: 'string' },
          attributes: { type: 'array', items: entityAttributeJsonSchema },
        },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'subjectId', 'predicate', 'objectId', 'status', 'confidence', 'explanation', 'sourceIds', 'occurredAt'],
        properties: {
          id: { type: 'string' },
          subjectId: { type: 'string' },
          predicate: { type: 'string' },
          objectId: { type: 'string' },
          status: { type: 'string', enum: evidenceStatuses },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          explanation: { type: 'string' },
          sourceIds: { type: 'array', items: { type: 'string' } },
          occurredAt: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'why', 'priority'],
        properties: {
          text: { type: 'string' },
          why: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'url', 'publisher', 'publishedAt', 'accessedAt'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          publisher: { type: 'string' },
          publishedAt: { type: 'string' },
          accessedAt: { type: 'string' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;
