export function calculateSoundSpeed(temperatureCelsius: number) {
  return 331.3 * Math.sqrt(1 + temperatureCelsius / 273.15);
}

export function formatSoundSpeed(value: number) {
  return Number(value.toFixed(4)).toString();
}
