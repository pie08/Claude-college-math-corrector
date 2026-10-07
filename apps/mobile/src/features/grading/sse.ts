/**
 * Incremental parser for server-sent events. Feed it text chunks as they
 * arrive; it returns the `data` payload of each complete event.
 */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: string[] = [];
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data) events.push(data);
      }
      return events;
    },
  };
}
