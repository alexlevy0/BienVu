import { RouteMotion } from '../../../components/route-motion';
import { PropertyDetail } from '../../../components/property-detail';
import { StudioFrame } from '../../../components/studio-frame';
import '../../landing.css';
import '../properties.css';
import '../../ma-vitrine/vitrine.css';
export const metadata = { title: 'Mon bien', robots: { index: false, follow: true } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RouteMotion>
      <StudioFrame active="videos">
        <PropertyDetail id={(await params).id.replace(/%3a/gi, ':')} />
      </StudioFrame>
    </RouteMotion>
  );
}
