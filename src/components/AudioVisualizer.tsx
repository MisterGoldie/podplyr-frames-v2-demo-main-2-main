import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioElement }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!audioElement || !canvasRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries[0].isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(canvasRef.current);

    const initializeAudioContext = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        
        if (audioElement.src) {
          const source = audioContext.createMediaElementSource(audioElement);
          source.connect(analyser);
          analyser.connect(audioContext.destination);
          sourceRef.current = source;
        }

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      } catch (error) {
        console.warn('Audio visualization disabled');
      }
    };

    // Only animate when visible
    const draw = () => {
      if (!isVisible || !canvasRef.current || !analyserRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const animate = () => {
        // Reduce animation frame rate on mobile
        if (window.innerWidth < 768) {
          setTimeout(() => {
            animationRef.current = requestAnimationFrame(animate);
          }, 50); // Update every 50ms instead of every frame
        } else {
          animationRef.current = requestAnimationFrame(animate);
        }

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Reduce number of bars on mobile
        const mobileBufferLength = window.innerWidth < 768 ? Math.floor(bufferLength / 2) : bufferLength;
        const barWidth = (canvas.width / mobileBufferLength) * 2.5;
        
        for (let i = 0; i < mobileBufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = '#4ade80'; // Single color instead of gradient for better performance
          ctx.fillRect(i * (barWidth + 1), canvas.height - barHeight, barWidth, barHeight);
        }
      };

      animate();
    };

    // Initialize and start visualization
    try {
      if (!audioContextRef.current) {
        initializeAudioContext();
      }
      draw();
    } catch (error) {
      console.error('Error initializing audio visualizer:', error);
    }

    // Cleanup
    return () => {
      observer.disconnect();
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement, isVisible]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-full"
      style={{ 
        width: '24px',
        height: '24px',
        background: 'transparent'
      }}
    />
  );
};

export default AudioVisualizer; 