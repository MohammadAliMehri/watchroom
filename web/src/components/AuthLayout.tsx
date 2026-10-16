import type { ReactNode } from "react";
import { ArrowLeft, Film, Heart, Subtitles, Zap } from "lucide-react";
interface AuthLayoutProps {
  children: ReactNode;
  onBack?: () => void;
}
export function AuthLayout({ children, onBack }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <a href="/" className="brand-lockup">
          <span className="brand-symbol">
            <Film size={21} />
          </span>
          watchroom.
        </a>
        <div>
          <span className="eyebrow">SAVE A SEAT FOR SOMEONE SPECIAL</span>
          <h1>
            Apart for now.
            <br />
            <em>
              Together for
              <br />
              the next episode.
            </em>
          </h1>
          <p>
            A private movie night for your favorite people.
            <br />
            All the reactions. None of the distance.
          </p>
          <div className="hero-features">
            <span>
              <Zap /> Stay in sync
            </span>
            <span>
              <Subtitles /> Your subtitles
            </span>
            <span>
              <Heart /> Your people
            </span>
          </div>
        </div>
        <span className="text-sm text-stone-500">
          Good stories deserve good company.
        </span>
      </aside>
      <main className="auth-form-area">
        {onBack && (
          <button className="auth-back" onClick={onBack}>
            <ArrowLeft size={16} /> Back to WatchRoom
          </button>
        )}
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
