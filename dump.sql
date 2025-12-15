--
-- PostgreSQL database dump
--

\restrict rlUAwfs1W537mdetSMP4QlzzOYORwbBI2oCZxtDQfwj3INd2lDKVFDt9AL5r3IF

-- Dumped from database version 17.5 (aa1f746)
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY "public"."movimentacoes" DROP CONSTRAINT IF EXISTS "movimentacoes_realizado_por_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."movimentacoes" DROP CONSTRAINT IF EXISTS "movimentacoes_peca_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes" DROP CONSTRAINT IF EXISTS "fk_subs_maquina";
ALTER TABLE IF EXISTS ONLY "public"."chamado_observacoes" DROP CONSTRAINT IF EXISTS "fk_obs_chamado";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "fk_chamados_maquina";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "fk_chamados_concluido_por";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "fk_chamados_agendamento";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes" DROP CONSTRAINT IF EXISTS "checklist_submissoes_operador_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes" DROP CONSTRAINT IF EXISTS "checklist_submissoes_maquina_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "chamados_responsavel_atual_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "chamados_manutentor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_eventos" DROP CONSTRAINT IF EXISTS "chamados_eventos_para_manutentor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_eventos" DROP CONSTRAINT IF EXISTS "chamados_eventos_de_manutentor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_eventos" DROP CONSTRAINT IF EXISTS "chamados_eventos_chamado_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_eventos" DROP CONSTRAINT IF EXISTS "chamados_eventos_actor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "chamados_criado_por_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamado_observacoes" DROP CONSTRAINT IF EXISTS "chamado_observacoes_autor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamado_eventos" DROP CONSTRAINT IF EXISTS "chamado_eventos_chamado_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."chamado_eventos" DROP CONSTRAINT IF EXISTS "chamado_eventos_autor_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."agendamentos_preventivos" DROP CONSTRAINT IF EXISTS "agendamentos_preventivos_maquina_id_fkey";
DROP TRIGGER IF EXISTS "trg_chamados_status_norm" ON "public"."chamados";
DROP TRIGGER IF EXISTS "tg_usuarios_updated" ON "public"."usuarios";
DROP TRIGGER IF EXISTS "tg_pecas_updated" ON "public"."pecas";
DROP TRIGGER IF EXISTS "tg_movimentacoes_apply" ON "public"."movimentacoes";
DROP TRIGGER IF EXISTS "tg_maquinas_updated" ON "public"."maquinas";
DROP TRIGGER IF EXISTS "tg_chamados_updated" ON "public"."chamados";
DROP INDEX IF EXISTS "public"."ux_usuarios_usuario";
DROP INDEX IF EXISTS "public"."ux_usuarios_email_plain";
DROP INDEX IF EXISTS "public"."ux_usuarios_email";
DROP INDEX IF EXISTS "public"."ux_maquinas_tag";
DROP INDEX IF EXISTS "public"."ux_maquinas_nome_norm";
DROP INDEX IF EXISTS "public"."ux_checklist_submissoes_oper_maquina_data";
DROP INDEX IF EXISTS "public"."ux_checklist_submissoes_dia";
DROP INDEX IF EXISTS "public"."ux_chamados_pred_item_ativo";
DROP INDEX IF EXISTS "public"."usuarios_role_lower_idx";
DROP INDEX IF EXISTS "public"."uq_submissao_unica_dia_turno";
DROP INDEX IF EXISTS "public"."uq_maquinas_tag_ci";
DROP INDEX IF EXISTS "public"."uq_maquinas_nome_ci";
DROP INDEX IF EXISTS "public"."uq_chamados_fs_id";
DROP INDEX IF EXISTS "public"."uq_chamado_observacoes_fs_id";
DROP INDEX IF EXISTS "public"."uq_chamado_obs_fs";
DROP INDEX IF EXISTS "public"."uq_causas_nome";
DROP INDEX IF EXISTS "public"."ix_usuarios_ativo";
DROP INDEX IF EXISTS "public"."ix_submissoes_email_lower";
DROP INDEX IF EXISTS "public"."ix_submissoes_email_created";
DROP INDEX IF EXISTS "public"."ix_submissoes_criado_em";
DROP INDEX IF EXISTS "public"."ix_checklist_submissoes_maquina";
DROP INDEX IF EXISTS "public"."ix_checklist_submissoes_lookup";
DROP INDEX IF EXISTS "public"."ix_checklist_submissoes_email_data";
DROP INDEX IF EXISTS "public"."ix_chamados_tipo";
DROP INDEX IF EXISTS "public"."ix_chamados_status";
DROP INDEX IF EXISTS "public"."ix_chamados_pred_abertos";
DROP INDEX IF EXISTS "public"."ix_chamados_maquina";
DROP INDEX IF EXISTS "public"."ix_chamados_criado";
DROP INDEX IF EXISTS "public"."ix_chamados_conc";
DROP INDEX IF EXISTS "public"."ix_chamados_checklist_gin";
DROP INDEX IF EXISTS "public"."ix_chamados_check_key";
DROP INDEX IF EXISTS "public"."ix_chamados_atendido_email";
DROP INDEX IF EXISTS "public"."ix_chamados_abertos_maquina";
DROP INDEX IF EXISTS "public"."ix_chamado_eventos_chamado_created";
DROP INDEX IF EXISTS "public"."ix_chamado_eventos_chamado";
DROP INDEX IF EXISTS "public"."idx_usuarios_email_lower";
DROP INDEX IF EXISTS "public"."idx_subs_maquina_data_turno";
DROP INDEX IF EXISTS "public"."idx_pecas_nome";
DROP INDEX IF EXISTS "public"."idx_pecas_categoria";
DROP INDEX IF EXISTS "public"."idx_obs_chamado_id";
DROP INDEX IF EXISTS "public"."idx_obs_chamado";
DROP INDEX IF EXISTS "public"."idx_movs_peca";
DROP INDEX IF EXISTS "public"."idx_movs_data";
DROP INDEX IF EXISTS "public"."idx_maquinas_tag";
DROP INDEX IF EXISTS "public"."idx_maquinas_nome";
DROP INDEX IF EXISTS "public"."idx_chk_subs_maquina";
DROP INDEX IF EXISTS "public"."idx_chk_subs_dataref";
DROP INDEX IF EXISTS "public"."idx_checklist_submissoes_created_at";
DROP INDEX IF EXISTS "public"."idx_chamados_tipo";
DROP INDEX IF EXISTS "public"."idx_chamados_status";
DROP INDEX IF EXISTS "public"."idx_chamados_resp";
DROP INDEX IF EXISTS "public"."idx_chamados_maquina_id";
DROP INDEX IF EXISTS "public"."idx_chamados_maquina";
DROP INDEX IF EXISTS "public"."idx_chamados_fts_obs";
DROP INDEX IF EXISTS "public"."idx_chamados_fs_id";
DROP INDEX IF EXISTS "public"."idx_chamados_criado_em";
DROP INDEX IF EXISTS "public"."idx_chamados_created_at";
DROP INDEX IF EXISTS "public"."idx_chamados_concluido_por";
DROP INDEX IF EXISTS "public"."idx_chamados_concluido_em";
DROP INDEX IF EXISTS "public"."idx_chamados_atribuido_email";
DROP INDEX IF EXISTS "public"."idx_chamados_agendamento_id";
DROP INDEX IF EXISTS "public"."idx_chamado_eventos_tipo";
DROP INDEX IF EXISTS "public"."idx_chamado_eventos_payload_gin";
DROP INDEX IF EXISTS "public"."idx_chamado_eventos_chamado";
DROP INDEX IF EXISTS "public"."idx_ap_status";
DROP INDEX IF EXISTS "public"."idx_ap_start_ts";
DROP INDEX IF EXISTS "public"."idx_ag_prev_status";
DROP INDEX IF EXISTS "public"."idx_ag_prev_start";
DROP INDEX IF EXISTS "public"."idx_ag_prev_maquina";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_2025_operador_id_maquina_id_data_r_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_2025_operador_id_maquina_id_criado_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_operador_email_criado_em_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_maquina_id_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_maquina_id_criado_em_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_lower_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_lower_criado_em_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_data_ref_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_criado_em_idx";
DROP INDEX IF EXISTS "public"."checklist_submissoes_bak_20250925_created_at_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_tipo_idx1";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_tipo_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_status_idx1";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_status_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_responsavel_atual_id_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_maquina_id_idx3";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_maquina_id_idx2";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_maquina_id_idx1";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_maquina_id_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_maquina_id_checklist_item_key_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_fs_id_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_criado_em_idx1";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_criado_em_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_created_at_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_concluido_por_id_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_concluido_em_idx1";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_concluido_em_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_checklist_item_key_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_checklist_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_atribuido_para_email_idx";
DROP INDEX IF EXISTS "public"."chamados_bak_20250925_agendamento_id_idx";
DROP INDEX IF EXISTS "public"."chamado_observacoes_bak_20250925_fs_id_idx";
DROP INDEX IF EXISTS "public"."chamado_observacoes_bak_20250925_chamado_id_idx";
ALTER TABLE IF EXISTS ONLY "public"."usuarios" DROP CONSTRAINT IF EXISTS "usuarios_pkey";
ALTER TABLE IF EXISTS ONLY "public"."usuarios" DROP CONSTRAINT IF EXISTS "usuarios_fs_id_key";
ALTER TABLE IF EXISTS ONLY "public"."usuarios" DROP CONSTRAINT IF EXISTS "usuarios_email_key";
ALTER TABLE IF EXISTS ONLY "public"."usuarios" DROP CONSTRAINT IF EXISTS "uq_usuarios_email";
ALTER TABLE IF EXISTS ONLY "public"."maquinas" DROP CONSTRAINT IF EXISTS "uq_maquinas_tag";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "uc_chamados_fs_id";
ALTER TABLE IF EXISTS ONLY "public"."raw_firestore" DROP CONSTRAINT IF EXISTS "raw_firestore_pkey";
ALTER TABLE IF EXISTS ONLY "public"."pecas" DROP CONSTRAINT IF EXISTS "pecas_pkey";
ALTER TABLE IF EXISTS ONLY "public"."pecas" DROP CONSTRAINT IF EXISTS "pecas_codigo_key";
ALTER TABLE IF EXISTS ONLY "public"."movimentacoes" DROP CONSTRAINT IF EXISTS "movimentacoes_pkey";
ALTER TABLE IF EXISTS ONLY "public"."maquinas" DROP CONSTRAINT IF EXISTS "maquinas_pkey";
ALTER TABLE IF EXISTS ONLY "public"."maquinas" DROP CONSTRAINT IF EXISTS "maquinas_fs_id_key";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes" DROP CONSTRAINT IF EXISTS "checklist_submissoes_pkey";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes" DROP CONSTRAINT IF EXISTS "checklist_submissoes_fs_id_key";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes_bak_20250925" DROP CONSTRAINT IF EXISTS "checklist_submissoes_bak_20250925_pkey";
ALTER TABLE IF EXISTS ONLY "public"."checklist_submissoes_bak_20250925" DROP CONSTRAINT IF EXISTS "checklist_submissoes_bak_20250925_fs_id_key";
ALTER TABLE IF EXISTS ONLY "public"."chamados" DROP CONSTRAINT IF EXISTS "chamados_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_eventos" DROP CONSTRAINT IF EXISTS "chamados_eventos_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_bak_20250925" DROP CONSTRAINT IF EXISTS "chamados_bak_20250925_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chamados_bak_20250925" DROP CONSTRAINT IF EXISTS "chamados_bak_20250925_fs_id_key";
ALTER TABLE IF EXISTS ONLY "public"."chamado_observacoes" DROP CONSTRAINT IF EXISTS "chamado_observacoes_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chamado_observacoes_bak_20250925" DROP CONSTRAINT IF EXISTS "chamado_observacoes_bak_20250925_pkey";
ALTER TABLE IF EXISTS ONLY "public"."chamado_eventos" DROP CONSTRAINT IF EXISTS "chamado_eventos_pkey";
ALTER TABLE IF EXISTS ONLY "public"."causas_raiz" DROP CONSTRAINT IF EXISTS "causas_raiz_pkey";
ALTER TABLE IF EXISTS ONLY "public"."causas_raiz" DROP CONSTRAINT IF EXISTS "causas_raiz_nome_key";
ALTER TABLE IF EXISTS ONLY "public"."causas" DROP CONSTRAINT IF EXISTS "causas_pkey";
ALTER TABLE IF EXISTS ONLY "public"."causas" DROP CONSTRAINT IF EXISTS "causas_nome_key";
ALTER TABLE IF EXISTS ONLY "public"."agendamentos_preventivos" DROP CONSTRAINT IF EXISTS "agendamentos_preventivos_pkey";
DROP VIEW IF EXISTS "public"."vw_checklist_submissoes_norm";
DROP VIEW IF EXISTS "public"."v_chamados_analiticos";
DROP VIEW IF EXISTS "public"."v_maquinas";
DROP VIEW IF EXISTS "public"."v_causas";
DROP TABLE IF EXISTS "public"."usuarios";
DROP TABLE IF EXISTS "public"."raw_firestore";
DROP TABLE IF EXISTS "public"."pecas";
DROP TABLE IF EXISTS "public"."movimentacoes";
DROP TABLE IF EXISTS "public"."maquinas";
DROP TABLE IF EXISTS "public"."checklist_submissoes_bak_20250925";
DROP TABLE IF EXISTS "public"."checklist_submissoes";
DROP TABLE IF EXISTS "public"."chamados_eventos";
DROP TABLE IF EXISTS "public"."chamados_bak_20250925";
DROP TABLE IF EXISTS "public"."chamados";
DROP TABLE IF EXISTS "public"."chamado_observacoes_bak_20250925";
DROP TABLE IF EXISTS "public"."chamado_observacoes";
DROP TABLE IF EXISTS "public"."chamado_eventos";
DROP TABLE IF EXISTS "public"."causas_raiz";
DROP TABLE IF EXISTS "public"."causas";
DROP TABLE IF EXISTS "public"."agendamentos_preventivos";
DROP FUNCTION IF EXISTS "public"."trg_set_updated_at"();
DROP FUNCTION IF EXISTS "public"."trg_movimentacoes_apply"();
DROP FUNCTION IF EXISTS "public"."set_updated_at"();
DROP FUNCTION IF EXISTS "public"."chamados_status_normalize"();
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS "unaccent";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "pg_trgm";
--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_trgm"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_trgm" IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";


--
-- Name: EXTENSION "unaccent"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "unaccent" IS 'text search dictionary that removes accents';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: chamados_status_normalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."chamados_status_normalize"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE s text;
BEGIN
  s := lower(unaccent(coalesce(NEW.status,'')));

  IF s LIKE 'conclu%'         THEN NEW.status := 'Concluido';
  ELSIF s = 'em andamento'    THEN NEW.status := 'Em Andamento';
  ELSIF s = 'aberto'          THEN NEW.status := 'Aberto';
  ELSIF s LIKE 'cancel%'      THEN NEW.status := 'Cancelado';
  ELSE
    -- fallback pra não quebrar a CHECK: joga para Aberto
    NEW.status := 'Aberto';
  END IF;

  RETURN NEW;
END$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END; $$;


--
-- Name: trg_movimentacoes_apply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_movimentacoes_apply"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE pecas SET estoque_atual = estoque_atual + NEW.quantidade
     WHERE id = NEW.peca_id;
  ELSE
    UPDATE pecas SET estoque_atual = estoque_atual - NEW.quantidade
     WHERE id = NEW.peca_id;
    -- Evita ficar negativo
    IF (SELECT estoque_atual FROM pecas WHERE id = NEW.peca_id) < 0 THEN
      RAISE EXCEPTION 'Estoque não pode ficar negativo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: agendamentos_preventivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agendamentos_preventivos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "maquina_id" "uuid" NOT NULL,
    "descricao" "text" NOT NULL,
    "itens_checklist" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "original_start" timestamp with time zone NOT NULL,
    "original_end" timestamp with time zone NOT NULL,
    "start_ts" timestamp with time zone NOT NULL,
    "end_ts" timestamp with time zone NOT NULL,
    "status" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "concluido_em" timestamp with time zone,
    "atrasado" boolean DEFAULT false,
    CONSTRAINT "agendamentos_preventivos_status_check" CHECK (("status" = ANY (ARRAY['agendado'::"text", 'iniciado'::"text", 'concluido'::"text"]))),
    CONSTRAINT "agendamentos_status_check" CHECK (("status" = ANY (ARRAY['agendado'::"text", 'iniciado'::"text", 'concluido'::"text", 'cancelado'::"text"])))
);


--
-- Name: causas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."causas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL
);


--
-- Name: causas_raiz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."causas_raiz" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL
);


--
-- Name: chamado_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamado_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamado_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "descricao" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "autor_id" "uuid",
    "autor_nome" "text",
    "autor_email" "text",
    "criado_em" timestamp without time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chamado_observacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamado_observacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamado_id" "uuid" NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "texto" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fs_id" "text",
    "autor_nome" "text",
    "autor_email" "text",
    "mensagem" "text"
);


--
-- Name: chamado_observacoes_bak_20250925; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamado_observacoes_bak_20250925" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamado_id" "uuid" NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "texto" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fs_id" "text",
    "autor_nome" "text",
    "autor_email" "text",
    "mensagem" "text"
);


--
-- Name: chamados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "maquina_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "status" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "criado_por_id" "uuid" NOT NULL,
    "manutentor_id" "uuid",
    "responsavel_atual_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "causa" "text",
    "solucao" "text",
    "checklist" "jsonb" DEFAULT '[]'::"jsonb",
    "concluido_em" timestamp with time zone,
    "item" "text",
    "checklist_item_key" "text",
    "origin" "text",
    "fs_id" "text",
    "observacoes" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "problema_reportado" "text",
    "servico_realizado" "text",
    "criado_por_nome" "text",
    "criado_por_email" "text",
    "atendido_por_id" "uuid",
    "atendido_por_nome" "text",
    "atendido_por_email" "text",
    "atribuido_para_id" "uuid",
    "atribuido_para_nome" "text",
    "atribuido_para_email" "text",
    "tipo_checklist" "text",
    "qtd_itens" integer,
    "concluido_por_id" "uuid",
    "concluido_por_email" "text",
    "concluido_por_nome" "text",
    "agendamento_id" "uuid",
    "atendido_em" timestamp with time zone,
    "fts_obs" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"portuguese"'::"regconfig", ((((TRIM(BOTH '"'::"text" FROM COALESCE("descricao", ''::"text")) || ' '::"text") || TRIM(BOTH '"'::"text" FROM COALESCE(("observacoes")::"text", ''::"text"))) || ' '::"text") || TRIM(BOTH '"'::"text" FROM COALESCE("causa", ''::"text"))))) STORED,
    CONSTRAINT "chamados_status_check" CHECK (("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text", 'Concluido'::"text", 'Cancelado'::"text"]))),
    CONSTRAINT "chamados_tipo_check" CHECK (("tipo" = ANY (ARRAY['corretiva'::"text", 'preventiva'::"text", 'preditiva'::"text"]))),
    CONSTRAINT "chk_chamados_status" CHECK (("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text", 'Concluido'::"text", 'Cancelado'::"text"])))
);


--
-- Name: chamados_bak_20250925; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamados_bak_20250925" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "maquina_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "status" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "criado_por_id" "uuid" NOT NULL,
    "manutentor_id" "uuid",
    "responsavel_atual_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "causa" "text",
    "solucao" "text",
    "checklist" "jsonb" DEFAULT '[]'::"jsonb",
    "concluido_em" timestamp with time zone,
    "item" "text",
    "checklist_item_key" "text",
    "origin" "text",
    "fs_id" "text",
    "observacoes" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "problema_reportado" "text",
    "servico_realizado" "text",
    "criado_por_nome" "text",
    "criado_por_email" "text",
    "atendido_por_id" "uuid",
    "atendido_por_nome" "text",
    "atendido_por_email" "text",
    "atribuido_para_id" "uuid",
    "atribuido_para_nome" "text",
    "atribuido_para_email" "text",
    "tipo_checklist" "text",
    "qtd_itens" integer,
    "concluido_por_id" "uuid",
    "concluido_por_email" "text",
    "concluido_por_nome" "text",
    "agendamento_id" "uuid",
    "atendido_em" timestamp with time zone,
    CONSTRAINT "chamados_status_check" CHECK (("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text", 'Concluido'::"text", 'Cancelado'::"text"]))),
    CONSTRAINT "chamados_tipo_check" CHECK (("tipo" = ANY (ARRAY['corretiva'::"text", 'preventiva'::"text", 'preditiva'::"text"])))
);


--
-- Name: chamados_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chamados_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamado_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "de_manutentor_id" "uuid",
    "para_manutentor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chamados_eventos_tipo_check" CHECK (("tipo" = ANY (ARRAY['atribuir'::"text", 'remover_atribuicao'::"text"])))
);


--
-- Name: checklist_submissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."checklist_submissoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "operador_nome" "text",
    "operador_email" "text",
    "maquina_id" "uuid" NOT NULL,
    "maquina_nome" "text",
    "respostas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "turno" "text",
    "fs_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_ref" "date" DEFAULT (("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" NOT NULL,
    CONSTRAINT "ck_turno_valido" CHECK (("turno" = ANY (ARRAY['1º'::"text", '2º'::"text"])))
);


--
-- Name: checklist_submissoes_bak_20250925; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."checklist_submissoes_bak_20250925" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "operador_nome" "text",
    "operador_email" "text",
    "maquina_id" "uuid" NOT NULL,
    "maquina_nome" "text",
    "respostas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "turno" "text",
    "fs_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_ref" "date" DEFAULT (("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" NOT NULL,
    CONSTRAINT "ck_turno_valido" CHECK (("turno" = ANY (ARRAY['1º'::"text", '2º'::"text"])))
);


--
-- Name: maquinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."maquinas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "tag" "text",
    "setor" "text",
    "critico" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checklist_diario" "jsonb" DEFAULT '[]'::"jsonb",
    "fs_id" "text"
);


--
-- Name: movimentacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."movimentacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "peca_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "quantidade" integer NOT NULL,
    "motivo" "text",
    "realizado_por_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "movimentacoes_quantidade_check" CHECK (("quantidade" > 0)),
    CONSTRAINT "movimentacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['entrada'::"text", 'saida'::"text"])))
);


--
-- Name: pecas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pecas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "categoria" "text",
    "estoque_atual" integer DEFAULT 0 NOT NULL,
    "estoque_minimo" integer DEFAULT 0 NOT NULL,
    "localizacao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pecas_estoque_atual_check" CHECK (("estoque_atual" >= 0)),
    CONSTRAINT "pecas_estoque_minimo_check" CHECK (("estoque_minimo" >= 0))
);


--
-- Name: raw_firestore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."raw_firestore" (
    "collection" "text" NOT NULL,
    "doc_id" "text" NOT NULL,
    "data" "jsonb" NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usuario" "text",
    "funcao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "senha_hash" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "password_hash" "text",
    "fs_id" "text",
    CONSTRAINT "ck_usuarios_role" CHECK (("role" = ANY (ARRAY['gestor'::"text", 'manutentor'::"text", 'operador'::"text"]))),
    CONSTRAINT "usuarios_role_check" CHECK (("role" = ANY (ARRAY['operador'::"text", 'manutentor'::"text", 'gestor'::"text"])))
);


--
-- Name: v_causas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_causas" AS
 SELECT "id",
    "nome",
    NULL::"text" AS "categoria"
   FROM "public"."causas_raiz" "cr";


--
-- Name: v_maquinas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_maquinas" AS
 SELECT "id",
    "nome",
    NULL::"text" AS "familia",
    "setor"
   FROM "public"."maquinas" "m";


--
-- Name: v_chamados_analiticos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_chamados_analiticos" AS
 SELECT "c"."id",
    "c"."maquina_id",
    "vm"."nome" AS "maquina_nome",
    NULL::"text" AS "causa_id",
    COALESCE("vc"."nome", NULLIF("c"."causa", ''::"text")) AS "causa_nome",
    "c"."status",
    "c"."criado_em",
    "c"."atendido_em",
    "c"."concluido_em",
        CASE
            WHEN ("c"."atendido_em" IS NOT NULL) THEN (EXTRACT(epoch FROM ("c"."atendido_em" - "c"."criado_em")) / 60.0)
            ELSE NULL::numeric
        END AS "tempo_ate_atendimento_min",
        CASE
            WHEN ("c"."concluido_em" IS NOT NULL) THEN (EXTRACT(epoch FROM ("c"."concluido_em" - "c"."criado_em")) / 60.0)
            ELSE NULL::numeric
        END AS "tempo_total_min",
    "c"."problema_reportado",
    "c"."solucao"
   FROM (("public"."chamados" "c"
     LEFT JOIN "public"."v_maquinas" "vm" ON (("vm"."id" = "c"."maquina_id")))
     LEFT JOIN "public"."v_causas" "vc" ON ((("vc"."nome" IS NOT NULL) AND ("public"."unaccent"("lower"("vc"."nome")) = "public"."unaccent"("lower"("c"."causa"))))));


--
-- Name: vw_checklist_submissoes_norm; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_checklist_submissoes_norm" AS
 SELECT "id",
    "operador_id",
    "operador_nome",
    "operador_email",
    "maquina_id",
    "maquina_nome",
    "respostas",
        CASE
            WHEN ("turno" = ANY (ARRAY['1'::"text", '1º'::"text", '1o'::"text", '1°'::"text", 'Primeiro'::"text", 'primeiro'::"text"])) THEN '1º'::"text"
            WHEN ("turno" = ANY (ARRAY['2'::"text", '2º'::"text", '2o'::"text", '2°'::"text", 'Segundo'::"text", 'segundo'::"text"])) THEN '2º'::"text"
            WHEN ((("created_at" AT TIME ZONE 'America/Sao_Paulo'::"text"))::time without time zone < '14:00:00'::time without time zone) THEN '1º'::"text"
            ELSE '2º'::"text"
        END AS "turno_norm",
    "created_at",
    "updated_at",
    "data_ref"
   FROM "public"."checklist_submissoes" "s";
--
-- Name: agendamentos_preventivos agendamentos_preventivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agendamentos_preventivos"
    ADD CONSTRAINT "agendamentos_preventivos_pkey" PRIMARY KEY ("id");


--
-- Name: causas causas_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."causas"
    ADD CONSTRAINT "causas_nome_key" UNIQUE ("nome");


--
-- Name: causas causas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."causas"
    ADD CONSTRAINT "causas_pkey" PRIMARY KEY ("id");


--
-- Name: causas_raiz causas_raiz_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."causas_raiz"
    ADD CONSTRAINT "causas_raiz_nome_key" UNIQUE ("nome");


--
-- Name: causas_raiz causas_raiz_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."causas_raiz"
    ADD CONSTRAINT "causas_raiz_pkey" PRIMARY KEY ("id");


--
-- Name: chamado_eventos chamado_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_eventos"
    ADD CONSTRAINT "chamado_eventos_pkey" PRIMARY KEY ("id");


--
-- Name: chamado_observacoes_bak_20250925 chamado_observacoes_bak_20250925_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_observacoes_bak_20250925"
    ADD CONSTRAINT "chamado_observacoes_bak_20250925_pkey" PRIMARY KEY ("id");


--
-- Name: chamado_observacoes chamado_observacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_observacoes"
    ADD CONSTRAINT "chamado_observacoes_pkey" PRIMARY KEY ("id");


--
-- Name: chamados_bak_20250925 chamados_bak_20250925_fs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_bak_20250925"
    ADD CONSTRAINT "chamados_bak_20250925_fs_id_key" UNIQUE ("fs_id");


--
-- Name: chamados_bak_20250925 chamados_bak_20250925_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_bak_20250925"
    ADD CONSTRAINT "chamados_bak_20250925_pkey" PRIMARY KEY ("id");


--
-- Name: chamados_eventos chamados_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_eventos"
    ADD CONSTRAINT "chamados_eventos_pkey" PRIMARY KEY ("id");


--
-- Name: chamados chamados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_pkey" PRIMARY KEY ("id");


--
-- Name: checklist_submissoes_bak_20250925 checklist_submissoes_bak_20250925_fs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes_bak_20250925"
    ADD CONSTRAINT "checklist_submissoes_bak_20250925_fs_id_key" UNIQUE ("fs_id");


--
-- Name: checklist_submissoes_bak_20250925 checklist_submissoes_bak_20250925_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes_bak_20250925"
    ADD CONSTRAINT "checklist_submissoes_bak_20250925_pkey" PRIMARY KEY ("id");


--
-- Name: checklist_submissoes checklist_submissoes_fs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes"
    ADD CONSTRAINT "checklist_submissoes_fs_id_key" UNIQUE ("fs_id");


--
-- Name: checklist_submissoes checklist_submissoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes"
    ADD CONSTRAINT "checklist_submissoes_pkey" PRIMARY KEY ("id");


--
-- Name: maquinas maquinas_fs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maquinas"
    ADD CONSTRAINT "maquinas_fs_id_key" UNIQUE ("fs_id");


--
-- Name: maquinas maquinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maquinas"
    ADD CONSTRAINT "maquinas_pkey" PRIMARY KEY ("id");


--
-- Name: movimentacoes movimentacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."movimentacoes"
    ADD CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id");


--
-- Name: pecas pecas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pecas"
    ADD CONSTRAINT "pecas_codigo_key" UNIQUE ("codigo");


--
-- Name: pecas pecas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pecas"
    ADD CONSTRAINT "pecas_pkey" PRIMARY KEY ("id");


--
-- Name: raw_firestore raw_firestore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."raw_firestore"
    ADD CONSTRAINT "raw_firestore_pkey" PRIMARY KEY ("collection", "doc_id");


--
-- Name: chamados uc_chamados_fs_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "uc_chamados_fs_id" UNIQUE ("fs_id");


--
-- Name: maquinas uq_maquinas_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maquinas"
    ADD CONSTRAINT "uq_maquinas_tag" UNIQUE ("tag");


--
-- Name: usuarios uq_usuarios_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "uq_usuarios_email" UNIQUE ("email");


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");


--
-- Name: usuarios usuarios_fs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_fs_id_key" UNIQUE ("fs_id");


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");


--
-- Name: chamado_observacoes_bak_20250925_chamado_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamado_observacoes_bak_20250925_chamado_id_idx" ON "public"."chamado_observacoes_bak_20250925" USING "btree" ("chamado_id");


--
-- Name: chamado_observacoes_bak_20250925_fs_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chamado_observacoes_bak_20250925_fs_id_idx" ON "public"."chamado_observacoes_bak_20250925" USING "btree" ("fs_id") WHERE ("fs_id" IS NOT NULL);


--
-- Name: chamados_bak_20250925_agendamento_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_agendamento_id_idx" ON "public"."chamados_bak_20250925" USING "btree" ("agendamento_id");


--
-- Name: chamados_bak_20250925_atribuido_para_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_atribuido_para_email_idx" ON "public"."chamados_bak_20250925" USING "btree" ("atribuido_para_email");


--
-- Name: chamados_bak_20250925_checklist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_checklist_idx" ON "public"."chamados_bak_20250925" USING "gin" ("checklist" "jsonb_path_ops");


--
-- Name: chamados_bak_20250925_checklist_item_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_checklist_item_key_idx" ON "public"."chamados_bak_20250925" USING "btree" ("checklist_item_key");


--
-- Name: chamados_bak_20250925_concluido_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_concluido_em_idx" ON "public"."chamados_bak_20250925" USING "btree" ("concluido_em" DESC);


--
-- Name: chamados_bak_20250925_concluido_em_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_concluido_em_idx1" ON "public"."chamados_bak_20250925" USING "btree" ("concluido_em" DESC);


--
-- Name: chamados_bak_20250925_concluido_por_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_concluido_por_id_idx" ON "public"."chamados_bak_20250925" USING "btree" ("concluido_por_id");


--
-- Name: chamados_bak_20250925_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_created_at_idx" ON "public"."chamados_bak_20250925" USING "btree" ("created_at");


--
-- Name: chamados_bak_20250925_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_criado_em_idx" ON "public"."chamados_bak_20250925" USING "btree" ("criado_em" DESC);


--
-- Name: chamados_bak_20250925_criado_em_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_criado_em_idx1" ON "public"."chamados_bak_20250925" USING "btree" ("criado_em" DESC);


--
-- Name: chamados_bak_20250925_fs_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_fs_id_idx" ON "public"."chamados_bak_20250925" USING "btree" ("fs_id");


--
-- Name: chamados_bak_20250925_maquina_id_checklist_item_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_maquina_id_checklist_item_key_idx" ON "public"."chamados_bak_20250925" USING "btree" ("maquina_id", "checklist_item_key") WHERE (("tipo" = 'preditiva'::"text") AND ("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text"])));


--
-- Name: chamados_bak_20250925_maquina_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_maquina_id_idx" ON "public"."chamados_bak_20250925" USING "btree" ("maquina_id");


--
-- Name: chamados_bak_20250925_maquina_id_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_maquina_id_idx1" ON "public"."chamados_bak_20250925" USING "btree" ("maquina_id");


--
-- Name: chamados_bak_20250925_maquina_id_idx2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_maquina_id_idx2" ON "public"."chamados_bak_20250925" USING "btree" ("maquina_id");


--
-- Name: chamados_bak_20250925_maquina_id_idx3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_maquina_id_idx3" ON "public"."chamados_bak_20250925" USING "btree" ("maquina_id") WHERE ("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text"]));


--
-- Name: chamados_bak_20250925_responsavel_atual_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_responsavel_atual_id_idx" ON "public"."chamados_bak_20250925" USING "btree" ("responsavel_atual_id");


--
-- Name: chamados_bak_20250925_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_status_idx" ON "public"."chamados_bak_20250925" USING "btree" ("status");


--
-- Name: chamados_bak_20250925_status_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_status_idx1" ON "public"."chamados_bak_20250925" USING "btree" ("status");


--
-- Name: chamados_bak_20250925_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_tipo_idx" ON "public"."chamados_bak_20250925" USING "btree" ("tipo");


--
-- Name: chamados_bak_20250925_tipo_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chamados_bak_20250925_tipo_idx1" ON "public"."chamados_bak_20250925" USING "btree" ("tipo");


--
-- Name: checklist_submissoes_bak_20250925_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_created_at_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("created_at");


--
-- Name: checklist_submissoes_bak_20250925_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_criado_em_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("criado_em");


--
-- Name: checklist_submissoes_bak_20250925_data_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_data_ref_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("data_ref");


--
-- Name: checklist_submissoes_bak_20250925_lower_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_lower_criado_em_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("lower"("operador_email"), "criado_em");


--
-- Name: checklist_submissoes_bak_20250925_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_lower_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("lower"("operador_email"));


--
-- Name: checklist_submissoes_bak_20250925_maquina_id_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_maquina_id_criado_em_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("maquina_id", "criado_em" DESC);


--
-- Name: checklist_submissoes_bak_20250925_maquina_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_maquina_id_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("maquina_id");


--
-- Name: checklist_submissoes_bak_20250925_operador_email_criado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_20250925_operador_email_criado_em_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("operador_email", "criado_em");


--
-- Name: checklist_submissoes_bak_2025_operador_id_maquina_id_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "checklist_submissoes_bak_2025_operador_id_maquina_id_criado_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("operador_id", "maquina_id", "criado_em");


--
-- Name: checklist_submissoes_bak_2025_operador_id_maquina_id_data_r_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "checklist_submissoes_bak_2025_operador_id_maquina_id_data_r_idx" ON "public"."checklist_submissoes_bak_20250925" USING "btree" ("operador_id", "maquina_id", "data_ref");


--
-- Name: idx_ag_prev_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ag_prev_maquina" ON "public"."agendamentos_preventivos" USING "btree" ("maquina_id");


--
-- Name: idx_ag_prev_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ag_prev_start" ON "public"."agendamentos_preventivos" USING "btree" ("start_ts");


--
-- Name: idx_ag_prev_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ag_prev_status" ON "public"."agendamentos_preventivos" USING "btree" ("status");


--
-- Name: idx_ap_start_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ap_start_ts" ON "public"."agendamentos_preventivos" USING "btree" ("start_ts");


--
-- Name: idx_ap_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ap_status" ON "public"."agendamentos_preventivos" USING "btree" ("status");


--
-- Name: idx_chamado_eventos_chamado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamado_eventos_chamado" ON "public"."chamado_eventos" USING "btree" ("chamado_id", "criado_em");


--
-- Name: idx_chamado_eventos_payload_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamado_eventos_payload_gin" ON "public"."chamado_eventos" USING "gin" ("payload");


--
-- Name: idx_chamado_eventos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamado_eventos_tipo" ON "public"."chamado_eventos" USING "btree" ("tipo");


--
-- Name: idx_chamados_agendamento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_agendamento_id" ON "public"."chamados" USING "btree" ("agendamento_id");


--
-- Name: idx_chamados_atribuido_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_atribuido_email" ON "public"."chamados" USING "btree" ("atribuido_para_email");


--
-- Name: idx_chamados_concluido_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_concluido_em" ON "public"."chamados" USING "btree" ("concluido_em" DESC);


--
-- Name: idx_chamados_concluido_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_concluido_por" ON "public"."chamados" USING "btree" ("concluido_por_id");


--
-- Name: idx_chamados_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_created_at" ON "public"."chamados" USING "btree" ("created_at");


--
-- Name: idx_chamados_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_criado_em" ON "public"."chamados" USING "btree" ("criado_em" DESC);


--
-- Name: idx_chamados_fs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_fs_id" ON "public"."chamados" USING "btree" ("fs_id");


--
-- Name: idx_chamados_fts_obs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_fts_obs" ON "public"."chamados" USING "gin" ("fts_obs");


--
-- Name: idx_chamados_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_maquina" ON "public"."chamados" USING "btree" ("maquina_id");


--
-- Name: idx_chamados_maquina_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_maquina_id" ON "public"."chamados" USING "btree" ("maquina_id");


--
-- Name: idx_chamados_resp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_resp" ON "public"."chamados" USING "btree" ("responsavel_atual_id");


--
-- Name: idx_chamados_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_status" ON "public"."chamados" USING "btree" ("status");


--
-- Name: idx_chamados_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chamados_tipo" ON "public"."chamados" USING "btree" ("tipo");


--
-- Name: idx_checklist_submissoes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_checklist_submissoes_created_at" ON "public"."checklist_submissoes" USING "btree" ("created_at");


--
-- Name: idx_chk_subs_dataref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chk_subs_dataref" ON "public"."checklist_submissoes" USING "btree" ("data_ref");


--
-- Name: idx_chk_subs_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_chk_subs_maquina" ON "public"."checklist_submissoes" USING "btree" ("maquina_id");


--
-- Name: idx_maquinas_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maquinas_nome" ON "public"."maquinas" USING "btree" ("nome");


--
-- Name: idx_maquinas_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maquinas_tag" ON "public"."maquinas" USING "btree" ("tag");


--
-- Name: idx_movs_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_movs_data" ON "public"."movimentacoes" USING "btree" ("criado_em" DESC);


--
-- Name: idx_movs_peca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_movs_peca" ON "public"."movimentacoes" USING "btree" ("peca_id");


--
-- Name: idx_obs_chamado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_obs_chamado" ON "public"."chamado_observacoes" USING "btree" ("chamado_id");


--
-- Name: idx_obs_chamado_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_obs_chamado_id" ON "public"."chamado_observacoes" USING "btree" ("chamado_id");


--
-- Name: idx_pecas_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pecas_categoria" ON "public"."pecas" USING "btree" ("categoria");


--
-- Name: idx_pecas_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pecas_nome" ON "public"."pecas" USING "btree" ("nome");


--
-- Name: idx_subs_maquina_data_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_subs_maquina_data_turno" ON "public"."checklist_submissoes" USING "btree" ("maquina_id", "data_ref", "turno");


--
-- Name: idx_usuarios_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_usuarios_email_lower" ON "public"."usuarios" USING "btree" ("lower"("email"));


--
-- Name: ix_chamado_eventos_chamado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamado_eventos_chamado" ON "public"."chamados_eventos" USING "btree" ("chamado_id", "created_at" DESC);


--
-- Name: ix_chamado_eventos_chamado_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamado_eventos_chamado_created" ON "public"."chamado_eventos" USING "btree" ("chamado_id", "criado_em" DESC);


--
-- Name: ix_chamados_abertos_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_abertos_maquina" ON "public"."chamados" USING "btree" ("maquina_id") WHERE ("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text"]));


--
-- Name: ix_chamados_atendido_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_atendido_email" ON "public"."chamados" USING "btree" ("lower"("atendido_por_email"));


--
-- Name: ix_chamados_check_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_check_key" ON "public"."chamados" USING "btree" ("checklist_item_key");


--
-- Name: ix_chamados_checklist_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_checklist_gin" ON "public"."chamados" USING "gin" ("checklist" "jsonb_path_ops");


--
-- Name: ix_chamados_conc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_conc" ON "public"."chamados" USING "btree" ("concluido_em" DESC);


--
-- Name: ix_chamados_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_criado" ON "public"."chamados" USING "btree" ("criado_em" DESC);


--
-- Name: ix_chamados_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_maquina" ON "public"."chamados" USING "btree" ("maquina_id");


--
-- Name: ix_chamados_pred_abertos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_pred_abertos" ON "public"."chamados" USING "btree" ("maquina_id", "checklist_item_key") WHERE (("tipo" = 'preditiva'::"text") AND ("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text"])));


--
-- Name: ix_chamados_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_status" ON "public"."chamados" USING "btree" ("status");


--
-- Name: ix_chamados_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_chamados_tipo" ON "public"."chamados" USING "btree" ("tipo");


--
-- Name: ix_checklist_submissoes_email_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_checklist_submissoes_email_data" ON "public"."checklist_submissoes" USING "btree" ("operador_email", "criado_em");


--
-- Name: ix_checklist_submissoes_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_checklist_submissoes_lookup" ON "public"."checklist_submissoes" USING "btree" ("operador_id", "maquina_id", "criado_em");


--
-- Name: ix_checklist_submissoes_maquina; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_checklist_submissoes_maquina" ON "public"."checklist_submissoes" USING "btree" ("maquina_id", "criado_em" DESC);


--
-- Name: ix_submissoes_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_submissoes_criado_em" ON "public"."checklist_submissoes" USING "btree" ("criado_em");


--
-- Name: ix_submissoes_email_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_submissoes_email_created" ON "public"."checklist_submissoes" USING "btree" ("lower"("operador_email"), "criado_em");


--
-- Name: ix_submissoes_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_submissoes_email_lower" ON "public"."checklist_submissoes" USING "btree" ("lower"("operador_email"));


--
-- Name: ix_usuarios_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_usuarios_ativo" ON "public"."usuarios" USING "btree" ("ativo");


--
-- Name: uq_causas_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_causas_nome" ON "public"."causas_raiz" USING "btree" ("lower"("nome"));


--
-- Name: uq_chamado_obs_fs; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_chamado_obs_fs" ON "public"."chamado_observacoes" USING "btree" ("fs_id") WHERE ("fs_id" IS NOT NULL);


--
-- Name: uq_chamado_observacoes_fs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_chamado_observacoes_fs_id" ON "public"."chamado_observacoes" USING "btree" ("fs_id");


--
-- Name: uq_chamados_fs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_chamados_fs_id" ON "public"."chamados" USING "btree" ("fs_id");


--
-- Name: uq_maquinas_nome_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_maquinas_nome_ci" ON "public"."maquinas" USING "btree" ("lower"("nome")) WHERE (("nome" IS NOT NULL) AND ("btrim"("nome") <> ''::"text"));


--
-- Name: uq_maquinas_tag_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_maquinas_tag_ci" ON "public"."maquinas" USING "btree" ("lower"("tag")) WHERE (("tag" IS NOT NULL) AND ("btrim"("tag") <> ''::"text"));


--
-- Name: uq_submissao_unica_dia_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_submissao_unica_dia_turno" ON "public"."checklist_submissoes" USING "btree" ("operador_id", "maquina_id", "data_ref", "turno");


--
-- Name: usuarios_role_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "usuarios_role_lower_idx" ON "public"."usuarios" USING "btree" ("lower"("role"));


--
-- Name: ux_chamados_pred_item_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_chamados_pred_item_ativo" ON "public"."chamados" USING "btree" ("maquina_id", "checklist_item_key") WHERE (("tipo" = 'preditiva'::"text") AND ("status" = ANY (ARRAY['Aberto'::"text", 'Em Andamento'::"text"])));


--
-- Name: ux_checklist_submissoes_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_checklist_submissoes_dia" ON "public"."checklist_submissoes" USING "btree" ("operador_id", "maquina_id", "data_ref");


--
-- Name: ux_checklist_submissoes_oper_maquina_data; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_checklist_submissoes_oper_maquina_data" ON "public"."checklist_submissoes" USING "btree" ("operador_id", "maquina_id", "data_ref");


--
-- Name: ux_maquinas_nome_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_maquinas_nome_norm" ON "public"."maquinas" USING "btree" ("lower"(TRIM(BOTH FROM "nome"))) WHERE ("nome" IS NOT NULL);


--
-- Name: ux_maquinas_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_maquinas_tag" ON "public"."maquinas" USING "btree" ("tag");


--
-- Name: ux_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_usuarios_email" ON "public"."usuarios" USING "btree" ("email");


--
-- Name: ux_usuarios_email_plain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_usuarios_email_plain" ON "public"."usuarios" USING "btree" ("email");


--
-- Name: ux_usuarios_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_usuarios_usuario" ON "public"."usuarios" USING "btree" ("usuario");


--
-- Name: chamados tg_chamados_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_chamados_updated" BEFORE UPDATE ON "public"."chamados" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: maquinas tg_maquinas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_maquinas_updated" BEFORE UPDATE ON "public"."maquinas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: movimentacoes tg_movimentacoes_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_movimentacoes_apply" AFTER INSERT ON "public"."movimentacoes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_movimentacoes_apply"();


--
-- Name: pecas tg_pecas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_pecas_updated" BEFORE UPDATE ON "public"."pecas" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at"();


--
-- Name: usuarios tg_usuarios_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_usuarios_updated" BEFORE UPDATE ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: chamados trg_chamados_status_norm; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_chamados_status_norm" BEFORE INSERT OR UPDATE OF "status" ON "public"."chamados" FOR EACH ROW EXECUTE FUNCTION "public"."chamados_status_normalize"();


--
-- Name: agendamentos_preventivos agendamentos_preventivos_maquina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agendamentos_preventivos"
    ADD CONSTRAINT "agendamentos_preventivos_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE CASCADE;


--
-- Name: chamado_eventos chamado_eventos_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_eventos"
    ADD CONSTRAINT "chamado_eventos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id");


--
-- Name: chamado_eventos chamado_eventos_chamado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_eventos"
    ADD CONSTRAINT "chamado_eventos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;


--
-- Name: chamado_observacoes chamado_observacoes_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_observacoes"
    ADD CONSTRAINT "chamado_observacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;


--
-- Name: chamados chamados_criado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;


--
-- Name: chamados_eventos chamados_eventos_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_eventos"
    ADD CONSTRAINT "chamados_eventos_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id");


--
-- Name: chamados_eventos chamados_eventos_chamado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_eventos"
    ADD CONSTRAINT "chamados_eventos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;


--
-- Name: chamados_eventos chamados_eventos_de_manutentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_eventos"
    ADD CONSTRAINT "chamados_eventos_de_manutentor_id_fkey" FOREIGN KEY ("de_manutentor_id") REFERENCES "public"."usuarios"("id");


--
-- Name: chamados_eventos chamados_eventos_para_manutentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados_eventos"
    ADD CONSTRAINT "chamados_eventos_para_manutentor_id_fkey" FOREIGN KEY ("para_manutentor_id") REFERENCES "public"."usuarios"("id");


--
-- Name: chamados chamados_manutentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_manutentor_id_fkey" FOREIGN KEY ("manutentor_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: chamados chamados_responsavel_atual_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_responsavel_atual_id_fkey" FOREIGN KEY ("responsavel_atual_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: checklist_submissoes checklist_submissoes_maquina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes"
    ADD CONSTRAINT "checklist_submissoes_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE CASCADE;


--
-- Name: checklist_submissoes checklist_submissoes_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes"
    ADD CONSTRAINT "checklist_submissoes_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;


--
-- Name: chamados fk_chamados_agendamento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "fk_chamados_agendamento" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos_preventivos"("id") ON DELETE SET NULL;


--
-- Name: chamados fk_chamados_concluido_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "fk_chamados_concluido_por" FOREIGN KEY ("concluido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: chamados fk_chamados_maquina; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "fk_chamados_maquina" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE CASCADE;


--
-- Name: chamado_observacoes fk_obs_chamado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chamado_observacoes"
    ADD CONSTRAINT "fk_obs_chamado" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;


--
-- Name: checklist_submissoes fk_subs_maquina; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."checklist_submissoes"
    ADD CONSTRAINT "fk_subs_maquina" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE CASCADE;


--
-- Name: movimentacoes movimentacoes_peca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."movimentacoes"
    ADD CONSTRAINT "movimentacoes_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE CASCADE;


--
-- Name: movimentacoes movimentacoes_realizado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."movimentacoes"
    ADD CONSTRAINT "movimentacoes_realizado_por_id_fkey" FOREIGN KEY ("realizado_por_id") REFERENCES "public"."usuarios"("id");


--
-- PostgreSQL database dump complete
--

\unrestrict rlUAwfs1W537mdetSMP4QlzzOYORwbBI2oCZxtDQfwj3INd2lDKVFDt9AL5r3IF

