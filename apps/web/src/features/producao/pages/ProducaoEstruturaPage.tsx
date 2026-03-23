import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    PageHeader, 
    Card, 
    Button, 
    Input, 
    Modal, 
    Select,
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
    atualizarMaquinaProducaoConfig
} from '../../../services/apiClient';
import type { ProducaoSetor, MaquinaProducaoConfig } from '@spiraview/shared';


// Como react-icons não foi garantido, usarei svg em inline styles se necessário, ou ícones padrões se houver.
// Corrigindo icones:
import { Plus, Edit2, Trash2, Save, X, Layers, Settings, AlertTriangle } from 'lucide-react'; // Geralmente Lucide é usado no SpiraView

import { useUsuario } from '../../../contexts/UserContext';
import styles from './ProducaoEstruturaPage.module.css';

export const ProducaoEstruturaPage: React.FC = () => {
    const { t } = useTranslation('common');
    const user = useUsuario();
    const { canEditAny } = usePermissions(user);
    const canEdit = canEditAny(['producao_config']);

    const [activeTab, setActiveTab] = useState<'setores' | 'maquinas'>('setores');
    
    const [setores, setSetores] = useState<ProducaoSetor[]>([]);
    const [maquinas, setMaquinas] = useState<MaquinaProducaoConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal Setor
    const [isSetorModalOpen, setIsSetorModalOpen] = useState(false);
    const [editingSetor, setEditingSetor] = useState<ProducaoSetor | null>(null);
    const [setorForm, setSetorForm] = useState({ nome: '', ordem: 0, ativo: true });
    
    // Edição inline de máquinas
    const [editingMaquinaId, setEditingMaquinaId] = useState<string | null>(null);
    const [maquinaForm, setMaquinaForm] = useState<{ setorProducaoId: string | null; ordemProducao: number; exibirProducao: boolean }>({
        setorProducaoId: null,
        ordemProducao: 0,
        exibirProducao: false
    });

    const [error, setError] = useState<string | null>(null);

    const loadSetores = async () => {
        try {
            const data = await listarSetoresProducao();
            setSetores(data);
        } catch (err: any) {
            console.error(err);
        }
    };

    const loadMaquinas = async () => {
        try {
            const data = await listarMaquinasProducaoConfig();
            setMaquinas(data);
        } catch (err: any) {
            console.error(err);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        await Promise.all([loadSetores(), loadMaquinas()]);
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Setores Actions
    const handleOpenSetorModal = (setor?: ProducaoSetor) => {
        setError(null);
        if (setor) {
            setEditingSetor(setor);
            setSetorForm({ nome: setor.nome, ordem: setor.ordem, ativo: setor.ativo });
        } else {
            setEditingSetor(null);
            setSetorForm({ nome: '', ordem: setores.length > 0 ? Math.max(...setores.map(s => s.ordem)) + 10 : 0, ativo: true });
        }
        setIsSetorModalOpen(true);
    };

    const handleSaveSetor = async () => {
        try {
            setError(null);
            if (!setorForm.nome.trim()) {
                setError('Nome é obrigatório');
                return;
            }
            if (editingSetor) {
                await atualizarSetorProducao(editingSetor.id, setorForm);
            } else {
                await criarSetorProducao(setorForm);
            }
            setIsSetorModalOpen(false);
            loadSetores();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar setor');
        }
    };

    const handleDeleteSetor = async (id: string) => {
        if (!confirm('Deseja realmente excluir este setor?')) return;
        try {
            setError(null);
            await deletarSetorProducao(id);
            loadSetores();
        } catch (err: any) {
            alert(err.message || 'Erro ao excluir setor');
        }
    };

    // Máquinas Actions
    const handleStartEditMaquina = (m: MaquinaProducaoConfig) => {
        setEditingMaquinaId(m.id);
        setMaquinaForm({
            setorProducaoId: m.setorProducaoId,
            ordemProducao: m.ordemProducao,
            exibirProducao: m.escopoProducao
        });
    };

    const handleSaveMaquina = async (id: string) => {
        try {
            await atualizarMaquinaProducaoConfig(id, maquinaForm);
            setEditingMaquinaId(null);
            loadMaquinas();
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar máquina');
        }
    };

    const setorOptions = [
        { value: '', label: 'Sem Setor' },
        ...setores.map(s => ({ value: s.id, label: s.nome }))
    ];

    return (
        <div className={styles.container}>
            <PageHeader
                title="Estrutura de Produção"
            />

            <div className={styles.headerActions}>
                <div className={styles.tabsContainer}>
                    <button
                        onClick={() => setActiveTab('setores')}
                        className={`${styles.tab} ${activeTab === 'setores' ? styles.tabActive : ''}`}
                    >
                        <Layers size={18} />
                        Setores (Agrupamento)
                    </button>
                    <button
                        onClick={() => setActiveTab('maquinas')}
                        className={`${styles.tab} ${activeTab === 'maquinas' ? styles.tabActive : ''}`}
                    >
                        <Settings size={18} />
                        Máquinas e Ordenação
                    </button>
                </div>
            </div>

            {activeTab === 'setores' && (
                <div className={styles.card}>
                    {isLoading ? (
                        <div className="p-8 flex justify-center text-gray-400">Carregando...</div>
                    ) : (
                        <>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>
                                    Setores de Produção ({setores.length})
                                </h2>
                                {canEdit && (
                                    <button className={styles.addButton} onClick={() => handleOpenSetorModal()}>
                                        <Plus size={16} /> Novo Setor
                                    </button>
                                )}
                            </div>

                            {setores.length === 0 ? (
                                <EmptyState 
                                    title="Nenhum setor cadastrado"
                                    description="Crie setores para agrupar suas máquinas nos relatórios."
                                />
                            ) : (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th className={styles.th}>Nome</th>
                                                <th className={styles.th} style={{textAlign: 'center', width: '100px'}}>Ordem</th>
                                                <th className={styles.th} style={{textAlign: 'center', width: '100px'}}>Status</th>
                                                {canEdit && <th className={styles.th} style={{textAlign: 'center', width: '100px'}}>Ações</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {setores.map(setor => (
                                                <tr key={setor.id} className={styles.tr}>
                                                    <td className={styles.td}>
                                                        <span className="font-semibold">{setor.nome}</span>
                                                    </td>
                                                    <td className={styles.td} style={{textAlign: 'center'}}>
                                                        {setor.ordem}
                                                    </td>
                                                    <td className={styles.td} style={{textAlign: 'center'}}>
                                                        <Badge variant={setor.ativo ? 'success' : 'neutral'}>
                                                            {setor.ativo ? 'Ativo' : 'Inativo'}
                                                        </Badge>
                                                    </td>
                                                    {canEdit && (
                                                        <td className={styles.td}>
                                                            <div className="flex justify-center gap-2">
                                                                <button 
                                                                    onClick={() => handleOpenSetorModal(setor)}
                                                                    className={styles.actionButton}
                                                                    title="Editar"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeleteSetor(setor.id)}
                                                                    className={`${styles.actionButton} ${styles.danger}`}
                                                                    title="Excluir"
                                                                >
                                                                    <Trash2 size={16} />
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
            {activeTab === 'maquinas' && (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>
                            Configuração de Máquinas da Produção
                        </h2>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500" />
                            Apenas máquinas com Escopo Produção = SIM aparecerão nos relatórios
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table} style={{ minWidth: '800px' }}>
                            <thead>
                                <tr>
                                    <th className={styles.th}>Máquina</th>
                                    <th className={styles.th}>Nome Exibição (Produção)</th>
                                    <th className={styles.th} style={{ width: '12rem' }}>Setor Agrupador</th>
                                    <th className={styles.th} style={{ textAlign: 'center', width: '6rem' }}>Ordem</th>
                                    <th className={styles.th} style={{ textAlign: 'center', width: '8rem' }}>Escopo Prod.</th>
                                    {canEdit && <th className={styles.th} style={{ textAlign: 'center', width: '6rem' }}>Ações</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {maquinas.map(m => {
                                    const isEditing = editingMaquinaId === m.id;
                                    const setorObj = setores.find(s => s.id === m.setorProducaoId);

                                    return (
                                        <tr key={m.id} className={`${styles.tr} ${!m.escopoProducao && !isEditing ? 'opacity-50' : ''}`}>
                                            <td className={styles.td}>
                                                <span className="font-semibold">{m.nome}</span>
                                            </td>
                                            <td className={styles.td}>
                                                <span className="text-gray-600 dark:text-gray-300">{m.nomeProducao || m.nome}</span>
                                            </td>
                                            <td className={styles.td}>
                                                {isEditing ? (
                                                    <select
                                                        value={maquinaForm.setorProducaoId || ''}
                                                        onChange={e => setMaquinaForm({...maquinaForm, setorProducaoId: e.target.value || null})}
                                                        className={styles.input}
                                                        style={{ padding: '8px', fontSize: '0.85rem' }}
                                                    >
                                                        {setorOptions.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className={setorObj ? "text-gray-800 dark:text-gray-200" : "text-gray-400 italic"}>
                                                        {setorObj?.nome || 'Sem Setor'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={styles.td} style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <Input 
                                                        type="number"
                                                        value={maquinaForm.ordemProducao}
                                                        onChange={e => setMaquinaForm({...maquinaForm, ordemProducao: Number(e.target.value)})}
                                                        className="w-full text-center text-sm"
                                                    />
                                                ) : (
                                                    <span className="text-gray-600 dark:text-gray-400">{m.ordemProducao}</span>
                                                )}
                                            </td>
                                            <td className={styles.td} style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <label className="flex items-center justify-center cursor-pointer">
                                                        <input 
                                                            type="checkbox"
                                                            checked={maquinaForm.exibirProducao}
                                                            onChange={e => setMaquinaForm({...maquinaForm, exibirProducao: e.target.checked})}
                                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                        />
                                                    </label>
                                                ) : (
                                                    <Badge variant={m.escopoProducao ? 'success' : 'neutral'}>
                                                        {m.escopoProducao ? 'SIM' : 'NÃO'}
                                                    </Badge>
                                                )}
                                            </td>
                                            {canEdit && (
                                                <td className={styles.td} style={{ textAlign: 'center' }}>
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button 
                                                                onClick={() => handleSaveMaquina(m.id)}
                                                                className={`${styles.actionButton} text-green-600 hover:text-green-700`}
                                                                title="Salvar"
                                                            >
                                                                <Save size={18} />
                                                            </button>
                                                            <button 
                                                                onClick={() => setEditingMaquinaId(null)}
                                                                className={`${styles.actionButton} ${styles.danger}`}
                                                                title="Cancelar"
                                                            >
                                                                <X size={18} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleStartEditMaquina(m)}
                                                            className={styles.actionButton}
                                                            title="Editar"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal
                isOpen={isSetorModalOpen}
                onClose={() => setIsSetorModalOpen(false)}
                title={editingSetor ? 'Editar Setor' : 'Novo Setor'}
            >
                <div className="flex flex-col gap-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-md border border-red-100 dark:border-red-900/30">
                            {error}
                        </div>
                    )}
                    
                    <Input 
                        label="Nome do Setor"
                        value={setorForm.nome}
                        onChange={e => setSetorForm({...setorForm, nome: e.target.value})}
                        autoFocus
                        required
                    />
                    
                    <Input 
                        label="Ordem de Exibição"
                        type="number"
                        value={setorForm.ordem}
                        onChange={e => setSetorForm({...setorForm, ordem: Number(e.target.value)})}
                    />
                    <p className="text-sm text-gray-500 mt-1">Setores com menor ordem aparecem primeiro nos relatórios</p>

                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input 
                            type="checkbox"
                            checked={setorForm.ativo}
                            onChange={e => setSetorForm({...setorForm, ativo: e.target.checked})}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Setor Ativo</span>
                    </label>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <Button variant="ghost" onClick={() => setIsSetorModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button color="primary" onClick={handleSaveSetor}>
                            Salvar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
