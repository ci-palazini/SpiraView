
import { pool } from './src/db';

async function getViews() {
    try {
        const v1 = await pool.query("SELECT pg_get_viewdef('v_producao_rendimento', true) as def");
        console.log('--- v_producao_rendimento ---');
        console.log(v1.rows[0]?.def);

        const v2 = await pool.query("SELECT pg_get_viewdef('v_producao_resumo_diario', true) as def");
        console.log('--- v_producao_resumo_diario ---');
        console.log(v2.rows[0]?.def);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

getViews();
