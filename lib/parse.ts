// CSV parsing for California's two delimiter styles.
//   UCC files: "|"-delimited, values wrapped in double quotes
//   BE files:  "*|*"-delimited, values unquoted
import { readFileSync } from 'node:fs';

type Row = Record<string, string>;

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
}

function toObjects(header: string[], rows: string[][]): Row[] {
  return rows.map((vals) => {
    const o: Row = {};
    header.forEach((h, i) => {
      o[h] = (vals[i] ?? '').trim();
    });
    return o;
  });
}

export function parseUcc(path: string): Row[] {
  const lines = readLines(path);
  const split = (line: string) =>
    line.split('|').map((f) => {
      f = f.trim();
      if (f.startsWith('"') && f.endsWith('"')) f = f.slice(1, -1);
      return f;
    });
  const header = split(lines[0]);
  return toObjects(header, lines.slice(1).map(split));
}

export function parseBe(path: string): Row[] {
  const lines = readLines(path);
  const split = (line: string) => line.split('*|*');
  const header = split(lines[0]).map((h) => h.trim());
  return toObjects(header, lines.slice(1).map(split));
}
