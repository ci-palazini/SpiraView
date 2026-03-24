import { describe, it, expect } from 'vitest';
import { jaroWinkler, norm } from '../utils/fuzzy';

describe('norm', () => {
    it('strips accents and lowercases', () => {
        expect(norm('João Silva')).toBe('joao silva');
    });

    it('trims whitespace', () => {
        expect(norm('  abc  ')).toBe('abc');
    });

    it('handles empty/null-ish', () => {
        expect(norm('')).toBe('');
    });
});

describe('jaroWinkler', () => {
    it('returns 1 for exact match', () => {
        expect(jaroWinkler('João Silva', 'João Silva')).toBeCloseTo(1.0, 2);
    });

    it('returns 1 for match differing only in accents/case', () => {
        expect(jaroWinkler('João Silva', 'joao silva')).toBeCloseTo(1.0, 2);
    });

    it('scores > 0.85 for close matches (auto-match zone)', () => {
        const score = jaroWinkler('João Silva', 'Joao Silv');
        expect(score).toBeGreaterThan(0.85);
    });

    it('scores between 0.60–0.84 for partial matches (candidate zone)', () => {
        const score = jaroWinkler('Ana Beatriz de Souza', 'Ana Souza');
        expect(score).toBeGreaterThanOrEqual(0.60);
        expect(score).toBeLessThanOrEqual(0.85);
    });

    it('scores < 0.60 for unrelated names', () => {
        const score = jaroWinkler('João Silva', 'Pedro Rodrigues');
        expect(score).toBeLessThan(0.60);
    });

    it('returns 0 for empty strings', () => {
        expect(jaroWinkler('', 'abc')).toBe(0);
        expect(jaroWinkler('abc', '')).toBe(0);
    });

    it('handles single-character strings', () => {
        expect(jaroWinkler('a', 'a')).toBeCloseTo(1.0, 2);
        expect(jaroWinkler('a', 'b')).toBe(0);
    });
});
