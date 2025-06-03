// src/components/layout/FeatureSectionTransition.tsx
'use client';

import React, { useRef, useEffect } from 'react';

import gsap from '@/lib/useGsap';

interface FeatureSectionTransitionProps {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
}

const getVars = (direction: string) => {
  switch (direction) {
    case 'left':
      return { from: { x: -50, opacity: 0 }, to: { x: 0, opacity: 1, duration: 0.7, ease: 'power2.out' } };
    case 'right':
      return { from: { x: 50, opacity: 0 }, to: { x: 0, opacity: 1, duration: 0.7, ease: 'power2.out' } };
    case 'up':
      return { from: { y: 50, opacity: 0 }, to: { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out' } };
    case 'down':
      return { from: { y: -50, opacity: 0 }, to: { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out' } };
    default:
      return { from: { opacity: 0 }, to: { opacity: 1, duration: 0.7, ease: 'power2.out' } };
  }
};

const FeatureSectionTransition: React.FC<FeatureSectionTransitionProps> = ({ children, direction = 'up' }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vars = getVars(direction);
    if (sectionRef.current) {
      gsap.fromTo(sectionRef.current, vars.from, vars.to);
    }
  }, [direction]);

  return <div ref={sectionRef}>{children}</div>;
};

export default FeatureSectionTransition;
