import { redirect } from 'next/navigation';

export default function WithdrawalsRedirect() {
  redirect('/admin/finance');
}
