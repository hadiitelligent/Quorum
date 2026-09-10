import type { Strength } from '@/lib/database.types'

/** The expertise meter: up to three subject rows, five 6px dots each. */
export function Meter({ strengths }: { strengths: Strength[] }) {
  if (strengths.length === 0) return null
  return (
    <div className="meter">
      {strengths.slice(0, 3).map((row) => (
        <div className="meter-row" key={row.s}>
          <span>{row.s}</span>
          <span className="dots" aria-label={`${row.lv} of 5`}>
            {[1, 2, 3, 4, 5].map((d) => (
              <span key={d} className={`dot${d <= row.lv ? ' on' : ''}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
