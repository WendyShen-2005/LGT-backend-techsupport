// simple script to populate availability table with example slots
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sample = [
  { id: 1, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-02-27T13:00:00.000Z' },
  { id: 2, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-02-27T13:00:00.000Z' },
  { id: 3, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-02-27T15:00:00.000Z' },
  { id: 4, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-03-07T13:00:00.000Z' },
  { id: 5, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-03-07T13:00:00.000Z' },
  { id: 6, booking_form_id: null, tech_support_admin_name: 'Alice', date: '2026-03-07T15:00:00.000Z' },
];

(async () => {
  try {
    for (const slot of sample) {
      await pool.query(
        `INSERT INTO availability (booking_form_id, tech_support_admin_name, date)
         VALUES ($1,$2,$3)
         ON CONFLICT (tech_support_admin_name, date) DO NOTHING`,
        [slot.booking_form_id, slot.tech_support_admin_name, slot.date]
      );
    }
    console.log('seeded sample availability');
  } catch (err) {
    console.error('seed error', err);
  } finally {
    pool.end();
  }
})();
