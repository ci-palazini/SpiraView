import React, { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

import Modal from '../../../shared/components/Modal';
import { getKamishibaiPerguntas, configKamishibaiPerguntas } from '../../../services/apiClient';
import type { Kaizen, KamishibaiPergunta } from '@spiraview/shared';
import styles from './KamishibaiConfigModal.module.css';

interface User {
    role?: string;
    email?: string;
}

interface KamishibaiConfigModalProps {
    kaizen: Kaizen;
    onClose: () => void;
    onSaved: () => void;
    user: User;
}

export default function KamishibaiConfigModal({ kaizen, onClose, onSaved, user }: KamishibaiConfigModalProps) {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [perguntas, setPerguntas] = useState<{ id?: string; texto_pergunta: string; ordem?: number }[]>([]);

    useEffect(() => {
        getKamishibaiPerguntas(kaizen.id)
            .then(data => {
                setPerguntas(data.map(p => ({
                    id: p.id,
                    texto_pergunta: p.texto_pergunta,
                    ordem: p.ordem
                })));
            })
            .catch(err => {
                console.error(err);
                toast.error('Erro ao carregar perguntas do Kamishibai');
            })
            .finally(() => setLoading(false));
    }, [kaizen.id]);

    const handleAdd = () => {
        setPerguntas([...perguntas, { texto_pergunta: '', ordem: perguntas.length }]);
    };

    const handleRemove = (index: number) => {
        const novo = [...perguntas];
        novo.splice(index, 1);
        setPerguntas(novo);
    };

    const handleChange = (index: number, val: string) => {
        const novo = [...perguntas];
        novo[index].texto_pergunta = val;
        setPerguntas(novo);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Remove empty questions
        const filtered = perguntas.filter(p => p.texto_pergunta.trim() !== '');

        setIsSaving(true);
        try {
            await configKamishibaiPerguntas(kaizen.id, filtered.map((p, idx) => ({
                texto_pergunta: p.texto_pergunta.trim(),
                ordem: idx
            })), { role: user.role, email: user.email });

            toast.success('Questionário do Kamishibai salvo com sucesso!');
            onSaved();
        } catch (err) {
            console.error('Erro ao salvar kamishibai config:', err);
            toast.error(t('common.error', 'Erro ao salvar configurações.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Checklist Kamishibai: ${kaizen.titulo}`}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                {loading ? (
                    <p>Carregando...</p>
                ) : (
                    <div className={styles.questionsList}>
                        {perguntas.map((p, index) => (
                            <div key={index} className={styles.questionItem}>
                                <strong>{index + 1}.</strong>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={p.texto_pergunta}
                                    onChange={(e) => handleChange(index, e.target.value)}
                                    placeholder="Ex: O manual está afixado em local visível?"
                                    required
                                />
                                <button type="button" className={styles.removeButton} onClick={() => handleRemove(index)} title="Remover">
                                    <FiTrash2 size={18} />
                                </button>
                            </div>
                        ))}

                        <button type="button" className={styles.addButton} onClick={handleAdd}>
                            <FiPlus />
                            Adicionar Pergunta
                        </button>
                    </div>
                )}

                <div className={styles.actions}>
                    <button type="button" className={styles.buttonCancel} onClick={onClose} disabled={isSaving}>
                        {t('common.cancel', 'Cancelar')}
                    </button>
                    <button type="submit" className={styles.buttonSubmit} disabled={isSaving || loading}>
                        {isSaving ? t('common.saving', 'Salvando...') : t('common.save', 'Salvar Alterações')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
