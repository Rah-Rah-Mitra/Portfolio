import React from 'react';

export const HammerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    {...props}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="m15 12-8.373 8.373a1 1 0 1 1-1.414-1.414L12.586 12l-2.172-2.172a1 1 0 0 1 0-1.414l2.828-2.828a1 1 0 0 1 1.414 0L17 8l-2 2Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5 2 17v3h3l7.5-7.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 2.5 19 4l-2.5 2.5" />
  </svg>
);
