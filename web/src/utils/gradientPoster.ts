// Deterministic CSS gradient derived from a title, used as a poster placeholder.
export function getGradientPoster(title: string = 'WatchRoom'): string {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `radial-gradient(ellipse at 20% 30%, hsla(${hue}, 80%, 35%, 0.45) 0%, transparent 60%),
          radial-gradient(circle at 80% 70%, hsla(${(hue + 45) % 360}, 75%, 25%, 0.35) 0%, transparent 70%),
          linear-gradient(135deg, hsla(${(hue + 140) % 360}, 70%, 12%, 0.95) 0%, #0b0d12 100%)`;
}
