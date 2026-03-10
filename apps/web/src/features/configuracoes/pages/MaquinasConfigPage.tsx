// src/features/configuracoes/pages/MaquinasConfigPage.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    FiRefreshCw,
    FiEdit2,
    FiSearch,
    FiSettings,
    FiBox,
    FiGrid,
    FiCalendar
} from 'react-icons/fi';
import Skeleton from '../../../shared/components/Skeleton';

import PageHeader from '../../../shared/components/PageHeader';
import Modal from '../../../shared/components/Modal';
import usePermissions from '../../../hooks/usePermissions';
import {
    listarMaquinas,
    atualizarEscopoMaquina,
    atualizarMaquinaPai,
} from '../../../services/apiClient';
import { type Maquina } from '../../../types/api';
import styles from './MaquinasConfigPage.module.css';

interface User {
    role?: string;
    email?: string;
}

interface MaquinasConfigPageProps {
    user: User;
}

interface EditState {
    maquina: Maquina;
    escopoManutencao: boolean;
    escopoProducao: boolean;
    escopoPlanejamento: boolean;
    setor: string;
    parentId: string;
    isMaquinaMae: boolean;
    exibirFilhosDashboard: boolean;
}

type HierarchyItem = { maquina: Maquina; isChild: boolean };
type TableItem = Maquina | HierarchyItem;

function isHierarchyItem(item: TableItem): item is HierarchyItem {
    return 'isChild' in item;
}

export default function MaquinasConfigPage({ user }: MaquinasConfigPageProps) {
    const { t } = useTranslation();
    const { canEdit } = usePermissions(user);

    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const [editState, setEditState] = useState<EditState | null>(null);

    const loadData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await listarMaquinas();
            setMaquinas(data as Maquina[]);
        } catch (err) {
            console.error(err);
            toast.error(t('maquinasConfig.loadError', 'Erro ao carregar máquinas.'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openEditModal = useCallback((maquina: Maquina) => {
        setEditState({
            maquina,
            escopoManutencao: maquina.escopo_manutencao ?? true,
            escopoProducao: maquina.escopo_producao ?? false,
            escopoPlanejamento: maquina.escopo_planejamento ?? false,
            setor: maquina.setor || '',
            parentId: maquina.parent_maquina_id || '',
            isMaquinaMae: maquina.is_maquina_mae ?? false,
            exibirFilhosDashboard: maquina.exibir_filhos_dashboard ?? true,
        });
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (!editState) return;
        setSaving(true);
        try {
            const { maquina } = editState;

            const escoposChanged =
                editState.escopoManutencao !== maquina.escopo_manutencao ||
                editState.escopoProducao !== maquina.escopo_producao ||
                editState.escopoPlanejamento !== (maquina.escopo_planejamento ?? false);
            const setorChanged = editState.setor !== (maquina.setor || '');
            const motherConfigChanged =
                editState.isMaquinaMae !== (maquina.is_maquina_mae ?? false) ||
                editState.exibirFilhosDashboard !== (maquina.exibir_filhos_dashboard ?? true);
            const parentChanged = (editState.parentId || null) !== (maquina.parent_maquina_id || null);

            if (escoposChanged || setorChanged || motherConfigChanged) {
                await atualizarEscopoMaquina(maquina.id, {
                    escopoManutencao: editState.escopoManutencao,
                    escopoProducao: editState.escopoProducao,
                    escopoPlanejamento: editState.escopoPlanejamento,
                    setor: editState.setor || null,
                    isMaquinaMae: editState.isMaquinaMae,
                    exibirFilhosDashboard: editState.exibirFilhosDashboard,
                }, { role: user.role, email: user.email });
            }

            if (parentChanged) {
                await atualizarMaquinaPai(maquina.id, editState.parentId || null, { role: user.role, email: user.email });
            }

            toast.success(t('maquinasConfig.saveSuccess', 'Configurações salvas com sucesso!'));
            setEditState(null);
            loadData(true);
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : t('maquinasConfig.saveError', 'Erro ao salvar alterações');
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    }, [editState, user, loadData]);

    const filteredMaquinas = useMemo(() => {
        const list = maquinas.filter(m => {
            const term = search.toLowerCase();
            return !search ||
                m.nome.toLowerCase().includes(term) ||
                (m.tag && m.tag.toLowerCase().includes(term)) ||
                (m.setor && m.setor.toLowerCase().includes(term));
        });

        if (search) return list;

        const roots = list.filter(m => !m.parent_maquina_id);
        const childrenMap = new Map<string, Maquina[]>();
        list.forEach(m => {
            if (m.parent_maquina_id) {
                const arr = childrenMap.get(m.parent_maquina_id) || [];
                arr.push(m);
                childrenMap.set(m.parent_maquina_id, arr);
            }
        });

        roots.sort((a, b) => {
            const aIsParent = childrenMap.has(a.id);
            const bIsParent = childrenMap.has(b.id);
            if (aIsParent && !bIsParent) return -1;
            if (!aIsParent && bIsParent) return 1;
            return a.nome.localeCompare(b.nome);
        });

        const flat: { maquina: Maquina; isChild: boolean }[] = [];
        roots.forEach(root => {
            flat.push({ maquina: root, isChild: false });
            (childrenMap.get(root.id) || []).forEach(kid => {
                flat.push({ maquina: kid, isChild: true });
            });
        });

        return flat;
    }, [maquinas, search]);

    const stats = useMemo(() => [
        { label: t('maquinasConfig.stats.total', 'Total Cadastrado'), value: maquinas.length, icon: <FiGrid />, color: 'blue' },
        { label: t('maquinasConfig.stats.maintenance', 'Escopo Manutenção'), value: maquinas.filter(m => m.escopo_manutencao).length, icon: <FiSettings />, color: 'orange' },
        { label: t('maquinasConfig.stats.production', 'Escopo Produção'), value: maquinas.filter(m => m.escopo_producao).length, icon: <FiBox />, color: 'green' },
        { label: t('maquinasConfig.stats.planning', 'Escopo Planejamento'), value: maquinas.filter(m => m.escopo_planejamento).length, icon: <FiCalendar />, color: 'purple' },
    ], [maquinas, t]);

    const availableParents = useMemo(() => {
        return maquinas.filter(m => m.is_maquina_mae && !m.parent_maquina_id);
    }, [maquinas]);

    return (
        <>
            <PageHeader
                title={t('maquinasConfig.title', 'Configuração Global de Máquinas')}
                subtitle={t('maquinasConfig.subtitle', 'Gerencie escopos, setores e hierarquias das máquinas cadastradas.')}
            />

            <div className={styles.mainContainer}>

                {/* Stats */}
                <div className={styles.statsGrid}>
                    {loading ? (
                        [1, 2, 3, 4].map(i => (
                            <div key={i} className={styles.statCard}>
                                <Skeleton variant="rectangular" width={48} height={48} style={{ borderRadius: 10, marginBottom: 12 }} />
                                <div>
                                    <Skeleton variant="text" width={80} height={20} />
                                    <Skeleton variant="text" width={40} height={32} />
                                </div>
                            </div>
                        ))
                    ) : (
                        stats.map((stat, idx) => (
                            <div key={idx} className={`${styles.statCard} ${styles[`card-${stat.color}`]}`}>
                                <div className={styles.statIconWrapper}>{stat.icon}</div>
                                <div className={styles.statContent}>
                                    <span className={styles.statLabel}>{stat.label}</span>
                                    <strong className={styles.statValue}>{stat.value}</strong>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Control Bar */}
                <div className={styles.controlBar}>
                    <div className={styles.searchWrapper}>
                        <FiSearch className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={t('maquinasConfig.search', 'Buscar por nome, tag ou setor...')}
                            className={styles.searchInput}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className={styles.tableContainer}>
                    {loading && (
                        <div className={styles.loadingOverlay}>
                            <FiRefreshCw className={styles.spin} />
                        </div>
                    )}

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t('maquinasConfig.table.identification', 'Identificação')}</th>
                                <th className={styles.centerAlign}>{t('maquinasConfig.table.maintenance', 'Manutenção')}</th>
                                <th className={styles.centerAlign}>{t('maquinasConfig.table.production', 'Produção')}</th>
                                <th className={styles.centerAlign}>{t('maquinasConfig.table.planning', 'Planejamento')}</th>
                                <th>{t('maquinasConfig.table.sector', 'Setor')}</th>
                                <th>{t('maquinasConfig.table.hierarchy', 'Hierarquia')}</th>
                                <th style={{ width: 60 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && filteredMaquinas.length === 0 && (
                                <tr>
                                    <td colSpan={7}>
                                        <div className={styles.emptyState}>
                                            <FiSearch size={48} />
                                            <h3>{t('maquinasConfig.empty.title', 'Nenhum resultado encontrado')}</h3>
                                            <p>{t('maquinasConfig.empty.text', 'Tente ajustar os filtros.')}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {filteredMaquinas.map(item => {
                                const m = isHierarchyItem(item) ? item.maquina : item;
                                const isChild = isHierarchyItem(item) ? item.isChild : false;

                                return (
                                    <tr key={m.id} className={isChild ? styles.childRow : undefined}>
                                        <td>
                                            <div className={styles.cellIdentity}>
                                                {isChild && <div className={styles.childIndicator} />}
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span className={styles.machineName}>
                                                        {m.nome}
                                                        {m.is_maquina_mae && (
                                                            <span title="Máquina Mãe" style={{ marginLeft: 6, fontSize: '0.7em', padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#4338ca' }}>
                                                                {t('maquinasConfig.table.mother', 'MÃE')}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {m.nome_producao && m.nome_producao !== m.nome && (
                                                        <span className={styles.machineTag} title={t('maquinasConfig.table.productionName', 'Nome na Produção')}>
                                                            <FiBox style={{ fontSize: '0.9em', marginRight: 4, verticalAlign: 'middle' }} />
                                                            {m.nome_producao}
                                                        </span>
                                                    )}
                                                    {m.tag && m.tag !== m.nome && (
                                                        <span className={styles.machineTag}>{m.tag}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={styles.centerAlign}>
                                            <span className={`${styles.statusBadge} ${m.escopo_manutencao ? styles.active : styles.inactive}`}>
                                                {m.escopo_manutencao ? t('common.active', 'Ativo') : t('common.inactive', 'Inativo')}
                                            </span>
                                        </td>
                                        <td className={styles.centerAlign}>
                                            <span className={`${styles.statusBadge} ${m.escopo_producao ? styles.active : styles.inactive}`}>
                                                {m.escopo_producao ? t('common.active', 'Ativo') : t('common.inactive', 'Inativo')}
                                            </span>
                                        </td>
                                        <td className={styles.centerAlign}>
                                            <span className={`${styles.statusBadge} ${m.escopo_planejamento ? styles.active : styles.inactive}`}>
                                                {m.escopo_planejamento ? t('common.active', 'Ativo') : t('common.inactive', 'Inativo')}
                                            </span>
                                        </td>
                                        <td>
                                            {m.setor ? (
                                                <span className={styles.sectorBadge}>{m.setor}</span>
                                            ) : (
                                                <span className={styles.dash}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {m.parent_maquina_id ? (
                                                <span className={styles.hierarchyBadge}>
                                                    {t('maquinasConfig.table.child', 'Filha')}
                                                </span>
                                            ) : m.is_maquina_mae ? (
                                                <span className={styles.hierarchyMaeBadge}>
                                                    {t('maquinasConfig.table.mother', 'Mãe')}
                                                </span>
                                            ) : (
                                                <span className={styles.dash}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {canEdit('maquinas_config') && (
                                                <button
                                                    className={styles.iconButton}
                                                    onClick={() => openEditModal(m)}
                                                    title={t('maquinasConfig.table.editMachine', 'Editar configurações globais')}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Edição */}
            <Modal
                isOpen={!!editState}
                onClose={() => setEditState(null)}
                title={editState ? t('maquinasConfig.modal.editTitle', 'Configuração Global: {{name}}', { name: editState.maquina.nome }) : ''}
            >
                {editState && (
                    <div className={styles.modalForm}>

                        {/* Escopos */}
                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('maquinasConfig.modal.scopes', 'Escopos / Departamentos')}</label>
                            <div className={styles.toggleGroup}>
                                <label className={styles.toggleItem}>
                                    <span>{t('maquinasConfig.modal.scopeMaintenance', 'Manutenção')}</span>
                                    <button
                                        type="button"
                                        className={`${styles.toggle} ${editState.escopoManutencao ? styles.toggleActive : ''}`}
                                        onClick={() => setEditState(prev => prev ? ({ ...prev, escopoManutencao: !prev.escopoManutencao }) : null)}
                                        disabled={saving}
                                    >
                                        <span className={styles.toggleThumb} />
                                    </button>
                                </label>
                                <label className={styles.toggleItem}>
                                    <span>{t('maquinasConfig.modal.scopeProduction', 'Produção')}</span>
                                    <button
                                        type="button"
                                        className={`${styles.toggle} ${editState.escopoProducao ? styles.toggleActive : ''}`}
                                        onClick={() => setEditState(prev => prev ? ({ ...prev, escopoProducao: !prev.escopoProducao }) : null)}
                                        disabled={saving}
                                    >
                                        <span className={styles.toggleThumb} />
                                    </button>
                                </label>
                                <label className={styles.toggleItem}>
                                    <span>{t('maquinasConfig.modal.scopePlanning', 'Planejamento')}</span>
                                    <button
                                        type="button"
                                        className={`${styles.toggle} ${editState.escopoPlanejamento ? styles.toggleActive : ''}`}
                                        onClick={() => setEditState(prev => prev ? ({ ...prev, escopoPlanejamento: !prev.escopoPlanejamento }) : null)}
                                        disabled={saving}
                                    >
                                        <span className={styles.toggleThumb} />
                                    </button>
                                </label>
                            </div>
                        </div>

                        {/* Setor */}
                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('maquinasConfig.modal.sector', 'Setor/Departamento')}</label>
                            <select
                                className={styles.modalSelect}
                                value={editState.setor}
                                onChange={e => setEditState(prev => prev ? ({ ...prev, setor: e.target.value }) : null)}
                                disabled={saving}
                            >
                                <option value="">{t('maquinasConfig.modal.selectSector', 'Selecione...')}</option>
                                <option value="usinagem">Usinagem</option>
                                <option value="montagem">Montagem</option>
                            </select>
                        </div>

                        {/* Hierarquia */}
                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('maquinasConfig.modal.hierarchyConfig', 'Configuração de Hierarquia')}</label>
                            <div className={styles.toggleGroup}>
                                <label className={styles.toggleItem}>
                                    <span>{t('maquinasConfig.modal.isMother', 'É Máquina Mãe?')}</span>
                                    <button
                                        type="button"
                                        className={`${styles.toggle} ${editState.isMaquinaMae ? styles.toggleActive : ''}`}
                                        onClick={() => setEditState(prev => prev ? ({ ...prev, isMaquinaMae: !prev.isMaquinaMae, parentId: '' }) : null)}
                                        disabled={saving}
                                    >
                                        <span className={styles.toggleThumb} />
                                    </button>
                                </label>

                                {editState.isMaquinaMae && (
                                    <label className={styles.toggleItem}>
                                        <span>{t('maquinasConfig.modal.showChildrenDashboard', 'Exibir filhos no Dashboard?')}</span>
                                        <button
                                            type="button"
                                            className={`${styles.toggle} ${editState.exibirFilhosDashboard ? styles.toggleActive : ''}`}
                                            onClick={() => setEditState(prev => prev ? ({ ...prev, exibirFilhosDashboard: !prev.exibirFilhosDashboard }) : null)}
                                            disabled={saving}
                                        >
                                            <span className={styles.toggleThumb} />
                                        </button>
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* Máquina Mãe (parent) */}
                        {!editState.isMaquinaMae && (
                            <div className={styles.modalField}>
                                <label className={styles.modalLabel}>{t('maquinasConfig.modal.parentMachine', 'Máquina Mãe (Linha/Agrupadora)')}</label>
                                <select
                                    className={styles.modalSelect}
                                    value={editState.parentId}
                                    onChange={e => setEditState(prev => prev ? ({ ...prev, parentId: e.target.value }) : null)}
                                    disabled={saving}
                                >
                                    <option value="">{t('maquinasConfig.modal.noParent', 'Nenhuma (Máquina Independente)')}</option>
                                    {availableParents
                                        .filter(p => p.id !== editState.maquina.id)
                                        .map(parent => (
                                            <option key={parent.id} value={parent.id}>{parent.nome}</option>
                                        ))}
                                </select>
                            </div>
                        )}

                        <div className={styles.modalActions}>
                            <button
                                className={styles.modalSecondaryButton}
                                onClick={() => setEditState(null)}
                                disabled={saving}
                            >
                                {t('common.cancel', 'Cancelar')}
                            </button>
                            <button
                                className={styles.modalPrimaryButton}
                                onClick={handleSaveEdit}
                                disabled={saving}
                            >
                                {saving ? t('common.saving', 'Salvando...') : t('common.save', 'Salvar Alterações')}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
