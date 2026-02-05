import React, { useState, useEffect, useCallback } from 'react';
import {
    listarNotificacoesConfig,
    adicionarNotificacaoConfig,
    removerNotificacaoConfig,
    listarUsuarios
} from '../../../services/apiClient';
import type { NotificacaoConfigUser, Usuario } from '../../../types/api';
import PageHeader from '../../../shared/components/PageHeader';
import { Select, Button } from '../../../shared/components';
import styles from './ConfiguracaoNotificacoesPage.module.css';
import toast from 'react-hot-toast';
import { FiTrash2, FiPlus, FiMail } from 'react-icons/fi';
import Skeleton from '@mui/material/Skeleton';
import { useTranslation } from 'react-i18next';

export interface ConfiguracaoNotificacoesPageProps {
    user: { email?: string; role?: string };
}

export default function ConfiguracaoNotificacoesPage({ user }: ConfiguracaoNotificacoesPageProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [configUsers, setConfigUsers] = useState<NotificacaoConfigUser[]>([]);
    const [allUsers, setAllUsers] = useState<Usuario[]>([]);

    // Only one event type for now
    const EVENTO = 'NOVO_CHAMADO';

    // Form
    const [selectedUserId, setSelectedUserId] = useState('');
    const [adding, setAdding] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const auth = { email: user?.email, role: user?.role };
            const [configs, users] = await Promise.all([
                listarNotificacoesConfig(EVENTO, auth),
                listarUsuarios({}, auth) // List all users to populate dropdown
            ]);
            setConfigUsers(configs);
            setAllUsers(users);
        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar configurações');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAdd = async () => {
        if (!selectedUserId) {
            toast.error('Selecione um usuário');
            return;
        }

        try {
            setAdding(true);
            const auth = { email: user?.email, role: user?.role };
            await adicionarNotificacaoConfig(EVENTO, selectedUserId, auth);
            toast.success('Usuário adicionado com sucesso!');
            setSelectedUserId('');
            loadData();
        } catch (e: any) {
            toast.error(e.message || 'Erro ao adicionar usuário');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (configUser: NotificacaoConfigUser) => {
        if (!window.confirm(`Remover ${configUser.nome} da lista de notificações?`)) return;

        try {
            const auth = { email: user?.email, role: user?.role };
            await removerNotificacaoConfig(configUser.evento, configUser.usuario_id, auth);
            toast.success('Usuário removido');
            setConfigUsers(prev => prev.filter(u => u.usuario_id !== configUser.usuario_id));
        } catch (e: any) {
            toast.error(e.message || 'Erro ao remover');
        }
    };

    // Filter out users already executing
    const availableUsers = allUsers.filter(u =>
        !configUsers.some(c => c.usuario_id === u.id)
    ).sort((a, b) => a.nome.localeCompare(b.nome));

    return (
        <>
            <PageHeader
                title="Configuração de Notificações"
                subtitle="Gerencie quem recebe emails automáticos do sistema"
            />

            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3>
                            <FiMail className={styles.icon} />
                            Evento: Novo Chamado Aberto
                        </h3>
                        <p>Os usuários abaixo receberão um email sempre que um novo chamado for aberto.</p>
                    </div>

                    <div className={styles.addSection}>
                        <div style={{ flex: 1, maxWidth: '400px' }}>
                            <Select
                                id="user-select"
                                label="Adicionar Usuário"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                            >
                                <option value="">Selecione um usuário...</option>
                                {availableUsers.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome} ({u.email})
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div style={{ marginTop: '28px' }}>
                            <Button onClick={handleAdd} disabled={adding || !selectedUserId}>
                                {adding ? 'Adicionando...' : 'Adicionar'}
                                <FiPlus style={{ marginLeft: 8 }} />
                            </Button>
                        </div>
                    </div>

                    <div className={styles.listSection}>
                        <h4>Destinatários Atuais ({configUsers.length})</h4>

                        {loading ? (
                            <Skeleton variant="rectangular" height={100} />
                        ) : configUsers.length === 0 ? (
                            <p className={styles.empty}>Nenhum destinatário configurado.</p>
                        ) : (
                            <ul className={styles.userList}>
                                {configUsers.map(user => (
                                    <li key={user.id} className={styles.userItem}>
                                        <div className={styles.userInfo}>
                                            <span className={styles.userName}>{user.nome}</span>
                                            <span className={styles.userEmail}>
                                                {user.email_real ? (
                                                    <span title="Email Real Configurado">{user.email_real}</span>
                                                ) : (
                                                    <span className={styles.fakeEmail} title="Este usuário não tem email real configurado. A notificação pode falhar.">
                                                        {user.email} (Email de Login) ⚠️
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <button
                                            className={styles.removeButton}
                                            onClick={() => handleRemove(user)}
                                            title="Remover"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
