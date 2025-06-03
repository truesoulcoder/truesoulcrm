// src/components/ui/AnimatedProgressBar.tsx
'use client';
import React, { useRef, useEffect } from 'react';
import gsap from '@/lib/useGsap';

interface AnimatedProgressBarProps {
  value: number; // 0 to 100
  color?: string;
}

const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({ value, color = '#661AE6' }) => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (barRef.current) {
      gsap.to(barRef.current, {
        width: `${value}%`,
        duration: 1.2,
        ease: 'power2.out',
      });
    }
  }, [value]);

  return (
    <div className="w-full h-3 bg-base-200 rounded">
      <div
        ref={barRef}
        className="h-3 rounded transition-all"
        style={{ width: 0, background: color }}
      ></div>
    </div>
  );
};

export default AnimatedProgressBar;
