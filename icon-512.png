import Image from 'next/image';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function BrandMark({ size = 'md' }: BrandMarkProps) {
  const sizes = {
    sm: { w: 64, h: 64 },
    md: { w: 96, h: 96 },
    lg: { w: 140, h: 140 },
    xl: { w: 200, h: 200 },
  };
  const { w, h } = sizes[size];

  return (
    <div className="inline-flex items-center">
      <Image
        src="/logo.png"
        alt="X FITNESS"
        width={w}
        height={h}
        priority
        className="object-contain"
        style={{ width: `${w}px`, height: `${h}px` }}
      />
    </div>
  );
}
