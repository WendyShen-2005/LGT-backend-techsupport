const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

require('dotenv').config();

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
// Only enable SSL when the connection string does not appear to target
// localhost. Railway and many cloud providers require SSL, but a local
// Postgres instance usually does not support it.
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

const shouldUseSsl = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost');
if (shouldUseSsl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

/* ------------------------------------------------------------------
   availability endpoints
------------------------------------------------------------------ */

app.get('/', (req, res) => {
  res.send('API is running');
});

// Helper: convert a date string (YYYY-MM-DD) and time string (H:MM)
// interpreted as Toronto local time to a UTC ISO string.
function torontoTimeToUTC(dateKey, timeStr) {
  if (!dateKey || !timeStr) {
    throw new Error(`Missing dateKey or timeStr: ${dateKey} ${timeStr}`);
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    throw new Error(`Invalid date/time: ${dateKey} ${timeStr}`);
  }

  // Start with a guess: assume the input time is UTC (it won't be, but we'll adjust)
  let guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const torontoFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Iterate to converge: adjust guessUTC until formatting it in Toronto
  // timezone produces the desired date/time
  for (let i = 0; i < 30; i++) {
    const parts = torontoFormatter.formatToParts(guessUTC);
    const timeObj = {};
    parts.forEach(({ type, value }) => {
      if (['year', 'month', 'day', 'hour', 'minute'].includes(type)) {
        timeObj[type] = parseInt(value, 10);
      }
    });

    // Check if we've converged to the target
    if (
      timeObj.year === year &&
      timeObj.month === month &&
      timeObj.day === day &&
      timeObj.hour === hour &&
      timeObj.minute === minute
    ) {
      return guessUTC.toISOString();
    }

    // Calculate adjustment needed
    // How many minutes off is the current guess?
    let adjustMinutes = 0;

    // Handle date differences
    if (timeObj.year !== year) {
      adjustMinutes += (year - timeObj.year) * 365 * 24 * 60;
    }
    if (timeObj.month !== month) {
      adjustMinutes += (month - timeObj.month) * 30 * 24 * 60;
    }
    if (timeObj.day !== day) {
      adjustMinutes += (day - timeObj.day) * 24 * 60;
    }

    // Handle time differences
    adjustMinutes += (hour - timeObj.hour) * 60;
    adjustMinutes += minute - timeObj.minute;

    // Adjust the guess
    guessUTC = new Date(guessUTC.getTime() + adjustMinutes * 60 * 1000);
  }

  throw new Error(`Failed to converge on UTC time for ${dateKey} ${timeStr}`);
}

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

// GET availability records (only unbooked slots).
// if a tech_support_admin_name (or adminName for backwards compatibility)
// query parameter is supplied, filter to that admin only. the client
// passes the selected admin so the UI can display only the relevant slots.
app.get('/api/availability', async (req, res) => {
  try {
    const adminParam = req.query.tech_support_admin_name || req.query.adminName;
    let queryText = 'SELECT * FROM availability WHERE booking_form_id IS NULL';
    const values = [];
    if (adminParam) {
      queryText += ' AND tech_support_admin_name = $1';
      values.push(adminParam);
    }
    queryText += ' ORDER BY date';
    const { rows } = await pool.query(queryText, values);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/availability
// Supports two formats:
// 1. legacy bulk availability (adminName + availability object) used by the UI
// 2. new single-slot record { booking_form_id, tech_support_admin_name, date }
app.patch('/api/availability', async (req, res) => {
  const {
    booking_form_id,
    tech_support_admin_name,
    date,
    adminName,
    availability,
  } = req.body || {};

  // payload may come in legacy form (adminName) or new form
  // (tech_support_admin_name). prefer the latter but fall back for older
  // clients.
  const adminKey = tech_support_admin_name || adminName;

  if (adminKey && typeof availability === 'object') {
    // legacy/bulk payload: convert to individual inserts. we validate the
    // time strings before attempting to build a Date; invalid entries are
    // silently skipped. duplicates in the incoming data are deduped locally
    // and the database has a unique constraint to guard against repeat
    // inserts from separate requests.
    const inserts = [];
    const seen = new Set();

    Object.entries(availability).forEach(([dateKey, timesObj]) => {
      Object.keys(timesObj || {}).forEach((t) => {
        if (!timesObj[t]) return; // only care about truthy/available slots
        if (!/^[0-9]{1,2}:[0-9]{2}$/.test(t)) return;

        // interpret dateKey and t as Toronto local time, convert to UTC ISO
        const iso = torontoTimeToUTC(dateKey, t);

        const key = `${adminKey}|${iso}`;
        if (seen.has(key)) return;
        seen.add(key);
        inserts.push([null, adminKey, iso]);
      });
    });

    if (inserts.length === 0) {
      return res.status(400).json({ error: 'no slots to insert' });
    }

    try {
      // perform a batch insert; use ON CONFLICT DO NOTHING so that existing
      // rows (due to prior submissions) don't cause errors or duplicates.
      const valuesSql = inserts.map((_, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(',');
      const flat = inserts.flat();
      const sql = `INSERT INTO availability (booking_form_id, tech_support_admin_name, date) VALUES ${valuesSql} ON CONFLICT (tech_support_admin_name, date) DO NOTHING RETURNING *`;
      const { rows } = await pool.query(sql, flat);
      return res.json({ success: true, inserted: rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'failed to insert availability batch' });
    }
  }

  // new single record path
  if (!booking_form_id || !tech_support_admin_name || !date) {
    return res.status(400).json({ error: 'booking_form_id, tech_support_admin_name and date are required' });
  }

  try {
    // avoid creating duplicates at the DB level; if a row already exists we
    // simply update its booking_form_id (or leave it unchanged) so callers can
    // safely retry the same payload without producing multiple slots.
    const sql = `
      INSERT INTO availability (booking_form_id, tech_support_admin_name, date)
      VALUES ($1,$2,$3)
      ON CONFLICT (tech_support_admin_name, date)
      DO UPDATE SET booking_form_id = EXCLUDED.booking_form_id
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

// POST set aside a slot (booking) and create an empty form row
app.post('/api/book', async (req, res) => {
  const { adminName, date, time } = req.body || {};
  if (!adminName || !date || !time) {
    return res.status(400).json({ error: 'adminName, date and time are required' });
  }

  // interpret date and time as Toronto local time, convert to UTC ISO
  const iso = torontoTimeToUTC(date, time);

  try {
    const client = await pool.connect();
    try {
      // find an available slot
      const { rows } = await client.query(
        'SELECT * FROM availability WHERE tech_support_admin_name=$1 AND date=$2 AND booking_form_id IS NULL',
        [adminName, iso]
      );
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Requested time not available' });
      }
      const slot = rows[0];

      // create placeholder form record
      const { rows: fr } = await client.query('INSERT INTO req_forms DEFAULT VALUES RETURNING id');
      const formId = fr[0].id;

      // link the availability row
      await client.query('UPDATE availability SET booking_form_id=$1 WHERE id=$2', [formId, slot.id]);

      const booking = {
        id: slot.id,
        bookingFormId: formId,
        adminName,
        date,
        time,
        adminConfirmed: false,
        booked: true,
        createdAt: new Date().toISOString(),
      };
      return res.json({ success: true, booking });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// POST submit or update a request form
app.post('/api/form-submit', async (req, res) => {
  let {
    bookingId,
    full_name, name,
    email,
    phone_num, phone,
    device_type,
    os,
    description,
    tech_comfort,
    urgency_level,
    is_18,
    lgt_member,
    date,
    admin_confirmed,
  } = req.body || {};

  // normalize alternate property names
  const finalName = full_name || name;
  const finalPhone = phone_num || phone;
  const finalDescription = description || req.body.issueDescription;

  if (!finalName || !email) {
    return res.status(400).json({ error: 'name and email required' });
  }

  // if a bookingId is provided we should update the existing placeholder
  // record that was created during /api/book. otherwise just insert a new
  // row as before.
  if (bookingId != null) {
    const id = parseInt(bookingId, 10);
    if (!Number.isNaN(id)) {
      const updateSql = `
        UPDATE req_forms
           SET full_name=$1,
               email=$2,
               phone_num=$3,
               device_type=$4,
               os=$5,
               description=$6,
               tech_comfort=$7,
               urgency_level=$8,
               is_18=$9,
               lgt_member=$10,
               date=$11,
               admin_confirmed=$12
         WHERE id=$13
         RETURNING *`;
      const updateValues = [
        finalName,
        email,
        finalPhone,
        device_type,
        os,
        finalDescription,
        tech_comfort || null,
        urgency_level || null,
        is_18 ?? false,
        lgt_member ?? false,
        date || new Date().toISOString(),
        admin_confirmed ?? false,
        id,
      ];

      try {
        const { rows } = await pool.query(updateSql, updateValues);
        if (rows.length === 0) {
          return res.status(404).json({ error: 'bookingId not found' });
        }
        return res.json({ success: true, form: rows[0] });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'database error' });
      }
    }
    // if bookingId was provided but invalid fall through to insert path
  }

  // no valid bookingId -> simple insert
  const insertSql = `
    INSERT INTO req_forms
      (full_name,email,phone_num,device_type,os,description,
       tech_comfort,urgency_level,is_18,lgt_member,date,admin_confirmed)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`;
  const insertValues = [
    finalName,
    email,
    finalPhone,
    device_type,
    os,
    finalDescription,
    tech_comfort || null,
    urgency_level || null,
    is_18 ?? false,
    lgt_member ?? false,
    date || new Date().toISOString(),
    admin_confirmed ?? false,
  ];

  try {
    const { rows } = await pool.query(insertSql, insertValues);
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

// GET all bookings: req_forms with associated availability slots
// Returns form data plus the booked slot details (admin name, date)
app.get('/api/bookings', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        f.id,
        f.full_name,
        f.email,
        f.phone_num,
        f.device_type,
        f.os,
        f.description,
        f.tech_comfort,
        f.urgency_level,
        f.is_18,
        f.lgt_member,
        f.date,
        f.admin_confirmed,
        a.tech_support_admin_name,
        a.date as slot_date
      FROM req_forms f
      LEFT JOIN availability a ON a.booking_form_id = f.id
      ORDER BY f.date DESC
    `);
    res.json(rows);
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
      'UPDATE req_forms SET admin_confirmed = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, form: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH confirm booking (alias for /api/form/:id/confirm)
app.patch('/api/bookings/:id/confirm', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query(
      'UPDATE req_forms SET admin_confirmed = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, booking: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH reject booking: clear the booking_form_id from availability to free up the slot
app.patch('/api/bookings/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const client = await pool.connect();
    try {
      // Clear the booking from availability (makes the slot available again)
      await client.query('UPDATE availability SET booking_form_id = NULL WHERE booking_form_id = $1', [id]);

      // Delete the form
      const { rows } = await client.query('DELETE FROM req_forms WHERE id = $1 RETURNING *', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });

      res.json({ success: true, message: 'Booking rejected and slot freed' });
    } finally {
      client.release();
    }
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
