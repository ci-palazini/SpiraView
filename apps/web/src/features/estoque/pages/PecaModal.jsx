// src/pages/PecaModal.jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { criarPeca, atualizarPeca } from '../../../services/apiClient';
import Modal from '../../../shared/components/Modal.jsx';
import toast from 'react-hot-toast';
import styles from './PecaModal.module.css';

export default function PecaModal({ peca, onClose, user, onSaved }) {
  const { t } = useTranslation();
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidade, setUnidade] = useState('');
  const [estoqueAtual, setEstoqueAtual] = useState(0);
  const [estoqueMinimo, setEstoqueMinimo] = useState(0);
  const [localizacao, setLocalizacao] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (peca) {
      // preenche o formulário para edição
      setCodigo(peca.codigo || '');
      setNome(peca.nome || '');
      setCategoria(peca.categoria || '');
      setUnidade(peca.unidade || '');
      setEstoqueAtual(peca.estoqueAtual ?? 0);
      setEstoqueMinimo(peca.estoqueMinimo ?? 0);
      setLocalizacao(peca.localizacao || '');
    } else {
      // limpa para criação
      setCodigo('');
      setNome('');
      setCategoria('');
      setUnidade('');
      setEstoqueAtual(0);
      setEstoqueMinimo(0);
      setLocalizacao('');
    }
  }, [peca]);

  const handleSubmit = async e => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        codigo: codigo.trim(),
        nome: nome.trim(),
        categoria: categoria?.trim() || null,
        // "unidade" ainda não persiste no banco
        estoqueAtual: Number(estoqueAtual || 0), // opcional na criação
        estoqueMinimo: Number(estoqueMinimo || 0),
        localizacao: localizacao?.trim() || null,
      };

      let saved;
      if (peca === null) {
        saved = await criarPeca(payload, { role: user?.role, email: user?.email });
        toast.success(t('pecaModal.toasts.created'));
      } else {
        saved = await atualizarPeca(peca.id, payload, { role: user?.role, email: user?.email });
        toast.success(t('pecaModal.toasts.updated'));
      }

      onSaved?.(saved);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar peça:', err);
      toast.error(t('pecaModal.toasts.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={peca ? t('pecaModal.title.edit') : t('pecaModal.title.create')}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="codigo">{t('pecaModal.fields.code')}</label>
          <input
            id="codigo"
            type="text"
            className={styles.input}
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="nome">{t('pecaModal.fields.name')}</label>
          <input
            id="nome"
            type="text"
            className={styles.input}
            value={nome}
            onChange={e => setNome(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="categoria">{t('pecaModal.fields.category')}</label>
          <input
            id="categoria"
            type="text"
            className={styles.input}
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="unidade">{t('pecaModal.fields.unit')}</label>
          <input
            id="unidade"
            type="text"
            className={styles.input}
            value={unidade}
            onChange={e => setUnidade(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="estoqueAtual">{t('pecaModal.fields.stockCurrent')}</label>
          <input
            id="estoqueAtual"
            type="number"
            min="0"
            className={styles.input}
            value={estoqueAtual}
            onChange={e => setEstoqueAtual(Number(e.target.value))}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="estoqueMinimo">{t('pecaModal.fields.stockMinimum')}</label>
          <input
            id="estoqueMinimo"
            type="number"
            min="0"
            className={styles.input}
            value={estoqueMinimo}
            onChange={e => setEstoqueMinimo(Number(e.target.value))}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="localizacao">{t('pecaModal.fields.location')}</label>
          <input
            id="localizacao"
            type="text"
            className={styles.input}
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
          />
        </div>

        <button type="submit" className={styles.button} disabled={isSaving}>
          {isSaving ? t('pecaModal.actions.saving') : t('pecaModal.actions.save')}
        </button>
      </form>
    </Modal>
  );
}
