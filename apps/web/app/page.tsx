import {LandingPage} from '../components/landing-page';
import './landing.css';
import './customizer.css';

export const metadata = {
  title: 'BienVu — Une annonce. Une vidéo qui donne envie.',
  description: 'Votre studio de vidéos immobilières. Un lien ou vos photos, une voix française et les couleurs de votre agence.',
  alternates:{canonical:'/'},
};
export default function Page() {return <LandingPage/>;}
