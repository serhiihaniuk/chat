import { readCappedBytes } from "./read-capped-bytes.js";

/** Parse JSON only after enforcing the real streamed byte count. */
export async function readCappedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return undefined;

  try {
    const bytes = await readCappedBytes(request.body, maxBytes);
    if (bytes === undefined) return undefined;
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value;
  } catch {
    return undefined;
  }
}
