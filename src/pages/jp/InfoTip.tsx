import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import './InfoTip.css';

/**
 * Small "i" button with a tooltip. The tooltip is rendered in a portal with
 * fixed positioning, so it is never clipped by the scrolling sidebar.
 * Safe to place inside a nav link — clicking the "i" does not navigate.
 */
export default function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.right + 12, y: r.top + r.height / 2 });
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        className="infotip"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setPos(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pos) setPos(null);
          else show(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            show(e.currentTarget);
          }
          if (e.key === 'Escape') setPos(null);
        }}
      >
        <Info size={14} />
      </span>

      {pos &&
        createPortal(
          <div className="infotip-pop" role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
