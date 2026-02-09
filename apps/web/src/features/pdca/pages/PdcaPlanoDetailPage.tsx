import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './PdcaPlanoDetailPage.module.css';
import { ArrowLeft, Plus, Trash2, History, Target } from 'lucide-react';
import toast from 'react-hot-toast';

interface Causa {
    id: string;
    plano_id: string;
    causa_raiz: string;
    correcao: string;
    acao_corretiva: string;
    responsavel: string;
    data_planejada: string | null;
    data_realizada: string | null;
    verificacao_eficacia: string;
    eficaz: boolean | null;
    created_at: string;
}

interface Plano {
    id: string;
    titulo: string;
    tipo: string;
    origem: string;
    nao_conformidade: string;
    status: string;
    criado_por_email: string;
    created_at: string;
    causas: Causa[];
}

interface AuditEntry {
    id: string;
    entidade: string;
    entidade_id: string;
    acao: string;
    dados_anteriores: any;
    dados_novos: any;
    usuario_email: string;
    usuario_nome: string;
    created_at: string;
}

export default function PdcaPlanoDetailPage() {
    const { t } = useTranslation();
    const { planoId } = useParams<{ planoId: string }>();
    const navigate = useNavigate();

    const [plano, setPlano] = useState<Plano | null>(null);
    const [loading, setLoading] = useState(true);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        titulo: '',
        tipo: '',
        origem: '',
        nao_conformidade: '',
        status: 'aberto'
    });

    useEffect(() => {
        if (planoId) {
            loadPlano();
            loadAuditLog();
        }
    }, [planoId]);

    const loadPlano = async () => {
        setLoading(true);
        try {
            const res = await http.get<Plano>(`/pdca/planos/${planoId}`);
            setPlano(res);
            setFormData({
                titulo: res.titulo || '',
                tipo: res.tipo || '',
                origem: res.origem || '',
                nao_conformidade: res.nao_conformidade || '',
                status: res.status || 'aberto'
            });
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.loadError', 'Erro ao carregar plano'));
        } finally {
            setLoading(false);
        }
    };

    const loadAuditLog = async () => {
        try {
            const res = await http.get<AuditEntry[]>(`/pdca/audit/plano/${planoId}`);
            setAuditLog(res || []);
        } catch (err) {
            console.error(err);
        }
    };

    // Salvar campo individual do plano (chamado no onBlur)
    const handleSavePlanoField = async (field: string, value: any) => {
        try {
            await http.put(`/pdca/planos/${planoId}`, { data: { [field]: value } });
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.saveError', 'Erro ao salvar'));
        }
    };

    // Salvar tudo e voltar
    const handleBack = async () => {
        try {
            await http.put(`/pdca/planos/${planoId}`, { data: formData });
        } catch (err) {
            console.error(err);
        }
        navigate('/pdca/planos');
    };

    const handleAddCausa = async () => {
        try {
            await http.post(`/pdca/planos/${planoId}/causas`, {
                data: {
                    causa_raiz: '',
                    responsavel: ''
                }
            });
            toast.success(t('pdca.causaAdded', 'Causa adicionada!'));
            loadPlano();
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.addCausaError', 'Erro ao adicionar causa'));
        }
    };

    // Atualização LOCAL apenas (para digitação fluida)
    const handleLocalCausaChange = (causaId: string, field: string, value: any) => {
        setPlano(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                causas: prev.causas.map(c =>
                    c.id === causaId ? { ...c, [field]: value } : c
                )
            };
        });
    };

    // Salvar na API (chamado no onBlur)
    const handleSaveCausa = async (causaId: string, field: string, value: any) => {
        try {
            await http.put(`/pdca/causas/${causaId}`, { data: { [field]: value } });
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.updateError', 'Erro ao atualizar'));
            loadPlano(); // Recarrega para reverter em caso de erro
        }
    };

    const handleDeleteCausa = async (causaId: string) => {
        if (!confirm(t('pdca.confirmDeleteCausa', 'Tem certeza que deseja excluir esta causa?'))) return;
        try {
            await http.delete(`/pdca/causas/${causaId}`);
            toast.success(t('pdca.causaDeleted', 'Causa excluída!'));
            loadPlano();
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.deleteCausaError', 'Erro ao excluir causa'));
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString('pt-BR');
        } catch {
            return '-';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'aberto': return t('pdca.statusOpen', 'Aberto');
            case 'em_andamento': return t('pdca.statusProgress', 'Em Andamento');
            case 'concluido': return t('pdca.statusDone', 'Concluído');
            default: return status;
        }
    };

    const getAcaoLabel = (acao: string) => {
        switch (acao) {
            case 'criado': return t('pdca.actionCreated', 'criou');
            case 'atualizado': return t('pdca.actionUpdated', 'atualizou');
            case 'excluido': return t('pdca.actionDeleted', 'excluiu');
            default: return acao;
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
            </div>
        );
    }

    if (!plano) {
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <button className={styles.backBtn} onClick={() => navigate('/pdca/planos')}>
                        <ArrowLeft size={16} />
                        {t('common.back', 'Voltar')}
                    </button>
                    <div className={styles.empty}>{t('pdca.planNotFound', 'Plano não encontrado')}</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <PageHeader
                title={formData.titulo || t('pdca.untitled', 'Plano sem título')}
                subtitle={`${t('pdca.createdBy', 'Criado por')} ${plano.criado_por_email} ${t('pdca.on', 'em')} ${formatDate(plano.created_at)}`}
            />

            <div className={styles.container}>
                <div className={styles.content}>
                    <button className={styles.backBtn} onClick={handleBack}>
                        <ArrowLeft size={16} />
                        {t('common.back', 'Voltar')}
                    </button>

                    {/* Plan Details */}
                    <div className={styles.planCard}>
                        <div className={styles.planHeader}>
                            <h2 className={styles.planTitle}>{t('pdca.planDetails', 'Detalhes do Plano')}</h2>
                            <span className={`${styles.statusBadge} ${styles[formData.status]}`}>
                                {getStatusLabel(formData.status)}
                            </span>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={`${styles.formGroup} ${styles.full}`}>
                                <label>{t('pdca.title', 'Título')}</label>
                                <input
                                    type="text"
                                    value={formData.titulo}
                                    onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                                    onBlur={e => handleSavePlanoField('titulo', e.target.value)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>{t('pdca.type', 'Tipo')}</label>
                                <input
                                    type="text"
                                    value={formData.tipo}
                                    onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value }))}
                                    onBlur={e => handleSavePlanoField('tipo', e.target.value)}
                                    placeholder={t('pdca.typePlaceholder', 'Ex: Qualidade, Produtividade...')}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>{t('pdca.origin', 'Origem')}</label>
                                <input
                                    type="text"
                                    value={formData.origem}
                                    onChange={e => setFormData(prev => ({ ...prev, origem: e.target.value }))}
                                    onBlur={e => handleSavePlanoField('origem', e.target.value)}
                                    placeholder={t('pdca.originPlaceholder', 'Ex: Auditoria, Cliente...')}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>{t('pdca.status', 'Status')}</label>
                                <select
                                    value={formData.status}
                                    onChange={e => {
                                        setFormData(prev => ({ ...prev, status: e.target.value }));
                                        handleSavePlanoField('status', e.target.value);
                                    }}
                                >
                                    <option value="aberto">{t('pdca.statusOpen', 'Aberto')}</option>
                                    <option value="em_andamento">{t('pdca.statusProgress', 'Em Andamento')}</option>
                                    <option value="concluido">{t('pdca.statusDone', 'Concluído')}</option>
                                </select>
                            </div>

                            <div className={`${styles.formGroup} ${styles.full}`}>
                                <label>{t('pdca.nonConformity', 'Não Conformidade')}</label>
                                <textarea
                                    value={formData.nao_conformidade}
                                    onChange={e => setFormData(prev => ({ ...prev, nao_conformidade: e.target.value }))}
                                    onBlur={e => handleSavePlanoField('nao_conformidade', e.target.value)}
                                    placeholder={t('pdca.nonConformityPlaceholder', 'Descreva a não conformidade identificada...')}
                                />
                            </div>
                        </div>


                    </div>

                    {/* Causes Section */}
                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>
                                <Target size={20} />
                                {t('pdca.rootCauses', 'Causas Raiz e Ações')}
                            </h3>
                            <button className={styles.addBtn} onClick={handleAddCausa}>
                                <Plus size={16} />
                                {t('pdca.addCausa', 'Adicionar Causa')}
                            </button>
                        </div>

                        {plano.causas?.length === 0 ? (
                            <div className={styles.empty}>
                                {t('pdca.noCausas', 'Nenhuma causa adicionada. Clique em "Adicionar Causa" para iniciar.')}
                            </div>
                        ) : (
                            <div className={styles.causasList}>
                                {plano.causas?.map((causa, idx) => (
                                    <div key={causa.id} className={styles.causaCard}>
                                        <div className={styles.causaHeader}>
                                            <span className={styles.causaNumber}>{idx + 1}</span>
                                            <div className={styles.causaActions}>
                                                <button
                                                    className={`${styles.iconBtn} ${styles.danger}`}
                                                    onClick={() => handleDeleteCausa(causa.id)}
                                                    title={t('common.delete', 'Excluir')}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className={styles.causaGrid}>
                                            <div className={`${styles.causaField} ${styles.full}`}>
                                                <label>{t('pdca.rootCause', 'Causa Raiz')}</label>
                                                <textarea
                                                    value={causa.causa_raiz || ''}
                                                    onChange={e => handleLocalCausaChange(causa.id, 'causa_raiz', e.target.value)}
                                                    onBlur={e => handleSaveCausa(causa.id, 'causa_raiz', e.target.value)}
                                                    placeholder={t('pdca.rootCausePlaceholder', 'Descreva a causa raiz identificada...')}
                                                />
                                            </div>

                                            <div className={`${styles.causaField} ${styles.full}`}>
                                                <label>{t('pdca.correction', 'Correção Imediata')}</label>
                                                <textarea
                                                    value={causa.correcao || ''}
                                                    onChange={e => handleLocalCausaChange(causa.id, 'correcao', e.target.value)}
                                                    onBlur={e => handleSaveCausa(causa.id, 'correcao', e.target.value)}
                                                    placeholder={t('pdca.correctionPlaceholder', 'Ação de contenção imediata...')}
                                                />
                                            </div>

                                            <div className={`${styles.causaField} ${styles.full}`}>
                                                <label>{t('pdca.correctiveAction', 'Ação Corretiva')}</label>
                                                <textarea
                                                    value={causa.acao_corretiva || ''}
                                                    onChange={e => handleLocalCausaChange(causa.id, 'acao_corretiva', e.target.value)}
                                                    onBlur={e => handleSaveCausa(causa.id, 'acao_corretiva', e.target.value)}
                                                    placeholder={t('pdca.correctiveActionPlaceholder', 'Ação definitiva para eliminar a causa raiz...')}
                                                />
                                            </div>

                                            <div className={styles.causaField}>
                                                <label>{t('pdca.responsible', 'Responsável')}</label>
                                                <input
                                                    type="text"
                                                    value={causa.responsavel || ''}
                                                    onChange={e => handleLocalCausaChange(causa.id, 'responsavel', e.target.value)}
                                                    onBlur={e => handleSaveCausa(causa.id, 'responsavel', e.target.value)}
                                                    placeholder={t('pdca.responsiblePlaceholder', 'Nome do responsável')}
                                                />
                                            </div>

                                            <div className={styles.causaField}>
                                                <label>{t('pdca.plannedDate', 'Data Planejada')}</label>
                                                <input
                                                    type="date"
                                                    value={causa.data_planejada?.substring(0, 10) || ''}
                                                    onChange={e => {
                                                        const val = e.target.value || null;
                                                        handleLocalCausaChange(causa.id, 'data_planejada', val);
                                                        handleSaveCausa(causa.id, 'data_planejada', val);
                                                    }}
                                                />
                                            </div>

                                            <div className={styles.causaField}>
                                                <label>{t('pdca.realizedDate', 'Data Realizada')}</label>
                                                <input
                                                    type="date"
                                                    value={causa.data_realizada?.substring(0, 10) || ''}
                                                    onChange={e => {
                                                        const val = e.target.value || null;
                                                        handleLocalCausaChange(causa.id, 'data_realizada', val);
                                                        handleSaveCausa(causa.id, 'data_realizada', val);
                                                    }}
                                                />
                                            </div>

                                            <div className={`${styles.causaField} ${styles.full}`}>
                                                <label>{t('pdca.efficacyVerification', 'Verificação de Eficácia')}</label>
                                                <textarea
                                                    value={causa.verificacao_eficacia || ''}
                                                    onChange={e => handleLocalCausaChange(causa.id, 'verificacao_eficacia', e.target.value)}
                                                    onBlur={e => handleSaveCausa(causa.id, 'verificacao_eficacia', e.target.value)}
                                                    placeholder={t('pdca.efficacyPlaceholder', 'Descreva como a eficácia foi verificada...')}
                                                />
                                            </div>

                                            <div className={styles.causaField}>
                                                <div className={styles.checkbox}>
                                                    <input
                                                        type="checkbox"
                                                        id={`eficaz-${causa.id}`}
                                                        checked={causa.eficaz === true}
                                                        onChange={e => {
                                                            handleLocalCausaChange(causa.id, 'eficaz', e.target.checked);
                                                            handleSaveCausa(causa.id, 'eficaz', e.target.checked);
                                                        }}
                                                    />
                                                    <label htmlFor={`eficaz-${causa.id}`}>
                                                        {t('pdca.effective', 'Ação foi eficaz')}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Audit Log */}
                    {auditLog.length > 0 && (
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <History size={20} />
                                {t('pdca.auditLog', 'Histórico de Alterações')}
                            </h3>
                            <div className={styles.auditList}>
                                {auditLog.slice(0, 10).map(entry => (
                                    <div key={entry.id} className={styles.auditItem}>
                                        <span className={styles.auditDate}>{formatDate(entry.created_at)}</span>
                                        <span className={styles.auditAction}>
                                            <strong>{entry.usuario_nome || entry.usuario_email}</strong> {getAcaoLabel(entry.acao)} {entry.entidade}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
