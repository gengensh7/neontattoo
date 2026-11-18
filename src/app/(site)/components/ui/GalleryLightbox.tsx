"use client";

import type PhotoSwipeLightbox from "photoswipe/lightbox";
import { type ComponentProps, type MouseEvent, useEffect, useRef } from "react";

export function GalleryLightbox(props: ComponentProps<"div">) {
  const lightbox = useRef<PhotoSwipeLightbox | null>(null);

  useEffect(() => {
    return () => lightbox.current?.destroy();
  }, []);

  async function open(event: MouseEvent<HTMLDivElement>) {
    const gallery = event.currentTarget;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (
      !link ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    const index = Array.from(gallery.querySelectorAll("a")).indexOf(link);
    const point = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : null;

    try {
      const { createLightbox } = await import("./createLightbox");
      if (!gallery.isConnected) return;
      lightbox.current ??= createLightbox(gallery);
      lightbox.current.loadAndOpen(index, { gallery }, point);
    } catch {
      if (gallery.isConnected) window.location.assign(link.href);
    }
  }

  return <div {...props} onClick={open} />;
}
