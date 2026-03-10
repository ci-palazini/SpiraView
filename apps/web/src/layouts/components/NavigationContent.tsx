import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    FiHome, FiCheckSquare, FiTv, FiBarChart2, FiServer, FiAlertCircle,
    FiClipboard, FiPlusCircle, FiCalendar, FiFileText, FiPackage,
    FiPieChart, FiUsers, FiUploadCloud, FiSettings, FiShield,
    FiRefreshCw, FiTrendingUp
} from 'react-icons/fi';
import { PiFactoryBold } from "react-icons/pi";
import { LuLayoutDashboard } from "react-icons/lu";

import styles from '../MainLayout.module.css';
import SidebarGroup from './SidebarGroup';

interface NavigationContentProps {
    role: string;
    perm: any;
    openGroups: Record<string, boolean>;
    toggleGroup: (key: string) => void;
    hasOpenCalls: boolean;
    hasSoonDue: boolean;
    hasMyActiveCalls: boolean;
    myActiveCount: number;
}

const NavigationContent: React.FC<NavigationContentProps> = ({
    role,
    perm,
    openGroups,
    toggleGroup,
    hasOpenCalls,
    hasSoonDue,
    hasMyActiveCalls,
    myActiveCount
}) => {
    const { t } = useTranslation();

    return (
        <>
            <NavLink
                to="/"
                className={({ isActive }) =>
                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                }
                end
            >
                <FiHome className={styles.navIcon} />
                <span>{t('nav.home')}</span>
            </NavLink>

            {role === 'operador' && (
                <NavLink
                    to="/inicio-turno"
                    className={({ isActive }) =>
                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                    }
                >
                    <FiCheckSquare className={styles.navIcon} />
                    <span>{t('nav.startShift', 'Início de turno')}</span>
                </NavLink>
            )}

            <NavLink
                to="/tv"
                className={({ isActive }) =>
                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                }
            >
                <FiTv className={styles.navIcon} />
                <span>{t('nav.tvMode')}</span>
            </NavLink>

            {perm.canView('reuniao_diaria') && (
                <NavLink
                    to="/reuniao-diaria"
                    className={({ isActive }) =>
                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                    }
                >
                    <FiBarChart2 className={styles.navIcon} />
                    <span>{t('nav.dailyMeeting', 'Reunião Diária')}</span>
                </NavLink>
            )}

            {/* Manutenção - usa permissões granulares */}
            {perm.canViewAny(['maquinas', 'chamados_abertos', 'meus_chamados', 'abrir_chamado', 'calendario', 'checklists_diarios', 'checklists_pendencias', 'historico_chamados', 'estoque', 'movimentacoes', 'analise_falhas', 'causas_raiz']) && (
                <SidebarGroup
                    id="maintenance"
                    label={t('layout.sections.maintenance', 'Manutenção')}
                    icon={FiServer}
                    isOpen={openGroups.maintenance}
                    onToggle={toggleGroup}
                >
                    {perm.canViewAny(['maquinas', 'chamados_abertos']) && (
                        <div className={styles.groupSublabel}>{t('nav.maintSubOverview', 'Visão Geral')}</div>
                    )}
                    {perm.canView('maquinas') && (
                        <NavLink
                            to="/maquinas"
                            className={({ isActive }) => {
                                const base = styles.navLink;
                                const active = isActive ? ` ${styles.activeLink}` : '';
                                const alert = hasOpenCalls ? ` ${styles.alertLink}` : '';
                                return `${base}${active}${alert}`.trim();
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                <FiServer className={styles.navIcon} />
                                {hasOpenCalls && <span className={styles.alertBadge} />}
                            </div>
                            <span>{t('nav.machines')}</span>
                        </NavLink>
                    )}

                    {perm.canView('chamados_abertos') && (
                        <NavLink
                            to="/chamados-abertos"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiAlertCircle className={styles.navIcon} />
                            <span>{t('nav.openTickets', 'Chamados Abertos')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['meus_chamados', 'abrir_chamado']) && (
                        <div className={styles.groupSublabel}>{t('nav.maintSubActions', 'Ações & Meus Itens')}</div>
                    )}
                    {perm.canView('meus_chamados') && (
                        <NavLink
                            to="/meus-chamados"
                            className={({ isActive }) => {
                                const base = styles.navLink;
                                const active = isActive ? ` ${styles.activeLink}` : '';
                                const alert = hasMyActiveCalls ? ` ${styles.alertLink}` : '';
                                return `${base}${active}${alert}`.trim();
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                <FiClipboard className={styles.navIcon} />
                                {hasMyActiveCalls && (
                                    <span
                                        className={styles.alertBadge}
                                        title={`${myActiveCount} ${t('nav.activeCalls')}`}
                                    />
                                )}
                            </div>
                            <span>{t('nav.myCalls')}</span>
                        </NavLink>
                    )}

                    {perm.canView('abrir_chamado') && (
                        <NavLink
                            to="/abrir-chamado"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiPlusCircle className={styles.navIcon} />
                            <span>{t('nav.openCorrective')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['calendario', 'checklists_diarios', 'checklists_pendencias']) && (
                        <div className={styles.groupSublabel}>{t('nav.maintSubRoutine', 'Rotina & Planejamento')}</div>
                    )}
                    {perm.canView('calendario') && (
                        <NavLink
                            to="/calendario-geral"
                            className={({ isActive }) => {
                                let cls = styles.navLink;
                                if (isActive) return `${cls} ${styles.activeLink}`;
                                if (hasSoonDue) return `${cls} ${styles.alertLink}`;
                                return cls;
                            }}
                        >
                            <FiCalendar className={styles.navIcon} />
                            <span>{t('nav.calendar')}</span>
                        </NavLink>
                    )}

                    {perm.canView('checklists_diarios') && (
                        <NavLink
                            to="/checklists-diarios"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiCheckSquare className={styles.navIcon} />
                            <span>{t('nav.dailyChecklists', 'Checklists diários')}</span>
                        </NavLink>
                    )}

                    {perm.canView('checklists_pendencias') && (
                        <NavLink
                            to="/checklists-pendencias"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiAlertCircle className={styles.navIcon} />
                            <span>{t('nav.checklistPendencies', 'Justificativas')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['historico_chamados']) && (
                        <div className={styles.groupSublabel}>{t('nav.maintSubHistory', 'Histórico & Documentação')}</div>
                    )}
                    {perm.canView('historico_chamados') && (
                        <NavLink
                            to="/historico"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiFileText className={styles.navIcon} />
                            <span>{t('nav.history')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['estoque', 'movimentacoes']) && (
                        <div className={styles.groupSublabel}>{t('nav.maintSubMaterials', 'Materiais')}</div>
                    )}
                    {perm.canView('estoque') && (
                        <NavLink
                            to="/estoque"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiPackage className={styles.navIcon} />
                            <span>{t('nav.inventory')}</span>
                        </NavLink>
                    )}

                    {perm.canView('movimentacoes') && (
                        <NavLink
                            to="/estoque/movimentacoes"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiClipboard className={styles.navIcon} />
                            <span>{t('nav.stockMovements', 'Movimentações')}</span>
                        </NavLink>
                    )}

                    {/* Analytics dentro de Manutenção */}
                    {perm.canViewAny(['analise_falhas', 'causas_raiz']) && (
                        <>
                            <div className={styles.groupSublabel}>{t('nav.maintSubAnalytics', 'Analytics')}</div>
                            {perm.canView('analise_falhas') && (
                                <NavLink
                                    to="/analise-falhas"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiBarChart2 className={styles.navIcon} />
                                    <span>{t('nav.failures')}</span>
                                </NavLink>
                            )}

                            {perm.canView('causas_raiz') && (
                                <NavLink
                                    to="/causas-raiz"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiPieChart className={styles.navIcon} />
                                    <span>{t('nav.rootCauses')}</span>
                                </NavLink>
                            )}


                        </>
                    )}
                </SidebarGroup>
            )}

            {/* Produção - usa permissões granulares */}
            {perm.canViewAny(['producao_upload', 'producao_dashboard', 'producao_colaboradores', 'producao_config']) && (
                <SidebarGroup
                    id="production"
                    label={t('layout.sections.production', 'Produção')}
                    icon={PiFactoryBold}
                    isOpen={openGroups.production}
                    onToggle={toggleGroup}
                >
                    {perm.canViewAny(['producao_dashboard']) && (
                        <div className={styles.groupSublabel}>{t('nav.prodSubOverview', 'Visão Geral')}</div>
                    )}
                    {perm.canView('producao_dashboard') && (
                        <NavLink
                            to="/producao/dashboard"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <LuLayoutDashboard className={styles.navIcon} />
                            <span>{t('nav.productionDashboard', 'Dashboard')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['producao_colaboradores', 'producao_upload']) && (
                        <div className={styles.groupSublabel}>{t('nav.prodSubOperational', 'Operacional')}</div>
                    )}
                    {perm.canView('producao_colaboradores') && (
                        <NavLink
                            to="/producao/colaboradores"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUsers className={styles.navIcon} />
                            <span>{t('nav.productionEmployees', 'Colaboradores')}</span>
                        </NavLink>
                    )}

                    {perm.canView('producao_upload') && (
                        <NavLink
                            to="/producao/upload"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUploadCloud className={styles.navIcon} />
                            <span>{t('nav.productionUpload', 'Upload Produção')}</span>
                        </NavLink>
                    )}

                    {perm.canViewAny(['producao_config']) && (
                        <div className={styles.groupSublabel}>{t('nav.prodSubConfig', 'Configurações')}</div>
                    )}
                    {perm.canView('producao_config') && (
                        <NavLink
                            to="/producao/config"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiServer className={styles.navIcon} />
                            <span>{t('nav.productionConfig', 'Config. Máquinas')}</span>
                        </NavLink>
                    )}
                </SidebarGroup>
            )}

            {/* Planejamento - novo departamento */}
            {perm.canViewAny(['planejamento_dashboard', 'planejamento_upload', 'planejamento_config']) && (
                <SidebarGroup
                    id="planejamento"
                    label={t('layout.sections.planejamento', 'Planejamento')}
                    icon={FiCalendar}
                    isOpen={openGroups.planejamento}
                    onToggle={toggleGroup}
                >
                    {perm.canViewAny(['planejamento_dashboard']) && (
                        <div className={styles.groupSublabel}>{t('nav.planSubOverview', 'Visão Geral')}</div>
                    )}
                    {perm.canView('planejamento_dashboard') && (
                        <NavLink
                            to="/planejamento/dashboard"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <LuLayoutDashboard className={styles.navIcon} />
                            <span>{t('nav.planejamentoDashboard', 'Dashboard')}</span>
                        </NavLink>
                    )}
                    {perm.canViewAny(['planejamento_upload']) && (
                        <div className={styles.groupSublabel}>{t('nav.planSubOperational', 'Operacional')}</div>
                    )}
                    {perm.canView('planejamento_upload') && (
                        <NavLink
                            to="/planejamento/upload"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUploadCloud className={styles.navIcon} />
                            <span>{t('nav.planejamentoUpload', 'Upload Capacidade')}</span>
                        </NavLink>
                    )}
                    {perm.canViewAny(['planejamento_config']) && (
                        <div className={styles.groupSublabel}>{t('nav.planSubConfig', 'Configurações')}</div>
                    )}
                    {perm.canView('planejamento_config') && (
                        <NavLink
                            to="/planejamento/config"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiSettings className={styles.navIcon} />
                            <span>{t('nav.planejamentoConfig', 'Configuração')}</span>
                        </NavLink>
                    )}
                </SidebarGroup>

            )}

            {/* Qualidade - organizado por sub-seções */}
            {
                perm.canViewAny(['qualidade_dashboard', 'qualidade_lancamento', 'qualidade_config', 'qualidade_desempenho', 'qualidade_comparativo', 'qualidade_retrabalho']) && (
                    <SidebarGroup
                        id="quality"
                        label={t('layout.sections.quality', 'Qualidade')}
                        icon={FiShield}
                        isOpen={openGroups.quality}
                        onToggle={toggleGroup}
                    >
                        {/* ── Visão Geral ── */}
                        {perm.canView('qualidade_dashboard') && (
                            <>
                                <div className={styles.groupSublabel}>{t('nav.qualitySubOverview', 'Visão Geral')}</div>
                                <NavLink
                                    to="/qualidade/visao-geral"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <LuLayoutDashboard className={styles.navIcon} />
                                    <span>{t('nav.qualityOverviewDashboard', 'Dashboard Geral')}</span>
                                </NavLink>
                            </>
                        )}

                        {/* ── Refugo / Quarentena ── */}
                        {perm.canViewAny(['qualidade_dashboard', 'qualidade_lancamento', 'qualidade_comparativo', 'qualidade_desempenho']) && (
                            <div className={styles.groupSublabel}>{t('nav.qualitySubRefugo', 'Refugo / Quarentena')}</div>
                        )}
                        {perm.canView('qualidade_lancamento') && (
                            <NavLink
                                to="/qualidade/lancamentos"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiPlusCircle className={styles.navIcon} />
                                <span>{t('nav.qualityLaunch', 'Lançamentos')}</span>
                            </NavLink>
                        )}
                        {perm.canView('qualidade_dashboard') && (
                            <NavLink
                                to="/qualidade/dashboard"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiBarChart2 className={styles.navIcon} />
                                <span>{t('nav.qualityRefugoQuarentenaDashboard', 'Dashboard Refugo')}</span>
                            </NavLink>
                        )}
                        {perm.canView('qualidade_comparativo') && (
                            <NavLink
                                to="/qualidade/comparativo"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiBarChart2 className={styles.navIcon} />
                                <span>{t('nav.qualityComparativo', 'Análise Comparativa')}</span>
                            </NavLink>
                        )}
                        {perm.canView('qualidade_desempenho') && (
                            <NavLink
                                to="/qualidade/desempenho"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiUsers className={styles.navIcon} />
                                <span>{t('nav.qualityDesempenho', 'Desempenho Individual')}</span>
                            </NavLink>
                        )}

                        {/* ── Retrabalho ── */}
                        {perm.canViewAny(['qualidade_retrabalho']) && (
                            <div className={styles.groupSublabel}>{t('nav.qualitySubRetrabalho', 'Retrabalho')}</div>
                        )}
                        {perm.canView('qualidade_retrabalho') && (
                            <NavLink
                                to="/qualidade/retrabalho"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiRefreshCw className={styles.navIcon} />
                                <span>{t('nav.qualityRetrabalhoLanc', 'Lançamentos')}</span>
                            </NavLink>
                        )}
                        {perm.canView('qualidade_retrabalho') && (
                            <NavLink
                                to="/qualidade/analise-retrabalho"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiPieChart className={styles.navIcon} />
                                <span>{t('nav.qualityRetrabalhoAnalise', 'Análise de Causas')}</span>
                            </NavLink>
                        )}

                        {/* ── Configurações ── */}
                        {perm.canView('qualidade_config') && (
                            <>
                                <div className={styles.groupSublabel} />
                                <NavLink
                                    to="/qualidade/config"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiSettings className={styles.navIcon} />
                                    <span>{t('nav.qualityConfig', 'Configurações')}</span>
                                </NavLink>
                            </>
                        )}
                    </SidebarGroup>
                )
            }

            {/* Logística - novo departamento */}
            {perm.canViewAny(['logistica_dashboard', 'logistica_painel']) && (
                <SidebarGroup
                    id="logistics"
                    label={t('layout.sections.logistics', 'Logística')}
                    icon={FiPackage}
                    isOpen={openGroups.logistics}
                    onToggle={toggleGroup}
                >
                    {perm.canView('logistica_dashboard') && (
                        <NavLink
                            to="/logistica/dashboard"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <LuLayoutDashboard className={styles.navIcon} />
                            <span>{t('nav.logisticsDashboard', 'Dashboard')}</span>
                        </NavLink>
                    )}
                    {perm.canView('logistica_painel') && (
                        <NavLink
                            to="/logistica/painel"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiFileText className={styles.navIcon} />
                            <span>{t('nav.logisticsPainel', 'Painel Logístico')}</span>
                        </NavLink>
                    )}
                    {perm.canEdit('logistica_painel') && (
                        <NavLink
                            to="/logistica/notas-upload"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUploadCloud className={styles.navIcon} />
                            <span>{t('nav.logisticsPainelUpload', 'Upload Notas')}</span>
                        </NavLink>
                    )}
                </SidebarGroup>
            )
            }

            {/* PDCA - Melhoria Contínua (admin bypass via role==='admin' in usePermissions) */}
            {
                perm.canViewAny(['pdca_dashboard', 'pdca_planos']) && (
                    <SidebarGroup
                        id="pdca"
                        label={t('layout.sections.pdca', 'PDCA')}
                        icon={FiCheckSquare}
                        isOpen={openGroups.pdca}
                        onToggle={toggleGroup}
                    >
                        {perm.canView('pdca_dashboard') && (
                            <NavLink
                                to="/pdca/dashboard"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <LuLayoutDashboard className={styles.navIcon} />
                                <span>{t('nav.pdcaDashboard', 'Dashboard')}</span>
                            </NavLink>
                        )}
                        {perm.canView('pdca_planos') && (
                            <NavLink
                                to="/pdca/planos"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiClipboard className={styles.navIcon} />
                                <span>{t('nav.pdcaPlanos', 'Planos de Ação')}</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )
            }

            {/* Melhoria Contínua */}
            {
                perm.canViewAny(['melhoria_continua']) && (
                    <SidebarGroup
                        id="melhoriaContinua"
                        label={t('layout.sections.melhoriaContinua', 'Melhoria Contínua')}
                        icon={FiTrendingUp}
                        isOpen={openGroups.melhoriaContinua}
                        onToggle={toggleGroup}
                    >
                        {perm.canView('melhoria_continua') && (
                            <NavLink
                                to="/melhoria-continua/kaizens"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <LuLayoutDashboard className={styles.navIcon} />
                                <span>{t('nav.kaizensDashboard', 'Dashboard Kaizen')}</span>
                            </NavLink>
                        )}
                        {perm.canView('melhoria_continua') && (
                            <NavLink
                                to="/melhoria-continua/historico-kamishibai"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiFileText className={styles.navIcon} />
                                <span>{t('nav.kamishibaiHistory', 'Auditorias (Histórico)')}</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )
            }

            {/* EHS - Saúde, Segurança e Meio Ambiente */}
            {
                perm.canViewAny(['safety']) && (
                    <SidebarGroup
                        id="ehs"
                        label={t('layout.sections.ehs', 'EHS')}
                        icon={FiAlertCircle}
                        isOpen={openGroups.ehs}
                        onToggle={toggleGroup}
                    >
                        {perm.canView('safety') && (
                            <NavLink
                                to="/ehs/safety-upload"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiUploadCloud className={styles.navIcon} />
                                <span>{t('nav.safetyUpload')}</span>
                            </NavLink>
                        )}
                    </SidebarGroup>
                )
            }

            {/* Configurações - usa permissões granulares */}
            {
                perm.canViewAny(['usuarios', 'roles', 'notificacoes_config', 'maquinas_config', 'tv_config']) && (
                    <>
                        <h3 className={styles.navSectionTitle}>
                            {t('layout.sections.managePeople', 'Administração')}
                        </h3>
                        {perm.canViewAny(['usuarios', 'roles']) && (
                            <div className={styles.groupSublabel}>{t('nav.adminSubAccess', 'Acessos & Usuários')}</div>
                        )}
                        {perm.canView('usuarios') && (
                            <NavLink
                                to="/gerir-utilizadores"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiUsers className={styles.navIcon} />
                                <span>{t('nav.manageUsers')}</span>
                            </NavLink>
                        )}
                        {perm.canView('roles') && (
                            <NavLink
                                to="/configuracoes/roles"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiShield className={styles.navIcon} />
                                <span>{t('nav.manageRoles', 'Níveis de Acesso')}</span>
                            </NavLink>
                        )}
                        {perm.canViewAny(['notificacoes_config', 'maquinas_config', 'roles']) && (
                            <div className={styles.groupSublabel}>{t('nav.adminSubSystem', 'Sistema')}</div>
                        )}
                        {perm.canView('notificacoes_config') && (
                            <NavLink
                                to="/configuracoes/notificacoes"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiSettings className={styles.navIcon} />
                                <span>{t('nav.notificationConfig', 'Notificações')}</span>
                            </NavLink>
                        )}
                        {perm.canView('maquinas_config') && (
                            <NavLink
                                to="/configuracoes/maquinas"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiServer className={styles.navIcon} />
                                <span>{t('nav.machinesConfig', 'Config. Máquinas')}</span>
                            </NavLink>
                        )}
                        {perm.canView('tv_config') && (
                            <NavLink
                                to="/configuracoes/tv"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiTv className={styles.navIcon} />
                                <span>{t('nav.tvSettings', 'Modo TV')}</span>
                            </NavLink>
                        )}
                    </>
                )
            }
        </>
    );
};

export default NavigationContent;
