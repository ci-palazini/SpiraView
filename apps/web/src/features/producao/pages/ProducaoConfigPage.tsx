// src/features/producao/pages/ProducaoConfigPage.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    FiPlus,
    FiRefreshCw,
    FiEdit2,
    FiCheck,
    FiX,
    FiTrash2,
    FiSearch,
    FiBox,
    FiTarget,
    FiGrid,
} from 'react-icons/fi';
import Skeleton from '../../../shared/components/Skeleton';

import PageHeader from '../../../shared/components/PageHeader';
import Modal from '../../../shared/components/Modal';
import {
    listarMaquinas,
    atualizarEscopoMaquina,
    atualizarAliasesProducao,
    atualizarNomeProducao,
    listarMetasProducao,
    criarMetaProducao,
    criarMaquina,
    deletarMaquina,
    type ProducaoMeta
} from '../../../services/apiClient';
import { type Maquina } from '@spiraview/shared';
import styles from './ProducaoConfigPage.module.css';

// --- Interfaces ---

interface User {
    role?: string;
    email?: string;
}

interface ProducaoConfigPageProps {
    user: User;
}

interface EditState {
    maquina: Maquina;
    meta: string;
    aliases: string;
    nomeProducao: string;
}

// --- Helpers ---

function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Tipos para itens de tabela (hierarquia ou plano)
type HierarchyTableItem = { maquina: Maquina; isChild: boolean };
type TableItem = Maquina | HierarchyTableItem;

function isHierarchyTableItem(item: TableItem): item is HierarchyTableItem {
    return 'isChild' in item;
}

// --- Componente Principal ---

export default function ProducaoConfigPage({ user }: ProducaoConfigPageProps) {
    const { t } = useTranslation();
    // --- Estados ---
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [metas, setMetas] = useState<ProducaoMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showOnlyProducao, setShowOnlyProducao] = useState(false);
    const [saving, setSaving] = useState(false);

    // Modal Nova Máquina
    const [showAddModal, setShowAddModal] = useState(false);
    const [newMaquina, setNewMaquina] = useState({
        nome: '',
        escopoManutencao: true,
        escopoProducao: true,
        escopoPlanejamento: false,
        setor: '',
        aliases: '',
        parentId: '',
        isMaquinaMae: false,
        exibirFilhosDashboard: true
    });
    const [creatingMaquina, setCreatingMaquina] = useState(false);

    // Modal Edição
    const [editState, setEditState] = useState<EditState | null>(null);

    // Modal Exclusão
    const [confirmDelete, setConfirmDelete] = useState<Maquina | null>(null);
    const [deleting, setDeleting] = useState(false);

    // --- Carregamento de Dados ---

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [maqData, metasData] = await Promise.all([
                listarMaquinas(),
                listarMetasProducao({ vigente: true }),
            ]);
            setMaquinas(maqData as Maquina[]);
            setMetas(metasData);
        } catch (err) {
            console.error(err);
            console.error(err);
            toast.error(t('producao.config.loadError', 'Erro ao carregar dados do servidor.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Mapeamento de metas para acesso rápido O(1)
    const metasByMaquina = useMemo(() => {
        const map = new Map<string, ProducaoMeta>();
        for (const m of metas) {
            if (!map.has(m.maquinaId)) {
                map.set(m.maquinaId, m);
            }
        }
        return map;
    }, [metas]);

    // --- Ações de Edição ---

    const openEditModal = useCallback((maquina: Maquina) => {
        const metaVigente = metasByMaquina.get(maquina.id);

        setEditState({
            maquina,
            meta: metaVigente?.horasMeta ? Number(metaVigente.horasMeta).toFixed(2) : '',
            aliases: maquina.aliases_producao?.join(', ') || '',
            nomeProducao: maquina.nome_producao || '',
        });
    }, [metasByMaquina]);

    const handleSaveEdit = useCallback(async () => {
        if (!editState) return;

        setSaving(true);
        try {
            const { maquina } = editState;

            // 1. Atualizar meta
            if (editState.meta.trim()) {
                const valorMeta = parseFloat(editState.meta.replace(',', '.'));
                if (!isNaN(valorMeta) && valorMeta > 0) {
                    const metaVigente = metasByMaquina.get(maquina.id);
                    const metaAtual = Number(metaVigente?.horasMeta || 0);

                    if (valorMeta !== metaAtual) {
                        await criarMetaProducao({
                            maquinaId: maquina.id,
                            dataInicio: toISO(new Date()),
                            horasMeta: valorMeta,
                        }, { role: user.role, email: user.email });
                    }
                }
            }

            // 2. Atualizar nome de produção
            const newNomeProd = editState.nomeProducao.trim() || null;
            const oldNomeProd = maquina.nome_producao || null;
            if (newNomeProd !== oldNomeProd) {
                await atualizarNomeProducao(maquina.id, newNomeProd, {
                    role: user.role,
                    email: user.email,
                });
            }

            // 3. Atualizar aliases
            const newAliases = editState.aliases
                .split(/[,\n]/)
                .map(a => a.trim())
                .filter(Boolean);

            const oldAliases = maquina.aliases_producao || [];
            if (JSON.stringify(newAliases) !== JSON.stringify(oldAliases)) {
                await atualizarAliasesProducao(maquina.id, newAliases, {
                    role: user.role,
                    email: user.email,
                });
            }

            toast.success(t('producao.config.saveSuccess', 'Configurações salvas com sucesso!'));
            setEditState(null);
            loadData();
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : t('producao.config.saveError', 'Erro ao salvar alterações');
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    }, [editState, metasByMaquina, user, loadData]);

    // --- Ações de Criação ---

    const handleCreateMaquina = useCallback(async () => {
        if (!newMaquina.nome.trim()) {
            toast.error('O nome da máquina é obrigatório.');
            return;
        }

        setCreatingMaquina(true);
        try {
            // 1. Criar Máquina base
            const created = await criarMaquina({
                nome: newMaquina.nome.trim(),
                tag: newMaquina.nome.trim(),
                setor: newMaquina.escopoProducao && newMaquina.setor ? newMaquina.setor : undefined,
                parentId: newMaquina.parentId || undefined
            }, {
                role: user.role,
                email: user.email,
            });

            // 2. Definir escopos (se diferente do padrão)
            if (newMaquina.escopoManutencao !== true || newMaquina.escopoProducao !== false) {
                await atualizarEscopoMaquina(created.id, {
                    escopoManutencao: newMaquina.escopoManutencao,
                    escopoProducao: newMaquina.escopoProducao,
                    escopoPlanejamento: newMaquina.escopoPlanejamento,
                }, {
                    role: user.role,
                    email: user.email,
                });
            }

            // 3. Salvar aliases
            if (newMaquina.escopoProducao && newMaquina.aliases.trim()) {
                const aliases = newMaquina.aliases
                    .split(/[,\n]/)
                    .map(a => a.trim())
                    .filter(Boolean);

                if (aliases.length > 0) {
                    await atualizarAliasesProducao(created.id, aliases, {
                        role: user.role,
                        email: user.email,
                    });
                }
            }

            toast.success(`Máquina "${created.nome}" criada!`);

            // Reset form
            setNewMaquina({
                nome: '',
                escopoManutencao: true,
                escopoProducao: true,
                escopoPlanejamento: false,
                setor: '',
                aliases: '',
                parentId: '',
                isMaquinaMae: false,
                exibirFilhosDashboard: true
            });
            setShowAddModal(false);

            // Atualizar lista localmente ou recarregar
            loadData();
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : t('producao.config.createError', 'Erro ao criar máquina');
            toast.error(msg);
        } finally {
            setCreatingMaquina(false);
        }
    }, [newMaquina, user, loadData]);

    // --- Ações de Exclusão ---

    const handleDeleteMaquina = useCallback(async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            await deletarMaquina(confirmDelete.id, { role: user.role, email: user.email });
            setMaquinas(prev => prev.filter(m => m.id !== confirmDelete.id));
            toast.success(t('producao.config.deleteSuccess', 'Máquina removida com sucesso.'));
            setConfirmDelete(null);
            setEditState(null); // Fecha modal de edição se estiver aberto por baixo
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : t('producao.config.deleteError', 'Erro ao excluir máquina');
            toast.error(msg);
        } finally {
            setDeleting(false);
        }
    }, [confirmDelete, user]);

    // --- Filtros e Cálculos ---

    const filteredMaquinas = useMemo(() => {
        let list = maquinas.filter(m => {
            const term = search.toLowerCase();
            const matchSearch = !search ||
                m.nome.toLowerCase().includes(term) ||
                (m.tag && m.tag.toLowerCase().includes(term));

            const matchFilter = !showOnlyProducao || m.escopo_producao;
            return matchSearch && matchFilter;
        });

        // Se tiver busca, exibe listagem plana. Se não, exibe hierarquia (Mãe -> Filhas)
        if (search) return list;

        // Montar Hierarquia
        const roots = list.filter(m => !m.parent_maquina_id);
        const childrenMap = new Map<string, Maquina[]>();
        list.forEach(m => {
            if (m.parent_maquina_id) {
                const arr = childrenMap.get(m.parent_maquina_id) || [];
                arr.push(m);
                childrenMap.set(m.parent_maquina_id, arr);
            }
        });

        // Ordenar raízes: Pais primeiro, depois alfabético
        roots.sort((a, b) => {
            const aIsParent = childrenMap.has(a.id);
            const bIsParent = childrenMap.has(b.id);

            if (aIsParent && !bIsParent) return -1;
            if (!aIsParent && bIsParent) return 1;

            return a.nome.localeCompare(b.nome);
        });

        const flatHierarchy: { maquina: Maquina; isChild: boolean }[] = [];
        roots.forEach(root => {
            flatHierarchy.push({ maquina: root, isChild: false });
            const kids = childrenMap.get(root.id) || [];
            kids.forEach(kid => {
                flatHierarchy.push({ maquina: kid, isChild: true });
            });
        });

        return flatHierarchy;
    }, [maquinas, search, showOnlyProducao]);

    const stats = useMemo(() => [
        { label: t('producao.config.stats.total', 'Total Cadastrado'), value: maquinas.length, icon: <FiGrid />, color: 'blue' },
        { label: t('producao.config.stats.production', 'Escopo Produção'), value: maquinas.filter(m => m.escopo_producao).length, icon: <FiBox />, color: 'green' },
        { label: t('producao.config.stats.withGoals', 'Com Metas Ativas'), value: metas.length, icon: <FiTarget />, color: 'purple' },
    ], [maquinas, metas, t]);

    // Estados Auxiliares
    // Máquinas disponíveis para serem mãe (filtra apenas as que SÃO marcadas como mãe e não são a própria)
    const availableParents = useMemo(() => {
        return maquinas.filter(m => m.is_maquina_mae && !m.parent_maquina_id);
    }, [maquinas]);

    // --- Renderização ---

    return (
        <>
            <PageHeader
                title={t('producao.config.title', 'Configuração de Máquinas')}
                subtitle={t('producao.config.subtitle', 'Gerenciamento centralizado de escopos, setores e parâmetros de produção.')}
            />

            <div className={styles.mainContainer}>

                {/* 1. Cards de Estatísticas */}
                <div className={styles.statsGrid}>
                    {loading ? (
                        [1, 2, 3, 4].map((i) => (
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
                                <div className={styles.statIconWrapper}>
                                    {stat.icon}
                                </div>
                                <div className={styles.statContent}>
                                    <span className={styles.statLabel}>{stat.label}</span>
                                    <strong className={styles.statValue}>{stat.value}</strong>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* 2. Barra de Controle */}
                <div className={styles.controlBar}>
                    <div className={styles.searchWrapper}>
                        <FiSearch className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={t('producao.config.search', 'Buscar por nome, tag ou código...')}
                            className={styles.searchInput}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className={styles.actionsWrapper}>
                        <label className={styles.toggleFilter}>
                            <input
                                type="checkbox"
                                checked={showOnlyProducao}
                                onChange={(e) => setShowOnlyProducao(e.target.checked)}
                            />
                            <span>{t('producao.config.onlyProduction', 'Apenas Produção')}</span>
                        </label>

                        <div className={styles.dividerVertical} />

                        <button
                            className={styles.primaryButton}
                            onClick={() => setShowAddModal(true)}
                        >
                            <FiPlus />
                            {t('producao.config.newMachine', 'Nova Máquina')}
                        </button>
                    </div>
                </div>

                {/* 3. Tabela de Dados */}
                <div className={styles.tableContainer}>
                    {loading && (
                        <div className={styles.loadingOverlay}>
                            <FiRefreshCw className={styles.spin} />
                        </div>
                    )}

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t('producao.config.table.identification', 'Identificação')}</th>
                                <th className={styles.rightAlign}>{t('producao.config.table.goal', 'Meta (h)')}</th>
                                <th>{t('producao.config.table.aliases', 'Aliases (Excel)')}</th>
                                <th style={{ width: 100 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && filteredMaquinas.length === 0 && (
                                <tr>
                                    <td colSpan={4}>
                                        <div className={styles.emptyState}>
                                            <FiSearch size={48} />
                                            <h3>{t('producao.config.empty.title', 'Nenhum resultado encontrado')}</h3>
                                            <p>{t('producao.config.empty.text', 'Tente ajustar os filtros ou adicionar uma nova máquina.')}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {filteredMaquinas.map((item) => {
                                const m = isHierarchyTableItem(item) ? item.maquina : item;
                                const isChild = isHierarchyTableItem(item) ? item.isChild : false;

                                const metaVigente = metasByMaquina.get(m.id);
                                const metaAtual = Number(metaVigente?.horasMeta || 0);
                                const aliasesCount = m.aliases_producao?.length || 0;

                                return (
                                    <tr key={m.id} className={isChild ? styles.childRow : undefined}>
                                        <td>
                                            <div className={styles.cellIdentity}>
                                                {isChild && <div className={styles.childIndicator} />}
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span className={styles.machineName}>
                                                        {m.nome}
                                                        {m.is_maquina_mae && <span title="Máquina Mãe" style={{ marginLeft: 6, fontSize: '0.7em', padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#4338ca' }}>{t('producao.config.table.mother', 'MÃE')}</span>}
                                                    </span>
                                                    {m.nome_producao && m.nome_producao !== m.nome && (
                                                        <span className={styles.machineTag} title={t('producao.config.table.productionName', 'Nome na Produção')}>
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
                                        <td className={styles.rightAlign}>
                                            {metaAtual > 0 ? (
                                                <span className={styles.metaValue}>{metaAtual.toFixed(2)}</span>
                                            ) : (
                                                <span className={styles.dash}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {aliasesCount > 0 ? (
                                                <span className={styles.aliasCount} title={m.aliases_producao?.join(', ')}>
                                                    {aliasesCount} {t('producao.config.table.mapped', 'mapeado(s)')}
                                                </span>
                                            ) : (
                                                <span className={styles.dash}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button
                                                    className={styles.iconButton}
                                                    onClick={() => openEditModal(m)}
                                                    title={t('producao.config.table.editMachine', 'Editar configurações')}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className={styles.deleteIconBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDelete(m);
                                                    }}
                                                    title={t('producao.config.deleteConfirm.title', 'Excluir Máquina')}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- Modal Nova Máquina --- */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title={t('producao.config.modal.addTitle', 'Adicionar Nova Máquina')}
            >
                <div className={styles.modalForm}>
                    <div className={styles.modalField}>
                        <label className={styles.modalLabel}>{t('producao.config.modal.machineName', 'Nome da Máquina')} *</label>
                        <input
                            type="text"
                            className={styles.modalInput}
                            placeholder={t('producao.config.modal.machineNamePlaceholder', 'Ex: TCN-20')}
                            value={newMaquina.nome}
                            onChange={(e) => setNewMaquina(prev => ({ ...prev, nome: e.target.value }))}
                            disabled={creatingMaquina}
                            autoFocus
                        />
                    </div>

                    <div className={styles.modalField}>
                        <label className={styles.modalLabel}>{t('producao.config.modal.scopes', 'Escopos')}</label>
                        <div className={styles.toggleGroup}>
                            <label className={styles.toggleItem}>
                                <span>{t('producao.config.modal.scopeMaintenance', 'Manutenção')}</span>
                                <button
                                    type="button"
                                    className={`${styles.toggle} ${newMaquina.escopoManutencao ? styles.toggleActive : ''}`}
                                    onClick={() => setNewMaquina(prev => ({ ...prev, escopoManutencao: !prev.escopoManutencao }))}
                                    disabled={creatingMaquina}
                                >
                                    <span className={styles.toggleThumb} />
                                </button>
                            </label>
                            <label className={styles.toggleItem}>
                                <span>{t('producao.config.modal.scopeProduction', 'Produção')}</span>
                                <button
                                    type="button"
                                    className={`${styles.toggle} ${newMaquina.escopoProducao ? styles.toggleActive : ''}`}
                                    onClick={() => setNewMaquina(prev => ({ ...prev, escopoProducao: !prev.escopoProducao }))}
                                    disabled={creatingMaquina}
                                >
                                    <span className={styles.toggleThumb} />
                                </button>
                            </label>
                            <label className={styles.toggleItem}>
                                <span>{t('producao.config.modal.scopePlanning', 'Planejamento')}</span>
                                <button
                                    type="button"
                                    className={`${styles.toggle} ${newMaquina.escopoPlanejamento ? styles.toggleActive : ''}`}
                                    onClick={() => setNewMaquina(prev => ({ ...prev, escopoPlanejamento: !prev.escopoPlanejamento }))}
                                    disabled={creatingMaquina}
                                >
                                    <span className={styles.toggleThumb} />
                                </button>
                            </label>
                        </div>
                    </div>

                    {newMaquina.escopoProducao && (
                        <>
                            <div className={styles.modalField}>
                                <label className={styles.modalLabel}>{t('producao.config.modal.hierarchyConfig', 'Configuração de Hierarquia')}</label>
                                <div className={styles.toggleGroup}>
                                    <label className={styles.toggleItem}>
                                        <span>{t('producao.config.modal.isMother', 'É Máquina Mãe?')}</span>
                                        <button
                                            type="button"
                                            className={`${styles.toggle} ${newMaquina.isMaquinaMae ? styles.toggleActive : ''}`}
                                            onClick={() => setNewMaquina(prev => ({ ...prev, isMaquinaMae: !prev.isMaquinaMae, parentId: '' }))} // Limpa parent se virar mãe
                                            disabled={creatingMaquina}
                                        >
                                            <span className={styles.toggleThumb} />
                                        </button>
                                    </label>

                                    {newMaquina.isMaquinaMae && (
                                        <label className={styles.toggleItem}>
                                            <span>{t('producao.config.modal.showChildrenDashboard', 'Exibir filhos no Dashboard?')}</span>
                                            <button
                                                type="button"
                                                className={`${styles.toggle} ${newMaquina.exibirFilhosDashboard ? styles.toggleActive : ''}`}
                                                onClick={() => setNewMaquina(prev => ({ ...prev, exibirFilhosDashboard: !prev.exibirFilhosDashboard }))}
                                                disabled={creatingMaquina}
                                            >
                                                <span className={styles.toggleThumb} />
                                            </button>
                                        </label>
                                    )}
                                </div>
                            </div>

                            {!newMaquina.isMaquinaMae && (
                                <div className={styles.modalField}>
                                    <label className={styles.modalLabel}>{t('producao.config.modal.parentMachine', 'Máquina Mãe (Linha/Agrupadora)')}</label>
                                    <select
                                        className={styles.modalSelect}
                                        value={newMaquina.parentId}
                                        onChange={(e) => setNewMaquina(prev => ({ ...prev, parentId: e.target.value }))}
                                        disabled={creatingMaquina}
                                    >
                                        <option value="">{t('producao.config.modal.noParent', 'Nenhuma (Máquina Independente)')}</option>
                                        {availableParents.map(parent => (
                                            <option key={parent.id} value={parent.id}>
                                                {parent.nome}
                                            </option>
                                        ))}
                                    </select>
                                    <span className={styles.helperText}>
                                        {t('producao.config.modal.parentHint', 'Selecione a máquina "Mãe" desta máquina.')}
                                    </span>
                                </div>
                            )}

                            <div className={styles.modalField}>
                                <label className={styles.modalLabel}>{t('producao.config.modal.sector', 'Setor/Departamento')}</label>
                                <select
                                    className={styles.modalSelect}
                                    value={newMaquina.setor}
                                    onChange={(e) => setNewMaquina(prev => ({ ...prev, setor: e.target.value }))}
                                    disabled={creatingMaquina}
                                >
                                    <option value="">{t('producao.config.modal.selectSector', 'Selecione...')}</option>
                                    <option value="usinagem">Usinagem</option>
                                    <option value="montagem">Montagem</option>
                                </select>
                            </div>

                            <div className={styles.modalField}>
                                <label className={styles.modalLabel}>{t('producao.config.modal.aliasesLabel', 'Aliases para Upload')}</label>
                                <textarea
                                    className={styles.modalTextarea}
                                    placeholder={t('producao.config.modal.aliasesPlaceholder', 'Nomes usados no Excel (separados por vírgula)')}
                                    value={newMaquina.aliases}
                                    onChange={(e) => setNewMaquina(prev => ({ ...prev, aliases: e.target.value }))}
                                    disabled={creatingMaquina}
                                    rows={3}
                                />
                                <span className={styles.helperText}>
                                    {t('producao.config.modal.aliasesHint', 'Nomes diferentes que aparecem no Excel e devem resolver para esta máquina.')}
                                </span>
                            </div>
                        </>
                    )}

                    <div className={styles.modalActions}>
                        <button
                            className={styles.modalSecondaryButton}
                            onClick={() => setShowAddModal(false)}
                            disabled={creatingMaquina}
                        >
                            {t('producao.config.modal.cancel', 'Cancelar')}
                        </button>
                        <button
                            className={styles.modalPrimaryButton}
                            onClick={handleCreateMaquina}
                            disabled={creatingMaquina || !newMaquina.nome.trim()}
                        >
                            {creatingMaquina ? t('producao.config.modal.creating', 'Criando...') : t('producao.config.modal.createMachine', 'Criar Máquina')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* --- Modal Edição --- */}
            <Modal
                isOpen={!!editState}
                onClose={() => setEditState(null)}
                title={editState ? t('producao.config.modal.editTitle', 'Editar: {{name}}', { name: editState.maquina.nome }) : ''}
            >
                {editState && (
                    <div className={styles.modalForm}>

                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('producao.config.modal.productionName', 'Nome para Produção')}</label>
                            <input
                                type="text"
                                className={styles.modalInput}
                                placeholder={t('producao.config.modal.productionNamePlaceholder', 'Ex: Nome diferente que a produção usa')}
                                value={editState.nomeProducao}
                                onChange={(e) => setEditState(prev => prev ? ({ ...prev, nomeProducao: e.target.value }) : null)}
                                disabled={saving}
                            />
                            <span className={styles.helperText}>
                                {t('producao.config.modal.productionNameHint', 'Nome alternativo exibido nas telas de produção. Se vazio, usa o nome padrão.')}
                            </span>
                        </div>

                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('producao.config.modal.goalLabel', 'Meta diária (horas)')}</label>
                            <input
                                type="text"
                                className={styles.modalInput}
                                placeholder={t('producao.config.modal.goalPlaceholder', 'Ex: 18.50')}
                                value={editState.meta}
                                onChange={(e) => setEditState(prev => prev ? ({ ...prev, meta: e.target.value }) : null)}
                                disabled={saving}
                            />
                            <span className={styles.helperText}>
                                {t('producao.config.modal.goalHint', 'Será criada uma nova meta vigente a partir de hoje.')}
                            </span>
                        </div>

                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>{t('producao.config.modal.aliasesLabel', 'Aliases para Upload')}</label>
                            <textarea
                                className={styles.modalTextarea}
                                placeholder={t('producao.config.modal.aliasesPlaceholder', 'Nomes usados no Excel (separados por vírgula)')}
                                value={editState.aliases}
                                onChange={(e) => setEditState(prev => prev ? ({ ...prev, aliases: e.target.value }) : null)}
                                disabled={saving}
                                rows={3}
                            />
                            <span className={styles.helperText}>
                                {t('producao.config.modal.aliasesHint', 'Nomes diferentes que aparecem no Excel e devem resolver para esta máquina.')}
                            </span>
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                className={styles.modalDangerButton}
                                onClick={() => setConfirmDelete(editState.maquina)}
                                disabled={saving}
                                title={t('producao.config.deleteConfirm.title', 'Excluir Máquina')}
                            >
                                <FiTrash2 /> {t('producao.config.modal.delete', 'Excluir')}
                            </button>
                            <div className={styles.modalActionsRight}>
                                <button
                                    className={styles.modalSecondaryButton}
                                    onClick={() => setEditState(null)}
                                    disabled={saving}
                                >
                                    {t('producao.config.modal.cancel', 'Cancelar')}
                                </button>
                                <button
                                    className={styles.modalPrimaryButton}
                                    onClick={handleSaveEdit}
                                    disabled={saving}
                                >
                                    {saving ? t('producao.config.modal.saving', 'Salvando...') : t('producao.config.modal.save', 'Salvar Alterações')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
            {/* --- Modal Confirmação Exclusão --- */}
            {confirmDelete && (
                <Modal
                    isOpen={!!confirmDelete}
                    onClose={() => setConfirmDelete(null)}
                    title={t('producao.config.deleteConfirm.title', 'Excluir Máquina')}
                >
                    <div className={styles.modalForm}>
                        <p className={styles.confirmText}>
                            {t('producao.config.deleteConfirm.text', 'Tem certeza que deseja excluir a máquina "{{name}}"?', { name: confirmDelete.nome })}
                        </p>
                        <p className={styles.confirmWarning}>
                            {t('producao.config.deleteConfirm.warning', 'Esta ação removerá a máquina das listagens. O histórico será preservado no banco.')}
                        </p>
                        <div className={styles.modalActions}>
                            <button
                                className={styles.modalSecondaryButton}
                                onClick={() => setConfirmDelete(null)}
                                disabled={deleting}
                            >
                                {t('producao.config.deleteConfirm.cancel', 'Cancelar')}
                            </button>
                            <button
                                className={styles.modalDangerButton}
                                onClick={handleDeleteMaquina}
                                disabled={deleting}
                            >
                                {deleting ? t('producao.config.deleteConfirm.deleting', 'Excluindo...') : t('producao.config.deleteConfirm.confirm', 'Sim, Excluir')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
