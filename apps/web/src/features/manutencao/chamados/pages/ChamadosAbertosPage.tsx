// src/features/chamados/pages/ChamadosAbertosPage.tsx
import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { listarChamados } from '../../../../services/apiClient';
import { subscribeSSE } from '../../../../services/sseClient';
import { exportToExcel } from '../../../../utils/exportExcel';
import { exportToPdf } from '../../../../utils/exportPdf';
import styles from './ChamadosAbertosPage.module.css';
import PageHeader from '../../../../shared/components/PageHeader';
import { Select, Input, ExportButtons } from '../../../../shared/components';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';

interface ChamadoAberto {
    id: string;
    maquina?: string;
    tipo?: string;
    descricao?: string;
    manutentorNome?: string;
    dataAbertura?: string | null;
    status?: string;
    prioridade?: string;
}

interface ApiChamado {
    id: string;
    maquina?: string;
    tipo?: string;
    descricao?: string;
    manutentor?: string;
    criado_em?: string;
    status?: string;
    prioridade?: string;
}

type FiltroTipo = 'todos' | 'corretiva' | 'preventiva' | 'preditiva';
type FiltroStatus = 'todos' | 'aberto' | 'em andamento' | 'aguardando';

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

const ChamadosAbertosPage = () => {
    const { t, i18n } = useTranslation();

    const [chamados, setChamados] = useState<ChamadoAberto[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadTick, setReloadTick] = useState(0);

    const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
    const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
    const [filtroMaquina, setFiltroMaquina] = useState('');
    const [busca, setBusca] = useState('');

    const dtFmt = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );

    const chamadosFiltrados = useMemo(() => {
        let arr = Array.isArray(chamados) ? chamados.slice() : [];

        if (filtroTipo && filtroTipo !== 'todos') {
            arr = arr.filter(c => (c.tipo || '').toLowerCase() === filtroTipo.toLowerCase());
        }
        if (filtroStatus && filtroStatus !== 'todos') {
            arr = arr.filter(c => (c.status || '').toLowerCase() === filtroStatus.toLowerCase());
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
            const ad = tsToDate(a.dataAbertura) || new Date(0);
            const bd = tsToDate(b.dataAbertura) || new Date(0);
            return bd.getTime() - ad.getTime();
        });

        return arr;
    }, [chamados, filtroTipo, filtroStatus, filtroMaquina, busca]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                const data = await listarChamados({ page: 1, pageSize: 500 });
                const rows: ApiChamado[] = data.items ?? data;

                const abertos = rows.filter((r: ApiChamado) =>
                    !['Concluido', 'Concluído'].includes(r.status || '')
                );

                const mapped: ChamadoAberto[] = abertos.map((r: ApiChamado) => ({
                    id: r.id,
                    maquina: r.maquina,
                    tipo: r.tipo,
                    descricao: r.descricao,
                    manutentorNome: r.manutentor || '',
                    dataAbertura: r.criado_em || null,
                    status: r.status,
                    prioridade: r.prioridade || 'normal'
                }));

                if (!alive) return;
                setChamados(mapped);
            } catch (e) {
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [reloadTick]);

    useEffect(() => {
        const unsubscribe = subscribeSSE((msg: { topic?: string }) => {
            if (msg?.topic === 'chamados') {
                setReloadTick(n => n + 1);
            }
        });
        return () => unsubscribe();
    }, []);

    function tipoLabel(tipo: string | undefined): string {
        if (tipo === 'corretiva') return t('chamadosAbertos.filters.typeOptions.corrective', 'Corretiva');
        if (tipo === 'preventiva') return t('chamadosAbertos.filters.typeOptions.preventive', 'Preventiva');
        if (tipo === 'preditiva') return t('chamadosAbertos.filters.typeOptions.predictive', 'Preditiva');
        return tipo || '';
    }

    function statusLabel(status: string | undefined): string {
        if (!status) return '';
        const s = status.toLowerCase();
        if (s === 'aberto') return t('chamadosAbertos.status.open', 'Aberto');
        if (s === 'em andamento') return t('chamadosAbertos.status.inProgress', 'Em Andamento');
        if (s === 'aguardando') return t('chamadosAbertos.status.waiting', 'Aguardando');
        return status;
    }

    function statusClass(status: string | undefined): string {
        if (!status) return '';
        const s = status.toLowerCase();
        if (s === 'aberto') return styles.statusAberto;
        if (s === 'em andamento') return styles.statusEmAndamento;
        if (s === 'aguardando') return styles.statusAguardando;
        return '';
    }

    const excelData = chamadosFiltrados.map(c => ({
        [t('chamadosAbertos.export.columns.machine', 'Máquina')]: c.maquina,
        [t('chamadosAbertos.export.columns.type', 'Tipo')]: tipoLabel(c.tipo),
        [t('chamadosAbertos.export.columns.status', 'Status')]: statusLabel(c.status),
        [t('chamadosAbertos.export.columns.openedAt', 'Aberto em')]:
            c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)!) : '',
        [t('chamadosAbertos.export.columns.assignee', 'Responsável')]: c.manutentorNome || '',
        [t('chamadosAbertos.export.columns.description', 'Descrição')]: c.descricao || ''
    }));

    const pdfColumns = [
        { key: 'maquina', label: t('chamadosAbertos.export.columns.machine', 'Máquina') },
        { key: 'tipo', label: t('chamadosAbertos.export.columns.type', 'Tipo') },
        { key: 'status', label: t('chamadosAbertos.export.columns.status', 'Status') },
        { key: 'dataAbertura', label: t('chamadosAbertos.export.columns.openedAt', 'Aberto em') },
        { key: 'manutentorNome', label: t('chamadosAbertos.export.columns.assignee', 'Responsável') },
        { key: 'descricao', label: t('chamadosAbertos.export.columns.description', 'Descrição') }
    ];

    const pdfData = chamadosFiltrados.map(c => ({
        ...c,
        dataAbertura: c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)!) : '',
        tipo: tipoLabel(c.tipo),
        status: statusLabel(c.status)
    }));

    return (
        <>
            <PageHeader
                title={t('chamadosAbertos.title', 'Chamados em Aberto')}
                subtitle={t('chamadosAbertos.subtitle', 'Visualize todos os chamados pendentes de conclusão.')}
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
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i}>
                                    <Skeleton variant="text" width={60} height={20} sx={{ marginBottom: 0.5 }} />
                                    <Skeleton variant="rectangular" width="100%" height={36} sx={{ borderRadius: 1 }} />
                                </div>
                            ))}
                        </div>

                        {/* Skeleton do contador */}
                        <Skeleton variant="text" width={180} height={24} sx={{ marginBottom: 2 }} />

                        {/* Skeleton da lista de chamados */}
                        <ul className={styles.chamadoList} style={{ listStyle: 'none', padding: 0 }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <li key={i} className={styles.chamadoItem} style={{ marginBottom: 12 }}>
                                    <div className={styles.chamadoHeader}>
                                        <Skeleton variant="text" width="40%" height={24} />
                                        <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
                                    </div>
                                    <div className={styles.chamadoInfo}>
                                        <Skeleton variant="text" width="30%" height={16} />
                                        <Skeleton variant="text" width="50%" height={16} />
                                        <Skeleton variant="text" width="90%" height={16} />
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
                                        t('chamadosAbertos.export.sheetName', 'Chamados Abertos'),
                                        'chamados-abertos'
                                    )
                                }
                                onExportPdf={() =>
                                    exportToPdf(pdfData, pdfColumns, 'chamados-abertos')
                                }
                            />
                        </div>

                        <div className={styles.filterContainer}>
                            <Select
                                id="filtroTipo"
                                label={t('chamadosAbertos.filters.byType', 'Tipo')}
                                value={filtroTipo}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFiltroTipo(e.target.value as FiltroTipo)}
                            >
                                <option value="todos">{t('chamadosAbertos.filters.typeOptions.all', 'Todos')}</option>
                                <option value="corretiva">{t('chamadosAbertos.filters.typeOptions.corrective', 'Corretiva')}</option>
                                <option value="preventiva">{t('chamadosAbertos.filters.typeOptions.preventive', 'Preventiva')}</option>
                                <option value="preditiva">{t('chamadosAbertos.filters.typeOptions.predictive', 'Preditiva')}</option>
                            </Select>

                            <Select
                                id="filtroStatus"
                                label={t('chamadosAbertos.filters.byStatus', 'Status')}
                                value={filtroStatus}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFiltroStatus(e.target.value as FiltroStatus)}
                            >
                                <option value="todos">{t('chamadosAbertos.filters.statusOptions.all', 'Todos')}</option>
                                <option value="aberto">{t('chamadosAbertos.filters.statusOptions.open', 'Aberto')}</option>
                                <option value="em andamento">{t('chamadosAbertos.filters.statusOptions.inProgress', 'Em Andamento')}</option>
                                <option value="aguardando">{t('chamadosAbertos.filters.statusOptions.waiting', 'Aguardando')}</option>
                            </Select>

                            <Input
                                id="filtroMaquina"
                                label={t('chamadosAbertos.filters.byMachine', 'Máquina')}
                                value={filtroMaquina}
                                onChange={(e) => setFiltroMaquina(e.target.value)}
                                placeholder={t('chamadosAbertos.filters.allMachines', 'Todas')}
                            />

                            <Input
                                id="busca"
                                label={t('chamadosAbertos.filters.search', 'Busca')}
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder={t('chamadosAbertos.filters.searchPlaceholder', 'Descrição ou responsável...')}
                            />
                        </div>

                        <p className={styles.contador}>
                            {t('chamadosAbertos.count', { count: chamadosFiltrados.length, defaultValue: '{{count}} chamado(s) encontrado(s)' })}
                        </p>

                        {chamadosFiltrados.length === 0 ? (
                            <p className={styles.empty}>{t('chamadosAbertos.empty', 'Nenhum chamado em aberto.')}</p>
                        ) : (
                            <ul className={styles.chamadoList}>
                                {chamadosFiltrados.map((chamado) => (
                                    <Link
                                        to={`/maquinas/chamado/${chamado.id}`}
                                        key={chamado.id}
                                        className={styles.chamadoLink}
                                    >
                                        <li className={`${styles.chamadoItem} ${statusClass(chamado.status)}`}>
                                            <div className={styles.chamadoHeader}>
                                                <strong>{chamado.maquina}</strong>
                                                <span className={styles.statusBadge}>{statusLabel(chamado.status)}</span>
                                            </div>
                                            <div className={styles.chamadoInfo}>
                                                <small>
                                                    <strong>{t('chamadosAbertos.item.type', 'Tipo')}:</strong> {tipoLabel(chamado.tipo)}
                                                </small>
                                                <small>
                                                    <strong>{t('chamadosAbertos.item.openedAt', 'Aberto em')}:</strong>{' '}
                                                    {chamado.dataAbertura ? dtFmt.format(tsToDate(chamado.dataAbertura)!) : '...'}
                                                </small>
                                                {chamado.manutentorNome && (
                                                    <small>
                                                        <strong>{t('chamadosAbertos.item.assignee', 'Responsável')}:</strong>{' '}
                                                        {chamado.manutentorNome}
                                                    </small>
                                                )}
                                                <p className={styles.descricaoPreview}>
                                                    {chamado.descricao || t('chamadosAbertos.item.noDescription', 'Sem descrição')}
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

export default ChamadosAbertosPage;
