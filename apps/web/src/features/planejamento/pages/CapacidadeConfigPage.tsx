// src/features/planejamento/pages/CapacidadeConfigPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { FiSettings, FiSave, FiLayers, FiEdit2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import PageHeader from '../../../shared/components/PageHeader';
import {
    listarMaquinasPlanejamento,
    atualizarMaquinaPlanejamento,
    type MaquinaPlanejamento,
} from '../../../services/apiClient';
import styles from './CapacidadeConfigPage.module.css';

interface User {
    role?: string;
    email?: string;
}

interface CapacidadeConfigPageProps {
    user?: User;
}

export default function CapacidadeConfigPage({ user }: CapacidadeConfigPageProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [maquinas, setMaquinas] = useState<MaquinaPlanejamento[]>([]);

    // Estado de edição
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCapacidade, setEditCapacidade] = useState('');
    const [editAliases, setEditAliases] = useState('');
    const [editSetorPlanejamento, setEditSetorPlanejamento] = useState('');

    const fetchMaquinas = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listarMaquinasPlanejamento({ role: user?.role, email: user?.email });
            setMaquinas(data);
        } catch (err) {
            console.error('Erro ao buscar máquinas:', err);
            toast.error(t('planejamento.config.loadError', 'Erro ao carregar máquinas'));
        } finally {
            setLoading(false);
        }
    }, [t, user]);

    useEffect(() => {
        fetchMaquinas();
    }, [fetchMaquinas]);

    const startEditing = (maq: MaquinaPlanejamento) => {
        setEditingId(maq.id);
        setEditCapacidade(String(maq.capacidadeHoras || ''));
        setEditAliases((maq.aliasesPlanejamento || []).join(', '));
        setEditSetorPlanejamento(maq.setorPlanejamento || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditCapacidade('');
        setEditAliases('');
        setEditSetorPlanejamento('');
    };

    const handleToggleScope = async (maq: MaquinaPlanejamento) => {
        setSaving(maq.id);
        try {
            await atualizarMaquinaPlanejamento(
                maq.id,
                { escopoPlanejamento: !maq.escopoPlanejamento },
                { role: user?.role, email: user?.email }
            );
            toast.success(t('planejamento.config.scopeToggled', 'Status no planejamento atualizado!'));
            fetchMaquinas();
        } catch (err: any) {
            toast.error(err.message || t('planejamento.config.saveError', 'Erro ao salvar'));
        } finally {
            setSaving(null);
        }
    };

    const handleSave = async (id: string) => {
        const capacidadeNum = parseFloat(editCapacidade.replace(',', '.'));
        if (isNaN(capacidadeNum) || capacidadeNum < 0) {
            toast.error(t('planejamento.config.capacityRequired', 'Informe uma capacidade válida'));
            return;
        }

        const aliasesArray = editAliases
            .split(',')
            .map(a => a.trim())
            .filter(a => a.length > 0);

        setSaving(id);
        try {
            await atualizarMaquinaPlanejamento(
                id,
                {
                    capacidadeHoras: capacidadeNum,
                    aliasesPlanejamento: aliasesArray,
                    setorPlanejamento: editSetorPlanejamento.trim() || ''
                },
                { role: user?.role, email: user?.email }
            );
            toast.success(t('planejamento.config.saved', 'Capacidade salva com sucesso'));
            cancelEditing();
            fetchMaquinas();
        } catch (err: any) {
            toast.error(err.message || t('planejamento.config.saveError', 'Erro ao salvar'));
        } finally {
            setSaving(null);
        }
    };

    return (
        <>
            <PageHeader
                title={t('planejamento.config.title', 'Configuração de Capacidades')}
                subtitle={t('planejamento.config.subtitle', 'Defina a capacidade disponível e aliases por máquina')}
            />

            <div className={styles.container}>
                {/* Instruções */}
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        {t('planejamento.config.howTo', 'Como funciona')}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                        {t('planejamento.config.howToDesc',
                            'Ative o toggle nas máquinas que devem aparecer no Planejamento. ' +
                            'Configure a capacidade (em horas), o setor de exibição desejado, e adicione aliases para que o sistema ' +
                            'identifique automaticamente a máquina nas planilhas do Excel.'
                        )}
                    </p>
                </div>

                {/* Lista de máquinas */}
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        {t('planejamento.config.machinesTitle', 'Máquinas Disponíveis para Planejamento')}
                        {maquinas.length > 0 && (
                            <span style={{ fontWeight: 400, fontSize: '0.9rem', color: '#64748b', marginLeft: 8 }}>
                                ({maquinas.length})
                            </span>
                        )}
                    </h2>

                    {loading ? (
                        <div className={styles.loadingContainer}>
                            <div className={styles.spinner}></div>
                        </div>
                    ) : maquinas.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FiLayers />
                            <p>
                                {t('planejamento.config.noMachines',
                                    'Nenhuma máquina com escopo Planejamento. Ative o escopo nas máquinas desejadas em Configurações > Máquinas.'
                                )}
                            </p>
                        </div>
                    ) : (
                        <div className={styles.tableContainer}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>{t('planejamento.config.machineName', 'Máquina')}</th>
                                        <th>{t('planejamento.config.status', 'Status')}</th>
                                        <th>{t('planejamento.config.originalSector', 'Setor Padrão')}</th>
                                        <th>{t('planejamento.config.planningSector', 'Setor (Plan.)')}</th>
                                        <th>{t('planejamento.config.capacity', 'Capacidade (h)')}</th>
                                        <th>{t('planejamento.config.aliases', 'Aliases')}</th>
                                        <th style={{ width: 100 }}>{t('common.actions', 'Ações')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {maquinas.map((maq) => (
                                        <tr key={maq.id} style={{ opacity: maq.escopoPlanejamento ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                                            <td>
                                                <strong>{maq.nomeProducao || maq.nome}</strong>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                        className={`${styles.toggleBtn} ${maq.escopoPlanejamento ? styles.toggleOn : styles.toggleOff}`}
                                                        onClick={() => handleToggleScope(maq)}
                                                        disabled={saving === maq.id}
                                                        title={t('planejamento.config.toggleScope', 'Exibir máquina no dashboard')}
                                                    >
                                                        <div className={styles.toggleKnob}></div>
                                                    </button>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: maq.escopoPlanejamento ? '#10b981' : '#64748b' }}>
                                                        {maq.escopoPlanejamento ? t('planejamento.config.active', 'Ativa') : t('planejamento.config.inactive', 'Inativa')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ color: '#64748b' }}>
                                                    {maq.setorOriginal || '—'}
                                                </span>
                                            </td>
                                            <td>
                                                {editingId === maq.id ? (
                                                    <select
                                                        value={editSetorPlanejamento}
                                                        onChange={(e) => setEditSetorPlanejamento(e.target.value)}
                                                        style={{ width: 140, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
                                                    >
                                                        <option value="">{t('planejamento.config.defaultSelection', 'Usar Padrão')}</option>
                                                        <option value="Usinagem">{t('planejamento.config.usinagem', 'Usinagem')}</option>
                                                        <option value="Montagem">{t('planejamento.config.montagem', 'Montagem')}</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ color: maq.setorPlanejamento ? '#3b82f6' : '#64748b', fontWeight: maq.setorPlanejamento ? 500 : 400 }}>
                                                        {maq.setorPlanejamento || t('planejamento.config.defaultSelection', 'Usar Padrão')}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {editingId === maq.id ? (
                                                    <input
                                                        type="text"
                                                        value={editCapacidade}
                                                        onChange={(e) => setEditCapacidade(e.target.value)}
                                                        style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span style={{ fontWeight: 500 }}>
                                                        {maq.capacidadeHoras > 0 ? `${maq.capacidadeHoras}h` : '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {editingId === maq.id ? (
                                                    <input
                                                        type="text"
                                                        value={editAliases}
                                                        onChange={(e) => setEditAliases(e.target.value)}
                                                        style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
                                                        placeholder="TORNO-1, T1, ..."
                                                    />
                                                ) : (
                                                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                                        {(maq.aliasesPlanejamento || []).length > 0
                                                            ? maq.aliasesPlanejamento.join(', ')
                                                            : '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {editingId === maq.id ? (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button
                                                            className={styles.addBtn}
                                                            onClick={() => handleSave(maq.id)}
                                                            disabled={saving === maq.id}
                                                            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                                                        >
                                                            {saving === maq.id ? '...' : <FiSave />}
                                                        </button>
                                                        <button
                                                            className={styles.actionBtn}
                                                            onClick={cancelEditing}
                                                            style={{ fontSize: '0.85rem' }}
                                                        >
                                                            {t('common.cancel', 'Cancelar')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className={styles.actionBtn}
                                                        onClick={() => startEditing(maq)}
                                                        title={t('common.edit', 'Editar')}
                                                    >
                                                        <FiEdit2 />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
