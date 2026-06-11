'use client';

import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/providers/I18nProvider';
import logger from '@/lib/logger';
import type { Profile } from '@/types';

export function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setUsers(result.data.users || []);
      })
      .catch((err) => logger.error('Failed to load users', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("table.fullName")}</TableHead>
          <TableHead>{t("table.email")}</TableHead>
          <TableHead>{t("table.role")}</TableHead>
          <TableHead>{t("table.joinedAt")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.full_name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell className="capitalize">{user.role}</TableCell>
            <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
