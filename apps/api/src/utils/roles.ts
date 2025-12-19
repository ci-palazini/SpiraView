export function roleToFuncao(role?: string | null): string {
  const normalized = (role ?? '').toLowerCase();

  switch (normalized) {
    case 'gestor industrial':
      return 'Gestor Industrial';
    case 'manutentor':
      return 'Técnico Eletromecânico';
    default:
      return 'Operador de CNC';
  }
}
