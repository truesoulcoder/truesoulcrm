// src/components/ui/AnimatedSpinner.tsx
'use client';
import React, { useRef, useEffect } from 'react';
import gsap from '@/lib/useGsap';

const AnimatedSpinner: React.FC<{ size?: number }> = ({ size = 32 }) => {
  const spinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (spinnerRef.current) {
      gsap.to(spinnerRef.current, {
        rotate: 360,
        repeat: -1,
        duration: 1,
        ease: 'linear',
        transformOrigin: '50% 50%',
      });
    }
  }, []);

  return (
    <div ref={spinnerRef} style={{ width: size, height: size }} className="inline-block">
      <svg width={size} height={size} viewBox="0 0 50 50">
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="#661AE6"
          strokeWidth="6"
          strokeDasharray="90 150"
        />
      </svg>
    </div>
  );
};

export default AnimatedSpinner;
