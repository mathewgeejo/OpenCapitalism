type BrandProps = {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="brand" aria-label="Civic Fortune">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {!compact && (
        <div>
          <strong>Civic Fortune</strong>
          <small>THE CITY IS YOURS</small>
        </div>
      )}
    </div>
  )
}
