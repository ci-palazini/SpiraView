
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiEdit2, FiCheck, FiX, FiSettings, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
    listarOrigens, criarOrigem, editarOrigem,
    listarMotivos, criarMotivo, editarMotivo,
    listarResponsaveisSettings, criarResponsavel, editarResponsavel,
    QualidadeOpcao
} from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeConfigPage.module.css';

interface ConfigSectionProps {
    title: string;
    items: QualidadeOpcao[];
    loading: boolean;
    onAdd: (name: string) => Promise<void>;
    onUpdate: (id: number, name: string, active: boolean) => Promise<void>;
    onDelete?: (item: QualidadeOpcao) => void;
}

const ConfigSection = ({ title, items, loading, onAdd, onUpdate, onDelete }: ConfigSectionProps) => {
    const [newItemName, setNewItemName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');

    const handleCreate = async () => {
        if (!newItemName.trim()) return;
        await onAdd(newItemName);
        setNewItemName('');
    };

    const startEdit = (item: QualidadeOpcao) => {
        setEditingId(item.id);
        setEditName(item.nome);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const submitEdit = async (id: number, active: boolean) => {
        await onUpdate(id, editName, active);
        setEditingId(null);
    };

    return (
        <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>{title}</h3>

            <div className={styles.addItemRow}>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Adicionar novo..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <button className={styles.primaryBtn} onClick={handleCreate}>
                    <FiPlus />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>Carregando...</div>
            ) : (
                <div className={styles.list}>
                    {items.length === 0 && <div className={styles.empty}>Nenhum item cadastrado.</div>}
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
                                    <button className={styles.iconBtn} onClick={() => submitEdit(item.id, item.ativo)}>
                                        <FiCheck color="green" />
                                    </button>
                                    <button className={styles.iconBtn} onClick={cancelEdit}>
                                        <FiX color="red" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span className={styles.itemName}>{item.nome}</span>
                                    <div className={styles.actions}>
                                        <label className={styles.toggle} title={item.ativo ? "Ativo" : "Inativo"}>
                                            <input
                                                type="checkbox"
                                                checked={item.ativo}
                                                onChange={(e) => onUpdate(item.id, item.nome, e.target.checked)}
                                            />
                                            <span className={styles.slider}></span>
                                        </label>
                                        <button className={styles.iconBtn} onClick={() => startEdit(item)} title="Editar">
                                            <FiEdit2 />
                                        </button>
                                        {onDelete && (
                                            <button className={styles.iconBtn} onClick={() => onDelete(item)} title="Excluir">
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
    const [loading, setLoading] = useState(true);

    // Estado para modal de exclusão/transferência
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [responsavelToDelete, setResponsavelToDelete] = useState<QualidadeOpcao | null>(null);
    const [usageCount, setUsageCount] = useState(0);
    const [transferTargetId, setTransferTargetId] = useState<number | ''>('');
    const [deleting, setDeleting] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [o, m, r] = await Promise.all([listarOrigens(true), listarMotivos(true), listarResponsaveisSettings(true)]);
            setOrigens(o);
            setMotivos(m);
            setResponsaveis(r);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar dados.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const handleAddOrigem = async (name: string) => {
        try {
            await criarOrigem(name);
            toast.success('Origem criada!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao criar origem.');
        }
    };

    const handleUpdateOrigem = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarOrigem(id, { nome, ativo });
            toast.success('Origem atualizada!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao atualizar origem.');
        }
    };

    const handleAddMotivo = async (name: string) => {
        try {
            await criarMotivo(name);
            toast.success('Motivo criado!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao criar motivo.');
        }
    };

    const handleUpdateMotivo = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarMotivo(id, { nome, ativo });
            toast.success('Motivo atualizado!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao atualizar motivo.');
        }
    };

    const handleAddResponsavel = async (name: string) => {
        try {
            await criarResponsavel(name);
            toast.success('Responsável criado!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao criar responsável.');
        }
    };

    const handleUpdateResponsavel = async (id: number, nome: string, ativo: boolean) => {
        try {
            await editarResponsavel(id, { nome, ativo });
            toast.success('Responsável atualizado!');
            fetchAll();
        } catch (e) {
            toast.error('Erro ao atualizar responsável.');
        }
    };

    const confirmDeleteResponsavel = async () => {
        if (!responsavelToDelete) return;

        // Se tem uso e não selecionou destino
        if (usageCount > 0 && !transferTargetId) {
            toast.error('Selecione um responsável para transferir os vínculos.');
            return;
        }

        setDeleting(true);
        try {
            // Importar funções dinamicamente se não estiverem no topo ou usar as do apiClient 
            // assumindo que foram importadas corretamente
            await import('../../../services/apiClient').then(mod =>
                mod.deletarResponsavel(responsavelToDelete.id, transferTargetId ? Number(transferTargetId) : undefined)
            );

            toast.success('Responsável excluído com sucesso!');
            setDeleteModalOpen(false);
            setResponsavelToDelete(null);
            setTransferTargetId('');
            fetchAll();
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Erro ao excluir responsável.');
        } finally {
            setDeleting(false);
        }
    };

    const checkAndDeleteResponsavel = async (item: QualidadeOpcao) => {
        try {
            const mod = await import('../../../services/apiClient');
            const { count } = await mod.getResponsavelUsage(item.id);

            setResponsavelToDelete(item);
            setUsageCount(count);
            setTransferTargetId('');
            setDeleteModalOpen(true);
        } catch (e) {
            toast.error('Erro ao verificar uso do responsável.');
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
                        title="Origens"
                        items={origens}
                        loading={loading}
                        onAdd={handleAddOrigem}
                        onUpdate={handleUpdateOrigem}
                    />
                    <ConfigSection
                        title="Motivos de Defeito"
                        items={motivos}
                        loading={loading}
                        onAdd={handleAddMotivo}
                        onUpdate={handleUpdateMotivo}
                    />
                    <ConfigSection
                        title="Responsáveis"
                        items={responsaveis}
                        loading={loading}
                        onAdd={handleAddResponsavel}
                        onUpdate={handleUpdateResponsavel}
                        onDelete={checkAndDeleteResponsavel}
                    />
                </div>
            </div>

            {/* Modal de Exclusão/Transferência */}
            {deleteModalOpen && responsavelToDelete && (
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
                            Excluir {responsavelToDelete.nome}?
                        </h3>

                        {usageCount > 0 ? (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c',
                                    padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem'
                                }}>
                                    ⚠️ Este responsável possui <strong>{usageCount}</strong> registros vinculados.
                                    Para excluir, você deve transferir estes registros para outra pessoa.
                                </div>

                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                                    Transferir para:
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
                                    <option value="">Selecione...</option>
                                    {responsaveis
                                        .filter(r => r.id !== responsavelToDelete.id && r.ativo)
                                        .map(r => (
                                            <option key={r.id} value={r.id}>{r.nome}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        ) : (
                            <p style={{ marginBottom: '24px', color: 'var(--text-secondary, #666)' }}>
                                Tem certeza que deseja excluir este responsável? Esta ação não pode ser desfeita.
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
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteResponsavel}
                                disabled={deleting || (usageCount > 0 && !transferTargetId)}
                                style={{
                                    padding: '8px 16px', borderRadius: '4px', border: 'none',
                                    backgroundColor: '#ef4444', color: 'white', cursor: 'pointer',
                                    opacity: (usageCount > 0 && !transferTargetId) ? 0.5 : 1
                                }}
                            >
                                {deleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
