"use client";

import { useEffect, useState } from "react";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

/**
 * Slow, soft ShaderGradient (the Figma plugin's renderer) in the site colours.
 * Loaded on the client only; the wrapper fades it in once the first frame is up.
 */
export default function HeroGradient({ className = "ss-wm-bg" }: { className?: string }) {
  const [ready, setReady] = useState(false);
  // client-only component (loaded with ssr: false), so window is available here
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`ss-sg ${className}${ready ? " is-ready" : ""}`} aria-hidden="true">
      <ShaderGradientCanvas pixelDensity={1} fov={45} pointerEvents="none" lazyLoad powerPreference="low-power" style={{ position: "absolute", inset: 0 }}>
        <ShaderGradient
          control="props"
          type="waterPlane"
          animate={still ? "off" : "on"}
          uTime={0.2}
          uSpeed={0.1}
          uStrength={2.4}
          uDensity={1.1}
          uFrequency={5.5}
          uAmplitude={0}
          positionX={-0.5}
          positionY={0.1}
          positionZ={0}
          rotationX={0}
          rotationY={0}
          rotationZ={235}
          color1="#f068b7"
          color2="#5a1f47"
          color3="#000000"
          reflection={0.1}
          cAzimuthAngle={180}
          cPolarAngle={115}
          cDistance={3.9}
          cameraZoom={1}
          lightType="3d"
          brightness={1}
          envPreset="city"
          grain="on"
          grainBlending={0.08}
          enableTransition={false}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
