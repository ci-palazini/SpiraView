import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './PdcaPlanosPage.module.css';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Plano {
    id: string;
    titulo: string;
    tipo: string;
    origem: string;
    status: string;
    criado_por_email: string;
    created_at: string;
    total_causas: number;
}

export default function PdcaPlanosPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [planos, setPlanos] = useState<Plano[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // New Plan Modal
    const [showModal, setShowModal] = useState(false);
    const [titulo, setTitulo] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadPlanos();
    }, [statusFilter]);

    const loadPlanos = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            const res = await http.get<{ items: Plano[] }>(`/pdca/planos?${params.toString()}`);
            setPlanos(res.items || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePlan = async () => {
        if (!titulo.trim()) {
            toast.error(t('pdca.titleRequired', 'Título é obrigatório'));
            return;
        }
        setCreating(true);
        try {
            const res = await http.post<{ id: string }>('/pdca/planos', { data: { titulo } });
            toast.success(t('pdca.planCreated', 'Plano criado!'));
            setShowModal(false);
            setTitulo('');
            navigate(`/pdca/planos/${res.id}`);
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.createError', 'Erro ao criar plano'));
        } finally {
            setCreating(false);
        }
    };

    const handleDeletePlan = async (e: React.MouseEvent, planoId: string, titulo: string) => {
        e.stopPropagation(); // Prevent row click navigation
        if (!window.confirm(t('pdca.confirmDelete', `Tem certeza que deseja excluir o plano "${titulo}"? Todas as causas serão excluídas e registros vinculados serão desvinculados.`))) return;

        try {
            await http.delete(`/pdca/planos/${planoId}`);
            toast.success(t('pdca.deleteSuccess', 'Plano excluído com sucesso!'));
            loadPlanos();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || t('pdca.deleteError', 'Erro ao excluir plano.'));
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return '-';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'aberto': return t('pdca.statusOpen', 'Aberto');
            case 'em_andamento': return t('pdca.statusProgress', 'Em Andamento');
            case 'concluido': return t('pdca.statusDone', 'Concluído');
            default: return status;
        }
    };

    const filteredPlanos = planos.filter(p =>
        p.titulo?.toLowerCase().includes(search.toLowerCase()) ||
        p.origem?.toLowerCase().includes(search.toLowerCase()) ||
        p.tipo?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <PageHeader
                title={t('pdca.planosTitle', 'Planos de Ação')}
                subtitle={t('pdca.planosSubtitle', 'Gerencie todos os planos de ação PDCA')}
            />

            <div className={styles.container}>
                <div className={styles.content}>
                    <div className={styles.filters}>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder={t('pdca.searchPlaceholder', 'Buscar por título, origem ou tipo...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <select
                            className={styles.statusFilter}
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="">{t('pdca.allStatuses', 'Todos os status')}</option>
                            <option value="aberto">{t('pdca.statusOpen', 'Aberto')}</option>
                            <option value="em_andamento">{t('pdca.statusProgress', 'Em Andamento')}</option>
                            <option value="concluido">{t('pdca.statusDone', 'Concluído')}</option>
                        </select>
                        <button className={styles.newBtn} onClick={() => setShowModal(true)}>
                            <Plus size={18} />
                            {t('pdca.newPlan', 'Novo Plano')}
                        </button>
                    </div>

                    {loading ? (
                        <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                    ) : filteredPlanos.length === 0 ? (
                        <div className={styles.empty}>{t('pdca.noPlans', 'Nenhum plano encontrado')}</div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>{t('pdca.title', 'Título')}</th>
                                    <th>{t('pdca.type', 'Tipo')}</th>
                                    <th>{t('pdca.origin', 'Origem')}</th>
                                    <th>{t('pdca.status', 'Status')}</th>
                                    <th>{t('pdca.causes', 'Causas')}</th>
                                    <th>{t('pdca.createdAt', 'Criado em')}</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>{t('common.actions', 'Ações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlanos.map(plano => (
                                    <tr key={plano.id} onClick={() => navigate(`/pdca/planos/${plano.id}`)}>
                                        <td><strong>{plano.titulo}</strong></td>
                                        <td>{plano.tipo || '-'}</td>
                                        <td>{plano.origem || '-'}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${styles[plano.status]}`}>
                                                {getStatusLabel(plano.status)}
                                            </span>
                                        </td>
                                        <td>{plano.total_causas || 0}</td>
                                        <td className={styles.dateCell}>{formatDate(plano.created_at)}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={(e) => handleDeletePlan(e, plano.id, plano.titulo)}
                                                title={t('pdca.deletePlan', 'Excluir plano')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* New Plan Modal */}
                {showModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                        <div className={styles.modal} onClick={e => e.stopPropagation()}>
                            <h2 className={styles.modalTitle}>{t('pdca.newPlanTitle', 'Novo Plano de Ação')}</h2>
                            <div className={styles.formGroup}>
                                <label>{t('pdca.planTitle', 'Título do Plano')}</label>
                                <input
                                    type="text"
                                    value={titulo}
                                    onChange={e => setTitulo(e.target.value)}
                                    placeholder={t('pdca.planTitlePlaceholder', 'Ex: Reduzir refugo...')}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                                    {t('common.cancel', 'Cancelar')}
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    onClick={handleCreatePlan}
                                    disabled={creating || !titulo.trim()}
                                >
                                    {creating ? t('common.creating', 'Criando...') : t('pdca.createPlan', 'Criar')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
