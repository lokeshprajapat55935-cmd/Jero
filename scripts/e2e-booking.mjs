const BASE_URL = 'http://localhost:3000';
let clientCookies = [];
let workerCookies = [];

function parseCookies(response, currentCookies) {
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  if (setCookies && setCookies.length > 0) {
    const newCookies = setCookies.map(c => c.split(';')[0]);
    // Merge
    newCookies.forEach(newC => {
      const name = newC.split('=')[0];
      const idx = currentCookies.findIndex(c => c.startsWith(name + '='));
      if (idx !== -1) {
        currentCookies[idx] = newC;
      } else {
        currentCookies.push(newC);
      }
    });
  }
}

async function apiCall(endpoint, method, body, cookiesArray) {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': cookiesArray.join('; ')
  };
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  
  parseCookies(res, cookiesArray);
  
  let data;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  
  return { status: res.status, data, res };
}

async function run() {
  console.log('--- STARTING E2E BOOKING ---');

  clientCookies = ['zolvo_customer_uid=9b3b6537-a9aa-46f1-bbe3-7443c7d566dd'];
  workerCookies = ['zolvo_worker_uid=3affb9c5-e841-4e09-96e3-3ff6cc763b09'];

  // 1. Client Create Booking
  console.log('\\n[CLIENT] Creating Booking...');
  const bookingPayload = {
    category: 'Electrician',
    description: 'Fix the fan',
    location_address: '123 Test St, Test City',
    payment_method: 'cash',
    booking_type: 'asap'
  };
  let res = await apiCall('/api/bookings', 'POST', bookingPayload, clientCookies);
  console.log(res.status, res.data);
  const bookingId = res.data?.data?.id;

  if (!bookingId) {
    console.error('Failed to create booking.');
    process.exit(1);
  }

  // 2. Worker Accept Booking
  console.log('\\n[WORKER] Accepting Booking...', bookingId);
  res = await apiCall('/api/bookings/accept', 'POST', { booking_id: bookingId }, workerCookies);
  console.log(res.status, res.data);

  // 5. Worker Arrives
  console.log('\\n[WORKER] Transition to worker_arriving...');
  res = await apiCall(`/api/bookings?id=${bookingId}`, 'PATCH', { status: 'worker_arriving' }, workerCookies);
  console.log(res.status, res.data);

  // 6. Worker Starts Work
  console.log('\\n[WORKER] Transition to work_started...');
  res = await apiCall(`/api/bookings?id=${bookingId}`, 'PATCH', { status: 'work_started' }, workerCookies);
  console.log(res.status, res.data);

  // 7. Worker Adds Materials (Skip if not strictly necessary, or hit the endpoint)
  // 8. Worker Completes Work
  console.log('\\n[WORKER] Transition to work_completed_pending_otp...');
  res = await apiCall(`/api/bookings?id=${bookingId}`, 'PATCH', { status: 'work_completed_pending_otp' }, workerCookies);
  console.log(res.status, res.data);

  // Get the OTP generated
  console.log('\\n[CLIENT] Fetching Booking to get OTP...');
  res = await apiCall(`/api/bookings?id=${bookingId}`, 'GET', null, clientCookies);
  const otpCode = res.data?.data?.otp_code;
  console.log('Got OTP:', otpCode);

  // 9. Client Verifies OTP
  console.log('\\n[CLIENT] Verifying OTP...');
  res = await apiCall('/api/bookings/verify-otp', 'POST', { booking_id: bookingId, otp_code: otpCode }, clientCookies);
  console.log(res.status, res.data);

  // 10. Worker Marks Completed/Paid
  console.log('\\n[WORKER] Transition to completed...');
  res = await apiCall(`/api/bookings?id=${bookingId}`, 'PATCH', { status: 'completed' }, workerCookies);
  console.log(res.status, res.data);

  console.log('\\n--- E2E FINISHED ---');
}

run();
