const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function importAirports() {
  const csvPath = '/tmp/airports_ourairports.csv';
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  console.log('Clearing existing airports...');
  await pool.query('DELETE FROM airports');
  
  console.log('Parsing CSV...');
  const airports = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = [];
    let inQuotes = false;
    let current = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    
    if (row.type !== 'large_airport' && row.type !== 'medium_airport') {
      continue;
    }
    
    const iata = row.iata_code?.trim() || null;
    const icao = row.icao_code?.trim() || row.ident?.trim() || null;
    
    if (!iata && !icao) continue;
    
    airports.push({
      iata: iata || null,
      icao: icao || null,
      name: row.name?.trim() || 'Unknown',
      type: row.type?.trim() || 'unknown',
      municipality: row.municipality?.trim() || null,
      iso_country: row.iso_country?.trim() || null,
      lat: row.latitude_deg ? parseFloat(row.latitude_deg) : null,
      lon: row.longitude_deg ? parseFloat(row.longitude_deg) : null,
    });
  }
  
  console.log(`Found ${airports.length} airports to insert`);
  
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < airports.length; i += batchSize) {
    const batch = airports.slice(i, i + batchSize);
    
    const values = [];
    const placeholders = [];
    let paramIdx = 1;
    
    for (const airport of batch) {
      values.push(
        airport.iata, airport.icao, airport.name, airport.type,
        airport.municipality, airport.iso_country, airport.lat, airport.lon
      );
      placeholders.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7})`);
      paramIdx += 8;
    }
    
    await pool.query(
      `INSERT INTO airports (iata_code, icao_code, name, type, municipality, iso_country, latitude, longitude)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    
    inserted += batch.length;
    if (inserted % 500 === 0) {
      console.log(`Inserted ${inserted} airports...`);
    }
  }
  
  console.log(`Done! Inserted ${inserted} airports`);
  
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*) as total, COUNT(iata_code) as with_iata FROM airports'
  );
  console.log(`Database: ${countRows[0].total} airports, ${countRows[0].with_iata} with IATA codes`);
  
  const { rows: perthRows } = await pool.query(
    `SELECT iata_code, name, municipality, iso_country FROM airports 
     WHERE name ILIKE '%perth%' OR municipality ILIKE '%perth%'`
  );
  console.log('Perth airports:', perthRows);
  
  await pool.end();
}

importAirports().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
