// src/features/chamados/pages/MeusChamados.tsx
import { useEffect, useMemo, useState, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { listarChamadosPorCriador, listarChamados } from '../../../services/apiClient';
import { subscribeSSE } from '../../../services/sseClient';
import styles from './MeusChamados.module.css';
import PageHeader from '../../../shared/components/PageHeader';
import { useTranslation } from 'react-i18next';
import { statusKey } from '../../../i18n/format';
import type { User } from '../../../App';

interface Chamado {
    id: string;
    maquina?: string;
    descricao?: string;
    status: string;
    assignedAt?: string | null;
    dataAbertura?: string;
}

interface ApiChamado {
    id: string;
    maquina?: string;
    descricao?: string;
    status: string;
    criado_em?: string;
}

function tsToDate(ts: string | Date | { toDate: () => Date } | null | undefined): Date | null {
    if (!ts) return null;
    if (typeof ts === 'string') return new Date(ts.replace(' ', 'T'));
    if (typeof (ts as { toDate: () => Date }).toDate === 'function') return (ts as { toDate: () => Date }).toDate();
    if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
    return null;
}

function byRecent(a: Chamado, b: Chamado): number {
    const aKey = tsToDate(a.assignedAt) || tsToDate(a.dataAbertura) || new Date(0);
    const bKey = tsToDate(b.assignedAt) || tsToDate(b.dataAbertura) || new Date(0);
    return bKey.getTime() - aKey.getTime();
}

const BADGE_BY_SK: Record<string, string> = {
    open: 'aberto',
    in_progress: 'emandamento',
    closed: 'concluido'
};

export interface MeusChamadosProps {
    user: User;
}

export default function MeusChamados({ user }: MeusChamadosProps) {
    const { t, i18n } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [docsAssigned, setDocsAssigned] = useState<Chamado[]>([]);
    const [docsAtendidos, setDocsAtendidos] = useState<Chamado[]>([]);
    const [statusFiltro, setStatusFiltro] = useState<'ativos' | 'todos' | 'concluidos'>('ativos');
    const [busca, setBusca] = useState('');

    const [reloadTick, setReloadTick] = useState(0);

    const email = user?.email;
    const role = user?.role;

    const dtFmt = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );
    const formatDate = (v: string | null | undefined): string => {
        const d = tsToDate(v);
        return d ? dtFmt.format(d) : '—';
    };

    useEffect(() => {
        if (!email || !(role === 'manutentor' || role === 'gestor' || role === 'admin')) {
            setDocsAssigned([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        (async () => {
            try {
                const res = await listarChamados({ manutentorEmail: email, page: 1, pageSize: 100 });
                const rows = (res.items ?? res) as ApiChamado[];
                setDocsAssigned(rows.map((r) => ({
                    id: r.id,
                    maquina: r.maquina,
                    descricao: r.descricao,
                    status: r.status || 'Aberto',
                    assignedAt: null,
                    dataAbertura: r.criado_em
                })));
            } catch (e) {
                console.error('Erro manutentorEmail==user:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [email, role, reloadTick]);

    useEffect(() => {
        const unsubscribe = subscribeSSE((msg: { topic?: string }) => {
            if (msg?.topic === 'chamados') setReloadTick(n => n + 1);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!email) return;
        if (role === 'manutentor') {
            setDocsAtendidos([]);
            return;
        }
        (async () => {
            try {
                const res = await listarChamadosPorCriador(email, 1, 100);
                const rows = (res.items ?? res) as ApiChamado[];
                setDocsAtendidos(rows.map((r) => ({
                    id: r.id,
                    maquina: r.maquina,
                    descricao: r.descricao,
                    status: r.status || 'Aberto',
                    assignedAt: null,
                    dataAbertura: r.criado_em
                })));
            } catch (e) {
                console.error('Erro criadoPorEmail==user:', e);
            }
        })();
    }, [email, reloadTick, role]);

    const chamados = useMemo(() => {
        const map = new Map<string, Chamado>();
        const fonte = role === 'manutentor' ? docsAssigned : [...docsAssigned, ...docsAtendidos];
        fonte.forEach(c => map.set(c.id, c));
        let arr = Array.from(map.values());

        if (statusFiltro === 'ativos') {
            arr = arr.filter(c => {
                const sk = statusKey(c.status);
                return sk === 'open' || sk === 'in_progress';
            });
        } else if (statusFiltro === 'concluidos') {
            arr = arr.filter(c => statusKey(c.status) === 'closed');
        }

        const q = busca.trim().toLowerCase();
        if (q) {
            arr = arr.filter(c =>
                (c.maquina || '').toLowerCase().includes(q) ||
                (c.descricao || '').toLowerCase().includes(q)
            );
        }

        arr.sort(byRecent);
        return arr;
    }, [docsAssigned, docsAtendidos, statusFiltro, busca, role]);

    if (!email) {
        return (
            <>
                <PageHeader
                    title={t('meusChamados.title')}
                    subtitle={t('meusChamados.subtitle', 'Acompanhe os chamados atribuídos ou abertos por você.')}
                />
                <div className={styles.listContainer}>
                    <p className={styles.empty}>{t('meusChamados.loginFirst')}</p>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title={t('meusChamados.title')}
                subtitle={t('meusChamados.subtitle', 'Acompanhe os chamados atribuídos ou abertos por você.')}
            />

            <div className={styles.listContainer}>
                <div className={styles.pageHeadActions}>
                    <select
                        className={styles.select}
                        value={statusFiltro}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFiltro(e.target.value as 'ativos' | 'todos' | 'concluidos')}
                        title={t('meusChamados.filters.statusTitle')}
                    >
                        <option value="ativos">{t('meusChamados.filters.active')}</option>
                        <option value="todos">{t('meusChamados.filters.all')}</option>
                        <option value="concluidos">{t('meusChamados.filters.closed')}</option>
                    </select>

                    <input
                        className={`${styles.search} ${styles.pageSearch}`}
                        placeholder={t('meusChamados.filters.searchPlaceholder')}
                        value={busca}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
                    />
                </div>

                <footer className={styles.footer}>
                    <small>{t('meusChamados.footerTip')}</small>
                </footer>

                {loading ? (
                    <p className={styles.loading}>{t('meusChamados.loading')}</p>
                ) : chamados.length === 0 ? (
                    <p className={styles.empty}>{t('meusChamados.empty')}</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>{t('meusChamados.table.hash')}</th>
                                    <th>{t('meusChamados.table.machine')}</th>
                                    <th>{t('meusChamados.table.description')}</th>
                                    <th>{t('meusChamados.table.status')}</th>
                                    <th>{t('meusChamados.table.assignedAt')}</th>
                                    <th>{t('meusChamados.table.openedAt')}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {chamados.map((c, idx) => (
                                    <tr key={c.id}>
                                        <td>{String(idx + 1).padStart(2, '0')}</td>
                                        <td>{c.maquina || '—'}</td>
                                        <td className={styles.descCell} title={c.descricao || ''}>
                                            {(c.descricao || '').slice(0, 80) +
                                                ((c.descricao || '').length > 80 ? '…' : '')}
                                        </td>
                                        <td>
                                            <span
                                                className={`${styles.badge} ${styles[BADGE_BY_SK[statusKey(c.status)] || 'badge']}`}
                                            >
                                                {t(`status.${statusKey(c.status)}`)}
                                            </span>
                                        </td>
                                        <td>{formatDate(c.assignedAt)}</td>
                                        <td>{formatDate(c.dataAbertura)}</td>
                                        <td>
                                            <Link
                                                to={`/maquinas/chamado/${c.id}`}
                                                className={styles.linkBtn}
                                            >
                                                {t('meusChamados.table.open')}
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
