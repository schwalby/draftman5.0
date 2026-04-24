export function Spinner() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--khaki)',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}
