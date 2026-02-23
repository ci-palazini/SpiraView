import { describe, it, expect } from 'vitest';
import { roleToFuncao } from '../utils/roles';

describe('roleToFuncao', () => {
  it('retorna "Gestor Industrial" para o role "gestor industrial"', () => {
    expect(roleToFuncao('gestor industrial')).toBe('Gestor Industrial');
  });

  it('é case-insensitive', () => {
    expect(roleToFuncao('Gestor Industrial')).toBe('Gestor Industrial');
    expect(roleToFuncao('MANUTENTOR')).toBe('Técnico Eletromecânico');
  });

  it('retorna "Técnico Eletromecânico" para o role "manutentor"', () => {
    expect(roleToFuncao('manutentor')).toBe('Técnico Eletromecânico');
  });

  it('retorna "Operador de CNC" para roles desconhecidos', () => {
    expect(roleToFuncao('qualquer-coisa')).toBe('Operador de CNC');
    expect(roleToFuncao('')).toBe('Operador de CNC');
    expect(roleToFuncao(null)).toBe('Operador de CNC');
    expect(roleToFuncao(undefined)).toBe('Operador de CNC');
  });
});
