// src/pages/InicioPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import styles from './InicioPage.module.css';
import usePermissions from '../hooks/usePermissions';
import {
    FiServer,
    FiCalendar,
    FiCheckSquare,
    FiBarChart2,
    FiPieChart,
    FiUsers,
    FiUser,
    FiPackage,
    FiClipboard,
    FiPlusCircle,
    FiAlertCircle,
    FiMessageSquare,
    FiUploadCloud,
    FiSettings,
    FiTrendingUp
} from 'react-icons/fi';

// ---------- Types ----------
interface User {
    nome?: string;
    role?: string;
    email?: string;
}

interface InicioPageProps {
    user: User;
}

// ---------- Component ----------
const InicioPage = ({ user }: InicioPageProps) => {
    const { t, i18n } = useTranslation();
    const perm = usePermissions(user);

    const isPt = (i18n?.language || '').toLowerCase().startsWith('pt');

    return (
        <>
            <header className={styles.header}>
                <h1>{t('inicio.title')}</h1>
                <p>
                    <Trans i18nKey="inicio.welcome" values={{ name: user.nome }}>
                        Bem-vindo de volta, <strong>{{ name: user.nome } as unknown as string}</strong>!
                    </Trans>
                </p>
            </header>

            <div className={styles.content}>
                <h2>{t('inicio.quickAccess')}</h2>

                <div className={styles.actionsGrid}>

                    {perm.canView('maquinas') && (
                        <Link to="/maquinas" className={styles.actionCard}>
                            <FiServer className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.machines.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.machines.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('chamados_abertos') && (
                        <Link to="/chamados-abertos" className={styles.actionCard}>
                            <FiAlertCircle className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.openCalls.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.openCalls.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('meus_chamados') && (
                        <Link to="/meus-chamados" className={styles.actionCard}>
                            <FiClipboard className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.myCalls.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.myCalls.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('abrir_chamado') && (
                        <Link to="/abrir-chamado" className={styles.actionCard}>
                            <FiPlusCircle className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.openTicket.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.openTicket.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('calendario') && (
                        <Link to="/calendario-geral" className={styles.actionCard}>
                            <FiCalendar className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.calendar.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.calendar.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('checklists_diarios') && (
                        <Link to="/checklists-diarios" className={styles.actionCard}>
                            <FiCheckSquare className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.dailyChecklists.title', 'Checklists Diários')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.dailyChecklists.desc', 'Visualize o status dos checklists de início de turno.')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('historico') && (
                        <Link to="/historico" className={styles.actionCard}>
                            <FiCheckSquare className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.history.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.history.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('estoque') && (
                        <Link to="/estoque" className={styles.actionCard}>
                            <FiPackage className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.inventory.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.inventory.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('analise_falhas') && (
                        <Link to="/analise-falhas" className={styles.actionCard}>
                            <FiBarChart2 className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.failureAnalysis.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.failureAnalysis.desc')}
                            </p>
                        </Link>
                    )}

                    {perm.canView('causas_raiz') && (
                        <Link to="/causas-raiz" className={styles.actionCard}>
                            <FiPieChart className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.rootCauses.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.rootCauses.desc')}
                            </p>
                        </Link>
                    )}

                    {isPt && perm.canViewAny(['analise_falhas', 'causas_raiz']) && (
                        <Link to="/chatbot" className={styles.actionCard}>
                            <FiMessageSquare className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.pziniBot.title', 'Pzini Chatbot')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.pziniBot.desc', 'Converse com o bot para analisar dados de manutenção.')}
                            </p>
                        </Link>
                    )}

                    {/* Produção - usa permissões granulares */}
                    {perm.canViewAny(['producao_dashboard', 'producao_colaboradores', 'producao_upload', 'producao_config']) && (
                        <>
                            {perm.canView('producao_dashboard') && (
                                <Link to="/producao/dashboard" className={styles.actionCard}>
                                    <FiTrendingUp className={styles.cardIcon} />
                                    <h3 className={styles.cardTitle}>{t('inicio.cards.productionDashboard.title', 'Visão do Dia')}</h3>
                                    <p className={styles.cardDescription}>
                                        {t('inicio.cards.productionDashboard.desc', 'Acompanhe a produção em tempo real.')}
                                    </p>
                                </Link>
                            )}

                            {perm.canView('producao_colaboradores') && (
                                <Link to="/producao/colaboradores" className={styles.actionCard}>
                                    <FiUsers className={styles.cardIcon} />
                                    <h3 className={styles.cardTitle}>{t('inicio.cards.productionEmployees.title', 'Colaboradores')}</h3>
                                    <p className={styles.cardDescription}>
                                        {t('inicio.cards.productionEmployees.desc', 'Acompanhe performance dos operadores.')}
                                    </p>
                                </Link>
                            )}

                            {perm.canView('producao_upload') && (
                                <Link to="/producao/upload" className={styles.actionCard}>
                                    <FiUploadCloud className={styles.cardIcon} />
                                    <h3 className={styles.cardTitle}>{t('inicio.cards.productionUpload.title', 'Upload Produção')}</h3>
                                    <p className={styles.cardDescription}>
                                        {t('inicio.cards.productionUpload.desc', 'Importe planilhas de produção.')}
                                    </p>
                                </Link>
                            )}

                            {perm.canView('producao_config') && (
                                <Link to="/producao/config" className={styles.actionCard}>
                                    <FiSettings className={styles.cardIcon} />
                                    <h3 className={styles.cardTitle}>{t('inicio.cards.productionConfig.title', 'Config. Máquinas')}</h3>
                                    <p className={styles.cardDescription}>
                                        {t('inicio.cards.productionConfig.desc', 'Configure máquinas e metas de produção.')}
                                    </p>
                                </Link>
                            )}
                        </>
                    )}

                    {perm.canView('usuarios') && (
                        <Link to="/gerir-utilizadores" className={styles.actionCard}>
                            <FiUsers className={styles.cardIcon} />
                            <h3 className={styles.cardTitle}>{t('inicio.cards.manageUsers.title')}</h3>
                            <p className={styles.cardDescription}>
                                {t('inicio.cards.manageUsers.desc')}
                            </p>
                        </Link>
                    )}

                    <Link to="/perfil" className={styles.actionCard}>
                        <FiUser className={styles.cardIcon} />
                        <h3 className={styles.cardTitle}>{t('inicio.cards.profile.title')}</h3>
                        <p className={styles.cardDescription}>
                            {t('inicio.cards.profile.desc')}
                        </p>
                    </Link>

                </div>
            </div>
        </>
    );
};

export default InicioPage;

