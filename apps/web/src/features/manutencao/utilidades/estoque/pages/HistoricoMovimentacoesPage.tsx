// src/features/estoque/pages/HistoricoMovimentacoesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { listarMovimentacoes, listarPecas, MovimentacaoHistorico } from '../../../../../services/apiClient';
import type { Peca } from '../../../../../types/api';
import styles from './HistoricoMovimentacoesPage.module.css';
import PageHeader from '../../../../../shared/components/PageHeader';
import ExportButtons from '../../../../../shared/components/ExportButtons';
import Skeleton from '../../../../../shared/components/Skeleton';
import { useTranslation } from 'react-i18next';
import { exportToExcel } from '../../../../../utils/exportExcel';
import { exportToPdf } from '../../../../../utils/exportPdf';
import { formatDateTimeShort } from '../../../../../shared/utils/dateUtils';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

interface HistoricoMovimentacoesPageProps {
    user: User;
}

// ---------- Helpers ----------
function formatDate(dateStr: string): string {
    return formatDateTimeShort(dateStr);
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
            console.error('Erro ao carregar movimentações:', e);
        } finally {
            setLoading(false);
        }
    }, [filtroTipo, filtroPecaId, filtroDataInicio, filtroDataFim, pecas.length]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleExportExcel = () => {
        const data = movimentacoes.map(m => ({
            [t('historicoMovimentacoes.table.date', 'Data/Hora')]: formatDate(m.criadoEm),
            [t('historicoMovimentacoes.table.code', 'Código')]: m.pecaCodigo,
            [t('historicoMovimentacoes.table.part', 'Peça')]: m.pecaNome,
            [t('historicoMovimentacoes.table.type', 'Tipo')]: m.tipo === 'entrada'
                ? t('historicoMovimentacoes.types.entry', 'Entrada')
                : t('historicoMovimentacoes.types.exit', 'Saída'),
            [t('historicoMovimentacoes.table.qty', 'Qtd')]: `${m.tipo === 'entrada' ? '+' : '-'}${m.quantidade}`,
            [t('historicoMovimentacoes.table.balance', 'Saldo')]: m.estoqueApos ?? '',
            [t('historicoMovimentacoes.table.description', 'Descrição')]: m.descricao || '',
            [t('historicoMovimentacoes.table.user', 'Usuário')]: m.usuarioNome || ''
        }));
        exportToExcel(data, 'historico_movimentacoes');
    };

    const handleExportPdf = () => {
        const columns = [
            { key: 'dataHora', label: t('historicoMovimentacoes.table.date', 'Data/Hora') },
            { key: 'codigo', label: t('historicoMovimentacoes.table.code', 'Código') },
            { key: 'peca', label: t('historicoMovimentacoes.table.part', 'Peça') },
            { key: 'tipo', label: t('historicoMovimentacoes.table.type', 'Tipo') },
            { key: 'quantidade', label: t('historicoMovimentacoes.table.qty', 'Qtd') },
            { key: 'saldo', label: t('historicoMovimentacoes.table.balance', 'Saldo') },
            { key: 'descricao', label: t('historicoMovimentacoes.table.description', 'Descrição') },
        ];
        const data = movimentacoes.map(m => ({
            dataHora: formatDate(m.criadoEm),
            codigo: m.pecaCodigo,
            peca: m.pecaNome,
            tipo: m.tipo === 'entrada'
                ? t('historicoMovimentacoes.types.entry', 'Entrada')
                : t('historicoMovimentacoes.types.exit', 'Saída'),
            quantidade: `${m.tipo === 'entrada' ? '+' : '-'}${m.quantidade}`,
            saldo: m.estoqueApos !== null ? String(m.estoqueApos) : '-',
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
                title={t('historicoMovimentacoes.title', 'Histórico de Movimentações')}
                subtitle={t('historicoMovimentacoes.subtitle', 'Controle de entradas e saídas de estoque')}
            />

            <div className={styles.listContainer}>
                {/* Filtros */}
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-tipo">{t('historicoMovimentacoes.filters.type', 'Tipo')}</label>
                        <select
                            id="filtro-tipo"
                            value={filtroTipo}
                            onChange={e => setFiltroTipo(e.target.value as '' | 'entrada' | 'saida')}
                            className={styles.select}
                        >
                            <option value="">{t('historicoMovimentacoes.filters.all', 'Todos')}</option>
                            <option value="entrada">{t('historicoMovimentacoes.types.entry', 'Entrada')}</option>
                            <option value="saida">{t('historicoMovimentacoes.types.exit', 'Saída')}</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-peca">{t('historicoMovimentacoes.filters.part', 'Peça')}</label>
                        <select
                            id="filtro-peca"
                            value={filtroPecaId}
                            onChange={e => setFiltroPecaId(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">{t('historicoMovimentacoes.filters.all', 'Todas')}</option>
                            {pecas.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.codigo} - {p.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-data-inicio">{t('historicoMovimentacoes.filters.startDate', 'Data Início')}</label>
                        <input
                            id="filtro-data-inicio"
                            type="date"
                            value={filtroDataInicio}
                            onChange={e => setFiltroDataInicio(e.target.value)}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label htmlFor="filtro-data-fim">{t('historicoMovimentacoes.filters.endDate', 'Data Fim')}</label>
                        <input
                            id="filtro-data-fim"
                            type="date"
                            value={filtroDataFim}
                            onChange={e => setFiltroDataFim(e.target.value)}
                            className={styles.input}
                        />
                    </div>

                    <button onClick={limparFiltros} className={styles.btnSecondary}>
                        {t('historicoMovimentacoes.filters.clear', 'Limpar Filtros')}
                    </button>
                </div>

                {/* Ações */}
                <div className={styles.actions}>
                    <span className={styles.count}>
                        {t('historicoMovimentacoes.count', '{{count}} registro(s) encontrado(s)', { count: movimentacoes.length })}
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
                            <p>{t('historicoMovimentacoes.empty', 'Nenhuma movimentação encontrada.')}</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>{t('historicoMovimentacoes.table.date', 'Data/Hora')}</th>
                                    <th>{t('historicoMovimentacoes.table.code', 'Código')}</th>
                                    <th>{t('historicoMovimentacoes.table.part', 'Peça')}</th>
                                    <th>{t('historicoMovimentacoes.table.type', 'Tipo')}</th>
                                    <th>{t('historicoMovimentacoes.table.qty', 'Qtd')}</th>
                                    <th>{t('historicoMovimentacoes.table.balance', 'Saldo')}</th>
                                    <th>{t('historicoMovimentacoes.table.description', 'Descrição')}</th>
                                    <th>{t('historicoMovimentacoes.table.user', 'Usuário')}</th>
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
                                                {m.tipo === 'entrada'
                                                    ? `↑ ${t('historicoMovimentacoes.types.entry', 'Entrada')}`
                                                    : `↓ ${t('historicoMovimentacoes.types.exit', 'Saída')}`}
                                            </span>
                                        </td>
                                        <td className={styles.quantity}>
                                            {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade}
                                        </td>
                                        <td className={styles.saldo}>
                                            {m.estoqueApos !== null ? m.estoqueApos : '-'}
                                        </td>
                                        <td className={styles.description}>{m.descricao || '-'}</td>
                                        <td className={styles.usuario}>{m.usuarioNome || '-'}</td>
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
