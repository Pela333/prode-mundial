'use client'

import { useState } from 'react'

interface LogoBadgeProps {
  src: string
  alt: string
  fallbackText: string
  bgGradient: string
  heightClass?: string
}

export default function LogoBadge({
  src,
  alt,
  fallbackText,
  bgGradient,
  heightClass = 'h-6'
}: LogoBadgeProps) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold text-white shadow bg-gradient-to-br ${bgGradient} select-none`}>
        {fallbackText}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      className={`${heightClass} object-contain max-w-[100px] transition-all`}
    />
  )
}
