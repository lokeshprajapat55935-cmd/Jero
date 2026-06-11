import fetch from 'node-fetch';

async function testApi() {
  try {
    const res = await fetch('http://localhost:3000/api/customer/profile', {
      headers: {
        'Cookie': 'zolvo_auth_uid=test_uid; zolvo_role=client'
      }
    });
    
    console.log(res.status, res.statusText);
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
  }
}

testApi();
