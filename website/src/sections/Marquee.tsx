import { brand } from '../../../example/brands';
import { Icon } from '../island/graphics';

const MARKS: [string, string, string][] = [
  ['Swiggy', brand.swiggy, '#FC8019'], ['Uber', brand.uber, '#fff'], ['Spotify', brand.spotify, '#1DB954'], ['Strava', brand.strava, '#FC4C02'],
  ['IndiGo', brand.indigo, '#7B93FF'], ['Kite', brand.zerodha, '#387ED1'], ['PhonePe', brand.phonepe, '#A475F2'], ['Zomato', brand.zomato, '#E23744'],
];

export function Marquee() {
  const items = [...MARKS, ...MARKS];
  return (
    <div className="marquee" aria-label="Works for apps like Swiggy, Uber, Spotify, Strava, IndiGo, Kite, PhonePe and Zomato">
      <div className="marquee-track" aria-hidden>
        {items.map(([name, path, color], i) => (
          <span key={i} className="marquee-item"><Icon path={path} size={22} width={name === 'Uber' || name === 'Zomato' ? 52 : 22} color={color} />{name}</span>
        ))}
      </div>
    </div>
  );
}
