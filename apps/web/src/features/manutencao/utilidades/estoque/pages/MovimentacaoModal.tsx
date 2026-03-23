// src/features/estoque/pages/MovimentacaoModal.tsx
import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { registrarMovimentacao } from '../../../../../services/apiClient';
import type { Peca } from '@spiraview/shared';
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
    const { t } = useTranslation();
    const [quantidade, setQuantidade] = useState(1);
    const [descricao, setDescricao] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            // validação simples
            const q = Number(quantidade);
            if (!Number.isFinite(q) || q <= 0) {
                throw new Error(t('movimentacaoModal.invalidQty', 'Quantidade inválida'));
            }

            // chama a API (back já registra a movimentação e atualiza o estoque em transação)
            const result = await registrarMovimentacao(
                peca.id,
                {
                    tipo,                // 'entrada' | 'saida'
                    quantidade: q,
                    descricao: (descricao || '').trim(),
                },
                { role: user?.role, email: user?.email }
            ) as { ok: boolean; peca: { estoque_atual: number } };

            // Atualiza a peça com o novo estoque retornado pelo backend
            if (result?.peca && onSaved) {
                onSaved({
                    ...peca,
                    estoqueAtual: result.peca.estoque_atual,
                });
            }

            const successMsg = tipo === 'entrada'
                ? t('movimentacaoModal.successIn', 'Movimentação de entrada realizada com sucesso!')
                : t('movimentacaoModal.successOut', 'Movimentação de saída realizada com sucesso!');
            toast.success(successMsg);
            onClose();
        } catch (err: any) {
            console.error('Erro ao registrar movimentação:', err);
            const msg = err?.message || t('movimentacaoModal.error', 'Falha ao registrar movimentação.');
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={tipo === 'entrada'
                ? t('movimentacaoModal.titleIn', 'Registrar Entrada')
                : t('movimentacaoModal.titleOut', 'Registrar Saída')}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label>{t('movimentacaoModal.part', 'Peça')}</label>
                    <p>
                        <strong>
                            {peca.codigo} – {peca.nome}
                        </strong>
                    </p>
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="quantidade">{t('movimentacaoModal.quantity', 'Quantidade')}</label>
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
                    <label htmlFor="descricao">{t('movimentacaoModal.description', 'Descrição (opcional)')}</label>
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
                    {isSaving
                        ? t('movimentacaoModal.processing', 'Processando...')
                        : t('movimentacaoModal.confirm', 'Confirmar')}
                </button>
            </form>
        </Modal>
    );
}
