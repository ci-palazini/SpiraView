import React, { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import Modal from '../../../shared/components/Modal';
import { criarKaizen, atualizarKaizen, listarMaquinas, uploadKaizenThumbnail } from '../../../services/apiClient';
import type { Kaizen, Maquina } from '@spiraview/shared';
import styles from './KaizenFormModal.module.css';

interface User {
    role?: string;
    email?: string;
}

interface KaizenFormModalProps {
    kaizen: Kaizen | null;
    onClose: () => void;
    onSaved: (k: Kaizen) => void;
    user: User;
}

export default function KaizenFormModal({ kaizen, onClose, onSaved, user }: KaizenFormModalProps) {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);

    // Form fields
    const [titulo, setTitulo] = useState('');
    const [maquinaId, setMaquinaId] = useState('');
    const [status, setStatus] = useState('planejado');
    const [problemaAntes, setProblemaAntes] = useState('');
    const [solucaoDepois, setSolucaoDepois] = useState('');
    const [ganhos, setGanhos] = useState('');
    const [dataImplementacao, setDataImplementacao] = useState('');
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

    useEffect(() => {
        // Fetch maquinas on load
        listarMaquinas().then(setMaquinas).catch(console.error);
    }, []);

    useEffect(() => {
        if (kaizen) {
            setTitulo(kaizen.titulo || '');
            setMaquinaId(kaizen.maquina_id || '');
            setStatus(kaizen.status || 'planejado');
            setProblemaAntes(kaizen.problema_antes || '');
            setSolucaoDepois(kaizen.solucao_depois || '');
            setGanhos(kaizen.ganhos || '');
            setDataImplementacao(kaizen.data_implementacao ? kaizen.data_implementacao.split('T')[0] : '');
        } else {
            setTitulo('');
            setMaquinaId('');
            setStatus('planejado');
            setProblemaAntes('');
            setSolucaoDepois('');
            setGanhos('');
            setDataImplementacao('');
            setThumbnailFile(null);
        }
    }, [kaizen]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = {
                titulo: titulo.trim(),
                maquina_id: maquinaId || undefined,
                status,
                problema_antes: problemaAntes.trim() || undefined,
                solucao_depois: solucaoDepois.trim() || undefined,
                ganhos: ganhos.trim() || undefined,
                data_implementacao: dataImplementacao || undefined,
            };

            const auth = { role: user.role, email: user.email };
            let saved: Kaizen;

            if (kaizen) {
                saved = await atualizarKaizen(kaizen.id, payload, auth);
            } else {
                saved = await criarKaizen(payload, auth);
            }

            if (thumbnailFile) {
                await uploadKaizenThumbnail(saved.id, thumbnailFile, auth);
            }

            toast.success(kaizen ? 'Kaizen atualizado com sucesso!' : 'Kaizen criado com sucesso!');

            onSaved(saved);
        } catch (err) {
            console.error('Erro ao salvar Kaizen:', err);
            toast.error(t('common.error', 'Erro ao salvar.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={kaizen ? t('melhoriaContinua.kaizens.edit', 'Editar Kaizen') : t('melhoriaContinua.kaizens.create', 'Novo Kaizen')}
        >
            <form onSubmit={handleSubmit} className={styles.form}>

                <div className={styles.formGroup}>
                    <label>Título / Tema da Melhoria *</label>
                    <input
                        type="text"
                        className={styles.input}
                        value={titulo}
                        onChange={e => setTitulo(e.target.value)}
                        required
                        placeholder="Ex: Quadro de Sombras, Eliminação de Vazamento, etc."
                    />
                </div>

                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label>Máquina (Opcional)</label>
                        <select
                            className={styles.select}
                            value={maquinaId}
                            onChange={e => setMaquinaId(e.target.value)}
                        >
                            <option value="">Geral / Sem Máquina</option>
                            {maquinas.map(m => (
                                <option key={m.id} value={m.id}>{m.nome_producao || m.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Status *</label>
                        <select
                            className={styles.select}
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            required
                        >
                            <option value="planejado">Planejado</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluído</option>
                            <option value="padronizado">Padronizado</option>
                        </select>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Foto de Capa (Thumbnail)</label>
                    <input
                        type="file"
                        className={styles.input}
                        accept="image/*"
                        onChange={e => setThumbnailFile(e.target.files?.[0] || null)}
                    />
                    {kaizen?.thumbnail_url && !thumbnailFile && (
                        <small style={{ marginTop: '0.5rem', display: 'block' }}>
                            Já possui uma imagem salva. Enviar um novo arquivo irá substituí-la.
                        </small>
                    )}
                </div>

                <div className={styles.formGroup}>
                    <label>Problema Encontrado (Antes)</label>
                    <textarea
                        className={styles.textarea}
                        value={problemaAntes}
                        onChange={e => setProblemaAntes(e.target.value)}
                        placeholder="Descreva a situação anterior..."
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Solução Implementada (Depois)</label>
                    <textarea
                        className={styles.textarea}
                        value={solucaoDepois}
                        onChange={e => setSolucaoDepois(e.target.value)}
                        placeholder="Descreva o que foi feito..."
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Ganhos / Impacto</label>
                    <textarea
                        className={styles.textarea}
                        value={ganhos}
                        onChange={e => setGanhos(e.target.value)}
                        placeholder="Quais foram os benefícios reais obtidos?"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Data de Implementação</label>
                    <input
                        type="date"
                        className={styles.input}
                        value={dataImplementacao}
                        onChange={e => setDataImplementacao(e.target.value)}
                    />
                </div>

                <div className={styles.actions}>
                    <button type="button" className={styles.buttonCancel} onClick={onClose} disabled={isSaving}>
                        {t('common.cancel', 'Cancelar')}
                    </button>
                    <button type="submit" className={styles.buttonSubmit} disabled={isSaving}>
                        {isSaving ? t('common.saving', 'Salvando...') : t('common.save', 'Salvar')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
