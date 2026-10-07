export type MultipartPart =
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; bytes: Uint8Array };

/**
 * Builds a multipart/form-data body by hand. Expo's fetch can't upload a
 * React Native FormData file by URI, so the app reads the photo's bytes and
 * assembles the body itself.
 */
export function buildMultipartBody(
  parts: MultipartPart[],
  boundary = randomBoundary(),
): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if ('bytes' in part) {
      head += `; filename="${part.filename}"\r\nContent-Type: ${part.contentType}`;
    }
    chunks.push(encoder.encode(`${head}\r\n\r\n`));
    chunks.push('bytes' in part ? part.bytes : encoder.encode(part.value));
    chunks.push(encoder.encode('\r\n'));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));

  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function randomBoundary(): string {
  return `----CalcTutor${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
