import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { query, pool } from '../server/db';

interface AirportRow {
  id: string;
  ident: string;
  type: string;
  name: string;
  latitude_deg: string;
  longitude_deg: string;
  elevation_ft: string;
  continent: string;
  iso_country: string;
  iso_region: string;
  municipality: string;
  scheduled_service: string;
  icao_code: string;
  iata_code: string;
  gps_code: string;
  local_code: string;
  home_link: string;
  wikipedia_link: string;
  keywords: string;
}

async function populateAirports() {
  const csvPath = '/tmp/airports_ourairports.csv';
  
  console.log('Clearing existing airports...');
  await pool.query('DELETE FROM airports');
  
  console.log('Reading CSV file...');
  
  const airports: AirportRow[] = [];
  
  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      quote: '"',
      escape: '"',
    })
  );

  for await (const record of parser) {
    airports.push(record as AirportRow);
  }

  console.log(`Found ${airports.length} total airports in CSV`);

  const largeAndMedium = airports.filter(
    (a) => a.type === 'large_airport' || a.type === 'medium_airport'
  );

  console.log(`Filtering to ${largeAndMedium.length} large and medium airports`);

  const withIata = largeAndMedium.filter((a) => a.iata_code && a.iata_code.length === 3);
  console.log(`${withIata.length} have IATA codes`);

  let inserted = 0;
  const batchSize = 100;
  
  for (let i = 0; i < largeAndMedium.length; i += batchSize) {
    const batch = largeAndMedium.slice(i, i + batchSize);
    
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;
    
    for (const airport of batch) {
      const iata = airport.iata_code || null;
      const icao = airport.icao_code || airport.ident || null;
      const name = airport.name || 'Unknown';
      const type = airport.type || 'unknown';
      const municipality = airport.municipality || null;
      const isoCountry = airport.iso_country || null;
      const lat = airport.latitude_deg ? parseFloat(airport.latitude_deg) : null;
      const lon = airport.longitude_deg ? parseFloat(airport.longitude_deg) : null;
      
      values.push(iata, icao, name, type, municipality, isoCountry, lat, lon);
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`);
      paramIndex += 8;
    }
    
    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO airports (iata_code, icao_code, name, type, municipality, iso_country, latitude, longitude)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        values
      );
      inserted += batch.length;
    }
    
    if (inserted % 500 === 0) {
      console.log(`Inserted ${inserted} airports...`);
    }
  }

  console.log(`\nDone! Inserted ${inserted} airports`);
  
  const countResult = await query(
    `SELECT COUNT(*) as total, COUNT(iata_code) as with_iata FROM airports`
  );
  console.log(`Database now has ${countResult.rows[0].total} airports, ${countResult.rows[0].with_iata} with IATA codes`);

  const perthResult = await query(
    `SELECT iata_code, name, municipality, iso_country FROM airports WHERE name ILIKE '%perth%' OR municipality ILIKE '%perth%'`
  );
  console.log('\nPerth airports:', perthResult.rows);

  await pool.end();
}

populateAirports().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
