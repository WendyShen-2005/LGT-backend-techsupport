# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

---

## Backend setup (PostgreSQL/Railway)

The server code under `server/` now uses Postgres instead of JSON files.

1. **Install dependencies**
   ```bash
   cd server
   npm install pg
   ```

2. **Database schema**
   Run `server/init-db.sql` on your PostgreSQL instance (Railway provides one)
   to create the two tables: `req_forms` and `availability`.
   The `availability` table now stores a row per 30‑minute slot and uses the
   `tech_support_admin_name` column to identify the admin (previous versions
   keyed slots by a nested JSON object). The `date` column is now `timestamptz`
   so time‑of‑day is preserved; the migration script also adds a unique index
   on `(tech_support_admin_name, date)` to prevent duplicate slots.
   The GET endpoint accepts an optional
   `?tech_support_admin_name=Alice` query parameter so clients can fetch slots
   for a single admin efficiently.

   Optionally use the provided `server/seed.js` script to populate example
   availability slots:
   ```bash
   cd server
   DATABASE_URL=... node seed.js
   ```

3. **Environment**
   Railway automatically sets `DATABASE_URL`; locally you can export it:
   ```bash
   export DATABASE_URL=postgres://user:pass@host:port/dbname
   ```

4. **Start server**
   ```bash
   npm run start:server
   ```

5. **Deployment**
   - Commit the changed code and push to a GitHub repo.
   - Create a Railway project and add the PostgreSQL plugin.
   - Connect the GitHub repo to Railway (or run `railway up`).
   - Railway will build the repo, install `pg`, and start `node server/index.js`.
   - The database plugin provides `DATABASE_URL` automatically.

6. **Testing the API**
   Use `server/test-patch.js`, the new `server/test-booking.js` script, or `curl` to
   exercise the `/api/...` endpoints. The availability PATCH endpoint now
   understands both the legacy bulk format (`adminName` + `availability` map)
   and the preferred new schema (`tech_support_admin_name` + `availability`).

   Note the flow for a booking:
   1. POST `/api/book` with `{adminName,date,time}` to reserve a slot (returns
      `booking.bookingFormId`).
   2. POST `/api/form-submit` with the same `bookingId` plus customer details
      (including new `is_18` and `lgt_member` flags).

   The `req_forms` table schema has been expanded with `os`, `is_18`,
   `lgt_member` and the `date` column is `TIMESTAMPTZ` with a default of now().
