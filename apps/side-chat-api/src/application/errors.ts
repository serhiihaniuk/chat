export class SideChatDomainError extends Error { constructor(readonly code: string, message: string, readonly retryable = false) { super(message) } }
export class Unauthorized extends SideChatDomainError { constructor() { super('Unauthorized', 'Workspace access denied') } }
export class RateLimited extends SideChatDomainError { constructor() { super('RateLimited', 'Rate limit exceeded', true) } }
export class BillingDenied extends SideChatDomainError { constructor() { super('BillingDenied', 'Workspace billing is not enabled') } }
export class ModelUnavailable extends SideChatDomainError { constructor(modelId: string) { super('ModelUnavailable', `Model unavailable: ${modelId}`) } }
export class UsageCaptureFailed extends SideChatDomainError { constructor() { super('UsageCaptureFailed', 'Could not record token usage', true) } }
