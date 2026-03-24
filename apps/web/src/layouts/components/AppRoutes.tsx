import { ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '../../App';

import OperatorDashboard from '../OperatorDashboard';
import MaquinasPage from '../../features/manutencao/maquinas/pages/MaquinasPage';
import MaquinaDetalhePage from '../../features/manutencao/maquinas/pages/MaquinaDetalhePage';
import InicioPage from '../../pages/InicioPage';
import ChamadoDetalhe from '../../features/manutencao/chamados/pages/ChamadoDetalhe';
import HistoricoPage from '../../features/manutencao/chamados/pages/HistoricoPage';
import PerfilPage from '../../features/usuarios/pages/PerfilPage';
import AnaliseFalhasPage from '../../features/manutencao/analytics/pages/AnaliseFalhasPage';
import GerirUtilizadoresPage from '../../features/usuarios/pages/GerirUtilizadoresPage';
import CalendarioGeralPage from '../../features/manutencao/utilidades/calendario/pages/CalendarioGeralPage';
import CausasRaizPage from '../../features/manutencao/analytics/pages/CausasRaizPage';
import EstoquePage from '../../features/manutencao/utilidades/estoque/pages/EstoquePage';
import HistoricoMovimentacoesPage from '../../features/manutencao/utilidades/estoque/pages/HistoricoMovimentacoesPage';
import MeusChamados from '../../features/manutencao/chamados/pages/MeusChamados';
import AbrirChamadoManutentor from '../../features/manutencao/chamados/pages/AbrirChamadoManutentor';
import ChecklistOverviewPage from '../../features/manutencao/checklists/pages/ChecklistOverviewPage';
import ChamadosAbertosPage from '../../features/manutencao/chamados/pages/ChamadosAbertosPage';
import ProducaoUploadPage from '../../features/producao/pages/ProducaoUploadPage';
import ProducaoUploadDetalhePage from '../../features/producao/pages/ProducaoUploadDetalhePage';
import ProducaoDashboardPage from '../../features/producao/pages/ProducaoDashboardPage';
import ProducaoColaboradoresPage from '../../features/producao/pages/ProducaoColaboradoresPage';
import ProducaoColaboradorDetalhePage from '../../features/producao/pages/ProducaoColaboradorDetalhePage';
import MaquinasConfigPage from '../../features/configuracoes/pages/MaquinasConfigPage';
import PlanejamentoDashboardPage from '../../features/planejamento/pages/PlanejamentoDashboardPage';
import CapacidadeUploadPage from '../../features/planejamento/pages/CapacidadeUploadPage';
import CapacidadeConfigPage from '../../features/planejamento/pages/CapacidadeConfigPage';
import ProducaoEstruturaPage from '../../features/producao/pages/ProducaoEstruturaPage';
import ProducaoMetasCalendarioPage from '../../features/producao/pages/ProducaoMetasCalendarioPage';
import ProducaoResultadosPage from '../../features/producao/pages/ProducaoResultadosPage';
import RefugoFormPage from '../../features/qualidade/pages/RefugoFormPage';
import QualidadeDashboardGeralPage from '../../features/qualidade/pages/QualidadeDashboardGeralPage';
import QualidadeDashboardPage from '../../features/qualidade/pages/QualidadeDashboardPage';
import QualidadeConfigPage from '../../features/qualidade/pages/QualidadeConfigPage';
import QualidadeComparativoPage from '../../features/qualidade/pages/QualidadeComparativoPage';
import QualidadeDesempenhoPage from '../../features/qualidade/pages/QualidadeDesempenhoPage';
import RetrabalhoPage from '../../features/qualidade/pages/RetrabalhoPage';
import RetrabalhoAnalisePage from '../../features/qualidade/pages/RetrabalhoAnalisePage';
import LogisticaDashboardPage from '../../features/logistica/pages/LogisticaDashboardPage';
import PainelLogisticoPage from '../../features/logistica/pages/PainelLogisticoPage';
import PainelUploadPage from '../../features/logistica/pages/PainelUploadPage';
import LogisticaPrinc1DashboardPage from '../../features/logistica/pages/LogisticaPrinc1DashboardPage';
import LogisticaPrinc1UploadPage from '../../features/logistica/pages/LogisticaPrinc1UploadPage';
import LogisticaPropostoDashboardPage from '../../features/logistica/pages/LogisticaPropostoDashboardPage';
import LogisticaPropostoUploadPage from '../../features/logistica/pages/LogisticaPropostoUploadPage';
import ConfiguracaoNotificacoesPage from '../../features/configuracoes/pages/ConfiguracaoNotificacoesPage';
import SafetyUploadPage from '../../features/ehs/pages/SafetyUploadPage';
import SafetyCompliancePage from '../../features/ehs/pages/SafetyCompliancePage';
import TvSettingsPage from '../../features/configuracoes/pages/TvSettingsPage';
import PdcaDashboardPage from '../../features/pdca/pages/PdcaDashboardPage';
import PdcaPlanosPage from '../../features/pdca/pages/PdcaPlanosPage';
import PdcaPlanoDetailPage from '../../features/pdca/pages/PdcaPlanoDetailPage';
import JustificativaChecklistPage from '../../features/manutencao/checklists/pages/JustificativaChecklistPage';
import KaizenDashboardPage from '../../features/melhoria-continua/pages/KaizenDashboardPage';
import KamishibaiHistoryPage from '../../features/melhoria-continua/pages/KamishibaiHistoryPage';
import ReuniaoDiariaMenuPage from '../../features/reuniao-diaria/ReuniaoDiariaMenuPage';
import ReuniaoDiariaPage from '../../features/reuniao-diaria/ReuniaoDiariaPage';

interface AppRoutesProps {
    user: User;
    role: string;
    perm: any;
}

const AppRoutes = ({ user, role, perm }: AppRoutesProps) => {
    const canAccessPage = (pageKey: string, element: ReactElement): ReactElement =>
        perm.canView(pageKey) ? element : <Navigate to="/" replace />;

    return (
        <Routes>
            <Route
                path="/"
                element={
                    role === 'operador' ? (
                        <OperatorDashboard user={user} />
                    ) : (
                        <InicioPage user={user} />
                    )
                }
            />

            <Route
                path="/maquinas"
                element={canAccessPage('maquinas', <MaquinasPage user={user} />)}
            />
            <Route
                path="/maquinas/chamado/:id"
                element={canAccessPage('maquinas', <ChamadoDetalhe user={user} />)}
            />
            <Route
                path="/maquinas/:id"
                element={canAccessPage('maquinas', <MaquinaDetalhePage user={user} />)}
            />

            <Route path="/perfil" element={<PerfilPage user={user} />} />

            <Route
                path="/meus-chamados"
                element={canAccessPage('meus_chamados', <MeusChamados user={user} />)}
            />

            <Route
                path="/historico"
                element={canAccessPage('historico_chamados', <HistoricoPage />)}
            />
            <Route
                path="/historico/chamado/:id"
                element={canAccessPage('historico_chamados', <ChamadoDetalhe user={user} />)}
            />

            <Route
                path="/chamados-abertos"
                element={canAccessPage('chamados_abertos', <ChamadosAbertosPage />)}
            />

            <Route
                path="/abrir-chamado"
                element={canAccessPage('abrir_chamado', <AbrirChamadoManutentor user={user} />)}
            />

            <Route
                path="/analise-falhas"
                element={canAccessPage('analise_falhas', <AnaliseFalhasPage />)}
            />

            <Route
                path="/causas-raiz"
                element={canAccessPage('causas_raiz', <CausasRaizPage user={user} />)}
            />

            <Route
                path="/calendario-geral"
                element={canAccessPage('calendario', <CalendarioGeralPage user={user} />)}
            />

            <Route
                path="/estoque"
                element={canAccessPage('estoque', <EstoquePage user={user} />)}
            />

            <Route
                path="/estoque/movimentacoes"
                element={canAccessPage('movimentacoes', <HistoricoMovimentacoesPage user={user} />)}
            />

            <Route
                path="/checklists-diarios"
                element={canAccessPage('checklists_diarios', <ChecklistOverviewPage user={user} />)}
            />
            <Route
                path="/checklists-pendencias"
                element={canAccessPage('checklists_pendencias', <JustificativaChecklistPage />)}
            />

            <Route
                path="/gerir-utilizadores"
                element={canAccessPage('usuarios', <GerirUtilizadoresPage user={user} />)}
            />

            <Route
                path="/configuracoes/notificacoes"
                element={canAccessPage('notificacoes_config', <ConfiguracaoNotificacoesPage user={user} />)}
            />

            <Route
                path="/configuracoes/maquinas"
                element={canAccessPage('maquinas_config', <MaquinasConfigPage user={user} />)}
            />

            <Route
                path="/configuracoes/tv"
                element={canAccessPage('tv_config', <TvSettingsPage user={user} />)}
            />

            <Route
                path="/ehs/safety-upload"
                element={canAccessPage('safety', <SafetyUploadPage user={user} />)}
            />
            <Route
                path="/ehs/compliance"
                element={canAccessPage('safety', <SafetyCompliancePage />)}
            />

            <Route
                path="/producao/upload"
                element={canAccessPage('producao_upload', <ProducaoUploadPage user={user} />)}
            />

            <Route path="/producao/config" element={<Navigate to="/producao/estrutura" replace />} />

            <Route
                path="/producao/upload/:uploadId"
                element={canAccessPage('producao_upload', <ProducaoUploadDetalhePage />)}
            />

            <Route
                path="/producao/dashboard"
                element={canAccessPage('producao_dashboard', <ProducaoDashboardPage user={user} />)}
            />

            <Route
                path="/producao/colaboradores"
                element={canAccessPage('producao_colaboradores', <ProducaoColaboradoresPage user={user} />)}
            />

            <Route
                path="/producao/colaboradores/:matricula"
                element={canAccessPage('producao_colaboradores', <ProducaoColaboradorDetalhePage user={user} />)}
            />
            
            <Route
                path="/producao/estrutura"
                element={canAccessPage('producao_config', <ProducaoEstruturaPage />)}
            />

            <Route
                path="/producao/metas"
                element={canAccessPage('producao_config', <ProducaoMetasCalendarioPage />)}
            />

            <Route
                path="/producao/resultados"
                element={canAccessPage('producao_resultados', <ProducaoResultadosPage />)}
            />

            {/* Planejamento */}
            <Route
                path="/planejamento/dashboard"
                element={canAccessPage('planejamento_dashboard', <PlanejamentoDashboardPage user={user} />)}
            />
            <Route
                path="/planejamento/upload"
                element={canAccessPage('planejamento_upload', <CapacidadeUploadPage user={user} />)}
            />
            <Route
                path="/planejamento/config"
                element={canAccessPage('planejamento_config', <CapacidadeConfigPage user={user} />)}
            />

            <Route
                path="/qualidade/lancamentos"
                element={canAccessPage('qualidade_lancamento', <RefugoFormPage />)}
            />
            <Route
                path="/qualidade/visao-geral"
                element={canAccessPage('qualidade_dashboard', <QualidadeDashboardGeralPage />)}
            />
            <Route
                path="/qualidade/dashboard"
                element={canAccessPage('qualidade_dashboard', <QualidadeDashboardPage />)}
            />
            <Route
                path="/qualidade/comparativo"
                element={canAccessPage('qualidade_dashboard', <QualidadeComparativoPage />)}
            />
            <Route
                path="/qualidade/desempenho"
                element={canAccessPage('qualidade_desempenho', <QualidadeDesempenhoPage />)}
            />
            <Route
                path="/qualidade/config"
                element={canAccessPage('qualidade_config', <QualidadeConfigPage />)}
            />
            <Route
                path="/qualidade/retrabalho"
                element={canAccessPage('qualidade_retrabalho', <RetrabalhoPage />)}
            />
            <Route
                path="/qualidade/analise-retrabalho"
                element={canAccessPage('qualidade_retrabalho', <RetrabalhoAnalisePage />)}
            />

            {/* Rotas Logística */}
            <Route
                path="/logistica/dashboard"
                element={canAccessPage('logistica_dashboard', <LogisticaDashboardPage />)}
            />
            <Route
                path="/logistica/painel"
                element={canAccessPage('logistica_painel', <PainelLogisticoPage />)}
            />
            <Route
                path="/logistica/notas-upload"
                element={perm.canEdit('logistica_painel') ? <PainelUploadPage /> : <Navigate to="/" replace />}
            />
            <Route
                path="/logistica/princ1/dashboard"
                element={canAccessPage('logistica_princ1', <LogisticaPrinc1DashboardPage />)}
            />
            <Route
                path="/logistica/princ1/upload"
                element={canAccessPage('logistica_princ1', <LogisticaPrinc1UploadPage />)}
            />
            <Route
                path="/logistica/proposto/dashboard"
                element={canAccessPage('logistica_proposto', <LogisticaPropostoDashboardPage />)}
            />
            <Route
                path="/logistica/proposto/upload"
                element={perm.canEdit('logistica_proposto') ? <LogisticaPropostoUploadPage /> : <Navigate to="/" replace />}
            />

            {/* Rotas PDCA */}
            <Route
                path="/pdca/dashboard"
                element={canAccessPage('pdca_dashboard', <PdcaDashboardPage />)}
            />
            <Route
                path="/pdca/planos"
                element={canAccessPage('pdca_planos', <PdcaPlanosPage />)}
            />
            <Route
                path="/pdca/planos/:planoId"
                element={canAccessPage('pdca_planos', <PdcaPlanoDetailPage />)}
            />

            {/* Rotas Melhoria Contínua */}
            <Route
                path="/melhoria-continua/kaizens"
                element={canAccessPage('melhoria_continua', <KaizenDashboardPage user={user} />)}
            />
            <Route
                path="/melhoria-continua/historico-kamishibai"
                element={canAccessPage('melhoria_continua', <KamishibaiHistoryPage />)}
            />

            {/* Reunião Diária SQDCP */}
            <Route
                path="/reuniao-diaria"
                element={canAccessPage('reuniao_diaria', <ReuniaoDiariaMenuPage />)}
            />
            <Route
                path="/reuniao-diaria/:departamento"
                element={canAccessPage('reuniao_diaria', <ReuniaoDiariaPage />)}
            />
        </Routes>
    );
};

export default AppRoutes;
