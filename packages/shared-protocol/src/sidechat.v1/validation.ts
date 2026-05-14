import { z } from 'zod'
import {
  SidechatRequestSchema,
  SidechatStreamEventSchema
} from './schemas'
import {
  SidechatStreamResponseHeadersSchema,
  SidechatRequestHeadersSchema
} from './contracts'
import type { SidechatStreamEvent } from './types'

export const validateRequest = (value: unknown) => {
  const parsed = SidechatRequestSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false as const,
      issues: parsed.error.issues
    }
  }

  return {
    ok: true as const,
    data: parsed.data
  }
}

export const validateStreamEvent = (value: unknown) => {
  const parsed = SidechatStreamEventSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false as const,
      issues: parsed.error.issues
    }
  }

  return {
    ok: true as const,
    data: parsed.data
  }
}

export const validateRequestHeaders = (value: Record<string, string>) => {
  const parsed = SidechatRequestHeadersSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false as const,
      issues: parsed.error.issues
    }
  }

  return {
    ok: true as const,
    data: parsed.data
  }
}

export const validateResponseHeaders = (value: Record<string, string>) => {
  const parsed = SidechatStreamResponseHeadersSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false as const,
      issues: parsed.error.issues
    }
  }

  return {
    ok: true as const,
    data: parsed.data
  }
}

export const validateEvents = (events: SidechatStreamEvent[]) => {
  const invalid = events.find((event) => !SidechatStreamEventSchema.safeParse(event).success)
  if (!invalid) {
    return { ok: true as const }
  }

  const parsed = SidechatStreamEventSchema.safeParse(invalid)
  return {
    ok: false as const,
    issues: parsed.success ? [] : parsed.error.issues
  }
}

export type SidechatValidationResult<T> =
  | ({ ok: true } & { data: T })
  | ({ ok: false } & { issues: z.ZodIssue[] })
