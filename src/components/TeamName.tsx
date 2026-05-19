import Image from 'next/image'
import { getFlagUrl } from '@/lib/fixture'

interface TeamNameProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right'
}

export default function TeamName({ name, size = 'md', align = 'left' }: TeamNameProps) {
  const flagUrl = getFlagUrl(name)

  const flagSizes = { sm: 20, md: 24, lg: 32 }
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }
  const px = flagSizes[size]

  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {flagUrl && (
        <div
          className="rounded overflow-hidden shrink-0 shadow-sm"
          style={{ width: px, height: Math.round(px * 0.75) }}
        >
          <Image
            src={flagUrl}
            alt={name}
            width={px}
            height={Math.round(px * 0.75)}
            className="object-cover w-full h-full"
            unoptimized
          />
        </div>
      )}
      <span className={`font-semibold text-white ${textSizes[size]} leading-none`}>{name}</span>
    </div>
  )
}
