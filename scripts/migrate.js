// scripts/migrate.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Import your existing consultant data
let consultantData;
try {
  consultantData = require('../data/consultants.js');
} catch (error) {
  console.log('Could not find consultants.js, using sample data...');
  consultantData = [
    {
      "id": 3,
      "firm": "Abadi Architecture and Accessibility (HUB)",
      "contact": "Marcela Rhoads",
      "email": "marhoads@abadiaccess.com",
      "service": "ADA Review",
      "regions": ["ESC 1", "ESC 2", "Austin Higher Ed"]
    }
  ];
}

const db = new sqlite3.Database('./consultants.db');

console.log('🚀 Starting consultant database migration...');
console.log(`📝 Found ${consultantData.length} consultants to migrate`);

db.serialize(() => {
  console.log('📊 Creating database tables...');

  db.run(`CREATE TABLE IF NOT EXISTS consultants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm TEXT NOT NULL,
    contact TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    service TEXT NOT NULL,
    regions TEXT NOT NULL,
    is_custom BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating table:', err.message);
      return;
    }

    console.log('✅ Database table ready');

    let successCount = 0;
    let errorCount = 0;
    let completed = 0;

    // Clear existing data
    db.run('DELETE FROM consultants', (err) => {
      if (err) console.warn('⚠️ Could not clear existing data:', err.message);

      consultantData.forEach((consultant, index) => {
        const email = consultant.email || `no-email-${consultant.id || index}@placeholder.com`;

        db.run(
          `INSERT INTO consultants 
 (firm, contact, email, phone, service, regions, is_custom) 
 VALUES (?, ?, ?, ?, ?, ?, ?)`,
[
  consultant.firm?.trim() || 'Unknown Firm',
  consultant.contact?.trim() || 'Unknown Contact',
  email.trim(),
  consultant.phone || null,
  consultant.service || 'Unknown',
  JSON.stringify(consultant.regions || []),
  0
],

          function(err) {
            if (err) {
              console.error(`❌ Error inserting ${consultant.firm}:`, err.message);
              errorCount++;
            } else {
              if (index < 3) {
                console.log(`✅ ${index + 1}. ${consultant.firm} (${consultant.contact})`);
              } else if (index === 3) {
                console.log('   ... (continuing migration)');
              }
              successCount++;
            }

            completed++;
            if (completed === consultantData.length) {
              console.log('\n🎉 MIGRATION COMPLETE!');
              console.log(`✅ Successfully migrated: ${successCount} consultants`);
              console.log(`❌ Errors: ${errorCount} consultants`);

              db.get('SELECT COUNT(*) as total FROM consultants', (err, row) => {
                if (!err) {
                  console.log(`📊 Total consultants in database: ${row.total}`);
                }
                console.log('\n🚀 Ready to start the server!');
                console.log('Run: npm run dev');
                db.close();
              });
            }
          }
        );
      });
    });
  });
});
