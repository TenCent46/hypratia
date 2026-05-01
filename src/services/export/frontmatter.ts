import matter from 'gray-matter';

export function buildMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return matter.stringify(body, frontmatter);
}

export function readFrontmatterId(text: string): string | null {
  try {
    const parsed = matter(text);
    const id = (parsed.data as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}
