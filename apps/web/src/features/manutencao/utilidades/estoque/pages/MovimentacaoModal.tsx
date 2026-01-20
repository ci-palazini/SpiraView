// src/features/estoque/pages/MovimentacaoModal.tsx
import React, { useState, FormEvent, ChangeEvent } from 'react';
import { registrarMovimentacao } from '../../../../../services/apiClient';
import type { Peca } from '../../../../../types/api';
import styles from './MovimentacaoModal.module.css';
import Modal from '../../../../../shared/components/Modal';
import toast from 'react-hot-toast';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

interface MovimentacaoModalProps {
    peca: Peca;
    tipo: 'entrada' | 'saida';
    user: User;
    onClose: () => void;
    onSaved?: (pecaAtualizada: Peca) => void;
}

// ---------- Component ----------
export default function MovimentacaoModal({ peca, tipo, user, onClose, onSaved }: MovimentacaoModalProps) {
    const [quantidade, setQuantidade] = useState(1);
    const [descricao, setDescricao] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // ProteÃ§Ã£o contra chamada dupla
        if (isSaving) return;
        setIsSaving(true);
        try {
            // validaÃ§Ã£o simples
            const q = Number(quantidade);
            if (!Number.isFinite(q) || q <= 0) {
                throw new Error('Quantidade invÃ¡lida');
            }

            // chama a API (back jÃ¡ registra a movimentaÃ§Ã£o e atualiza o estoque em transaÃ§Ã£o)
            const result = await registrarMovimentacao(
                peca.id,
                {
                    tipo,                // 'entrada' | 'saida'
                    quantidade: q,
                    descricao: (descricao || '').trim(),
                },
                { role: user?.role, email: user?.email }
            ) as { ok: boolean; peca: { estoque_atual: number } };

            // Atualiza a peÃ§a com o novo estoque retornado pelo backend
            if (result?.peca && onSaved) {
                onSaved({
                    ...peca,
                    estoqueAtual: result.peca.estoque_atual,
                });
            }

            toast.success(`MovimentaÃ§Ã£o de ${tipo} realizada com sucesso!`);
            onClose();
        } catch (err: any) {
            console.error('Erro ao registrar movimentaÃ§Ã£o:', err);
            const msg = err?.message || 'Falha ao registrar movimentaÃ§Ã£o.';
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={tipo === 'entrada' ? 'Registrar Entrada' : 'Registrar SaÃ­da'}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label>PeÃ§a</label>
                    <p>
                        <strong>
                            {peca.codigo} â€“ {peca.nome}
                        </strong>
                    </p>
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="quantidade">Quantidade</label>
                    <input
                        id="quantidade"
                        type="number"
                        min="1"
                        className={styles.input}
                        value={quantidade}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setQuantidade(Number(e.target.value))}
                        required
                    />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="descricao">DescriÃ§Ã£o (opcional)</label>
                    <textarea
                        id="descricao"
                        className={styles.textarea}
                        rows={3}
                        value={descricao}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescricao(e.target.value)}
                    />
                </div>
                <button
                    type="submit"
                    className={styles.button}
                    disabled={isSaving}
                >
                    {isSaving ? 'Processando...' : 'Confirmar'}
                </button>
            </form>
        </Modal>
    );
}
