import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiActivity, FiImage, FiClock, FiSettings, FiCheckSquare, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Skeleton from '../../../shared/components/Skeleton';

import PageHeader from '../../../shared/components/PageHeader';
import {
    listarKaizens,
    getKamishibaiDashboard
} from '../../../services/apiClient';
import type { Kaizen, KamishibaiDashboardData } from '@spiraview/shared';
import KaizenFormModal from '../components/KaizenFormModal';
import KaizenDetailsModal from '../components/KaizenDetailsModal';
import KamishibaiConfigModal from '../components/KamishibaiConfigModal';
import KamishibaiAuditModal from '../components/KamishibaiAuditModal';
import usePermissions from '../../../hooks/usePermissions';
import styles from './KaizenDashboardPage.module.css';

interface User {
    role?: string;
    email?: string;
}

interface KaizenDashboardPageProps {
    user: User;
}

// Helpers
function formatDateBR(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('pt-BR');
    } catch {
        return iso;
    }
}

export default function KaizenDashboardPage({ user }: KaizenDashboardPageProps) {
    const { t } = useTranslation();
    const [kaizens, setKaizens] = useState<Kaizen[]>([]);
    const [dashboardData, setDashboardData] = useState<KamishibaiDashboardData>({
        totalOK: 0,
        totalNOK: 0,
        totalPendente: 0
    });
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const { canEdit } = usePermissions(user);const hasEditPermission = canEdit('melhoria_continua');

    // Details Modal state
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    // Form Modal states
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);

    // Config Modal states
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    // Audit Modal states
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

    // Common states
    const [selectedKaizen, setSelectedKaizen] = useState<Kaizen | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [kData, dashData] = await Promise.all([
                listarKaizens(statusFilter ? { status: statusFilter } : {}),
                getKamishibaiDashboard()
            ]);
            setKaizens(kData.items);
            setDashboardData(dashData);
        } catch (err) {
            console.error(err);
            toast.error(t('common.error', 'Erro ao carregar dados'));
        } finally {
            setLoading(false);
        }
    }, [t, statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleNewKaizen = () => {
        setSelectedKaizen(null);
        setIsFormModalOpen(true);
    };

    const handleCardClick = (k: Kaizen) => {
        setSelectedKaizen(k);
        setIsDetailsModalOpen(true);
    };

    const handleEditFromDetails = () => {
        setIsDetailsModalOpen(false);
        setIsFormModalOpen(true);
    };

    const handleFormModalClose = () => {
        setIsFormModalOpen(false);
        setSelectedKaizen(null);
    };

    const handleKaizenSaved = () => {
        setIsFormModalOpen(false);
        fetchData();
    };

    const handleConfigClick = (k: Kaizen) => {
        setSelectedKaizen(k);
        setIsConfigModalOpen(true);
    };

    const handleConfigClose = () => {
        setIsConfigModalOpen(false);
        setSelectedKaizen(null);
    };

    const handleAuditClick = (k: Kaizen) => {
        setSelectedKaizen(k);
        setIsAuditModalOpen(true);
    };

    const handleAuditClose = () => {
        setIsAuditModalOpen(false);
        setSelectedKaizen(null);
    };

    return (
        <>
            <PageHeader
                title={t('melhoriaContinua.kaizens.title', 'Kaizens & Kamishibai')}
                subtitle={t('melhoriaContinua.kaizens.subtitle', 'Gestão de Melhoria Contínua e Auditorias Visuais')}
            />

            <div className={styles.container}>
                <div className={styles.headerActions}>
                    <button className={styles.newButton} onClick={handleNewKaizen}>
                        <FiPlus />
                        {t('common.new', 'Novo')} Kaizen
                    </button>
                </div>

                <div className={styles.headerGrid}>
                    <div className={styles.filterCard}>
                        <label className={styles.inputLabel}>Filtro de Status</label>
                        <select
                            className={styles.filterInput}
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="">Todos</option>
                            <option value="planejado">Planejados</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluídos</option>
                            <option value="padronizado">Padronizados</option>
                        </select>
                    </div>

                    <div className={styles.summaryCard}>
                        <div className={styles.summaryHeader}>
                            <span className={styles.summaryTitle}>
                                <FiActivity />
                                {t('melhoriaContinua.summary.title', 'Status Kamishibai (Total)')}
                            </span>
                        </div>
                        {loading ? (
                            <Skeleton variant="rectangular" height={80} style={{ borderRadius: '8px' }} />
                        ) : (
                            <div className={styles.summaryStats}>
                                <div className={`${styles.statBox} ${styles.ok}`}>
                                    <span className={styles.statValue}>{dashboardData.totalOK}</span>
                                    <span className={styles.statLabel}>Conforme</span>
                                </div>
                                <div className={`${styles.statBox} ${styles.nok}`}>
                                    <span className={styles.statValue}>{dashboardData.totalNOK}</span>
                                    <span className={styles.statLabel}>Não Conforme</span>
                                </div>
                                <div className={`${styles.statBox} ${styles.pendente}`}>
                                    <span className={styles.statValue}>{dashboardData.totalPendente}</span>
                                    <span className={styles.statLabel}>Pendentes</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {loading && (
                    <div className={styles.cardsGrid}>
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} variant="rounded" height={300} style={{ borderRadius: '16px' }} />
                        ))}
                    </div>
                )}

                {!loading && kaizens.length === 0 && (
                    <div className={styles.emptyState}>
                        <FiImage className={styles.emptyIcon} />
                        <p>{t('melhoriaContinua.kaizens.empty', 'Nenhum Kaizen cadastrado ainda. Clique em Novo para começar.')}</p>
                    </div>
                )}

                {!loading && kaizens.length > 0 && (
                    <div className={styles.cardsGrid}>
                        {kaizens.map(k => {
                            const statusKam = k.kamishibaiStatus || 'planejado';
                            const isAudited = statusKam === 'OK' || statusKam === 'NOK';
                            const isConforme = statusKam === 'OK';

                            return (
                                <div key={k.id} className={styles.kaizenCard} onClick={() => handleCardClick(k)}>
                                    <div className={styles.badgeGroup}>
                                        {isAudited ? (
                                            <>
                                                <span className={`${styles.statusRibbon} ${styles.audited}`}>
                                                    <FiCheck size={11} /> Auditado
                                                </span>
                                                <span className={`${styles.statusRibbon} ${isConforme ? styles.ok : styles.nok}`}>
                                                    {isConforme ? <FiCheck size={11} /> : <FiX size={11} />}
                                                    {isConforme ? 'Conforme' : 'Não Conforme'}
                                                </span>
                                            </>
                                        ) : (
                                            <span className={`${styles.statusRibbon} ${statusKam === 'Pendente' ? styles.pendente : styles.gray}`}>
                                                {statusKam === 'Pendente' ? <FiClock size={11} /> : null}
                                                {statusKam === 'Pendente' ? 'Pendente' : 'Planejado'}
                                            </span>
                                        )}
                                    </div>

                                    <div className={styles.thumbnailContainer}>
                                        {k.thumbnail_url ? (
                                            <img src={k.thumbnail_url} alt={k.titulo} className={styles.thumbnailImage} />
                                        ) : (
                                            <div className={styles.thumbnailPlaceholder}>
                                                <FiImage size={40} />
                                            </div>
                                        )}
                                    </div>

                                    <div className={styles.cardContent}>
                                        <h3 className={styles.kaizenTitle}>{k.titulo}</h3>
                                        <span className={styles.kaizenMachine}>{k.maquina_nome || 'Geral'}</span>

                                        <div className={styles.auditsInfo}>
                                            <span>Implementado: {k.data_implementacao ? formatDateBR(k.data_implementacao) : '-'}</span>
                                            <span className={`${styles.auditDate} ${!isAudited && statusKam === 'Pendente' ? styles.late : ''} ${isAudited ? (isConforme ? styles.auditOk : styles.auditNok) : ''}`}>
                                                {isAudited ? (isConforme ? <FiCheck size={13} /> : <FiX size={13} />) : <FiClock size={13} />}
                                                {isAudited ? (isConforme ? 'Auditado · Conforme' : 'Auditado · Não Conforme') : (statusKam === 'Pendente' ? 'Não auditado' : '-')}
                                            </span>
                                        </div>

                                        <div className={styles.cardActions}>
                                            <button className={styles.configButton} onClick={(e) => { e.stopPropagation(); handleConfigClick(k); }}>
                                                <FiSettings size={14} /> Configurar
                                            </button>
                                            <button className={styles.auditButton} onClick={(e) => { e.stopPropagation(); handleAuditClick(k); }}>
                                                <FiCheckSquare size={14} /> Auditar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {isDetailsModalOpen && selectedKaizen && (
                <KaizenDetailsModal
                    kaizen={selectedKaizen}
                    onClose={() => setIsDetailsModalOpen(false)}
                    onEdit={handleEditFromDetails}
                    onAudit={(k) => { setIsDetailsModalOpen(false); handleAuditClick(k); }}
                    onConfig={(k) => { setIsDetailsModalOpen(false); handleConfigClick(k); }}
                    canEdit={hasEditPermission}
                />
            )}

            {isFormModalOpen && (
                <KaizenFormModal
                    kaizen={selectedKaizen}
                    user={user}
                    onClose={handleFormModalClose}
                    onSaved={handleKaizenSaved}
                />
            )}

            {isConfigModalOpen && selectedKaizen && (
                <KamishibaiConfigModal
                    kaizen={selectedKaizen}
                    user={user}
                    onClose={handleConfigClose}
                    onSaved={() => {
                        handleConfigClose();
                        fetchData();
                    }}
                />
            )}

            {isAuditModalOpen && selectedKaizen && (
                <KamishibaiAuditModal
                    kaizen={selectedKaizen}
                    user={user}
                    onClose={handleAuditClose}
                    onSaved={() => {
                        handleAuditClose();
                        fetchData();
                    }}
                />
            )}
        </>
    );
}
