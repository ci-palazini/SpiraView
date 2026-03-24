/**
 * Jaro-Winkler string similarity — pure TypeScript, zero dependencies.
 *
 * Used to fuzzy-match BBS observer names against registered platform users.
 */

/** Normalize a string: strip accents, lowercase, trim */
export function norm(s: string): string {
    return (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/** Jaro distance between two strings (already normalized). Returns 0–1. */
function jaro(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const maxLen = Math.max(a.length, b.length);
    const window = Math.max(Math.floor(maxLen / 2) - 1, 0);

    const aMatches = new Array<boolean>(a.length).fill(false);
    const bMatches = new Array<boolean>(b.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matching characters
    for (let i = 0; i < a.length; i++) {
        const lo = Math.max(0, i - window);
        const hi = Math.min(b.length - 1, i + window);
        for (let j = lo; j <= hi; j++) {
            if (bMatches[j] || a[i] !== b[j]) continue;
            aMatches[i] = true;
            bMatches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatches[i]) continue;
        while (!bMatches[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }

    return (
        (matches / a.length +
            matches / b.length +
            (matches - transpositions / 2) / matches) /
        3
    );
}

/**
 * Jaro-Winkler similarity.
 *
 * Applies NFD normalization before comparison.
 * Returns a score between 0 (no match) and 1 (exact match).
 *
 * @param a - first string (raw)
 * @param b - second string (raw)
 * @param prefixScale - scaling factor for prefix bonus (default 0.1, max 0.25)
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
    const na = norm(a);
    const nb = norm(b);

    const jaroScore = jaro(na, nb);

    // Common prefix (max 4 characters)
    const maxPrefix = Math.min(4, na.length, nb.length);
    let prefix = 0;
    for (let i = 0; i < maxPrefix; i++) {
        if (na[i] === nb[i]) prefix++;
        else break;
    }

    return jaroScore + prefix * prefixScale * (1 - jaroScore);
}
