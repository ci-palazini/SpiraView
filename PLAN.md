 Plano: Integração prod-metas → SpiraView

 Contexto

 O usuário mantém duas aplicações separadas que dobram o esforço. O prod-metas tem dois recursos
 ausentes no SpiraView:
 1. Metas por dia específico — SpiraView só suporta intervalos de datas (data_inicio/data_fim), não
 overrides diários
 2. Estrutura de setores para resultados — sem agrupamento por setor, impossível montar a página de
 resultados no formato calendário

 O objetivo é integrar as 3 páginas mais importantes do prod-metas ao SpiraView como novos menus do
 módulo Produção, adaptando ao stack (JWT auth, requirePermission, apiClient, tipos em
 @spiraview/shared). O upload/batch do prod-metas não é integrado — o SpiraView já tem seu próprio
 sistema de upload que gera producao_lancamentos, que será a fonte de dados da página de resultados.

 ---
 1. Migrações de Banco (3 migrações, nesta ordem)

 1a. create_producao_setores

 CREATE TABLE public.producao_setores (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     nome          text NOT NULL,
     ordem         integer NOT NULL DEFAULT 0,
     ativo         boolean NOT NULL DEFAULT true,
     criado_em     timestamptz NOT NULL DEFAULT now(),
     atualizado_em timestamptz NOT NULL DEFAULT now()
 );
 ALTER TABLE public.producao_setores ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "app_full_access" ON public.producao_setores FOR ALL TO postgres USING (true);

 1b. add_producao_fields_to_maquinas

 ALTER TABLE public.maquinas
     ADD COLUMN IF NOT EXISTS setor_producao_id uuid REFERENCES public.producao_setores(id) ON DELETE
  SET NULL,
     ADD COLUMN IF NOT EXISTS ordem_producao    integer NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS ativo_producao    boolean NOT NULL DEFAULT true;
 ▎ O campo setor (text) existente não é alterado — o dashboard existente depende dele.

 1c. create_producao_metas_diarias

 -- Meta padrão mensal por máquina
 CREATE TABLE public.producao_metas_padrao (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     maquina_id  uuid NOT NULL REFERENCES public.maquinas(id) ON DELETE CASCADE,
     ano         integer NOT NULL,
     mes         integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
     horas_meta  numeric(6,2) NOT NULL CHECK (horas_meta >= 0),
     criado_em   timestamptz NOT NULL DEFAULT now(),
     atualizado_em timestamptz NOT NULL DEFAULT now(),
     UNIQUE (maquina_id, ano, mes)
 );
 ALTER TABLE public.producao_metas_padrao ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "app_full_access" ON public.producao_metas_padrao FOR ALL TO postgres USING (true);

 -- Override de meta para dia específico
 CREATE TABLE public.producao_metas_dia (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     maquina_id  uuid NOT NULL REFERENCES public.maquinas(id) ON DELETE CASCADE,
     data_ref    date NOT NULL,
     horas_meta  numeric(6,2) NOT NULL CHECK (horas_meta >= 0),
     criado_em   timestamptz NOT NULL DEFAULT now(),
     atualizado_em timestamptz NOT NULL DEFAULT now(),
     UNIQUE (maquina_id, data_ref)
 );
 ALTER TABLE public.producao_metas_dia ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "app_full_access" ON public.producao_metas_dia FOR ALL TO postgres USING (true);

 ---
 2. Novos Tipos Compartilhados

 Arquivo: packages/shared/src/types/index.ts — adicionar ao final:

 export interface ProducaoSetor { id: string; nome: string; ordem: number; ativo: boolean; }
 export interface ProducaoMetaPadrao { id: string; maquinaId: string; maquinaNome?: string; ano:
 number; mes: number; horasMeta: number; }
 export interface ProducaoMetaDia { id: string; maquinaId: string; data: string; horasMeta: number; }
 export interface ResultadoDia { data: string; diaSemana: number; horasRealizado: number; horasMeta:
 number | null; temOverride: boolean; }
 export interface ResultadoMaquina { maquinaId: string; maquinaNome: string; ordemProducao: number;
 dias: ResultadoDia[]; totalRealizado: number; totalMeta: number; percentual: number | null; }
 export interface ResultadoSetor { id: string; nome: string; ordem: number; maquinas:
 ResultadoMaquina[]; totalRealizado: number; totalMeta: number; }
 export interface ResultadosMensais { setores: ResultadoSetor[]; ano: number; mes: number; diasNoMes:
  number; }
 export interface MaquinaProducaoConfig { id: string; nome: string; nomeProducao?: string;
 setorProducaoId?: string; setorNome?: string; ordemProducao: number; ativoProducao: boolean;
 escopoProducao: boolean; }

 Também adicionar campos opcionais à interface Maquina existente: setorProducaoId?, ordemProducao?,
 ativoProducao?.

 ---
 3. Novos Endpoints de API

 3a. apps/api/src/routes/producao/setores.ts (novo arquivo)

 GET    /producao/setores               requirePermission('producao_resultados', 'ver')   →
 listResponse
 POST   /producao/setores               requirePermission('producao_config_avancado', 'editar')
 PUT    /producao/setores/:id           requirePermission('producao_config_avancado', 'editar')
 DELETE /producao/setores/:id           requirePermission('producao_config_avancado', 'editar')
   └─ Guard: rejeitar se alguma máquina ainda referencia este setor

 3b. apps/api/src/routes/producao/resultados.ts (novo arquivo)

 GET /producao/resultados?ano=YYYY&mes=MM
   requirePermission('producao_resultados', 'ver')

   Query:
   SELECT m.id, m.nome_producao, m.nome, m.ordem_producao, m.setor_producao_id,
          s.nome as setor_nome, s.ordem as setor_ordem,
          pl.data_ref, SUM(pl.horas_realizadas) as horas_realizado,
          COALESCE(
              (SELECT horas_meta FROM producao_metas_dia WHERE maquina_id = m.id AND data_ref =
 d.dia),
              (SELECT horas_meta FROM producao_metas_padrao WHERE maquina_id = m.id AND ano = $ano
 AND mes = $mes)
          ) AS horas_meta
   FROM maquinas m
   JOIN producao_setores s ON s.id = m.setor_producao_id
   CROSS JOIN generate_series($inicio::date, $fim::date, '1 day') AS d(dia)
   LEFT JOIN producao_lancamentos pl ON pl.maquina_id = m.id AND pl.data_ref = d.dia
   WHERE m.escopo_producao = true AND m.ativo_producao = true AND m.setor_producao_id IS NOT NULL
   GROUP BY m.id, m.nome, m.nome_producao, m.ordem_producao, m.setor_producao_id,
            s.nome, s.ordem, d.dia
   ORDER BY s.ordem, m.ordem_producao, d.dia

   Resposta: ResultadosMensais (agregado pelo handler, não listResponse simples)

 3c. Adições em apps/api/src/routes/producao/metas.ts (existente)

 GET  /producao/metas-padrao?ano&mes[&maquinaId]   → listResponse(res, rows)
 PUT  /producao/metas-padrao/upsert   body: { maquinaId, ano, mes, horasMeta }   ON CONFLICT DO
 UPDATE
 GET  /producao/metas-dia?ano&mes[&maquinaId]       → listResponse(res, rows)
 PUT  /producao/metas-dia/upsert      body: { maquinaId, data, horasMeta }       ON CONFLICT DO
 UPDATE
 DELETE /producao/metas-dia/:id
 Todos com requirePermission adequado (producao_resultados ver / producao_config_avancado editar).

 3d. Adições em apps/api/src/routes/shared/maquinas.ts (existente)

 GET   /maquinas/producao-config                        → listResponse com campos: id, nome,
 nomeProducao, setorProducaoId, setorNome, ordemProducao, ativoProducao, escopoProducao
 PATCH /maquinas/:id/producao-config   body: { setorProducaoId?, nomeProducao?, ordemProducao?,
 ativoProducao? }

 3e. apps/api/src/routes/producao/index.ts — adicionar imports

 import { setoresRouter } from './setores';
 import { resultadosRouter } from './resultados';
 producaoRouter.use(setoresRouter);
 producaoRouter.use(resultadosRouter);

 ---
 4. Novos Page Keys de Permissão

 Em apps/api/src/routes/core/roles.ts → PAGINAS_DISPONIVEIS, adicionar no grupo Produção:
 { key: 'producao_resultados',       nome: 'Resultados Mensais',        grupo: 'Produção' },
 { key: 'producao_config_avancado',  nome: 'Estrutura e Metas (Config)', grupo: 'Produção' },

 ---
 5. Novas Páginas Frontend

 Arquivos a criar em apps/web/src/features/producao/pages/:

 5a. ProducaoResultadosPage.tsx

 - Seletor de mês (prev/next), toggle "Produção" / "Contabilidade"
 - Busca GET /producao/resultados?ano&mes
 - Renderiza por setor → por máquina → coluna por dia do mês
 - Cor da célula: verde ≥100%, amarelo ≥80%, vermelho <80%, cinza (sem meta)
 - Modo Contabilidade (frontend only): se soma de horas do sábado/domingo < 10h para todas as
 máquinas, redistribui ao Friday e oculta colunas fim de semana
 - Exportação Excel usando ExcelJS (mesma lógica do prod-metas adaptada)

 5b. ProducaoMetasCalendarioPage.tsx

 - Dropdown de máquina (agrupado por setor), seletor de mês
 - Campo "Meta padrão do mês" → PUT /producao/metas-padrao/upsert
 - Grid calendário (7 colunas, seg-dom): cada célula mostra meta efetiva
   - Override (producao_metas_dia): valor destacado com ponto azul
   - Padrão herdado: valor em cinza
 - Clique na célula abre popover inline com input de horas + botão "Remover override"
 - Salvar: PUT /producao/metas-dia/upsert | Remover: DELETE /producao/metas-dia/:id

 5c. ProducaoEstruturaPage.tsx

 - Duas abas: Setores | Máquinas de Produção
 - Aba Setores: tabela nome/ordem/ativo com edição inline e botão "Novo Setor"
 - Aba Máquinas: lista máquinas onde escopo_producao = true, colunas editáveis:
 nome_producao, setor (dropdown), ordem_producao, ativo_producao
   - PATCH por PATCH /maquinas/:id/producao-config

 ---
 6. apiClient.ts — Adicionar funções

 apps/web/src/services/apiClient.ts — novas funções após seção Produção existente:
 - listarSetoresProducao(), criarSetor(), atualizarSetor(), deletarSetor()
 - listarMetasPadrao(params), upsertMetaPadrao(payload)
 - listarMetasDia(params), upsertMetaDia(payload), deletarMetaDia(id)
 - buscarResultadosMensais(params) → ResultadosMensais
 - listarMaquinasProducaoConfig(), atualizarMaquinaProducaoConfig(id, payload)

 ---
 7. Navegação e Rotas

 apps/web/src/layouts/components/NavigationContent.tsx

 Atualizar o canViewAny do grupo Produção para incluir os novos pageKeys:
 perm.canViewAny(['producao_upload','producao_dashboard','producao_colaboradores',
                  'producao_config','producao_resultados','producao_config_avancado'])

 Adicionar dentro do grupo Produção:
 {/* Resultados */}
 {perm.canView('producao_resultados') && (
   <NavLink to="/producao/resultados">Resultados Mensais</NavLink>
 )}
 {/* Configurações avançadas */}
 {perm.canView('producao_config_avancado') && (
   <>
     <NavLink to="/producao/estrutura">Estrutura e Setores</NavLink>
     <NavLink to="/producao/metas-calendario">Metas por Dia</NavLink>
   </>
 )}

 apps/web/src/layouts/components/AppRoutes.tsx

 import ProducaoResultadosPage from '../../features/producao/pages/ProducaoResultadosPage';
 import ProducaoEstruturaPage from '../../features/producao/pages/ProducaoEstruturaPage';
 import ProducaoMetasCalendarioPage from '../../features/producao/pages/ProducaoMetasCalendarioPage';

 <Route path="/producao/resultados" element={canAccessPage('producao_resultados',
 <ProducaoResultadosPage user={user} />)} />
 <Route path="/producao/estrutura"  element={canAccessPage('producao_config_avancado',
 <ProducaoEstruturaPage user={user} />)} />
 <Route path="/producao/metas-calendario" element={canAccessPage('producao_config_avancado',
 <ProducaoMetasCalendarioPage user={user} />)} />

 ---
 8. Documentação a Atualizar

 - docs/PERMISSIONS.md — adicionar os 2 novos page keys
 - docs/DATABASE.md — adicionar as 3 novas tabelas e os 3 novos campos em maquinas
 - docs/modules/producao.md — documentar os novos endpoints

 ---
 9. Ordem de Implementação

 1. Migrações de banco (1a → 1b → 1c) e verificar com SELECT * FROM producao_setores
 2. Tipos compartilhados (packages/shared) + pnpm build em shared
 3. API: setores.ts + registro em index.ts
 4. API: adições em metas.ts (metas-padrao + metas-dia)
 5. API: adições em maquinas.ts (producao-config)
 6. API: resultados.ts
 7. API: roles.ts (novos page keys)
 8. Frontend: apiClient.ts (novas funções)
 9. Frontend: ProducaoEstruturaPage (configurar setores e máquinas antes de usar as outras páginas)
 10. Frontend: ProducaoMetasCalendarioPage
 11. Frontend: ProducaoResultadosPage
 12. Navegação: NavigationContent.tsx + AppRoutes.tsx
 13. Documentação

 ---
 10. Verificação

 1. Criar setor via ProducaoEstruturaPage, atribuir máquinas a ele
 2. Definir meta padrão e override diário via ProducaoMetasCalendarioPage
 3. Garantir que dados existem em producao_lancamentos para o mês
 4. Acessar ProducaoResultadosPage → deve mostrar máquinas agrupadas por setor com células coloridas
 5. Alternar modo "Contabilidade" → fim de semana com <10h deve ser absorvido na sexta anterior
 6. pnpm typecheck em todos os packages deve passar sem erros