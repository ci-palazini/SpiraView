import { describe, it, expect } from 'vitest';
import { slugify } from '../utils/slug';

describe('slugify', () => {
  it('converte texto simples para slug', () => {
    expect(slugify('Hello World')).toBe('hello_world');
  });

  it('remove acentos e caracteres especiais', () => {
    expect(slugify('Manutenção')).toBe('manutencao');
    expect(slugify('Planejamento & Gestão')).toBe('planejamento_gestao');
    expect(slugify('Ação Corretiva')).toBe('acao_corretiva');
  });

  it('remove underscores nas bordas', () => {
    expect(slugify('  texto  ')).toBe('texto');
  });

  it('trata string vazia', () => {
    expect(slugify('')).toBe('');
  });

  it('substitui múltiplos espaços/símbolos por um único underscore', () => {
    expect(slugify('a   b -- c')).toBe('a_b_c');
  });
});
