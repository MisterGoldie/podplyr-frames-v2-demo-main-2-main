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

    // Smaller FFT size for mobile
    const fftSize = 16; // Reduced from 32
    
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
        analyser.fftSize = fftSize;
        
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

    const draw = () => {
      if (!isVisible || !canvasRef.current || !analyserRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: false }); // Optimize canvas
      if (!ctx) return;

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const animate = () => {
        // Reduce frame rate on mobile
        setTimeout(() => {
          animationRef.current = requestAnimationFrame(animate);
        }, 150); // Increased delay for better performance

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 3; // Wider bars
        
        // Draw fewer bars
        for (let i = 0; i < bufferLength; i += 2) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(i * (barWidth + 2), canvas.height - barHeight, barWidth, barHeight);
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
      width={20}
      height={20}
      className="w-full h-full"
    />
  );
};

export default AudioVisualizer; 