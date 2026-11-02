// Note: crypto.randomUUID is unavailable on plain-http LAN pages (iPad over Wi-Fi), so we roll our own.
let counter = 0;
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1679616;
  return prefix + Date.now().toString(36) + counter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}
