// src/features/planejamento/pages/CapacidadeConfigPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { FiSettings, FiSave, FiLayers, FiEdit2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import PageHeader from '../../../shared/components/PageHeader';
import {
    listarMaquinasPlanejamento,
    atualizarMaquinaPlanejamento,
    buscarMetasPlanejamento,
    atualizarMetasPlanejamento,
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

    // Metas mensais
    const now = new Date();
    const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
    const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
    const [metaExportacao, setMetaExportacao] = useState('');
    const [metaOttr, setMetaOttr] = useState('');
    const [savingMetas, setSavingMetas] = useState(false);

    // Estado de edição de máquinas
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCapacidade, setEditCapacidade] = useState('');
    const [editAliases, setEditAliases] = useState('');
    const [editSetorPlanejamento, setEditSetorPlanejamento] = useState('');

    const fetchMetas = useCallback(async (mes: number, ano: number) => {
        try {
            const data = await buscarMetasPlanejamento(mes, ano, { role: user?.role, email: user?.email });
            setMetaExportacao(data.metaExportacao > 0 ? String(data.metaExportacao) : '');
            setMetaOttr(data.metaOttr > 0 ? String(data.metaOttr) : '');
        } catch {
            // silencioso — não bloquear o carregamento da página
        }
    }, [user]);

    const handleMesAnoChange = (mes: number, ano: number) => {
        setMesSelecionado(mes);
        setAnoSelecionado(ano);
        setMetaExportacao('');
        setMetaOttr('');
        fetchMetas(mes, ano);
    };

    const handleSaveMetas = async () => {
        const exportacao = parseFloat(metaExportacao.replace(',', '.'));
        const ottr = parseFloat(metaOttr.replace(',', '.'));

        if (isNaN(exportacao) || exportacao < 0) {
            toast.error(t('planejamento.config.metaExportacaoInvalid', 'Informe um valor válido para Meta Exportação'));
            return;
        }
        if (isNaN(ottr) || ottr < 0 || ottr > 100) {
            toast.error(t('planejamento.config.metaOttrInvalid', 'OTTR deve estar entre 0 e 100'));
            return;
        }

        setSavingMetas(true);
        try {
            const updated = await atualizarMetasPlanejamento(
                { mes: mesSelecionado, ano: anoSelecionado, metaExportacao: exportacao, metaOttr: ottr },
                { role: user?.role, email: user?.email }
            );
            setMetaExportacao(String(updated.metaExportacao));
            setMetaOttr(String(updated.metaOttr));
            toast.success(t('planejamento.config.metasSaved', 'Metas salvas com sucesso'));
        } catch (err: any) {
            toast.error(err.message || t('planejamento.config.saveError', 'Erro ao salvar'));
        } finally {
            setSavingMetas(false);
        }
    };

    const fetchMaquinas = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await listarMaquinasPlanejamento({ role: user?.role, email: user?.email });
            setMaquinas(data);
        } catch (err) {
            console.error('Erro ao buscar máquinas:', err);
            toast.error(t('planejamento.config.loadError', 'Erro ao carregar máquinas'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [t, user]);

    useEffect(() => {
        fetchMaquinas();
        fetchMetas(mesSelecionado, anoSelecionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchMaquinas, fetchMetas]);

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
            fetchMaquinas(true);
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
            fetchMaquinas(true);
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

                {/* Metas mensais */}
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        {t('planejamento.config.metasTitle', 'Metas Mensais')}
                    </h2>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup} style={{ maxWidth: 160 }}>
                            <label htmlFor="mesSelecionado">
                                {t('planejamento.config.mes', 'Mês')}
                            </label>
                            <select
                                id="mesSelecionado"
                                value={mesSelecionado}
                                onChange={(e) => handleMesAnoChange(Number(e.target.value), anoSelecionado)}
                                style={{ width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.9375rem', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' }}
                            >
                                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((nome, i) => (
                                    <option key={i + 1} value={i + 1}>{nome}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup} style={{ maxWidth: 110 }}>
                            <label htmlFor="anoSelecionado">
                                {t('planejamento.config.ano', 'Ano')}
                            </label>
                            <select
                                id="anoSelecionado"
                                value={anoSelecionado}
                                onChange={(e) => handleMesAnoChange(mesSelecionado, Number(e.target.value))}
                                style={{ width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.9375rem', border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' }}
                            >
                                {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i).map(ano => (
                                    <option key={ano} value={ano}>{ano}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="metaExportacao">
                                {t('planejamento.config.metaExportacao', 'Meta Exportação (R$)')}
                            </label>
                            <input
                                id="metaExportacao"
                                type="number"
                                min={0}
                                step={1000}
                                value={metaExportacao}
                                onChange={(e) => setMetaExportacao(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="metaOttr">
                                {t('planejamento.config.metaOttr', 'Meta OTTR (%)')}
                            </label>
                            <input
                                id="metaOttr"
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={metaOttr}
                                onChange={(e) => setMetaOttr(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5px' }}>
                            <button
                                className={styles.addBtn}
                                onClick={handleSaveMetas}
                                disabled={savingMetas}
                            >
                                <FiSave />
                                {savingMetas
                                    ? t('common.saving', 'Salvando...')
                                    : t('common.save', 'Salvar')}
                            </button>
                        </div>
                    </div>
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
