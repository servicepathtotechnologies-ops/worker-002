/**
 * Remove diacritic marks from a string while preserving base characters.
 *
 * Example: "Crème Brûlée" -> "Creme Brulee"
 */
export function removeDiacritics(input: string): string {
  if (typeof input !== 'string' || !input) {
    return '';
  }

  // Normalize to "decomposed" form and strip combining diacritical marks.
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default {
  removeDiacritics,
};

