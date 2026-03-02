// simple test to call /api/book then /api/form-submit

async function run() {
  const base = 'http://localhost:4000';
  // choose slot
  const bookRes = await fetch(base + '/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminName: 'Alice', date: '2026-02-27', time: '13:00' }),
  });
  console.log('book status', bookRes.status);
  const bookJson = await bookRes.json();
  console.log('book json', bookJson);
  if (!bookRes.ok) return;
  const bookingId = bookJson.booking.bookingFormId;

  const formRes = await fetch(base + '/api/form-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId,
      full_name: 'Test User',
      email: 'test@example.com',
      phone_num: '123',
      issueDescription: 'Test',
      device_type: 'desktop',
      os: 'Linux',
      urgency_level: 'low',
      is_18: true,
      lgt_member: false,
    }),
  });
  console.log('form status', formRes.status);
  const formJson = await formRes.json();
  console.log('form json', formJson);

  // optionally send a confirmation email if the endpoint is reachable
  if (formRes.ok) {
    const emailRes = await fetch(base + '/api/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'test-recipient@example.com',
        subject: 'Booking received',
        text: 'Your booking was successfully recorded.',
      }),
    });
    console.log('email status', emailRes.status);
    try {
      console.log('email json', await emailRes.json());
    } catch (e) {
      console.log('email response not JSON');
    }
  }
}

run().catch(console.error);
