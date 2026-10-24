import { CopyButton } from '../components/Code';
import { Icon, Pet } from '../island/graphics';
import { GitHubIcon, Rise } from '../ui';

export function Footer() {
  return (
    <footer>
      <section className="final">
        <div className="wrap">
          <Rise>
            <div className="final-pet"><span className="final-pill"><Pet mood="happy" size={56} color="#fff" cheeks="#FF6B8B" /></span></div>
            <h2>Give your app <em>an island.</em></h2>
            <p className="lede" style={{ margin: '24px auto 0', textAlign: 'center' }}>MIT licensed. Expo and bare React Native. Built in the open.</p>
            <div className="cta-row">
              <div className="npm"><span><span className="dollar">$ </span>npm i halo-island</span><CopyButton text="npm i halo-island" /></div>
              <a className="btn btn-primary" href="https://github.com/herin7/halo-island" target="_blank" rel="noreferrer"><GitHubIcon /> Star on GitHub</a>
            </div>
          </Rise>
        </div>
      </section>
      <div className="foot">
        <span>Halo Island · open source, MIT</span>
        <span style={{ display: 'flex', gap: 20 }}>
          <a href="https://github.com/herin7/halo-island">GitHub</a>
          <a href="https://github.com/herin7/halo-island#readme">Docs</a>
          <a href="#top">Back to top <Icon name="forward" size={12} color="currentColor" style={{ display: 'inline', transform: 'rotate(-90deg)', verticalAlign: 'middle' }} /></a>
        </span>
      </div>
    </footer>
  );
}
