export function applyTemplate(
  template: string,
  vars: { title?: string; date?: string; time?: string; cursor?: string },
): string {
  const d = new Date();
  const date = vars.date ?? d.toISOString().slice(0, 10);
  const time = vars.time ?? d.toTimeString().slice(0, 5);
  return template
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{title\}\}/g, vars.title ?? '')
    .replace(/\{\{cursor\}\}/g, vars.cursor ?? '');
}
