// src/features/configuracoes/pages/RolesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    listarRoles,
    listarUsuarios,
    Role
} from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './RolesPage.module.css';
import toast from 'react-hot-toast';
import { FiShield, FiLock, FiStar, FiUser } from 'react-icons/fi';
import Skeleton from '../../../shared/components/Skeleton';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

interface RolesPageProps {
    user: User;
}

// ---------- Component ----------
interface AdminUser {
    id: string;
    nome: string;
    email: string;
}

export default function RolesPage({ user }: RolesPageProps) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

    // Load data
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const auth = { email: user?.email, role: user?.role };
            const [rolesData, usersData] = await Promise.all([
                listarRoles(auth),
                listarUsuarios({ role: 'admin' })
            ]);
            setRoles(rolesData);
            // Filtrar apenas usuários admin
            const admins = (usersData as any[]).filter(u =>
                (u.role || '').toLowerCase() === 'admin'
            ).map(u => ({ id: u.id, nome: u.nome || u.email, email: u.email }));
            setAdminUsers(admins);
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

    return (
        <>
            <PageHeader
                title="Níveis de Acesso"
                subtitle="Gerencie os níveis de acesso disponíveis no sistema"
            />

            <div className={styles.container}>
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
                        {roles.map(role => {
                            const isAdmin = role.nome.toLowerCase() === 'admin';

                            return (
                                <div
                                    key={role.id}
                                    className={`${styles.card} ${role.isSystem ? styles.systemCard : ''} ${isAdmin ? styles.adminCard : ''}`}
                                >
                                    <div className={styles.cardHeader}>
                                        <div className={styles.cardIcon}>
                                            {isAdmin ? <FiStar /> : <FiShield />}
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

                                    {isAdmin && (
                                        <div className={styles.cardMeta}>
                                            <span className={styles.fullAccessBadge}>
                                                <FiStar size={14} />
                                                Acesso Total a Todas as Funcionalidades
                                            </span>
                                        </div>
                                    )}

                                    {/* Lista de admins apenas para role admin */}
                                    {isAdmin && adminUsers.length > 0 && (
                                        <div className={styles.adminUsersList}>
                                            <span className={styles.adminUsersLabel}>
                                                <FiUser size={14} />
                                                Usuários com este acesso:
                                            </span>
                                            <ul className={styles.adminUsersItems}>
                                                {adminUsers.map(u => (
                                                    <li key={u.id} title={u.email}>
                                                        {u.nome}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {isAdmin && adminUsers.length === 0 && (
                                        <div className={styles.adminUsersList}>
                                            <span className={styles.adminUsersLabel}>
                                                <FiUser size={14} />
                                                Nenhum usuário admin cadastrado
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
