// apps/api/src/routes/qualidade/whereBuilders.ts
// Utilitário compartilhado para construção de WHERE clauses em queries de qualidade_refugos.
// Centraliza a lógica duplicada entre analytics, compare, individual e refugos.

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (esperado YYYY-MM-DD)');
const multiString = z.union([z.string(), z.array(z.string())]);

/** Schema Zod para os filtros comuns das rotas de qualidade. */
export const qualidadeFiltrosSchema = z.object({
    dataInicio: isoDate.optional(),
    dataFim: isoDate.optional(),
    origem: multiString.optional(),
    responsavel: multiString.optional(),
    tipo: z.enum(['INTERNO', 'EXTERNO']).optional(),
    tipoLancamento: z.string().optional(),
}).passthrough();

/** Schema para a rota de comparação — requer 4 datas obrigatórias. */
export const compareQuerySchema = qualidadeFiltrosSchema.extend({
    dataInicioA: isoDate,
    dataFimA: isoDate,
    dataInicioB: isoDate,
    dataFimB: isoDate,
});

export type QualidadeFiltros = z.infer<typeof qualidadeFiltrosSchema>;
export type CompareQuery = z.infer<typeof compareQuerySchema>;

export interface QualidadeWhereFilters {
    dataInicio?: string;
    dataFim?: string;
    origem?: string | string[];
    responsavel?: string | string[];
    tipo?: string;
    tipoLancamento?: string;
}

export interface QualidadeWhereBuildOptions {
    /** Prefixo de alias de tabela, ex: 'qr' → 'qr.data_ocorrencia'. Default: sem prefixo. */
    tableAlias?: string;
}

/**
 * Constrói a cláusula WHERE parametrizada para queries em `qualidade_refugos`.
 *
 * @param sqlParams - Array de parâmetros posicionais do pg ($1, $2, ...). Modificado in-place.
 * @param filters   - Filtros a aplicar.
 * @param options   - Opções de construção (ex: alias de tabela).
 * @returns String WHERE começando com '1=1'.
 */
export function buildQualidadeWhere(
    sqlParams: unknown[],
    filters: QualidadeWhereFilters,
    options: QualidadeWhereBuildOptions = {}
): string {
    const prefix = options.tableAlias ? `${options.tableAlias}.` : '';
    const { dataInicio, dataFim, origem, responsavel, tipo, tipoLancamento } = filters;

    let where = '1=1';

    if (dataInicio) {
        sqlParams.push(dataInicio);
        where += ` AND ${prefix}data_ocorrencia >= $${sqlParams.length}`;
    }
    if (dataFim) {
        sqlParams.push(dataFim);
        where += ` AND ${prefix}data_ocorrencia <= $${sqlParams.length}`;
    }
    if (origem) {
        if (Array.isArray(origem)) {
            sqlParams.push(origem);
            where += ` AND ${prefix}origem = ANY($${sqlParams.length})`;
        } else {
            sqlParams.push(origem);
            where += ` AND ${prefix}origem = $${sqlParams.length}`;
        }
    }
    if (responsavel) {
        if (Array.isArray(responsavel)) {
            sqlParams.push(responsavel);
            where += ` AND ${prefix}responsavel_nome = ANY($${sqlParams.length})`;
        } else {
            sqlParams.push(responsavel);
            where += ` AND ${prefix}responsavel_nome = $${sqlParams.length}`;
        }
    }
    if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
        sqlParams.push(tipo);
        where += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = ${prefix}origem AND qo.tipo = $${sqlParams.length})`;
    }
    if (tipoLancamento) {
        sqlParams.push(tipoLancamento);
        where += ` AND ${prefix}tipo_lancamento = $${sqlParams.length}`;
    }

    return where;
}
