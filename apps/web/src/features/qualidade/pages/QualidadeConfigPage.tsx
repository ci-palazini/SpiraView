
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiEdit2, FiCheck, FiX, FiSettings, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
    listarOrigens, criarOrigem, editarOrigem, getOrigemUsage, deletarOrigem,
    listarMotivos, criarMotivo, editarMotivo, getMotivoUsage, deletarMotivo,
    listarResponsaveisSettings, criarResponsavel, editarResponsavel, getResponsavelUsage, deletarResponsavel,
    listarNaoConformidades, criarNaoConformidade, editarNaoConformidade, getNaoConformidadeUsage, deletarNaoConformidade,
    listarSolicitantes, criarSolicitante, editarSolicitante, getSolicitanteUsage, deletarSolicitante,
    QualidadeOpcao
} from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeConfigPage.module.css';

interface ConfigSectionProps {
    title: string;
    items: QualidadeOpcao[];
    loading: boolean;
    onAdd: (name: string, tipo?: 'INTERNO' | 'EXTERNO') => Promise<void>;
    onUpdate: (id: number, name: string, active: boolean, tipo?: 'INTERNO' | 'EXTERNO') => Promise<void>;
    onDelete?: (item: QualidadeOpcao) => void;
    showType?: boolean;
}

const ConfigSection = ({ title, items, loading, onAdd, onUpdate, onDelete, showType }: ConfigSectionProps) => {
    const { t } = useTranslation();
    const [newItemName, setNewItemName] = useState('');
    const [newItemType, setNewItemType] = useState<'INTERNO' | 'EXTERNO'>('EXTERNO');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editType, setEditType] = useState<'INTERNO' | 'EXTERNO'>('EXTERNO');

    const handleCreate = async () => {
        if (!newItemName.trim()) return;
        await onAdd(newItemName, showType ? newItemType : undefined);
        setNewItemName('');
    };

    const startEdit = (item: QualidadeOpcao) => {
        setEditingId(item.id);
        setEditName(item.nome);
        setEditType(item.tipo || 'EXTERNO');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const submitEdit = async (id: number, active: boolean) => {
        await onUpdate(id, editName, active, showType ? editType : undefined);
        setEditingId(null);
    };

    return (
        <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>{title}</h3>

            <div className={styles.addItemRow}>
                <input
                    type="text"
                    className={styles.input}
                    placeholder={t('quality.config.addPlaceholder', 'Adicionar novo...')}
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                {showType && (
                    <select
                        className={styles.typeSelect}
                        value={newItemType}
                        onChange={(e) => setNewItemType(e.target.value as 'INTERNO' | 'EXTERNO')}
                    >
                        <option value="INTERNO">{t('quality.config.internal', 'Interno')}</option>
                        <option value="EXTERNO">{t('quality.config.external', 'Externo')}</option>
                    </select>
                )}
                <button className={styles.primaryBtn} onClick={handleCreate}>
                    <FiPlus />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>{t('quality.config.loading', 'Carregando...')}</div>
            ) : (
                <div className={styles.list}>
                    {items.length === 0 && <div className={styles.empty}>{t('quality.config.empty', 'Nenhum item cadastrado.')}</div>}
                    {items.map(item => (
                        <div key={item.id} className={`${styles.item} ${!item.ativo ? styles.inactive : ''}`}>
                            {editingId === item.id ? (
                                <div className={styles.editRow}>
                                    <input
                                        className={styles.editInput}
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        autoFocus
                                    />
                                    {showType && (
                                        <select
                                            className={styles.typeSelect}
                                            value={editType}
                                            onChange={(e) => setEditType(e.target.value as 'INTERNO' | 'EXTERNO')}
                                        >
                                            <option value="INTERNO">{t('quality.config.internal', 'Interno')}</option>
                                            <option value="EXTERNO">{t('quality.config.external', 'Externo')}</option>
                                        </select>
                                    )}
                                    <button className={styles.iconBtn} onClick={() => submitEdit(item.id, item.ativo)}>
                                        <FiCheck color="green" />
                                    </button>
                                    <button className={styles.iconBtn} onClick={cancelEdit}>
                                        <FiX color="red" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span className={styles.itemName}>{item.nome}</span>
                                        {showType && (
                                            <span className={`${styles.typeBadge} ${item.tipo === 'INTERNO' ? styles.interno : styles.externo}`}>
                                                {item.tipo === 'INTERNO' ? t('quality.config.internal', 'Interno') : t('quality.config.external', 'Externo')}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.actions}>
                                        <label className={styles.toggle} title={item.ativo ? t('quality.config.active', 'Ativo') : t('quality.config.inactive', 'Inativo')}>
                                            <input
                                                type="checkbox"
                                                checked={item.ativo}
                                                onChange={(e) => onUpdate(item.id, item.nome, e.target.checked)}
                                            />
                                            <span className={styles.slider}></span>
                                        </label>
                                        <button className={styles.iconBtn} onClick={() => startEdit(item)} title={t('quality.config.edit', 'Editar')}>
                                            <FiEdit2 />
                                        </button>
                                        {onDelete && (
                                            <button className={styles.iconBtn} onClick={() => onDelete(item)} title={t('quality.config.delete', 'Excluir')}>
                                                <FiTrash2 color="#ef4444" />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function QualidadeConfigPage() {
    const { t } = useTranslation();
    const [origens, setOrigens] = useState<QualidadeOpcao[]>([]);
    const [motivos, setMotivos] = useState<QualidadeOpcao[]>([]);
    const [responsaveis, setResponsaveis] = useState<QualidadeOpcao[]>([]);
    const [naoConformidades, setNaoConformidades] = useState<QualidadeOpcao[]>([]);
    const [solicitantes, setSolicitantes] = useState<QualidadeOpcao[]>([]);
    const [loading, setLoading] = useState(true);

    // Estado para modal de exclusão/transferência
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<QualidadeOpcao | null>(null);
    const [deleteType, setDeleteType] = useState<'responsavel' | 'origem' | 'motivo' | 'nao_conformidade' | 'solicitante'>('responsavel');
    const [usageCount, setUsageCount] = useState(0);
    const [transferTargetId, setTransferTargetId] = useState<number | ''>('');
    const [deleting, setDeleting] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [o, m, r, nc, sol] = await Promise.all([
                listarOrigens(true), listarMotivos(true), listarResponsaveisSettings(true),
                listarNaoConformidades(true), listarSolicitantes(true)
            ]);
            setOrigens(o);
            setMotivos(m);
            setResponsaveis(r);
            setNaoConformidades(nc);
            setSolicitantes(sol);
        } catch (err) {
            console.error(err);
            toast.error(t('quality.config.loadError', 'Erro ao carregar dados.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const handleAddOrigem = async (name: string, tipo?: 'INTERNO' | 'EXTERNO') => {
        try {
            await criarOrigem(name, tipo);
            toast.success(t('quality.config.originCreated', 'Origem criada!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.originCreateError', 'Erro ao criar origem.'));
        }
    };

    const handleUpdateOrigem = async (id: number, nome: string, ativo: boolean, tipo?: 'INTERNO' | 'EXTERNO') => {
        try {
            await editarOrigem(id, { nome, ativo, tipo });
            toast.success(t('quality.config.originUpdateSuccess', 'Origem atualizada!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.originUpdateError', 'Erro ao atualizar origem.'));
        }
    };

    const handleAddMotivo = async (name: string) => {
        try {
            await criarMotivo(name);
            toast.success(t('quality.config.reasonCreated', 'Motivo criado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.reasonCreateError', 'Erro ao criar motivo.'));
        }
    };

    const handleUpdateMotivo = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarMotivo(id, { nome, ativo });
            toast.success(t('quality.config.reasonUpdateSuccess', 'Motivo atualizado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.reasonUpdateError', 'Erro ao atualizar motivo.'));
        }
    };

    const handleAddResponsavel = async (name: string) => {
        try {
            await criarResponsavel(name);
            toast.success(t('quality.config.respCreated', 'Responsável criado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.respCreateError', 'Erro ao criar responsável.'));
        }
    };

    const handleUpdateResponsavel = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarResponsavel(id, { nome, ativo });
            toast.success(t('quality.config.respUpdateSuccess', 'Responsável atualizado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.respUpdateError', 'Erro ao atualizar responsável.'));
        }
    };

    // ── Retrabalho: Não Conformidades ──
    const handleAddNaoConformidade = async (name: string) => {
        try {
            await criarNaoConformidade(name);
            toast.success(t('quality.config.ncCreated', 'Não conformidade criada!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.ncCreateError', 'Erro ao criar não conformidade.'));
        }
    };

    const handleUpdateNaoConformidade = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarNaoConformidade(id, { nome, ativo });
            toast.success(t('quality.config.ncUpdateSuccess', 'Não conformidade atualizada!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.ncUpdateError', 'Erro ao atualizar não conformidade.'));
        }
    };

    // ── Retrabalho: Solicitantes ──
    const handleAddSolicitante = async (name: string) => {
        try {
            await criarSolicitante(name);
            toast.success(t('quality.config.solCreated', 'Solicitante criado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.solCreateError', 'Erro ao criar solicitante.'));
        }
    };

    const handleUpdateSolicitante = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarSolicitante(id, { nome, ativo });
            toast.success(t('quality.config.solUpdateSuccess', 'Solicitante atualizado!'));
            fetchAll();
        } catch (e) {
            toast.error(t('quality.config.solUpdateError', 'Erro ao atualizar solicitante.'));
        }
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        if (usageCount > 0 && !transferTargetId) {
            toast.error(t('quality.config.selectTransferTarget', 'Selecione um destino para transferir os vínculos.'));
            return;
        }

        setDeleting(true);
        try {
            if (deleteType === 'responsavel') {
                await deletarResponsavel(itemToDelete.id, transferTargetId ? Number(transferTargetId) : undefined);
            } else if (deleteType === 'origem') {
                await deletarOrigem(itemToDelete.id, transferTargetId ? Number(transferTargetId) : undefined);
            } else if (deleteType === 'motivo') {
                await deletarMotivo(itemToDelete.id, transferTargetId ? Number(transferTargetId) : undefined);
            } else if (deleteType === 'nao_conformidade') {
                await deletarNaoConformidade(itemToDelete.id, transferTargetId ? Number(transferTargetId) : undefined);
            } else if (deleteType === 'solicitante') {
                await deletarSolicitante(itemToDelete.id, transferTargetId ? Number(transferTargetId) : undefined);
            }

            toast.success(t('quality.config.deleteSuccess', 'Excluído com sucesso!'));
            setDeleteModalOpen(false);
            setItemToDelete(null);
            setTransferTargetId('');
            fetchAll();
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || t('quality.config.deleteError', 'Erro ao excluir item.'));
        } finally {
            setDeleting(false);
        }
    };

    const checkAndDelete = async (item: QualidadeOpcao, type: 'responsavel' | 'origem' | 'motivo' | 'nao_conformidade' | 'solicitante') => {
        try {
            let count = 0;
            if (type === 'responsavel') {
                const res = await getResponsavelUsage(item.id);
                count = res.count;
            } else if (type === 'origem') {
                const res = await getOrigemUsage(item.id);
                count = res.count;
            } else if (type === 'motivo') {
                const res = await getMotivoUsage(item.id);
                count = res.count;
            } else if (type === 'nao_conformidade') {
                const res = await getNaoConformidadeUsage(item.id);
                count = res.count;
            } else if (type === 'solicitante') {
                const res = await getSolicitanteUsage(item.id);
                count = res.count;
            }

            setItemToDelete(item);
            setDeleteType(type);
            setUsageCount(count);
            setTransferTargetId('');
            setDeleteModalOpen(true);
        } catch (e) {
            toast.error(t('quality.config.usageCheckError', 'Erro ao verificar uso do item.'));
        }
    };

    return (
        <>
            <PageHeader
                title={t('quality.settings', 'Configurações da Qualidade')}
                subtitle={t('quality.settingsSubtitle', 'Gerencie as origens e motivos de defeito.')}
            />

            <div className={styles.container}>
                <div className={styles.grid}>
                    <ConfigSection
                        title={t('quality.config.origins', 'Origens')}
                        items={origens}
                        loading={loading}
                        onAdd={handleAddOrigem}
                        onUpdate={handleUpdateOrigem}
                        onDelete={(item) => checkAndDelete(item, 'origem')}
                        showType
                    />
                    <ConfigSection
                        title={t('quality.config.reasons', 'Motivos de Defeito')}
                        items={motivos}
                        loading={loading}
                        onAdd={handleAddMotivo}
                        onUpdate={handleUpdateMotivo}
                        onDelete={(item) => checkAndDelete(item, 'motivo')}
                    />
                    <ConfigSection
                        title={t('quality.config.responsibles', 'Responsáveis')}
                        items={responsaveis}
                        loading={loading}
                        onAdd={handleAddResponsavel}
                        onUpdate={handleUpdateResponsavel}
                        onDelete={(item) => checkAndDelete(item, 'responsavel')}
                    />
                </div>

                {/* Retrabalho Settings Section */}
                <h3 style={{ marginTop: '32px', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700, color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    {t('quality.config.retrabalhoSection', '🔧 Retrabalho')}
                </h3>
                <div className={styles.grid}>
                    <ConfigSection
                        title={t('quality.config.naoConformidades', 'Não Conformidades')}
                        items={naoConformidades}
                        loading={loading}
                        onAdd={handleAddNaoConformidade}
                        onUpdate={handleUpdateNaoConformidade}
                        onDelete={(item) => checkAndDelete(item, 'nao_conformidade')}
                    />
                    <ConfigSection
                        title={t('quality.config.solicitantes', 'Solicitantes')}
                        items={solicitantes}
                        loading={loading}
                        onAdd={handleAddSolicitante}
                        onUpdate={handleUpdateSolicitante}
                        onDelete={(item) => checkAndDelete(item, 'solicitante')}
                    />
                </div>
            </div>

            {/* Modal de Exclusão/Transferência */}
            {deleteModalOpen && itemToDelete && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-card, #fff)', padding: '24px', borderRadius: '8px',
                        width: '100%', maxWidth: '400px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.25rem', marginBottom: '16px' }}>
                            {t('quality.config.confirmDelete', { name: itemToDelete.nome, defaultValue: `Excluir ${itemToDelete.nome}?` })}
                        </h3>

                        {usageCount > 0 ? (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c',
                                    padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem'
                                }}>
                                    {t('quality.config.usageWarning', { count: usageCount, defaultValue: `⚠️ Este item possui ${usageCount} registros vinculados. Para excluir, você deve transferir estes registros.` })}
                                </div>

                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                                    {t('quality.config.transferTo', 'Transferir para:')}
                                </label>
                                <select
                                    style={{
                                        width: '100%', padding: '8px', borderRadius: '4px',
                                        border: '1px solid var(--border-color, #e5e7eb)',
                                        backgroundColor: 'var(--bg-input, #fff)',
                                        color: 'var(--text-primary, #000)'
                                    }}
                                    value={transferTargetId}
                                    onChange={(e) => setTransferTargetId(Number(e.target.value))}
                                >
                                    <option value="">{t('quality.config.selectPlaceholder', 'Selecione...')}</option>
                                    {(deleteType === 'responsavel' ? responsaveis : deleteType === 'origem' ? origens : deleteType === 'motivo' ? motivos : deleteType === 'nao_conformidade' ? naoConformidades : solicitantes)
                                        .filter(r => r.id !== itemToDelete.id && r.ativo)
                                        .map(r => (
                                            <option key={r.id} value={r.id}>{r.nome}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        ) : (
                            <p style={{ marginBottom: '24px', color: 'var(--text-secondary, #666)' }}>
                                {t('quality.config.deletePermanentWarning', 'Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.')}
                            </p>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                disabled={deleting}
                                style={{
                                    padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--border-color, #ddd)',
                                    backgroundColor: 'transparent', cursor: 'pointer'
                                }}
                            >
                                {t('quality.config.cancel', 'Cancelar')}
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting || (usageCount > 0 && !transferTargetId)}
                                style={{
                                    padding: '8px 16px', borderRadius: '4px', border: 'none',
                                    backgroundColor: '#ef4444', color: 'white', cursor: 'pointer',
                                    opacity: (usageCount > 0 && !transferTargetId) ? 0.5 : 1
                                }}
                            >
                                {deleting ? t('quality.config.deleting', 'Excluindo...') : t('quality.config.delete', 'Excluir')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
