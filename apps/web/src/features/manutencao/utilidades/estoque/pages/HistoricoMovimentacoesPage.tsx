// src/features/estoque/pages/HistoricoMovimentacoesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { listarMovimentacoes, listarPecas, MovimentacaoHistorico } from '../../../../../services/apiClient';
import type { Peca } from '../../../../../types/api';
import styles from './HistoricoMovimentacoesPage.module.css';
import PageHeader from '../../../../../shared/components/PageHeader';
import ExportButtons from '../../../../../shared/components/ExportButtons';
import Skeleton from '@mui/material/Skeleton';
import { useTranslation } from 'react-i18next';
import { exportToExcel } from '../../../../../utils/exportExcel';
import { exportToPdf } from '../../../../../utils/exportPdf';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface HistoricoMovimentacoesPageProps {
    user: User;
}

// ---------- Helpers ----------
function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ---------- Component ----------
export default function HistoricoMovimentacoesPage({ user }: HistoricoMovimentacoesPageProps) {
    const { t } = useTranslation();

    const [movimentacoes, setMovimentacoes] = useState<MovimentacaoHistorico[]>([]);
    const [pecas, setPecas] = useState<Peca[]>([]);
    const [loading, setLoading] = useState(true);

    // Filtros
    const [filtroTipo, setFiltroTipo] = useState<'' | 'entrada' | 'saida'>('');
    const [filtroPecaId, setFiltroPecaId] = useState('');
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [movs, pecasList] = await Promise.all([
                listarMovimentacoes({
                    tipo: filtroTipo || undefined,
                    pecaId: filtroPecaId || undefined,
                    dataInicio: filtroDataInicio || undefined,
                    dataFim: filtroDataFim || undefined,
                    limit: 200
                }),
                pecas.length ? Promise.resolve(pecas) : listarPecas()
            ]);
            setMovimentacoes(movs);
            if (!pecas.length) setPecas(pecasList);
        } catch (e) {
            console.error('Erro ao carregar movimentaÃ§Ãµes:', e);
        } finally {
            setLoading(false);
        }
    }, [filtroTipo, filtroPecaId, filtroDataInicio, filtroDataFim, pecas.length]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleExportExcel = () => {
        const data = movimentacoes.map(m => ({
            'Data/Hora': formatDate(m.criadoEm),
            'CÃ³digo': m.pecaCodigo,
            'PeÃ§a': m.pecaNome,
            'Tipo': m.tipo === 'entrada' ? 'Entrada' : 'SaÃ­da',
            'Quantidade': `${m.tipo === 'entrada' ? '+' : '-'}${m.quantidade}`,
            'Saldo': m.estoqueApos ?? '',
            'DescriÃ§Ã£o': m.descricao || '',
            'UsuÃ¡rio': m.usuarioNome || ''
        }));
        exportToExcel(data, 'historico_movimentacoes');
    };

    const handleExportPdf = () => {
        const columns = [
            { key: 'dataHora', label: 'Data/Hora' },
            { key: 'codigo', label: 'CÃ³digo' },
            { key: 'peca', label: 'PeÃ§a' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'quantidade', label: 'Qtd' },
            { key: 'saldo', label: 'Saldo' },
            { key: 'descricao', label: 'DescriÃ§Ã£o' },
        ];
        const data = movimentacoes.map(m => ({
            dataHora: formatDate(m.criadoEm),
            codigo: m.pecaCodigo,
            peca: m.pecaNome,
            tipo: m.tipo === 'entrada' ? 'Entrada' : 'SaÃ­da',
            quantidade: `${m.tipo === 'entrada' ? '+' : '-'}${m.quantidade}`,
            saldo: m.estoqueApos !== null ? String(m.estoqueApos) : 'â€”',
            descricao: m.descricao || ''
        }));
        exportToPdf(data, columns, 'historico_movimentacoes');
    };

    const limparFiltros = () => {
        setFiltroTipo('');
        setFiltroPecaId('');
        setFiltroDataInicio('');
        setFiltroDataFim('');
    };

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('estoque.historicoMovimentacoes', 'HistÃ³rico de MovimentaÃ§Ãµes')}
                subtitle={t('estoque.historicoSubtitle', 'Controle de entradas e saÃ­das de estoque')}
            />

            <div className={styles.listContainer}>
                {/* Filtros */}
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-tipo">Tipo</label>
                        <select
                            id="filtro-tipo"
                            value={filtroTipo}
                            onChange={e => setFiltroTipo(e.target.value as '' | 'entrada' | 'saida')}
                            className={styles.select}
                        >
                            <option value="">Todos</option>
                            <option value="entrada">Entrada</option>
                            <option value="saida">SaÃ­da</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-peca">PeÃ§a</label>
                        <select
                            id="filtro-peca"
                            value={filtroPecaId}
                            onChange={e => setFiltroPecaId(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">Todas</option>
                            {pecas.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.codigo} - {p.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-data-inicio">Data InÃ­cio</label>
                        <input
                            id="filtro-data-inicio"
                            type="date"
                            value={filtroDataInicio}
                            onChange={e => setFiltroDataInicio(e.target.value)}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-data-fim">Data Fim</label>
                        <input
                            id="filtro-data-fim"
                            type="date"
                            value={filtroDataFim}
                            onChange={e => setFiltroDataFim(e.target.value)}
                            className={styles.input}
                        />
                    </div>

                    <button onClick={limparFiltros} className={styles.btnSecondary}>
                        Limpar Filtros
                    </button>
                </div>

                {/* AÃ§Ãµes */}
                <div className={styles.actions}>
                    <span className={styles.count}>
                        {movimentacoes.length} registro{movimentacoes.length !== 1 ? 's' : ''} encontrado{movimentacoes.length !== 1 ? 's' : ''}
                    </span>
                    <ExportButtons
                        onExportExcel={handleExportExcel}
                        onExportPdf={handleExportPdf}
                    />
                </div>

                {/* Tabela */}
                <div className={styles.tableWrapper}>
                    {loading ? (
                        <div className={styles.skeletonContainer}>
                            {[...Array(8)].map((_, i) => (
                                <Skeleton key={i} height={48} style={{ marginBottom: 8 }} />
                            ))}
                        </div>
                    ) : movimentacoes.length === 0 ? (
                        <div className={styles.empty}>
                            <p>Nenhuma movimentaÃ§Ã£o encontrada.</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>CÃ³digo</th>
                                    <th>PeÃ§a</th>
                                    <th>Tipo</th>
                                    <th>Qtd</th>
                                    <th>Saldo</th>
                                    <th>DescriÃ§Ã£o</th>
                                    <th>UsuÃ¡rio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movimentacoes.map(m => (
                                    <tr key={m.id}>
                                        <td>{formatDate(m.criadoEm)}</td>
                                        <td><code>{m.pecaCodigo}</code></td>
                                        <td>{m.pecaNome}</td>
                                        <td>
                                            <span className={`${styles.badge} ${styles[m.tipo]}`}>
                                                {m.tipo === 'entrada' ? 'â†‘ Entrada' : 'â†“ SaÃ­da'}
                                            </span>
                                        </td>
                                        <td className={styles.quantity}>
                                            {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade}
                                        </td>
                                        <td className={styles.saldo}>
                                            {m.estoqueApos !== null ? m.estoqueApos : 'â€”'}
                                        </td>
                                        <td className={styles.description}>{m.descricao || 'â€”'}</td>
                                        <td className={styles.usuario}>{m.usuarioNome || 'â€”'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
