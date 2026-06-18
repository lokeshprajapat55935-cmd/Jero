import { createBrowserClient } from '@supabase/ssr';
import { config } from '@/config';

let customerClient: ReturnType<typeof createBrowserClient> | null = null;
let workerClient: ReturnType<typeof createBrowserClient> | null = null;

export function createCustomerClient() {
  const url = config.env.supabase.url;
  const key = config.env.supabase.anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
  }

  if (typeof window === 'undefined') {
    return createBrowserClient(url, key, { cookieOptions: { name: 'zolvo_customer_session' } });
  }
  
  if (!customerClient) {
    customerClient = createBrowserClient(url, key, { cookieOptions: { name: 'zolvo_customer_session' } });
  }
  
  return customerClient;
}

export function createWorkerClient() {
  const url = config.env.supabase.url;
  const key = config.env.supabase.anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
  }

  if (typeof window === 'undefined') {
    return createBrowserClient(url, key, { cookieOptions: { name: 'zolvo_worker_session' } });
  }
  
  if (!workerClient) {
    workerClient = createBrowserClient(url, key, { cookieOptions: { name: 'zolvo_worker_session' } });
  }
  
  return workerClient;
}

export function createClient() {
  if (typeof window !== 'undefined') {
    const isWorker = window.location.pathname.startsWith('/partner') || window.location.pathname.startsWith('/worker');
    return isWorker ? createWorkerClient() : createCustomerClient();
  }
  return createCustomerClient();
}
