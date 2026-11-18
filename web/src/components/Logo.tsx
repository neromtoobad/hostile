/** Wordmark: two blocks squaring up, then the name. */
export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#1D3BFF" />
        <path d="M7 9l8 7-8 7z" fill="#fff" />
        <path d="M25 9l-8 7 8 7z" fill="#D8FF3D" />
      </svg>
      <span>hostile</span>
    </span>
  );
}
