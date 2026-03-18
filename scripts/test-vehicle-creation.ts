import { sql } from '../lib/db'

async function tryCreateVehicle() {
    try {
        console.log('Attempting to create a test vehicle...')
        // We need a valid company_id. Let's find one.
        const companies = await sql`SELECT id FROM companies LIMIT 1`
        if (companies.length === 0) {
            console.log('No company found. Creating one...')
            const newCompany = await sql`INSERT INTO companies (name, slug) VALUES ('Test Co', 'test-co') RETURNING id`
            companies.push(newCompany[0])
        }

        const companyId = companies[0].id

        const result = await sql`
            INSERT INTO vehicles (
                company_id, name, plate_number, vehicle_type,
                capacity_cases, driver_name, driver_phone
            ) VALUES (
                ${companyId}, 'Test Vehicle', 'TEST-1234', 'truck',
                100, 'Test Driver', '0102030405'
            )
            RETURNING *
        `
        console.log('Vehicle created successfully:', result[0])
    } catch (error) {
        console.error('FAILED to create vehicle:', error)
    }
}

tryCreateVehicle()
