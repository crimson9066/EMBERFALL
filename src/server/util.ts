export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function validName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(name);
}

export function cleanText(text: string, max = 200): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function nowSec(): number {
  return Date.now() / 1000;
}

export function round(n: number): number {
  return Math.round(n * 10) / 10;
}
