import "photoswipe/style.css";

import PhotoSwipe from "photoswipe";
import PhotoSwipeLightbox from "photoswipe/lightbox";

export function createLightbox(gallery: HTMLDivElement) {
  return new PhotoSwipeLightbox({ gallery, children: "a", pswpModule: PhotoSwipe });
}
