import { adminRecordRoute } from '../../../../lib/admin-record-route';
import '../../../landing.css';
import '../../admin.css';
import '../../operations.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dossier agence — BienVu', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return adminRecordRoute('agency', (await params).id);
}
