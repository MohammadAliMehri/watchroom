interface MemberAvatarProps {
  name: string;
  className?: string;
}
const colors = ["#c3a7df", "#d4ae99", "#a4bcae", "#a5b4d0", "#d2b28c"];
/** Local avatars work offline and never send viewer names to a third party. */
export function MemberAvatar({ name, className = "" }: MemberAvatarProps) {
  const seed = Array.from(name).reduce(
    (sum, char) => sum + (char.codePointAt(0) || 0),
    0,
  );
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[#2a2333] ${className}`}
      style={{ backgroundColor: colors[seed % colors.length] }}
    >
      {initials}
    </span>
  );
}
