# Scheduling App Documentation

This document outlines the architecture and deployment steps for the tech support scheduling application. It covers both backend and frontend components and provides guidance on integrating the backend API into a production frontend.

---

## Backend Overview

The backend is an Express.js server (`server/index.js`) backed by PostgreSQL. It exposes endpoints for managing availability slots and booking requests. The database schema consists of two tables:

- `req_forms` – stores customer request forms and administrative confirmation flags.
- `availability` – stores 30-minute availability slots with optional links to bookings (`booking_form_id`).

### Key Tables

```sql
CREATE TABLE req_forms (
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
  date timestamptz DEFAULT now(),
  admin_confirmed boolean
);

CREATE TABLE availability (
  id serial PRIMARY KEY,
  booking_form_id integer REFERENCES req_forms(id),
  tech_support_admin_name text,
  date timestamptz,
  google_meet_link text
);

CREATE UNIQUE INDEX IF NOT EXISTS availability_admin_date_unique
  ON availability (tech_support_admin_name, date);

CREATE TABLE group_sessions (
  id serial PRIMARY KEY,
  date timestamptz,
  description text,
  max_users integer,
  num_users integer DEFAULT 0,
  google_meet_link text
);

CREATE TABLE group_bookings (
  id serial PRIMARY KEY,
  group_id integer REFERENCES group_sessions(id),
  full_name text,
  device_type text,
  os text,
  comfort_level integer,
  email text,
  phone text,
  issue_desc text,
  allowed boolean DEFAULT false
);
```

### Important Backend Utilities

- `torontoTimeToUTC(dateKey, timeStr)`: converts a Toronto local date/time to UTC ISO string. Used when admins submit availability or when clients book slots.
- `utcToTorontoTime(isoString)` (frontend helper) performs inverse conversion for display.

### API Endpoints

#### Availability

- `GET /api/availability` 
  - Optional query param `tech_support_admin_name` or `adminName`.
  - Returns unbooked slots (array of rows).

- `PATCH /api/availability`
  - Accepts two payload forms:
    1. Legacy bulk: `{ adminName, availability }` where `availability` is `{date: {time: boolean}}`.
    2. New record: `{ booking_form_id, tech_support_admin_name, date }`.
  - Bulk handler converts the map to individual inserts, validates times, dedupes, and uses `ON CONFLICT` to prevent duplicates.
  - Single record handler inserts or updates a slot.

#### Booking Flow

- `POST /api/book` – Reserves an available slot and returns a placeholder `bookingFormId`.
- `POST /api/form-submit` – Creates or updates a `req_forms` record, linking via `bookingId` if provided.

#### Form & Bookings Management

- `GET /api/form/:id` – Retrieve a specific request form.
- `GET /api/bookings` – Return all bookings joined with their availability slot details.
- `PATCH /api/form/:id/confirm` & `PATCH /api/bookings/:id/confirm` – Mark a booking as confirmed. Both endpoints now require a `google_meet_link` property in the request body and will save that link to the availability record associated with the booking.
- `PATCH /api/bookings/:id/reject` – Reject a booking, freeing up the slot and deleting the form.

- `POST /api/send-confirmation` – **optional** email helper that forwards the supplied `to`, `subject`, `text` and/or `html` to the configured Twilio SendGrid account. Requires `SENDGRID_API_KEY` in the environment; sender is controlled by `EMAIL_SENDER`.

#### Group Sessions & Bookings

- `GET /api/group-sessions` – Retrieve all group sessions with their details (date, description, max_users, num_users, google_meet_link).

- `GET /api/group-bookings` – Retrieve all group bookings, joined with their associated group session details.

- `POST /api/group-bookings` – Submit a new group booking. Request body should include:
  ```json
  {
    "group_id": 1,
    "full_name": "John Doe",
    "email": "john@example.com",
    "device_type": "laptop",
    "os": "Windows",
    "comfort_level": 3,
    "phone": "555-1234",
    "issue_desc": "Having trouble with...",
    "allowed": false
  }
  ```
  Required fields: `group_id`, `full_name`, `email`. Others are optional.

- `PATCH /api/group-sessions/:id/increment-users` – Increment the `num_users` count by 1 for a given group session. Used when a participant successfully registers.

---

```bash
cd server
npm install pg
# set DATABASE_URL environment variable (Railway or other Postgres)
node index.js
```

The server listens on port `4000` by default.

### Environment Variables (backend)

- `DATABASE_URL` – PostgreSQL connection string.
- `PORT` – optional port to listen on (defaults to 4000).
- `SENDGRID_API_KEY` – **(optional)** API key for Twilio SendGrid email service. Leave blank during development; the API will reject email requests if unset.
- `EMAIL_SENDER` – sender address used for outgoing confirmation emails. Defaults to `wendys05@my.yorku.ca` if not provided.


---

## Frontend Overview

The frontend is a Create React App project. Key components:

- `AdminAvailabilityUI.jsx` – Allows admins to select future slots by clicking/dragging. Fetches and submits availability to the backend. Uses local conversion helpers to handle Toronto timezone.

- `BookingTest.jsx` and `BookingForm.jsx` – Test booking interface and form for customers. They fetch availability, perform booking, and submit request forms. Time conversions ensure consistency.

- `AdminBookingsUI.jsx` – Admin dashboard displaying booking requests, with ability to accept/reject and view details. Automatically reflects backend changes and presents times in Toronto local time.

### API Integration

- Development proxies are configured via `package.json`:

```json
  "proxy": "http://localhost:4000",
```

This forwards all `/api` requests from `localhost:3000` to the backend.

Service functions in components call endpoints via relative URLs (e.g. `fetch('/api/bookings')`).

### Running the Frontend

```bash
npm install
npm start        # starts React on port 3000
```

Ensure the backend is running concurrently on port 4000.

### Production Integration Steps

1. **Deploy backend** on a capable host (Heroku, Railway, VPS, etc.). Ensure `DATABASE_URL` is configured.
2. **Set environment variable** `REACT_APP_API_URL` pointing to the deployed backend URL (e.g. `https://api.example.com`).
3. Update frontend fetch logic (optionally) to use the environment variable:
   ```js
   const API_BASE = process.env.REACT_APP_API_URL || '';
   const response = await fetch(`${API_BASE}/api/bookings`);
   ```
4. Build the frontend with `npm run build` and serve via static hosting (Netlify, Vercel, etc.).
5. If the frontend and backend share a domain, configure a reverse proxy or CORS accordingly.

### Notes for Production

- **Timezone handling**: All times are stored in UTC. The UI always converts to Toronto time for display.
- **Database migrations**: Changes to schema (e.g., added unique index) should be applied through migration scripts or manual SQL.
- **Security**: Add authentication/authorization around admin endpoints if needed.
- **Error monitoring & logging**: Configure appropriate tools for tracking backend errors.

---

## Additional Tips

- Keep timezone helper logic in a shared utility if both frontend and backend need it.
- Validate payloads on both sides to avoid malformed dates.
- Use React Context or a data-fetching library (SWR/React Query) for more advanced state management.

**Admin UI note:** When confirming a booking, admins must provide a Google Meet link. Please invite the user to the meeting when creating the link so they receive the calendar/email notification from Google; alternatively, use the backend's `POST /api/send-confirmation` to send a custom email notification after confirming.

---

This documentation should help future developers understand and expand the scheduling application, plus guide deployment and integration into a real frontend environment.