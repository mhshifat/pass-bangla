import { ImageResponse } from 'next/og'
import { LOGO_BG, LOGO_DOTS, LOGO_DOT_R } from '@/lib/logo-mark'

export const runtime = 'edge'
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
          <circle cx="64" cy="64" r="60" fill={LOGO_BG} />
          {LOGO_DOTS.map((d) => (
            <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={LOGO_DOT_R + 0.8} fill={d.fill} />
          ))}
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}
