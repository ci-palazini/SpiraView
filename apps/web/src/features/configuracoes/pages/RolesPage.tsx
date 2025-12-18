// src/features/configuracoes/pages/RolesPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    listarRoles,
    listarPaginasPermissao,
    criarRole,
    atualizarRole,
    excluirRole,
    Role,
    PaginaPermissao,
    NivelPermissao
} from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import Modal from '../../../shared/components/Modal';
import styles from './RolesPage.module.css';
import toast from 'react-hot-toast';
import { FiShield, FiEdit2, FiTrash2, FiPlus, FiLock } from 'react-icons/fi';
import Skeleton from '@mui/material/Skeleton';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface RolesPageProps {
    user: User;
}

// ---------- Component ----------
export default function RolesPage({ user }: RolesPageProps) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [paginas, setPaginas] = useState<PaginaPermissao[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Form state
    const [formNome, setFormNome] = useState('');
    const [formDescricao, setFormDescricao] = useState('');
    const [formPermissoes, setFormPermissoes] = useState<Record<string, NivelPermissao>>({});
    const [saving, setSaving] = useState(false);

    // Load data
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const auth = { email: user?.email, role: user?.role };
            const [rolesData, paginasData] = await Promise.all([
                listarRoles(auth),
                listarPaginasPermissao(auth)
            ]);
            setRoles(rolesData);
            setPaginas(paginasData);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    }, [user?.email, user?.role]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Group pages by grupo
    const paginasPorGrupo = useMemo(() => {
        const groups: Record<string, PaginaPermissao[]> = {};
        paginas.forEach(p => {
            if (!groups[p.grupo]) groups[p.grupo] = [];
            groups[p.grupo].push(p);
        });
        return groups;
    }, [paginas]);

    // Open modal for new role
    const handleNew = () => {
        setEditingRole(null);
        setFormNome('');
        setFormDescricao('');
        setFormPermissoes({});
        setModalOpen(true);
    };

    // Open modal for edit
    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setFormNome(role.nome);
        setFormDescricao(role.descricao || '');
        setFormPermissoes({ ...role.permissoes });
        setModalOpen(true);
    };

    // Delete role
    const handleDelete = async (role: Role) => {
        if (role.isSystem) {
            toast.error('Não é possível excluir nível de acesso do sistema');
            return;
        }
        if (!window.confirm(`Deseja excluir o nível "${role.nome}"?`)) return;

        try {
            await excluirRole(role.id, { role: user?.role, email: user?.email });
            toast.success('Nível de acesso excluído');
            loadData();
        } catch (e: any) {
            toast.error(e.message || 'Erro ao excluir');
        }
    };

    // Save role
    const handleSave = async () => {
        if (!formNome.trim()) {
            toast.error('Nome é obrigatório');
            return;
        }

        try {
            setSaving(true);
            const payload = {
                nome: formNome.trim(),
                descricao: formDescricao.trim() || undefined,
                permissoes: formPermissoes
            };

            if (editingRole) {
                await atualizarRole(editingRole.id, payload, { role: user?.role, email: user?.email });
                toast.success('Nível de acesso atualizado');
            } else {
                await criarRole(payload, { role: user?.role, email: user?.email });
                toast.success('Nível de acesso criado');
            }

            setModalOpen(false);
            loadData();
        } catch (e: any) {
            toast.error(e.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    // Update permission for a page
    const setPermissao = (pageKey: string, nivel: NivelPermissao) => {
        setFormPermissoes(prev => ({
            ...prev,
            [pageKey]: nivel
        }));
    };

    // Count permissions
    const countPermissions = (perms: Record<string, NivelPermissao>) => {
        return Object.values(perms).filter(v => v && v !== 'nenhum').length;
    };

    return (
        <>
            <PageHeader
                title="Níveis de Acesso"
                subtitle="Gerencie permissões personalizadas para cada tipo de usuário"
            />

            <div className={styles.container}>
                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <button className={styles.newButton} onClick={handleNew}>
                        <FiPlus />
                        Novo Nível de Acesso
                    </button>
                </div>

                {/* Cards grid */}
                {loading ? (
                    <div className={styles.grid}>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className={styles.card}>
                                <Skeleton variant="text" width="60%" height={28} />
                                <Skeleton variant="text" width="80%" height={18} />
                                <Skeleton variant="text" width="40%" height={16} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {roles.map(role => (
                            <div key={role.id} className={`${styles.card} ${role.isSystem ? styles.systemCard : ''}`}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardIcon}>
                                        <FiShield />
                                    </div>
                                    <div className={styles.cardTitle}>
                                        <h3>{role.nome}</h3>
                                        {role.isSystem && (
                                            <span className={styles.systemBadge}>
                                                <FiLock size={12} />
                                                Sistema
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {role.descricao && (
                                    <p className={styles.cardDescription}>{role.descricao}</p>
                                )}

                                <div className={styles.cardMeta}>
                                    <span className={styles.permCount}>
                                        {countPermissions(role.permissoes)} permissão(ões)
                                    </span>
                                </div>

                                <div className={styles.cardActions}>
                                    <button
                                        className={styles.editButton}
                                        onClick={() => handleEdit(role)}
                                        title="Editar"
                                    >
                                        <FiEdit2 />
                                        Editar
                                    </button>
                                    {!role.isSystem && (
                                        <button
                                            className={styles.deleteButton}
                                            onClick={() => handleDelete(role)}
                                            title="Excluir"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingRole ? 'Editar Nível de Acesso' : 'Novo Nível de Acesso'}
            >
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Nome *</label>
                        <input
                            type="text"
                            value={formNome}
                            onChange={e => setFormNome(e.target.value)}
                            placeholder="Ex: Líder de Produção"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Descrição</label>
                        <input
                            type="text"
                            value={formDescricao}
                            onChange={e => setFormDescricao(e.target.value)}
                            placeholder="Descrição opcional"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.permissionsSection}>
                        <h4>Permissões por Página</h4>

                        {Object.entries(paginasPorGrupo).map(([grupo, pags]) => (
                            <div key={grupo} className={styles.permGroup}>
                                <h5 className={styles.groupTitle}>{grupo}</h5>
                                <div className={styles.permList}>
                                    {pags.map(pag => (
                                        <div key={pag.key} className={styles.permRow}>
                                            <span className={styles.permName}>{pag.nome}</span>
                                            <div className={styles.permOptions}>
                                                {(['nenhum', 'ver', 'editar'] as NivelPermissao[]).map(nivel => (
                                                    <label
                                                        key={nivel}
                                                        className={`${styles.permOption} ${formPermissoes[pag.key] === nivel ? styles.active : ''} ${nivel === 'nenhum' && !formPermissoes[pag.key] ? styles.active : ''}`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`perm_${pag.key}`}
                                                            checked={formPermissoes[pag.key] === nivel || (nivel === 'nenhum' && !formPermissoes[pag.key])}
                                                            onChange={() => setPermissao(pag.key, nivel)}
                                                        />
                                                        {nivel === 'nenhum' ? 'Nenhum' : nivel === 'ver' ? 'Ver' : 'Editar'}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.modalFooter}>
                        <button
                            className={styles.cancelButton}
                            onClick={() => setModalOpen(false)}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            className={styles.saveButton}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
