"use client";

import "swiper/css";
import "swiper/css/pagination";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide, useSwiper } from "swiper/react";

const slides = [
  {
    src: "/images/hero-neon-tattoo-studio-1.webp",
    alt: "Мужчина с тату рукавами",
    title: "профессиональная тату студия в кишинёве",
    subtitle: <h2>индивидуальные тату эскизы</h2>,
  },
  {
    src: "/images/hero-neon-tattoo-studio-2.webp",
    alt: "Мужчина с тату на правой руке",
    title: "Перманентный макияж",
    subtitle: <p>С точным подбором формы и оттенка</p>,
  },
  {
    src: "/images/hero-neon-tattoo-studio-3.webp",
    alt: "Мужчина с тату на плечами",
    title: "Пирсинг в кишинёве",
    subtitle: <p>Профессиональный подход и внимание к деталям</p>,
  },
];

function HeroArrows() {
  const swiper = useSwiper();
  const buttonClass =
    "flex cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/20 p-2 shadow-lg shadow-black/20 backdrop-blur-md transition hover:bg-white/30";

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-6">
      <button
        type="button"
        aria-label="Previous slide"
        className={buttonClass}
        onClick={() => swiper.slidePrev()}
      >
        <ChevronLeft className="size-6 text-white" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        className={buttonClass}
        onClick={() => swiper.slideNext()}
      >
        <ChevronRight className="size-6 text-white" />
      </button>
    </div>
  );
}

export const Hero = () => {
  return (
    <Swiper
      tag="section"
      className="swiperHero relative min-h-[calc(100dvh-96px)] w-full bg-neutral-800"
      modules={[Pagination, Autoplay]}
      pagination={{ clickable: true }}
      autoplay={{ delay: 2000, disableOnInteraction: false }}
      loop
    >
      {slides.map(({ src, alt, title, subtitle }, index) => (
        <SwiperSlide key={src} className="relative min-h-[calc(100dvh-96px)]">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="100vw"
            preload={index === 0}
            fetchPriority={index === 0 ? "high" : "low"}
            decoding={index === 0 ? "sync" : "async"}
            className="object-cover"
          />
          <div className="absolute inset-0 z-10 bg-black/40" />
          <div className="absolute top-1/2 left-1/2 z-20 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-10 text-white">
            <p className="sedwick text-center text-5xl sm:text-7xl">Neon Tattoo</p>
            <div className="flex flex-col gap-4 px-4 text-center tracking-widest uppercase">
              <h2>{title}</h2>
              {subtitle}
            </div>
          </div>
        </SwiperSlide>
      ))}

      <HeroArrows />
    </Swiper>
  );
};
