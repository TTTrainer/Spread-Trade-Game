/** The screen's recent steps, for game.log if the window ever stalls (see diagnostics.ts). */
const MAX = 40;
const trail: string[] = [];

export function crumb(text: string): void {
  trail.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
  if (trail.length > MAX) trail.shift();
}

export function recentTrail(): string[] {
  return trail.slice();
}
