/**
 * Rebuild the sidechat schema from a clean state using the given connection.
 *
 * Type companion for the plain-JS tooling module so typed callers (e.g. the
 * service `db:reset` entry point) import it without an implicit `any`.
 */
export declare const applySidechatSchema: (connectionString: string) => Promise<void>;
