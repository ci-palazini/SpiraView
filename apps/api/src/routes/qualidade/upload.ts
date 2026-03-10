import { Router } from 'express';
import { pool, withTx } from '../../db';
import { logger } from '../../logger';
import { requirePermission } from '../../middlewares/requirePermission';

export const uploadRouter: Router = Router();

/**
 * POST /qualidade/refugos/upload
 * Recebe array de refugos já parseados do Excel
 */
uploadRouter.post('/qualidade/refugos/upload', requirePermission('qualidade_lancamento', 'editar'), async (req, res) => {
    try {
        const { items } = req.body;
        const auth = (req as any).user || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nenhum item para importar.' });
        }

        const resultados = {
            sucesso: 0,
            ignorado: 0,
            erro: 0,
            erros: [] as string[]
        };

        await withTx(async (client) => {
            // 1. Pre-validation and Normalization
            const validItems: any[] = [];

            // Extract distinct dates to minimize DB lookup scope
            const distinctDates = new Set<string>();

            for (const [index, item] of items.entries()) {
                const imagemRow = index + 2; // Excel row approximation
                const origemValue = item.origem || item.setor;

                const missingFields = [];
                if (!item.data_ocorrencia) missingFields.push('Data');
                if (!item.codigo_item) missingFields.push('Código Item');
                if (!item.quantidade) missingFields.push('Quantidade');
                if (!origemValue) missingFields.push('Origem');

                if (missingFields.length > 0) {
                    resultados.erro++;
                    resultados.erros.push(`Linha ${imagemRow}: Faltando campos: ${missingFields.join(', ')}.`);
                    continue;
                }

                // Normalizing for comparison
                const referencia = item.origem_referencia || '';
                const isQuarentena = referencia.toLowerCase().includes('quarentena') ||
                    (item.origem && String(item.origem).toLowerCase().includes('quarentena'));

                const normalizedItem = {
                    ...item,
                    origem: origemValue,
                    origem_referencia: referencia,
                    tipo_lancamento: isQuarentena ? 'QUARENTENA' : 'REFUGO',
                    motivo_defeito: item.motivo_defeito || 'OUTROS',
                    quantidade: Number(item.quantidade),
                    custo: Number(item.custo) || 0,
                    row_index: imagemRow
                };

                validItems.push(normalizedItem);
                distinctDates.add(normalizedItem.data_ocorrencia);
            }

            if (validItems.length === 0) {
                return; // Everything failed validation
            }

            // 2. Deduplication Strategy
            // Fetch existing records for checking duplicates (only for the dates involved)
            const datesArray = Array.from(distinctDates);
            const existingRes = await client.query(
                `SELECT data_ocorrencia, origem, codigo_item, quantidade, motivo_defeito, numero_ncr 
                 FROM qualidade_refugos 
                 WHERE data_ocorrencia = ANY($1::date[])`,
                [datesArray]
            );

            // Create a set of "fingerprints" for existing records
            const existingSet = new Set<string>();
            existingRes.rows.forEach((row: any) => {
                // Ensure date format matches (taking first 10 chars usually YYYY-MM-DD)
                const d = row.data_ocorrencia instanceof Date
                    ? row.data_ocorrencia.toISOString().split('T')[0]
                    : String(row.data_ocorrencia).split('T')[0];

                // Fingerprint: DATE|ORIGIN|ITEM|QTY|REASON|NCR
                const key = `${d}|${row.origem}|${row.codigo_item}|${Number(row.quantidade)}|${row.motivo_defeito}|${row.numero_ncr || ''}`;
                existingSet.add(key.toUpperCase());
            });

            // Filter out duplicates
            const toInsert: any[] = [];
            for (const item of validItems) {
                const d = item.data_ocorrencia.split('T')[0];
                const key = `${d}|${item.origem}|${item.codigo_item}|${item.quantidade}|${item.motivo_defeito}|${item.numero_ncr || ''}`;

                if (existingSet.has(key.toUpperCase())) {
                    resultados.ignorado++;
                } else {
                    toInsert.push(item);
                }
            }

            // 3. Batch Insertion
            if (toInsert.length > 0) {
                const chunkSize = 500; // Safe chunk size
                for (let i = 0; i < toInsert.length; i += chunkSize) {
                    const chunk = toInsert.slice(i, i + chunkSize);

                    const values: any[] = [];
                    const placeHolders: string[] = [];
                    let paramIdx = 1;

                    for (const row of chunk) {
                        // ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        placeHolders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11})`);

                        values.push(
                            row.data_ocorrencia,
                            row.origem,
                            row.origem_referencia || '', // Fixed: NOT NULL constraint
                            row.numero_ncr || null,
                            row.codigo_item,
                            row.descricao_item || '', // Fixed: NOT NULL constraint
                            row.motivo_defeito,
                            row.quantidade,
                            row.custo,
                            row.responsavel_nome || null,
                            auth.id || null,
                            row.tipo_lancamento || 'REFUGO'
                        );
                        paramIdx += 12;
                    }

                    const query = `
                        INSERT INTO qualidade_refugos 
                        (data_ocorrencia, origem, origem_referencia, numero_ncr, codigo_item, descricao_item, 
                         motivo_defeito, quantidade, custo, responsavel_nome, criado_por_id, tipo_lancamento)
                        VALUES ${placeHolders.join(', ')}
                    `;

                    await client.query(query, values);
                }
                resultados.sucesso = toInsert.length;
            }
        });

        res.json({
            ok: true,
            summary: resultados
        });

    } catch (error: any) {
        logger.error({ err: error }, 'Erro no upload de qualidade:');
        res.status(500).json({ error: 'Erro interno ao processar upload.' });
    }
});
