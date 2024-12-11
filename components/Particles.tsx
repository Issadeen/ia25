import { useCallback } from 'react'
import { useTheme } from "next-themes"
import type { Engine } from "tsparticles-engine"
import Particles from "react-tsparticles"
import { loadSlim } from "tsparticles-slim"

export const ParticlesBackground = () => {
  const { theme } = useTheme()
  
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine)
  }, [])

  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      options={{
        background: {
          opacity: 0
        },
        particles: {
          number: { value: 30, density: { enable: true, value_area: 800 } },
          color: { value: theme === 'dark' ? "#3b82f680" : "#60a5fa40" },
          shape: { type: "circle" },
          opacity: { value: 0.3, random: false },
          size: { value: 2, random: true },
          links: {
            enable: true,
            distance: 150,
            color: theme === 'dark' ? "#3b82f650" : "#60a5fa30",
            opacity: 0.2,
            width: 1
          },
          move: {
            enable: true,
            speed: 0.5,
            direction: "none",
            random: false,
            straight: false,
            outModes: "out"
          }
        },
        interactivity: {
          detectsOn: "canvas",
          events: {
            onHover: { enable: true, mode: "grab" },
            onClick: { enable: true, mode: "push" },
            resize: true
          },
          modes: {
            grab: { distance: 140, links: { opacity: 0.5 } },
            push: { particles_nb: 1 }
          }
        },
        retina_detect: true
      }}
      className="!fixed !inset-0"
      style={{ 
        position: 'fixed',
        zIndex: 1,
        pointerEvents: 'none'
      }}
    />
  )
}

