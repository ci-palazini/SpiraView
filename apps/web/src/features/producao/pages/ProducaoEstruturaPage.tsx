import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiLayers, FiSettings, FiPlus, FiEdit2, FiTrash2, FiTag } from 'react-icons/fi';
import {
    PageHeader,
    Button,
    Input,
    Modal,
    Badge,
    EmptyState
} from '../../../shared/components';
import usePermissions from '../../../hooks/usePermissions';
import {
    listarSetoresProducao,
    criarSetorProducao,
    atualizarSetorProducao,
    deletarSetorProducao,
    listarMaquinasProducaoConfig,
    atualizarMaquinaProducaoConfig,
    listarMaquinas,
    atualizarAliasesProducao,
    atualizarNomeProducao
} from '../../../services/apiClient';
import type { ProducaoSetor, MaquinaProducaoConfig, Maquina } from '@spiraview/shared';
import { useUsuario } from '../../../contexts/UserContext';
import styles from './ProducaoEstruturaPage.module.css';

interface MaquinaModalState {
    id: string;
    nome: string;
    nomeProducao: string;
    setorProducaoId: string | null;
    ordemProducao: number;
    escopoProducao: boolean;
    aliasesText: string;
    isSaving: boolean;
}

const ProducaoEstruturaPage: React.FC = () => {
    const { t } = useTranslation('common');
    const user = useUsuario();
    const { canEditAny } = usePermissions(user);
    const canEdit = canEditAny(['producao_config']);

    const [activeTab, setActiveTab] = useState<'maquinas' | 'setores'>('maquinas');

    const [setores, setSetores] = useState<ProducaoSetor[]>([]);
    const [maquinas, setMaquinas] = useState<MaquinaProducaoConfig[]>([]);
    const [aliasesMap, setAliasesMap] = useState<Map<string, string[]>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    // Modal Máquina
    const [maquinaModal, setMaquinaModal] = useState<MaquinaModalState | null>(null);

    // Modal Setor
    const [isSetorModalOpen, setIsSetorModalOpen] = useState(false);
    const [editingSetor, setEditingSetor] = useState<ProducaoSetor | null>(null);
    const [setorForm, setSetorForm] = useState({ nome: '', ordem: 0, ativo: true });
    const [setorError, setSetorError] = useState<string | null>(null);

    // Delete confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // ── Carregamento ──────────────────────────────────────────────────────────

    const loadSetores = async () => {
        try {
            setSetores(await listarSetoresProducao());
        } catch (err) {
            console.error(err);
        }
    };

    const loadMaquinas = async () => {
        try {
            const [configData, fullData] = await Promise.all([
                listarMaquinasProducaoConfig(),
                listarMaquinas()
            ]);
            setMaquinas(configData);
            const map = new Map<string, string[]>();
            for (const m of fullData as Maquina[]) {
                map.set(m.id, m.aliases_producao || []);
            }
            setAliasesMap(map);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        Promise.all([loadSetores(), loadMaquinas()]).finally(() => setIsLoading(false));
    }, []);

    // ── Ações Máquinas ────────────────────────────────────────────────────────

    const handleOpenMaquinaModal = (m: MaquinaProducaoConfig) => {
        setMaquinaModal({
            id: m.id,
            nome: m.nome,
            nomeProducao: m.nomeProducao || '',
            setorProducaoId: m.setorProducaoId,
            ordemProducao: m.ordemProducao,
            escopoProducao: m.escopoProducao,
            aliasesText: (aliasesMap.get(m.id) || []).join('\n'),
            isSaving: false
        });
    };

    const handleSaveMaquinaModal = async () => {
        if (!maquinaModal) return;
        setMaquinaModal(prev => prev ? { ...prev, isSaving: true } : null);
        try {
            const aliases = maquinaModal.aliasesText
                .split(/[,\n]/)
                .map(a => a.trim())
                .filter(Boolean);

            await Promise.all([
                atualizarMaquinaProducaoConfig(maquinaModal.id, {
                    setorProducaoId: maquinaModal.setorProducaoId,
                    ordemProducao: maquinaModal.ordemProducao,
                    exibirProducao: maquinaModal.escopoProducao
                }),
                atualizarNomeProducao(maquinaModal.id, maquinaModal.nomeProducao.trim() || null),
                atualizarAliasesProducao(maquinaModal.id, aliases)
            ]);

            setAliasesMap(prev => new Map(prev).set(maquinaModal.id, aliases));
            setMaquinaModal(null);
            toast.success(t('producao.estrutura.toast.machineSaved', 'Configuracao salva'));
            loadMaquinas();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.estrutura.errors.saveMachine', 'Erro ao salvar');
            toast.error(msg);
            setMaquinaModal(prev => prev ? { ...prev, isSaving: false } : null);
        }
    };

    // ── Ações Setores ─────────────────────────────────────────────────────────

    const handleOpenSetorModal = (setor?: ProducaoSetor) => {
        setSetorError(null);
        if (setor) {
            setEditingSetor(setor);
            setSetorForm({ nome: setor.nome, ordem: setor.ordem, ativo: setor.ativo });
        } else {
            setEditingSetor(null);
            setSetorForm({
                nome: '',
                ordem: setores.length > 0 ? Math.max(...setores.map(s => s.ordem)) + 10 : 0,
                ativo: true
            });
        }
        setIsSetorModalOpen(true);
    };

    const handleSaveSetor = async () => {
        setSetorError(null);
        if (!setorForm.nome.trim()) {
            setSetorError(t('producao.estrutura.errors.nameRequired', 'Nome do setor obrigatorio'));
            return;
        }
        try {
            if (editingSetor) {
                await atualizarSetorProducao(editingSetor.id, setorForm);
            } else {
                await criarSetorProducao(setorForm);
            }
            setIsSetorModalOpen(false);
            toast.success(t('producao.estrutura.toast.sectorSaved', 'Setor salvo com sucesso'));
            loadSetores();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.estrutura.errors.saveSector', 'Erro ao salvar setor');
            setSetorError(msg);
        }
    };

    const handleDeleteSetor = async (id: string) => {
        try {
            await deletarSetorProducao(id);
            setDeleteConfirmId(null);
            toast.success(t('producao.estrutura.toast.sectorDeleted', 'Setor excluido com sucesso'));
            loadSetores();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.estrutura.errors.deleteSector', 'Erro ao excluir setor');
            toast.error(msg);
            setDeleteConfirmId(null);
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    const setorOptions = [
        { value: '', label: t('producao.estrutura.noSector', 'Sem setor') },
        ...setores.map(s => ({ value: s.id, label: s.nome }))
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <PageHeader
                title={t('producao.estrutura.title', 'Estrutura de Producao')}
                subtitle={t('producao.estrutura.subtitle', 'Configure setores e maquinas para o modulo de producao')}
            />

            <div className={styles.container}>
                {/* Tab Selector */}
                <div className={styles.tabsContainer}>
                    <button
                        onClick={() => setActiveTab('maquinas')}
                        className={`${styles.tab} ${activeTab === 'maquinas' ? styles.tabActive : ''}`}
                    >
                        <FiSettings />
                        {t('producao.estrutura.tabs.machines', 'Maquinas')}
                    </button>
                    <button
                        onClick={() => setActiveTab('setores')}
                        className={`${styles.tab} ${activeTab === 'setores' ? styles.tabActive : ''}`}
                    >
                        <FiLayers />
                        {t('producao.estrutura.tabs.sectors', 'Setores')}
                    </button>
                </div>

                {/* MAQUINAS TAB */}
                {activeTab === 'maquinas' && (
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>
                                {t('producao.estrutura.machines.title', 'Configuracao de Maquinas')}
                                <span className={styles.countBadge}>{maquinas.length}</span>
                            </h2>
                            <div className={styles.headerHint}>
                                <FiSettings size={14} />
                                {t('producao.estrutura.machines.hint', 'Apenas maquinas com Escopo Producao ativo aparecerao nos relatorios')}
                            </div>
                        </div>

                        {isLoading ? (
                            <div className={styles.loadingState}>{t('common.loading', 'Carregando...')}</div>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table} style={{ minWidth: '700px' }}>
                                    <thead>
                                        <tr>
                                            <th className={styles.th}>{t('producao.estrutura.machines.machine', 'Maquina')}</th>
                                            <th className={styles.th}>{t('producao.estrutura.machines.displayName', 'Nome Exibicao')}</th>
                                            <th className={styles.th} style={{ width: '12rem' }}>{t('producao.estrutura.machines.sector', 'Setor')}</th>
                                            <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '6rem' }}>{t('producao.estrutura.machines.order', 'Ordem')}</th>
                                            <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '8rem' }}>{t('producao.estrutura.machines.scope', 'Escopo Prod.')}</th>
                                            <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '9rem' }}>Aliases Excel</th>
                                            {canEdit && <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '5rem' }}>{t('common.actions', 'Acoes')}</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {maquinas.map(m => {
                                            const setorObj = setores.find(s => s.id === m.setorProducaoId);
                                            const aliases = aliasesMap.get(m.id) || [];
                                            return (
                                                <tr key={m.id} className={`${styles.tr} ${!m.escopoProducao ? styles.inactive : ''}`}>
                                                    <td className={styles.td}>
                                                        <span className={styles.machineName}>{m.nome}</span>
                                                    </td>
                                                    <td className={styles.td}>
                                                        <span className={styles.displayName}>{m.nomeProducao || m.nome}</span>
                                                    </td>
                                                    <td className={styles.td}>
                                                        <span className={setorObj ? styles.sectorLabel : styles.sectorEmpty}>
                                                            {setorObj?.nome || t('producao.estrutura.noSector', 'Sem setor')}
                                                        </span>
                                                    </td>
                                                    <td className={`${styles.td} ${styles.tdCenter}`}>
                                                        <span className={styles.orderValue}>{m.ordemProducao}</span>
                                                    </td>
                                                    <td className={`${styles.td} ${styles.tdCenter}`}>
                                                        <Badge variant={m.escopoProducao ? 'success' : 'neutral'}>
                                                            {m.escopoProducao ? t('common.yes', 'SIM') : t('common.no', 'NAO')}
                                                        </Badge>
                                                    </td>
                                                    <td className={`${styles.td} ${styles.tdCenter}`}>
                                                        <div className={styles.aliasesCell}>
                                                            <span className={styles.aliasesBadge}>
                                                                <FiTag size={11} />
                                                                {aliases.length}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {canEdit && (
                                                        <td className={`${styles.td} ${styles.tdCenter}`}>
                                                            <button
                                                                onClick={() => handleOpenMaquinaModal(m)}
                                                                className={styles.actionButton}
                                                                title={t('common.edit', 'Editar')}
                                                            >
                                                                <FiEdit2 size={15} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* SETORES TAB */}
                {activeTab === 'setores' && (
                    <div className={styles.card}>
                        {isLoading ? (
                            <div className={styles.loadingState}>{t('common.loading', 'Carregando...')}</div>
                        ) : (
                            <>
                                <div className={styles.cardHeader}>
                                    <h2 className={styles.cardTitle}>
                                        {t('producao.estrutura.sectors.title', 'Setores de Producao')}
                                        <span className={styles.countBadge}>{setores.length}</span>
                                    </h2>
                                    {canEdit && (
                                        <button className={styles.addButton} onClick={() => handleOpenSetorModal()}>
                                            <FiPlus />
                                            {t('producao.estrutura.sectors.add', 'Novo Setor')}
                                        </button>
                                    )}
                                </div>

                                {setores.length === 0 ? (
                                    <EmptyState
                                        title={t('producao.estrutura.sectors.emptyTitle', 'Nenhum setor cadastrado')}
                                        description={t('producao.estrutura.sectors.emptyDesc', 'Crie setores para agrupar suas maquinas nos relatorios.')}
                                    />
                                ) : (
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th className={styles.th}>{t('producao.estrutura.sectors.name', 'Nome')}</th>
                                                    <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '100px' }}>{t('producao.estrutura.sectors.order', 'Ordem')}</th>
                                                    <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '100px' }}>Status</th>
                                                    {canEdit && <th className={`${styles.th} ${styles.thCenter}`} style={{ width: '100px' }}>{t('common.actions', 'Acoes')}</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {setores.map(setor => (
                                                    <tr key={setor.id} className={styles.tr}>
                                                        <td className={styles.td}>
                                                            <span className={styles.sectorName}>{setor.nome}</span>
                                                        </td>
                                                        <td className={`${styles.td} ${styles.tdCenter}`}>
                                                            {setor.ordem}
                                                        </td>
                                                        <td className={`${styles.td} ${styles.tdCenter}`}>
                                                            <Badge variant={setor.ativo ? 'success' : 'neutral'}>
                                                                {setor.ativo ? t('common.active', 'Ativo') : t('common.inactive', 'Inativo')}
                                                            </Badge>
                                                        </td>
                                                        {canEdit && (
                                                            <td className={`${styles.td} ${styles.tdCenter}`}>
                                                                <div className={styles.actionGroup}>
                                                                    <button
                                                                        onClick={() => handleOpenSetorModal(setor)}
                                                                        className={styles.actionButton}
                                                                        title={t('common.edit', 'Editar')}
                                                                    >
                                                                        <FiEdit2 size={15} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setDeleteConfirmId(setor.id)}
                                                                        className={`${styles.actionButton} ${styles.danger}`}
                                                                        title={t('common.delete', 'Excluir')}
                                                                    >
                                                                        <FiTrash2 size={15} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── Modal Máquina ─────────────────────────────────────────── */}
                <Modal
                    isOpen={!!maquinaModal}
                    onClose={() => setMaquinaModal(null)}
                    title={maquinaModal ? `${t('common.edit', 'Editar')} — ${maquinaModal.nome}` : ''}
                >
                    {maquinaModal && (
                        <div className={styles.modalContent}>
                            <div className={styles.modalGrid}>

                                {/* Nome de exibição */}
                                <div className={styles.modalGridFull}>
                                    <label className={styles.fieldLabel}>
                                        {t('producao.estrutura.machines.displayName', 'Nome de Exibicao')}
                                    </label>
                                    <input
                                        className={styles.fieldInput}
                                        type="text"
                                        value={maquinaModal.nomeProducao}
                                        onChange={e => setMaquinaModal(prev => prev ? { ...prev, nomeProducao: e.target.value } : null)}
                                        placeholder={maquinaModal.nome}
                                    />
                                    <p className={styles.fieldHint}>
                                        {t('producao.estrutura.machines.displayNameHint', 'Deixe vazio para usar o nome original da maquina')}
                                    </p>
                                </div>

                                {/* Setor */}
                                <div>
                                    <label className={styles.fieldLabel}>
                                        {t('producao.estrutura.machines.sector', 'Setor')}
                                    </label>
                                    <select
                                        className={styles.fieldSelect}
                                        value={maquinaModal.setorProducaoId || ''}
                                        onChange={e => setMaquinaModal(prev => prev ? { ...prev, setorProducaoId: e.target.value || null } : null)}
                                    >
                                        {setorOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Ordem */}
                                <div>
                                    <label className={styles.fieldLabel}>
                                        {t('producao.estrutura.machines.order', 'Ordem de Exibicao')}
                                    </label>
                                    <input
                                        className={styles.fieldInput}
                                        type="number"
                                        value={maquinaModal.ordemProducao}
                                        onChange={e => setMaquinaModal(prev => prev ? { ...prev, ordemProducao: Number(e.target.value) } : null)}
                                    />
                                </div>

                                {/* Escopo Produção */}
                                <div className={styles.modalGridFull}>
                                    <label className={styles.toggleRow}>
                                        <input
                                            type="checkbox"
                                            checked={maquinaModal.escopoProducao}
                                            onChange={e => setMaquinaModal(prev => prev ? { ...prev, escopoProducao: e.target.checked } : null)}
                                            className={styles.checkbox}
                                        />
                                        <span className={styles.toggleLabel}>
                                            {t('producao.estrutura.machines.scope', 'Exibir nos relatorios de producao')}
                                        </span>
                                    </label>
                                </div>

                                <hr className={styles.modalDivider} />

                                {/* Aliases Excel */}
                                <div className={styles.modalGridFull}>
                                    <label className={styles.fieldLabel}>
                                        <FiTag size={12} style={{ marginRight: 4 }} />
                                        Aliases Excel
                                    </label>
                                    <textarea
                                        className={styles.aliasesTextarea}
                                        value={maquinaModal.aliasesText}
                                        onChange={e => setMaquinaModal(prev => prev ? { ...prev, aliasesText: e.target.value } : null)}
                                        rows={5}
                                        placeholder={'USINADORA\nTCN-20\n...'}
                                    />
                                    <p className={styles.fieldHint}>
                                        {t('producao.estrutura.aliases.help', 'Um alias por linha. Estes nomes mapeiam colunas do Excel importado para esta maquina.')}
                                    </p>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <Button variant="ghost" onClick={() => setMaquinaModal(null)}>
                                    {t('common.cancel', 'Cancelar')}
                                </Button>
                                <Button color="primary" onClick={handleSaveMaquinaModal} disabled={maquinaModal.isSaving}>
                                    {maquinaModal.isSaving ? t('common.saving', 'Salvando...') : t('common.save', 'Salvar')}
                                </Button>
                            </div>
                        </div>
                    )}
                </Modal>

                {/* ── Modal Setor ───────────────────────────────────────────── */}
                <Modal
                    isOpen={isSetorModalOpen}
                    onClose={() => setIsSetorModalOpen(false)}
                    title={editingSetor ? t('producao.estrutura.modal.editSector', 'Editar Setor') : t('producao.estrutura.modal.newSector', 'Novo Setor')}
                >
                    <div className={styles.modalContent}>
                        {setorError && (
                            <div className={styles.errorMsg}>{setorError}</div>
                        )}

                        <Input
                            label={t('producao.estrutura.modal.sectorName', 'Nome do Setor')}
                            value={setorForm.nome}
                            onChange={e => setSetorForm({ ...setorForm, nome: e.target.value })}
                            autoFocus
                            required
                        />

                        <Input
                            label={t('producao.estrutura.modal.order', 'Ordem de Exibicao')}
                            type="number"
                            value={setorForm.ordem}
                            onChange={e => setSetorForm({ ...setorForm, ordem: Number(e.target.value) })}
                        />
                        <p className={styles.helpText}>
                            {t('producao.estrutura.modal.orderHelp', 'Setores com menor ordem aparecem primeiro nos relatorios')}
                        </p>

                        <label className={styles.toggleRow}>
                            <input
                                type="checkbox"
                                checked={setorForm.ativo}
                                onChange={e => setSetorForm({ ...setorForm, ativo: e.target.checked })}
                                className={styles.checkbox}
                            />
                            <span className={styles.toggleLabel}>
                                {t('producao.estrutura.modal.active', 'Setor Ativo')}
                            </span>
                        </label>

                        <div className={styles.modalActions}>
                            <Button variant="ghost" onClick={() => setIsSetorModalOpen(false)}>
                                {t('common.cancel', 'Cancelar')}
                            </Button>
                            <Button color="primary" onClick={handleSaveSetor}>
                                {t('common.save', 'Salvar')}
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* ── Modal Confirmar Exclusão ──────────────────────────────── */}
                <Modal
                    isOpen={!!deleteConfirmId}
                    onClose={() => setDeleteConfirmId(null)}
                    title={t('producao.estrutura.modal.confirmDelete', 'Confirmar Exclusao')}
                >
                    <div className={styles.modalContent}>
                        <p className={styles.confirmText}>
                            {t('producao.estrutura.modal.confirmDeleteDesc', 'Deseja realmente excluir este setor? Esta acao nao pode ser desfeita.')}
                        </p>
                        <div className={styles.modalActions}>
                            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                                {t('common.cancel', 'Cancelar')}
                            </Button>
                            <Button color="primary" onClick={() => deleteConfirmId && handleDeleteSetor(deleteConfirmId)}>
                                {t('common.delete', 'Excluir')}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </>
    );
};

export default ProducaoEstruturaPage;
