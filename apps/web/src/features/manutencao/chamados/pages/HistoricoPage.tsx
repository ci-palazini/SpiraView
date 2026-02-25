// src/features/chamados/pages/HistoricoPage.tsx
import { useState, useEffect, useMemo, useCallback, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { listarChamados } from '../../../../services/apiClient';
import useSSE from '../../../../hooks/useSSE';
import { exportToExcel } from '../../../../utils/exportExcel';
import { exportToPdf } from '../../../../utils/exportPdf';
import styles from './HistoricoPage.module.css';
import PageHeader from '../../../../shared/components/PageHeader';
import ExportButtons from '../../../../shared/components/ExportButtons';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';

interface ChamadoConcluido {
    id: string;
    maquina?: string;
    tipo?: string;
    descricao?: string;
    manutentorNome?: string;
    dataAbertura?: string | null;
    dataConclusao?: string | null;
    solucao?: string;
    causa?: string;
    status?: string;
}

interface ApiChamado {
    id: string;
    maquina?: string;
    tipo?: string;
    descricao?: string;
    manutentor?: string;
    criado_em?: string;
    concluido_em?: string;
    solucao?: string;
    causa?: string;
    status?: string;
}

type FiltroTipo = 'todos' | 'corretiva' | 'preventiva' | 'preditiva';

function tsToDate(ts: string | Date | { toDate: () => Date } | null | undefined): Date | null {
    if (!ts) return null;
    if (typeof ts === 'string') return new Date(ts.replace(' ', 'T'));
    if (ts instanceof Date) {
        return isNaN(ts.getTime()) ? null : ts;
    }
    if (typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
        return ts.toDate();
    }
    return null;
}

const HistoricoPage = () => {
    const { t, i18n } = useTranslation();

    const [chamadosConcluidos, setChamadosConcluidos] = useState<ChamadoConcluido[]>([]);
    const [loading, setLoading] = useState(true);

    const [filtroTipoChamado, setFiltroTipoChamado] = useState<FiltroTipo>('todos');
    const [filtroMaquina, setFiltroMaquina] = useState('');
    const [busca, setBusca] = useState('');

    const dtFmt = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );

    const historicoFiltrado = useMemo(() => {
        let arr = Array.isArray(chamadosConcluidos) ? chamadosConcluidos.slice() : [];

        if (filtroTipoChamado && filtroTipoChamado !== 'todos') {
            arr = arr.filter(c => (c.tipo || '').toLowerCase() === filtroTipoChamado.toLowerCase());
        }
        if (filtroMaquina.trim()) {
            const q = filtroMaquina.trim().toLowerCase();
            arr = arr.filter(c => (c.maquina || '').toLowerCase().includes(q));
        }
        if (busca.trim()) {
            const q = busca.trim().toLowerCase();
            arr = arr.filter(c =>
                (c.descricao || '').toLowerCase().includes(q) ||
                (c.manutentorNome || '').toLowerCase().includes(q)
            );
        }

        arr.sort((a, b) => {
            const ad = tsToDate(a.dataConclusao) || tsToDate(a.dataAbertura) || new Date(0);
            const bd = tsToDate(b.dataConclusao) || tsToDate(b.dataAbertura) || new Date(0);
            return bd.getTime() - ad.getTime();
        });

        return arr;
    }, [chamadosConcluidos, filtroTipoChamado, filtroMaquina, busca]);

    const loadConcluidos = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listarChamados({ status: 'Concluido', page: 1, pageSize: 500 });
            const rows: ApiChamado[] = data.items ?? data;

            const mapped: ChamadoConcluido[] = rows.map((r: ApiChamado) => ({
                id: r.id,
                maquina: r.maquina,
                tipo: r.tipo,
                descricao: r.descricao,
                manutentorNome: r.manutentor || '',
                dataAbertura: r.criado_em || null,
                dataConclusao: r.concluido_em || null,
                solucao: r.solucao || '',
                causa: r.causa || '',
                status: r.status
            }));

            setChamadosConcluidos(mapped);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConcluidos(); }, [loadConcluidos]);

    useSSE('chamados', loadConcluidos);

    function tipoLabel(tipo: string | undefined): string {
        if (tipo === 'corretiva') return t('historico.filters.typeOptions.corrective');
        if (tipo === 'preventiva') return t('historico.filters.typeOptions.preventive');
        if (tipo === 'preditiva') return t('historico.filters.typeOptions.predictive');
        return tipo || '';
    }

    const excelData = historicoFiltrado.map(c => ({
        [t('historico.export.columns.machine')]: c.maquina,
        [t('historico.export.columns.callType')]: tipoLabel(c.tipo),
        [t('historico.export.columns.openedAt')]:
            c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)!) : '',
        [t('historico.export.columns.attendedBy')]: c.manutentorNome || '',
        [t('historico.export.columns.performedService')]: c.solucao || '',
        [t('historico.export.columns.cause')]: c.causa || '',
        [t('historico.export.columns.concludedAt')]:
            c.dataConclusao ? dtFmt.format(tsToDate(c.dataConclusao)!) : '',
        [t('historico.export.columns.problem')]: c.descricao || ''
    }));

    const pdfColumns = [
        { key: 'maquina', label: t('historico.export.columns.machine') },
        { key: 'tipo', label: t('historico.export.columns.callType') },
        { key: 'dataAbertura', label: t('historico.export.columns.openedAt') },
        { key: 'manutentorNome', label: t('historico.export.columns.attendedBy') },
        { key: 'solucao', label: t('historico.export.columns.performedService') },
        { key: 'causa', label: t('historico.export.columns.cause') },
        { key: 'dataConclusao', label: t('historico.export.columns.concludedAt') },
        { key: 'descricao', label: t('historico.export.columns.problem') }
    ];

    const pdfData = historicoFiltrado.map(c => ({
        ...c,
        dataAbertura: c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)!) : '',
        dataConclusao: c.dataConclusao ? dtFmt.format(tsToDate(c.dataConclusao)!) : '',
        tipo: tipoLabel(c.tipo)
    }));

    return (
        <>
            <PageHeader
                title={t('historico.title')}
                subtitle={t('historico.subtitle', 'Veja o histórico de chamados concluídos e filtre por tipo, máquina ou texto.')}
            />

            <div className={styles.listContainer}>
                {loading ? (
                    <>
                        {/* Skeleton dos botões de export */}
                        <div className={styles.exportButtons}>
                            <Skeleton variant="rectangular" width={120} height={36} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="rectangular" width={120} height={36} sx={{ borderRadius: 1 }} />
                        </div>

                        {/* Skeleton dos filtros */}
                        <div className={styles.filterContainer}>
                            {[1, 2, 3].map((i) => (
                                <div key={i}>
                                    <Skeleton variant="text" width={60} height={20} sx={{ marginBottom: 0.5 }} />
                                    <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: 1 }} />
                                </div>
                            ))}
                        </div>

                        {/* Skeleton da lista de chamados */}
                        <ul className={styles.chamadoList} style={{ listStyle: 'none', padding: 0 }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <li key={i} className={styles.chamadoItem} style={{ marginBottom: 12 }}>
                                    <div className={styles.chamadoInfo}>
                                        <Skeleton variant="text" width="50%" height={24} />
                                        <Skeleton variant="text" width="40%" height={16} />
                                        <Skeleton variant="text" width="35%" height={16} />
                                        <Skeleton variant="text" width="90%" height={16} sx={{ marginTop: 1 }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <>
                        <div style={{ marginBottom: 20 }}>
                            <ExportButtons
                                onExportExcel={() =>
                                    exportToExcel(
                                        excelData,
                                        t('historico.export.sheetName'),
                                        'historico-chamados'
                                    )
                                }
                                onExportPdf={() =>
                                    exportToPdf(pdfData, pdfColumns, 'historico-chamados')
                                }
                            />
                        </div>

                        <div className={styles.filterContainer}>
                            <div>
                                <label htmlFor="filtroTipoChamado">
                                    {t('historico.filters.byType')}
                                </label>
                                <select
                                    id="filtroTipoChamado"
                                    className={styles.select}
                                    value={filtroTipoChamado}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFiltroTipoChamado(e.target.value as FiltroTipo)}
                                >
                                    <option value="todos">
                                        {t('historico.filters.typeOptions.all')}
                                    </option>
                                    <option value="corretiva">
                                        {t('historico.filters.typeOptions.corrective')}
                                    </option>
                                    <option value="preventiva">
                                        {t('historico.filters.typeOptions.preventive')}
                                    </option>
                                    <option value="preditiva">
                                        {t('historico.filters.typeOptions.predictive')}
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="filtroMaquina">
                                    {t('historico.filters.byMachine')}
                                </label>
                                <input
                                    id="filtroMaquina"
                                    className={styles.select}
                                    value={filtroMaquina}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFiltroMaquina(e.target.value)}
                                    placeholder={t('historico.filters.machineOptions.all')}
                                />
                            </div>

                            <div>
                                <label htmlFor="busca">
                                    {t('historico.filters.search') || 'Busca'}
                                </label>
                                <input
                                    id="busca"
                                    className={styles.select}
                                    value={busca}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
                                    placeholder={
                                        t('historico.filters.searchPlaceholder') ||
                                        t('historico.item.problem')
                                    }
                                />
                            </div>
                        </div>

                        {historicoFiltrado.length === 0 ? (
                            <p className={styles.empty}>{t('historico.empty')}</p>
                        ) : (
                            <ul className={styles.chamadoList}>
                                {historicoFiltrado.map((chamado) => (
                                    <Link
                                        to={`chamado/${chamado.id}`}
                                        key={chamado.id}
                                        className={styles.chamadoLink}
                                    >
                                        <li className={styles.chamadoItem}>
                                            <div className={styles.chamadoInfo}>
                                                <strong>
                                                    {t('historico.item.machine', {
                                                        name: chamado.maquina
                                                    })}
                                                </strong>
                                                <small>
                                                    {t('historico.item.attendedBy', {
                                                        name:
                                                            chamado.manutentorNome ||
                                                            t('historico.item.unknown')
                                                    })}
                                                </small>
                                                <small>
                                                    {t('historico.item.concludedAt', {
                                                        date: chamado.dataConclusao
                                                            ? dtFmt.format(tsToDate(chamado.dataConclusao)!)
                                                            : '...'
                                                    })}
                                                </small>
                                                <p className={styles.problemaPreview}>
                                                    <strong>{t('historico.item.problem')}</strong>{' '}
                                                    {chamado.descricao ||
                                                        t('historico.item.notSpecified')}
                                                </p>
                                            </div>
                                        </li>
                                    </Link>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </>
    );
};

export default HistoricoPage;
