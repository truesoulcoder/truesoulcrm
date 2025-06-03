'use client';

import { CSSProperties, useEffect, useRef } from 'react';

type GradientProps = {
  display?: boolean;
  opacity?: number;
  x: number;
  y: number;
  colorStart: string;
  colorEnd: string;
};

type LinesProps = {
  display?: boolean;
  opacity?: number;
  size: string | number;
  thickness: number;
  angle: number;
  color: string;
};

type MaskProps = {
  x: number;
  y: number;
  radius: number;
};

interface BackgroundProps {
  fill?: boolean;
  height?: number;
  gradient: GradientProps;
  lines: LinesProps;
  mask: MaskProps;
  className?: string;
}

export function Background({
  fill = false,
  height = 100,
  gradient,
  lines,
  mask,
  className = '',
}: BackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvas = () => {
      if (!containerRef.current) return;
      
      const { width, height: containerHeight } = containerRef.current.getBoundingClientRect();
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = containerHeight;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, containerHeight);

      // Draw gradient
      if (gradient.display !== false) {
        const gradientObj = ctx.createRadialGradient(
          (gradient.x / 100) * width,
          (gradient.y / 100) * containerHeight,
          0,
          (gradient.x / 100) * width,
          (gradient.y / 100) * containerHeight,
          Math.max(width, containerHeight) * 0.75
        );
        
        gradientObj.addColorStop(0, gradient.colorStart);
        gradientObj.addColorStop(1, gradient.colorEnd);
        
        ctx.globalAlpha = gradient.opacity ?? 1;
        ctx.fillStyle = gradientObj;
        ctx.fillRect(0, 0, width, containerHeight);
      }

      // Draw lines
      if (lines.display !== false) {
        ctx.globalAlpha = lines.opacity ?? 1;
        const size = typeof lines.size === 'number' ? lines.size : parseInt(lines.size);
        const angle = (lines.angle * Math.PI) / 180;
        const spacing = size + lines.thickness;
        
        ctx.strokeStyle = lines.color;
        ctx.lineWidth = lines.thickness;
        
        const maxDimension = Math.max(width, containerHeight) * 2;
        const centerX = width / 2;
        const centerY = containerHeight / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        
        for (let x = -maxDimension; x < maxDimension; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, -maxDimension);
          ctx.lineTo(x, maxDimension);
          ctx.stroke();
        }
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // Apply mask
      if (mask) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(
          (mask.x / 100) * width,
          (mask.y / 100) * containerHeight,
          mask.radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    updateCanvas();
    
    const resizeObserver = new ResizeObserver(updateCanvas);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [gradient, lines, mask]);

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: fill ? '100%' : `${height}px`,
    zIndex: -1,
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}

export default Background;
