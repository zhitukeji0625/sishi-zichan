export const size = { width: 32, height: 32 };
export const contentType = "image/svg+xml";

export default function Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#166534" />
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="14" fontFamily="sans-serif">
        四
      </text>
    </svg>
  );
}
