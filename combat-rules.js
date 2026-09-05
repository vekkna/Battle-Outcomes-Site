export const DEFAULT_MODIFIERS = Object.freeze({ height: 1, outflanking: 2, initiative: 1 });

export function normaliseModifiers(values = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_MODIFIERS).map(([key, fallback]) => {
    const value = values?.[key];
    const number = value === null || value === "" || value === undefined ? NaN : Number(value);
    return [key, Number.isFinite(number) ? Math.max(0, Math.min(99, Math.round(number))) : fallback];
  }));
}
