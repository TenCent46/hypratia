export function confirmDangerTwice(input: {
  title: string;
  detail: string;
  finalDetail?: string;
}): boolean {
  const first = window.confirm(`${input.title}\n\n${input.detail}`);
  if (!first) return false;
  return window.confirm(
    `${input.title}\n\n${input.finalDetail ?? 'This cannot be undone. Are you absolutely sure?'}`,
  );
}
