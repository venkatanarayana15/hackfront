import React from 'react';

const S = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const Compass = p => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z" />
  </S>
);
export const Search = p => (<S {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></S>);
export const Code = p => (<S {...p}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></S>);
export const Graph = p => (<S {...p}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.8 7.4 10.5 16M16.7 8.6 13.4 16.5M8 6.3h7.6" /></S>);
export const Shield = p => (<S {...p}><path d="M12 3.5 19 6v5.2c0 4.4-3 7.7-7 9.3-4-1.6-7-4.9-7-9.3V6z" /><path d="m9 12 2 2 4-4" /></S>);
export const Sun = p => (<S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>);
export const Moon = p => (<S {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" /></S>);
export const ArrowRight = p => (<S {...p}><path d="M4 12h15M13 6l6 6-6 6" /></S>);
export const ArrowUpRight = p => (<S {...p}><path d="M7 17 17 7M8 7h9v9" /></S>);
export const Commit = p => (<S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M3 12h5.8M15.2 12H21" /></S>);
export const User = p => (<S {...p}><circle cx="12" cy="8" r="3.4" /><path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" /></S>);
export const Doc = p => (<S {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h4M10 12h5M10 16h5" /></S>);
export const Chat = p => (<S {...p}><path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" /></S>);
export const Alert = p => (<S {...p}><path d="M12 4 2.8 20h18.4z" /><path d="M12 9v5M12 17.2v.1" /></S>);
export const Check = p => (<S {...p}><path d="m5 12.5 4.5 4.5L19 7" /></S>);
export const X = p => (<S {...p}><path d="m6 6 12 12M18 6 6 18" /></S>);
export const Copy = p => (<S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" /></S>);
export const Chevron = p => (<S {...p}><path d="m9 6 6 6-6 6" /></S>);
export const Spark = p => (<S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></S>);
export const Route = p => (<S {...p}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h7a4 4 0 0 1 0 8H10a4 4 0 0 0 0 8h7" /></S>);
export const Clock = p => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>);
