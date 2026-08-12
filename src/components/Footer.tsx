import type { TaskConfig } from '../types';

interface Props {
  config: TaskConfig;
}

export function Footer({ config }: Props) {
  return (
    <footer className="footer">
      <div className="footer-line">{config.meta.footerOneLiner}</div>
      <div className="footer-line disclosure">
        Policies are scripted illustrations of pre-/post-training behavior. The
        real version is trained on your deployment&apos;s failure data.
      </div>
    </footer>
  );
}
