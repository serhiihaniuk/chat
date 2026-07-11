export type HttpErrorCode = "unauthorized" | "internal_error";

export function errorResponse(
  requestId: string,
  code: HttpErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response {
  return Response.json({ code, message, retryable, requestId }, { status });
}
