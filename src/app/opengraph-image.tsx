import { ImageResponse } from 'next/og'
import { LOGO_BG, LOGO_DOTS, LOGO_DOT_R } from '@/lib/logo-mark'

export const runtime = 'edge'
export const alt = 'PassBangla - Secure Password Manager'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          backgroundImage: 'linear-gradient(135deg, #1a1a1a 0%, #2d1b4e 50%, #1a1a1a 100%)',
        }}
      >
        {/* Logo/Icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '40px',
          }}
        >
          <svg width="140" height="140" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
            <circle cx="64" cy="64" r="58" fill={LOGO_BG} stroke="#34D399" strokeWidth="3" />
            {LOGO_DOTS.map((d) => (
              <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={LOGO_DOT_R} fill={d.fill} />
            ))}
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: '#ffffff',
              margin: '0',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            PassBangla
          </h1>
          <p
            style={{
              fontSize: '32px',
              color: '#a78bfa',
              margin: '0',
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            Secure Password Manager for Teams
          </p>
          <p
            style={{
              fontSize: '24px',
              color: '#9ca3af',
              margin: '20px 0 0 0',
              textAlign: 'center',
              maxWidth: '800px',
            }}
          >
            Enterprise password management with client-side encryption
          </p>
        </div>

        {/* Security Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '40px',
            padding: '12px 24px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(99, 102, 241, 0.3)',
          }}
        >
          <span
            style={{
              fontSize: '20px',
              color: '#10b981',
            }}
          >
            ✓
          </span>
          <span
            style={{
              fontSize: '18px',
              color: '#ffffff',
            }}
          >
            Zero-Knowledge Architecture • SOC 2 Compliant
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}

