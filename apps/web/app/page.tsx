import {LandingPage} from '../components/landing-page';
import './landing.css';
import './customizer.css';

export const metadata = {
  title: 'BienVu — Vos annonces, en version vidéo.',
  description: 'Collez votre annonce. L’IA crée votre vidéo, prête à partager.',
  alternates:{canonical:'/'},
};
export default function Page() {return <LandingPage/>;}
