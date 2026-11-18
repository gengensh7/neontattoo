"use client";

import { useEffect, useRef, useState } from "react";

import { STUDIO_MAP_URL } from "@/lib/config";

export default function NeonMap() {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let disposed = false;
    let removeMap: (() => void) | undefined;

    const observer = new IntersectionObserver(
      async entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();

        try {
          const { mountMap } = await import("./mountMap");
          if (disposed) return;
          removeMap = mountMap(element, hasTiles => setStatus(hasTiles ? "ready" : "error"));
        } catch {
          if (!disposed) setStatus("error");
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(element);

    return () => {
      disposed = true;
      observer.disconnect();
      removeMap?.();
    };
  }, []);

  return (
    <div
      className="relative isolate h-142.5 w-full overflow-hidden rounded-xl"
      aria-busy={status === "loading"}
    >
      <div ref={container} inert={status === "error"} className="h-full w-full" />
      {status === "loading" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-1000 bg-gray-100 motion-safe:animate-pulse"
        />
      )}
      {status === "error" && (
        <a
          href={STUDIO_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-1000 grid place-items-center bg-gray-100 underline"
        >
          Карта недоступна. Открыть адрес в Google Maps
        </a>
      )}
    </div>
  );
}
