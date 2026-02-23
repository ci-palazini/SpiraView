import { describe, it, expect } from 'vitest';
import { hasPermission } from '../middlewares/requirePermission';

describe('hasPermission', () => {
  describe('nível "ver"', () => {
    it('permite quando o usuário tem "ver"', () => {
      expect(hasPermission('ver', 'ver')).toBe(true);
    });

    it('permite quando o usuário tem "editar" (nível superior)', () => {
      expect(hasPermission('editar', 'ver')).toBe(true);
    });

    it('nega quando o usuário tem "nenhum"', () => {
      expect(hasPermission('nenhum', 'ver')).toBe(false);
    });

    it('nega quando a permissão é undefined', () => {
      expect(hasPermission(undefined, 'ver')).toBe(false);
    });
  });

  describe('nível "editar"', () => {
    it('permite quando o usuário tem "editar"', () => {
      expect(hasPermission('editar', 'editar')).toBe(true);
    });

    it('nega quando o usuário tem apenas "ver"', () => {
      expect(hasPermission('ver', 'editar')).toBe(false);
    });

    it('nega quando o usuário tem "nenhum"', () => {
      expect(hasPermission('nenhum', 'editar')).toBe(false);
    });

    it('nega quando a permissão é undefined', () => {
      expect(hasPermission(undefined, 'editar')).toBe(false);
    });
  });
});
