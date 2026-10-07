import type { GradeResult } from '@calc/shared';
import sharp from 'sharp';

/**
 * Draws the grader's boxes on the page so accuracy can be checked by eye:
 * red for incorrect steps, amber dashed for unclear ones, each numbered in
 * reading order to match the printed summary.
 */
export async function annotate(imageBase64: string, result: GradeResult): Promise<Buffer> {
  const { width, height } = result.meta.image;
  const shapes: string[] = [];
  let n = 0;
  for (const problem of result.problems) {
    for (const issue of problem.issues) {
      n++;
      const x = issue.bbox.x * width;
      const y = issue.bbox.y * height;
      const w = issue.bbox.w * width;
      const h = issue.bbox.h * height;
      const color = issue.status === 'incorrect' ? '#D92D20' : '#DC8A00';
      const dash = issue.status === 'unclear' ? 'stroke-dasharray="12 8"' : '';
      shapes.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="4" ${dash}/>`,
        `<circle cx="${x}" cy="${y}" r="16" fill="${color}"/>`,
        `<text x="${x}" y="${y + 7}" font-family="Arial" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">${n}</text>`,
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join('')}</svg>`;
  return sharp(Buffer.from(imageBase64, 'base64'))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Plain-text summary of a result, numbered to match the annotated image. */
export function describeResult(result: GradeResult): string {
  const lines = [`page_status: ${result.page_status}`];
  let n = 0;
  for (const problem of result.problems) {
    const flags = problem.issues.length === 0 ? 'no issues' : `${problem.issues.length} issue(s)`;
    lines.push(`  [${problem.label}] ${flags}; final answer correct: ${problem.final_answer_correct}`);
    for (const issue of problem.issues) {
      n++;
      lines.push(`    ${n}. ${issue.status.toUpperCase()} (${issue.concept}) [${issue.verification}, box: ${issue.bbox_source}]: ${issue.transcription}`);
      lines.push(`       ${issue.explanation}`);
      if (issue.correction) lines.push(`       fix: ${issue.correction}`);
      if (issue.later_steps_note) lines.push(`       note: ${issue.later_steps_note}`);
    }
    for (const note of problem.notation_notes) lines.push(`    notation: ${note}`);
  }
  lines.push(`summary: ${result.overall_summary}`);
  const m = result.meta;
  lines.push(
    `model ${m.model}, effort ${m.effort}, ${(m.latency_ms / 1000).toFixed(1)}s, ${m.input_tokens} in / ${m.output_tokens} out, $${m.cost_usd.toFixed(4)}, retries ${m.retries}, sharpness ${m.sharpness}`,
  );
  return lines.join('\n');
}
