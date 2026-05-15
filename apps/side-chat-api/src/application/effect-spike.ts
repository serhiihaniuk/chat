import { Config, Context, Effect, Layer } from 'effect'

export class RequestIdService extends Context.Service<RequestIdService, { readonly requestId: string }>()('RequestIdService') {}
export const requestIdConfig = Config.string('REQUEST_ID').pipe(Config.withDefault('local-request'))
export const requestIdLayer = Layer.effect(RequestIdService, Effect.map(requestIdConfig, (requestId) => ({ requestId })))
export const effectV4CompileSpike = Effect.gen(function* () {
  const service = yield* RequestIdService
  return service.requestId
})
