const http = require('http');

// create a simple availability record with required fields
const data = JSON.stringify({
  booking_form_id: 123,
  tech_support_admin_name: 'Alice',
  date: '2026-03-02'
});

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/availability',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => console.error('ERROR:', e));
req.write(data);
req.end();
