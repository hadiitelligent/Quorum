/** Initials on a ramp-tinted circle. Sizes and tones from the spec. */
export function Avatar({ initials, size, tone = 'accent' }: { initials: string; size: 36 | 34 | 30 | 26 | 20; tone?: 'accent' | 'neutral' }) {
  return (
    <div className={`avatar ${tone} s${size}`} aria-hidden="true">
      {initials}
    </div>
  )
}
