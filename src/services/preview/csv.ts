export type CsvPreview = {
  rows: string[][];
  truncated: boolean;
};

export function parseCsvPreview(text: string, maxRows = 200): CsvPreview {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let truncated = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (!truncated && (field || row.length > 0)) {
    row.push(field);
    rows.push(row);
  }
  return { rows, truncated };
}
