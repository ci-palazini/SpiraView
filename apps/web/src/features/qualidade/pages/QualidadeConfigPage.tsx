
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiEdit2, FiCheck, FiX, FiSettings, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
    listarOrigens, criarOrigem, editarOrigem,
    listarMotivos, criarMotivo, editarMotivo,
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
}

const ConfigSection = ({ title, items, loading, onAdd, onUpdate }: ConfigSectionProps) => {
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
                                        <button className={styles.iconBtn} onClick={() => startEdit(item)}>
                                            <FiEdit2 />
                                        </button>
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
    const [loading, setLoading] = useState(true);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [o, m] = await Promise.all([listarOrigens(), listarMotivos()]);
            setOrigens(o);
            setMotivos(m);
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
                </div>
            </div>
        </>
    );
}
