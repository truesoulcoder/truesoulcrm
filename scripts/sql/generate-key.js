import { createHmac } from 'crypto';
const timestamp = Date.now();
const random = Math.random().toString(36).substring(2, 15);
const secret = 'your-very-secure-secret-' + Math.random().toString(36).substring(2, 15);
const hmac = createHmac('sha256', secret)
  .update(timestamp + random)
  .digest('hex');
const apiKey = `el5_${timestamp}_${hmac}`;

console.log('Add these to your .env.local file:');
console.log(`API_KEY=${apiKey}`);
console.log(`API_SECRET=${secret}`);