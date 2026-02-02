
import { pool } from '../db';

async function migrate() {
    console.log('Starting migration...');
    const client = await pool.connect();
    try {
        console.log('Adding column tipo_lancamento...');
        await client.query(`
            ALTER TABLE qualidade_refugos 
            ADD COLUMN IF NOT EXISTS tipo_lancamento VARCHAR(50) DEFAULT 'REFUGO';
        `);

        console.log('Backfilling QUARENTENA data...');
        const resQuarentena = await client.query(`
            UPDATE qualidade_refugos 
            SET tipo_lancamento = 'QUARENTENA' 
            WHERE origem_referencia ILIKE '%QUARENTENA%' 
              AND (tipo_lancamento IS NULL OR tipo_lancamento != 'QUARENTENA');
        `);
        console.log(`Updated ${resQuarentena.rowCount} rows to QUARENTENA.`);

        console.log('Backfilling REFUGO data...');
        const resRefugo = await client.query(`
            UPDATE qualidade_refugos 
            SET tipo_lancamento = 'REFUGO' 
            WHERE (tipo_lancamento IS NULL OR tipo_lancamento != 'QUARENTENA');
        `);
        console.log(`Updated ${resRefugo.rowCount} rows to REFUGO.`);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
