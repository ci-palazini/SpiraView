// src/features/departamentos/pages/GerirDepartamentosPage.tsx
import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus } from 'react-icons/fi';
import type { Departamento, DepartamentoCreate } from '@spiraview/shared';
import {
    listarDepartamentosArvore,
    listarDepartamentos,
    criarDepartamento,
    atualizarDepartamento,
    excluirDepartamento,
} from '../../../services/apiClient';
import usePermissions from '../../../hooks/usePermissions';
import { Button } from '../../../shared/components';
import PageHeader from '../../../shared/components/PageHeader';
import Spinner from '../../../shared/components/Spinner';
import DepartamentoTree from '../components/DepartamentoTree';
import styles from './GerirDepartamentosPage.module.css';
import type { User } from '../../../App';

interface GerirDepartamentosPageProps {
    user: User;
}

type FormMode = 'idle' | 'create' | 'edit';

interface FormState {
    nome: string;
    descricao: string;
    pai_id: string;
}

const EMPTY_FORM: FormState = { nome: '', descricao: '', pai_id: '' };

export default function GerirDepartamentosPage({ user }: GerirDepartamentosPageProps) {
    const { t } = useTranslation();
    const perm = usePermissions(user);
    const canEdit = perm.canEdit('departamentos');

    const [tree, setTree] = useState<Departamento[]>([]);
    const [flat, setFlat] = useState<Departamento[]>([]);
    const [loading, setLoading] = useState(true);
    const [formMode, setFormMode] = useState<FormMode>('idle');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const auth = { email: user.email, role: user.role };

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [treeData, flatData] = await Promise.all([
                listarDepartamentosArvore(auth),
                listarDepartamentos(auth),
            ]);
            setTree(treeData);
            setFlat(flatData);
        } catch {
            // silencioso
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { reload(); }, [reload]);

    const openCreate = (paiPreselect?: Departamento) => {
        setFormMode('create');
        setEditingId(null);
        setForm({ ...EMPTY_FORM, pai_id: paiPreselect?.id ?? '' });
        setError('');
    };

    const openEdit = (dep: Departamento) => {
        setFormMode('edit');
        setEditingId(dep.id);
        setForm({ nome: dep.nome, descricao: dep.descricao ?? '', pai_id: dep.pai_id ?? '' });
        setError('');
    };

    const cancelForm = () => {
        setFormMode('idle');
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError('');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!form.nome.trim()) {
            setError(t('nomeObrigatorio', 'Nome é obrigatório.'));
            return;
        }

        setSaving(true);
        setError('');

        const payload: DepartamentoCreate = {
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || undefined,
            pai_id: form.pai_id || undefined,
        };

        try {
            if (formMode === 'create') {
                await criarDepartamento(payload, auth);
            } else if (formMode === 'edit' && editingId) {
                await atualizarDepartamento(editingId, payload, auth);
            }
            await reload();
            cancelForm();
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || t('erroGenerico', 'Ocorreu um erro.'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (dep: Departamento) => {
        if (!window.confirm(`Excluir "${dep.nome}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await excluirDepartamento(dep.id, auth);
            if (editingId === dep.id) cancelForm();
            await reload();
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || t('erroGenerico', 'Ocorreu um erro.'));
        }
    };

    // Opções de pai — exclui o próprio departamento durante edição
    const paiOptions = flat.filter(d => d.id !== editingId);

    return (
        <>
            <PageHeader
                title={t('departamentos', 'Departamentos')}
                subtitle={t('depSubtitle', 'Crie departamentos e subdepartamentos para estruturar a hierarquia da organização.')}
                actions={
                    canEdit ? (
                        <Button size="sm" onClick={() => openCreate()}>
                            <FiPlus />
                            {t('criarDepartamento', 'Criar departamento')}
                        </Button>
                    ) : undefined
                }
            />

            <div className={styles.pageBody}>
                {/* ===== CARD ESQUERDO — ÁRVORE ===== */}
                <div className={styles.treeCard}>
                    <div className={styles.cardToolbar}>
                        <h2 className={styles.cardTitle}>{t('estrutura', 'Estrutura')}</h2>
                        {!loading && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' }}>
                                {flat.length} {flat.length === 1 ? t('departamento', 'departamento') : t('departamentos', 'departamentos')}
                            </span>
                        )}
                    </div>

                    <div className={styles.treeScrollArea}>
                        {loading ? (
                            <div className={styles.emptyState}>
                                <Spinner size={24} />
                            </div>
                        ) : tree.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>{t('semDepartamentos', 'Nenhum departamento criado.')}</p>
                            </div>
                        ) : (
                            <DepartamentoTree
                                nodes={tree}
                                selectedId={selectedId}
                                canEdit={canEdit}
                                onSelect={dep => { setSelectedId(dep.id); openEdit(dep); }}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                                onAddChild={openCreate}
                            />
                        )}
                    </div>
                </div>

                {/* ===== CARD DIREITO — FORMULÁRIO ===== */}
                <div className={styles.formCard}>
                    {formMode === 'idle' ? (
                        <div className={styles.formIdle}>
                            <p>{t('selecioneOuCrieDep', 'Selecione um departamento na árvore para editar, ou crie um novo.')}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <p className={styles.formTitle}>
                                {formMode === 'create'
                                    ? t('criarDepartamento', 'Criar departamento')
                                    : t('editarDepartamento', 'Editar departamento')}
                            </p>

                            <div className={styles.formBody}>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label} htmlFor="dep-nome">
                                        {t('nomeDepartamento', 'Nome do departamento')} *
                                    </label>
                                    <input
                                        id="dep-nome"
                                        className={styles.input}
                                        value={form.nome}
                                        onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                                        maxLength={150}
                                        placeholder={t('nomeDepartamentoPlaceholder', 'Ex: Produção, Qualidade')}
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.label} htmlFor="dep-descricao">
                                        {t('descricao', 'Descrição')}
                                    </label>
                                    <input
                                        id="dep-descricao"
                                        className={styles.input}
                                        value={form.descricao}
                                        onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                        maxLength={500}
                                        placeholder={t('descricaoPlaceholder', 'Opcional')}
                                    />
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.label} htmlFor="dep-pai">
                                        {t('depPai', 'Departamento pai')}
                                    </label>
                                    <select
                                        id="dep-pai"
                                        className={styles.select}
                                        value={form.pai_id}
                                        onChange={e => setForm(f => ({ ...f, pai_id: e.target.value }))}
                                    >
                                        <option value="">{t('semPai', 'Nenhum (raiz)')}</option>
                                        {paiOptions.map(dep => (
                                            <option key={dep.id} value={dep.id}>{dep.nome}</option>
                                        ))}
                                    </select>
                                </div>

                                {error && <p className={styles.errorMsg}>{error}</p>}
                            </div>

                            <div className={styles.formActions}>
                                <Button type="submit" loading={saving} size="sm">
                                    {formMode === 'create' ? t('criar', 'Criar') : t('salvar', 'Salvar')}
                                </Button>
                                <button
                                    type="button"
                                    className={styles.buttonGhost}
                                    onClick={cancelForm}
                                    disabled={saving}
                                >
                                    {t('cancelar', 'Cancelar')}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </>
    );
}
