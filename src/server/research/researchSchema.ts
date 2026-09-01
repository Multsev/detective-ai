import { z } from 'zod';
import { entityTypes, evidenceStatuses } from '../../shared/domain.js';

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string(),
  publishedAt: z.string(),
  accessedAt: z.string(),
});

export const researchResultSchema = z.object({
  summary: z.string(),
  identityAssessment: z.string(),
  candidateEntities: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(entityTypes),
    title: z.string().min(1),
    subtitle: z.string(),
    summary: z.string(),
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
  required: ['summary', 'identityAssessment', 'candidateEntities', 'claims', 'questions', 'sources', 'warnings'],
  properties: {
    summary: { type: 'string' },
    identityAssessment: { type: 'string' },
    candidateEntities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'subtitle', 'summary'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: entityTypes },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'subjectId', 'predicate', 'objectId', 'status', 'confidence', 'explanation', 'sourceIds'],
        properties: {
          id: { type: 'string' },
          subjectId: { type: 'string' },
          predicate: { type: 'string' },
          objectId: { type: 'string' },
          status: { type: 'string', enum: evidenceStatuses },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          explanation: { type: 'string' },
          sourceIds: { type: 'array', items: { type: 'string' } },
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
