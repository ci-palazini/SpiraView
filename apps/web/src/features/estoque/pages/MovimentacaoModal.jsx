// src/pages/MovimentacaoModal.jsx
import React, { useState } from 'react';
import { registrarMovimentacao } from '../../../services/apiClient';
import styles from './MovimentacaoModal.module.css';
import Modal from '../../../shared/components/Modal.jsx';
import toast from 'react-hot-toast';

export default function MovimentacaoModal({ peca, tipo, user, onClose }) {
  const [quantidade, setQuantidade] = useState(1);
  const [descricao, setDescricao] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // validação simples
      const q = Number(quantidade);
      if (!Number.isFinite(q) || q <= 0) {
        throw new Error('Quantidade inválida');
      }

      // chama a API (back já registra a movimentação e atualiza o estoque em transação)
      await registrarMovimentacao(
        peca.id,
        {
          tipo,                // 'entrada' | 'saida'
          quantidade: q,
          descricao: (descricao || '').trim(),
        },
        { role: user?.role, email: user?.email }
      );

      toast.success(`Movimentação de ${tipo} realizada com sucesso!`);
      onClose();
    } catch (err) {
      console.error('Erro ao registrar movimentação:', err);
      toast.error('Falha ao registrar movimentação.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={tipo === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label>Peça</label>
          <p>
            <strong>
              {peca.codigo} – {peca.nome}
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
            onChange={e => setQuantidade(Number(e.target.value))}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="descricao">Descrição (opcional)</label>
          <textarea
            id="descricao"
            className={styles.textarea}
            rows="3"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
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
