import {
  ArrowRight,
  Film,
  Link,
  LockKeyhole,
  MessageCircle,
  Play,
  Server,
  Subtitles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovieNight } from "./MovieNight";

interface LandingProps {
  onSignup: () => void;
  onLogin: () => void;
  invited: boolean;
}
export function Landing({ onSignup, onLogin, invited }: LandingProps) {
  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <a className="brand-lockup" href="/" aria-label="WatchRoom home">
          <span className="brand-symbol">
            <Film size={21} />
          </span>
          watchroom<span className="brand-period">.</span>
        </a>
        <nav
          aria-label="Main navigation"
          className="hidden sm:flex gap-7 text-sm text-stone-400"
        >
          <a href="#how-it-works">How it works</a>
          <a href="#made-for-you">Made for you</a>
        </nav>
        <Button variant="ghost" onClick={onLogin}>
          Sign in <ArrowRight size={15} />
        </Button>
      </header>
      <main>
        {invited && (
          <div className="invite-banner">
            <Link size={17} />
            <span>
              Your movie night is waiting. Sign in or create an account to join
              your friend’s room.
            </span>
            <Button size="sm" onClick={onLogin}>
              Join the room
            </Button>
          </div>
        )}
        <MovieNight onStart={onSignup} onJoin={onLogin} />
        <div className="landing-trust">
          <span>A movie night, without the “3, 2, 1… play.”</span>
          <div>
            <span>
              <LockKeyhole /> Private rooms
            </span>
            <span>
              <Subtitles /> Embedded subtitles
            </span>
            <span>
              <Server /> Your own server
            </span>
          </div>
        </div>
        <section id="how-it-works" className="landing-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LESS SETUP. MORE TOGETHER.</span>
              <h2>Make tonight a watch night.</h2>
            </div>
            <p>
              Three small steps.
              <br />A whole lot of shared moments.
            </p>
          </div>
          <div className="steps-grid">
            {[
              {
                icon: LockKeyhole,
                title: "Make it your space",
                text: "Create a password-protected room for date night, your best friend, or the whole group.",
              },
              {
                icon: Link,
                title: "Bring something good",
                text: "Paste a direct movie link or queue an entire series. MKV, MP4, WebM, and HLS are welcome.",
              },
              {
                icon: Play,
                title: "Press play. Together.",
                text: "Send your invite, settle in, and stay in sync. Pause for snacks; everyone pauses with you.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article className="step-card" key={title}>
                <div className="flex justify-between items-center">
                  <span className="feature-icon">
                    <Icon size={21} />
                  </span>
                  <span className="step-number">0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="made-for-you" className="connection-section">
          <div>
            <span className="eyebrow">FOR THE “ONE MORE EPISODE” PEOPLE</span>
            <h2>
              Small screens.
              <br />
              <em>Big connections.</em>
            </h2>
            <p>
              Long-distance dates. Sunday comfort films. The series you promised
              to watch together. Give your favorite people a seat beside you.
            </p>
            <Button className="cinema-primary" onClick={onSignup}>
              Find your next shared moment <ArrowRight size={16} />
            </Button>
          </div>
          <div className="connection-features">
            <article>
              <MessageCircle />
              <div>
                <h3>Every reaction, right there</h3>
                <p>Room chat keeps the conversation beside the movie.</p>
              </div>
            </article>
            <article>
              <Subtitles />
              <div>
                <h3>Watch it your way</h3>
                <p>
                  Choose embedded text subtitles and audio tracks, or add your
                  own SRT / VTT file.
                </p>
              </div>
            </article>
            <article>
              <Server />
              <div>
                <h3>Your place on the internet</h3>
                <p>
                  Host WatchRoom on your server with Docker, persistent rooms,
                  and automatic HTTPS.
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span className="brand-lockup">
          <Film size={18} />
          watchroom.
        </span>
        <span>Made for watching. Built for being together.</span>
        <span>Bring your own media · No catalog included</span>
      </footer>
    </div>
  );
}
