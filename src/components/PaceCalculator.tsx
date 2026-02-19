"use client";

import { useState } from "react";

const DISTANCES = [
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "Halv", value: 21.1 },
  { label: "Maraton", value: 42.2 },
  { label: "Egendefinert", value: "custom" },
] as const;

type DistanceType = number | "custom";

/* =====================
   HELPERS
===================== */
function secondsToPace(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function secondsToTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }

  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSplits(distance: number) {
  if (distance <= 5) {
    return Array.from(
      { length: Math.floor(distance) },
      (_, i) => i + 1
    );
  }

  if (distance <= 10) {
    return [1, 5, 10];
  }

  if (distance <= 21.1) {
    return [5, 10, 15, 20, 21.1];
  }

  return [
    5,
    10,
    15,
    20,
    21.1,
    30,
    35,
    40,
    distance,
  ];
}

/* =====================
   COMPONENT
===================== */
export default function PaceCalculator() {
  const [distanceType, setDistanceType] =
    useState<DistanceType>(10);
  const [customDistance, setCustomDistance] = useState(10);

  const [hours, setHours] = useState<number | "">("");
  const [minutes, setMinutes] = useState<number | "">(45);
  const [seconds, setSeconds] = useState<number | "">("");

  const [paceSec, setPaceSec] =
    useState<number | null>(null);

  const [collapsed, setCollapsed] = useState(false);

  const distance =
    distanceType === "custom"
      ? customDistance
      : distanceType;

  function handleSubmit() {
    const totalSec =
      (Number(hours) || 0) * 3600 +
      (Number(minutes) || 0) * 60 +
      (Number(seconds) || 0);

    if (totalSec > 0 && distance > 0) {
      setPaceSec(totalSec / distance);
      setCollapsed(true);
    }
  }

  return (
    <div className="space-y-6">
      {/* INPUT CARD (COLLAPSIBLE) */}
      <div
        onClick={() => {
          if (collapsed) setCollapsed(false);
        }}
        className={`solid-card transition-all duration-300 overflow-hidden
          ${collapsed ? "cursor-pointer p-4 max-h-20" : "p-6 max-h-[1000px]"}
        `}
      >
        {/* COLLAPSED SUMMARY */}
        {collapsed && (
          <div className="flex items-center justify-between">
            <div>
          
              <div className="text-sm font-medium">
                {distance} km ·{" "}
                {(Number(hours) || 0)}:
                {(Number(minutes) || 0)
                  .toString()
                  .padStart(2, "0")}
                :
                {(Number(seconds) || 0)
                  .toString()
                  .padStart(2, "0")}
              </div>
            </div>

            <span className="text-sm underline opacity-70">
              Endre
            </span>
          </div>
        )}

        {/* FULL FORM */}
        {!collapsed && (
          <div className="space-y-6">
            {/* DISTANCE PICKER */}
            <div>
              <label className="text-sm font-medium">
                Distanse
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {DISTANCES.map((d) => {
                  const active =
                    d.value === distanceType;

                  return (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => {
                        setDistanceType(d.value);
                        if (d.value !== "custom") {
                          setCustomDistance(d.value);
                        }
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium
                        transition
                        ${
                          active
                            ? "bg-[#728c69] text-white border-[#728c69]"
                            : "bg-white text-black border-black/10"
                        }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>

              {distanceType === "custom" && (
                <div className="mt-4">
                  <label className="text-sm font-medium">
                    Egendefinert distanse (km)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={customDistance}
                    onChange={(e) =>
                      setCustomDistance(
                        Number(e.target.value)
                      )
                    }
                    className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
                  />
                </div>
              )}
            </div>

            {/* TIME INPUT */}
            <div>
              <label className="text-sm font-medium">
                Mål-tid
              </label>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={hours}
                  onChange={(e) =>
                    setHours(
                      e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                    )
                  }
                  className="w-20 rounded-lg border px-3 py-3 text-center text-lg"
                />
                <span className="text-lg">:</span>

                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="45"
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(
                      e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                    )
                  }
                  className="w-20 rounded-lg border px-3 py-3 text-center text-lg"
                />
                <span className="text-lg">:</span>

                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={seconds}
                  onChange={(e) =>
                    setSeconds(
                      e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                    )
                  }
                  className="w-20 rounded-lg border px-3 py-3 text-center text-lg"
                />
              </div>

              <p className="mt-1 text-xs opacity-60">
                timer : minutter : sekunder
              </p>
            </div>

            {/* SUBMIT */}
            <button
              onClick={handleSubmit}
              className="w-full rounded-lg bg-[#728c69] py-3 text-white text-lg font-medium"
            >
              Beregn pace
            </button>
          </div>
        )}
      </div>

      {/* RESULT */}
      {paceSec !== null && (
        <>
          <PaceResult paceSec={paceSec} />
          <SplitTable
            paceSec={paceSec}
            distance={distance}
          />
        </>
      )}
    </div>
  );
}

/* =====================
   RESULT COMPONENTS
===================== */
function PaceResult({
  paceSec,
}: {
  paceSec: number;
}) {
  return (
    <div className="solid-card p-6 text-center">
      <p className="text-sm opacity-70">
        Du må holde
      </p>
      <div className="mt-2 text-5xl font-semibold">
        {secondsToPace(paceSec)}
      </div>
      <p className="mt-1 text-sm opacity-70">
        min / km
      </p>
    </div>
  );
}

function SplitTable({
  paceSec,
  distance,
}: {
  paceSec: number;
  distance: number;
}) {
  const splits = getSplits(distance);

  return (
    <div className="solid-card p-6">
      <h3 className="mb-4 font-semibold">
        Splittider
      </h3>

      <ul className="space-y-2 text-sm">
        {splits.map((km) => (
          <li
            key={km}
            className="flex justify-between border-b pb-1"
          >
            <span>
              {km === 21.1
                ? "Halvmaraton"
                : `${km} km`}
            </span>
            <span className="font-medium">
              {secondsToTime(paceSec * km)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}