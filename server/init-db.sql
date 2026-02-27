-- run this once against your PostgreSQL database

CREATE TABLE IF NOT EXISTS req_forms (
  id serial PRIMARY KEY,
  full_name text,
  email text,
  phone_num text,
  device_type text,
  os text,
  description text,
  tech_comfort integer,
  urgency_level text,
  is_18 boolean,
  lgt_member boolean,
  date date,
  admin_confirmed_boolean boolean
);

CREATE TABLE IF NOT EXISTS availability (
  id serial PRIMARY KEY,
  booking_form_id integer REFERENCES req_forms(id),
  tech_support_admin_name text,
  date date
);
