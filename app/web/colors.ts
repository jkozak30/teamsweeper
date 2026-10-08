export type PlayerColors = Record<string, string>;

export function playerColors(ids: string[], room: string): PlayerColors {
  const players = [...new Set(ids)].sort();

  // Room IDs are UUIDs. Read their first eight hexadecimal digits.
  const rotation = (parseInt(room.slice(0, 8), 16) || 0) % 360;

  return Object.fromEntries(players.map((id, index) => {
    const hue = (rotation + index * 360 / players.length) % 360;
    return [id, `hsl(${hue} 75% 45%)`];
  }));
}

export function tint(colors: string[], alpha = 1): string {
  if (!colors.length) return "transparent";

  let mixed = colors[0]!;

  for (let index = 1; index < colors.length; index++) {
    const share = 100 / (index + 1);
    mixed = `color-mix(in oklch shorter hue, ${mixed} ${100 - share}%, ${colors[index]} ${share}%)`;
  }

  return alpha === 1 ? mixed
    : `color-mix(in srgb, ${mixed} ${alpha * 100}%, transparent)`;
}