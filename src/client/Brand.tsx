type BrandProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
  onClick?: () => void;
};

export function Brand({ compact = false, inverse = false, className = "", onClick }: BrandProps) {
  return (
    <div
      className={`brand brand--canonical ${compact ? "brand--compact" : ""} ${inverse ? "brand--inverse" : ""} ${onClick ? "is-clickable" : ""} ${className}`}
      aria-label={onClick ? "Lico Primos — voltar ao painel principal" : "Lico Primos"}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className="brand__mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand__wordmark">Lico Primo<span>S</span></span>
    </div>
  );
}
