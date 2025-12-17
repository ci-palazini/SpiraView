-- ============================================================
-- MIGRAÇÃO: Adicionar ecossistema de Produção
-- Projeto: TPM - Manutenção + Produção
-- Data: 2024-12-16
-- ============================================================

-- ATENÇÃO: Execute este script no seu banco PostgreSQL (Supabase)
-- Recomendação: Faça backup antes de executar

BEGIN;

-- ============================================================
-- 1) FLAGS DE ESCOPO NA TABELA MAQUINAS
-- ============================================================

-- Adicionar colunas de escopo para indicar em quais módulos a máquina participa
ALTER TABLE public.maquinas 
  ADD COLUMN IF NOT EXISTS escopo_manutencao BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS escopo_producao BOOLEAN DEFAULT FALSE;

-- Máquinas existentes ficam apenas em manutenção (comportamento atual)
UPDATE public.maquinas 
SET escopo_manutencao = TRUE, escopo_producao = FALSE 
WHERE escopo_manutencao IS NULL;

-- Garantir NOT NULL após migração
ALTER TABLE public.maquinas 
  ALTER COLUMN escopo_manutencao SET NOT NULL,
  ALTER COLUMN escopo_producao SET NOT NULL;

COMMENT ON COLUMN public.maquinas.escopo_manutencao IS 'Indica se a máquina participa do módulo de Manutenção';
COMMENT ON COLUMN public.maquinas.escopo_producao IS 'Indica se a máquina participa do módulo de Produção';

-- ============================================================
-- 2) TABELA DE METAS DE PRODUÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.producao_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina_id UUID NOT NULL REFERENCES public.maquinas(id) ON DELETE CASCADE,
  
  -- Período da meta
  data_inicio DATE NOT NULL,
  data_fim DATE,  -- NULL = meta indefinida (válida até nova meta ser criada)
  
  -- Meta de horas diárias
  horas_meta NUMERIC(6,2) NOT NULL CHECK (horas_meta > 0),
  
  -- Metadados
  criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  criado_por_id UUID REFERENCES public.usuarios(id),
  
  -- Apenas uma meta por máquina por data de início
  CONSTRAINT uq_producao_meta_maquina_data UNIQUE(maquina_id, data_inicio)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_producao_metas_maquina ON public.producao_metas(maquina_id);
CREATE INDEX IF NOT EXISTS idx_producao_metas_data ON public.producao_metas(data_inicio);
CREATE INDEX IF NOT EXISTS idx_producao_metas_vigente ON public.producao_metas(maquina_id, data_inicio DESC);

-- Trigger para atualizar atualizado_em automaticamente
DROP TRIGGER IF EXISTS trg_producao_metas_updated_at ON public.producao_metas;
CREATE TRIGGER trg_producao_metas_updated_at
  BEFORE UPDATE ON public.producao_metas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.producao_metas IS 'Metas de horas diárias por máquina para o módulo de Produção';

-- ============================================================
-- 3) TABELA DE UPLOADS DE PRODUÇÃO (HISTÓRICO)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.producao_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo VARCHAR(500) NOT NULL,
  data_ref DATE NOT NULL,  -- Principal data do arquivo
  linhas_total INTEGER NOT NULL DEFAULT 0,
  linhas_sucesso INTEGER NOT NULL DEFAULT 0,
  linhas_erro INTEGER NOT NULL DEFAULT 0,
  horas_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT FALSE,  -- Apenas 1 upload ativo por dia
  upload_por_id UUID REFERENCES public.usuarios(id),
  upload_por_nome VARCHAR(200),
  criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_producao_uploads_data ON public.producao_uploads(data_ref);
CREATE INDEX IF NOT EXISTS idx_producao_uploads_ativo ON public.producao_uploads(data_ref, ativo) WHERE ativo = TRUE;

-- Partial unique constraint: apenas 1 upload ativo por dia
CREATE UNIQUE INDEX IF NOT EXISTS uq_producao_uploads_ativo_dia 
  ON public.producao_uploads(data_ref) WHERE ativo = TRUE;

COMMENT ON TABLE public.producao_uploads IS 'Histórico de uploads de arquivos Excel para lançamentos de produção';

-- ============================================================
-- 4) TABELA DE LANÇAMENTOS DE PRODUÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.producao_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina_id UUID NOT NULL REFERENCES public.maquinas(id) ON DELETE CASCADE,
  
  -- Período do lançamento
  data_ref DATE NOT NULL,
  turno VARCHAR(10) CHECK (turno IS NULL OR turno IN ('1º', '2º')),
  
  -- Horas produzidas
  horas_realizadas NUMERIC(6,2) NOT NULL CHECK (horas_realizadas >= 0),
  
  -- Observações
  observacao TEXT,
  
  -- Vínculo com upload (NULL se lançamento manual)
  upload_id UUID REFERENCES public.producao_uploads(id) ON DELETE SET NULL,
  
  -- Metadados
  criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  lancado_por_id UUID REFERENCES public.usuarios(id),
  lancado_por_nome VARCHAR(200),
  lancado_por_email VARCHAR(200),
  
  -- Um lançamento por máquina/dia/turno
  CONSTRAINT uq_producao_lanc_maquina_data_turno UNIQUE(maquina_id, data_ref, turno)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_producao_lancamentos_maquina ON public.producao_lancamentos(maquina_id);
CREATE INDEX IF NOT EXISTS idx_producao_lancamentos_data ON public.producao_lancamentos(data_ref);
CREATE INDEX IF NOT EXISTS idx_producao_lancamentos_maquina_data ON public.producao_lancamentos(maquina_id, data_ref);
CREATE INDEX IF NOT EXISTS idx_producao_lancamentos_upload ON public.producao_lancamentos(upload_id);

-- Trigger para atualizar atualizado_em automaticamente
DROP TRIGGER IF EXISTS trg_producao_lancamentos_updated_at ON public.producao_lancamentos;
CREATE TRIGGER trg_producao_lancamentos_updated_at
  BEFORE UPDATE ON public.producao_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.producao_lancamentos IS 'Lançamentos de horas realizadas por máquina/dia para o módulo de Produção';

-- ============================================================
-- 5) VIEW DE RENDIMENTO (META VS REALIZADO)
-- ============================================================

CREATE OR REPLACE VIEW public.v_producao_rendimento AS
SELECT 
  l.id AS lancamento_id,
  l.maquina_id,
  m.nome AS maquina_nome,
  m.tag AS maquina_tag,
  m.setor AS maquina_setor,
  l.data_ref,
  l.turno,
  l.horas_realizadas,
  COALESCE(mt.horas_meta, 0) AS horas_meta,
  CASE 
    WHEN COALESCE(mt.horas_meta, 0) > 0 
    THEN ROUND((l.horas_realizadas / mt.horas_meta) * 100, 1)
    ELSE NULL 
  END AS percentual_atingido,
  CASE
    WHEN COALESCE(mt.horas_meta, 0) = 0 THEN 'sem_meta'
    WHEN l.horas_realizadas >= mt.horas_meta THEN 'atingido'
    WHEN l.horas_realizadas >= mt.horas_meta * 0.8 THEN 'parcial'
    ELSE 'abaixo'
  END AS status_meta,
  l.lancado_por_nome,
  l.observacao,
  l.criado_em
FROM public.producao_lancamentos l
JOIN public.maquinas m ON m.id = l.maquina_id
LEFT JOIN LATERAL (
  -- Busca a meta vigente para a data do lançamento
  SELECT horas_meta 
  FROM public.producao_metas mt2
  WHERE mt2.maquina_id = l.maquina_id
    AND mt2.data_inicio <= l.data_ref
    AND (mt2.data_fim IS NULL OR mt2.data_fim >= l.data_ref)
  ORDER BY mt2.data_inicio DESC
  LIMIT 1
) mt ON TRUE;

COMMENT ON VIEW public.v_producao_rendimento IS 'View consolidada de rendimento: lançamentos com meta vigente e percentual atingido';

-- ============================================================
-- 6) VIEW RESUMO DIÁRIO POR MÁQUINA
-- ============================================================

CREATE OR REPLACE VIEW public.v_producao_resumo_diario AS
SELECT 
  l.maquina_id,
  m.nome AS maquina_nome,
  m.tag AS maquina_tag,
  l.data_ref,
  SUM(l.horas_realizadas) AS horas_dia,
  COALESCE(mt.horas_meta, 0) AS meta_dia,
  CASE 
    WHEN COALESCE(mt.horas_meta, 0) > 0 
    THEN ROUND((SUM(l.horas_realizadas) / mt.horas_meta) * 100, 1)
    ELSE NULL 
  END AS percentual_dia,
  COUNT(*) AS qtd_lancamentos
FROM public.producao_lancamentos l
JOIN public.maquinas m ON m.id = l.maquina_id
LEFT JOIN LATERAL (
  SELECT horas_meta 
  FROM public.producao_metas mt2
  WHERE mt2.maquina_id = l.maquina_id
    AND mt2.data_inicio <= l.data_ref
    AND (mt2.data_fim IS NULL OR mt2.data_fim >= l.data_ref)
  ORDER BY mt2.data_inicio DESC
  LIMIT 1
) mt ON TRUE
GROUP BY l.maquina_id, m.nome, m.tag, l.data_ref, mt.horas_meta;

COMMENT ON VIEW public.v_producao_resumo_diario IS 'Resumo diário de produção por máquina com totais e percentual';

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (execute após o COMMIT para conferir)
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'maquinas' AND column_name LIKE 'escopo%';
-- 
-- SELECT * FROM information_schema.tables 
-- WHERE table_name LIKE 'producao%';
-- 
-- SELECT * FROM information_schema.views 
-- WHERE table_name LIKE 'v_producao%';
