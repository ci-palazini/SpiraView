import { Router } from 'express';
import { pool, withTx } from '../../db';

export const uploadRouter: Router = Router();

/**
 * POST /qualidade/refugos/upload
 * Recebe array de refugos já parseados do Excel
 */
uploadRouter.post('/qualidade/refugos/upload', async (req, res) => {
    try {
        const { items } = req.body;
        const auth = (req as any).user || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nenhum item para importar.' });
        }

        const resultados = {
            sucesso: 0,
            erro: 0,
            erros: [] as string[]
        };

        await withTx(async (client) => {
            for (const [index, item] of items.entries()) {
                // Validação básica
                // Se item.setor ainda existir no excel, mapeamos para item.origem?
                // O usuário pediu para "trocar tudo que voce trata hoje como 'setor' por 'origem'".
                // Assumindo que o Excel também terá coluna Origem ou que o front mapeia.
                // Vou verificar item.origem, e fallback para item.setor se necessário, mas o foco é Origem.

                const origemValue = item.origem || item.setor; // Fallback para compatibilidade temporária se o Excel n mudar

                const missingFields = [];
                if (!item.data_ocorrencia) missingFields.push('Data');
                if (!item.codigo_item) missingFields.push('Código Item');
                if (!item.quantidade) missingFields.push('Quantidade');
                if (!origemValue) missingFields.push('Origem');

                if (missingFields.length > 0) {
                    resultados.erro++;
                    resultados.erros.push(`Linha ${index + 1}: Faltando campos obrigatórios: ${missingFields.join(', ')}.`);
                    continue;
                }

                try {
                    await client.query(
                        `INSERT INTO qualidade_refugos 
                        (data_ocorrencia, origem, origem_referencia, numero_ncr, codigo_item, descricao_item, 
                         motivo_defeito, quantidade, custo, responsavel_nome, criado_por_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                        [
                            item.data_ocorrencia,
                            origemValue,
                            item.origem_referencia || null,
                            item.numero_ncr || null,
                            item.codigo_item,
                            item.descricao_item || null,
                            item.motivo_defeito || 'OUTROS',
                            Number(item.quantidade),
                            Number(item.custo) || 0,
                            item.responsavel_nome || null,
                            auth.id || null
                        ]
                    );
                    resultados.sucesso++;
                } catch (err: any) {
                    resultados.erro++;
                    resultados.erros.push(`Linha ${index + 1}: Erro ao inserir - ${err.message}`);
                }
            }
        });

        res.json({
            ok: true,
            summary: resultados
        });

    } catch (error: any) {
        console.error('Erro no upload de qualidade:', error);
        res.status(500).json({ error: 'Erro interno ao processar upload.' });
    }
});
