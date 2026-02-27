const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// PostgreSQL connection pool (Railway sets DATABASE_URL automatically)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ------------------------------------------------------------------
   availability endpoints
------------------------------------------------------------------ */

app.get('/', (req, res) => {
  res.send('API is running');
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

// GET all availability records
app.get('/api/availability', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM availability');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/availability  (create new availability/booking record)
app.patch('/api/availability', async (req, res) => {
  const { booking_form_id, tech_support_admin_name, date } = req.body || {};
  if (!booking_form_id || !tech_support_admin_name || !date) {
    return res.status(400).json({ error: 'booking_form_id, tech_support_admin_name and date are required' });
  }

  try {
    const sql = `
      INSERT INTO availability (booking_form_id, tech_support_admin_name, date)
      VALUES ($1,$2,$3)
      RETURNING *`;
    const { rows } = await pool.query(sql, [booking_form_id, tech_support_admin_name, date]);
    res.json({ success: true, record: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to upsert availability' });
  }
});

/* ------------------------------------------------------------------
   form submission endpoints
------------------------------------------------------------------ */

// POST submit a request form
app.post('/api/form-submit', async (req, res) => {
  const {
    full_name, email, phone_num, device_type, os, description,
    tech_comfort, urgency_level, is_18, lgt_member, date,
    admin_confirmed_boolean
  } = req.body || {};

  if (!full_name || !email) {
    return res.status(400).json({ error: 'full_name and email required' });
  }

  const sql = `
    INSERT INTO req_forms
      (full_name,email,phone_num,device_type,os,description,
       tech_comfort,urgency_level,is_18,lgt_member,date,admin_confirmed_boolean)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`;
  const values = [
    full_name, email, phone_num, device_type, os, description,
    tech_comfort || null, urgency_level || null,
    is_18 ?? false, lgt_member ?? false, date || null,
    admin_confirmed_boolean ?? false
  ];

  try {
    const { rows } = await pool.query(sql, values);
    res.json({ success: true, form: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET a form by its id
app.get('/api/form/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query('SELECT * FROM req_forms WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH mark form as confirmed by admin
app.patch('/api/form/:id/confirm', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query(
      'UPDATE req_forms SET admin_confirmed_boolean = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, form: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

/* ------------------------------------------------------------------
   server startup
------------------------------------------------------------------ */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Availability API listening on port ${PORT}`);
});
