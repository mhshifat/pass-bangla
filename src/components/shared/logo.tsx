import { LOGO_BG, LOGO_DOTS, LOGO_DOT_R } from "@/lib/logo-mark"

interface LogoProps {
  className?: string
}

export function Logo({ className = "h-8 w-8" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PassBangla"
    >
      <circle cx="64" cy="64" r="60" fill={LOGO_BG} />
      {LOGO_DOTS.map((d) => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={LOGO_DOT_R} fill={d.fill} />
      ))}
    </svg>
  )
}
