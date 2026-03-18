import { sql } from '../lib/db'

async function checkSchema() {
    try {
        console.log('Checking vehicles table schema...')
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'vehicles'
        `
        console.log('Columns in vehicles table:')
        console.table(columns)
    } catch (error) {
        console.error('Error checking schema:', error)
    }
}

checkSchema()
