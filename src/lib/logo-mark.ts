// PassBangla mark: a padlock drawn in dots on a dark disc.
// One source for the in-app logo, the generated favicon and the social image.
export const LOGO_BG = "#1F2937"
export const LOGO_BODY = "#34D399"
export const LOGO_SHACKLE = "#FFFFFF"
export const LOGO_DOT_R = 3.4

export interface LogoDot {
  x: number
  y: number
  fill: string
}

function buildDots(): LogoDot[] {
  const dots: LogoDot[] = []
  for (let x = 40; x <= 88; x += 8) {
    for (let y = 66; y <= 98; y += 8) dots.push({ x, y, fill: LOGO_BODY })
  }
  for (let k = 0; k <= 8; k++) {
    const t = Math.PI + (Math.PI * k) / 8
    dots.push({
      x: Number((64 + 18 * Math.cos(t)).toFixed(2)),
      y: Number((56 + 18 * Math.sin(t)).toFixed(2)),
      fill: LOGO_SHACKLE,
    })
  }
  dots.push({ x: 46, y: 62, fill: LOGO_SHACKLE }, { x: 82, y: 62, fill: LOGO_SHACKLE })
  return dots
}

export const LOGO_DOTS: LogoDot[] = buildDots()
