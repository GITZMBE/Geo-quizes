const MIN_AUTOCOMPLETE_CHARS = 5;

// Same "unambiguous prefix" rule as Sweden's TypeAllMode (kept separate
// there since it's the only consumer at the time), factored out here
// because CapitalsMode/FlagsMode both need it against a different
// candidate list (capitals, country names) each.
export function getAutocompleteMatch(input: string, candidates: string[]): string | null {
  if (input.length < MIN_AUTOCOMPLETE_CHARS) return null;
  const lower = input.toLowerCase();
  const matches = candidates.filter((c) => c.toLowerCase().startsWith(lower));
  return matches.length === 1 ? matches[0] : null;
}
