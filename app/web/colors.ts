export type RGB = readonly [number, number, number];
export type PlayerColors = Record<string, RGB>;

const palette: RGB[] = [
  [35, 110, 210],
  [230, 125, 25],
  [160, 65, 190],
  [30, 155, 85],
  [215, 65, 110],
  [20, 150, 175],
  [185, 155, 20],
  [120, 85, 55],
];

function randomFromSeed(seed: string) {
  let state = 2166136261;

  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function playerColors(
  ids: string[],
  room: string,
): PlayerColors {
  const ordered = [...new Set(ids)].sort();
  const random = randomFromSeed(room);
  const shuffled = [...palette];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const hueOffset = random();

  return Object.fromEntries(ordered.map((id, index) => [
    id,
    ordered.length <= shuffled.length
      ? shuffled[index]!
      : hueColor((hueOffset + index / ordered.length) % 1),
  ]));
}

function hueColor(hue: number): RGB {
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    return Math.round(
      255 * (0.48 - 0.34 * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
    );
  };

  return [channel(0), channel(8), channel(4)];
}

export function tint(colors: RGB[], alpha = 1): string {
  if (!colors.length) return "transparent";

  const average = (channel: number) => Math.round(
    colors.reduce((sum, color) => sum + color[channel]!, 0) /
    colors.length,
  );

  return `rgb(${average(0)} ${average(1)} ${average(2)} / ${alpha})`;
}