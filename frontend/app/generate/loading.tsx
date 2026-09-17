'use client'

export default function Loading() {
  return (
    <div style={styles.container}>
      <img src="/dhak.webp" alt="Loading" style={styles.logo} />

      <style jsx>{`
        @keyframes zoomPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.6;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.85);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    height: '100%',
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
  },
  logo: {
    width: '26vw',
    maxWidth: 320,
    minWidth: 180,
    height: 'auto',
    animation: 'zoomPulse 2.2s ease-in-out infinite',
  },
}
