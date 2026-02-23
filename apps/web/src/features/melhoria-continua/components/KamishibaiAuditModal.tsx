import React, { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiCheck, FiX } from 'react-icons/fi';

import Modal from '../../../shared/components/Modal';
import { getKamishibaiPerguntas, realizarAuditoriaKamishibai } from '../../../services/apiClient';
import type { Kaizen, KamishibaiPergunta, PerformAuditPayload } from '../../../types/api';
import styles from './KamishibaiAuditModal.module.css';

interface User {
    role?: string;
    email?: string;
}

interface KamishibaiAuditModalProps {
    kaizen: Kaizen;
    onClose: () => void;
    onSaved: () => void;
    user: User;
}

export default function KamishibaiAuditModal({ kaizen, onClose, onSaved, user }: KamishibaiAuditModalProps) {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [perguntas, setPerguntas] = useState<KamishibaiPergunta[]>([]);

    // estado de respostas: perguntaId -> { is_conforme, observacao }
    const [respostas, setRespostas] = useState<Record<string, { is_conforme?: boolean, observacao: string }>>({});
    const [obsGeral, setObsGeral] = useState('');

    useEffect(() => {
        getKamishibaiPerguntas(kaizen.id)
            .then(data => {
                setPerguntas(data);
                // inicializar o state de respostas
                const initial: Record<string, { is_conforme?: boolean, observacao: string }> = {};
                data.forEach(p => {
                    initial[p.id] = { observacao: '' };
                });
                setRespostas(initial);
            })
            .catch(err => {
                console.error(err);
                toast.error('Erro ao carregar checklist do Kamishibai');
            })
            .finally(() => setLoading(false));
    }, [kaizen.id]);

    const handleToggle = (perguntaId: string, isConforme: boolean) => {
        setRespostas(prev => ({
            ...prev,
            [perguntaId]: { ...prev[perguntaId], is_conforme: isConforme }
        }));
    };

    const handleObsChange = (perguntaId: string, obs: string) => {
        setRespostas(prev => ({
            ...prev,
            [perguntaId]: { ...prev[perguntaId], observacao: obs }
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Validation: must answer all questions
        const unanswered = perguntas.filter(p => respostas[p.id]?.is_conforme === undefined);
        if (unanswered.length > 0) {
            toast.error('Preencha todas as avaliações no Kamishibai.');
            return;
        }

        // Validation: NOK answers must have an observation
        const nokSemObs = perguntas.filter(
            p => respostas[p.id]?.is_conforme === false && !respostas[p.id]?.observacao.trim()
        );
        if (nokSemObs.length > 0) {
            toast.error('Informe o motivo para cada item Não Conforme.');
            return;
        }

        setIsSaving(true);
        try {
            const hasNok = perguntas.some(p => respostas[p.id].is_conforme === false);

            const payload: PerformAuditPayload = {
                kaizen_id: kaizen.id,
                status: hasNok ? 'nao_conforme' : 'conforme',
                observacoes: obsGeral.trim() || undefined,
                respostas: perguntas.map(p => ({
                    pergunta_id: p.id,
                    is_conforme: respostas[p.id].is_conforme!,
                    observacao: respostas[p.id].observacao.trim() || undefined
                }))
            };

            await realizarAuditoriaKamishibai(kaizen.id, payload, { role: user.role, email: user.email });

            toast.success('Auditoria registrada com sucesso!');
            onSaved();
        } catch (err) {
            console.error('Erro ao salvar auditoria:', err);
            toast.error(t('common.error', 'Erro ao salvar auditoria.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Auditoria: ${kaizen.titulo}`}
        >
            <div className={styles.container}>
                {loading ? (
                    <p>Carregando checklist...</p>
                ) : perguntas.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>Este Kaizen ainda não possui perguntas configuradas para o Kamishibai.</p>
                        <p>Por favor, clique em "Configurar" na tela anterior.</p>
                        <button type="button" className={styles.buttonCancel} style={{ marginTop: 16 }} onClick={onClose}>
                            Fechar
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {perguntas.map((p, i) => {
                                const ans = respostas[p.id];
                                return (
                                    <div key={p.id} className={styles.questionCard}>
                                        <p className={styles.questionText}>{i + 1}. {p.texto_pergunta}</p>

                                        <div className={styles.toggles}>
                                            <button
                                                type="button"
                                                className={`${styles.toggleBtn} ${ans?.is_conforme === true ? styles.okActive : ''}`}
                                                onClick={() => handleToggle(p.id, true)}
                                            >
                                                <FiCheck size={18} /> Conforme
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.toggleBtn} ${ans?.is_conforme === false ? styles.nokActive : ''}`}
                                                onClick={() => handleToggle(p.id, false)}
                                            >
                                                <FiX size={18} /> Não Conforme
                                            </button>
                                        </div>

                                        {ans?.is_conforme === false && (
                                            <input
                                                type="text"
                                                className={styles.obsInput}
                                                placeholder="Motivo da não conformidade (Obrigatório)*"
                                                value={ans.observacao}
                                                onChange={(e) => handleObsChange(p.id, e.target.value)}
                                                required
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.generalObs}>
                            <label>Observação Geral (Opcional)</label>
                            <textarea
                                className={styles.obsInput}
                                rows={3}
                                value={obsGeral}
                                onChange={(e) => setObsGeral(e.target.value)}
                                placeholder="Alguma observação adicional sobre a máquina/área?"
                            />
                        </div>

                        <div className={styles.actions}>
                            <button type="button" className={styles.buttonCancel} onClick={onClose} disabled={isSaving}>
                                {t('common.cancel', 'Cancelar')}
                            </button>
                            <button type="submit" className={styles.buttonSubmit} disabled={isSaving}>
                                {isSaving ? t('common.saving', 'Salvando...') : 'Concluir Auditoria'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
}
