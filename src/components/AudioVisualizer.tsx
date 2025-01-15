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
        animationRef.current = requestAnimationFrame(animate);
        analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Set dimensions based on container
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // Draw bars
        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height;

          // Create gradient
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#ff0080');   // Pink
          gradient.addColorStop(0.5, '#00bfff');  // Blue
          gradient.addColorStop(1, '#00ff00');    // Green

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

          x += barWidth + 1;
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
      className="w-full h-24 rounded"
      style={{ 
        width: '100%',
        height: '100px',
        background: 'transparent'
      }}
    />
  );
};

export default AudioVisualizer; 