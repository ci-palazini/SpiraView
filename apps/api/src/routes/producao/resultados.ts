import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const resultadosRouter: Router = Router();

// GET /producao/resultados?ano=2026&mes=3 - Resultados mensais de produção
resultadosRouter.get(
  '/producao/resultados',
  requirePermission('producao_resultados', 'ver'),
  async (req, res) => {
    try {
      const ano = parseInt(req.query.ano as string, 10);
      const mes = parseInt(req.query.mes as string, 10);

      if (!ano || !mes || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'Informe ano e mes válidos.' });
      }

      const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const ultimoDiaStr = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      // CTE-based query to avoid correlated subqueries
      const { rows } = await pool.query(
        `
        WITH dias AS (
          SELECT d::date AS dia
          FROM generate_series($1::date, $2::date, '1 day'::interval) d
        ),
        lancamentos_agg AS (
          SELECT pl.maquina_id,
                 pl.data_ref,
                 SUM(pl.horas_realizadas) AS horas_realizadas
          FROM producao_lancamentos pl
          WHERE pl.data_ref BETWEEN $1::date AND $2::date
          GROUP BY pl.maquina_id, pl.data_ref
        ),
        maquinas_prod AS (
          SELECT DISTINCT m.id AS maquina_id,
                 COALESCE(m.nome_producao, m.nome) AS maquina_nome,
                 m.setor_producao_id,
                 ps.nome AS setor_nome,
                 ps.ordem AS setor_ordem,
                 m.ordem_producao
          FROM maquinas m
          LEFT JOIN producao_setores ps ON ps.id = m.setor_producao_id
          LEFT JOIN lancamentos_agg la ON la.maquina_id = m.id
          WHERE la.maquina_id IS NOT NULL
        ),
        metas_padrao AS (
          SELECT maquina_id, horas_meta
          FROM producao_metas_padrao
          WHERE ano = $3 AND mes = $4
        ),
        metas_dia AS (
          SELECT maquina_id, data_ref, horas_meta
          FROM producao_metas_dia
          WHERE data_ref BETWEEN $1::date AND $2::date
        )
        SELECT
          mp.maquina_id,
          mp.maquina_nome,
          mp.setor_producao_id,
          mp.setor_nome,
          mp.setor_ordem,
          mp.ordem_producao,
          d.dia,
          COALESCE(la.horas_realizadas, 0) AS horas_realizadas,
          COALESCE(md.horas_meta, mpad.horas_meta) AS horas_meta
        FROM maquinas_prod mp
        CROSS JOIN dias d
        LEFT JOIN lancamentos_agg la ON la.maquina_id = mp.maquina_id AND la.data_ref = d.dia
        LEFT JOIN metas_dia md ON md.maquina_id = mp.maquina_id AND md.data_ref = d.dia
        LEFT JOIN metas_padrao mpad ON mpad.maquina_id = mp.maquina_id
        ORDER BY mp.setor_ordem ASC NULLS LAST, mp.setor_nome ASC NULLS LAST, mp.ordem_producao ASC, mp.maquina_nome ASC, d.dia ASC
        `,
        [primeiroDia, ultimoDiaStr, ano, mes]
      );

      // Aggregate into nested structure: setores -> maquinas -> dias
      interface DiaResult {
        dia: string;
        horasRealizadas: number;
        horasMeta: number | null;
      }

      interface MaquinaResult {
        maquinaId: string;
        maquinaNome: string;
        dias: DiaResult[];
        totalRealizado: number;
        totalMeta: number;
      }

      interface SetorResult {
        setorId: string | null;
        setorNome: string;
        maquinas: MaquinaResult[];
      }

      const setoresMap = new Map<string, SetorResult>();

      for (const row of rows) {
        const setorKey = row.setor_producao_id || '__sem_setor__';
        if (!setoresMap.has(setorKey)) {
          setoresMap.set(setorKey, {
            setorId: row.setor_producao_id || null,
            setorNome: row.setor_nome || 'Sem Setor',
            maquinas: [],
          });
        }
        const setor = setoresMap.get(setorKey)!;
        let maquina = setor.maquinas.find((m) => m.maquinaId === row.maquina_id);
        if (!maquina) {
          maquina = {
            maquinaId: row.maquina_id,
            maquinaNome: row.maquina_nome,
            dias: [],
            totalRealizado: 0,
            totalMeta: 0,
          };
          setor.maquinas.push(maquina);
        }

        const horasRealizadas = Number(row.horas_realizadas) || 0;
        const horasMeta = row.horas_meta != null ? Number(row.horas_meta) : null;

        maquina.dias.push({
          dia: row.dia,
          horasRealizadas,
          horasMeta,
        });
        maquina.totalRealizado += horasRealizadas;
        if (horasMeta != null) maquina.totalMeta += horasMeta;
      }

      const setores = Array.from(setoresMap.values());

      // Generate list of all days in the month
      const diasMes: string[] = [];
      for (let d = 1; d <= ultimoDia; d++) {
        diasMes.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }

      res.json({
        ano,
        mes,
        diasMes,
        setores,
      });
    } catch (e: unknown) {
      logger.error({ err: e }, 'Erro ao buscar resultados de produção');
      res.status(500).json({ error: 'Erro ao buscar resultados.' });
    }
  }
);
