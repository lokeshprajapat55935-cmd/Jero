import React from 'react';
import { getAdminSession } from '@/lib/admin/auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side validation of the isolated admin session
  const session = await getAdminSession();

  if (!session || session.role !== 'admin' || session.admin_role !== 'super_admin') {
    redirect('/admin-login');
  }

  // Pass session data securely to the client layout wrapper
  return (
    <AdminLayoutClient adminRole={session.admin_role}>
      {children}
    </AdminLayoutClient>
  );
}
