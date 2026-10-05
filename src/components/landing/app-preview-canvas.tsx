"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type * as THREE from "three"

// Loaded with next/dynamic from app-preview-section so three.js stays out of the landing
// page's initial bundle.

function PreviewCard3D() {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (meshRef.current && groupRef.current) {
      const x = state.pointer.x * 0.1
      const y = state.pointer.y * 0.1

      groupRef.current.rotation.y = x
      groupRef.current.rotation.x = -y

      meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <boxGeometry args={[4, 2.5, 0.1]} />
        <meshStandardMaterial
          color="#1a1a1a"
          metalness={0.3}
          roughness={0.4}
          envMapIntensity={1}
        />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[3.8, 2.3, 0.01]} />
        <meshStandardMaterial
          color="#0a0a0a"
          emissive="#1a1a1a"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  )
}

export function AppPreviewCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 75 }}
      className="rounded-lg pointer-events-none"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <PreviewCard3D />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.3}
        minPolarAngle={Math.PI / 2.5}
        maxPolarAngle={Math.PI / 1.8}
      />
    </Canvas>
  )
}
