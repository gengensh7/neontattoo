import Image from "next/image";

import { cn } from "@/lib/utils";

import { GalleryLightbox } from "./GalleryLightbox";

type ImageItem = {
  url: string;
  width: number;
  height: number;
  alt: string;
};

type Props = {
  galleryID: string;
  images: ImageItem[];
  className?: string;
};

export default function PortfolioGallery({ galleryID, images, className }: Props) {
  return (
    <GalleryLightbox className={cn("pswp-gallery", className)} id={galleryID}>
      {images.map((image, index) => (
        <a
          key={`${galleryID}-${index}`}
          href={image.url}
          data-pswp-width={image.width}
          data-pswp-height={image.height}
          target="_blank"
          rel="noreferrer"
          className="relative block min-h-162.5 overflow-hidden"
        >
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 1536px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="aspect-3/4 object-cover"
          />
        </a>
      ))}
    </GalleryLightbox>
  );
}
