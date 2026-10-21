export function Logo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-lg border border-white/10 bg-elevated ${className ?? ''}`}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 4l16 16M20 4L4 20" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
