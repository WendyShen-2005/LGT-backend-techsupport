require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const { DateTime } = require('luxon');

// optional SendGrid (Twilio Email) for confirmation messages
const sgMail = require('@sendgrid/mail');
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const EMAIL_SENDER = process.env.EMAIL_SENDER || 'wendys05@my.yorku.ca';
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

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

// POST /api/send-confirmation
// simple wrapper around SendGrid to send an email from the configured sender.
// body should include { to, subject, text, html? }
app.post('/api/send-confirmation', async (req, res) => {
  if (!SENDGRID_API_KEY) {
    return res.status(500).json({ error: 'email service not configured' });
  }

  const { to, subject, text, html } = req.body || {};
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'to, subject and text or html required' });
  }

  const msg = {
    to,
    from: EMAIL_SENDER,
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    res.json({ success: true });
  } catch (err) {
    console.error('SendGrid error', err);
    res.status(500).json({ error: 'failed to send email' });
  }
});

function torontoTimeToUTC(dateKey, timeStr) {
  const dt = DateTime.fromFormat(
    `${dateKey} ${timeStr}`,
    'yyyy-MM-dd H:mm',
    { zone: 'America/Toronto' }
  );

  if (!dt.isValid) {
    throw new Error(`Invalid date/time: ${dateKey} ${timeStr}`);
  }

  return dt.toUTC().toISO();
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
  const { google_meet_link } = req.body || {};
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  if (!google_meet_link || typeof google_meet_link !== 'string') {
    return res.status(400).json({ error: 'google_meet_link is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ensure the form exists
    const { rows: formRows } = await client.query('SELECT * FROM req_forms WHERE id = $1', [id]);
    if (formRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'form not found' });
    }

    // update the availability row tied to this form with the meet link
    const { rows: availRows } = await client.query(
      'SELECT * FROM availability WHERE booking_form_id = $1 LIMIT 1',
      [id]
    );
    if (availRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no availability slot found for this form' });
    }

    await client.query(
      'UPDATE availability SET google_meet_link = $1 WHERE booking_form_id = $2',
      [google_meet_link, id]
    );

    const { rows: updated } = await client.query(
      'UPDATE req_forms SET admin_confirmed = TRUE WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');
    res.json({ success: true, form: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'database error' });
  } finally {
    client.release();
  }
});

// PATCH confirm booking (alias for /api/form/:id/confirm)
app.patch('/api/bookings/:id/confirm', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { google_meet_link } = req.body || {};
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  if (!google_meet_link || typeof google_meet_link !== 'string') {
    return res.status(400).json({ error: 'google_meet_link is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ensure the form exists
    const { rows: formRows } = await client.query('SELECT * FROM req_forms WHERE id = $1', [id]);
    if (formRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'form not found' });
    }

    // update availability with meet link
    const { rows: availRows } = await client.query(
      'SELECT * FROM availability WHERE booking_form_id = $1 LIMIT 1',
      [id]
    );
    if (availRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no availability slot found for this booking' });
    }

    await client.query('UPDATE availability SET google_meet_link = $1 WHERE booking_form_id = $2', [
      google_meet_link,
      id,
    ]);

    const { rows: updated } = await client.query(
      'UPDATE req_forms SET admin_confirmed = TRUE WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');
    res.json({ success: true, booking: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'database error' });
  } finally {
    client.release();
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
   group sessions & bookings endpoints
------------------------------------------------------------------ */

// GET /api/group-sessions
// Returns all group sessions with their details
app.get('/api/group-sessions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM group_sessions ORDER BY date ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/group-bookings
// Returns all group bookings with participant details
app.get('/api/group-bookings', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        gb.id,
        gb.group_id,
        gb.full_name,
        gb.device_type,
        gb.os,
        gb.comfort_level,
        gb.email,
        gb.phone,
        gb.issue_desc,
        gb.allowed,
        gs.date as session_date,
        gs.description as session_description
      FROM group_bookings gb
      LEFT JOIN group_sessions gs ON gs.id = gb.group_id
      ORDER BY gb.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// POST /api/group-bookings
// Submit a new group booking
app.post('/api/group-bookings', async (req, res) => {
  const {
    group_id,
    full_name,
    device_type,
    os,
    comfort_level,
    email,
    phone,
    issue_desc,
    allowed,
  } = req.body || {};

  if (!group_id || !full_name || !email) {
    return res.status(400).json({ error: 'group_id, full_name, and email are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO group_bookings 
        (group_id, full_name, device_type, os, comfort_level, email, phone, issue_desc, allowed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [group_id, full_name, device_type || null, os || null, comfort_level || null, email, phone || null, issue_desc || null, allowed ?? false]
    );
    console.log(rows);
    res.json({ success: true, booking: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create group booking' });
  }
});

// PATCH /api/group-sessions/:id/increment-users
// Increment num_users by 1 for a group session
app.patch('/api/group-sessions/:id/increment-users', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { rows } = await pool.query(
      'UPDATE group_sessions SET num_users = num_users + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'group session not found' });
    res.json({ success: true, session: rows[0] });
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
