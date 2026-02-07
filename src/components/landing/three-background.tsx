"use client"

import { useRef, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Points, PointMaterial } from "@react-three/drei"
import * as THREE from "three"

function FloatingParticles({ count = 100 }) {
  const mesh = useRef<THREE.Points>(null)
  
  // Generate particles once using useMemo to ensure deterministic output
  const particles = useMemo(() => {
    // Use a seeded random for deterministic output during renders
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      // Use modulo operation to create deterministic but varied values from index
      positions[i] = ((i * 7919) % 10000) / 1000 - 5
    }
    return positions
  }, [count])

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.elapsedTime * 0.05
      mesh.current.rotation.y = state.clock.elapsedTime * 0.075
    }
  })

  return (
    <Points ref={mesh} positions={particles} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#6366f1"
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.4}
      />
    </Points>
  )
}

export function ThreeBackground() {
  return (
    <div className="absolute inset-0 -z-10 opacity-30">
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <FloatingParticles count={150} />
      </Canvas>
    </div>
  )
}

