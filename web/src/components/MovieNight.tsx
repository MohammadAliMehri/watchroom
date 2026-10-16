import { ArrowUpRight, Heart, Play, Subtitles, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MovieNightProps {
  onStart: () => void;
  onJoin: () => void;
  compact?: boolean;
}

export function MovieNight({
  onStart,
  onJoin,
  compact = false,
}: MovieNightProps) {
  return (
    <section
      className={`movie-night ${compact ? "movie-night-compact" : ""}`}
      aria-label="Your next movie night"
    >
      <div className="cinema-landscape" aria-hidden="true">
        <div className="cinema-moon" />
        <div className="cinema-mountain mountain-back" />
        <div className="cinema-mountain mountain-front" />
        <div className="cinema-horizon" />
      </div>
      <div className="movie-night-content">
        <span className="eyebrow">
          <span className="status-dot" /> A LITTLE CLOSER, FROM ANYWHERE
        </span>
        <h1>
          Good stories.
          <br />
          <span>Better together.</span>
        </h1>
        <p>
          Your person. Your people. Your next favorite series.
          <br className="hidden sm:block" /> Make a little time for a movie
          night, wherever you are.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-7">
          <Button size="lg" onClick={onStart} className="cinema-primary">
            <Play className="size-4 fill-current" />
            {compact ? "Create a watch room" : "Start your movie night"}
            <ArrowUpRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onJoin}
            className="cinema-secondary"
          >
            {compact ? "Join with an invite" : "I have an account"}
          </Button>
        </div>
        <div className="hero-features">
          <span>
            <Zap /> In perfect sync
          </span>
          <span>
            <Subtitles /> MKV + subtitles
          </span>
          <span>
            <Heart /> Just your people
          </span>
        </div>
      </div>
      <div className="night-caption" aria-hidden="true">
        <span className="caption-line" />
        <span>
          DIFFERENT PLACES.
          <br />
          <strong>SAME MOMENT.</strong>
        </span>
      </div>
      <div className="together-chip" aria-hidden="true">
        <div className="mini-avatars">
          <span>A</span>
          <span>J</span>
          <span>
            <Heart size={12} />
          </span>
        </div>
        <div>
          <strong>Distance, meet movie night.</strong>
          <span>
            <Users size={11} /> A private space to press play together
          </span>
        </div>
      </div>
    </section>
  );
}
