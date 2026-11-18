"use client";

import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/button";

const MobileMenu = lazy(() => import("./MobileMenu"));

export function Hamburger() {
  const [requested, setRequested] = useState(false);
  const trigger = (
    <Button
      type="button"
      variant="outline"
      className="flex md:hidden"
      aria-haspopup="dialog"
      onClick={() => setRequested(true)}
    >
      Записаться
    </Button>
  );

  if (!requested) return trigger;
  return (
    <Suspense fallback={trigger}>
      <MobileMenu>{trigger}</MobileMenu>
    </Suspense>
  );
}
